import { Matrix3, type Matrix4, Vector3 } from "three";
import {
  MechanismMeshSchema,
  MechanismPartSchema,
  type MechanismMesh,
} from "@still-shift/scene-contract";
import {
  gltfFail,
  referenced,
  RIGID_GLTF_LIMITS,
  type RigidGltfDocument,
} from "./gltf-document.ts";
import { readGltfAccessor } from "./gltf-resources.ts";
import { gltfJsonHash } from "./gltf-identity.ts";
import type { GltfHierarchy } from "./gltf-hierarchy.ts";
import type { GltfVector, ImportedGltfMesh } from "./gltf-types.ts";

function validateBufferViewRoles(document: RigidGltfDocument) {
  const roles = new Map<number, "vertex" | "index" | "image">();
  function claim(
    index: number,
    role: "vertex" | "index" | "image",
    path: (string | number)[],
  ) {
    referenced(document.bufferViews, index, path);
    if (roles.has(index) && roles.get(index) !== role)
      gltfFail(
        "layout",
        "Buffer view cannot mix vertex, index or image payload roles",
        path,
      );
    roles.set(index, role);
  }
  document.meshes.forEach((mesh, meshIndex) =>
    mesh.primitives.forEach((primitive, primitiveIndex) => {
      const path = ["meshes", meshIndex, "primitives", primitiveIndex];
      for (const [name, index] of Object.entries(primitive.attributes))
        claim(
          referenced(document.accessors, index, [...path, "attributes", name])
            .bufferView,
          "vertex",
          [...path, "attributes", name],
        );
      if (primitive.indices !== undefined)
        claim(
          referenced(document.accessors, primitive.indices, [
            ...path,
            "indices",
          ]).bufferView,
          "index",
          [...path, "indices"],
        );
    }),
  );
  document.images.forEach((image, index) => {
    if (image.bufferView !== undefined)
      claim(image.bufferView, "image", ["images", index, "bufferView"]);
  });
}
const supportedAttributes = new Set([
  "POSITION",
  "NORMAL",
  "TEXCOORD_0",
  "TANGENT",
]);
export function preflightGltfMeshes(
  document: RigidGltfDocument,
  hierarchy: GltfHierarchy,
) {
  validateBufferViewRoles(document);
  document.meshes.forEach((mesh, meshIndex) =>
    mesh.primitives.forEach((primitive, primitiveIndex) => {
      const path = ["meshes", meshIndex, "primitives", primitiveIndex];
      for (const [name, index] of Object.entries(primitive.attributes)) {
        if (!supportedAttributes.has(name))
          gltfFail("unsupported", `Unsupported mesh attribute ${name}`, [
            ...path,
            "attributes",
            name,
          ]);
        referenced(document.accessors, index, [...path, "attributes", name]);
      }
      if (
        primitive.attributes.POSITION === undefined ||
        primitive.attributes.NORMAL === undefined
      )
        gltfFail(
          "attribute",
          "Rigid meshes require supplied positions and normals",
          [...path, "attributes"],
        );
      const position = document.accessors[primitive.attributes.POSITION]!;
      for (const [name, index] of Object.entries(primitive.attributes))
        if (document.accessors[index]!.count !== position.count)
          gltfFail("layout", "Vertex attribute counts differ", [
            ...path,
            "attributes",
            name,
          ]);
      if (primitive.indices !== undefined)
        referenced(document.accessors, primitive.indices, [...path, "indices"]);
      const material =
        primitive.material === undefined
          ? undefined
          : referenced(document.materials, primitive.material, [
              ...path,
              "material",
            ]);
      if (
        material &&
        (material.pbrMetallicRoughness.baseColorTexture ||
          material.pbrMetallicRoughness.metallicRoughnessTexture ||
          material.normalTexture) &&
        primitive.attributes.TEXCOORD_0 === undefined
      )
        gltfFail("attribute", "Textured primitives require TEXCOORD_0", [
          ...path,
          "attributes",
        ]);
      if (material?.normalTexture && primitive.attributes.TANGENT === undefined)
        gltfFail(
          "attribute",
          "Normal-mapped primitives require supplied tangents",
          [...path, "attributes"],
        );
    }),
  );
  let vertices = 0,
    triangles = 0,
    meshes = 0,
    decodedBytes = 0;
  for (const nodeIndex of hierarchy.order) {
    const meshIndex = document.nodes[nodeIndex]!.mesh;
    if (meshIndex === undefined) continue;
    for (const [primitiveIndex, primitive] of document.meshes[
      meshIndex
    ]!.primitives.entries()) {
      const vertexCount =
        document.accessors[primitive.attributes.POSITION!]!.count;
      const indexCount =
        primitive.indices === undefined
          ? vertexCount
          : document.accessors[primitive.indices]!.count;
      const path = [
        "nodes",
        nodeIndex,
        "mesh",
        meshIndex,
        "primitives",
        primitiveIndex,
      ];
      if (vertexCount < 3 || indexCount % 3)
        gltfFail("topology", "Primitives need complete triangles", path);
      vertices += vertexCount;
      triangles += indexCount / 3;
      meshes++;
      // Account for source and transformed Number arrays before decoding any attribute.
      const components =
        6 +
        (primitive.attributes.TEXCOORD_0 === undefined ? 0 : 2) +
        (primitive.attributes.TANGENT === undefined ? 0 : 4);
      decodedBytes += (vertexCount * components + indexCount) * 16;
      if (
        vertices > RIGID_GLTF_LIMITS.vertices ||
        triangles > RIGID_GLTF_LIMITS.triangles ||
        meshes > RIGID_GLTF_LIMITS.meshes ||
        decodedBytes > RIGID_GLTF_LIMITS.decodedAttributeBytes
      )
        gltfFail(
          "budget",
          "Instanced mesh or decoded attribute budget exceeded before allocation",
          path,
        );
    }
  }
}
function bakedDirections(
  normals: number[],
  tangents: number[] | undefined,
  world: Matrix4,
  path: (string | number)[],
) {
  const normalMatrix = new Matrix3().getNormalMatrix(world),
    tangentMatrix = new Matrix3().setFromMatrix4(world);
  const bakedNormals: number[] = [],
    bakedTangents: number[] = [];
  for (let vertex = 0; vertex < normals.length / 3; vertex++) {
    const normal = new Vector3().fromArray(normals, vertex * 3);
    if (Math.abs(normal.length() - 1) > 0.001)
      gltfFail("attribute", "Supplied normals must be unit length", [
        ...path,
        "NORMAL",
        vertex,
      ]);
    const sourceNormal = normal.clone();
    normal.applyMatrix3(normalMatrix).normalize();
    bakedNormals.push(...normal.toArray());
    if (tangents) {
      const tangent = new Vector3().fromArray(tangents, vertex * 4),
        sign = tangents[vertex * 4 + 3]!;
      if (
        Math.abs(tangent.length() - 1) > 0.001 ||
        Math.abs(sourceNormal.dot(tangent)) > 0.001 ||
        Math.abs(sign) !== 1
      )
        gltfFail(
          "attribute",
          "Tangents must be unit, orthogonal and have handedness +/-1",
          [...path, "TANGENT", vertex],
        );
      tangent.applyMatrix3(tangentMatrix).normalize();
      bakedTangents.push(
        ...tangent.toArray(),
        sign * Math.sign(world.determinant()),
      );
    }
  }
  return {
    normals: bakedNormals,
    ...(tangents ? { tangents: bakedTangents } : {}),
  };
}
function meshBounds(positions: number[]) {
  const min: GltfVector = [Infinity, Infinity, Infinity],
    max: GltfVector = [-Infinity, -Infinity, -Infinity];
  positions.forEach((value, index) => {
    const axis = index % 3;
    min[axis] = Math.min(min[axis]!, value);
    max[axis] = Math.max(max[axis]!, value);
  });
  return { min, max };
}
function validateMesh(
  mesh: MechanismMesh,
  tangents: number[] | undefined,
  path: (string | number)[],
) {
  const parsed = MechanismMeshSchema.safeParse(mesh);
  if (!parsed.success)
    gltfFail("mesh", parsed.error.issues[0]!.message, [
      ...path,
      ...(parsed.error.issues[0]!.path as (string | number)[]),
    ]);
  if (tangents)
    for (let offset = 0; offset < mesh.indices.length; offset += 3) {
      const signs = mesh.indices
        .slice(offset, offset + 3)
        .map((index) => tangents[index * 4 + 3]);
      if (signs.some((sign) => sign !== signs[0]))
        gltfFail("attribute", "Triangle tangent handedness must agree", [
          ...path,
          "indices",
          offset,
        ]);
    }
  return parsed.data;
}
export function bakeGltfMeshes(
  document: RigidGltfDocument,
  buffers: readonly Uint8Array[],
  hierarchy: GltfHierarchy,
) {
  const parts = [MechanismPartSchema.parse({ id: "model" })];
  const nodes = hierarchy.order.map((index) => {
    const parent = hierarchy.parents[index],
      origin = hierarchy.origins.get(index)!;
    const parentOrigin =
      parent === undefined ? [0, 0, 0] : hierarchy.origins.get(parent)!;
    const part = MechanismPartSchema.safeParse({
      id: `node.${index}`,
      parent: parent === undefined ? "model" : `node.${parent}`,
      transform: {
        position: origin.map((value, axis) => value - parentOrigin[axis]!),
      },
    });
    if (!part.success)
      gltfFail("transform", part.error.issues[0]!.message, [
        "nodes",
        index,
        "bakedPartOrigin",
      ]);
    parts.push(part.data);
    return {
      id: `node.${index}`,
      name: document.nodes[index]!.name,
      sourceNode: index,
      localMatrix: hierarchy.local[index]!.toArray(),
      worldMatrix: hierarchy.world.get(index)!.toArray(),
      pivotWorld: origin,
    };
  });
  const meshes: ImportedGltfMesh[] = [];
  for (const nodeIndex of hierarchy.order) {
    const meshIndex = document.nodes[nodeIndex]!.mesh;
    if (meshIndex === undefined) continue;
    const world = hierarchy.world.get(nodeIndex)!,
      origin = new Vector3(...hierarchy.origins.get(nodeIndex)!);
    for (const [primitiveIndex, primitive] of document.meshes[
      meshIndex
    ]!.primitives.entries()) {
      const path = ["meshes", meshIndex, "primitives", primitiveIndex],
        attributes = primitive.attributes;
      const sourcePositions = readGltfAccessor(
        document,
        buffers,
        attributes.POSITION!,
        "position",
      );
      const sourceNormals = readGltfAccessor(
        document,
        buffers,
        attributes.NORMAL!,
        "normal",
      );
      const sourceTangents =
        attributes.TANGENT === undefined
          ? undefined
          : readGltfAccessor(document, buffers, attributes.TANGENT, "tangent");
      const directions = bakedDirections(
        sourceNormals,
        sourceTangents,
        world,
        path,
      );
      const positions: number[] = [];
      for (let offset = 0; offset < sourcePositions.length; offset += 3)
        positions.push(
          ...new Vector3()
            .fromArray(sourcePositions, offset)
            .applyMatrix4(world)
            .sub(origin)
            .toArray(),
        );
      const indices =
        primitive.indices === undefined
          ? Array.from(
              { length: sourcePositions.length / 3 },
              (_, index) => index,
            )
          : readGltfAccessor(document, buffers, primitive.indices, "indices");
      if (world.determinant() < 0)
        for (let offset = 0; offset < indices.length; offset += 3)
          [indices[offset + 1], indices[offset + 2]] = [
            indices[offset + 2]!,
            indices[offset + 1]!,
          ];
      const mesh = validateMesh(
        {
          id: `mesh.${nodeIndex}.${primitiveIndex}`,
          partId: `node.${nodeIndex}`,
          materialId:
            primitive.material === undefined
              ? "material.default"
              : `material.${primitive.material}`,
          positions,
          normals: directions.normals,
          indices,
          bounds: meshBounds(positions),
          ...(attributes.TEXCOORD_0 === undefined
            ? {}
            : {
                uvs: readGltfAccessor(
                  document,
                  buffers,
                  attributes.TEXCOORD_0,
                  "uv",
                ),
              }),
        },
        directions.tangents,
        path,
      );
      const data = {
        ...mesh,
        ...(directions.tangents ? { tangents: directions.tangents } : {}),
      };
      meshes.push({
        ...data,
        sourceNode: nodeIndex,
        sourceMesh: meshIndex,
        sourcePrimitive: primitiveIndex,
        dataSha256: gltfJsonHash(data),
      });
    }
  }
  return { parts, nodes, meshes };
}
