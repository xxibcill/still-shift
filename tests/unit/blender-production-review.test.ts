import { describe, expect, it } from "vitest";
import { compileBlenderEpisode } from "@still-shift/animation-engine";
import {
  blenderEpisodePlan,
  blenderEpisodeSource,
} from "../fixtures/blender-episode-support.ts";
import {
  planBlenderProductionReview,
  blenderProductionReviewFingerprint,
  BlenderProductionEvidenceSchema,
} from "../../packages/animation-engine/src/mechanism/blender-production-review-contract.ts";

describe("native encoded review planning", () => {
  it("retains shot boundaries and control/callout events, including an active detail frame away from mid-shot", () => {
    const plan = {
      ...blenderEpisodePlan(),
      callouts: [
        {
          id: "guide-label",
          text: "Slider guide",
          shot: "recognition",
          part: "slider",
          anchor: "anchor.slider",
          start: 20,
          endExclusive: 26,
          position: [0.72, 0.3],
          color: "#ffc25b",
          controlRanges: {},
        },
      ],
    };
    const compiled = compileBlenderEpisode(blenderEpisodeSource(), plan);
    const review = planBlenderProductionReview(compiled);
    const cut = review.samples.find((s) => s.frame === 30)!;
    expect(cut.roles).toContainEqual({
      cue: "guide",
      kind: "entry",
      origin: "shot",
    });
    expect(cut.roles).toContainEqual({
      cue: "guide",
      kind: "cut-after",
      origin: "shot",
    });
    expect(review.shots[0]!.detailFrame).toBe(20);
    expect(review.shots[0]!.anchors).toEqual(["anchor.slider"]);
    expect(
      review.samples.some(
        (s) => s.frame === 19 && s.roles.some((r) => r.cue === "guide-label"),
      ),
    ).toBe(true);
    expect(review.samples.every((s) => s.frame >= 0 && s.frame < 60)).toBe(
      true,
    );
  });
  it("preserves native 256-character anchor names throughout the review contract", () => {
    const anchor = "a".repeat(256);
    const plan = {
      ...blenderEpisodePlan(),
      callouts: [
        {
          id: "long-anchor",
          text: "Slider guide",
          shot: "recognition",
          part: "slider",
          anchor,
          start: 10,
          endExclusive: 20,
          position: [0.72, 0.3],
          color: "#ffc25b",
          controlRanges: {},
        },
      ],
    };
    const review = planBlenderProductionReview(
      compileBlenderEpisode(blenderEpisodeSource(), plan),
    );
    expect(review.shots[0]!.anchors).toEqual([anchor]);
    const projections = [{ anchor, pixel: [20, 30], visibility: "visible" }];
    const imageProjections =
      BlenderProductionEvidenceSchema.shape.images.element.shape.projections;
    const exceptionProjections =
      BlenderProductionEvidenceSchema.shape.exceptions.element.shape
        .projections;
    expect(imageProjections.parse(projections)).toEqual(projections);
    expect(exceptionProjections.parse(projections)).toEqual(projections);
    expect(
      imageProjections.safeParse([{ ...projections[0], anchor: anchor + "a" }])
        .success,
    ).toBe(false);
  });
  it("preserves source identity after path relocation while detecting authored control changes", () => {
    const source = blenderEpisodeSource(),
      plan = blenderEpisodePlan();
    const original = compileBlenderEpisode(source, plan);
    const moved = compileBlenderEpisode(
      { ...source, asset: { ...source.asset, path: "/other/native.blend" } },
      {
        ...plan,
        font: { ...plan.font, path: "/other/font.ttf" },
        narration: { ...plan.narration, path: "/other/voice.wav" },
      },
    );
    expect(blenderProductionReviewFingerprint(moved)).toBe(
      blenderProductionReviewFingerprint(original),
    );
    plan.controlTracks["slider.travel"][1]!.value = 3;
    expect(
      blenderProductionReviewFingerprint(compileBlenderEpisode(source, plan)),
    ).not.toBe(blenderProductionReviewFingerprint(original));
  });
  it("rejects excessive authored review samples before capture or extraction", () => {
    const plan = blenderEpisodePlan();
    plan.narration.sampleCount = 3200000;
    plan.originalNarrationClock = { sampleRate: 48000, samples: 3200000 };
    plan.shots[0]!.endExclusive = 1000;
    plan.shots[1]!.start = 1000;
    plan.shots[1]!.endExclusive = 2000;
    plan.sourceFrameTrack = Array.from({ length: 256 }, (_, i) => ({
      frame: i * 3,
      value: 0,
      interpolation: "hold",
    }));
    const compiled = compileBlenderEpisode(blenderEpisodeSource(), plan);
    expect(() => planBlenderProductionReview(compiled)).toThrow(
      /sample budget/,
    );
  });
  it("retains the receiving composition's 60fps episode clock", () => {
    const plan = blenderEpisodePlan();
    plan.fps = 60;
    plan.shots[0]!.endExclusive = 60;
    plan.shots[1]!.start = 60;
    plan.shots[1]!.endExclusive = 120;
    expect(
      planBlenderProductionReview(
        compileBlenderEpisode(blenderEpisodeSource(), plan),
      ).fps,
    ).toBe(60);
  });
  it("keeps source-frame events when a control has the same name", () => {
    const source = blenderEpisodeSource();
    const plan = blenderEpisodePlan();
    const compiled = compileBlenderEpisode(
      {
        ...source,
        controller: {
          ...source.controller,
          properties: {
            ...source.controller.properties,
            "source-frame": { min: 0, max: 1 },
          },
        },
      },
      {
        ...plan,
        sourceFrameTrack: [
          { frame: 0, value: 0, interpolation: "hold" },
          { frame: 12, value: 0, interpolation: "hold" },
        ],
        controlTracks: {
          ...plan.controlTracks,
          "source-frame": [
            { frame: 0, value: 0, interpolation: "hold" },
            { frame: 40, value: 1, interpolation: "hold" },
          ],
        },
      },
    );
    const review = planBlenderProductionReview(compiled);
    expect(review.samples.find((s) => s.frame === 12)!.roles).toContainEqual({
      cue: "source-frame",
      kind: "event-at",
      origin: "source-frame",
    });
    expect(review.samples.find((s) => s.frame === 40)!.roles).toContainEqual({
      cue: "source-frame",
      kind: "event-at",
      origin: "control",
    });
  });
});
