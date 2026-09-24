import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

import type {
  AnimationResult,
  CorpusManifest,
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
