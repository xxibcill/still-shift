import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";

import {
  SceneManifestSchema,
  type AnimationResult,
  type CorpusManifest,
} from "@still-shift/scene-contract";

import { EVALUATION_PRESETS, evaluationClipId } from "./presets.ts";

export type EvaluationRecord = {
  id: string;
  status: string;
  result?:
    | Pick<
        AnimationResult,
        "checksums" | "selectedPreset" | "durationMs" | "status"
      >
    | undefined;
};

export const validateEvaluationRecords = (
  corpus: CorpusManifest,
  records: EvaluationRecord[],
): void => {
  const expected = new Map(
    corpus.entries.flatMap((entry) =>
      EVALUATION_PRESETS.map(
        (preset) =>
          [
            evaluationClipId(entry.id, preset),
            {
              sourceHash: entry.source.sha256,
              preset,
              durationMs: entry.expectedShotDurationMs,
            },
          ] as const,
      ),
    ),
  );
  if (records.length !== expected.size)
    throw new Error("Result count does not match the evaluation corpus");

  const seen = new Set<string>();
  for (const record of records) {
    const item = expected.get(record.id);
    if (!item || seen.has(record.id))
      throw new Error(`Unexpected or duplicate evaluation ID: ${record.id}`);
    seen.add(record.id);
    if (!record.result) {
      if (record.status !== "failed")
        throw new Error(`Successful record has no result: ${record.id}`);
      continue;
    }
    if (
      record.status !== record.result.status ||
      record.result.checksums.source !== item.sourceHash ||
      record.result.selectedPreset !== item.preset ||
      record.result.durationMs !== item.durationMs
    )
      throw new Error(`Result does not match the corpus item: ${record.id}`);
  }
};

export const validateEvaluationScene = (
  scene: { sourceHash: string; motion: { preset: string; intensity: string } },
  sourceHash: string,
  preset: string,
): void => {
  if (
    scene.sourceHash !== sourceHash ||
    scene.motion.preset !== preset ||
    scene.motion.intensity !== "standard"
  )
    throw new Error(
      "Evaluation scene does not match the standard-intensity request",
    );
};

export const verifyAssemblyClip = async (
  result: Pick<AnimationResult, "checksums" | "outputPath" | "selectedPreset">,
  sourceHash: string,
  preset: AnimationResult["selectedPreset"],
): Promise<string> => {
  if (
    result.checksums.source !== sourceHash ||
    result.selectedPreset !== preset
  )
    throw new Error(
      `Assembly clip does not match its timeline source: ${preset}`,
    );

  const hash = createHash("sha256");
  for await (const chunk of createReadStream(result.outputPath))
    hash.update(chunk);
  if (`sha256:${hash.digest("hex")}` !== result.checksums.output)
    throw new Error(`Assembly clip checksum mismatch: ${result.outputPath}`);
  return result.outputPath;
};

type RenderComparisonRecord = {
  id: string;
  reused: boolean;
  result?:
    | Pick<
        AnimationResult,
        | "checksums"
        | "durationMs"
        | "frameCount"
        | "outputPath"
        | "sceneManifestPath"
        | "selectedPreset"
        | "status"
      >
    | undefined;
};

export const compareIndependentRenders = async (
  primary: RenderComparisonRecord[],
  repeat: RenderComparisonRecord[],
): Promise<boolean> => {
  if (primary.length !== repeat.length) return false;
  const repeatById = new Map(repeat.map((record) => [record.id, record]));
  if (repeatById.size !== repeat.length) return false;

  for (const record of primary) {
    const first = record.result;
    const other = repeatById.get(record.id);
    const second = other?.result;
    if (!first || !second || other?.reused) return false;
    if (
      first.outputPath === second.outputPath ||
      first.checksums.source !== second.checksums.source ||
      first.status !== second.status ||
      first.durationMs !== second.durationMs ||
      first.frameCount !== second.frameCount ||
      first.selectedPreset !== second.selectedPreset
    )
      return false;

    const firstScene = SceneManifestSchema.parse(
      JSON.parse(await readFile(first.sceneManifestPath, "utf8")),
    );
    const secondScene = SceneManifestSchema.parse(
      JSON.parse(await readFile(second.sceneManifestPath, "utf8")),
    );
    if (
      !firstScene.renderScene ||
      !secondScene.renderScene ||
      firstScene.sourceHash !== first.checksums.source ||
      secondScene.sourceHash !== second.checksums.source ||
      !isDeepStrictEqual(firstScene.renderScene, secondScene.renderScene) ||
      !isDeepStrictEqual(firstScene.timeline, secondScene.timeline) ||
      !isDeepStrictEqual(firstScene.motion, secondScene.motion) ||
      !isDeepStrictEqual(firstScene.quality, secondScene.quality)
    )
      return false;
  }
  return true;
};
