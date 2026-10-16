import { describe, it, expect } from "vitest";
import {
  BlenderProductionObservationSchema,
  BlenderProductionQAPlanSchema,
  admitBlenderProductionQAPlan,
  sampleBlenderProductionMeasurement,
  MechanismSemanticRegistry,
} from "@still-shift/animation-engine";
import { blenderHash } from "../fixtures/blender-episode-support.ts";
const hash = blenderHash("fixture");
const part = (name: string, x = 0, y = 0, z = 0) => ({
  name,
  visible: true,
  editorial: false,
  vertices: 8,
  triangles: 12,
  positionsSha256: hash,
  triangleIndicesSha256: hash,
  worldMatrix: [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1],
  worldBounds: {
    min: [x, y, z] as [number, number, number],
    max: [x + 1, y + 1, z + 1] as [number, number, number],
  },
});
const observed = () =>
  BlenderProductionObservationSchema.parse({
    schemaVersion: "blender-native-observed-frame-1",
    sourceAssetSha256: hash,
    actualControls: { travel: 0.5 },
    parts: [part("mount", 3, 4, 12), part("jaw", 6, 8, 12)],
  });
const registration = () => ({
  schemaVersion: "mechanism-semantic-registration-1",
  id: "range",
  description: "Fixture observed range",
  domain: "mechanical",
  method: "sampled-numeric-range",
  requireEveryOutputFrame: true,
  rules: [
    {
      measurement: "travel",
      range: [0, 1],
      unit: "control-value",
      rig: "controls",
      parts: ["jaw"],
      relationship: "slider-mount",
    },
  ],
});
const plan = () => ({
  schemaVersion: "blender-production-qa-plan-1",
  measurements: [
    { kind: "actual-control", measurement: "travel", control: "travel" },
  ],
  programs: [
    {
      id: "event",
      interval: { start: 0, endExclusive: 3 },
      registrations: [registration()],
    },
  ],
});
describe("native numeric QA admission and evidence semantics", () => {
  it("uses Bpy row-major origins and preserves the signed AABB-gap distinction", () => {
    const o = observed();
    expect(
      sampleBlenderProductionMeasurement(
        {
          kind: "part-origin-drift",
          measurement: "drift",
          part: "mount",
          referenceFrame: 0,
        },
        o,
        part("mount"),
      ),
    ).toBe(13);
    expect(
      sampleBlenderProductionMeasurement(
        {
          kind: "part-origin-separation",
          measurement: "distance",
          parts: ["mount", "jaw"],
        },
        o,
      ),
    ).toBe(5);
    expect(
      sampleBlenderProductionMeasurement(
        {
          kind: "part-bounds-separation",
          measurement: "gap",
          parts: ["mount", "jaw"],
          axis: "x",
        },
        o,
      ),
    ).toBe(2);
    o.parts[1]!.worldBounds = { min: [3.5, 4, 12], max: [4.5, 5, 13] };
    expect(
      sampleBlenderProductionMeasurement(
        {
          kind: "part-bounds-separation",
          measurement: "gap",
          parts: ["mount", "jaw"],
          axis: "x",
        },
        o,
      ),
    ).toBe(-0.5);
  });
  it("retains missing controls, parts and reference surfaces as missing measurements", () => {
    const o = observed();
    expect(
      sampleBlenderProductionMeasurement(
        { kind: "actual-control", measurement: "missing", control: "absent" },
        o,
      ),
    ).toBeUndefined();
    expect(
      sampleBlenderProductionMeasurement(
        {
          kind: "surface-hash-change",
          measurement: "missing",
          part: "mount",
          referenceFrame: 0,
        },
        o,
      ),
    ).toBeUndefined();
    expect(
      sampleBlenderProductionMeasurement(
        { kind: "part-render-flag", measurement: "missing", part: "absent" },
        o,
      ),
    ).toBeUndefined();
    const r = new MechanismSemanticRegistry([registration()]).execute({
      binding: {
        inputSha256: hash,
        outputSha256: hash,
        codeSha256: hash,
        profileSha256: hash,
      },
      interval: { start: 0, endExclusive: 1 },
      samples: [
        {
          frame: 0,
          measurements: {},
          evidence: { path: "actual-observation.json", sha256: hash },
        },
      ],
    });
    expect(r.assertions[0]!.findings[0]).toMatchObject({
      code: "semantic-measurement-missing",
      frame: 0,
      parts: ["jaw"],
      relationship: "slider-mount",
      measured: null,
    });
    expect(r.continuousCollision).toBe("unreviewed");
  });
  it("rejects nonfinite or ambiguous native observations", () => {
    const o = observed();
    o.parts.push(o.parts[0]!);
    expect(() => BlenderProductionObservationSchema.parse(o)).toThrow(/unique/);
    o.parts.pop();
    o.parts[0]!.worldMatrix[3] = Infinity;
    expect(() => BlenderProductionObservationSchema.parse(o)).toThrow();
  });
  it("rejects wrong units, duplicate selectors and excessive work before frame reads", () => {
    const p = plan();
    p.programs[0]!.registrations[0]!.rules[0]!.unit = "meter";
    expect(() => BlenderProductionQAPlanSchema.parse(p)).toThrow(
      /actual measurement unit/,
    );
    p.programs[0]!.registrations[0]!.rules[0]!.unit = "control-value";
    p.measurements.push(p.measurements[0]!);
    expect(() => BlenderProductionQAPlanSchema.parse(p)).toThrow(/unique/);
    p.measurements.pop();
    p.programs = Array.from({ length: 32 }, (_, i) => ({
      ...p.programs[0]!,
      id: "event" + i,
      interval: { start: 0, endExclusive: 2000 },
      registrations: [
        {
          ...registration(),
          rules: [registration().rules[0]!, registration().rules[0]!],
        },
      ],
    }));
    expect(() => BlenderProductionQAPlanSchema.parse(p)).toThrow(
      /comparison budget/,
    );
  });
  it("bounds program stages and reference frames against the original output clock", () => {
    expect(
      admitBlenderProductionQAPlan(plan(), 3).programs[0]!.interval
        .endExclusive,
    ).toBe(3);
    expect(() => admitBlenderProductionQAPlan(plan(), 2)).toThrow(
      /actual episode clock/,
    );
  });
});
