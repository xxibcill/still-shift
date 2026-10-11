import type {
  MechanismMesh,
  MechanismSceneV2,
} from "@still-shift/scene-contract";
export type GltfVector = [number, number, number];
export interface ImportedGltfMesh extends MechanismMesh {
  tangents?: number[];
  sourceNode: number;
  sourceMesh: number;
  sourcePrimitive: number;
  dataSha256: string;
}
export interface ImportedGltfNode {
  id: string;
  name: string;
  sourceNode: number;
  localMatrix: number[];
  worldMatrix: number[];
  pivotWorld: GltfVector;
}
export interface ImportedGltfImage {
  id: string;
  mimeType: "image/png" | "image/jpeg";
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  encodedBase64: string;
}
export interface ImportedGltfSampler {
  magFilter: number;
  minFilter: number;
  wrapS: number;
  wrapT: number;
}
export interface ImportedGltfTexture {
  image: string;
  colorSpace: "srgb" | "linear";
  texCoord: 0;
  sampler: ImportedGltfSampler;
}
export interface ImportedGltfMaterial {
  id: string;
  name?: string;
  baseColorFactor: [number, number, number, number];
  metallicFactor: number;
  roughnessFactor: number;
  alphaMode: "OPAQUE";
  doubleSided: boolean;
  baseColorTexture?: ImportedGltfTexture;
  metallicRoughnessTexture?: ImportedGltfTexture & {
    roughnessChannel: "g";
    metalnessChannel: "b";
  };
  normalTexture?: ImportedGltfTexture & { scale: number };
}
export interface ImportedRigidGltf {
  version: "rigid-gltf-asset-1";
  coordinateSystem: "right-handed-y-up";
  units: "meter";
  selectedScene: number;
  sourceSha256: string;
  dependencies: { uri: string; bytes: number; sha256: string }[];
  parts: MechanismSceneV2["parts"];
  nodes: ImportedGltfNode[];
  meshes: ImportedGltfMesh[];
  materials: ImportedGltfMaterial[];
  images: ImportedGltfImage[];
  geometrySha256: string;
  assetSha256: string;
  policy: {
    geometry: "world-affine-baked-about-retained-node-origins-1";
    pixels: "encoded-images-not-yet-decoded-or-native-admitted-1";
    omittedNodes: number[];
  };
}
