import { describe, expect, it } from "vitest";

import {
  assertRatingsIdentity,
  ClipRatingsSchema,
  RATING_FIELDS,
  RatingsExportSchema,
  summarizeEvaluationRatings,
} from "../../scripts/evaluation/ratings.ts";

const ratingExport = {
  schemaVersion: "0.2",
  corpusId: "sample",
  corpusSha256: `sha256:${"a".repeat(64)}`,
  artifactSetSha256: `sha256:${"b".repeat(64)}`,
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

  it("validates every choice shown in the gallery", () => {
    for (const field of RATING_FIELDS) {
      expect(ClipRatingsSchema.safeParse({ [field.key]: null }).success).toBe(
        true,
      );
      for (const [choice] of field.choices) {
        if (choice === "") continue;
        expect(
          ClipRatingsSchema.safeParse({ [field.key]: Number(choice) }).success,
        ).toBe(true);
      }
      const highestChoice = Math.max(
        ...field.choices
          .filter(([choice]) => choice !== "")
          .map(([choice]) => Number(choice)),
      );
      expect(
        ClipRatingsSchema.safeParse({ [field.key]: highestChoice + 1 }).success,
      ).toBe(false);
      expect(
        ClipRatingsSchema.safeParse({ [field.key]: String(highestChoice) })
          .success,
      ).toBe(false);
    }
  });

  it("requires an artifact-set identity in every export", () => {
    const unbound: Record<string, unknown> = { ...ratingExport };
    delete unbound.artifactSetSha256;
    expect(RatingsExportSchema.safeParse(unbound).success).toBe(false);
  });

  it("rejects ratings from another render of the same corpus", () => {
    const ratings = RatingsExportSchema.parse(ratingExport);
    const corpus = { id: "sample", sha256: ratingExport.corpusSha256 };
    expect(() =>
      assertRatingsIdentity(ratings, corpus, ratingExport.artifactSetSha256),
    ).not.toThrow();
    expect(() =>
      assertRatingsIdentity(ratings, corpus, `sha256:${"c".repeat(64)}`),
    ).toThrow("different clip revision");
  });
});

describe("ratings with permitted batch failures", () => {
  it("counts each severe artifact category", () => {
    const baseline = {
      edgeArtifacts: 0,
      subjectDeformation: 0,
      exposedBorders: 0,
      depthOrder: 0,
      motionFit: 2,
      editorialUsability: 2,
      manualRepair: 0,
    };
    const severeFields = [
      "edgeArtifacts",
      "subjectDeformation",
      "exposedBorders",
      "depthOrder",
    ] as const;
    for (const field of severeFields) {
      const ratings = RatingsExportSchema.parse({
        ...ratingExport,
        clips: { sample: { ...baseline, [field]: 2 } },
      });
      expect(
        summarizeEvaluationRatings([{ id: "sample", result: {} }], ratings)
          .severe,
      ).toBe(1);
    }
    const ratings = RatingsExportSchema.parse({
      ...ratingExport,
      clips: { sample: baseline },
    });
    expect(
      summarizeEvaluationRatings([{ id: "sample", result: {} }], ratings)
        .severe,
    ).toBe(0);
  });

  it("measures rendered clips while counting a failed clip as unusable", () => {
    const ratings = RatingsExportSchema.parse({
      ...ratingExport,
      clips: {
        first: {
          edgeArtifacts: 0,
          subjectDeformation: 0,
          exposedBorders: 0,
          depthOrder: 0,
          motionFit: 2,
          editorialUsability: 2,
          manualRepair: 0,
        },
        second: {
          edgeArtifacts: 2,
          subjectDeformation: 0,
          exposedBorders: 0,
          depthOrder: 0,
          motionFit: 1,
          editorialUsability: 1,
          manualRepair: 1,
        },
      },
    });
    const summary = summarizeEvaluationRatings(
      [
        { id: "first", result: {} },
        { id: "second", result: {} },
        { id: "failed" },
      ],
      ratings,
    );
    expect(summary).toMatchObject({
      rated: 2,
      rendered: 2,
      failed: 1,
      allRenderedRated: true,
      accepted: 1,
      severe: 1,
      repaired: 1,
    });
  });
});
