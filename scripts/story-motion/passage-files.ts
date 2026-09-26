import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { StoryPassagePlanSchema } from "../../packages/scene-contract/src/story-passage.ts";
import {
  StorySceneSchema,
  type StoryScene,
} from "../../packages/scene-contract/src/story.ts";
import { loadPreparedScene } from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import { compileStoryPassage } from "../../packages/renderer-core/src/story-passage.ts";

export const passageChecksum = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export const writePassageJson = (path: string, value: unknown) =>
  writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });

export async function readStoryPassage(planPath: string) {
  const started = performance.now();
  const path = resolve(planPath);
  const bytes = await readFile(path);
  const plan = StoryPassagePlanSchema.parse(JSON.parse(bytes.toString("utf8")));
  const templates = new Map<string, StoryScene>();
  const sources = [];
  for (const reference of new Set(plan.beats.map((beat) => beat.template))) {
    const templatePath = resolve(dirname(path), reference);
    const source = await readFile(templatePath);
    const scene = StorySceneSchema.parse(JSON.parse(source.toString("utf8")));
    await loadPreparedScene(templatePath);
    for (const asset of [...scene.assets, ...(scene.fonts ?? [])])
      asset.path = resolve(dirname(templatePath), asset.path);
    templates.set(reference, scene);
    sources.push({
      reference,
      path: templatePath,
      sha256: passageChecksum(source),
    });
  }
  const compiled = compileStoryPassage(plan, templates);
  return {
    ...compiled,
    inputs: {
      plan: { path, sha256: passageChecksum(bytes) },
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
    schemaVersion: "prepared-story-passage-1",
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
