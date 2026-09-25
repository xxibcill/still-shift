import { describe, expect, it } from "vitest";

import {
  hashBatchArtifacts,
  hashBatchRequest,
  selectBenchmarkRun,
} from "../../tools/still-shift-cli/src/batch-identity.ts";

const record = {
  id: "source-slow-push",
  requestHash: `sha256:${"a".repeat(64)}`,
  status: "rendered",
  result: {
    checksums: {
      source: `sha256:${"b".repeat(64)}`,
      scene: `sha256:${"c".repeat(64)}`,
      output: `sha256:${"d".repeat(64)}`,
    },
  },
};

describe("batch evidence identity", () => {
  it("changes checkpoint identity with the depth adapter", () => {
    const request = {
      inputPath: "/tmp/source.png",
      outputPath: "/tmp/output.mp4",
      durationMs: 5000,
      fps: 30,
      width: 1920,
      height: 1080,
      preset: "slow_push",
      intensity: "standard",
      seed: 1842,
    } as const;
    expect(hashBatchRequest(request, "png_pipe", "fake")).not.toBe(
      hashBatchRequest(request, "png_pipe", "depth-anything-v2-small"),
    );
    expect(hashBatchRequest(request, "png_pipe", "fake")).toBe(
      hashBatchRequest(request, "png_pipe", "fake"),
    );
    expect(hashBatchRequest(request, "png_pipe", "fake")).toBe(
      hashBatchRequest(request, "png_pipe", "fake", "auto"),
    );
    expect(hashBatchRequest(request, "png_pipe", "fake", "cpu")).not.toBe(
      hashBatchRequest(request, "png_pipe", "fake", "mps"),
    );
  });

  it("keeps retry identity but changes when source or output changes", () => {
    const identity = hashBatchArtifacts([record]);
    expect(identity).toBe(hashBatchArtifacts([{ ...record }]));
    expect(identity).not.toBe(
      hashBatchArtifacts([
        {
          ...record,
          result: {
            checksums: { ...record.result.checksums, source: "different" },
          },
        },
      ]),
    );
  });

  it("selects only the full run for the exact manifest and artifact set", () => {
    const old = {
      manifestSha256: "old",
      artifactSetSha256: "old",
      itemCount: 129,
      successful: 129,
      reused: 0,
      totalWallMs: 999,
    };
    const current = {
      ...old,
      manifestSha256: "current",
      artifactSetSha256: "current",
      totalWallMs: 500,
    };
    const retry = { ...current, reused: 129, totalWallMs: 1 };
    expect(selectBenchmarkRun(retry, [old, current])).toBe(current);
    expect(selectBenchmarkRun(retry, [old])).toBeNull();
  });
});
