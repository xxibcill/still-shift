import { describe, expect, it } from "vitest";
import {
  planMechanismProductionEvidence,
  MechanismProductionHandoffSchema,
} from "@still-shift/animation-engine";
import { productionAnchorCrop } from "../../packages/animation-engine/src/mechanism/production-evidence.ts";
import { narratedCycleFixture } from "../helpers/mechanism-narrated-cycle.ts";
import { mechanismPackHash } from "../../packages/animation-engine/src/mechanism/pack-support.ts";
describe("mechanism production evidence plan", () => {
  it("samples exact source-clock shot/event/cut boundaries, deduplicating frames while retaining every role", () => {
    const { document } = narratedCycleFixture("tape-hook", 96000);
    document.cues[1]!.editing = "cut";
    const before = JSON.stringify(document),
      plan = planMechanismProductionEvidence(document);
    expect(plan.cueProjectHash).toBe(mechanismPackHash(document));
    expect(plan.frameCount).toBe(60);
    expect(JSON.stringify(document)).toBe(before);
    expect(plan.samples[0]?.frame).toBe(0);
    expect(plan.samples.at(-1)?.frame).toBe(59);
    expect(new Set(plan.samples.map((s) => s.frame)).size).toBe(
      plan.samples.length,
    );
    const at = Math.ceil((document.cues[1]!.startSample * 30) / 48000);
    expect(plan.samples.find((s) => s.frame === at)?.roles).toEqual(
      expect.arrayContaining([
        { cue: document.cues[1]!.id, kind: "entry" },
        { cue: document.cues[1]!.id, kind: "event-at" },
        { cue: document.cues[1]!.id, kind: "cut-after" },
      ]),
    );
    expect(plan.samples.find((s) => s.frame === at - 1)?.roles).toEqual(
      expect.arrayContaining([
        { cue: document.cues[1]!.id, kind: "event-before" },
        { cue: document.cues[1]!.id, kind: "cut-before" },
      ]),
    );
  });
  it("uses ceil-at-or-after output frames for fractional source positions and refuses empty/invalid intervals", () => {
    const { document } = narratedCycleFixture("tape-hook", 96000);
    document.cues[1]!.startSample += 1;
    const plan = planMechanismProductionEvidence(document);
    expect(plan.shots[1]?.startFrame).toBe(
      Math.ceil((document.cues[1]!.startSample * 30) / 48000),
    );
    document.cues[1]!.startSample = document.cues[0]!.startSample;
    expect(() => planMechanismProductionEvidence(document)).toThrow(/empty/);
    document.cues[0]!.startSample = 1600;
    expect(() => planMechanismProductionEvidence(document)).toThrow();
  });
  it("keeps every selected sample within one-frame shots and retains phone/caption geometry at the original output", () => {
    const { document } = narratedCycleFixture("tape-hook", 96000);
    document.cues[1]!.startSample = 1600;
    document.cues[0]!.endSampleExclusive = 1600;
    const plan = planMechanismProductionEvidence(document);
    expect(plan.shots[0]?.startFrame).toBe(0);
    expect(plan.shots[0]?.endFrameExclusive).toBe(1);
    expect(plan.shots[0]?.midFrame).toBe(0);
    expect(plan.samples.every((s) => s.frame >= 0 && s.frame < 60)).toBe(true);
    expect(plan.shots[0]?.captionCrop).toEqual({
      x: 12,
      y: 135,
      width: 296,
      height: 45,
    });
  });
  it("uses actual finite in-frame anchor pixels and preserves occlusion without fabricating unavailable positions", () => {
    expect(
      productionAnchorCrop(
        [{ anchor: "contact", pixel: [0, 0], visibility: "occluded" }],
        240,
        136,
      ),
    ).toEqual({ x: 0, y: 0, width: 16, height: 16 });
    const right = productionAnchorCrop(
      [{ anchor: "contact", pixel: [239, 135], visibility: "visible" }],
      240,
      136,
    )!;
    expect(right.x + right.width).toBeLessThanOrEqual(240);
    expect(right.y + right.height).toBeLessThanOrEqual(136);
    expect(
      productionAnchorCrop(
        [
          { anchor: "hidden", pixel: null, visibility: "not-drawn" },
          { anchor: "outside", pixel: [260, 20], visibility: "outside-frame" },
        ],
        240,
        136,
      ),
    ).toBeNull();
  });
  it("rejects unsupported handoff versions instead of admitting arbitrary resume metadata", () => {
    expect(
      MechanismProductionHandoffSchema.safeParse({ schemaVersion: "old" })
        .success,
    ).toBe(false);
  });
});
