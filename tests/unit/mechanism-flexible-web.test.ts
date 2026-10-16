import { describe, it, expect } from "vitest";
import {
  MechanismTeachingShapeSchema,
  NativeShapeAssociationSchema,
} from "@still-shift/scene-contract";
import {
  createPackTeachingShape,
  createPackScene,
} from "../../packages/animation-engine/src/mechanism/pack-support.ts";
import { createMechanismTeachingTopology } from "../../packages/renderer-core/src/mechanism/teaching-topology.ts";
import { sampleSeatedFlexibleWeb } from "../../packages/renderer-core/src/mechanism/teaching-web.ts";
import { prepareMechanismSceneV2 } from "../../packages/renderer-core/src/mechanism/prepare-v2.ts";
import { evaluateMechanismFrameV2 } from "../../packages/renderer-core/src/mechanism/evaluate-v2.ts";
import { prepareNativeShapeAssociations } from "../../packages/renderer-core/src/native3d/shape-associations.ts";
import type { MechanismVector } from "@still-shift/scene-contract";
const recipe = {
  id: "web",
  mesh: "web.mesh",
  ownerPart: "model",
  generator: "seated-flexible-web-1" as const,
  seats: ["root.seat", "moving.seat"] as [string, string],
  parameters: {
    width: 0.4,
    thickness: 0.03,
    widthAxis: [0, 0, 1] as MechanismVector,
    minSpan: 0.3,
    maxSpan: 1.3,
    longitudinalSegments: 16,
    terminalTangents: [
      [1, 0, 0],
      [1, 0, 0],
    ] as [MechanismVector, MechanismVector],
  },
};
function fixture() {
  const generated = createPackTeachingShape(recipe, "nylon", {
    generator: recipe.generator,
    seats: [
      [0, 0, 0],
      [1, 0, 0],
    ],
    terminalTangents: recipe.parameters.terminalTangents,
  });
  const scene = createPackScene({
    id: "web-fixture",
    geometry: {
      schemaVersion: "solid-geometry-1",
      meshes: [generated.mesh],
      materials: [
        { id: "nylon", color: "#c5b992", roughness: 0.6, metalness: 0 },
      ],
    },
    parts: [
      { id: "model" },
      { id: "moving", parent: "model", transform: { position: [1, 0, 0] } },
    ],
    teachingShapes: [generated.declaration],
    rigs: [
      {
        id: "shift",
        type: "slider",
        movingPart: "moving",
        referencePart: "model",
        axis: [0, 1, 0],
        range: [0, 0.25],
        neutral: 0,
      },
    ],
    anchors: [
      {
        id: "root.seat",
        role: "seat",
        source: { kind: "part-local", part: "model", position: [0, 0, 0] },
      },
      {
        id: "moving.seat",
        role: "seat",
        source: { kind: "part-local", part: "moving", position: [0, 0, 0] },
      },
    ],
    camera: {
      position: [0, 2, 5],
      target: [0, 0, 0],
      fovDegrees: 40,
      near: 0.1,
      far: 100,
    },
  });
  return { generated, scene };
}
function closed(positions: readonly number[], indices: readonly number[]) {
  const edges = new Map<string, number>();
  for (let i = 0; i < indices.length; i += 3)
    for (let side = 0; side < 3; side++) {
      const vertices = [indices[i + side]!, indices[i + ((side + 1) % 3)]!].map(
        (v) =>
          positions
            .slice(v * 3, v * 3 + 3)
            .map((n) => n.toPrecision(14))
            .join(","),
      );
      const key = vertices.sort().join("|");
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  expect([...edges.values()].every((n) => n === 2)).toBe(true);
}
describe("two-seat flexible web", () => {
  it("keeps one closed topology, complete end rings and unit normals across a moving clamp", () => {
    const { generated } = fixture();
    const shape = generated.declaration;
    if (shape.generator !== recipe.generator) throw Error("web required");
    const topology = createMechanismTeachingTopology(shape);
    expect(topology.landmarks.map((l) => l.id)).toEqual(["seat-a", "seat-b"]);
    for (let i = 0; i <= 20; i++) {
      const y = i / 80,
        angle = i / 200;
      const sampled = sampleSeatedFlexibleWeb(
        shape,
        [
          [0, 0, 0],
          [1, y, 0],
        ],
        [
          [1, 0, 0],
          [Math.cos(angle), Math.sin(angle), 0],
        ],
      );
      closed(sampled.positions, topology.indices);
      expect(sampled.positions.length / 3).toBe(topology.vertices);
      for (let j = 0; j < sampled.normals.length; j += 3)
        expect(Math.hypot(...sampled.normals.slice(j, j + 3))).toBeCloseTo(
          1,
          12,
        );
      for (const [ring, expected] of [
        [0, [0, 0, 0]],
        [16, [1, y, 0]],
      ] as const)
        for (let axis = 0; axis < 3; axis++)
          expect(
            [0, 1, 2, 3].reduce(
              (v, k) => v + sampled.positions[ring * 12 + k * 3 + axis]!,
              0,
            ) / 4,
          ).toBeCloseTo(expected[axis]!, 12);
    }
  });
  it("binds both generated endpoints to posed seats and cancels an arbitrary mount", () => {
    const { scene } = fixture();
    const prepared = prepareMechanismSceneV2(scene);
    for (const frame of [0, 5, 10, 5, 0]) {
      const value = frame / 40;
      const sampled = evaluateMechanismFrameV2(prepared, {
        frame,
        width: 320,
        height: 180,
        rigControls: { shift: { type: "slider", value } },
      });
      expect(sampled.shapeStates.web!.landmarks["seat-a"]).toEqual([0, 0, 0]);
      expect(sampled.shapeStates.web!.landmarks["seat-b"]![1]).toBeCloseTo(
        value,
        12,
      );
    }
    const mounted = structuredClone(scene);
    mounted.parts.unshift({
      id: "mount",
      visible: true,
      transform: {
        position: [3, -2, 4],
        rotation: [0.3, -0.2, 0.5],
        scale: [2, 2, 2],
        pivot: [0, 0, 0],
      },
    });
    mounted.parts.find((p) => p.id === "model")!.parent = "mount";
    const a = evaluateMechanismFrameV2(prepared, {
      frame: 7,
      width: 320,
      height: 180,
      rigControls: { shift: { type: "slider", value: 0.15 } },
    });
    const b = evaluateMechanismFrameV2(prepareMechanismSceneV2(mounted), {
      frame: 7,
      width: 320,
      height: 180,
      rigControls: { shift: { type: "slider", value: 0.15 } },
    });
    for (const stream of ["positions", "normals"] as const)
      b.shapeStates.web![stream].forEach((value, index) =>
        expect(value).toBeCloseTo(a.shapeStates.web![stream][index]!, 12),
      );
    for (const seat of ["seat-a", "seat-b"])
      b.shapeStates.web!.landmarks[seat]!.forEach((value, axis) =>
        expect(value).toBeCloseTo(
          a.shapeStates.web!.landmarks[seat]![axis]!,
          12,
        ),
      );
  });
  it("rejects nonplanar, collapsed, out-of-range and reverse-facing clamps with located errors", () => {
    const { generated } = fixture();
    const shape = generated.declaration;
    if (shape.generator !== recipe.generator) throw Error("web required");
    for (const seats of [
      [
        [0, 0, 0],
        [0.1, 0, 0],
      ],
      [
        [0, 0, 0],
        [2, 0, 0],
      ],
      [
        [0, 0, 0],
        [1, 0, 0.2],
      ],
    ] as [MechanismVector, MechanismVector][])
      expect(() =>
        sampleSeatedFlexibleWeb(shape, seats, [
          [1, 0, 0],
          [1, 0, 0],
        ]),
      ).toThrow(/span|plane/);
    expect(() =>
      sampleSeatedFlexibleWeb(
        shape,
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
        [
          [1, 0, 0],
          [-1, 0, 0],
        ],
      ),
    ).toThrow(/advance/);
    expect(
      MechanismTeachingShapeSchema.safeParse({
        ...shape,
        seats: ["same", "same"],
      }).success,
    ).toBe(false);
    expect(
      MechanismTeachingShapeSchema.safeParse({
        ...shape,
        parameters: { ...shape.parameters, thickness: 0.1, minSpan: 0.3 },
      }).success,
    ).toBe(false);
    expect(
      MechanismTeachingShapeSchema.safeParse({
        ...shape,
        landmarks: [
          ...shape.landmarks,
          { id: "coil-a", vertexIndices: [0, 1, 2, 3] },
        ],
      }).success,
    ).toBe(false);
  });
  it("seals the native generator identity and rejects pawl-only trigger metadata", async () => {
    const { scene } = fixture();
    const associations = await prepareNativeShapeAssociations(scene);
    expect(associations.web!.generator).toBe(recipe.generator);
    expect(
      NativeShapeAssociationSchema.safeParse({
        ...associations.web,
        triggerLandmark: true,
      }).success,
    ).toBe(false);
  });
});
