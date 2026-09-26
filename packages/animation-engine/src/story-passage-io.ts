import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { parsePassagePlan } from "../../scene-contract/src/story-authoring.ts";
import {
  parsePassageTemplate,
  templateScene,
  type PassageTemplate,
} from "../../renderer-core/src/story-template.ts";
import { validatePreparedAssets } from "./prepared-animation-engine.ts";
import { compileStoryPassage } from "../../renderer-core/src/story-passage.ts";
import { validatePassageText } from "./passage-text-validation.ts";

export const passageChecksum = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export const writePassageJson = (path: string, value: unknown) =>
  writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });

export async function readStoryPassage(planPath: string) {
  const path = resolve(planPath);
  const bytes = await readFile(path);
  return prepareStoryPassageInput(
    JSON.parse(bytes.toString("utf8")),
    path,
    passageChecksum(bytes),
  );
}

export async function prepareStoryPassageInput(
  input: unknown,
  planPath: string,
  checksum?: string,
  allowPath?: (path: string) => Promise<unknown>,
) {
  const started = performance.now();
  const path = resolve(planPath);
  const plan = parsePassagePlan(input);
  const templates = new Map<string, PassageTemplate>();
  const sources = [];
  for (const reference of new Set(plan.beats.map((beat) => beat.template))) {
    const templatePath = resolve(dirname(path), reference);
    await allowPath?.(templatePath);
    const source = await readFile(templatePath);
    const template = parsePassageTemplate(JSON.parse(source.toString("utf8")));
    const scene = templateScene(template);
    for (const asset of [...scene.assets, ...(scene.fonts ?? [])])
      asset.path = resolve(dirname(templatePath), asset.path);
    templates.set(reference, template);
    sources.push({
      reference,
      path: templatePath,
      sha256: passageChecksum(source),
    });
  }
  if (plan.schemaVersion === "story-passage-2")
    for (const beat of plan.beats) {
      const template = templates.get(beat.template)!;
      if (template.schemaVersion !== "story-template-1") continue;
      for (const [id, slot] of Object.entries(template.slots))
        if (
          slot.kind === "asset" &&
          beat.parameters[id] &&
          typeof beat.parameters[id] === "object"
        ) {
          const value = beat.parameters[id] as Record<string, unknown>;
          if (typeof value.path === "string")
            value.path = resolve(dirname(path), value.path);
        }
    }
  const compiled = compileStoryPassage(plan, templates);
  for (const beat of compiled.beats) {
    for (const asset of [...beat.scene.assets, ...(beat.scene.fonts ?? [])])
      await allowPath?.(asset.path);
    await validatePreparedAssets(beat.scene, dirname(path));
  }
  await validatePassageText(compiled);
  return {
    ...compiled,
    templates,
    inputs: {
      plan: {
        path,
        sha256: checksum ?? passageChecksum(Buffer.from(JSON.stringify(input))),
      },
      templates: sources,
    },
    preparationMs: performance.now() - started,
  };
}

export type PreparedPassage = Awaited<ReturnType<typeof readStoryPassage>>;

export async function writePreparedPassage(
  output: string,
  passage: PreparedPassage,
) {
  await mkdir(output);
  await mkdir(join(output, "scenes"));
  await mkdir(join(output, "delivery"));
  for (const beat of passage.beats)
    await writePassageJson(
      join(output, "scenes", beat.id + ".json"),
      beat.scene,
    );
  await writePassageJson(join(output, "source-plan.json"), {
    ...passage.plan,
    beats: passage.plan.beats.map((beat) => ({
      ...beat,
      template: resolve(dirname(passage.inputs.plan.path), beat.template),
    })),
  });
  await writePassageJson(join(output, "passage.json"), {
    schemaVersion:
      passage.plan.schemaVersion === "story-passage-2"
        ? "prepared-story-passage-2"
        : "prepared-story-passage-1",
    id: passage.plan.id,
    title: passage.plan.title,
    fps: passage.plan.fps,
    styleProfile: passage.plan.styleProfile,
    sourceStartFrame: passage.plan.sourceStartFrame,
    frameCount: passage.frameCount,
    endFrameExclusive: passage.endFrameExclusive,
    narration: passage.plan.narration,
    inputs: passage.inputs,
    delivery: passage.plan.delivery,
    beats: passage.beats.map(({ scene, ...beat }) => ({
      ...beat,
      sourceStartFrame: scene.episodeStartFrame,
      scenePath: "scenes/" + beat.id + ".json",
    })),
    measurements: {
      preparationMs: passage.preparationMs,
      humanPreparationMinutes: null,
      manualRepairs: null,
    },
  });
}
