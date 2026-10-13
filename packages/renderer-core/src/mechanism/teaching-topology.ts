import type {
  MechanismMesh,
  MechanismShapeLandmark,
  MechanismTeachingShape,
} from "@still-shift/scene-contract";
import type { DeepReadonly } from "./types.ts";

type Shape = DeepReadonly<MechanismTeachingShape>;
export type MechanismTeachingRecipe =
  | Pick<
      Extract<Shape, { generator: "fixed-root-pawl-curve-1" }>,
      "generator" | "parameters"
    >
  | Pick<
      Extract<Shape, { generator: "seated-torsion-spring-1" }>,
      "generator" | "parameters"
    >
  | Pick<
      Extract<Shape, { generator: "seated-flexible-web-1" }>,
      "generator" | "parameters"
    >;
export interface MechanismTeachingTopology {
  readonly vertices: number;
  readonly indices: readonly number[];
  readonly uvs: readonly number[];
  readonly landmarks: DeepReadonly<MechanismShapeLandmark[]>;
}

/** Closed, capped topology. Positions and normals are the only changing streams. */
export function createMechanismTeachingTopology(
  recipe: MechanismTeachingRecipe,
): MechanismTeachingTopology {
  const pawl = recipe.generator === "fixed-root-pawl-curve-1";
  const web = recipe.generator === "seated-flexible-web-1";
  const rings = pawl
    ? recipe.parameters.longitudinalSegments +
      1 +
      (recipe.parameters.trigger?.segments ?? 0)
    : web
      ? recipe.parameters.longitudinalSegments + 1
      : recipe.parameters.coilSamples + 2 * recipe.parameters.legSamples;
  const sides = pawl || web ? 4 : recipe.parameters.tubeSides;
  const indices: number[] = [],
    uvs: number[] = [];
  for (let ring = 0; ring < rings; ring++) {
    for (let side = 0; side < sides; side++) {
      uvs.push(side / sides, ring / (rings - 1));
      if (ring + 1 < rings) {
        const a = ring * sides + side,
          b = ring * sides + ((side + 1) % sides);
        indices.push(a, b, a + sides, b, b + sides, a + sides);
      }
    }
  }
  for (let cap = 0; cap < 2; cap++) {
    const offset = rings * sides + cap * sides;
    for (let side = 0; side < sides; side++) {
      const angle = (2 * Math.PI * side) / sides;
      uvs.push((Math.cos(angle) + 1) / 2, (Math.sin(angle) + 1) / 2);
      if (side > 0 && side + 1 < sides) {
        indices.push(
          ...(cap === 0
            ? [offset, offset + side + 1, offset + side]
            : [offset, offset + side, offset + side + 1]),
        );
      }
    }
  }
  const ringIndices = (ring: number) =>
    Array.from({ length: sides }, (_, side) => ring * sides + side);
  const landmarks: MechanismShapeLandmark[] = pawl
    ? [
        { id: "root", vertexIndices: ringIndices(0) },
        {
          id: "tip",
          vertexIndices: ringIndices(recipe.parameters.longitudinalSegments),
        },
        ...(recipe.parameters.trigger
          ? [{ id: "trigger" as const, vertexIndices: ringIndices(rings - 1) }]
          : []),
      ]
    : web
      ? [
          { id: "seat-a", vertexIndices: ringIndices(0) },
          { id: "seat-b", vertexIndices: ringIndices(rings - 1) },
        ]
      : [
          { id: "seat-a", vertexIndices: ringIndices(0) },
          { id: "seat-b", vertexIndices: ringIndices(rings - 1) },
          {
            id: "coil-a",
            vertexIndices: ringIndices(
              recipe.generator === "seated-torsion-spring-1"
                ? recipe.parameters.legSamples
                : 0,
            ),
          },
          {
            id: "coil-b",
            vertexIndices: ringIndices(
              recipe.generator === "seated-torsion-spring-1"
                ? recipe.parameters.legSamples +
                    recipe.parameters.coilSamples -
                    1
                : 0,
            ),
          },
        ];
  return Object.freeze({
    vertices: (rings + 2) * sides,
    indices: Object.freeze(indices),
    uvs: Object.freeze(uvs),
    landmarks: Object.freeze(
      landmarks.map((landmark) =>
        Object.freeze({
          ...landmark,
          vertexIndices: Object.freeze(landmark.vertexIndices),
        }),
      ),
    ),
  });
}

/** IO preparation hashes this once and binds it to the declared topology SHA. */
export function mechanismTeachingTopologyDocument(
  shape: Shape,
  mesh: DeepReadonly<MechanismMesh>,
) {
  return {
    version: "mechanism-teaching-topology-1" as const,
    mesh: mesh.id,
    ownerPart: shape.ownerPart,
    materialId: mesh.materialId,
    vertices: mesh.positions.length / 3,
    indices: mesh.indices,
    uvs: mesh.uvs ?? null,
    groups: mesh.groups ?? null,
    landmarks: shape.landmarks,
  };
}
