import { bindingKey, preflightNativePbrResources } from "./pbr-allocations.ts";
import type { TextureBinding, TextureAllocation } from "./pbr-allocations.ts";
import { SolidGeometryV2Schema } from "@still-shift/scene-contract";
import type { SolidGeometryV2 } from "@still-shift/scene-contract";
import {
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  FrontSide,
  Float32BufferAttribute,
  Uint16BufferAttribute,
  Uint32BufferAttribute,
  MeshStandardMaterial,
  LinearSRGBColorSpace,
  SRGBColorSpace,
  NoColorSpace,
  RGBAFormat,
  UnsignedByteType,
  NearestFilter,
  LinearFilter,
  NearestMipmapNearestFilter,
  LinearMipmapNearestFilter,
  NearestMipmapLinearFilter,
  LinearMipmapLinearFilter,
  ClampToEdgeWrapping,
  MirroredRepeatWrapping,
  RepeatWrapping,
  TangentSpaceNormalMap,
  Vector2,
} from "three";
import type { DeepReadonly } from "./types.ts";
import { hashNativeData } from "./canonical-hash.ts";
import { freezeNativeData } from "./prepare.ts";

export interface NativePbrPixelInput {
  image: string;
  rgba: Uint8Array;
}
interface OwnedInput {
  geometry: SolidGeometryV2;
  pixels: Map<string, Uint8Array>;
  textures: TextureAllocation[];
}
export interface PreparedNativePbrResources {
  readonly version: "prepared-native-pbr-resources-1";
  readonly geometry: DeepReadonly<SolidGeometryV2>;
  readonly geometrySha256: string;
  readonly allocation: {
    readonly vertexBytes: number;
    readonly sourceAttributeBytes: number;
    readonly textureCpuBytes: number;
    readonly pixelBytes: number;
    readonly textureBytes: number;
    readonly textures: number;
    readonly totalBytes: number;
  };
}
const ownedInputs = new WeakMap<PreparedNativePbrResources, OwnedInput>();

export async function nativePbrBytesHash(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return (
    "sha256:" +
    Array.from(new Uint8Array(digest), (value) =>
      value.toString(16).padStart(2, "0"),
    ).join("")
  );
}
/** Copy and hash every decoded input before any Three resource exists. Binary pixels stay outside metadata transport. */
export async function prepareNativePbrResources(
  input: DeepReadonly<SolidGeometryV2>,
  pixelInputs: readonly NativePbrPixelInput[],
): Promise<PreparedNativePbrResources> {
  const geometry = SolidGeometryV2Schema.parse(input),
    allocation = preflightNativePbrResources(geometry),
    pixels = new Map<string, Uint8Array>();
  if (pixelInputs.length !== geometry.images.length)
    throw Error(
      "comp-native3d-texture: image input cardinality differs from the manifest",
    );
  const definitions = new Map(
    geometry.images.map((image) => [image.id, image]),
  );
  for (const input of pixelInputs) {
    const image = definitions.get(input.image);
    if (
      !image ||
      pixels.has(input.image) ||
      input.rgba.byteLength !== image.width * image.height * 4
    )
      throw Error(
        "comp-native3d-texture: missing, repeated or incorrectly sized image input",
      );
    const copy = Uint8Array.from(input.rgba);
    if ((await nativePbrBytesHash(copy)) !== image.pixelSha256)
      throw Error(
        "comp-native3d-checksum: decoded image bytes differ from the manifest",
      );
    pixels.set(input.image, copy);
  }
  const prepared = freezeNativeData({
    version: "prepared-native-pbr-resources-1" as const,
    geometry,
    geometrySha256: await hashNativeData(geometry),
    allocation: allocation.receipt,
  });
  ownedInputs.set(prepared, {
    geometry,
    pixels,
    textures: allocation.textures,
  });
  return prepared;
}
/** Release private binary preparation when its composition owner closes. Existing worlds own copies. */
export function releasePreparedNativePbrResources(
  prepared: PreparedNativePbrResources,
): void {
  const owned = ownedInputs.get(prepared);
  if (!owned) return;
  owned.pixels.clear();
  ownedInputs.delete(prepared);
}
const filters = {
  9728: NearestFilter,
  9729: LinearFilter,
  9984: NearestMipmapNearestFilter,
  9985: LinearMipmapNearestFilter,
  9986: NearestMipmapLinearFilter,
  9987: LinearMipmapLinearFilter,
} as const;
const wraps = {
  33071: ClampToEdgeWrapping,
  33648: MirroredRepeatWrapping,
  10497: RepeatWrapping,
} as const;
const resourceTextures = new WeakMap<
  NativePbrResources,
  Map<string, DataTexture>
>();
export function createNativePbrResources(
  prepared: PreparedNativePbrResources,
): NativePbrResources {
  const input = ownedInputs.get(prepared);
  if (!input)
    throw Error(
      "comp-native3d-not-ready: PBR resources require owned preparation",
    );
  const geometries = new Map<string, BufferGeometry>(),
    textures = new Map<string, DataTexture>(),
    materials: MeshStandardMaterial[] = [];
  const ownedGeometries: BufferGeometry[] = [],
    ownedTextures: DataTexture[] = [],
    ownedMaterials: MeshStandardMaterial[] = [],
    ownedBuffers: ArrayBuffer[] = [];
  let resourceIdentity: NativePbrResources | undefined;
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    let failed = false;
    let reason: unknown;
    const retire = (work: () => void) => {
      try {
        work();
      } catch (error) {
        if (!failed) {
          failed = true;
          reason = error;
        }
      }
    };
    for (const geometry of ownedGeometries) {
      retire(() => geometry.dispose());
      retire(() => {
        for (const name of Object.keys(geometry.attributes))
          geometry.deleteAttribute(name);
        geometry.setIndex(null);
        geometry.clearGroups();
      });
    }
    for (const material of ownedMaterials) {
      retire(() => material.dispose());
      retire(() => {
        material.map =
          material.roughnessMap =
          material.metalnessMap =
          material.normalMap =
            null;
      });
    }
    for (const texture of ownedTextures) {
      retire(() => texture.dispose());
      retire(() => {
        texture.image.data = new Uint8Array();
      });
    }
    // Capture only allocations made by this producer. Public attributes may
    // have been replaced with caller-owned views after construction.
    for (const buffer of ownedBuffers)
      retire(() => {
        if (buffer.byteLength)
          (
            buffer as ArrayBuffer & { transfer(bytes: number): ArrayBuffer }
          ).transfer(0);
      });
    geometries.clear();
    textures.clear();
    materials.length = 0;
    ownedGeometries.length =
      ownedTextures.length =
      ownedMaterials.length =
      ownedBuffers.length =
        0;
    if (resourceIdentity) resourceTextures.delete(resourceIdentity);
    resourceIdentity = undefined;
    if (failed) throw reason;
  }
  try {
    for (const definition of input.textures) {
      const pixels = Uint8Array.from(input.pixels.get(definition.image.id)!);
      ownedBuffers.push(pixels.buffer);
      const texture = new DataTexture(
        pixels,
        definition.image.width,
        definition.image.height,
        RGBAFormat,
        UnsignedByteType,
      );
      ownedTextures.push(texture);
      textures.set(definition.key, texture);
      texture.name = definition.key;
      texture.colorSpace =
        definition.binding.colorSpace === "srgb"
          ? SRGBColorSpace
          : NoColorSpace;
      texture.flipY = false;
      texture.premultiplyAlpha = false;
      texture.unpackAlignment = 1;
      texture.channel = 0;
      texture.magFilter =
        definition.binding.sampler.magFilter === 9728
          ? NearestFilter
          : LinearFilter;
      texture.minFilter =
        filters[definition.binding.sampler.minFilter as keyof typeof filters];
      texture.wrapS =
        wraps[definition.binding.sampler.wrapS as keyof typeof wraps];
      texture.wrapT =
        wraps[definition.binding.sampler.wrapT as keyof typeof wraps];
      texture.generateMipmaps = definition.binding.sampler.minFilter >= 9984;
      texture.needsUpdate = true;
    }
    for (const definition of input.geometry.materials) {
      const material = new MeshStandardMaterial({
        color: new Color().setRGB(
          ...(definition.baseColorFactor.slice(0, 3) as [
            number,
            number,
            number,
          ]),
          LinearSRGBColorSpace,
        ),
        metalness: definition.metallicFactor,
        roughness: definition.roughnessFactor,
        opacity: 1,
        transparent: false,
        alphaTest: 0,
        side: definition.doubleSided ? DoubleSide : FrontSide,
      });
      ownedMaterials.push(material);
      materials.push(material);
      material.name = definition.id;
      if (definition.baseColorTexture)
        material.map = textures.get(bindingKey(definition.baseColorTexture))!;
      if (definition.metallicRoughnessTexture)
        material.roughnessMap = material.metalnessMap = textures.get(
          bindingKey(definition.metallicRoughnessTexture),
        )!;
      if (definition.normalTexture) {
        material.normalMap = textures.get(
          bindingKey(definition.normalTexture),
        )!;
        material.normalMapType = TangentSpaceNormalMap;
        material.normalScale = new Vector2(
          definition.normalTexture.scale,
          definition.normalTexture.scale,
        );
      }
    }
    for (const definition of input.geometry.meshes) {
      const geometry = new BufferGeometry();
      ownedGeometries.push(geometry);
      geometries.set(definition.id, geometry);
      for (const [name, values, size] of [
        ["position", definition.positions, 3],
        ["normal", definition.normals, 3],
        ["uv", definition.uvs, 2],
        ["tangent", definition.tangents, 4],
      ] as const)
        if (values) {
          const attribute = new Float32BufferAttribute(values, size);
          ownedBuffers.push(attribute.array.buffer as ArrayBuffer);
          geometry.setAttribute(name, attribute);
        }
      const index = definition.indices.some((value) => value >= 65535)
        ? new Uint32BufferAttribute(definition.indices, 1)
        : new Uint16BufferAttribute(definition.indices, 1);
      ownedBuffers.push(index.array.buffer as ArrayBuffer);
      geometry.setIndex(index);
      for (const group of definition.groups ?? [])
        geometry.addGroup(group.start, group.count, group.materialIndex);
    }
  } catch (error) {
    try {
      dispose();
    } catch {
      /* Preserve the original setup failure, including null. */
    }
    throw error;
  }
  const resources = {
    version: "native-pbr-resources-1" as const,
    prepared,
    geometries,
    materials,
    textures,
    dispose,
  };
  resourceIdentity = resources;
  resourceTextures.set(resources, new Map(textures));
  return resources;
}
export interface NativePbrResources {
  version: "native-pbr-resources-1";
  prepared: PreparedNativePbrResources;
  geometries: Map<string, BufferGeometry>;
  materials: MeshStandardMaterial[];
  textures: Map<string, DataTexture>;
  dispose(): void;
}

export function nativePbrOwnedTexture(
  resources: NativePbrResources,
  binding: TextureBinding,
) {
  const texture = resourceTextures.get(resources)?.get(bindingKey(binding));
  if (!texture)
    throw Error(
      "comp-native3d-texture: requested texture is absent from the owned resource set",
    );
  return texture;
}

export function nativePbrPixelsMatch(
  resources: NativePbrResources,
  image: string,
  actual: Uint8Array,
  offset: number,
) {
  const expected = ownedInputs.get(resources.prepared)?.pixels.get(image);
  return (
    expected !== undefined &&
    offset >= 0 &&
    offset + actual.length <= expected.length &&
    actual.every((value, index) => value === expected[offset + index])
  );
}

/** Copy immutable preparation pixels into caller-admitted scratch without exposing their backing. */
export function copyNativePbrPixels(
  resources: NativePbrResources,
  image: string,
  destination: Uint8Array,
  offset: number,
) {
  const expected = ownedInputs.get(resources.prepared)?.pixels.get(image);
  if (
    !expected ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    destination.byteLength === 0 ||
    offset + destination.byteLength > expected.byteLength
  )
    throw Error(
      "comp-native3d-texture: immutable pixel copy is absent or out of bounds",
    );
  destination.set(expected.subarray(offset, offset + destination.byteLength));
}
