import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, posix, resolve } from "node:path";
import { PreparedSceneFieldsSchema } from "../../scene-contract/src/prepared.ts";
import {
  StoryWorkspaceManifestSchema,
  type StoryWorkspaceFile,
} from "../../scene-contract/src/story-workspace.ts";
import { templateScene } from "../../renderer-core/src/story-template.ts";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import { validatePreparedAssets } from "./prepared-animation-engine.ts";
import { verifyPassageNarration } from "./story-passage-render.ts";
import {
  passageChecksum,
  prepareStoryPassageInput,
  writePassageJson,
  type PreparedPassage,
} from "./story-passage-io.ts";

/** Publish the manifest last; an interrupted directory is never a verified workspace. */
export async function writeStoryWorkspace(
  output: string,
  passage: PreparedPassage,
  narration?: string,
) {
  if (Boolean(passage.plan.narration) !== Boolean(narration))
    passageError(
      "workspace-narration",
      "Supply --narration for a narrated plan; silent plans must omit it",
    );
  if (narration) await verifyPassageNarration(passage, narration);
  const directory = resolve(output);
  await mkdir(directory);
  try {
    const files = new Map<string, StoryWorkspaceFile>();
    const addFile = async (
      path: string,
      bytes: Buffer,
      kind: StoryWorkspaceFile["kind"],
    ) => {
      if (!files.has(path)) {
        await mkdir(dirname(join(directory, path)), { recursive: true });
        await writeFile(join(directory, path), bytes, { flag: "wx" });
        files.set(path, {
          path,
          kind,
          sha256: passageChecksum(bytes),
          bytes: bytes.length,
        });
      }
      return path;
    };
    const addJson = (path: string, value: unknown, kind: "plan" | "template") =>
      addFile(path, Buffer.from(JSON.stringify(value, null, 2) + "\n"), kind);
    const addBinary = async (
      asset: { path: string; sha256: string },
      kind: "asset" | "font" | "narration",
    ) => {
      const bytes = await readFile(asset.path);
      const hash = passageChecksum(bytes);
      if ("sha256:" + hash !== asset.sha256)
        passageError(
          "workspace-integrity",
          "Source checksum differs: " + asset.path,
          { path: asset.path },
        );
      const extension = extname(asset.path).toLowerCase();
      if (!/^\.[a-z0-9]+$/.test(extension))
        passageError(
          "workspace-path",
          "Asset needs a portable file extension: " + asset.path,
          { path: asset.path },
        );
      return addFile(kind + "s/" + hash + extension, bytes, kind);
    };
    const plan = structuredClone(passage.plan);
    const templatePaths = new Map<string, string>();
    for (const [reference, original] of passage.templates) {
      const template = structuredClone(original);
      const scene = templateScene(template);
      await validatePreparedAssets(scene, dirname(passage.inputs.plan.path));
      const path = "templates/" + templatePaths.size + ".json";
      for (const asset of scene.assets)
        asset.path = posix.relative(
          "templates",
          await addBinary(asset, "asset"),
        );
      for (const font of scene.fonts ?? [])
        font.path = posix.relative("templates", await addBinary(font, "font"));
      await addJson(path, template, "template");
      templatePaths.set(reference, path);
    }
    for (const beat of plan.beats) {
      const template = passage.templates.get(beat.template)!;
      if ("parameters" in beat && template.schemaVersion === "story-template-1")
        for (const [id, slot] of Object.entries(template.slots)) {
          if (slot.kind !== "asset" || beat.parameters[id] === undefined)
            continue;
          const asset = PreparedSceneFieldsSchema.shape.assets.element.parse(
            beat.parameters[id],
          );
          const path = await addBinary(asset, "asset");
          beat.parameters[id] = { ...asset, path };
        }
      beat.template = templatePaths.get(beat.template)!;
    }
    const narrationPath = narration
      ? await addBinary(
          { path: narration, sha256: "sha256:" + plan.narration!.sha256 },
          "narration",
        )
      : undefined;
    await addJson("plan.json", plan, "plan");
    const manifest = StoryWorkspaceManifestSchema.parse({
      schemaVersion: "story-workspace-package-1",
      plan: "plan.json",
      ...(narrationPath ? { narration: narrationPath } : {}),
      files: [...files.values()].sort((a, b) =>
        a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
      ),
    });
    const manifestPath = join(directory, "workspace.json");
    await prepareStoryPassageInput(manifest, manifestPath);
    await writePassageJson(manifestPath, manifest);
    return manifest;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
