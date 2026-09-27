import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  StoryWorkspaceManifestSchema,
  type StoryWorkspaceFile,
} from "../../scene-contract/src/story-workspace.ts";
import { parsePassagePlan } from "../../scene-contract/src/story-authoring.ts";
import {
  parsePassageTemplate,
  templateScene,
} from "../../renderer-core/src/story-template.ts";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";

const outside = (root: string, path: string) => {
  const rel = relative(root, path);
  return (
    rel === ".." ||
    rel.startsWith("../") ||
    rel.startsWith("..\\") ||
    isAbsolute(rel)
  );
};

/** Verify the complete dependency manifest before the normal passage loader reads any files. */
export async function loadStoryWorkspaceInput(
  input: unknown,
  manifestPath: string,
  allowPath?: (path: string) => Promise<unknown>,
) {
  const manifest = StoryWorkspaceManifestSchema.parse(input);
  const root = dirname(resolve(manifestPath));
  const actualRoot = await realpath(root);
  const entries = new Map(
    manifest.files.map((file) => [resolve(root, file.path), file]),
  );
  const contents = new Map<string, Buffer>();
  const guard = async (path: string) => {
    const file = entries.get(path);
    if (!file)
      passageError(
        "workspace-reference",
        "Dependency is absent from the workspace manifest: " + path,
        { path },
      );
    let actual: string;
    try {
      actual = await realpath(path);
    } catch {
      passageError(
        "workspace-file-missing",
        "Missing workspace file: " + file.path,
        { path: file.path },
      );
    }
    if (outside(actualRoot, actual))
      passageError(
        "workspace-path",
        "Workspace file leaves the package: " + file.path,
        { path: file.path },
      );
    await allowPath?.(actual);
    if (!(await stat(actual)).isFile())
      passageError(
        "workspace-path",
        "Workspace entry must be a file: " + file.path,
        { path: file.path },
      );
    return actual;
  };
  for (const [path, file] of entries) {
    const bytes = await readFile(await guard(path));
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (bytes.length !== file.bytes || hash !== file.sha256)
      passageError(
        "workspace-integrity",
        "Workspace checksum or size differs: " + file.path,
        { path: file.path },
      );
    if (file.kind === "plan" || file.kind === "template")
      contents.set(path, bytes);
  }
  const reference = (
    base: string,
    ref: string,
    kind: StoryWorkspaceFile["kind"],
  ) => {
    if (/^(?:\/|[A-Za-z]:)/.test(ref) || ref.includes("\\"))
      passageError(
        "workspace-path",
        "Workspace references must be relative: " + ref,
        { path: ref },
      );
    const path = resolve(base, ref);
    if (outside(root, path))
      passageError("workspace-path", "Reference leaves the workspace: " + ref, {
        path: ref,
      });
    if (entries.get(path)?.kind !== kind)
      passageError(
        "workspace-reference",
        "Workspace manifest is missing a " + kind + " entry: " + ref,
        { path: ref },
      );
    return path;
  };
  const planPath = reference(root, manifest.plan, "plan");
  const plan = parsePassagePlan(
    JSON.parse(contents.get(planPath)!.toString("utf8")),
  );
  for (const beat of plan.beats) {
    const path = reference(dirname(planPath), beat.template, "template");
    const template = parsePassageTemplate(
      JSON.parse(contents.get(path)!.toString("utf8")),
    );
    const scene = templateScene(template);
    for (const asset of scene.assets)
      reference(dirname(path), asset.path, "asset");
    for (const font of scene.fonts ?? [])
      reference(dirname(path), font.path, "font");
    if ("parameters" in beat && template.schemaVersion === "story-template-1")
      for (const [id, slot] of Object.entries(template.slots)) {
        const value = beat.parameters[id];
        if (
          slot.kind === "asset" &&
          value &&
          typeof value === "object" &&
          "path" in value &&
          typeof value.path === "string"
        )
          reference(dirname(planPath), value.path, "asset");
      }
  }
  if (Boolean(plan.narration) !== Boolean(manifest.narration))
    passageError(
      "workspace-narration",
      "A narrated workspace must include its narration file",
    );
  if (manifest.narration) {
    const path = reference(root, manifest.narration, "narration");
    if (entries.get(path)!.sha256 !== plan.narration!.sha256)
      passageError(
        "workspace-narration",
        "Workspace narration differs from the plan identity",
        { path: manifest.narration },
      );
  }
  return {
    plan,
    path: planPath,
    sha256: entries.get(planPath)!.sha256,
    allowPath: guard,
  };
}
