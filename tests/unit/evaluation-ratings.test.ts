import { describe, expect, it } from "vitest";

import { RatingsExportSchema } from "../../scripts/evaluation/ratings.ts";

const ratingExport = {
  schemaVersion: "0.1",
  corpusId: "sample",
  corpusSha256: `sha256:${"a".repeat(64)}`,
  corpusStatus: "frozen",
  reviewer: "Reviewer",
  exportedAt: "2026-09-24T00:00:00.000Z",
  clips: {
    "sample-slow-push": {
      edgeArtifacts: 0,
      editorialUsability: 2,
      manualRepair: 0,
    },
  },
};

describe("evaluation rating import", () => {
  it("accepts valid partial ratings", () => {
    expect(RatingsExportSchema.safeParse(ratingExport).success).toBe(true);
  });

  it("rejects scores outside the gallery scales", () => {
    expect(
      RatingsExportSchema.safeParse({
        ...ratingExport,
        clips: { "sample-slow-push": { edgeArtifacts: 99 } },
      }).success,
    ).toBe(false);
    expect(
      RatingsExportSchema.safeParse({
        ...ratingExport,
        clips: { "sample-slow-push": { manualRepair: 2 } },
      }).success,
    ).toBe(false);
  });
});
