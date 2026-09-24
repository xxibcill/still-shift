import { describe, expect, it } from "vitest";

import {
  hashBatchArtifacts,
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
