import { describe, expect, it } from "vitest";
import { MechanismSceneV2Schema } from "@still-shift/scene-contract";
import {
  prepareMechanismRigTracksV2,
  evaluateMechanismRigTracksV2,
} from "../../packages/renderer-core/src/mechanism/rig-tracks-v2.ts";
import { MechanismEvaluationErrorV2 } from "../../packages/renderer-core/src/mechanism/types-v2.ts";
import {
  nativeSolidFixture,
  nativeFixtureHash,
} from "../helpers/native3d-fixture.ts";

/** Non-E01 declaration fixture for scalar sampling; no generator/render support claim. */
function scene() {
  const base = nativeSolidFixture();
  return MechanismSceneV2Schema.parse({
    ...base,
    schemaVersion: "mechanism-scene-2",
    parts: [
      ...base.parts,
      { id: "jaw", parent: "root" },
      { id: "cable", parent: "root" },
    ],
    rigs: [
      {
        id: "slide",
        type: "slider",
        movingPart: "child",
        referencePart: "root",
        axis: [1, 0, 0],
        range: [0, 10],
        neutral: 0,
      },
      {
        id: "hinge",
        type: "hinge",
        movingPart: "jaw",
        referencePart: "root",
        axis: [0, 0, 1],
        pivot: [0, 0, 0],
        angleRange: [-Math.PI / 2, Math.PI / 2],
        neutralAngle: 0,
      },
      {
        id: "return",
        type: "spring-return",
        targetRig: "slide",
        restValue: 0,
        returnFrames: 10,
        easing: "linear",
      },
      {
        id: "latch",
        type: "ratchet",
        movingPart: "cable",
        referencePart: "root",
        axis: [1, 0, 0],
        range: [0, 4],
        pitch: 1,
        toothCount: 5,
        neutralTooth: 0,
        pawlShape: "pawl",
        pawlTipAnchor: "pawl.tip",
        toothDatumAnchor: "cable.datum",
      },
    ],
    teachingShapes: [
      {
        id: "pawl",
        mesh: "floor",
        ownerPart: "root",
        topologySha256: nativeFixtureHash,
        generator: "fixed-root-pawl-curve-1",
        driver: { rig: "latch", channel: "pawlDeflection" },
        parameters: {
          length: 10,
          width: 2,
          thickness: 0.5,
          maxDeflection: 2,
          longitudinalSegments: 2,
        },
        landmarks: [
          { id: "root", vertexIndices: [0] },
          { id: "tip", vertexIndices: [1] },
        ],
      },
    ],
    anchors: [
      {
        id: "pawl.tip",
        role: "contact",
        source: { kind: "shape-landmark", shape: "pawl", landmark: "tip" },
      },
      {
        id: "cable.datum",
        role: "contact",
        source: { kind: "part-local", part: "cable", position: [0, 0, 0] },
      },
    ],
  });
}
function location(input: unknown) {
  try {
    prepareMechanismRigTracksV2(scene(), input);
  } catch (error) {
    expect(error).toBeInstanceOf(MechanismEvaluationErrorV2);
    return (error as MechanismEvaluationErrorV2).location;
  }
  throw new Error("Expected rejection");
}
const returnStates = [
  { frame: 0, phase: "held", value: 10 },
  { frame: 5, phase: "released", value: 10, stopValue: 3 },
];

describe("history-independent reusable rig tracks", () => {
  it("samples physical slider and hinge scalars at fractional source frames", () => {
    const prepared = prepareMechanismRigTracksV2(scene(), {
      slide: {
        type: "slider",
        keys: [
          { frame: 0, value: 0 },
          { frame: 10, value: 10 },
        ],
      },
      hinge: {
        type: "hinge",
        keys: [
          { frame: 0, value: 0 },
          { frame: 10, value: Math.PI / 2 },
        ],
      },
    });
    const result = evaluateMechanismRigTracksV2(prepared, 0.5);
    expect(result.slide).toEqual({
      id: "slide",
      type: "slider",
      position: 0.5,
    });
    expect(result.hinge).toEqual({
      id: "hinge",
      type: "hinge",
      angleRadians: Math.PI / 40,
    });
    expect(result.return).toEqual({
      id: "return",
      type: "spring-return",
      targetRig: "slide",
      value: 0.5,
      phase: "held",
    });
  });
  it("checks the whole authored track before the first queried frame and never clamps bad values", () => {
    expect(
      location({
        slide: {
          type: "slider",
          keys: [
            { frame: 0, value: 0 },
            { frame: 10, value: 11 },
          ],
        },
      }),
    ).toMatchObject({
      code: "mechanism-rig-range",
      path: ["rigControls", "slide", "keys", 1, "value"],
      frame: 10,
    });
    expect(
      location({ hinge: { type: "hinge", value: Math.PI } }),
    ).toMatchObject({
      code: "mechanism-rig-range",
      path: ["rigControls", "hinge", "value"],
    });
  });
  it("rejects missing rigs, incompatible writer kinds and competing return/direct controls", () => {
    expect(location({ unknown: { type: "slider", value: 0 } })).toMatchObject({
      code: "mechanism-rig-reference",
      path: ["rigControls", "unknown"],
    });
    expect(location({ slide: { type: "hinge", value: 0 } })).toMatchObject({
      code: "mechanism-rig-control",
      path: ["rigControls", "slide", "type"],
    });
    expect(
      location({
        slide: { type: "slider", value: 10 },
        return: { type: "spring-return", states: returnStates },
      }),
    ).toMatchObject({
      code: "mechanism-control-owner",
      path: ["rigControls", "slide"],
    });
  });
  it("preserves located contract transition and key-order diagnostics", () => {
    expect(
      location({
        return: {
          type: "spring-return",
          states: [returnStates[0], { ...returnStates[1], value: 9 }],
        },
      }),
    ).toMatchObject({
      code: "mechanism-return-continuity",
      path: ["rigControls", "return", "states", 1, "value"],
    });
    expect(
      location({
        slide: {
          type: "slider",
          keys: [
            { frame: 3, value: 0 },
            { frame: 2, value: 1 },
          ],
        },
      }),
    ).toMatchObject({
      code: "mechanism-key-order",
      path: ["rigControls", "slide", "keys", 1, "frame"],
    });
  });
  it("follows the deterministic return curve and reaches a legal contact stop", () => {
    const prepared = prepareMechanismRigTracksV2(scene(), {
      return: { type: "spring-return", states: returnStates },
    });
    expect(evaluateMechanismRigTracksV2(prepared, 5).return).toMatchObject({
      value: 10,
      phase: "returning",
    });
    expect(evaluateMechanismRigTracksV2(prepared, 10).slide).toMatchObject({
      position: 5,
    });
    expect(evaluateMechanismRigTracksV2(prepared, 12).return).toMatchObject({
      value: 3,
      phase: "contact",
    });
    expect(evaluateMechanismRigTracksV2(prepared, 100).slide).toMatchObject({
      position: 3,
    });
    const fullReturn = prepareMechanismRigTracksV2(scene(), {
      return: {
        type: "spring-return",
        states: [returnStates[0], { ...returnStates[1], stopValue: 0 }],
      },
    });
    expect(evaluateMechanismRigTracksV2(fullReturn, 15).return).toMatchObject({
      value: 0,
      phase: "rest",
    });
  });
  it("rejects stops beyond the loaded/rest segment and discontinuous re-holding", () => {
    expect(
      location({
        return: {
          type: "spring-return",
          states: [returnStates[0], { ...returnStates[1], stopValue: 11 }],
        },
      }),
    ).toMatchObject({
      code: "mechanism-return-stop",
      path: ["rigControls", "return", "states", 1, "stopValue"],
      frame: 5,
    });
    expect(
      location({
        return: {
          type: "spring-return",
          states: [...returnStates, { frame: 12, phase: "held", value: 4 }],
        },
      }),
    ).toMatchObject({
      code: "mechanism-return-continuity",
      frame: 12,
      interval: { startFrame: 5, endFrameExclusive: 12 },
    });
  });
  it("permits a continuous return interruption and linearly loads between held keys", () => {
    const prepared = prepareMechanismRigTracksV2(scene(), {
      return: {
        type: "spring-return",
        states: [
          ...returnStates,
          { frame: 12, phase: "held", value: 3 },
          { frame: 20, phase: "held", value: 8 },
        ],
      },
    });
    expect(evaluateMechanismRigTracksV2(prepared, 12).return).toMatchObject({
      value: 3,
      phase: "held",
    });
    expect(evaluateMechanismRigTracksV2(prepared, 16).slide).toMatchObject({
      position: 5.5,
    });
  });
  it("samples tooth inventory, seating and pawl deflection from position", () => {
    const prepared = prepareMechanismRigTracksV2(scene(), {
      latch: {
        type: "ratchet",
        position: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 4, value: 4 },
          ],
        },
        latchKeys: [{ frame: 0, state: "engaged" }],
      },
    });
    expect(evaluateMechanismRigTracksV2(prepared, 0.5).latch).toMatchObject({
      position: 0.5,
      toothIndex: 0,
      phase: "advancing",
      pawlDeflection: 1,
    });
    expect(evaluateMechanismRigTracksV2(prepared, 1).latch).toMatchObject({
      position: 1,
      toothIndex: 1,
      phase: "seated",
      pawlDeflection: 0,
    });
    expect(evaluateMechanismRigTracksV2(prepared, 100).latch).toMatchObject({
      toothIndex: 4,
      phase: "seated",
    });
  });
  it("locates the first engaged overlap in a reverse continuous interval", () => {
    expect(
      location({
        latch: {
          type: "ratchet",
          position: {
            keys: [
              { frame: 0, value: 3 },
              { frame: 6, value: 0 },
            ],
          },
          latchKeys: [
            { frame: 0, state: "released" },
            { frame: 4, state: "engaged" },
          ],
        },
      }),
    ).toMatchObject({
      code: "mechanism-ratchet-reverse",
      path: ["rigControls", "latch", "position", "keys", 1, "value"],
      frame: 4,
      interval: { startFrame: 4, endFrameExclusive: 6 },
    });
  });
  it("requires release at a reverse hold step and permits release at the exact step event", () => {
    const control = {
      type: "ratchet",
      position: {
        keys: [
          { frame: 0, value: 3, easing: "hold" },
          { frame: 6, value: 0 },
        ],
      },
      latchKeys: [{ frame: 0, state: "engaged" }],
    };
    expect(location({ latch: control })).toMatchObject({
      code: "mechanism-ratchet-reverse",
      frame: 6,
    });
    const prepared = prepareMechanismRigTracksV2(scene(), {
      latch: {
        ...control,
        latchKeys: [...control.latchKeys, { frame: 6, state: "released" }],
      },
    });
    expect(evaluateMechanismRigTracksV2(prepared, 5.5).latch).toMatchObject({
      position: 3,
      phase: "seated",
    });
    expect(evaluateMechanismRigTracksV2(prepared, 6).latch).toMatchObject({
      position: 0,
      phase: "released",
      pawlDeflection: 1,
    });
  });
  it("clones and freezes the track snapshot without mutating caller data", () => {
    const input = {
      slide: {
        type: "slider",
        keys: [
          { frame: 0, value: 0 },
          { frame: 10, value: 10 },
        ],
      },
    };
    const prepared = prepareMechanismRigTracksV2(scene(), input);
    input.slide.keys[1]!.value = 100;
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(prepared.controls.slide)).toBe(true);
    expect(Object.isFrozen(prepared.rigs)).toBe(true);
    expect(evaluateMechanismRigTracksV2(prepared, 10).slide).toMatchObject({
      position: 10,
    });
  });
  it("produces identical scalar states across forward, reverse and random seeks", () => {
    const prepared = prepareMechanismRigTracksV2(scene(), {
      return: { type: "spring-return", states: returnStates },
      hinge: {
        type: "hinge",
        keys: [
          { frame: 0, value: -Math.PI / 4, easing: "smoothstep" },
          { frame: 20, value: Math.PI / 4 },
        ],
      },
      latch: {
        type: "ratchet",
        position: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 6, value: 4 },
            { frame: 8, value: 4 },
            { frame: 10, value: 0 },
          ],
        },
        latchKeys: [
          { frame: 0, state: "engaged" },
          { frame: 8, state: "released" },
          { frame: 10, state: "engaged" },
        ],
      },
    });
    const frames = [0, 0.25, 0.5, 1, 2, 5, 6, 8, 9.25, 10, 12, 15, 20];
    const expected = new Map(
      frames.map((frame) => [
        frame,
        evaluateMechanismRigTracksV2(prepared, frame),
      ]),
    );
    for (const frame of [...frames].reverse())
      expect(evaluateMechanismRigTracksV2(prepared, frame)).toEqual(
        expected.get(frame),
      );
    for (const frame of [9.25, 0, 12, 0.25, 20, 6, 5, 15, 1, 8, 2, 10, 0.5])
      expect(evaluateMechanismRigTracksV2(prepared, frame)).toEqual(
        expected.get(frame),
      );
  });
});

it("permits a constructor target ID without inventing an inherited writer", () => {
  const source = scene();
  source.rigs = source.rigs.map((rig) =>
    rig.id === "slide"
      ? { ...rig, id: "constructor" }
      : rig.type === "spring-return"
        ? { ...rig, targetRig: "constructor" }
        : rig,
  );
  const prepared = prepareMechanismRigTracksV2(source, {
    return: { type: "spring-return", states: returnStates },
  });
  expect(evaluateMechanismRigTracksV2(prepared, 10).constructor).toMatchObject({
    id: "constructor",
    type: "slider",
    position: 5,
  });
});
