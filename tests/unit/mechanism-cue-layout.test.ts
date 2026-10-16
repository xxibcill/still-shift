import { describe, it, expect } from "vitest";
import { compileMechanismNarratedCycle } from "../../packages/animation-engine/src/mechanism/narrated-cycle.ts";
import {
  mechanismCueLabelRectangle,
  mechanismLabelRectanglesOverlap,
} from "../../packages/animation-engine/src/mechanism/cue-layout.ts";
import { MechanismPackInvariantError } from "../../packages/animation-engine/src/mechanism/pack-invariant.ts";
import { narratedCycleFixture } from "../helpers/mechanism-narrated-cycle.ts";
function crowded() {
  const f = narratedCycleFixture();
  const a = f.document.cues[0]!.annotations[0]!;
  f.document.cues[0]!.annotations = [
    {
      ...a,
      id: "a",
      layout: { priority: 10, locked: false, candidates: [[190, 18]] },
    },
    {
      ...a,
      id: "b",
      layout: { priority: 0, locked: false, candidates: [[190, 18]] },
    },
  ];
  return f;
}
function error(run: () => unknown) {
  try {
    run();
  } catch (e) {
    expect(e).toBeInstanceOf(MechanismPackInvariantError);
    return e as MechanismPackInvariantError;
  }
  throw Error("Expected layout rejection");
}
describe("deterministic cue-wide annotation placement", () => {
  it("reflows collisions by priority, preserves byte-stable placements under input permutation and pins positions for the full cue", () => {
    const f = crowded(),
      a = compileMechanismNarratedCycle(f.instance, f.document).labelLayout[0]!;
    expect(a.placements.map((p) => p.position)).toEqual([
      [18, 18],
      [190, 18],
    ]);
    expect(a.checkedOutputFrames).toBe(30);
    f.document.cues[0]!.annotations.reverse();
    expect(
      compileMechanismNarratedCycle(f.instance, f.document).labelLayout[0],
    ).toEqual(a);
    expect(
      mechanismLabelRectanglesOverlap(
        a.placements[0]!.rectangle,
        a.placements[1]!.rectangle,
        4,
      ),
    ).toBe(false);
  });
  it("backtracks instead of rejecting a valid layout when a preferred choice blocks another label", () => {
    const f = crowded();
    f.document.cues[0]!.annotations[1]!.layout!.candidates = [];
    expect(
      compileMechanismNarratedCycle(
        f.instance,
        f.document,
      ).labelLayout[0]!.placements.map((p) => p.position),
    ).toEqual([
      [190, 18],
      [18, 18],
    ]);
  });
  it("preserves explicit locks and identifies both conflicting labels when locks make a layout impossible", () => {
    const f = crowded();
    for (const a of f.document.cues[0]!.annotations) a.layout!.locked = true;
    const e = error(() =>
      compileMechanismNarratedCycle(f.instance, f.document),
    );
    expect(e.location).toMatchObject({
      code: "mechanism-cue-layout-conflict",
      path: ["cues", 0, "layout"],
      frame: 0,
    });
    expect(e.message).toContain("a, b");
  });
  it("checks complete envelopes against safe and caption exclusions even when the starting point is inside the viewport", () => {
    for (const position of [
      [300, 18],
      [18, 144],
    ] as [number, number][]) {
      const f = narratedCycleFixture();
      f.document.cues[0]!.annotations[0]!.position = position;
      expect(
        error(() => compileMechanismNarratedCycle(f.instance, f.document))
          .message,
      ).toContain("safe-area/caption");
    }
  });
  it("checks projected protected contact throughout every cue for three independent families and rejects unknown anchors", () => {
    for (const family of ["tape-hook", "cable-tie", "clothespeg"] as const) {
      const f = narratedCycleFixture(family);
      for (const cue of f.document.cues)
        cue.layout = {
          safeInsetPixels: 8,
          gapPixels: 4,
          protectedAnchors: [
            { anchor: f.instance.scene.anchors[0]!.id, radiusPixels: 4 },
          ],
        };
      const r = compileMechanismNarratedCycle(f.instance, f.document);
      expect(r.labelLayout.reduce((sum, c) => sum + c.projectedFrames, 0)).toBe(
        120,
      );
      f.document.cues[0]!.layout!.protectedAnchors[0]!.anchor = "missing";
      expect(
        error(() => compileMechanismNarratedCycle(f.instance, f.document))
          .location.code,
      ).toBe("mechanism-cue-layout-anchor");
    }
  });
  it("rejects visible protected contact collisions and reports the actual anchor exclusion", () => {
    const f = narratedCycleFixture();
    f.document.cues[0]!.layout = {
      safeInsetPixels: 8,
      gapPixels: 4,
      protectedAnchors: [
        { anchor: f.instance.scene.anchors[0]!.id, radiusPixels: 4096 },
      ],
    };
    expect(
      error(() => compileMechanismNarratedCycle(f.instance, f.document))
        .message,
    ).toContain(f.instance.scene.anchors[0]!.id);
  });
  it("moves the text, backing and leader start together while retaining native source and supplied audio identities", () => {
    const f = crowded(),
      r = compileMechanismNarratedCycle(f.instance, f.document),
      p = r.labelLayout[0]!.placements.find((p) => p.annotation === "b")!;
    const text = r.composition.layers
      .filter((l) => l.type === "text" && l.text === "Part")
      .find(
        (l) =>
          Array.isArray(l.transform?.position) &&
          l.transform.position[0] === p.position[0],
      );
    expect(text).toBeDefined();
    expect(
      r.composition.assets.find((a) => a.id === f.document.source.id)!.sha256,
    ).toBe(f.document.source.sha256);
    expect(r.recording.sourceSha256).toBe(f.document.narration.sha256);
    expect(mechanismCueLabelRectangle(p.position, 320, 180)).toEqual(
      p.rectangle,
    );
  });
});
