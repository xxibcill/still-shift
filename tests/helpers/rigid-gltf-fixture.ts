import { createShadowTexture } from "../../packages/renderer-core/src/shadow-texture.ts";
export function rigidGltfFixture() {
  const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1];
  const uvs = [0, 0, 1, 0, 0, 1];
  const tangents = [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1];
  const arrays = [positions, normals, uvs, tangents];
  const binary = new Uint8Array(
    arrays.reduce((sum, values) => sum + values.length * 4, 0),
  );
  const views = [];
  let offset = 0;
  for (const values of arrays) {
    views.push({
      buffer: 0,
      byteOffset: offset,
      byteLength: values.length * 4,
    });
    for (const value of values) {
      new DataView(binary.buffer).setFloat32(offset, value, true);
      offset += 4;
    }
  }
  const document = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      {
        name: "mount",
        translation: [5, 0, 0],
        rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
        scale: [2, 1, 1],
        children: [1],
      },
      { name: "lever", translation: [1, 0, 0], mesh: 0 },
    ],
    meshes: [
      {
        name: "lever mesh",
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, TANGENT: 3 },
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        name: "steel",
        pbrMetallicRoughness: {
          baseColorFactor: [0.2, 0.4, 0.6, 1],
          metallicFactor: 0.7,
          roughnessFactor: 0.3,
        },
      },
    ],
    buffers: [{ byteLength: binary.length }],
    bufferViews: views,
    accessors: arrays.map((values, index) => ({
      bufferView: index,
      componentType: 5126,
      count: 3,
      type: index === 2 ? "VEC2" : index === 3 ? "VEC4" : "VEC3",
      ...(index === 0 ? { min: [0, 0, 0], max: [1, 1, 0] } : {}),
    })),
  };
  return { document, binary };
}
export function glbBytes(document: unknown, binary: Uint8Array) {
  const json = new TextEncoder().encode(JSON.stringify(document));
  const jsonLength = Math.ceil(json.length / 4) * 4,
    binaryLength = Math.ceil(binary.length / 4) * 4;
  const bytes = new Uint8Array(12 + 8 + jsonLength + 8 + binaryLength),
    view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + jsonLength);
  bytes.set(json, 20);
  view.setUint32(20 + jsonLength, binaryLength, true);
  view.setUint32(24 + jsonLength, 0x004e4942, true);
  bytes.set(binary, 28 + jsonLength);
  return bytes;
}

export function texturedGltfFixture() {
  const { document, binary } = rigidGltfFixture();
  // A generated 16x16 RGBA PNG; source pixels are provided by the shared deterministic encoder.
  const png = createShadowTexture({
    width: 16,
    height: 16,
    softness: 0.7,
    color: "#ff4010",
  });
  return {
    binary,
    png,
    document: {
      ...document,
      images: [{ uri: "maps/surface.png", mimeType: "image/png" }],
      textures: [{ source: 0, sampler: 0 }],
      samplers: [
        { magFilter: 9728, minFilter: 9984, wrapS: 33071, wrapT: 33648 },
      ],
      materials: [
        {
          ...document.materials[0]!,
          pbrMetallicRoughness: {
            ...document.materials[0]!.pbrMetallicRoughness,
            baseColorTexture: { index: 0 },
            metallicRoughnessTexture: { index: 0 },
          },
          normalTexture: { index: 0, scale: 0.75 },
        },
      ],
    },
  };
}
