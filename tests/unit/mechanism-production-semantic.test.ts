import { describe, expect, it } from "vitest";
import {
  MechanismSemanticRegistry,
  checkMechanismProductionTimeline,
} from "@still-shift/animation-engine";
import { createTapeHookPack } from "../../packages/animation-engine/src/mechanism/tape-hook-pack.ts";
import { createCableTiePack } from "../../packages/animation-engine/src/mechanism/cable-tie-pack.ts";
import { createClothespegPack } from "../../packages/animation-engine/src/mechanism/clothespeg-pack.ts";
const sha = "sha256:" + "1".repeat(64);
const binding = {
  inputSha256: sha,
  outputSha256: sha,
  codeSha256: sha,
  profileSha256: sha,
};
const definition = (id = "hook-clearance") => ({
  schemaVersion: "mechanism-semantic-registration-1",
  id,
  description: "Check declared signed gap at the supplied output observations",
  domain: "collision",
  method: "sampled-numeric-range",
  requireEveryOutputFrame: true,
  rules: [
    {
      measurement: "gap",
      range: [0, 1],
      unit: "illustrative-scene-unit",
      rig: "slider",
      parts: ["board", "hook"],
      relationship: "hook.innerRange",
    },
  ],
});
const rows = (values = [0, 1, 0.5]) =>
  values.map((gap, frame) => ({
    frame,
    measurements: { gap },
    evidence: { path: `frame-${frame}.json`, sha256: sha },
  }));
const input = (values?: number[]) => ({
  binding,
  interval: { start: 0, endExclusive: 3 },
  samples: rows(values),
});
function timeline(rig = "slider", relationship = "hook.innerRange") {
  return {
    schemaVersion: "mechanism-pack-timeline-1",
    frameCount: 6,
    initialState: "ready",
    states: ["ready", "touching", "free", "returned"].map((id) => ({
      id,
      requirements: [{ rig, relationship }],
    })),
    transitions: [
      { from: "ready", to: "touching", event: "contact" },
      { from: "touching", to: "free", event: "release" },
      { from: "free", to: "returned", event: "return" },
    ],
    events: [
      { id: "begin", frame: 0, kind: "initial", state: "ready" },
      { id: "contact", frame: 1.5, kind: "contact", state: "touching" },
      { id: "release", frame: 3, kind: "release", state: "free" },
      { id: "return", frame: 4, kind: "return", state: "returned" },
    ],
  };
}
describe("bounded registered semantic execution", () => {
  it("retains located collision samples, units, evidence and actual late failing value without continuous acceptance", () => {
    const registry = new MechanismSemanticRegistry([definition()]);
    const original = input([0, 1.4, 0.5]);
    const before = JSON.stringify(original);
    const result = registry.execute(original);
    expect(result.assertions[0]).toMatchObject({
      status: "failed",
      checkedSamples: 3,
      completeOutputFrameCoverage: true,
      findings: [
        {
          code: "semantic-range-failed",
          frame: 1,
          rig: "slider",
          parts: ["board", "hook"],
          relationship: "hook.innerRange",
          measured: 1.4,
          expectedRange: [0, 1],
          unit: "illustrative-scene-unit",
          sampleIndex: 1,
        },
      ],
    });
    expect(result.rawSamples[1]?.evidence.path).toBe("frame-1.json");
    expect(result.continuousCollision).toBe("unreviewed");
    expect(result.binding).toEqual(binding);
    expect(JSON.stringify(original)).toBe(before);
  });
  it("rejects missing values and incomplete whole-frame coverage instead of producing a pass", () => {
    const registry = new MechanismSemanticRegistry([definition()]);
    const request = input();
    request.samples[1]!.measurements = {} as { gap: number };
    request.samples.splice(2, 1);
    expect(
      registry.execute(request).assertions[0]?.findings.map((f) => f.code),
    ).toEqual(["semantic-measurement-missing", "semantic-frame-coverage"]);
  });
  it("allows declared sparse sampling while preserving the exact scope and unreviewed between-frame collision", () => {
    const d = definition();
    d.requireEveryOutputFrame = false;
    const registry = new MechanismSemanticRegistry([d]);
    const request = input();
    request.samples.splice(1, 1);
    expect(registry.execute(request)).toMatchObject({
      continuousCollision: "unreviewed",
      assertions: [
        {
          status: "passed",
          completeOutputFrameCoverage: false,
          checkedSamples: 2,
        },
      ],
    });
    request.samples = [];
    expect(registry.execute(request).assertions[0]?.status).toBe("unreviewed");
  });
  it("requires finite declarative programs, unique IDs and immutable identity", () => {
    const d = definition();
    const a = new MechanismSemanticRegistry([d, definition("other")]);
    const b = new MechanismSemanticRegistry([definition("other"), d]);
    expect(a.sha256).toBe(b.sha256);
    d.rules[0]!.range = [-1, 1];
    expect(a.registrations[0]?.rules[0]?.range).toEqual([0, 1]);
    expect(
      () => new MechanismSemanticRegistry([definition(), definition()]),
    ).toThrow(/unique/);
    expect(
      () =>
        new MechanismSemanticRegistry([
          { ...definition(), method: "continuous-collision" },
        ]),
    ).toThrow();
    expect(
      () =>
        new MechanismSemanticRegistry([
          {
            ...definition(),
            execute: () => {
              throw Error("must never run");
            },
          },
        ]),
    ).toThrow();
  });
  it("rejects reordered or outside-interval samples and preflights the total comparison budget", () => {
    const registry = new MechanismSemanticRegistry([definition()]);
    const request = input();
    request.samples.reverse();
    expect(() => registry.execute(request)).toThrow(/ordered/);
    request.samples = rows();
    request.samples[2]!.frame = 3;
    expect(() => registry.execute(request)).toThrow(/interval/);
    const many = new MechanismSemanticRegistry(
      Array.from({ length: 11 }, (_, i) => definition("rule" + i)),
    );
    expect(() =>
      many.execute({
        binding,
        interval: { start: 0, endExclusive: 10000 },
        samples: Array.from({ length: 10000 }, (_, frame) => ({
          frame,
          measurements: { gap: 0 },
          evidence: { path: "x", sha256: sha },
        })),
      }),
    ).toThrow(/comparison budget/);
  });
  it("bounds retained failure capacity as well as execution comparisons", () => {
    const d = definition();
    d.rules[0]!.parts = Array.from(
      { length: 128 },
      (_, i) => "part" + i + "x".repeat(100),
    );
    const registry = new MechanismSemanticRegistry([d]);
    expect(() =>
      registry.execute({
        binding,
        interval: { start: 0, endExclusive: 1000 },
        samples: Array.from({ length: 1000 }, (_, frame) => ({
          frame,
          measurements: { gap: 2 },
          evidence: { path: "x", sha256: sha },
        })),
      }),
    ).toThrow(/capacity/);
  });
  it("rejects serialization hooks and accessors without executing their producers", () => {
    let calls = 0;
    const request = input();
    Object.defineProperty(request, "samples", {
      get() {
        calls++;
        return rows();
      },
      enumerable: true,
    });
    expect(() =>
      new MechanismSemanticRegistry([definition()]).execute(request),
    ).toThrow(/accessor/);
    expect(calls).toBe(0);
  });
});
describe("existing MS2 timeline diagnostics in production", () => {
  it("checks all three actual family states and exact fractional event boundaries", () => {
    for (const [instance, authored] of [
      [createTapeHookPack(), timeline()],
      [createCableTiePack(), timeline("ratchet", "pawl.root.fixed")],
      [createClothespegPack(), timeline("upper.return", "spring.upper.seated")],
    ] as const) {
      expect(
        checkMechanismProductionTimeline(instance, authored),
      ).toMatchObject({
        status: "passed",
        checkedOutputFrames: 6,
        checkedEventFrames: 4,
        collisionMethod: "not-evaluated",
      });
    }
  });
  it("retains the real illegal release transition with rig, parts, relationship and first affected interval", () => {
    const authored = timeline();
    authored.events[1] = {
      id: "early",
      frame: 1.5,
      kind: "release",
      state: "free",
    };
    expect(
      checkMechanismProductionTimeline(createTapeHookPack(), authored),
    ).toMatchObject({
      status: "failed",
      checkedOutputFrames: 0,
      finding: {
        code: "mechanism-timeline-transition",
        frame: 1.5,
        rig: "slider",
        parts: ["board", "hook"],
        relationship: "hook.innerRange",
        interval: { startFrame: 1.5, endFrameExclusive: 3 },
      },
    });
  });
  it("retains event-order failures and rejects excessive frame/topology work before compilation", () => {
    const authored = timeline();
    authored.events[2]!.frame = 1;
    expect(
      checkMechanismProductionTimeline(createTapeHookPack(), authored),
    ).toMatchObject({
      status: "failed",
      finding: {
        code: "mechanism-timeline-event",
        frame: 1,
        path: ["timeline", "events", 2, "frame"],
      },
    });
    authored.frameCount = 108000;
    expect(() =>
      checkMechanismProductionTimeline(createTapeHookPack(), authored),
    ).toThrow(/execution budget/);
  });
});
