import { describe, expect, it } from "vitest";
import {
  compileBlenderEpisode,
  composeBlenderEpisode,
  parseBlenderEpisodePlan,
  type BlenderAnchorFrames,
} from "@still-shift/animation-engine";
import { CompositionQualityPolicySchema } from "@still-shift/renderer-core";
import { blenderProductionVisualPolicy } from "../../packages/animation-engine/src/mechanism/blender-production-visual.ts";
import {
  blenderEpisodePlan,
  blenderEpisodeSource,
  blenderHash,
} from "../fixtures/blender-episode-support.ts";

describe("native episode composition identifier admission", () => {
  it.each(["cue.main", "x".repeat(122)])(
    "rejects speech ID %s before native capture",
    (id) => {
      const plan = blenderEpisodePlan();
      plan.speech[0]!.id = id;
      expect(() => parseBlenderEpisodePlan(plan)).toThrow();
      expect(() =>
        compileBlenderEpisode(blenderEpisodeSource(), plan),
      ).toThrow();
    },
  );

  it.each(["shot.main", "s".repeat(115), "s".repeat(201)])(
    "rejects shot IDs that cannot form proof layers: %s",
    (id) => {
      const plan = blenderEpisodePlan();
      plan.shots[0]!.id = id;
      expect(() =>
        compileBlenderEpisode(blenderEpisodeSource(), plan),
      ).toThrow();
    },
  );

  it("rejects numeric-leading episode IDs", () => {
    const plan = blenderEpisodePlan();
    plan.id = "1";
    expect(() => compileBlenderEpisode(blenderEpisodeSource(), plan)).toThrow();
  });

  it.each(["episode-font", "native-episode-plates"])(
    "rejects reserved narration asset ID %s",
    (id) => {
      const plan = blenderEpisodePlan();
      plan.narration.id = id;
      expect(() =>
        compileBlenderEpisode(blenderEpisodeSource(), plan),
      ).toThrow();
    },
  );

  it.each(["callout.main", "c".repeat(114)])(
    "rejects unsupported callout IDs: %s",
    (id) => {
      const plan = {
        ...blenderEpisodePlan(),
        callouts: [
          {
            id,
            text: "Tooth",
            shot: "recognition",
            anchor: "anchor.tooth",
            part: "tooth",
            start: 0,
            endExclusive: 30,
            position: [0.3, 0.2],
            color: "#ffc14a",
          },
        ],
      };
      expect(() =>
        compileBlenderEpisode(blenderEpisodeSource(), plan),
      ).toThrow();
    },
  );

  it("composes maximum logical IDs while preserving full native source names", () => {
    const shotId = "s".repeat(114),
      calloutId = "c".repeat(113);
    const nativeName = "native.part " + "x".repeat(244);
    const plan = {
      ...blenderEpisodePlan(),
      callouts: [
        {
          id: calloutId,
          text: "Tooth",
          shot: shotId,
          anchor: nativeName,
          part: nativeName,
          start: 0,
          endExclusive: 30,
          position: [0.3, 0.2],
          color: "#ffc14a",
        },
      ],
    };
    plan.shots[0]!.id = shotId;
    plan.shots[0]!.camera = nativeName;
    Object.assign(plan.shots[0]!, { proofPurpose: "Explain tooth contact" });
    plan.speech[0]!.id = "1" + "x".repeat(120);
    const source = blenderEpisodeSource();
    source.collection = nativeName;
    const compiled = compileBlenderEpisode(source, plan);
    const projections: BlenderAnchorFrames = Array.from({ length: 60 }, () => ({
      anchors: {
        [nativeName]: {
          kind: "object-origin",
          world: [0, 0, 0],
          pixel: [100, 200],
          depth: 5,
          inFrame: true,
        },
      },
      partVisibility: { [nativeName]: true },
    }));
    const proof = {
      id: shotId,
      purpose: "Explain tooth contact",
      layer: "native-plates-" + shotId,
      start: 0,
      end: 30,
      sourceStartFrame: 0,
      evidenceSha256: blenderHash("evidence"),
      frames: Array.from({ length: 30 }, (_, frame) => ({
        frame,
        plateSha256: blenderHash("plate"),
        physicalSha256: blenderHash("physical"),
      })),
    };
    const composition = composeBlenderEpisode(
      compiled,
      {
        id: "native-episode-plates",
        type: "sequence",
        path: "frame-%06d.png",
        manifestPath: "sequence.json",
        sha256: blenderHash("sequence"),
        firstFrame: 0,
        width: 320,
        height: 568,
        frameCount: 60,
        frameRate: { numerator: 30, denominator: 1 },
        color: {
          primaries: "bt709",
          transfer: "iec61966-2-1",
          matrix: "gbr",
          range: "pc",
        },
      },
      projections,
      [proof],
    );
    expect(
      composition.layers.find((l) => l.id === "speech-" + plan.speech[0]!.id),
    ).toBeDefined();
    expect(
      composition.layers.find((l) => l.id === "callout-leader-" + calloutId),
    ).toBeDefined();
    expect(
      composition.layers.find((l) => l.id === "native-plates-" + shotId),
    ).toBeDefined();
    expect(compiled.job.frames[0]!.camera).toBe(nativeName);
    expect(compiled.job.frames[0]!.anchors).toEqual([nativeName]);
    expect(() =>
      CompositionQualityPolicySchema.parse(
        blenderProductionVisualPolicy(compiled, [proof]),
      ),
    ).not.toThrow();
  });
});
