import { mechanismPackHash } from "../../packages/animation-engine/src/mechanism/pack-support.ts";
import { narratedCycleFixture } from "../helpers/mechanism-narrated-cycle.ts";
import { MechanismNarratedCycleSchema } from "@still-shift/scene-contract";
import { describe, expect, it } from "vitest";
import {
  MechanismRigControlV2Schema,
  MechanismRigidRigV2Schema,
  MechanismSceneV2Schema,
  type MechanismFrameRequestV2,
} from "@still-shift/scene-contract";
import { createClothespegPack } from "../../packages/animation-engine/src/mechanism/clothespeg-pack.ts";
import { prepareMechanismSceneV2 } from "../../packages/renderer-core/src/mechanism/prepare-v2.ts";
import { evaluateMechanismFrameV2 } from "../../packages/renderer-core/src/mechanism/evaluate-v2.ts";
const definition = {
  id: "load",
  type: "load-seat",
  movingPart: "upper",
  reactionPart: "lower",
  referencePart: "model",
  reactionAxis: [1, 0, 0],
  normalAxis: [0, 1, 0],
  pivot: [0.3, 0.7, 0],
  contactPoint: [0, 0, 0],
  maxForceNewtons: 30,
  complianceMetersPerNewton: 0.0001,
  maxTravelMeters: 0.001,
  seatingAngleRadians: -0.1,
};
function scene(scale = 1) {
  const source = structuredClone(
    createClothespegPack({ mount: { scale: [scale, scale, scale] } }).scene,
  );
  delete source.pack;
  source.id = "load-seat-numeric-fixture";
  source.teachingShapes = [];
  source.geometry.meshes = source.geometry.meshes.filter(
    (mesh) => mesh.partId === "upper" || mesh.partId === "lower",
  );
  source.geometrySha256 = mechanismPackHash(source.geometry);
  return {
    ...source,
    rigs: [definition],
    anchors: [
      {
        id: "moving.contact",
        role: "contact",
        source: { kind: "part-local", part: "upper", position: [0, 0, 0] },
      },
      {
        id: "reaction.contact",
        role: "contact",
        source: { kind: "part-local", part: "lower", position: [0, 0, 0] },
      },
    ],
    relationships: [
      {
        id: "contact",
        type: "coincident",
        anchors: ["moving.contact", "reaction.contact"],
        tolerance: 1e-8,
      },
    ],
  };
}
function request(force: number, frame = 0): MechanismFrameRequestV2 {
  return {
    frame,
    width: 640,
    height: 360,
    rigControls: { load: { type: "load-seat", loadNewtons: { value: force } } },
  } as unknown as MechanismFrameRequestV2;
}
describe("force-driven load seating", () => {
  it("preserves contact over a dense force sweep and transformed reference", () => {
    const source = scene(2);
    source.parts[0]!.transform.position = [3, 5, 7];
    source.parts[0]!.transform.rotation = [0.2, -0.3, 0.7];
    const prepared = prepareMechanismSceneV2(source);
    for (let index = 0; index <= 100; index++) {
      const force = index * 0.3,
        frame = evaluateMechanismFrameV2(prepared, request(force));
      expect(frame.relationships.contact!.residual).toBeLessThan(1e-10);
      const state = frame.rigs.load!;
      expect(state).toMatchObject({
        displacementMeters: Math.min(force * 0.0001, 0.002),
      });
    }
  });
  it("rejects independent parent motion between the coupled body and reference", () => {
    const source = scene();
    source.parts.push({
      ...structuredClone(source.parts[1]!),
      id: "intermediate",
      parent: "model",
    });
    source.parts.find((part) => part.id === "upper")!.parent = "intermediate";
    const data = {
      ...source,
      rigs: [
        definition,
        {
          id: "parent-writer",
          type: "slider",
          movingPart: "intermediate",
          referencePart: "model",
          axis: [1, 0, 0],
          range: [-1, 1],
          neutral: 0,
        },
      ],
    };
    expect(MechanismSceneV2Schema.safeParse(data).success).toBe(false);
  });
  it("normalizes admitted rounding of an orthonormal basis without contact drift", () => {
    const source = scene();
    source.rigs[0] = {
      ...definition,
      reactionAxis: [1 + 1e-9, 0, 0],
      normalAxis: [1e-9, 1, 0],
    };
    const frame = evaluateMechanismFrameV2(
      prepareMechanismSceneV2(source),
      request(8),
    );
    expect(frame.relationships.contact!.residual).toBeLessThan(1e-10);
  });
  it("rejects invalid physical parameters and scalar writers before sampling", () => {
    for (const change of [
      { complianceMetersPerNewton: 0 },
      { maxTravelMeters: 0 },
      { maxForceNewtons: -1 },
      { seatingAngleRadians: 0.5 },
      { pivot: [Infinity, 0, 0] },
    ])
      expect(
        MechanismSceneV2Schema.safeParse({
          ...scene(),
          rigs: [{ ...definition, ...change }],
        }).success,
      ).toBe(false);
    expect(
      MechanismRigControlV2Schema.safeParse({
        type: "load-seat",
        loadNewtons: {},
      }).success,
    ).toBe(false);
    expect(
      MechanismRigControlV2Schema.safeParse({
        type: "load-seat",
        loadNewtons: { value: 1, keys: [{ frame: 0, value: 1 }] },
      }).success,
    ).toBe(false);
    expect(MechanismRigidRigV2Schema.safeParse(definition).success).toBe(false);
    const tiny = scene();
    tiny.units.scaleToMeters = 1e-20;
    expect(() =>
      evaluateMechanismFrameV2(prepareMechanismSceneV2(tiny), request(1)),
    ).toThrow(/calibration/);
  });
  it("admits supplied-audio cue references for force keys without inventing pose keys", () => {
    const { document } = narratedCycleFixture();
    const source = {
      ...document,
      controls: [
        {
          rig: "load",
          control: {
            type: "load-seat",
            loadNewtons: {
              keys: [
                { at: { cue: "intro" }, value: 0 },
                { at: { cue: "contact" }, value: 10 },
              ],
            },
          },
        },
      ],
    };
    expect(MechanismNarratedCycleSchema.safeParse(source).success).toBe(true);
  });

  it("uses declared SI compliance, saturation and stop reaction instead of authored pose states", () => {
    const prepared = prepareMechanismSceneV2(scene());
    for (const [force, distance, angle, phase, reaction] of [
      [0, 0, 0, "unloaded", 0],
      [5, 0.0005, -0.05, "seating", 0],
      [10, 0.001, -0.1, "stopped", 0],
      [30, 0.001, -0.1, "stopped", 20],
    ] as const) {
      const frame = evaluateMechanismFrameV2(prepared, request(force)),
        state = frame.rigs.load;
      expect(state).toMatchObject({
        type: "load-seat",
        loadNewtons: force,
        displacementMeters: distance,
        angleRadians: angle,
        phase,
        stopReactionNewtons: reaction,
      });
      expect(frame.anchors["moving.contact"]!.world).toEqual(
        frame.anchors["reaction.contact"]!.world,
      );
      expect(frame.relationships.contact!.residual).toBeLessThanOrEqual(1e-8);
    }
    expect(evaluateMechanismFrameV2(prepared, request(10)).parts).toEqual(
      evaluateMechanismFrameV2(prepared, request(30)).parts,
    );
  });
  it("moves both coupled parts with one physical writer and keeps contact along the declared reaction axis", () => {
    const frame = evaluateMechanismFrameV2(
      prepareMechanismSceneV2(scene()),
      request(5),
    );
    const point = frame.anchors["moving.contact"]!.world;
    // Independent clockwise rotation of the neutral origin about (.3,.7), then -.05 reference-unit travel.
    const rotatedX = 0.3 - 0.3 * Math.cos(-0.05) + 0.7 * Math.sin(-0.05);
    expect(point[0]).toBeCloseTo(rotatedX - 0.05, 12);
    expect(point[1]).toBeCloseTo(0, 12);
    expect(frame.parts.upper!.worldMatrix).not.toEqual(
      frame.parts.lower!.worldMatrix,
    );
  });
  it("scales the geometric stop while keeping prescribed compliance in physical meters", () => {
    const prepared = prepareMechanismSceneV2(scene(2));
    expect(
      evaluateMechanismFrameV2(prepared, request(5)).rigs.load,
    ).toMatchObject({
      displacementMeters: 0.0005,
      angleRadians: -0.025,
      phase: "seating",
    });
    expect(
      evaluateMechanismFrameV2(prepared, request(30)).rigs.load,
    ).toMatchObject({
      displacementMeters: 0.002,
      angleRadians: -0.1,
      phase: "stopped",
      stopReactionNewtons: 10,
    });
  });
  it("is deterministic across backwards seeks and rejects out-of-range key intervals", () => {
    const prepared = prepareMechanismSceneV2(scene()),
      controls = {
        load: {
          type: "load-seat",
          loadNewtons: {
            keys: [
              { frame: 0, value: 0 },
              { frame: 20, value: 20 },
            ],
          },
        },
      };
    const at = (frame: number) =>
      evaluateMechanismFrameV2(prepared, {
        ...request(0, frame),
        rigControls: controls as never,
      });
    const first = at(7);
    at(19);
    expect(at(7)).toEqual(first);
    expect(() => evaluateMechanismFrameV2(prepared, request(-1))).toThrow();
    expect(() => evaluateMechanismFrameV2(prepared, request(31))).toThrow();
    expect(() =>
      evaluateMechanismFrameV2(prepared, {
        ...request(0),
        rigControls: {
          load: {
            type: "load-seat",
            loadNewtons: {
              keys: [
                { frame: 0, value: 0 },
                { frame: 20, value: 31 },
              ],
            },
          },
        },
      } as never),
    ).toThrow();
  });
  it("rejects conflicting writers, part dependencies and nonorthogonal reference axes", () => {
    const source = scene();
    expect(
      MechanismSceneV2Schema.safeParse({
        ...source,
        rigs: [
          definition,
          {
            id: "conflict",
            type: "slider",
            movingPart: "lower",
            referencePart: "model",
            axis: [1, 0, 0],
            range: [-1, 1],
            neutral: 0,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      MechanismSceneV2Schema.safeParse({
        ...source,
        rigs: [{ ...definition, reactionPart: "upper" }],
      }).success,
    ).toBe(false);
    expect(
      MechanismSceneV2Schema.safeParse({
        ...source,
        rigs: [{ ...definition, normalAxis: [1, 0, 0] }],
      }).success,
    ).toBe(false);
    expect(
      MechanismSceneV2Schema.safeParse({
        ...source,
        rigs: [{ ...definition, reactionPart: "model" }],
      }).success,
    ).toBe(false);
  });
  it("rejects nonuniform reference scale with a located model error", () => {
    const source = scene();
    source.parts[0]!.transform.scale = [2, 1, 1];
    expect(() =>
      evaluateMechanismFrameV2(prepareMechanismSceneV2(source), request(5)),
    ).toThrow(/uniform/);
  });
});
