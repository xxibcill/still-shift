import { readFileSync } from "node:fs";

import { CorpusManifestSchema } from "@still-shift/scene-contract";
import { describe, expect, it } from "vitest";

import {
  validateEvaluationRecords,
  type EvaluationRecord,
} from "../../scripts/evaluation/evidence.ts";
import {
  EVALUATION_PRESETS,
  evaluationClipId,
} from "../../scripts/evaluation/presets.ts";

const manifest = JSON.parse(
  readFileSync("benchmarks/corpus-manifest.json", "utf8"),
);
const entry = JSON.parse(
  readFileSync("tests/fixtures/corpus-entry.valid.json", "utf8"),
);
const corpus = CorpusManifestSchema.parse({ ...manifest, entries: [entry] });
const sourceHash = entry.source.sha256 as string;

const records = (): EvaluationRecord[] =>
  EVALUATION_PRESETS.map((preset) => ({
    id: evaluationClipId(entry.id, preset),
    status: "rendered",
    result: {
      status: "rendered",
      checksums: {
        source: sourceHash,
        scene: `sha256:${"b".repeat(64)}`,
        output: `sha256:${"c".repeat(64)}`,
      },
      selectedPreset: preset,
      durationMs: entry.expectedShotDurationMs,
    },
  }));

describe("evaluation result identity", () => {
  it("accepts the exact corpus preset set", () => {
    expect(() => validateEvaluationRecords(corpus, records())).not.toThrow();
  });

  it("rejects a same-size run from different sources", () => {
    const other = records();
    other[0]!.result!.checksums.source = `sha256:${"d".repeat(64)}`;
    expect(() => validateEvaluationRecords(corpus, other)).toThrow(
      "does not match the corpus item",
    );
  });

  it("rejects duplicate or missing preset IDs", () => {
    const other = records();
    other[1]!.id = other[0]!.id;
    expect(() => validateEvaluationRecords(corpus, other)).toThrow(
      "duplicate evaluation ID",
    );
  });
});
