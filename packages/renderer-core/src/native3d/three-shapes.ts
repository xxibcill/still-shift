import { BufferAttribute, DynamicDrawUsage } from "three";
import type { BufferGeometry, Mesh } from "three";
import {
  MECHANISM_TEACHING_SHAPE_LIMITS,
  MechanismShapeFrameSchema,
} from "@still-shift/scene-contract";
import type { MechanismFrameResultV2 } from "@still-shift/scene-contract";
import {
  createRenderStorage,
  releaseRenderStorage,
  renderMemory,
} from "../managed-memory-context.ts";
import type { MemoryLease } from "../managed-memory.ts";
import type { PreparedNative3DVariantV2 } from "./types-v2.ts";
import type { DeepReadonly } from "./types.ts";

type Inventory = { meshes: number; vertices: number; triangles: number };
const pools = new WeakMap<object, Inventory>();

/** Managed exports share one pool; unmanaged previews share their renderer's pool. */
function admitOwners(context: object, request: Inventory) {
  const key = renderMemory() ?? context;
  const pool = pools.get(key) ?? { meshes: 0, vertices: 0, triangles: 0 };
  for (const field of ["meshes", "vertices", "triangles"] as const)
    if (pool[field] + request[field] > MECHANISM_TEACHING_SHAPE_LIMITS[field])
      throw Error(
        `comp-native3d-limit: live changing ${field} exceed the shared owner budget`,
      );
  pools.set(key, pool);
  for (const field of ["meshes", "vertices", "triangles"] as const)
    pool[field] += request[field];
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const field of ["meshes", "vertices", "triangles"] as const)
      pool[field] -= request[field];
    if (pool.meshes === 0 && pools.get(key) === pool) pools.delete(key);
  };
}

function retireGeometry(geometry: BufferGeometry): void {
  try {
    geometry.dispose();
  } finally {
    for (const name of Object.keys(geometry.attributes))
      geometry.deleteAttribute(name);
    geometry.setIndex(null);
    geometry.clearGroups();
    geometry.boundingBox = null;
    geometry.boundingSphere = null;
  }
}

/** Runtime-owned clones. Static catalogue geometry is never written or disposed here. */
export function createNativeThreeShapeOwners(
  variant: PreparedNative3DVariantV2,
  meshes: readonly Mesh[],
  context: object,
) {
  const definitions = variant.source.teachingShapes.map((shape) => {
    const definition = variant.source.geometry.meshes.find(
      (mesh) => mesh.id === shape.mesh,
    )!;
    const matches = meshes.filter((mesh) => mesh.name === shape.mesh);
    if (matches.length !== 1 || matches[0]!.parent?.name !== shape.ownerPart)
      throw Error(
        `comp-native3d-source: changing mesh must have one declared owner: ${shape.id}`,
      );
    const usedMaterials = definition.groups?.length
      ? definition.groups.map(
          (group) => variant.source.geometry.materials[group.materialIndex]!,
        )
      : [
          variant.source.geometry.materials.find(
            (material) => material.id === definition.materialId,
          )!,
        ];
    if (usedMaterials.some((material) => material.texture !== undefined))
      throw Error(
        "comp-native3d-material: changing teaching meshes require the untextured draw profile",
      );
    return { shape, definition, mesh: matches[0]! };
  });
  const releaseAdmission = admitOwners(context, {
    meshes: definitions.length,
    vertices: definitions.reduce(
      (sum, item) => sum + item.definition.positions.length / 3,
      0,
    ),
    triangles: definitions.reduce(
      (sum, item) => sum + item.definition.indices.length / 3,
      0,
    ),
  });
  const owned: {
    shape: (typeof definitions)[number]["shape"];
    definition: (typeof definitions)[number]["definition"];
    mesh: Mesh;
    original: BufferGeometry;
    geometry: BufferGeometry;
  }[] = [];
  let disposed = false;
  let lease: MemoryLease | undefined;
  function dispose() {
    if (disposed) return;
    disposed = true;
    let failed = false,
      reason: unknown;
    for (const item of owned) {
      try {
        item.mesh.geometry = item.original;
        releaseRenderStorage(item.geometry, retireGeometry);
      } catch (error) {
        if (!failed) {
          failed = true;
          reason = error;
        }
      }
    }
    owned.length = 0;
    releaseAdmission();
    lease?.release();
    if (failed) throw reason;
  }
  try {
    lease = renderMemory()?.reserve(
      "metadata",
      2048 + definitions.length * 4096,
      dispose,
      true,
    );
    for (const item of definitions) {
      const { definition, mesh } = item;
      const byteLength =
        2 *
        ((definition.positions.length +
          definition.normals.length +
          (definition.uvs?.length ?? 0)) *
          4 +
          definition.indices.length * 2);
      const geometry = createRenderStorage(
        byteLength,
        () => mesh.geometry.clone(),
        (geometry) => {
          validateTopology(geometry, definition);
          for (const name of ["position", "normal"])
            (geometry.getAttribute(name) as BufferAttribute).setUsage(
              DynamicDrawUsage,
            );
        },
        retireGeometry,
      );
      owned.push({ ...item, original: mesh.geometry, geometry });
      mesh.geometry = geometry;
    }
  } catch (error) {
    try {
      dispose();
    } catch {
      /* Preserve the original setup/admission failure. */
    }
    throw error;
  }
  return {
    get ownerCount() {
      return owned.length;
    },
    applyFrame(frame: DeepReadonly<MechanismFrameResultV2>) {
      if (disposed || (lease && !lease.active))
        throw Error(
          "comp-native3d-not-ready: changing mesh owners are disposed",
        );
      if (
        Object.keys(frame.shapeStates).length !== owned.length ||
        owned.some((item) => !Object.hasOwn(frame.shapeStates, item.shape.id))
      )
        throw Error(
          "comp-native3d-source: current shape inventory differs from owned meshes",
        );
      // Validate the entire bounded pass before writing any of its streams.
      const states = owned.map((item) => {
        if (item.mesh.geometry !== item.geometry)
          throw Error(
            "comp-native3d-source: changing mesh lost its private geometry owner",
          );
        validateTopology(item.geometry, item.definition);
        const state = MechanismShapeFrameSchema.parse(
          frame.shapeStates[item.shape.id],
        );
        if (
          state.shape !== item.shape.id ||
          state.mesh !== item.shape.mesh ||
          state.ownerPart !== item.shape.ownerPart ||
          state.topologySha256 !== item.shape.topologySha256 ||
          state.positions.length !== item.definition.positions.length
        )
          throw Error(
            "comp-native3d-source: current shape association differs from prepared topology",
          );
        return state;
      });
      owned.forEach((item, index) => {
        const state = states[index]!;
        const position = item.geometry.getAttribute(
          "position",
        ) as BufferAttribute;
        const normal = item.geometry.getAttribute("normal") as BufferAttribute;
        (position.array as Float32Array).set(state.positions);
        (normal.array as Float32Array).set(state.normals);
        position.needsUpdate = true;
        normal.needsUpdate = true;
        item.geometry.computeBoundingBox();
        item.geometry.computeBoundingSphere();
      });
    },
    dispose,
  };
}

function validateTopology(
  geometry: BufferGeometry,
  definition: PreparedNative3DVariantV2["source"]["geometry"]["meshes"][number],
): void {
  for (const name of ["position", "normal"] as const) {
    const attribute = geometry.getAttribute(name);
    if (
      !(attribute instanceof BufferAttribute) ||
      !(attribute.array instanceof Float32Array) ||
      attribute.itemSize !== 3 ||
      attribute.normalized ||
      attribute.array.length !== definition.positions.length ||
      Reflect.get(attribute, "isInstancedBufferAttribute") === true
    )
      throw Error(
        `comp-native3d-source: unsupported changing ${name} stream layout`,
      );
  }
  const index = geometry.getIndex();
  if (
    !index ||
    !(index.array instanceof Uint16Array) ||
    index.itemSize !== 1 ||
    index.array.length !== definition.indices.length ||
    definition.indices.some((value, offset) => index.array[offset] !== value)
  )
    throw Error(
      "comp-native3d-checksum: changing index topology differs from its template",
    );
  const uv = geometry.getAttribute("uv");
  if (
    definition.uvs
      ? !(uv instanceof BufferAttribute) ||
        !(uv.array instanceof Float32Array) ||
        uv.itemSize !== 2 ||
        uv.array.length !== definition.uvs.length ||
        definition.uvs.some(
          (value, offset) => uv.array[offset] !== Math.fround(value),
        )
      : uv !== undefined
  )
    throw Error(
      "comp-native3d-checksum: changing UV topology differs from its template",
    );
  if (
    JSON.stringify(geometry.groups) !== JSON.stringify(definition.groups ?? [])
  )
    throw Error(
      "comp-native3d-checksum: changing material groups differ from their template",
    );
}
