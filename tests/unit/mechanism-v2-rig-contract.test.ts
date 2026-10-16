import { describe, expect, it } from "vitest";
import {
  MechanismRigV2Schema,
  MechanismRigControlsV2Schema,
  MechanismScalarKeysV2Schema,
} from "@still-shift/scene-contract";

const slider = {
  id: "travel",
  type: "slider",
  movingPart: "hook",
  referencePart: "blade",
  axis: [1, 0, 0],
  range: [0, 2],
  neutral: 0,
};
const ratchet = {
  id: "latch",
  type: "ratchet",
  movingPart: "strap",
  referencePart: "head",
  axis: [1, 0, 0],
  range: [0, 3],
  pitch: 1,
  toothCount: 4,
  neutralTooth: 0,
  pawlShape: "pawl",
  pawlTipAnchor: "pawl.tip",
  toothDatumAnchor: "tooth.datum",
};

describe("reusable rig contracts", () => {
  it("keeps finite physical scalar ranges and explicit reference axes", () => {
    expect(MechanismRigV2Schema.parse(slider).type).toBe("slider");
    for (const change of [
      { axis: [2, 0, 0] },
      { range: [2, 0] },
      { range: [0, 0] },
      { neutral: 3 },
      { referencePart: "hook" },
    ])
      expect(
        MechanismRigV2Schema.safeParse({ ...slider, ...change }).success,
      ).toBe(false);
  });
  it("validates hinges without E01 topology or travel fields", () => {
    const hinge = {
      id: "jaw",
      type: "hinge",
      movingPart: "jaw",
      referencePart: "body",
      axis: [0, 0, 1],
      pivot: [3, 2, 0],
      angleRange: [-0.5, 0.5],
      neutralAngle: 0,
    };
    expect(MechanismRigV2Schema.safeParse(hinge).success).toBe(true);
    expect(
      MechanismRigV2Schema.safeParse({ ...hinge, neutralAngle: 0.6 }).success,
    ).toBe(false);
    expect(
      MechanismRigV2Schema.safeParse({ ...hinge, thickness: 1 }).success,
    ).toBe(false);
  });
  it("admits fractional keys and rejects duplicate or reversed clocks", () => {
    expect(
      MechanismScalarKeysV2Schema.parse([
        { frame: 0.25, value: -0.5 },
        { frame: 10.5, value: 2 },
      ]),
    ).toHaveLength(2);
    for (const frame of [0.25, 0])
      expect(
        MechanismScalarKeysV2Schema.safeParse([
          { frame: 0.25, value: 0 },
          { frame, value: 1 },
        ]).success,
      ).toBe(false);
  });
  it("requires one scalar writer and preserves incompatible-route rejection", () => {
    expect(
      MechanismRigControlsV2Schema.safeParse({
        travel: { type: "slider", value: 1 },
      }).success,
    ).toBe(true);
    expect(
      MechanismRigControlsV2Schema.safeParse({
        travel: { type: "slider", value: 1, keys: [{ frame: 0, value: 1 }] },
      }).success,
    ).toBe(false);
    expect(
      MechanismRigControlsV2Schema.safeParse({ travel: { travel: 0.5 } })
        .success,
    ).toBe(false);
  });
  it("rejects release jumps and repeated release transitions with located evidence", () => {
    const held = { frame: 0, phase: "held", value: 0.5 };
    const released = { frame: 10, phase: "released", value: 0.5, stopValue: 0 };
    expect(
      MechanismRigControlsV2Schema.safeParse({
        return: { type: "spring-return", states: [held, released] },
      }).success,
    ).toBe(true);
    const jump = MechanismRigControlsV2Schema.safeParse({
      return: {
        type: "spring-return",
        states: [held, { ...released, value: 0.6 }],
      },
    });
    expect(jump.success).toBe(false);
    if (!jump.success)
      expect(
        jump.error.issues.some(
          (issue) => issue.path.join(".") === "return.states.1.value",
        ),
      ).toBe(true);
    expect(
      MechanismRigControlsV2Schema.safeParse({
        return: {
          type: "spring-return",
          states: [held, released, { ...released, frame: 20 }],
        },
      }).success,
    ).toBe(false);
  });
  it("binds ratchet travel to tooth inventory and rejects invalid neutral teeth", () => {
    expect(MechanismRigV2Schema.safeParse(ratchet).success).toBe(true);
    expect(
      MechanismRigV2Schema.safeParse({ ...ratchet, range: [0, 4] }).success,
    ).toBe(false);
    expect(
      MechanismRigV2Schema.safeParse({ ...ratchet, neutralTooth: 4 }).success,
    ).toBe(false);
    expect(
      MechanismRigV2Schema.safeParse({
        id: "return",
        type: "spring-return",
        targetRig: "return",
        restValue: 0,
        returnFrames: 10,
        easing: "linear",
      }).success,
    ).toBe(false);
  });
});
