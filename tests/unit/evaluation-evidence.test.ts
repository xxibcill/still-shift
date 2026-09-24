import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CorpusManifestSchema } from "@still-shift/scene-contract";
import { describe, expect, it } from "vitest";

import {
  compareIndependentRenders,
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

describe("independent render comparison", () => {
  it("compares scene decisions and timing from separate renders", async () => {
    const directory = await mkdtemp(join(tmpdir(), "still-shift-rerender-"));
    try {
      const firstScenePath = join(directory, "first.scene.json");
      const secondScenePath = join(directory, "second.scene.json");
      const scene = {
        schemaVersion: "0.1",
        sourceHash,
        pipelineVersion: "test-pipeline",
        rendererVersion: "test-renderer",
        timeline: { durationMs: 5000, fps: 30, frameCount: 150 },
        canvas: { width: 1920, height: 1080 },
        depth: null,
        motion: {
          preset: "slow_push",
          intensity: "standard",
          seed: 1842,
          safeCrop: 0,
        },
        quality: { riskScore: 0, fallback: false, warnings: [] },
        renderScene: { motion: { travel: 0.01 } },
        execution: { adapter: "webgl", producesVideo: true },
      };
      await writeFile(firstScenePath, JSON.stringify(scene));
      await writeFile(secondScenePath, JSON.stringify(scene));
      const first = {
        id: "fixture-portrait-001-slow-push",
        reused: true,
        result: {
          checksums: {
            source: sourceHash,
            scene: `sha256:${"b".repeat(64)}`,
            output: `sha256:${"c".repeat(64)}`,
          },
          durationMs: 5000,
          frameCount: 150,
          outputPath: join(directory, "first.mp4"),
          sceneManifestPath: firstScenePath,
          selectedPreset: "slow_push" as const,
          status: "rendered" as const,
        },
      };
      const second = {
        ...first,
        reused: false,
        result: {
          ...first.result,
          outputPath: join(directory, "second.mp4"),
          sceneManifestPath: secondScenePath,
        },
      };
      expect(await compareIndependentRenders([first], [second])).toBe(true);
      await writeFile(
        secondScenePath,
        JSON.stringify({ ...scene, renderScene: { motion: { travel: 0.02 } } }),
      );
      expect(await compareIndependentRenders([first], [second])).toBe(false);
      expect(
        await compareIndependentRenders([first], [{ ...second, reused: true }]),
      ).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
