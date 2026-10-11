import { imageSize } from "image-size";
import { createHash } from "node:crypto";
import {
  gltfFail,
  referenced,
  RIGID_GLTF_LIMITS,
  type GltfContainer,
  type RigidGltfDocument,
} from "./gltf-document.ts";
import type { ImportedGltfImage } from "./gltf-types.ts";
export const gltfBytesHash = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
export function localGltfUri(uri: string, path: (string | number)[]) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(uri);
  } catch {
    gltfFail("dependency", "Invalid URI encoding", path);
  }
  if (
    !decoded ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(decoded) ||
    decoded.startsWith("/") ||
    /[\\\0?#]/.test(decoded)
  )
    gltfFail(
      "dependency",
      "Only relative local dependency URIs are admitted",
      path,
    );
  return decoded;
}
function embeddedBytes(
  uri: string,
  kind: "buffer" | "image",
  path: (string | number)[],
) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(uri);
  const allowed =
    kind === "buffer"
      ? ["application/octet-stream", "application/gltf-buffer"]
      : ["image/png", "image/jpeg"];
  if (!match || !allowed.includes(match[1]!) || match[2]!.length % 4 !== 0)
    gltfFail("dependency", "Unsupported or malformed embedded data URI", path);
  const limit =
    kind === "image"
      ? RIGID_GLTF_LIMITS.imageBytes
      : RIGID_GLTF_LIMITS.dependencyBytes;
  if (match[2]!.length > Math.ceil(limit / 3) * 4)
    gltfFail("budget", "Embedded resource byte budget exceeded", path);
  const bytes = Buffer.from(match[2]!, "base64");
  if (bytes.toString("base64") !== match[2])
    gltfFail("dependency", "Noncanonical base64 payload", path);
  return bytes;
}
export function externalGltfUris(document: RigidGltfDocument) {
  const uris = new Map<string, (string | number)[]>();
  for (const [kind, items] of [
    ["buffers", document.buffers],
    ["images", document.images],
  ] as const)
    items.forEach((item, i) => {
      if (item.uri && !item.uri.startsWith("data:")) {
        localGltfUri(item.uri, [kind, i, "uri"]);
        uris.set(item.uri, [kind, i, "uri"]);
      }
    });
  return uris;
}
export function readGltfResources(
  container: GltfContainer,
  dependencies: ReadonlyMap<string, Uint8Array>,
) {
  const ledger = new Map<
    string,
    { uri: string; bytes: number; sha256: string }
  >();
  let totalBytes = 0;
  function resource(
    uri: string,
    kind: "buffer" | "image",
    path: (string | number)[],
  ) {
    const bytes = uri.startsWith("data:")
      ? embeddedBytes(uri, kind, path)
      : dependencies.get(uri);
    if (!bytes) gltfFail("dependency", `Missing local dependency ${uri}`, path);
    if (!uri.startsWith("data:")) localGltfUri(uri, path);
    if (
      bytes.byteLength >
      (kind === "image"
        ? RIGID_GLTF_LIMITS.imageBytes
        : RIGID_GLTF_LIMITS.dependencyBytes)
    )
      gltfFail("budget", "Dependency byte budget exceeded", path);
    const identity = uri.startsWith("data:")
      ? `embedded:${gltfBytesHash(bytes)}`
      : uri;
    if (!ledger.has(identity)) {
      totalBytes += bytes.byteLength;
      if (totalBytes > RIGID_GLTF_LIMITS.dependencyBytes)
        gltfFail("budget", "Aggregate dependency budget exceeded", path);
      ledger.set(identity, {
        uri: identity,
        bytes: bytes.byteLength,
        sha256: gltfBytesHash(bytes),
      });
    }
    return bytes;
  }
  const buffers = container.document.buffers.map((definition, i) => {
    let bytes: Uint8Array;
    if (definition.uri)
      bytes = resource(definition.uri, "buffer", ["buffers", i, "uri"]);
    else {
      if (i !== 0 || !container.binary)
        gltfFail("reference", "Only GLB buffer0 may omit its URI", [
          "buffers",
          i,
          "uri",
        ]);
      bytes = container.binary;
      if (
        bytes.length - definition.byteLength > 3 ||
        bytes.subarray(definition.byteLength).some((v) => v !== 0)
      )
        gltfFail("layout", "GLB padding must be at most three zero bytes", [
          "buffers",
          i,
          "byteLength",
        ]);
    }
    if (
      bytes.length < definition.byteLength ||
      (definition.uri && bytes.length !== definition.byteLength)
    )
      gltfFail("layout", "Buffer length differs from its declaration", [
        "buffers",
        i,
        "byteLength",
      ]);
    return bytes.subarray(0, definition.byteLength);
  });
  if (container.binary && container.document.buffers[0]!.uri)
    gltfFail("layout", "Unclaimed GLB binary chunk", ["buffers", 0]);
  container.document.bufferViews.forEach((definition, i) => {
    const bytes = referenced(buffers, definition.buffer, [
      "bufferViews",
      i,
      "buffer",
    ]);
    if (definition.byteOffset + definition.byteLength > bytes.length)
      gltfFail("layout", "Buffer view escapes the declared buffer", [
        "bufferViews",
        i,
      ]);
  });
  let texturePixels = 0,
    encodedImageBytes = 0;
  const images: ImportedGltfImage[] = container.document.images.map(
    (image, i) => {
      if ((image.uri === undefined) === (image.bufferView === undefined))
        gltfFail("image", "Image needs exactly one URI or buffer view", [
          "images",
          i,
        ]);
      let bytes: Uint8Array;
      if (image.uri) bytes = resource(image.uri, "image", ["images", i, "uri"]);
      else {
        if (!image.mimeType)
          gltfFail("image", "Embedded buffer-view images require a MIME type", [
            "images",
            i,
            "mimeType",
          ]);
        const view = referenced(
          container.document.bufferViews,
          image.bufferView!,
          ["images", i, "bufferView"],
        );
        if (view.byteStride !== undefined)
          gltfFail("image", "Image buffer views cannot have a stride", [
            "images",
            i,
            "bufferView",
          ]);
        bytes = buffers[view.buffer]!.subarray(
          view.byteOffset,
          view.byteOffset + view.byteLength,
        );
      }
      if (bytes.length > RIGID_GLTF_LIMITS.imageBytes)
        gltfFail("budget", "Compressed image byte budget exceeded", [
          "images",
          i,
        ]);
      encodedImageBytes += bytes.length;
      if (encodedImageBytes > RIGID_GLTF_LIMITS.encodedImageBytes)
        gltfFail("budget", "Aggregate encoded image payload budget exceeded", [
          "images",
          i,
        ]);
      let size: ReturnType<typeof imageSize>;
      try {
        size = imageSize(bytes);
      } catch {
        gltfFail("image", "Invalid PNG/JPEG header", ["images", i]);
      }
      const mimeType =
        size.type === "png"
          ? "image/png"
          : size.type === "jpg"
            ? "image/jpeg"
            : undefined;
      if (!mimeType || (image.mimeType && image.mimeType !== mimeType))
        gltfFail("image", "Image MIME type differs from its actual header", [
          "images",
          i,
          "mimeType",
        ]);
      if (
        image.uri?.startsWith("data:") &&
        image.uri.slice(5, image.uri.indexOf(";")) !== mimeType
      )
        gltfFail(
          "image",
          "Embedded image URI MIME type differs from its actual header",
          ["images", i, "uri"],
        );
      if (mimeType === "image/png" && bytes[24] !== 8)
        gltfFail("unsupported", "Only 8-bit PNG images are admitted", [
          "images",
          i,
        ]);
      if (
        !Number.isSafeInteger(size.width) ||
        !Number.isSafeInteger(size.height) ||
        size.width < 1 ||
        size.height < 1
      )
        gltfFail("image", "Image dimensions must be positive safe integers", [
          "images",
          i,
        ]);
      texturePixels += size.width * size.height;
      if (
        size.width > 4096 ||
        size.height > 4096 ||
        texturePixels > RIGID_GLTF_LIMITS.texturePixels
      )
        gltfFail("budget", "Decoded image pixel budget exceeded", [
          "images",
          i,
        ]);
      return {
        id: `image.${i}`,
        mimeType,
        width: size.width,
        height: size.height,
        bytes: bytes.length,
        sha256: gltfBytesHash(bytes),
        encodedBase64: Buffer.from(bytes).toString("base64"),
      };
    },
  );
  return { buffers, images, dependencies: [...ledger.values()] };
}
const componentBytes = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
} as const;
const componentCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as const;
export type GltfAccessorRole =
  | "position"
  | "normal"
  | "uv"
  | "tangent"
  | "indices";
export function readGltfAccessor(
  document: RigidGltfDocument,
  buffers: readonly Uint8Array[],
  index: number,
  role: GltfAccessorRole,
) {
  const path: (string | number)[] = ["accessors", index];
  const accessor = referenced(document.accessors, index, path),
    definition = referenced(document.bufferViews, accessor.bufferView, [
      ...path,
      "bufferView",
    ]);
  const expectedType =
    role === "uv"
      ? "VEC2"
      : role === "tangent"
        ? "VEC4"
        : role === "indices"
          ? "SCALAR"
          : "VEC3";
  if (accessor.type !== expectedType)
    gltfFail("layout", `${role} requires ${expectedType}`, path);
  const floating = accessor.componentType === 5126;
  const validType =
    role === "indices"
      ? [5121, 5123, 5125].includes(accessor.componentType) &&
        !accessor.normalized
      : role === "uv"
        ? floating && !accessor.normalized
        : ["position", "normal", "tangent"].includes(role) &&
          floating &&
          !accessor.normalized;
  const normalizedUv =
    role === "uv" &&
    [5121, 5123].includes(accessor.componentType) &&
    accessor.normalized;
  if (!validType && !normalizedUv)
    gltfFail("unsupported", `Unsupported ${role} component encoding`, path);
  const size = componentBytes[accessor.componentType],
    components = componentCount[accessor.type],
    elementBytes = size * components,
    stride = definition.byteStride ?? elementBytes;
  if (
    stride < elementBytes ||
    stride % size ||
    accessor.byteOffset % size ||
    (definition.byteOffset + accessor.byteOffset) % size ||
    (role !== "indices" &&
      (stride % 4 !== 0 || accessor.byteOffset % 4 !== 0)) ||
    (role === "indices" &&
      (definition.byteStride !== undefined || definition.target === 34962)) ||
    (role !== "indices" && definition.target === 34963)
  )
    gltfFail("layout", "Invalid accessor alignment, stride or target", path);
  if (
    accessor.byteOffset + (accessor.count - 1) * stride + elementBytes >
    definition.byteLength
  )
    gltfFail("layout", "Accessor escapes its buffer view", path);
  const bytes = referenced(buffers, definition.buffer, [...path, "buffer"]),
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const output: number[] = [];
  for (let vertex = 0; vertex < accessor.count; vertex++)
    for (let component = 0; component < components; component++) {
      const offset =
        definition.byteOffset +
        accessor.byteOffset +
        vertex * stride +
        component * size;
      let value =
        accessor.componentType === 5126
          ? view.getFloat32(offset, true)
          : accessor.componentType === 5125
            ? view.getUint32(offset, true)
            : accessor.componentType === 5123
              ? view.getUint16(offset, true)
              : view.getUint8(offset);
      if (normalizedUv) value /= accessor.componentType === 5123 ? 65535 : 255;
      if (!Number.isFinite(value) || Math.abs(value) > 1_000_000)
        gltfFail("attribute", "Nonfinite or excessive attribute coordinate", [
          ...path,
          vertex,
          component,
        ]);
      if (
        role === "indices" &&
        value ===
          (accessor.componentType === 5121
            ? 255
            : accessor.componentType === 5123
              ? 65535
              : 4294967295)
      )
        gltfFail("topology", "Primitive-restart index is not admitted", [
          ...path,
          vertex,
        ]);
      output.push(value);
    }
  if (role === "position") {
    if (
      !accessor.min ||
      !accessor.max ||
      accessor.min.length !== 3 ||
      accessor.max.length !== 3
    )
      gltfFail("layout", "POSITION requires three-component min/max", path);
    for (let axis = 0; axis < 3; axis++) {
      let min = Infinity,
        max = -Infinity;
      for (let i = axis; i < output.length; i += 3) {
        min = Math.min(min, output[i]!);
        max = Math.max(max, output[i]!);
      }
      if (
        min !== Math.fround(accessor.min[axis]!) ||
        max !== Math.fround(accessor.max[axis]!)
      )
        gltfFail("attribute", "POSITION min/max differs from actual samples", [
          ...path,
          "bounds",
          axis,
        ]);
    }
  }
  return output;
}
