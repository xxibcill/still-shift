import { describe, expect, it } from "vitest";
import { prepareMechanismSceneV2 } from "../../packages/renderer-core/src/mechanism/prepare-v2.ts";
import { evaluateMechanismFrameV2 } from "../../packages/renderer-core/src/mechanism/evaluate-v2.ts";
import {
  createMechanismTeachingMesh,
  teachingShapeInputsForPartsV2,
} from "../../packages/renderer-core/src/mechanism/teaching-shapes.ts";
import { createMechanismTeachingTopology } from "../../packages/renderer-core/src/mechanism/teaching-topology.ts";
import { mechanismV2Fixture } from "../helpers/mechanism-v2-fixture.ts";
import {
  transformPoint,
  matrixFromTransform,
  multiplyMatrices,
  IDENTITY_MATRIX,
} from "../../packages/renderer-core/src/mechanism/matrix.ts";
import {
  inverseMechanismMatrixV2,
  rotationAroundAxisV2,
} from "../../packages/renderer-core/src/mechanism/matrix-v2.ts";
import { MechanismEvaluationErrorV2 } from "../../packages/renderer-core/src/mechanism/types-v2.ts";

const request = (frame: number) => ({ frame, width: 320, height: 180 });
function expectVector(
  actual: readonly number[],
  expected: readonly number[],
  tolerance = 1e-10,
) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, axis) =>
    expect(Math.abs(value - expected[axis]!)).toBeLessThan(tolerance),
  );
}
function location(input: unknown) {
  try {
    prepareMechanismSceneV2(input);
  } catch (error) {
    expect(error).toBeInstanceOf(MechanismEvaluationErrorV2);
    return (error as MechanismEvaluationErrorV2).location;
  }
  throw new Error("Expected rejection");
}

describe("closed posed teaching-shape evaluation", () => {
  it("prepares actual generated neutral indexed geometry without an invented hash check", () => {
    const source = mechanismV2Fixture();
    const prepared = prepareMechanismSceneV2(source);
    const evaluated = evaluateMechanismFrameV2(prepared, request(0));
    for (const shape of source.teachingShapes) {
      const mesh = source.geometry.meshes.find(
        (mesh) => mesh.id === shape.mesh,
      )!;
      expect(evaluated.shapeStates[shape.id]!.positions).toEqual(
        mesh.positions,
      );
      expect(evaluated.shapeStates[shape.id]!.normals).toEqual(mesh.normals);
    }
    expect(Object.isFrozen(prepared.scene)).toBe(true);
    expect(Object.isFrozen(evaluated.shapeStates.pawl!.positions)).toBe(true);
  });
  it("retains every pawl root vertex/normal while moving its tip from the ratchet scalar", () => {
    const prepared = prepareMechanismSceneV2(mechanismV2Fixture());
    const neutral = evaluateMechanismFrameV2(prepared, request(0));
    const moved = evaluateMechanismFrameV2(prepared, {
      ...request(0.5),
      rigControls: {
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
      },
    });
    expect(moved.shapeStates.pawl!.positions.slice(0, 12)).toEqual(
      neutral.shapeStates.pawl!.positions.slice(0, 12),
    );
    expect(moved.shapeStates.pawl!.normals.slice(0, 12)).toEqual(
      neutral.shapeStates.pawl!.normals.slice(0, 12),
    );
    expect(moved.shapeStates.pawl!.positions.slice(-24, -12)).toEqual(
      neutral.shapeStates.pawl!.positions.slice(-24, -12),
    );
    expect(moved.shapeStates.pawl!.normals.slice(-24, -12)).toEqual(
      neutral.shapeStates.pawl!.normals.slice(-24, -12),
    );
    expectVector(moved.anchors["pawl.root"]!.world, [0, 0, 0]);
    expectVector(moved.anchors["pawl.tip"]!.world, [10, 2, 0]);
    expect(moved.shapeStates.pawl!.normals).not.toEqual(
      neutral.shapeStates.pawl!.normals,
    );
  });
  it("poses both spring seat rings and terminal normals from their rigid seat parts", () => {
    const prepared = prepareMechanismSceneV2(mechanismV2Fixture());
    const moved = evaluateMechanismFrameV2(prepared, {
      ...request(1),
      rigControls: { hinge: { type: "hinge", value: Math.PI / 2 } },
    });
    expectVector(moved.anchors["seat.b"]!.world, [0, 4, 0]);
    expectVector(moved.anchors["spring.seat.b"]!.world, [0, 4, 0]);
    expect(moved.relationships["seat.contact"]!.residual).toBeLessThan(1e-10);
    const normals = moved.shapeStates.spring!.normals;
    for (let offset = normals.length - 24; offset < normals.length; offset += 3)
      expectVector(normals.slice(offset, offset + 3), [0, 1, 0]);
    expectVector(moved.anchors["jaw.point"]!.world, [0, 1, 0]);
  });
  it("rejects swapped topology, arbitrary landmark rings and altered neutral geometry", () => {
    const source = mechanismV2Fixture();
    const wrongIndices = structuredClone(source);
    const mesh = wrongIndices.geometry.meshes.find(
      (mesh) => mesh.id === "pawl.mesh",
    )!;
    [mesh.indices[0], mesh.indices[1]] = [mesh.indices[1]!, mesh.indices[0]!];
    expect(location(wrongIndices)).toMatchObject({
      code: "mechanism-shape-topology",
      path: ["teachingShapes", "pawl", "mesh"],
    });
    const wrongRing = structuredClone(source);
    wrongRing.teachingShapes[0]!.landmarks[0]!.vertexIndices = [
      ...wrongRing.teachingShapes[0]!.landmarks[1]!.vertexIndices,
    ];
    expect(location(wrongRing)).toMatchObject({
      code: "mechanism-shape-topology",
      path: ["teachingShapes", "pawl", "landmarks"],
    });
    const wrongNeutral = structuredClone(source);
    const normalMesh = wrongNeutral.geometry.meshes.find(
      (mesh) => mesh.id === "pawl.mesh",
    )!;
    normalMesh.normals.splice(0, 3, 0, 0, 1);
    expect(location(wrongNeutral)).toMatchObject({
      code: "mechanism-shape-neutral",
      path: ["teachingShapes", "pawl", "mesh"],
    });
  });
  it("rejects coil wire overlap, undersampling and a missing live pawl driver", () => {
    const source = mechanismV2Fixture();
    const spring = source.teachingShapes.find(
      (shape) => shape.generator === "seated-torsion-spring-1",
    )!;
    if (spring.generator !== "seated-torsion-spring-1")
      throw Error("Fixture shape");
    spring.parameters.pitch = 0.3;
    expect(location(source)).toMatchObject({
      code: "mechanism-spring-clearance",
      path: ["teachingShapes", "spring", "parameters", "pitch"],
    });
    const sparse = {
      ...spring,
      parameters: { ...spring.parameters, pitch: 0.6, coilSamples: 8 },
    };
    sparse.landmarks = [
      ...createMechanismTeachingTopology(sparse).landmarks,
    ].map((landmark) => ({
      ...landmark,
      vertexIndices: [...landmark.vertexIndices],
    }));
    try {
      createMechanismTeachingMesh(sparse, "paint", {
        generator: "seated-torsion-spring-1",
        seats: [
          [-4, 0, 0],
          [4, 0, 0],
        ],
        terminalTangents: [
          [1, 0, 0],
          [1, 0, 0],
        ],
      });
      throw Error("Expected sparse rejection");
    } catch (error) {
      expect((error as MechanismEvaluationErrorV2).location).toMatchObject({
        code: "mechanism-shape-sampling",
        path: ["teachingShapes", "spring", "parameters", "coilSamples"],
      });
    }
    const valid = mechanismV2Fixture();
    const pawl = valid.teachingShapes[0]!;
    const frame = evaluateMechanismFrameV2(
      prepareMechanismSceneV2(valid),
      request(0),
    );
    expect(() =>
      teachingShapeInputsForPartsV2(pawl, valid, frame.parts, {}),
    ).toThrow(MechanismEvaluationErrorV2);
  });
  it("uses a declared sibling reference frame instead of the moving part's own axes", () => {
    const source = mechanismV2Fixture();
    source.parts.push({
      id: "reference",
      parent: "root",
      visible: true,
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, Math.PI / 2],
        scale: [1, 1, 1],
        pivot: [0, 0, 0],
      },
    });
    const slider = source.rigs.find((rig) => rig.id === "slide")!;
    if (slider.type !== "slider") throw Error("Fixture rig");
    slider.referencePart = "reference";
    const moved = evaluateMechanismFrameV2(prepareMechanismSceneV2(source), {
      ...request(0),
      rigControls: { slide: { type: "slider", value: 3 } },
    });
    expectVector(moved.anchors["child.origin"]!.world, [0, 3, 0]);
    expectVector(
      transformPoint(moved.parts.child!.localMatrix, [0, 0, 0]),
      [0, 3, 0],
    );
  });
  it("enforces the total scalar-channel budget and normalized tooth inventory", () => {
    const source = mechanismV2Fixture();
    source.rigs = source.rigs.filter((rig) => rig.type !== "spring-return");
    for (let index = 0; index < 5; index++) {
      const id = `extra${index}`;
      source.parts.push({ ...source.parts[1]!, id });
      source.rigs.push({
        id,
        type: "slider",
        movingPart: id,
        referencePart: "root",
        axis: [1, 0, 0],
        range: [0, 1],
        neutral: 0,
      });
    }
    expect(location(source)).toMatchObject({
      code: "mechanism-shape-limit",
      path: ["rigs"],
    });
    const imprecise = mechanismV2Fixture();
    const rig = imprecise.rigs.find((rig) => rig.type === "ratchet")!;
    if (rig.type !== "ratchet") throw Error("Fixture rig");
    rig.pitch = 1e-6;
    rig.range = [0, 4e-6 + 1e-9];
    expect(location(imprecise)).toMatchObject({
      code: "mechanism-ratchet-pitch",
      path: ["rigs", 3, "range"],
    });
  });
  it("evaluates a valid constructor part ID without inventing an inherited rig", () => {
    const source = mechanismV2Fixture();
    source.parts.push({ ...source.parts[1]!, id: "constructor" });
    const evaluated = evaluateMechanismFrameV2(
      prepareMechanismSceneV2(source),
      request(0),
    );
    expect(evaluated.parts.constructor).toMatchObject({
      id: "constructor",
      visible: true,
    });
  });
  it("measures seated engagement without treating advancing contact evidence as a pass flag", () => {
    const prepared = prepareMechanismSceneV2(mechanismV2Fixture());
    const seated = evaluateMechanismFrameV2(prepared, {
      ...request(1),
      rigControls: {
        latch: {
          type: "ratchet",
          position: { value: 1 },
          latchKeys: [{ frame: 0, state: "engaged" }],
        },
      },
    });
    expect(seated.relationships.engagement!.residual).toBeLessThan(1e-10);
    const advancing = evaluateMechanismFrameV2(prepared, {
      ...request(0.5),
      rigControls: {
        latch: {
          type: "ratchet",
          position: { value: 0.5 },
          latchKeys: [{ frame: 0, state: "engaged" }],
        },
      },
    });
    expect(advancing.relationships.engagement!.residual).toBeGreaterThan(1);
    expect(advancing.relationships.engagement).not.toHaveProperty("passed");
  });
  it("keeps generated buffers and anchor state independent of seek order", () => {
    const prepared = prepareMechanismSceneV2(mechanismV2Fixture());
    const controls = {
      hinge: {
        type: "hinge" as const,
        keys: [
          { frame: 0, value: 0 },
          { frame: 4, value: Math.PI / 4 },
        ],
      },
      latch: {
        type: "ratchet" as const,
        position: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 4, value: 4 },
          ],
        },
        latchKeys: [{ frame: 0, state: "engaged" as const }],
      },
    };
    const frames = [0, 0.25, 0.5, 1, 2, 3.75, 4];
    const expected = new Map(
      frames.map((frame) => [
        frame,
        evaluateMechanismFrameV2(prepared, {
          ...request(frame),
          rigControls: controls,
        }),
      ]),
    );
    for (const frame of [...frames].reverse())
      expect(
        evaluateMechanismFrameV2(prepared, {
          ...request(frame),
          rigControls: controls,
        }),
      ).toEqual(expected.get(frame));
    for (const frame of [3.75, 0, 4, 1, 0.25, 2, 0.5])
      expect(
        evaluateMechanismFrameV2(prepared, {
          ...request(frame),
          rigControls: controls,
        }),
      ).toEqual(expected.get(frame));
  });
  it("projects the current generated tip, hides inherited anchors and rejects unknown hidden parts", () => {
    const prepared = prepareMechanismSceneV2(mechanismV2Fixture());
    const moved = evaluateMechanismFrameV2(prepared, {
      ...request(0),
      rigControls: {
        latch: {
          type: "ratchet",
          position: { value: 0.5 },
          latchKeys: [{ frame: 0, state: "engaged" }],
        },
      },
    });
    expect(moved.anchors["pawl.tip"]!.pixel![1]).toBeLessThan(90);
    const hidden = evaluateMechanismFrameV2(prepared, {
      ...request(0),
      hiddenParts: ["root"],
    });
    expect(hidden.parts.jaw!.visible).toBe(false);
    expect(hidden.anchors["spring.seat.b"]!.projectionVisibility).toBe(
      "hidden-part",
    );
    expect(() =>
      evaluateMechanismFrameV2(prepared, {
        ...request(0),
        hiddenParts: ["missing"],
      }),
    ).toThrow(MechanismEvaluationErrorV2);
  });
});

describe("generic mechanism affine/reference math", () => {
  it("inverts arbitrary positive scale/rotation/pivot transforms", () => {
    const matrix = matrixFromTransform({
      position: [3, -2, 7],
      rotation: [0.3, -0.7, 0.2],
      scale: [2, 3, 0.5],
      pivot: [1, 2, -1],
    });
    expectVector(
      multiplyMatrices(inverseMechanismMatrixV2(matrix), matrix),
      IDENTITY_MATRIX,
    );
    expectVector(
      transformPoint(
        inverseMechanismMatrixV2(matrix),
        transformPoint(matrix, [2, 4, -6]),
      ),
      [2, 4, -6],
    );
  });
  it("rotates a point around an arbitrary unit axis and preserves its pivot", () => {
    const rotation = rotationAroundAxisV2([0, 0, 1], Math.PI / 2, [2, 3, 0]);
    expectVector(transformPoint(rotation, [3, 3, 0]), [2, 4, 0]);
    expectVector(transformPoint(rotation, [2, 3, 0]), [2, 3, 0]);
  });
});
