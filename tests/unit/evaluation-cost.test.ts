import { describe, expect, it } from "vitest";

import { selectedRenderWallMs } from "../../scripts/evaluation/cost.ts";

describe("evaluation worker cost timing", () => {
  it("counts a cold preparation once alongside concurrent rendering", () => {
    const results = [
      {
        metrics: {
          totalWallMs: 12_000,
          cacheStatus: "miss" as const,
          archivedPreparationMs: 10_000,
        },
      },
      {
        metrics: {
          totalWallMs: 2_000,
          cacheStatus: "hit" as const,
          archivedPreparationMs: 10_000,
        },
      },
      {
        metrics: {
          totalWallMs: 2_000,
          cacheStatus: "hit" as const,
          archivedPreparationMs: 10_000,
        },
      },
    ];

    expect(selectedRenderWallMs(results, 1)).toBe(6_000);
    expect(selectedRenderWallMs(results, 2)).toBe(3_000);
    expect(selectedRenderWallMs(results, 2) + 10_000).toBe(13_000);
  });
});
