import { describe, expect, it } from "vitest";
import {
  MechanismStaticMomentModelSchema,
  MechanismStaticMomentResultSchema,
  type MechanismStaticMomentInput,
  type MechanismStaticMomentModel,
} from "@still-shift/scene-contract";
import { createClothespegPack } from "../../packages/animation-engine/src/mechanism/clothespeg-pack.ts";
import {
  evaluateMechanismFrameV2,
  evaluateMechanismStaticMomentFrame,
  prepareMechanismSceneV2,
  solveMechanismStaticMomentBalance as solve,
} from "../../packages/renderer-core/src/mechanism/index.ts";
const base: MechanismStaticMomentInput = {
  pivot: [0, 0, 0],
  applicationPoint: [50, 0, 0],
  axis: [0, 0, 1],
  forceDirection: [0, -1, 0],
  scaleToMeters: 0.001,
  resistingTorque: { value: 500, unit: "N*mm" },
};
function model(id = "near"): MechanismStaticMomentModel {
  return {
    id,
    pivotAnchor: "lever.pivot",
    applicationAnchor: id === "far" ? "press.far" : "press.near",
    referencePart: "model",
    axis: [0, 0, 1],
    forceDirection: [0, -1, 0],
    resistingTorque: { value: 0.01, unit: "N*m" },
  };
}
function preparedPeg(mount?: {
  rotation: [number, number, number];
  scale: [number, number, number];
  position: [number, number, number];
}) {
  const scene = structuredClone(
    createClothespegPack(mount ? { mount } : {}).scene,
  );
  delete scene.pack;
  for (const [id, part, position] of [
    ["lever.pivot", "model", [0, 0, 0]],
    ["press.near", "upper", [1, 0.86, 0.4]],
    ["press.far", "upper", [2.4, 0.8133333333333334, 0.4]],
  ] as const)
    scene.anchors.push({
      id,
      role: "proof-target",
      source: { kind: "part-local", part, position: [...position] },
    });
  return prepareMechanismSceneV2(scene);
}
describe("ideal static moment balance", () => {
  it("balances fixed resistance and halves force at twice the perpendicular arm", () => {
    const near = solve(base),
      far = solve({ ...base, applicationPoint: [100, 0, 0] });
    expect(near.requiredForceNewtons).toBe(10);
    expect(far.requiredForceNewtons).toBe(5);
    expect(near.signedMomentArmMeters).toBe(-0.05);
    expect(near.resistingTorqueNewtonMeters).toBe(0.5);
    expect(
      near.requiredForceNewtons * near.signedMomentArmMeters +
        near.resistingTorqueNewtonMeters,
    ).toBe(0);
    expect(Object.isFrozen(near)).toBe(true);
  });
  it.each([1, 0.01, 0.001])(
    "converts coordinates with declared scale %s to meters",
    (scale) => {
      expect(
        solve({
          ...base,
          applicationPoint: [0.05 / scale, 0, 0],
          scaleToMeters: scale,
          resistingTorque: { value: 0.5, unit: "N*m" },
        }),
      ).toEqual(solve(base));
    },
  );
  it("uses the perpendicular projection, rather than radial distance", () => {
    expect(
      solve({
        ...base,
        applicationPoint: [30, 40, 0],
        forceDirection: [1, 0, 0],
      }).requiredForceNewtons,
    ).toBe(12.5);
    expect(
      solve({ ...base, applicationPoint: [50, 400, 9] }).requiredForceNewtons,
    ).toBe(10);
  });
  it("is invariant under translation and direction magnitude", () => {
    expect(
      solve({
        ...base,
        pivot: [23, 17, 19],
        applicationPoint: [73, 17, 19],
        axis: [0, 0, 4],
        forceDirection: [0, -3, 0],
      }),
    ).toEqual(solve(base));
  });
  it("handles opposite signed resistance and a zero prescribed resistance", () => {
    expect(
      solve({
        ...base,
        forceDirection: [0, 1, 0],
        resistingTorque: { value: -500, unit: "N*mm" },
      }).requiredForceNewtons,
    ).toBe(10);
    const zero = solve({ ...base, resistingTorque: { value: 0, unit: "N*m" } });
    expect(zero.requiredForceNewtons).toBe(0);
    expect(Object.is(zero.requiredForceNewtons, -0)).toBe(false);
  });
  it.each([
    { axis: [0, 0, 0] },
    { forceDirection: [0, 0, 0] },
    { forceDirection: [1, 0, 0] },
    { applicationPoint: [0, 0, 0] },
    { forceDirection: [0, 1, 0] },
    { scaleToMeters: 0 },
    { scaleToMeters: Infinity },
    { resistingTorque: { value: Infinity, unit: "N*m" } },
    {
      resistingTorque: { value: 1e6, unit: "N*m" },
      applicationPoint: [0.0001, 0, 0],
      scaleToMeters: 0.0001,
    },
  ])("rejects degenerate, invalid or unbounded request %#", (change) => {
    expect(() =>
      solve({ ...base, ...change } as MechanismStaticMomentInput),
    ).toThrow();
  });
});
describe("strict moment result", () => {
  it("rejects a forged force, zero arm and undeclared physics claims", () => {
    const actual = solve(base);
    expect(
      MechanismStaticMomentResultSchema.safeParse({
        ...actual,
        requiredForceNewtons: 11,
      }).success,
    ).toBe(false);
    expect(
      MechanismStaticMomentResultSchema.safeParse({
        ...actual,
        signedMomentArmMeters: 0,
      }).success,
    ).toBe(false);
    expect(
      MechanismStaticMomentResultSchema.safeParse({
        ...actual,
        measuredSpringForce: 10,
      }).success,
    ).toBe(false);
  });
});
describe("moment models bound to posed mechanism anchors", () => {
  it("keeps the normal frame exact and compares near/far forces at three poses", () => {
    const prepared = preparedPeg();
    for (const angle of [0, -0.08, -0.16]) {
      const request = {
          frame: 7,
          width: 640,
          height: 360,
          rigControls: {
            "upper.hinge": { type: "hinge" as const, value: angle },
            "lower.hinge": { type: "hinge" as const, value: -angle },
          },
        },
        actual = evaluateMechanismStaticMomentFrame(prepared, request, [
          model(),
          model("far"),
        ]);
      expect(actual.frame).toEqual(evaluateMechanismFrameV2(prepared, request));
      for (const [id, x, y] of [
        ["near", 1, 0.86],
        ["far", 2.4, 0.8133333333333334],
      ] as const) {
        const force = actual.moments[id]!.requiredForceNewtons,
          oracleX = x * Math.cos(angle) - y * Math.sin(angle);
        expect(force).toBeCloseTo(1 / oracleX, 12);
        expect(
          force * actual.moments[id]!.signedMomentArmMeters + 0.01,
        ).toBeCloseTo(0, 12);
      }
      expect(actual.moments.far!.requiredForceNewtons).toBeLessThan(
        actual.moments.near!.requiredForceNewtons,
      );
      expect(Object.isFrozen(actual.moments)).toBe(true);
    }
  });
  it("uses calibrated world geometry after a translated, rotated and scaled mount", () => {
    const prepared = preparedPeg({
        position: [3, 5, 7],
        rotation: [0.3, -0.2, 0.7],
        scale: [2, 2, 2],
      }),
      actual = evaluateMechanismStaticMomentFrame(
        prepared,
        { frame: 0, width: 640, height: 360 },
        [model(), model("far")],
      );
    expect(actual.moments.near!.requiredForceNewtons).toBeCloseTo(0.5, 12);
    expect(actual.moments.far!.requiredForceNewtons).toBeCloseTo(1 / 4.8, 12);
  });
  it.each(["pivotAnchor", "applicationAnchor", "referencePart"] as const)(
    "locates an absent %s before evaluation",
    (field) => {
      expect(() =>
        evaluateMechanismStaticMomentFrame(
          preparedPeg(),
          { frame: 0, width: 640, height: 360 },
          [{ ...model(), [field]: "missing" }],
        ),
      ).toThrow(/Unknown moment/);
    },
  );
  it("rejects duplicate models, oversized batches and unsupported declaration fields", () => {
    const prepared = preparedPeg(),
      request = { frame: 0, width: 640, height: 360 };
    expect(() =>
      evaluateMechanismStaticMomentFrame(prepared, request, [model(), model()]),
    ).toThrow(/unique/);
    expect(() =>
      evaluateMechanismStaticMomentFrame(
        prepared,
        request,
        Array.from({ length: 17 }, (_, i) => model("model" + i)),
      ),
    ).toThrow();
    expect(
      MechanismStaticMomentModelSchema.safeParse({
        ...model(),
        measuredSpringStiffness: 100,
      }).success,
    ).toBe(false);
    expect(
      MechanismStaticMomentModelSchema.safeParse({
        ...model(),
        axis: [0, 0, 2],
      }).success,
    ).toBe(false);
  });
  it("retains located model/frame context for a force that cannot balance", () => {
    try {
      evaluateMechanismStaticMomentFrame(
        preparedPeg(),
        { frame: 23, width: 640, height: 360 },
        [{ ...model(), forceDirection: [0, 1, 0] }],
      );
      throw new Error("Expected moment rejection");
    } catch (error) {
      expect(error).toMatchObject({
        location: {
          frame: 23,
          code: "mechanism-moment-balance",
          path: ["models", 0],
        },
      });
    }
  });
});
