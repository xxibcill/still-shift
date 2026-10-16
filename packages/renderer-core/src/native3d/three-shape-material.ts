import {
  FrontSide,
  DoubleSide,
  Material,
  MeshStandardMaterial,
  SRGBColorSpace,
  NormalBlending,
  LessEqualDepth,
  Color,
} from "three";
import type { MechanismMaterial } from "@still-shift/scene-contract";
import type { DeepReadonly } from "./types.ts";
import { nativeShapeMaterialDocument } from "./shape-associations.ts";

/** Observe declared inputs from the actual material, rejecting unsupported shader variants. */
export function observeNativeShapeMaterial(
  material: Material,
  expected: DeepReadonly<MechanismMaterial>,
) {
  if (
    !(material instanceof MeshStandardMaterial) ||
    Reflect.get(material, "isMeshPhysicalMaterial") === true ||
    !material.visible ||
    material.transparent ||
    material.wireframe ||
    !material.depthTest ||
    !material.depthWrite ||
    !material.colorWrite ||
    material.blending !== NormalBlending ||
    material.depthFunc !== LessEqualDepth ||
    !material.toneMapped ||
    material.dithering ||
    !material.fog ||
    material.envMap !== null ||
    material.envMapIntensity !== 1 ||
    material.onBeforeRender !== Material.prototype.onBeforeRender ||
    material.onBeforeCompile !== Material.prototype.onBeforeCompile ||
    material.customProgramCacheKey !==
      Material.prototype.customProgramCacheKey ||
    !material.defines ||
    Object.keys(material.defines).length !== 1 ||
    material.defines.STANDARD !== "" ||
    (material.side !== FrontSide && material.side !== DoubleSide) ||
    [
      material.map,
      material.normalMap,
      material.bumpMap,
      material.displacementMap,
      material.alphaMap,
      material.roughnessMap,
      material.metalnessMap,
      material.emissiveMap,
      material.aoMap,
      material.lightMap,
    ].some((map) => map !== null) ||
    material.clippingPlanes !== null ||
    material.alphaHash ||
    material.alphaToCoverage ||
    material.stencilWrite ||
    material.polygonOffset ||
    material.flatShading ||
    material.vertexColors ||
    material.premultipliedAlpha
  )
    throw Error(
      "comp-native3d-observation: changing draw material is outside the sealed untextured PBR profile",
    );
  const color = new Color(expected.color),
    emissive = new Color(expected.emissive);
  if (!material.color.equals(color) || !material.emissive.equals(emissive))
    throw Error(
      "comp-native3d-observation: actual changing linear color differs from declared color",
    );
  const actual = {
    version: "native3d-untextured-shape-material-1" as const,
    id: expected.id,
    color: "#" + material.color.getHexString(SRGBColorSpace),
    roughness: material.roughness,
    metalness: material.metalness,
    opacity: material.opacity,
    alphaTest: material.alphaTest,
    side:
      material.side === DoubleSide ? ("double" as const) : ("front" as const),
    emissive: "#" + material.emissive.getHexString(SRGBColorSpace),
    emissiveIntensity: material.emissiveIntensity,
  };
  const declared = nativeShapeMaterialDocument(expected);
  for (const key of Object.keys(declared) as (keyof typeof declared)[])
    if (actual[key] !== declared[key])
      throw Error(
        `comp-native3d-observation: actual changing material differs at ${key}`,
      );
  return actual;
}
