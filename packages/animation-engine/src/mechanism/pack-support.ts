import { describeMechanismPackCameras } from "./camera-descriptions.ts";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Matrix4, Vector3 } from "three";
import {
  MechanismSceneV2Schema,
  MechanismPackDocumentSchema,
  MechanismPackMetadataReceiptSchema,
  MechanismTeachingShapeSchema,
  MechanismTransformSchema,
  MechanismPackReferenceSchema,
  type MechanismSceneV2,
  type MechanismSceneV2Input,
  type MechanismPackDocument,
  type MechanismPackMetadataReceipt,
  type MechanismPackReference,
  type MechanismFrameRequestV2,
  type MechanismTeachingShape,
  type MechanismMesh,
} from "@still-shift/scene-contract";
import { canonicalMechanismJson } from "../../../renderer-core/src/mechanism/canonical.ts";
import { prepareMechanismSceneV2 } from "../../../renderer-core/src/mechanism/prepare-v2.ts";
import { evaluateMechanismFrameV2 } from "../../../renderer-core/src/mechanism/evaluate-v2.ts";
import { matrixFromTransform } from "../../../renderer-core/src/mechanism/matrix.ts";
import {
  createMechanismTeachingTopology,
  mechanismTeachingTopologyDocument,
} from "../../../renderer-core/src/mechanism/teaching-topology.ts";
import {
  createMechanismTeachingMesh,
  type TeachingShapeInputs,
} from "../../../renderer-core/src/mechanism/teaching-shapes.ts";
import { MechanismPackInvariantError } from "./pack-invariant.ts";

export const mechanismPackOptions = {
  mount: MechanismTransformSchema.optional(),
  style: z
    .object({
      color: z
        .string()
        .regex(/^#[\da-f]{6}$/i)
        .optional(),
      roughness: z.number().finite().min(0).max(1).optional(),
    })
    .strict()
    .optional(),
  expectedPack: MechanismPackReferenceSchema.optional(),
};
export const mechanismPackHash = (value: unknown) =>
  `sha256:${createHash("sha256").update(canonicalMechanismJson(value)).digest("hex")}`;
export function freezeMechanismPack<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeMechanismPack(child);
    Object.freeze(value);
  }
  return value;
}
type WithoutTeachingProof<T> = T extends unknown
  ? Omit<T, "landmarks" | "topologySha256">
  : never;
type TeachingDeclarationInput = WithoutTeachingProof<
  z.input<typeof MechanismTeachingShapeSchema>
>;
/** The closed neutral mesh is generated before its exact topology declaration is sealed. */
export function createPackTeachingShape(
  input: TeachingDeclarationInput,
  material: string,
  state: TeachingShapeInputs,
) {
  const declaration = MechanismTeachingShapeSchema.parse({
    ...input,
    topologySha256: `sha256:${"0".repeat(64)}`,
    landmarks: createMechanismTeachingTopology(input as MechanismTeachingShape)
      .landmarks,
  });
  const mesh = createMechanismTeachingMesh(declaration, material, state);
  declaration.topologySha256 = mechanismPackHash(
    mechanismTeachingTopologyDocument(declaration, mesh),
  );
  return { declaration, mesh };
}
export function createPackScene(
  input: Omit<
    MechanismSceneV2Input,
    | "schemaVersion"
    | "coordinateSystem"
    | "units"
    | "seed"
    | "geometrySha256"
    | "profile"
    | "lights"
  >,
) {
  return MechanismSceneV2Schema.parse({
    ...input,
    schemaVersion: "mechanism-scene-2",
    coordinateSystem: "right-handed-y-up",
    units: { kind: "illustrative", scaleToMeters: 0.01 },
    seed: 42,
    geometrySha256: mechanismPackHash(input.geometry),
    profile: {
      toneMapping: "aces-filmic",
      exposure: 1,
      output: "srgb-rgba8-straight",
      background: "#e3e1d8",
    },
    lights: [
      {
        id: "key",
        type: "directional",
        position: [4, 7, 9],
        target: [0, 0, 0],
        intensity: 3,
      },
    ],
  });
}
/** Actual default geometry bounds relative to the declared model part, independent of the mount. */
export function mechanismPackBounds(
  scene: MechanismSceneV2,
  boundsPart = "model",
) {
  const matrices = new Map<string, Matrix4>();
  function world(id: string): Matrix4 {
    const existing = matrices.get(id);
    if (existing) return existing;
    const part = scene.parts.find((part) => part.id === id)!;
    const local = new Matrix4().fromArray(matrixFromTransform(part.transform));
    const matrix = part.parent
      ? world(part.parent).clone().multiply(local)
      : local;
    matrices.set(id, matrix);
    return matrix;
  }
  const inverse = world(boundsPart).clone().invert();
  const min: [number, number, number] = [Infinity, Infinity, Infinity],
    max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const mesh of scene.geometry.meshes) {
    const matrix = inverse.clone().multiply(world(mesh.partId));
    for (let offset = 0; offset < mesh.positions.length; offset += 3) {
      const point = new Vector3(
        ...(mesh.positions.slice(offset, offset + 3) as [
          number,
          number,
          number,
        ]),
      )
        .applyMatrix4(matrix)
        .toArray();
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis]!, point[axis]!);
        max[axis] = Math.max(max[axis]!, point[axis]!);
      }
    }
  }
  return { min, max };
}
type PackDescription = Pick<
  MechanismPackDocument,
  | "id"
  | "family"
  | "factualVariant"
  | "parameters"
  | "cameraTargets"
  | "neutralPose"
  | "diagnosticViews"
> & { generatorId: string };
export function createPackMetadata(
  scene: MechanismSceneV2,
  description: PackDescription,
  parameterSchema: unknown,
): MechanismPackMetadataReceipt {
  const { generatorId, ...descriptors } = description;
  const pack = MechanismPackDocumentSchema.parse({
    ...descriptors,
    schemaVersion: "mechanism-pack-1",
    version: "1.0.0",
    status: "candidate",
    generator: {
      id: generatorId,
      version: "1",
      defaultSourceSha256: mechanismPackHash(scene),
      parameterSchemaSha256: mechanismPackHash(parameterSchema),
    },
    coordinateSystem: scene.coordinateSystem,
    units: scene.units,
    bounds: mechanismPackBounds(scene),
    boundsPart: "model",
    parts: scene.parts,
    meshes: scene.geometry.meshes.map((mesh) => ({
      id: mesh.id,
      part: mesh.partId,
      material: mesh.materialId,
      sha256: mechanismPackHash(mesh),
      vertices: mesh.positions.length / 3,
      triangles: mesh.indices.length / 3,
      bounds: mesh.bounds,
    })),
    materialSlots: scene.geometry.materials.map((material) => ({
      id: material.id,
      description: material.id,
    })),
    anchors: scene.anchors,
    rigs: scene.rigs,
    relationships: scene.relationships,
    teachingShapes: scene.teachingShapes.map((shape) => ({
      id: shape.id,
      generator: shape.generator,
      mesh: shape.mesh,
      ownerPart: shape.ownerPart,
      topologySha256: shape.topologySha256,
      declarationSha256: mechanismPackHash(shape),
      landmarks: shape.landmarks.map((landmark) => ({
        id: landmark.id,
        vertices: landmark.vertexIndices.length,
      })),
      ...(shape.generator === "fixed-root-pawl-curve-1"
        ? { driver: shape.driver }
        : { seats: shape.seats }),
    })),
    details: [
      {
        id: "teaching",
        description:
          "Closed illustrative geometry with explicit mechanism relationships; no simulation claim.",
      },
    ],
    variants: [{ id: description.factualVariant.id, details: ["teaching"] }],
    thumbnail: {
      kind: "native-preview-recipe",
      cameraTarget: "recognition",
      sourceFrame: 0,
      width: 640,
      height: 360,
    },
    compatibility: {
      sceneVersion: "mechanism-scene-2",
      nativeFrameVersion: "native3d-frame-2",
      backend: "webgl2",
    },
  });
  return freezeMechanismPack(
    MechanismPackMetadataReceiptSchema.parse({
      schemaVersion: "mechanism-pack-metadata-1",
      sha256: mechanismPackHash(pack),
      pack,
    }),
  );
}
export function createPackInstance<P>(
  scene: MechanismSceneV2,
  receipt: MechanismPackMetadataReceipt,
  parameters: P,
  expected?: MechanismPackReference,
) {
  const reference = {
    id: receipt.pack.id,
    version: receipt.pack.version,
    sha256: receipt.sha256,
    variant: receipt.pack.factualVariant.id,
    detail: "teaching",
  };
  if (
    expected &&
    canonicalMechanismJson(expected) !== canonicalMechanismJson(reference)
  )
    throw new MechanismPackInvariantError(
      "Pack revision, variant or detail differs from the expected reference",
      {
        code: "mechanism-pack-revision",
        path: ["expectedPack"],
        pack: reference,
      },
    );
  const source = MechanismSceneV2Schema.parse({ ...scene, pack: reference });
  return freezeMechanismPack({
    version: "mechanism-pack-instance-1" as const,
    pack: reference,
    parameters,
    scene: source,
    sourceSha256: mechanismPackHash(source),
    meshDataSha256: mechanismPackHash({ meshes: source.geometry.meshes }),
    bounds: mechanismPackBounds(source),
    cameraTargets: describeMechanismPackCameras(source, receipt.pack.family),
    cameraTargetsSha256: mechanismPackHash(
      describeMechanismPackCameras(source, receipt.pack.family),
    ),
  });
}
export interface MechanismPackInstanceSource {
  pack: MechanismPackReference;
  scene: MechanismSceneV2;
  sourceSha256: string;
}
/** Reports measurements for inactive contacts and rejects only required relationships. */
export function evaluatePackFrame(
  instance: MechanismPackInstanceSource,
  request: MechanismFrameRequestV2,
) {
  if (mechanismPackHash(instance.scene) !== instance.sourceSha256)
    throw new MechanismPackInvariantError("Pack source identity changed", {
      code: "mechanism-pack-revision",
      path: ["sourceSha256"],
      pack: instance.pack,
    });
  const frame = evaluateMechanismFrameV2(
    prepareMechanismSceneV2(instance.scene),
    request,
  );
  for (const relation of Object.values(frame.relationships))
    if (relation.required && relation.residual > relation.tolerance) {
      const source = instance.scene.relationships.find(
        (source) => source.id === relation.id,
      )!;
      const pair =
        source.type === "engagement"
          ? [source.pawlTip, source.toothDatum]
          : source.anchors;
      throw new MechanismPackInvariantError(
        "Required pack relationship failed",
        {
          code: "mechanism-pack-invariant",
          path: ["relationships", relation.id],
          frame: frame.frame,
          pack: instance.pack,
          relationship: relation.id,
          ...(source.type === "engagement" ? { rig: source.rig } : {}),
          parts: pair.map((id) => frame.anchors[id]!.part),
        },
      );
    }
  return {
    method: "pure-expected-state" as const,
    frame,
    check: {
      version: "mechanism-pack-frame-check-1" as const,
      frame: frame.frame,
      pack: instance.pack,
      status: "passed" as const,
    },
  };
}
/** Rigid mesh placement is baked into local buffers before the scene/hash is constructed. */
export function offsetPackMesh(
  mesh: MechanismMesh,
  offset: [number, number, number],
): MechanismMesh {
  return {
    ...mesh,
    positions: mesh.positions.map((value, index) => value + offset[index % 3]!),
    bounds: {
      min: mesh.bounds.min.map((value, axis) => value + offset[axis]!) as [
        number,
        number,
        number,
      ],
      max: mesh.bounds.max.map((value, axis) => value + offset[axis]!) as [
        number,
        number,
        number,
      ],
    },
  };
}
