import { z } from "zod";
import {
  MechanismMeshSchema,
  MechanismShapeFrameSchema,
  MechanismTeachingShapeSchema,
  MechanismUnitAxisV2Schema,
  MechanismVectorSchema,
} from "@still-shift/scene-contract";
import type {
  MechanismMesh,
  MechanismPartFrame,
  MechanismRigFrameV2,
  MechanismKinematicSceneV2,
  MechanismShapeFrame,
  MechanismTeachingShape,
} from "@still-shift/scene-contract";
import type { DeepReadonly } from "./types.ts";
import { MechanismEvaluationErrorV2 } from "./types-v2.ts";
import {
  matrixFromTransform,
  multiplyMatrices,
  transformPoint,
  IDENTITY_MATRIX,
} from "./matrix.ts";
import type { MechanismMatrix } from "./matrix.ts";
import {
  inverseMechanismMatrixV2,
  transformMechanismDirectionV2,
} from "./matrix-v2.ts";
import { normalize, boundsOfPositions } from "./shape-math.ts";
import { createMechanismTeachingTopology } from "./teaching-topology.ts";
import type { MechanismTeachingTopology } from "./teaching-topology.ts";
import { sampleFixedRootPawl } from "./teaching-pawl.ts";
import { sampleSeatedTorsionSpring } from "./teaching-spring.ts";

type Shape = DeepReadonly<MechanismTeachingShape>;
type Scene = DeepReadonly<MechanismKinematicSceneV2>;
const inputsSchema = z.discriminatedUnion("generator", [
  z
    .object({
      generator: z.literal("fixed-root-pawl-curve-1"),
      deflection: z.number().finite().min(0).max(1),
    })
    .strict(),
  z
    .object({
      generator: z.literal("seated-torsion-spring-1"),
      seats: z.tuple([MechanismVectorSchema, MechanismVectorSchema]),
      terminalTangents: z.tuple([
        MechanismUnitAxisV2Schema,
        MechanismUnitAxisV2Schema,
      ]),
    })
    .strict(),
]);
export type TeachingShapeInputs = z.input<typeof inputsSchema>;
export interface PreparedTeachingShape {
  readonly declaration: Shape;
  readonly topology: MechanismTeachingTopology;
}

function fail(
  message: string,
  shape: Shape,
  field: string | readonly (string | number)[],
  code = "mechanism-shape-topology",
): never {
  throw new MechanismEvaluationErrorV2(message, {
    code,
    path: [
      "teachingShapes",
      shape.id,
      ...(typeof field === "string" ? [field] : field),
    ],
  });
}
function arraysEqual(
  left: readonly number[] | undefined,
  right: readonly number[],
) {
  return (
    left !== undefined &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

/** Pure structural/neutral association. Async native IO separately verifies topology SHA. */
export function prepareTeachingShape(
  scene: Scene,
  input: Shape,
): PreparedTeachingShape {
  const prepared = prepareDefinition(input);
  const { declaration, topology } = prepared;
  const mesh = scene.geometry.meshes.find(
    (mesh) => mesh.id === declaration.mesh,
  );
  if (!mesh || mesh.partId !== declaration.ownerPart)
    fail("Shape mesh and owner do not agree", declaration, "mesh");
  if (
    mesh.positions.length !== topology.vertices * 3 ||
    !arraysEqual(mesh.indices, topology.indices) ||
    !arraysEqual(mesh.uvs, topology.uvs)
  )
    fail(
      "Owned mesh must match the closed generator's fixed vertex/index/UV topology",
      declaration,
      "mesh",
    );
  const parts = neutralParts(scene);
  const neutralInputs = teachingShapeInputsForPartsV2(
    declaration,
    scene,
    parts,
    undefined,
  );
  const neutral = evaluateTeachingShape(prepared, neutralInputs);
  if (
    !arraysEqual(mesh.positions, neutral.positions) ||
    !arraysEqual(mesh.normals, neutral.normals)
  )
    fail(
      "Owned mesh must contain this generator's actual neutral positions and normals",
      declaration,
      "mesh",
      "mechanism-shape-neutral",
    );
  return prepared;
}

/** Explicit local-space builder used by asset preparation; no source hash is invented. */
export function createMechanismTeachingMesh(
  input: Shape,
  materialId: string,
  inputs: TeachingShapeInputs,
): MechanismMesh {
  const prepared = prepareDefinition(input);
  const { declaration, topology } = prepared;
  const frame = evaluateTeachingShape(prepared, inputs);
  return MechanismMeshSchema.parse({
    id: declaration.mesh,
    partId: declaration.ownerPart,
    materialId,
    positions: frame.positions,
    normals: frame.normals,
    indices: [...topology.indices],
    uvs: [...topology.uvs],
    bounds: frame.bounds,
  });
}

export function evaluateTeachingShape(
  prepared: PreparedTeachingShape,
  input: TeachingShapeInputs,
): MechanismShapeFrame {
  const inputs = inputsSchema.parse(input);
  const shape = prepared.declaration;
  if (shape.generator !== inputs.generator)
    fail(
      "Input generator must agree with its prepared declaration",
      shape,
      "generator",
      "mechanism-shape-input",
    );
  const sampled =
    shape.generator === "fixed-root-pawl-curve-1" &&
    inputs.generator === "fixed-root-pawl-curve-1"
      ? sampleFixedRootPawl(shape, inputs.deflection)
      : shape.generator === "seated-torsion-spring-1" &&
          inputs.generator === "seated-torsion-spring-1"
        ? sampleSeatedTorsionSpring(
            shape,
            inputs.seats,
            inputs.terminalTangents,
          )
        : undefined;
  if (!sampled)
    fail(
      "Unsupported generator/input association",
      shape,
      "generator",
      "mechanism-shape-input",
    );
  const landmarks = Object.fromEntries(
    prepared.topology.landmarks.map((landmark) => [
      landmark.id,
      [0, 1, 2].map(
        (axis) =>
          landmark.vertexIndices.reduce(
            (sum, vertex) => sum + sampled.positions[vertex * 3 + axis]!,
            0,
          ) / landmark.vertexIndices.length,
      ),
    ]),
  );
  const stateKey =
    inputs.generator === "fixed-root-pawl-curve-1"
      ? `pawl:${inputs.deflection}`
      : `spring:${[...inputs.seats.flat(), ...inputs.terminalTangents.flat()].map((value) => (Object.is(value, -0) ? 0 : value)).join(",")}`;
  return freezeDeep(
    MechanismShapeFrameSchema.parse({
      shape: shape.id,
      mesh: shape.mesh,
      ownerPart: shape.ownerPart,
      topologySha256: shape.topologySha256,
      stateKey,
      ...sampled,
      bounds: boundsOfPositions(sampled.positions),
      landmarks,
    }),
  );
}

/** Seat positions and seat-local tangent directions are posed before sampling. */
export function teachingShapeInputsForPartsV2(
  shape: Shape,
  scene: Scene,
  parts: Readonly<Record<string, MechanismPartFrame>>,
  rigs: Readonly<Record<string, MechanismRigFrameV2>> | undefined,
): TeachingShapeInputs {
  if (shape.generator === "fixed-root-pawl-curve-1") {
    const rig = rigs?.[shape.driver.rig];
    if (rigs !== undefined && (!rig || rig.type !== "ratchet"))
      fail(
        "Pawl requires its ratchet's sampled scalar",
        shape,
        "driver",
        "mechanism-shape-driver",
      );
    return {
      generator: shape.generator,
      deflection: rig?.type === "ratchet" ? rig.pawlDeflection : 0,
    };
  }
  const owner = parts[shape.ownerPart];
  if (!owner)
    fail(
      "Unknown shape owner part",
      shape,
      "ownerPart",
      "mechanism-shape-owner",
    );
  const poses = shape.seats.map((id) => {
    const anchor = scene.anchors.find((anchor) => anchor.id === id);
    if (!anchor || anchor.source.kind !== "part-local")
      fail(
        "Spring seat must be a rigid part-local anchor",
        shape,
        "seats",
        "mechanism-spring-seat",
      );
    const part = parts[anchor.source.part];
    if (!part)
      fail("Unknown spring seat part", shape, "seats", "mechanism-spring-seat");
    const matrix = relativeSeatMatrix(
      shape.ownerPart,
      anchor.source.part,
      scene,
      parts,
    );
    return { position: transformPoint(matrix, anchor.source.position), matrix };
  });
  return {
    generator: shape.generator,
    seats: [poses[0]!.position, poses[1]!.position],
    terminalTangents: [
      normalize(
        transformMechanismDirectionV2(
          poses[0]!.matrix,
          shape.parameters.terminalTangents[0],
        ),
      ),
      normalize(
        transformMechanismDirectionV2(
          poses[1]!.matrix,
          shape.parameters.terminalTangents[1],
        ),
      ),
    ],
  };
}

/** Cancel the shared hierarchy before multiplying; a mount must not perturb local neutral geometry. */
function relativeSeatMatrix(
  owner: string,
  seat: string,
  scene: Scene,
  parts: Readonly<Record<string, MechanismPartFrame>>,
): MechanismMatrix {
  const definitions = new Map(scene.parts.map((part) => [part.id, part]));
  const ownerAncestors = new Set<string>();
  for (
    let id: string | undefined = owner;
    id !== undefined;
    id = definitions.get(id)?.parent
  )
    ownerAncestors.add(id);
  let common: string | undefined = seat;
  while (common !== undefined && !ownerAncestors.has(common))
    common = definitions.get(common)?.parent;
  if (common === undefined)
    return multiplyMatrices(
      inverseMechanismMatrixV2(parts[owner]!.worldMatrix),
      parts[seat]!.worldMatrix,
    );
  function belowCommon(id: string): MechanismMatrix {
    const path: string[] = [];
    while (id !== common) {
      path.push(id);
      id = definitions.get(id)!.parent!;
    }
    let matrix = IDENTITY_MATRIX;
    for (const part of path.reverse())
      matrix = multiplyMatrices(matrix, parts[part]!.localMatrix);
    return matrix;
  }
  const seatMatrix = belowCommon(seat);
  return owner === common
    ? seatMatrix
    : multiplyMatrices(
        inverseMechanismMatrixV2(belowCommon(owner)),
        seatMatrix,
      );
}

function prepareDefinition(input: Shape): PreparedTeachingShape {
  const declaration = MechanismTeachingShapeSchema.parse(input);
  const topology = createMechanismTeachingTopology(declaration);
  for (const landmark of topology.landmarks) {
    const supplied = declaration.landmarks.find(
      (item) => item.id === landmark.id,
    );
    if (!arraysEqual(supplied?.vertexIndices, landmark.vertexIndices))
      fail(
        "Landmark must identify the generator's exact ring membership",
        declaration,
        "landmarks",
      );
  }
  if (declaration.generator === "seated-torsion-spring-1") {
    const { pitch, wireRadius, turns, coilSamples } = declaration.parameters;
    if (pitch <= 2 * wireRadius)
      fail(
        "Adjacent coil turns require clearance exceeding the wire diameter",
        declaration,
        ["parameters", "pitch"],
        "mechanism-spring-clearance",
      );
    if (coilSamples - 1 < Math.ceil(turns * 6))
      fail(
        "Coil sampling requires at least six segments per turn",
        declaration,
        ["parameters", "coilSamples"],
        "mechanism-shape-sampling",
      );
  }
  return freezeDeep({ declaration, topology });
}

function neutralParts(scene: Scene): Record<string, MechanismPartFrame> {
  const definitions = new Map(scene.parts.map((part) => [part.id, part]));
  const parts: Record<string, MechanismPartFrame> = {};
  function resolve(id: string): MechanismPartFrame {
    if (Object.hasOwn(parts, id)) return parts[id]!;
    const part = definitions.get(id)!;
    const localMatrix = matrixFromTransform(part.transform);
    const parent = part.parent === undefined ? undefined : resolve(part.parent);
    const worldMatrix: MechanismMatrix = parent
      ? multiplyMatrices(parent.worldMatrix, localMatrix)
      : localMatrix;
    return (parts[id] = {
      id,
      ...(part.parent === undefined ? {} : { parent: part.parent }),
      localMatrix,
      worldMatrix,
      visible: part.visible && (parent?.visible ?? true),
    });
  }
  for (const part of scene.parts) resolve(part.id);
  return parts;
}

function freezeDeep<T extends object>(root: T): T {
  const pending: object[] = [root];
  while (pending.length) {
    const item = pending.pop()!;
    for (const value of Object.values(item))
      if (
        value !== null &&
        typeof value === "object" &&
        !Object.isFrozen(value)
      )
        pending.push(value);
    Object.freeze(item);
  }
  return root;
}
