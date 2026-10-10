import { describe, expect, it } from "vitest";
import {
  MechanismFrameRequestV2Schema,
  MechanismFrameResultV2Schema,
  MechanismShapeFrameSchema,
} from "@still-shift/scene-contract";
import { IDENTITY_MATRIX } from "../../packages/renderer-core/src/mechanism/matrix.ts";
import {
  nativeSolidFixture,
  nativeFixtureHash,
} from "../helpers/native3d-fixture.ts";

function shape() {
  const mesh = nativeSolidFixture().geometry.meshes[0]!;
  return {
    shape: "pawl",
    mesh: mesh.id,
    ownerPart: "root",
    topologySha256: nativeFixtureHash,
    stateKey: "pawl:0",
    positions: mesh.positions,
    normals: mesh.normals,
    bounds: mesh.bounds,
    landmarks: { root: [0, 0, 0], tip: [0, 1, 0] },
  };
}
function frame() {
  return {
    version: "mechanism-evaluator-2",
    frame: 0.5,
    seed: 0,
    camera: nativeSolidFixture().camera,
    parts: {
      root: {
        id: "root",
        localMatrix: IDENTITY_MATRIX,
        worldMatrix: IDENTITY_MATRIX,
        visible: true,
      },
    },
    rigs: { hinge: { id: "hinge", type: "hinge", angleRadians: 0.25 } },
    shapeStates: { pawl: shape() },
    anchors: {
      tip: {
        anchor: "tip",
        source: { kind: "shape-landmark", shape: "pawl", landmark: "tip" },
        part: "root",
        world: [0, 1, 0],
        pixel: [160, 75],
        depth: 10,
        projectionVisibility: "in-frame",
      },
    },
    relationships: {},
  };
}

describe("reusable mechanism frame contracts", () => {
  it("admits fractional source frames and rejects legacy writers even when empty", () => {
    expect(
      MechanismFrameRequestV2Schema.parse({
        frame: 0.5,
        width: 320,
        height: 180,
      }).rigControls,
    ).toEqual({});
    expect(
      MechanismFrameRequestV2Schema.safeParse({
        frame: 0,
        width: 320,
        height: 180,
        controls: {},
      }).success,
    ).toBe(false);
  });
  it("requires complete current normalized streams and actual local bounds", () => {
    const input = shape();
    expect(MechanismShapeFrameSchema.safeParse(input).success).toBe(true);
    expect(
      MechanismShapeFrameSchema.safeParse({
        ...input,
        normals: input.normals.slice(3),
      }).success,
    ).toBe(false);
    expect(
      MechanismShapeFrameSchema.safeParse({
        ...input,
        normals: input.normals.map(() => 0),
      }).success,
    ).toBe(false);
    expect(
      MechanismShapeFrameSchema.safeParse({
        ...input,
        bounds: { min: [0, 0, 0], max: [1, 1, 1] },
      }).success,
    ).toBe(false);
  });
  it("keeps explicit generated anchor source and owner identity", () => {
    const input = frame();
    expect(MechanismFrameResultV2Schema.safeParse(input).success).toBe(true);
    expect(
      MechanismFrameResultV2Schema.safeParse({
        ...input,
        anchors: {
          tip: {
            ...input.anchors.tip,
            source: {
              kind: "shape-landmark",
              shape: "pawl",
              landmark: "unknown",
            },
          },
        },
      }).success,
    ).toBe(false);
    expect(
      MechanismFrameResultV2Schema.safeParse({
        ...input,
        shapeStates: {
          pawl: { ...input.shapeStates.pawl, ownerPart: "missing" },
        },
      }).success,
    ).toBe(false);
    expect(
      MechanismFrameResultV2Schema.safeParse({
        ...input,
        rigs: { wrong: input.rigs.hinge },
      }).success,
    ).toBe(false);
  });
  it("does not fabricate pixels for behind-camera anchors or remove clipped projections", () => {
    const input = frame();
    expect(
      MechanismFrameResultV2Schema.safeParse({
        ...input,
        anchors: {
          tip: { ...input.anchors.tip, projectionVisibility: "clipped" },
        },
      }).success,
    ).toBe(true);
    expect(
      MechanismFrameResultV2Schema.safeParse({
        ...input,
        anchors: { tip: { ...input.anchors.tip, pixel: null } },
      }).success,
    ).toBe(false);
    expect(
      MechanismFrameResultV2Schema.safeParse({
        ...input,
        anchors: {
          tip: { ...input.anchors.tip, projectionVisibility: "behind-camera" },
        },
      }).success,
    ).toBe(false);
  });
});
