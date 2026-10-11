import { NATIVE_PBR_LIMITS } from "@still-shift/scene-contract";
import type {
  SolidGeometryV2,
  NativePbrMaterial,
  NativePbrImage,
} from "@still-shift/scene-contract";
export type TextureBinding =
  | NonNullable<NativePbrMaterial["baseColorTexture"]>
  | NonNullable<NativePbrMaterial["normalTexture"]>
  | NonNullable<NativePbrMaterial["metallicRoughnessTexture"]>;
export interface TextureAllocation {
  key: string;
  binding: TextureBinding;
  image: NativePbrImage;
  bytes: number;
}

/** Count source arrays, private pixels, texture copies and GPU mip payloads before allocations. Input must have passed SolidGeometryV2Schema. */
export function bindingKey(binding: TextureBinding) {
  return JSON.stringify([
    binding.image,
    binding.colorSpace,
    binding.texCoord,
    binding.sampler.magFilter,
    binding.sampler.minFilter,
    binding.sampler.wrapS,
    binding.sampler.wrapT,
  ]);
}
function textureBytes(image: NativePbrImage, mipmaps: boolean) {
  let width = image.width,
    height = image.height,
    bytes = width * height * 4;
  while (mipmaps && (width > 1 || height > 1)) {
    width = Math.max(1, Math.floor(width / 2));
    height = Math.max(1, Math.floor(height / 2));
    bytes += width * height * 4;
  }
  return bytes;
}
export function preflightNativePbrResources(geometry: SolidGeometryV2) {
  const imageById = new Map(geometry.images.map((image) => [image.id, image])),
    textures = new Map<string, TextureAllocation>();
  for (const material of geometry.materials)
    for (const role of [
      "baseColorTexture",
      "metallicRoughnessTexture",
      "normalTexture",
    ] as const) {
      const binding = material[role];
      if (!binding) continue;
      const key = bindingKey(binding);
      if (textures.has(key)) continue;
      const image = imageById.get(binding.image)!;
      textures.set(key, {
        key,
        binding,
        image,
        bytes: textureBytes(image, binding.sampler.minFilter >= 9984),
      });
    }
  const vertexBytes = geometry.meshes.reduce(
    (sum, mesh) =>
      sum +
      4 *
        (mesh.positions.length +
          mesh.normals.length +
          (mesh.uvs?.length ?? 0) +
          (mesh.tangents?.length ?? 0)) +
      (mesh.indices.some((index) => index >= 65535) ? 4 : 2) *
        mesh.indices.length,
    0,
  );
  const pixelBytes = geometry.images.reduce(
      (sum, image) => sum + image.width * image.height * 4,
      0,
    ),
    gpuTextureBytes = [...textures.values()].reduce(
      (sum, texture) => sum + texture.bytes,
      0,
    );
  const sourceAttributeBytes = geometry.meshes.reduce(
    (sum, mesh) =>
      sum +
      8 *
        (mesh.positions.length +
          mesh.normals.length +
          (mesh.uvs?.length ?? 0) +
          (mesh.tangents?.length ?? 0) +
          mesh.indices.length),
    0,
  );
  const textureCpuBytes = [...textures.values()].reduce(
    (sum, entry) => sum + entry.image.width * entry.image.height * 4,
    0,
  );
  const totalBytes =
    sourceAttributeBytes +
    vertexBytes * 2 +
    pixelBytes +
    textureCpuBytes +
    gpuTextureBytes;
  if (
    totalBytes > NATIVE_PBR_LIMITS.resourceBytes ||
    textures.size > NATIVE_PBR_LIMITS.textureBindings
  )
    throw Error(
      "comp-native3d-limit: PBR resource preflight exceeds 64 MiB or 96 texture bindings",
    );
  return {
    textures: [...textures.values()],
    receipt: {
      vertexBytes,
      sourceAttributeBytes,
      textureCpuBytes,
      pixelBytes,
      textureBytes: gpuTextureBytes,
      textures: textures.size,
      totalBytes,
    },
  };
}
