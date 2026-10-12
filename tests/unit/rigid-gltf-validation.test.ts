import { describe, expect, it } from "vitest";
import { Matrix3, Matrix4, Vector3 } from "three";
import { decodeRigidGltf } from "../../packages/animation-engine/src/mechanism/gltf-import.ts";
import { inspectRigidGltf } from "../../packages/animation-engine/src/mechanism/gltf-inspect.ts";
import { RigidGltfImportError } from "../../packages/animation-engine/src/mechanism/gltf-document.ts";
import { gltfJsonHash } from "../../packages/animation-engine/src/mechanism/gltf-identity.ts";
import {
  rigidGltfFixture,
  glbBytes,
  texturedGltfFixture,
} from "../helpers/rigid-gltf-fixture.ts";

const decode = (document: unknown, binary = rigidGltfFixture().binary) =>
  decodeRigidGltf(glbBytes(document, binary), { format: "glb" });
describe("rigid glTF hierarchy, PBR and immutable identities", () => {
  it("bakes reflected winding and tangent handedness without losing node origins", () => {
    const { document } = rigidGltfFixture();
    const asset = decode({
      ...document,
      nodes: [{ ...document.nodes[0], scale: [-2, 1, 1] }, document.nodes[1]],
    });
    expect(asset.meshes[0]!.indices).toEqual([0, 2, 1]);
    expect(asset.meshes[0]!.tangents![3]).toBe(-1);
    expect(asset.parts[2]!.transform.position[1]).toBeCloseTo(-2);
    const mesh = asset.meshes[0]!,
      face = new Vector3()
        .fromArray(mesh.positions, 6)
        .cross(new Vector3().fromArray(mesh.positions, 3));
    expect(face.dot(new Vector3().fromArray(mesh.normals))).toBeGreaterThan(0);
  });
  it("bakes inherited shear and uses inverse-transpose normals with perpendicular tangents", () => {
    const { document } = rigidGltfFixture();
    const asset = decode({
      ...document,
      nodes: [
        { ...document.nodes[0], rotation: [0, 0, 0, 1] },
        {
          ...document.nodes[1],
          rotation: [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)],
        },
      ],
    });
    const mesh = asset.meshes[0]!,
      sourceWorld = new Matrix3().setFromMatrix4(
        new Matrix4().fromArray(asset.nodes[1]!.worldMatrix),
      );
    const expected = new Vector3(1, 0, 0).applyMatrix3(sourceWorld).normalize();
    expect(mesh.tangents!.slice(0, 3)).toEqual(expected.toArray());
    expect(
      new Vector3()
        .fromArray(mesh.normals)
        .dot(new Vector3().fromArray(mesh.tangents!)),
    ).toBeCloseTo(0);
  });
  it("retains all three texture roles, linear PBR factors, sampler modes and original image bytes", () => {
    const { document, binary, png } = texturedGltfFixture();
    const asset = decodeRigidGltf(glbBytes(document, binary), {
      format: "glb",
      dependencies: new Map([["maps/surface.png", png]]),
    });
    const material = asset.materials[0]!;
    expect(material.baseColorTexture!.colorSpace).toBe("srgb");
    expect(material.metallicRoughnessTexture).toMatchObject({
      colorSpace: "linear",
      roughnessChannel: "g",
      metalnessChannel: "b",
    });
    expect(material.normalTexture).toMatchObject({
      colorSpace: "linear",
      scale: 0.75,
    });
    expect(material.baseColorTexture!.sampler).toEqual({
      magFilter: 9728,
      minFilter: 9984,
      wrapS: 33071,
      wrapT: 33648,
    });
    expect(Buffer.from(asset.images[0]!.encodedBase64, "base64")).toEqual(
      Buffer.from(png),
    );
    expect(asset.images[0]).toMatchObject({
      mimeType: "image/png",
      width: 16,
      height: 16,
    });
    expect(asset.dependencies).toHaveLength(1);
    expect(asset.policy.pixels).toBe(
      "encoded-images-not-yet-decoded-or-native-admitted-1",
    );
  });
  it("seals independent source, geometry and asset identities and returns metadata without payloads", () => {
    const { document, binary } = rigidGltfFixture();
    const asset = decode(document, binary),
      repeat = decode(document, binary);
    expect(asset).toEqual(repeat);
    expect(Object.isFrozen(asset.meshes[0]!.positions)).toBe(true);
    const { assetSha256, ...data } = asset;
    expect(assetSha256).toBe(gltfJsonHash(data));
    const changed = decode(
      {
        ...document,
        materials: [{ pbrMetallicRoughness: { metallicFactor: 0 } }],
      },
      binary,
    );
    expect(changed.geometrySha256).toBe(asset.geometrySha256);
    expect(changed.assetSha256).not.toBe(asset.assetSha256);
    const receipt = inspectRigidGltf(asset);
    expect(Buffer.byteLength(JSON.stringify(receipt))).toBeLessThanOrEqual(
      32768,
    );
    expect(receipt.meshes[0]).toMatchObject({
      vertices: 3,
      triangles: 1,
      tangents: true,
    });
    expect(JSON.stringify(receipt)).not.toMatch(/positions|encodedBase64/);
  });
  it("selects a scene explicitly and reports omitted nodes", () => {
    const { document, binary } = rigidGltfFixture();
    const doc = {
      ...document,
      nodes: [...document.nodes, { name: "other", mesh: 0 }],
      scenes: [{ nodes: [0] }, { nodes: [2] }],
    };
    const asset = decodeRigidGltf(glbBytes(doc, binary), {
      format: "glb",
      scene: 1,
    });
    expect(asset.nodes.map((node) => node.name)).toEqual(["other"]);
    expect(asset.policy.omittedNodes).toEqual([0, 1]);
    expect(asset.selectedScene).toBe(1);
  });
  it("retains the exact glTF absent-material default", () => {
    const { document } = rigidGltfFixture();
    const asset = decode({
      ...document,
      materials: [],
      meshes: [
        {
          primitives: [
            { attributes: document.meshes[0]!.primitives[0]!.attributes },
          ],
        },
      ],
    });
    expect(asset.materials).toEqual([
      {
        id: "material.default",
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 1,
        roughnessFactor: 1,
        alphaMode: "OPAQUE",
        doubleSided: false,
      },
    ]);
    expect(asset.meshes[0]!.materialId).toBe("material.default");
  });
});

const fixture = rigidGltfFixture().document;
const primitive = fixture.meshes[0]!.primitives[0]!;
const invalidDocuments = [
  [
    "duplicate names",
    {
      ...fixture,
      nodes: [fixture.nodes[0], { ...fixture.nodes[1], name: "mount" }],
    },
  ],
  [
    "cycle",
    {
      ...fixture,
      nodes: [fixture.nodes[0], { ...fixture.nodes[1], children: [0] }],
    },
  ],
  [
    "repeated child",
    {
      ...fixture,
      nodes: [{ ...fixture.nodes[0], children: [1, 1] }, fixture.nodes[1]],
    },
  ],
  [
    "missing child",
    {
      ...fixture,
      nodes: [{ ...fixture.nodes[0], children: [8] }, fixture.nodes[1]],
    },
  ],
  ["nonroot scene node", { ...fixture, scenes: [{ nodes: [1] }] }],
  [
    "zero scale",
    {
      ...fixture,
      nodes: [{ ...fixture.nodes[0], scale: [0, 1, 1] }, fixture.nodes[1]],
    },
  ],
  [
    "unnormalized quaternion",
    {
      ...fixture,
      nodes: [
        { ...fixture.nodes[0], rotation: [0, 0, 0, 2] },
        fixture.nodes[1],
      ],
    },
  ],
  [
    "matrix plus TRS",
    {
      ...fixture,
      nodes: [
        {
          ...fixture.nodes[0],
          matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        },
        fixture.nodes[1],
      ],
    },
  ],
  [
    "local shear",
    {
      ...fixture,
      nodes: [
        {
          name: "mount",
          children: [1],
          matrix: [1, 0, 0, 0, 0.5, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        },
        fixture.nodes[1],
      ],
    },
  ],
  [
    "skin",
    { ...fixture, nodes: [{ ...fixture.nodes[0], skin: 0 }, fixture.nodes[1]] },
  ],
  [
    "morph",
    { ...fixture, meshes: [{ primitives: [{ ...primitive, targets: [] }] }] },
  ],
  ["extension", { ...fixture, extensionsUsed: ["KHR_draco_mesh_compression"] }],
  [
    "primitive extension",
    {
      ...fixture,
      meshes: [
        {
          primitives: [
            { ...primitive, extensions: { KHR_draco_mesh_compression: {} } },
          ],
        },
      ],
    },
  ],
  [
    "line primitive",
    { ...fixture, meshes: [{ primitives: [{ ...primitive, mode: 1 }] }] },
  ],
  [
    "vertex color",
    {
      ...fixture,
      meshes: [
        {
          primitives: [
            {
              ...primitive,
              attributes: { ...primitive.attributes, COLOR_0: 0 },
            },
          ],
        },
      ],
    },
  ],
  [
    "missing normal",
    {
      ...fixture,
      meshes: [{ primitives: [{ ...primitive, attributes: { POSITION: 0 } }] }],
    },
  ],
  [
    "missing material",
    { ...fixture, meshes: [{ primitives: [{ ...primitive, material: 5 }] }] },
  ],
  ["blended material", { ...fixture, materials: [{ alphaMode: "BLEND" }] }],
  ["emission", { ...fixture, materials: [{ emissiveFactor: [0.2, 0, 0] }] }],
  [
    "sparse accessor",
    {
      ...fixture,
      accessors: [
        { ...fixture.accessors[0], sparse: {} },
        ...fixture.accessors.slice(1),
      ],
    },
  ],
  [
    "view bounds",
    {
      ...fixture,
      bufferViews: [
        { ...fixture.bufferViews[0], byteOffset: 10000 },
        ...fixture.bufferViews.slice(1),
      ],
    },
  ],
  [
    "actual position bounds",
    {
      ...fixture,
      accessors: [
        { ...fixture.accessors[0], max: [2, 1, 0] },
        ...fixture.accessors.slice(1),
      ],
    },
  ],
  [
    "attribute allocation",
    {
      ...fixture,
      accessors: fixture.accessors.map((accessor) => ({
        ...accessor,
        count: 100001,
      })),
    },
  ],
] as const;
describe("located rigid subset rejection", () => {
  it.each(invalidDocuments)(
    "rejects %s with a glTF location",
    (_name, document) => {
      try {
        decode(document);
        expect.fail("Unsupported input was admitted");
      } catch (error) {
        expect(error).toBeInstanceOf(RigidGltfImportError);
        expect((error as RigidGltfImportError).location.path[0]).toBe("gltf");
      }
    },
  );
  it("rejects a corrupt GLB declared length", () => {
    const { document, binary } = rigidGltfFixture(),
      bytes = glbBytes(document, binary);
    new DataView(bytes.buffer).setUint32(8, 20, true);
    expect(() => decodeRigidGltf(bytes, { format: "glb" })).toThrow(
      /declared length/,
    );
  });
  it("rejects image MIME mismatch and missing texture UVs/tangents", () => {
    const { document, binary, png } = texturedGltfFixture(),
      dependencies = new Map([["maps/surface.png", png]]);
    expect(() =>
      decodeRigidGltf(
        glbBytes(
          {
            ...document,
            images: [{ uri: "maps/surface.png", mimeType: "image/jpeg" }],
          },
          binary,
        ),
        { format: "glb", dependencies },
      ),
    ).toThrow(/MIME/);
    expect(() =>
      decodeRigidGltf(
        glbBytes(
          {
            ...document,
            meshes: [
              {
                primitives: [
                  {
                    material: 0,
                    attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
                  },
                ],
              },
            ],
          },
          binary,
        ),
        { format: "glb", dependencies },
      ),
    ).toThrow(/tangents/);
    expect(() =>
      decodeRigidGltf(
        glbBytes(
          {
            ...document,
            meshes: [
              {
                primitives: [
                  {
                    material: 0,
                    attributes: { POSITION: 0, NORMAL: 1, TANGENT: 3 },
                  },
                ],
              },
            ],
          },
          binary,
        ),
        { format: "glb", dependencies },
      ),
    ).toThrow(/TEXCOORD_0/);
  });
});

describe("accessor samples and embedded dependencies", () => {
  it("transforms a tilted normal with inverse transpose rather than the position matrix", () => {
    const { document } = rigidGltfFixture(),
      sine = Math.SQRT1_2,
      cosine = Math.SQRT1_2;
    const asset = decode({
      ...document,
      nodes: [
        { ...document.nodes[0], rotation: [0, 0, 0, 1], scale: [2, 1, 3] },
        {
          ...document.nodes[1],
          rotation: [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)],
        },
      ],
    });
    const mesh = asset.meshes[0]!,
      expectedNormal = new Vector3(sine / 2, 0, cosine / 3).normalize(),
      expectedTangent = new Vector3(2 * cosine, 0, -3 * sine).normalize();
    mesh.normals
      .slice(0, 3)
      .forEach((value, axis) =>
        expect(value).toBeCloseTo(expectedNormal.toArray()[axis]!, 12),
      );
    mesh
      .tangents!.slice(0, 3)
      .forEach((value, axis) =>
        expect(value).toBeCloseTo(expectedTangent.toArray()[axis]!, 12),
      );
    expect(
      new Vector3()
        .fromArray(mesh.normals)
        .dot(new Vector3().fromArray(mesh.tangents!)),
    ).toBeCloseTo(0, 12);
  });
  it("decodes normalized unsigned-byte UVs with a four-byte vertex stride", () => {
    const { document, binary } = rigidGltfFixture(),
      uvView = document.bufferViews[2]!;
    binary.set([0, 0, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0], uvView.byteOffset);
    const asset = decode(
      {
        ...document,
        bufferViews: document.bufferViews.map((view, index) =>
          index === 2 ? { ...view, byteLength: 12, byteStride: 4 } : view,
        ),
        accessors: document.accessors.map((accessor, index) =>
          index === 2
            ? { ...accessor, componentType: 5121, normalized: true }
            : accessor,
        ),
      },
      binary,
    );
    expect(asset.meshes[0]!.uvs).toEqual([0, 0, 1, 0, 0, 1]);
  });
  it("reads real indexed triangles and rejects out-of-bounds and restart indices", () => {
    const { document, binary } = rigidGltfFixture(),
      bytes = new Uint8Array(binary.length + 3);
    bytes.set(binary);
    bytes.set([0, 1, 2], binary.length);
    const source = {
      ...document,
      buffers: [{ byteLength: bytes.length }],
      bufferViews: [
        ...document.bufferViews,
        { buffer: 0, byteOffset: binary.length, byteLength: 3 },
      ],
      accessors: [
        ...document.accessors,
        { bufferView: 4, componentType: 5121, count: 3, type: "SCALAR" },
      ],
      meshes: [
        { primitives: [{ ...document.meshes[0]!.primitives[0], indices: 4 }] },
      ],
    };
    expect(decode(source, bytes).meshes[0]!.indices).toEqual([0, 1, 2]);
    bytes[bytes.length - 1] = 3;
    expect(() => decode(source, bytes)).toThrow(/vertex count/);
    bytes[bytes.length - 1] = 255;
    expect(() => decode(source, bytes)).toThrow(/Primitive-restart/);
  });
  it("imports embedded buffer and PNG data URIs without exposing their payloads in the ledger", () => {
    const { document, binary, png } = texturedGltfFixture();
    const source = {
      ...document,
      buffers: [
        {
          byteLength: binary.length,
          uri: `data:application/octet-stream;base64,${Buffer.from(binary).toString("base64")}`,
        },
      ],
      images: [
        { uri: `data:image/png;base64,${Buffer.from(png).toString("base64")}` },
      ],
    };
    const bytes = new TextEncoder().encode(JSON.stringify(source)),
      asset = decodeRigidGltf(bytes, { format: "gltf" });
    expect(asset.dependencies).toHaveLength(2);
    expect(
      asset.dependencies.every((dependency) =>
        /^embedded:sha256:[a-f0-9]{64}$/.test(dependency.uri),
      ),
    ).toBe(true);
    expect(asset.images[0]!.encodedBase64).toBe(
      Buffer.from(png).toString("base64"),
    );
    expect(() =>
      decodeRigidGltf(
        new TextEncoder().encode(
          JSON.stringify({
            ...source,
            images: [
              {
                uri: `data:image/jpeg;base64,${Buffer.from(png).toString("base64")}`,
              },
            ],
          }),
        ),
        { format: "gltf" },
      ),
    ).toThrow(/URI MIME/);
  });
  it("rejects invalid supplied normals and tangent handedness with located attribute failures", () => {
    const { document, binary } = rigidGltfFixture();
    new DataView(binary.buffer).setFloat32(
      document.bufferViews[1]!.byteOffset + 8,
      0,
      true,
    );
    expect(() => decode(document, binary)).toThrow(/unit length/);
    const restored = rigidGltfFixture().binary;
    new DataView(restored.buffer).setFloat32(
      document.bufferViews[3]!.byteOffset + 12,
      0,
      true,
    );
    expect(() => decode(document, restored)).toThrow(/handedness/);
  });
  it("rejects extra supplied dependencies instead of silently dropping their identities", () => {
    const { document, binary } = rigidGltfFixture();
    expect(() =>
      decodeRigidGltf(glbBytes(document, binary), {
        format: "glb",
        dependencies: new Map([["unexpected.bin", new Uint8Array()]]),
      }),
    ).toThrow(/Unreferenced/);
  });
});

describe("final rigid admission guards", () => {
  it("rejects projective matrices even when the non-affine entry is tiny", () => {
    const { document } = rigidGltfFixture();
    expect(() =>
      decode({
        ...document,
        nodes: [
          {
            name: "mount",
            children: [1],
            matrix: [1, 0, 0, 1e-10, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
          },
          document.nodes[1],
        ],
      }),
    ).toThrow(/Projective/);
  });
  it("rejects a buffer view shared by image and vertex payloads before reading it", () => {
    const { document } = rigidGltfFixture();
    expect(() =>
      decode({
        ...document,
        images: [{ bufferView: 0, mimeType: "image/png" }],
      }),
    ).toThrow(/cannot mix/);
  });
  it("counts repeated mesh instances before resolving or allocating their missing buffer", () => {
    const { document, binary } = rigidGltfFixture();
    const nodes = Array.from({ length: 64 }, (_, index) => ({
      name: `instance ${index}`,
      mesh: 0,
    }));
    const source = {
      ...document,
      nodes,
      scenes: [{ nodes: nodes.map((_, index) => index) }],
      buffers: [{ uri: "missing.bin", byteLength: binary.length }],
      accessors: document.accessors.map((accessor) => ({
        ...accessor,
        count: 3000,
      })),
    };
    expect(() =>
      decodeRigidGltf(new TextEncoder().encode(JSON.stringify(source)), {
        format: "gltf",
      }),
    ).toThrow(/budget exceeded before allocation/);
  });
});

it("rejects zero image-header dimensions before pixel budget admission", () => {
  const { document, binary, png } = texturedGltfFixture();
  const invalid = png.slice();
  new DataView(invalid.buffer).setUint32(16, 0);
  expect(() =>
    decodeRigidGltf(glbBytes(document, binary), {
      format: "glb",
      dependencies: new Map([["maps/surface.png", invalid]]),
    }),
  ).toThrow(/positive safe integers/);
});
