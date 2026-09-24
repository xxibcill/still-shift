import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CorpusManifestSchema } from "@still-shift/scene-contract";
import { describe, expect, it } from "vitest";

import {
  validateEvaluationRecords,
  verifyAssemblyClip,
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

describe("assembly clip evidence", () => {
  it("requires the timeline source and matching output bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "still-shift-assembly-"));
    try {
      const outputPath = join(directory, "clip.mp4");
      await writeFile(outputPath, "test video bytes");
      const result = {
        outputPath,
        selectedPreset: "slow_push" as const,
        checksums: {
          source: sourceHash,
          scene: `sha256:${"b".repeat(64)}`,
          output: `sha256:${createHash("sha256").update("test video bytes").digest("hex")}`,
        },
      };
      expect(await verifyAssemblyClip(result, sourceHash, "slow_push")).toBe(
        outputPath,
      );
      await expect(
        verifyAssemblyClip(result, `sha256:${"d".repeat(64)}`, "slow_push"),
      ).rejects.toThrow("timeline source");
      await writeFile(outputPath, "changed bytes");
      await expect(
        verifyAssemblyClip(result, sourceHash, "slow_push"),
      ).rejects.toThrow("checksum mismatch");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
