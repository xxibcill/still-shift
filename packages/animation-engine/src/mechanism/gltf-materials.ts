import {
  gltfFail,
  referenced,
  type RigidGltfDocument,
  RIGID_GLTF_LIMITS,
} from "./gltf-document.ts";
import type {
  ImportedGltfMaterial,
  ImportedGltfTexture,
  ImportedGltfSampler,
} from "./gltf-types.ts";
const defaultSampler: ImportedGltfSampler = {
  magFilter: 9729,
  minFilter: 9987,
  wrapS: 10497,
  wrapT: 10497,
};
export function readGltfMaterials(
  document: RigidGltfDocument,
): ImportedGltfMaterial[] {
  document.textures.forEach((texture, i) => {
    referenced(document.images, texture.source, ["textures", i, "source"]);
    if (texture.sampler !== undefined)
      referenced(document.samplers, texture.sampler, [
        "textures",
        i,
        "sampler",
      ]);
  });
  function texture(
    info: { index: number; texCoord: number },
    space: "srgb" | "linear",
    path: (string | number)[],
  ): ImportedGltfTexture {
    if (info.texCoord !== 0)
      gltfFail("unsupported", "Only TEXCOORD_0 is admitted", [
        ...path,
        "texCoord",
      ]);
    const definition = referenced(document.textures, info.index, [
        ...path,
        "index",
      ]),
      sampler =
        definition.sampler === undefined
          ? defaultSampler
          : document.samplers[definition.sampler]!;
    return {
      image: `image.${definition.source}`,
      colorSpace: space,
      texCoord: 0,
      sampler: {
        magFilter: sampler.magFilter,
        minFilter: sampler.minFilter,
        wrapS: sampler.wrapS,
        wrapT: sampler.wrapT,
      },
    };
  }
  const materials: ImportedGltfMaterial[] = document.materials.map(
    (material, i) => {
      const path: (string | number)[] = ["materials", i],
        pbr = material.pbrMetallicRoughness;
      if (
        material.alphaMode !== "OPAQUE" ||
        material.emissiveTexture !== undefined ||
        material.occlusionTexture !== undefined ||
        material.emissiveFactor?.some((v) => v !== 0)
      )
        gltfFail(
          "unsupported",
          "Only opaque core metallic/roughness materials without emissive/occlusion features are admitted",
          path,
        );
      if (pbr.baseColorFactor.some((v) => v < 0 || v > 1))
        gltfFail(
          "material",
          "Base color factors must be linear values in [0,1]",
          [...path, "pbrMetallicRoughness", "baseColorFactor"],
        );
      if (material.normalTexture && Math.abs(material.normalTexture.scale) > 16)
        gltfFail("budget", "Normal texture scale exceeds the bounded profile", [
          ...path,
          "normalTexture",
          "scale",
        ]);
      return {
        id: `material.${i}`,
        ...(material.name ? { name: material.name } : {}),
        baseColorFactor: pbr.baseColorFactor,
        metallicFactor: pbr.metallicFactor,
        roughnessFactor: pbr.roughnessFactor,
        alphaMode: "OPAQUE" as const,
        doubleSided: material.doubleSided,
        ...(pbr.baseColorTexture
          ? {
              baseColorTexture: texture(pbr.baseColorTexture, "srgb", [
                ...path,
                "baseColorTexture",
              ]),
            }
          : {}),
        ...(pbr.metallicRoughnessTexture
          ? {
              metallicRoughnessTexture: {
                ...texture(pbr.metallicRoughnessTexture, "linear", [
                  ...path,
                  "metallicRoughnessTexture",
                ]),
                roughnessChannel: "g" as const,
                metalnessChannel: "b" as const,
              },
            }
          : {}),
        ...(material.normalTexture
          ? {
              normalTexture: {
                ...texture(material.normalTexture, "linear", [
                  ...path,
                  "normalTexture",
                ]),
                scale: material.normalTexture.scale,
              },
            }
          : {}),
      };
    },
  );
  // glTF's absent-material default is retained separately from authored slots.
  if (
    !materials.length ||
    document.meshes.some((mesh) =>
      mesh.primitives.some((p) => p.material === undefined),
    )
  )
    materials.push({
      id: "material.default",
      baseColorFactor: [1, 1, 1, 1],
      metallicFactor: 1,
      roughnessFactor: 1,
      alphaMode: "OPAQUE",
      doubleSided: false,
    });
  if (materials.length > RIGID_GLTF_LIMITS.materials)
    gltfFail(
      "budget",
      "Material slots including the absent-material default exceed the budget",
      ["materials"],
    );
  return materials;
}
