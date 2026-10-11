import {
  Material,
  MeshStandardMaterial,
  DoubleSide,
  FrontSide,
  LessEqualDepth,
  NormalBlending,
  TangentSpaceNormalMap,
} from "three";
import type { NativePbrMaterial } from "@still-shift/scene-contract";
import { nativePbrOwnedTexture } from "./pbr-resources.ts";
import type { NativePbrResources } from "./pbr-resources.ts";
import type { DeepReadonly } from "./types.ts";
/** Only the explicit owned Standard PBR profile may compile and submit this source3 draw. */
export function verifyNativePbrMaterialProfile(
  actual: Material,
  definition: DeepReadonly<NativePbrMaterial>,
  resources: NativePbrResources,
) {
  const reject = () => {
    throw Error(
      "comp-native3d-observation: PBR material is outside the owned closed profile",
    );
  };
  if (
    !(actual instanceof MeshStandardMaterial) ||
    actual.onBeforeCompile !== Material.prototype.onBeforeCompile ||
    actual.onBeforeRender !== Material.prototype.onBeforeRender ||
    actual.customProgramCacheKey !== Material.prototype.customProgramCacheKey
  )
    reject();
  const material = actual as MeshStandardMaterial;
  if (
    material.transparent ||
    material.opacity !== 1 ||
    material.alphaTest !== 0 ||
    material.alphaHash ||
    material.wireframe ||
    material.vertexColors ||
    material.flatShading ||
    material.dithering ||
    material.premultipliedAlpha ||
    !material.toneMapped ||
    !material.depthTest ||
    !material.depthWrite ||
    !material.colorWrite ||
    material.depthFunc !== LessEqualDepth ||
    material.polygonOffset ||
    material.stencilWrite ||
    material.clippingPlanes !== null ||
    !material.fog ||
    material.blending !== NormalBlending ||
    material.side !== (definition.doubleSided ? DoubleSide : FrontSide) ||
    material.envMap !== null ||
    material.envMapIntensity !== 1 ||
    material.envMapRotation.x !== 0 ||
    material.envMapRotation.y !== 0 ||
    material.envMapRotation.z !== 0 ||
    material.emissive.r !== 0 ||
    material.emissive.g !== 0 ||
    material.emissive.b !== 0 ||
    material.emissiveIntensity !== 1 ||
    !material.defines ||
    Object.keys(material.defines).length !== 1 ||
    material.defines.STANDARD !== ""
  )
    reject();
  for (const field of [
    "alphaMap",
    "aoMap",
    "bumpMap",
    "displacementMap",
    "emissiveMap",
    "lightMap",
  ] as const)
    if (material[field] !== null) reject();
  for (const [field, binding] of [
    ["map", definition.baseColorTexture],
    ["roughnessMap", definition.metallicRoughnessTexture],
    ["metalnessMap", definition.metallicRoughnessTexture],
    ["normalMap", definition.normalTexture],
  ] as const)
    if (
      material[field] !==
      (binding ? nativePbrOwnedTexture(resources, binding) : null)
    )
      reject();
  if (
    definition.normalTexture &&
    material.normalMapType !== TangentSpaceNormalMap
  )
    reject();
}
