import { describe, expect, it } from "vitest";
import { createTapeHookPack } from "../../packages/animation-engine/src/mechanism/tape-hook-pack.ts";
import {
  MechanismProductionQASampler,
  DEFAULT_MECHANISM_PRODUCTION_QA_PLAN,
} from "@still-shift/animation-engine";
import { mechanismProductionQAFailureReview } from "../../packages/animation-engine/src/mechanism/production-qa.ts";
import { mapMechanismProductionWarnings } from "../../packages/animation-engine/src/mechanism/production-qa-warnings.ts";
import type { NativeObservedOutputFrameV2 } from "@still-shift/scene-contract";
import { narratedCycleFixture } from "../helpers/mechanism-narrated-cycle.ts";
import {
  composition,
  solid,
} from "../../benchmarks/fixtures/composition/ce12/fixtures.ts";
import { analyzeCompositionQuality } from "@still-shift/renderer-core";
const sha = "sha256:" + "7".repeat(64),
  binding = {
    inputSha256: sha,
    outputSha256: sha,
    codeSha256: sha,
    profileSha256: sha,
  },
  evidence = { path: "native-plates.json", sha256: sha };
const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function packet(frame: number, delta = 0) {
  const world = [...matrix];
  world[12] = delta;
  // Deliberate finite scalar fixtures; original native-closure validation is exercised by the browser owner.
  return {
    version: "native3d-observed-output-frame-2",
    outputFrame: frame,
    passes: [
      {
        observed: {
          version: "native3d-observed-frame-2",
          parts: {
            mount: { worldMatrix: world },
            hook: { worldMatrix: world },
          },
          anchors: {
            "hook.innerFace": { status: "positioned", world: [delta, 0, 0] },
            "board.contact": { status: "positioned", world: [0, 0, 0] },
          },
        },
      },
    ],
  } as unknown as NativeObservedOutputFrameV2;
}
function custom() {
  return {
    schemaVersion: "mechanism-production-qa-plan-1",
    measurements: [
      {
        measurement: "contact-distance",
        kind: "anchor-separation",
        anchors: ["hook.innerFace", "board.contact"],
      },
    ],
    registrations: [
      {
        schemaVersion: "mechanism-semantic-registration-1",
        id: "contact",
        description: "Explicit sampled anchor distance",
        domain: "collision",
        method: "sampled-numeric-range",
        requireEveryOutputFrame: true,
        rules: [
          {
            measurement: "contact-distance",
            range: [0, 0.05],
            unit: "scene-unit",
            rig: "slider",
            parts: ["board", "hook"],
            relationship: "hook.innerRange",
          },
        ],
      },
    ],
    warningBindings: [],
  };
}
describe("operational native QA selectors and failures", () => {
  it("reads actual matrix scalars and preserves the located moving-mount failure with exact units", () => {
    const sampler = new MechanismProductionQASampler(
      DEFAULT_MECHANISM_PRODUCTION_QA_PLAN,
      createTapeHookPack().scene,
      3,
    );
    sampler.observe(packet(0), evidence);
    sampler.observe(packet(1, 0.1), evidence);
    sampler.observe(packet(2), evidence);
    const result = sampler.finish(binding);
    expect(result.assertions[0]).toMatchObject({
      status: "failed",
      completeOutputFrameCoverage: true,
      findings: [
        {
          frame: 1,
          measured: 0.1,
          unit: "maximum-matrix-component-delta",
          parts: ["mount"],
        },
      ],
    });
    expect(result.rawSamples[1]?.evidence.path).toBe(
      "native-plates.json#outputFrame=1",
    );
    expect(result.continuousCollision).toBe("unreviewed");
  });
  it("executes custom anchor separation without inventing unavailable measurements or continuous collision", () => {
    const sampler = new MechanismProductionQASampler(
      custom(),
      createTapeHookPack().scene,
      2,
    );
    sampler.observe(packet(0), evidence);
    sampler.observe(packet(1, 0.2), evidence);
    expect(
      sampler.finish(binding).assertions.find((a) => a.id === "contact"),
    ).toMatchObject({
      status: "failed",
      findings: [{ frame: 1, measured: 0.2, unit: "scene-unit" }],
    });
    const missing = new MechanismProductionQASampler(
      custom(),
      createTapeHookPack().scene,
      1,
    );
    const p = packet(0);
    delete p.passes[0]!.observed.anchors["board.contact"];
    missing.observe(p, evidence);
    expect(
      missing.finish(binding).assertions.find((a) => a.id === "contact")
        ?.findings[0],
    ).toMatchObject({ code: "semantic-measurement-missing", measured: null });
  });
  it("rejects wrong units, unknown parts/rigs/relationships, duplicates and excessive work before observations", () => {
    const cases = [custom(), custom(), custom(), custom(), custom()];
    cases[0]!.registrations[0]!.rules[0]!.unit = "meters";
    cases[1]!.measurements[0]!.anchors[0] = "unknown";
    cases[2]!.registrations[0]!.rules[0]!.rig = "unknown";
    cases[3]!.registrations[0]!.rules[0]!.relationship = "unknown";
    cases[4]!.measurements.push({ ...cases[4]!.measurements[0]! });
    for (const c of cases)
      expect(
        () =>
          new MechanismProductionQASampler(c, createTapeHookPack().scene, 2),
      ).toThrow();
    expect(
      () =>
        new MechanismProductionQASampler(
          custom(),
          createTapeHookPack().scene,
          10001,
        ),
    ).toThrow(/budget/);
  });
  it("rejects active scene/observation data without invoking getters", () => {
    let calls = 0;
    const scene = structuredClone(createTapeHookPack().scene);
    Object.defineProperty(scene, "parts", {
      enumerable: true,
      get() {
        calls++;
        return [];
      },
    });
    expect(
      () =>
        new MechanismProductionQASampler(
          DEFAULT_MECHANISM_PRODUCTION_QA_PLAN,
          scene,
          1,
        ),
    ).toThrow(/accessor/);
    const sampler = new MechanismProductionQASampler(
        DEFAULT_MECHANISM_PRODUCTION_QA_PLAN,
        createTapeHookPack().scene,
        1,
      ),
      p = packet(0);
    Object.defineProperty(p, "passes", {
      enumerable: true,
      get() {
        calls++;
        return [];
      },
    });
    expect(() => sampler.observe(p, evidence)).toThrow(/accessor/);
    expect(calls).toBe(0);
  });
  it("refuses incomplete, duplicate and unordered output intervals", () => {
    const s = new MechanismProductionQASampler(
      DEFAULT_MECHANISM_PRODUCTION_QA_PLAN,
      createTapeHookPack().scene,
      2,
    );
    expect(() => s.observe(packet(1), evidence)).toThrow(/ordered/);
    s.observe(packet(0), evidence);
    expect(() => s.finish(binding)).toThrow(/complete/);
    expect(() => s.observe(packet(0), evidence)).toThrow(/ordered/);
  });
  it("does not turn successful selected checks into whole mechanical acceptance and propagates both failure dimensions", () => {
    const minimal = {
      binding,
      semantics: { interval: { start: 0, endExclusive: 3 } },
      failures: { mechanical: 0, sampledVisual: 0 },
    } as Parameters<typeof mechanismProductionQAFailureReview>[0];
    expect(mechanismProductionQAFailureReview(minimal, evidence)).toEqual([]);
    const failed = {
      ...minimal,
      failures: { mechanical: 2, sampledVisual: 1 },
    };
    expect(mechanismProductionQAFailureReview(failed, evidence)).toMatchObject([
      {
        dimension: "mechanical",
        status: "failed",
        evaluatedInterval: { unit: "output-frame", start: 0, endExclusive: 3 },
      },
      { dimension: "sampled-visual", status: "failed" },
    ]);
  });
  it("maps actual inherited opacity warnings to their controlling carrier and reproduces every raw peak", () => {
    const scene = composition(
      [
        {
          id: "carrier",
          type: "group",
          size: [640, 360],
          transform: {
            opacity: {
              keys: [
                { frame: 0, value: 1 },
                { frame: 3, value: 1 },
                { frame: 4, value: 0.2 },
                { frame: 9, value: 0.2 },
              ],
            },
          },
        },
        solid("hook", { parent: "carrier" }),
        solid("strap", { parent: "carrier" }),
      ],
      { frameCount: 10 },
    );
    const diagnostics = analyzeCompositionQuality(scene).diagnostics.filter(
      (d) => d.code === "opacity-pop",
    );
    expect(diagnostics.length).toBeGreaterThan(1);
    const { document } = narratedCycleFixture();
    document.output.fps = 30;
    document.narration.sampleCount = 16000;
    document.cues = document.cues.slice(0, 1);
    document.cues[0]!.endSampleExclusive = 16000;
    const mapped = mapMechanismProductionWarnings({
      composition: scene,
      document,
      plan: {
        ...DEFAULT_MECHANISM_PRODUCTION_QA_PLAN,
        warningBindings: [
          {
            layer: "carrier",
            controllingRig: "slider",
            parts: ["hook", "blade"],
          },
        ],
      },
      diagnostics,
      binding,
      rawEvidence: evidence,
      video: { path: "output.mp4", sha256: sha },
    });
    expect(mapped.groups).toHaveLength(1);
    expect(mapped.groups[0]).toMatchObject({
      controllingRig: "slider",
      unit: "opacity-alpha",
      maximumMeasuredChange: Math.max(...diagnostics.map((d) => d.measured)),
      parts: ["blade", "hook"],
    });
    expect(mapped.rawWarnings.map((r) => r.diagnostic.controllerLayer)).toEqual(
      diagnostics.map(() => "carrier"),
    );
    expect(
      mapped.groups[0]!.badFrames.every(
        (p) => p.path.startsWith("output.mp4#outputFrame=") && p.sha256 === sha,
      ),
    ).toBe(true);
  });
  it("retains cross-event aggregate peaks instead of fabricating per-event maxima", () => {
    const { document } = narratedCycleFixture();
    document.output.fps = 30;
    const scene = composition([solid("hook")], { frameCount: 120 });
    const diagnostic = {
      code: "velocity-discontinuity",
      severity: "warning" as const,
      frames: [2, 80] as [number, number],
      nodes: ["hook"],
      measured: 17,
      message: "Original aggregate",
      path: "layers.hook.transform",
    };
    const result = mapMechanismProductionWarnings({
      composition: scene,
      document,
      plan: DEFAULT_MECHANISM_PRODUCTION_QA_PLAN,
      diagnostics: [diagnostic],
      binding,
      rawEvidence: evidence,
      video: { path: "output.mp4", sha256: sha },
    });
    expect(result.groups[0]).toMatchObject({
      event: "cross-event",
      interval: { start: 2, endExclusive: 81 },
      maximumMeasuredChange: 17,
    });
    expect(result.rawWarnings[0]!.diagnostic.frames).toEqual([2, 80]);
  });
});
