import { DoubleSide, FrontSide, MeshStandardMaterial } from "three";
import type { CanvasTexture } from "three";
import type { Native3DSource } from "@still-shift/scene-contract";
import type { DeepReadonly } from "./types.ts";
import {
  tapeTexture,
  woodTexture,
  type NativeTextureFont,
} from "./three-textures.ts";

export function createNativeThreeMaterials(
  source: DeepReadonly<Native3DSource>,
  textureFont?: NativeTextureFont,
) {
  const textures: CanvasTexture[] = [];
  const materials: MeshStandardMaterial[] = [];
  try {
    for (const definition of source.geometry.materials) {
      const material = new MeshStandardMaterial({
        color: definition.color,
        metalness: definition.metalness,
        roughness: definition.roughness,
        emissive: definition.emissive,
        emissiveIntensity: definition.emissiveIntensity,
        opacity: definition.opacity,
        alphaTest: definition.alphaMode === "mask" ? definition.alphaCutoff : 0,
        side: definition.side === "double" ? DoubleSide : FrontSide,
      });
      materials.push(material);
      if (definition.texture) {
        if (definition.texture.kind === "tape-graduations" && !textureFont)
          throw new Error(
            "font-missing: tape-graduations requires a pinned font",
          );
        const texture =
          definition.texture.kind === "tape-graduations"
            ? tapeTexture(textureFont!.family, textureFont!.weight)
            : woodTexture(definition.texture.seed ?? 42);
        textures.push(texture);
        material.map = texture;
        if (definition.texture.kind === "wood-grain") {
          material.bumpMap = texture;
          material.bumpScale = 0.035;
        }
      }
    }
  } catch (error) {
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    throw error;
  }
  return {
    materials,
    textures,
    dispose() {
      for (const material of materials) material.dispose();
      for (const texture of textures) {
        texture.dispose();
        const image = texture.image as HTMLCanvasElement;
        image.width = image.height = 0;
      }
    },
  };
}
