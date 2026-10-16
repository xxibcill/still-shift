import { z } from "zod";
import { MECHANISM_LIMITS } from "@still-shift/scene-contract";
export const RIGID_GLTF_LIMITS = Object.freeze({
  sourceBytes: 32 * 1024 ** 2,
  jsonBytes: 4 * 1024 ** 2,
  dependencyBytes: 32 * 1024 ** 2,
  imageBytes: 8 * 1024 ** 2,
  encodedImageBytes: 16 * 1024 ** 2,
  decodedAttributeBytes: 16 * 1024 ** 2,
  texturePixels: 8_388_608,
  nodes: 64,
  meshes: 128,
  materials: 32,
  images: 16,
  buffers: 16,
  accessors: 512,
  bufferViews: 1024,
  metadataBytes: 32768,
  vertices: MECHANISM_LIMITS.vertices,
  triangles: MECHANISM_LIMITS.triangles,
});
export class RigidGltfImportError extends Error {
  readonly location: { code: string; path: (string | number)[] };
  constructor(code: string, message: string, path: (string | number)[] = []) {
    super(`${code}: ${message}`);
    this.name = "RigidGltfImportError";
    this.location = { code, path: ["gltf", ...path] };
  }
}
export function gltfFail(
  code: string,
  message: string,
  path: (string | number)[] = [],
): never {
  throw new RigidGltfImportError(`gltf-import-${code}`, message, path);
}
const integer = z.number().int().nonnegative();
const scalar = z.number().finite().min(-1_000_000).max(1_000_000);
const vec3 = z.tuple([scalar, scalar, scalar]);
const quat = z.tuple([scalar, scalar, scalar, scalar]);
const extras = {
  extras: z.unknown().optional(),
  extensions: z.record(z.string(), z.unknown()).optional(),
};
const textureInfo = z
  .object({ ...extras, index: integer, texCoord: integer.default(0) })
  .strict();
const pbr = z
  .object({
    ...extras,
    baseColorFactor: z
      .tuple([scalar, scalar, scalar, scalar])
      .default([1, 1, 1, 1]),
    metallicFactor: z.number().finite().min(0).max(1).default(1),
    roughnessFactor: z.number().finite().min(0).max(1).default(1),
    baseColorTexture: textureInfo.optional(),
    metallicRoughnessTexture: textureInfo.optional(),
  })
  .strict();
const material = z
  .object({
    ...extras,
    name: z.string().max(128).optional(),
    pbrMetallicRoughness: pbr.prefault({}),
    normalTexture: textureInfo.extend({ scale: scalar.default(1) }).optional(),
    alphaMode: z.enum(["OPAQUE", "MASK", "BLEND"]).default("OPAQUE"),
    alphaCutoff: z.number().finite().min(0).max(1_000_000).optional(),
    doubleSided: z.boolean().default(false),
    emissiveFactor: vec3.optional(),
    emissiveTexture: z.unknown().optional(),
    occlusionTexture: z.unknown().optional(),
  })
  .strict();
export const RigidGltfDocumentSchema = z
  .object({
    ...extras,
    asset: z
      .object({
        ...extras,
        version: z.literal("2.0"),
        minVersion: z.string().optional(),
        generator: z.string().max(512).optional(),
        copyright: z.string().max(4096).optional(),
      })
      .strict(),
    scene: integer.optional(),
    scenes: z
      .array(
        z
          .object({
            ...extras,
            name: z.string().max(128).optional(),
            nodes: z.array(integer).max(RIGID_GLTF_LIMITS.nodes),
          })
          .strict(),
      )
      .min(1)
      .max(16),
    nodes: z
      .array(
        z
          .object({
            ...extras,
            name: z.string().min(1).max(128),
            children: z.array(integer).max(RIGID_GLTF_LIMITS.nodes).default([]),
            mesh: integer.optional(),
            matrix: z.array(scalar).length(16).optional(),
            translation: vec3.optional(),
            rotation: quat.optional(),
            scale: vec3.optional(),
            skin: z.unknown().optional(),
            weights: z.unknown().optional(),
            camera: z.unknown().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(RIGID_GLTF_LIMITS.nodes),
    meshes: z
      .array(
        z
          .object({
            ...extras,
            name: z.string().max(128).optional(),
            weights: z.unknown().optional(),
            primitives: z
              .array(
                z
                  .object({
                    ...extras,
                    attributes: z.record(z.string(), integer),
                    indices: integer.optional(),
                    material: integer.optional(),
                    mode: integer.default(4),
                    targets: z.unknown().optional(),
                  })
                  .strict(),
              )
              .min(1)
              .max(32),
          })
          .strict(),
      )
      .min(1)
      .max(RIGID_GLTF_LIMITS.meshes),
    materials: z.array(material).max(RIGID_GLTF_LIMITS.materials).default([]),
    buffers: z
      .array(
        z
          .object({
            ...extras,
            uri: z.string().max(RIGID_GLTF_LIMITS.jsonBytes).optional(),
            byteLength: integer
              .positive()
              .max(RIGID_GLTF_LIMITS.dependencyBytes),
            name: z.string().max(128).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(RIGID_GLTF_LIMITS.buffers),
    bufferViews: z
      .array(
        z
          .object({
            ...extras,
            buffer: integer,
            byteOffset: integer.default(0),
            byteLength: integer
              .positive()
              .max(RIGID_GLTF_LIMITS.dependencyBytes),
            byteStride: integer.min(4).max(252).multipleOf(4).optional(),
            target: z.union([z.literal(34962), z.literal(34963)]).optional(),
            name: z.string().max(128).optional(),
          })
          .strict(),
      )
      .max(RIGID_GLTF_LIMITS.bufferViews),
    accessors: z
      .array(
        z
          .object({
            ...extras,
            bufferView: integer,
            byteOffset: integer.default(0),
            componentType: z.union([
              z.literal(5120),
              z.literal(5121),
              z.literal(5122),
              z.literal(5123),
              z.literal(5125),
              z.literal(5126),
            ]),
            count: integer.positive().max(RIGID_GLTF_LIMITS.triangles * 3),
            type: z.enum(["SCALAR", "VEC2", "VEC3", "VEC4"]),
            normalized: z.boolean().default(false),
            min: z.array(scalar).min(1).max(4).optional(),
            max: z.array(scalar).min(1).max(4).optional(),
            sparse: z.unknown().optional(),
            name: z.string().max(128).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(RIGID_GLTF_LIMITS.accessors),
    images: z
      .array(
        z
          .object({
            ...extras,
            uri: z.string().max(RIGID_GLTF_LIMITS.jsonBytes).optional(),
            bufferView: integer.optional(),
            mimeType: z.enum(["image/png", "image/jpeg"]).optional(),
            name: z.string().max(128).optional(),
          })
          .strict(),
      )
      .max(RIGID_GLTF_LIMITS.images)
      .default([]),
    textures: z
      .array(
        z
          .object({
            ...extras,
            source: integer,
            sampler: integer.optional(),
            name: z.string().max(128).optional(),
          })
          .strict(),
      )
      .max(32)
      .default([]),
    samplers: z
      .array(
        z
          .object({
            ...extras,
            magFilter: z
              .union([z.literal(9728), z.literal(9729)])
              .default(9729),
            minFilter: z
              .union([
                z.literal(9728),
                z.literal(9729),
                z.literal(9984),
                z.literal(9985),
                z.literal(9986),
                z.literal(9987),
              ])
              .default(9987),
            wrapS: z
              .union([z.literal(33071), z.literal(33648), z.literal(10497)])
              .default(10497),
            wrapT: z
              .union([z.literal(33071), z.literal(33648), z.literal(10497)])
              .default(10497),
            name: z.string().max(128).optional(),
          })
          .strict(),
      )
      .max(32)
      .default([]),
    extensionsUsed: z.array(z.string()).max(64).default([]),
    extensionsRequired: z.array(z.string()).max(64).default([]),
    animations: z.array(z.unknown()).max(64).default([]),
    skins: z.array(z.unknown()).max(64).default([]),
    cameras: z.array(z.unknown()).max(64).default([]),
  })
  .strict();
export type RigidGltfDocument = z.infer<typeof RigidGltfDocumentSchema>;
export interface GltfContainer {
  document: RigidGltfDocument;
  binary?: Uint8Array;
  sourceBytes: Uint8Array;
  format: "gltf" | "glb";
}
function rejectExtensions(value: unknown) {
  const pending: { value: unknown; path: (string | number)[] }[] = [
    { value, path: [] },
  ];
  while (pending.length) {
    const entry = pending.pop()!;
    if (entry.path.length > 64)
      gltfFail(
        "budget",
        "JSON nesting exceeds 64 levels",
        entry.path.slice(0, 64),
      );
    if (!entry.value || typeof entry.value !== "object") continue;
    for (const [key, child] of Object.entries(entry.value)) {
      if (key === "extras") continue;
      const path = [
        ...entry.path,
        Array.isArray(entry.value) ? Number(key) : key,
      ];
      if (
        key === "extensions" &&
        child &&
        typeof child === "object" &&
        Object.keys(child).length
      )
        gltfFail(
          "unsupported",
          "Extensions are not admitted by the rigid subset",
          path,
        );
      pending.push({ value: child, path });
    }
  }
}
function parseDocument(bytes: Uint8Array) {
  if (bytes.byteLength > RIGID_GLTF_LIMITS.jsonBytes)
    gltfFail("budget", "JSON byte budget exceeded", ["json"]);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    gltfFail("format", "Invalid UTF-8 JSON document", ["json"]);
  }
  rejectExtensions(raw);
  const parsed = RigidGltfDocumentSchema.safeParse(raw);
  if (!parsed.success)
    gltfFail(
      "document",
      parsed.error.issues[0]!.message,
      parsed.error.issues[0]!.path as (string | number)[],
    );
  const document = parsed.data;
  for (const field of [
    "animations",
    "skins",
    "cameras",
    "extensionsUsed",
    "extensionsRequired",
  ] as const)
    if (document[field].length)
      gltfFail("unsupported", `${field} are outside the rigid subset`, [field]);
  if (document.asset.minVersion && document.asset.minVersion !== "2.0")
    gltfFail("version", "Unsupported minimum glTF version", [
      "asset",
      "minVersion",
    ]);
  document.nodes.forEach((node, i) => {
    for (const field of ["skin", "weights", "camera"] as const)
      if (node[field] !== undefined)
        gltfFail("unsupported", `${field} changes node behavior`, [
          "nodes",
          i,
          field,
        ]);
  });
  document.meshes.forEach((mesh, i) => {
    if (mesh.weights !== undefined)
      gltfFail("unsupported", "Morph weights are not rigid", [
        "meshes",
        i,
        "weights",
      ]);
    mesh.primitives.forEach((primitive, j) => {
      if (primitive.targets !== undefined)
        gltfFail("unsupported", "Morph targets are not rigid", [
          "meshes",
          i,
          "primitives",
          j,
          "targets",
        ]);
      if (primitive.mode !== 4)
        gltfFail("unsupported", "Only triangle primitives are admitted", [
          "meshes",
          i,
          "primitives",
          j,
          "mode",
        ]);
    });
  });
  document.accessors.forEach((accessor, i) => {
    if (accessor.sparse !== undefined)
      gltfFail("unsupported", "Sparse accessors are not admitted", [
        "accessors",
        i,
        "sparse",
      ]);
  });
  return document;
}
export function readGltfContainer(
  bytes: Uint8Array,
  format: "gltf" | "glb",
): GltfContainer {
  if (format !== "gltf" && format !== "glb")
    gltfFail("format", "Unsupported source format", ["format"]);
  if (bytes.byteLength > RIGID_GLTF_LIMITS.sourceBytes)
    gltfFail("budget", "Source byte budget exceeded", ["source"]);
  if (format === "gltf")
    return { document: parseDocument(bytes), sourceBytes: bytes, format };
  if (bytes.length < 20)
    gltfFail("format", "Incomplete GLB header", ["header"]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.length
  )
    gltfFail("format", "GLB magic, version or declared length is invalid", [
      "header",
    ]);
  let offset = 12,
    json: Uint8Array | undefined,
    binary: Uint8Array | undefined;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length)
      gltfFail("format", "Truncated GLB chunk header", ["chunks", offset]);
    const length = view.getUint32(offset, true),
      type = view.getUint32(offset + 4, true);
    if (length % 4 !== 0 || offset + 8 + length > bytes.length)
      gltfFail("format", "Invalid GLB chunk alignment or bounds", [
        "chunks",
        offset,
      ]);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (!json && offset === 12 && type === 0x4e4f534a) json = chunk;
    else if (json && !binary && type === 0x004e4942) binary = chunk;
    else
      gltfFail("unsupported", "Unknown, repeated or reordered GLB chunk", [
        "chunks",
        offset,
      ]);
    offset += 8 + length;
  }
  if (!json) gltfFail("format", "GLB has no first JSON chunk", ["chunks"]);
  return {
    document: parseDocument(json),
    ...(binary ? { binary } : {}),
    sourceBytes: bytes,
    format,
  };
}
export function referenced<T>(
  items: readonly T[],
  index: number,
  path: (string | number)[],
): T {
  const item = items[index];
  if (item === undefined)
    gltfFail("reference", `Missing catalogue index ${index}`, path);
  return item;
}
