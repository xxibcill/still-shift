import { describe, expect, it } from "vitest";
import {
  MECHANISM_TEACHING_SHAPE_LIMITS,
  MechanismTeachingShapeSchema,
} from "@still-shift/scene-contract";

const identity = {
  id: "shape",
  mesh: "mesh",
  ownerPart: "body",
  topologySha256: `sha256:${"a".repeat(64)}`,
};
const pawl = {
  ...identity,
  generator: "fixed-root-pawl-curve-1",
  landmarks: [
    { id: "root", vertexIndices: [0, 1, 2, 3] },
    { id: "tip", vertexIndices: [4, 5, 6, 7] },
  ],
  driver: { rig: "latch", channel: "pawlDeflection" },
  parameters: {
    length: 10,
    width: 2,
    thickness: 0.5,
    maxDeflection: 2,
    longitudinalSegments: 8,
  },
};
const spring = {
  ...identity,
  generator: "seated-torsion-spring-1",
  landmarks: ["seat-a", "seat-b", "coil-a", "coil-b"].map((id, ring) => ({
    id,
    vertexIndices: Array.from({ length: 8 }, (_, index) => ring * 8 + index),
  })),
  seats: ["jaw.seat", "body.seat"],
  parameters: {
    coilCenter: [0, 0, 0],
    axis: [1, 0, 0],
    coilRadius: 2,
    wireRadius: 0.2,
    turns: 2,
    pitch: 0.6,
    coilSamples: 64,
    legSamples: 8,
    tubeSides: 8,
    terminalTangents: [
      [0, 1, 0],
      [0, -1, 0],
    ],
  },
};

describe("closed teaching-shape declarations", () => {
  it("admits the two declared generators without arbitrary vertex callbacks", () => {
    expect(MechanismTeachingShapeSchema.safeParse(pawl).success).toBe(true);
    expect(MechanismTeachingShapeSchema.safeParse(spring).success).toBe(true);
    expect(
      MechanismTeachingShapeSchema.safeParse({
        ...pawl,
        generator: "arbitrary-morph",
      }).success,
    ).toBe(false);
    expect(
      MechanismTeachingShapeSchema.safeParse({ ...pawl, callback: "animate" })
        .success,
    ).toBe(false);
  });
  it("requires unique closed landmark IDs and vertex membership", () => {
    expect(
      MechanismTeachingShapeSchema.safeParse({
        ...pawl,
        landmarks: [pawl.landmarks[0], pawl.landmarks[0]],
      }).success,
    ).toBe(false);
    expect(
      MechanismTeachingShapeSchema.safeParse({
        ...pawl,
        landmarks: [{ id: "root", vertexIndices: [0, 0] }, pawl.landmarks[1]],
      }).success,
    ).toBe(false);
  });
  it("rejects excessive pawl deformation", () => {
    expect(
      MechanismTeachingShapeSchema.safeParse({
        ...pawl,
        parameters: { ...pawl.parameters, maxDeflection: 6 },
      }).success,
    ).toBe(false);
  });
  it("requires two seats, unit tangents and complete spring rings", () => {
    expect(
      MechanismTeachingShapeSchema.safeParse({
        ...spring,
        seats: ["same", "same"],
      }).success,
    ).toBe(false);
    expect(
      MechanismTeachingShapeSchema.safeParse({
        ...spring,
        parameters: {
          ...spring.parameters,
          terminalTangents: [
            [0, 2, 0],
            [0, -1, 0],
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      MechanismTeachingShapeSchema.safeParse({
        ...spring,
        landmarks: spring.landmarks.map((landmark) => ({
          ...landmark,
          vertexIndices: [0],
        })),
      }).success,
    ).toBe(false);
  });
  it("keeps the frozen changing-stream and centerline caps", () => {
    expect(MECHANISM_TEACHING_SHAPE_LIMITS).toEqual({
      meshes: 4,
      streams: 8,
      vertices: 4096,
      triangles: 8192,
      scalarChannels: 8,
      centerlineSamples: 128,
      tubeSides: 8,
    });
    expect(
      MechanismTeachingShapeSchema.safeParse({
        ...spring,
        parameters: { ...spring.parameters, coilSamples: 96, legSamples: 17 },
      }).success,
    ).toBe(false);
    expect(
      MechanismTeachingShapeSchema.safeParse({
        ...spring,
        parameters: { ...spring.parameters, tubeSides: 9 },
      }).success,
    ).toBe(false);
  });
});
