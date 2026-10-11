import { BufferAttribute, BufferGeometry, DataTexture } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  SolidGeometrySchema,
  SolidGeometryV2Schema,
} from "@still-shift/scene-contract";
import {
  prepareNativePbrResources,
  createNativePbrResources,
  nativePbrBytesHash,
  copyNativePbrPixels,
  releasePreparedNativePbrResources,
  nativePbrOwnedTexture,
} from "../../packages/renderer-core/src/native3d/pbr-resources.ts";
import { decodeRigidGltf } from "../../packages/animation-engine/src/mechanism/gltf-import.ts";
import { gltfJsonHash } from "../../packages/animation-engine/src/mechanism/gltf-identity.ts";
import { rigidGltfFixture, glbBytes } from "../helpers/rigid-gltf-fixture.ts";
async function fixture() {
  const { document, binary } = rigidGltfFixture(),
    asset = decodeRigidGltf(glbBytes(document, binary), { format: "glb" });
  const { name: _name, ...material } = asset.materials[0]!;
  void _name;
  const rgba = new Uint8Array([128, 64, 255, 0]),
    binding = {
      image: "image.0",
      texCoord: 0 as const,
      sampler: {
        magFilter: 9728 as const,
        minFilter: 9987 as const,
        wrapS: 33071 as const,
        wrapT: 33648 as const,
      },
    };
  const geometry = SolidGeometryV2Schema.parse({
    schemaVersion: "solid-geometry-2",
    images: [
      {
        id: "image.0",
        sourceSha256: asset.sourceSha256,
        pixelSha256: await nativePbrBytesHash(rgba),
        width: 1,
        height: 1,
        encoding: "rgba8-straight-top-left-1",
      },
    ],
    meshes: asset.meshes.map(
      ({
        sourceNode: _n,
        sourceMesh: _m,
        sourcePrimitive: _p,
        dataSha256: _h,
        ...mesh
      }) => mesh,
    ),
    materials: [
      {
        ...material,
        schemaVersion: "native-pbr-material-1",
        baseColorFactor: [0.2, 0.4, 0.6, 0],
        baseColorTexture: { ...binding, colorSpace: "srgb" },
        metallicRoughnessTexture: {
          ...binding,
          colorSpace: "linear",
          roughnessChannel: "g",
          metalnessChannel: "b",
        },
        normalTexture: { ...binding, colorSpace: "linear", scale: 0.75 },
      },
    ],
  });
  return { geometry, rgba };
}
describe("versioned native PBR resource owner", () => {
  it("uses linear factors, exact tangent attributes and shared role-correct textures", async () => {
    const { geometry, rgba } = await fixture(),
      prepared = await prepareNativePbrResources(geometry, [
        { image: "image.0", rgba },
      ]);
    rgba.fill(0);
    const owner = createNativePbrResources(prepared);
    try {
      const material = owner.materials[0]!;
      expect(material.color.toArray()).toEqual([0.2, 0.4, 0.6]);
      expect(material.opacity).toBe(1);
      expect(material.transparent).toBe(false);
      expect(material.metalnessMap).toBe(material.roughnessMap);
      expect(material.normalMap).toBe(material.roughnessMap);
      expect(material.map).not.toBe(material.normalMap);
      expect(material.map!.colorSpace).toBe("srgb");
      expect(material.normalMap!.colorSpace).toBe("");
      expect((material.map! as DataTexture).image.data).toEqual(
        new Uint8Array([128, 64, 255, 0]),
      );
      expect(material.map!.flipY).toBe(false);
      expect(material.map!.premultiplyAlpha).toBe(false);
      expect(prepared.allocation.textures).toBe(2);
      expect(prepared.geometrySha256).toBe(gltfJsonHash(geometry));
      expect(
        Array.from(owner.geometries.values())[0]!.getAttribute("tangent").array,
      ).toEqual(Float32Array.from(geometry.meshes[0]!.tangents!));
    } finally {
      owner.dispose();
      owner.dispose();
    }
    expect(owner.textures.size).toBe(0);
    expect(owner.geometries.size).toBe(0);
  });
  it("keeps reference pixels immutable after source, texture and scratch mutation", async () => {
    const { geometry, rgba } = await fixture(),
      prepared = await prepareNativePbrResources(geometry, [
        { image: "image.0", rgba },
      ]),
      owner = createNativePbrResources(prepared),
      scratch = new Uint8Array(4);
    try {
      rgba.fill(0);
      for (const texture of owner.textures.values())
        texture.image.data!.fill(0);
      copyNativePbrPixels(owner, "image.0", scratch, 0);
      expect([...scratch]).toEqual([128, 64, 255, 0]);
      scratch.fill(0);
      copyNativePbrPixels(owner, "image.0", scratch, 0);
      expect([...scratch]).toEqual([128, 64, 255, 0]);
      for (const offset of [-1, 1, NaN])
        expect(() =>
          copyNativePbrPixels(owner, "image.0", scratch, offset),
        ).toThrow(/bounds/);
      releasePreparedNativePbrResources(prepared);
      expect(() => copyNativePbrPixels(owner, "image.0", scratch, 0)).toThrow(
        /absent/,
      );
    } finally {
      owner.dispose();
    }
  });
  it("rejects missing or stale pixels and keeps the old geometry parser strict", async () => {
    const { geometry, rgba } = await fixture();
    expect(SolidGeometrySchema.safeParse(geometry).success).toBe(false);
    await expect(prepareNativePbrResources(geometry, [])).rejects.toThrow(
      /cardinality/,
    );
    rgba[0] = 0;
    await expect(
      prepareNativePbrResources(geometry, [{ image: "image.0", rgba }]),
    ).rejects.toThrow(/checksum/);
  });
  it("bills every NPOT mip level and role-specific CPU/GPU copy once", async () => {
    const { geometry } = await fixture(),
      rgba = new Uint8Array(3 * 5 * 4);
    geometry.images[0] = {
      ...geometry.images[0]!,
      width: 3,
      height: 5,
      pixelSha256: await nativePbrBytesHash(rgba),
    };
    const prepared = await prepareNativePbrResources(geometry, [
      { image: "image.0", rgba },
    ]);
    expect(prepared.allocation).toMatchObject({
      pixelBytes: 60,
      textureCpuBytes: 120,
      textureBytes: 144,
      textures: 2,
    });
    expect(prepared.allocation.totalBytes).toBe(
      prepared.allocation.sourceAttributeBytes +
        prepared.allocation.vertexBytes * 2 +
        60 +
        120 +
        144,
    );
  });
  it("rejects the complete component payload budget before accepting pixel inputs", async () => {
    const { geometry } = await fixture();
    geometry.images[0] = { ...geometry.images[0]!, width: 4096, height: 2048 };
    await expect(prepareNativePbrResources(geometry, [])).rejects.toThrow(
      /resource preflight/,
    );
  });
  it("disposes privately owned materials even when public resource collections change", async () => {
    const { geometry, rgba } = await fixture(),
      owner = createNativePbrResources(
        await prepareNativePbrResources(geometry, [{ image: "image.0", rgba }]),
      );
    let disposals = 0;
    owner.materials[0]!.addEventListener("dispose", () => disposals++);
    owner.materials.length = 0;
    owner.textures.clear();
    owner.geometries.clear();
    owner.dispose();
    owner.dispose();
    expect(disposals).toBe(1);
  });
  it("detaches only privately created buffers and clears retained references after normal close", async () => {
    const { geometry, rgba } = await fixture(),
      prepared = await prepareNativePbrResources(geometry, [
        { image: "image.0", rgba },
      ]),
      owner = createNativePbrResources(prepared);
    const meshes = [...owner.geometries.values()],
      textures = [...owner.textures.values()],
      materials = [...owner.materials];
    const originalViews = meshes.flatMap((mesh) => [
      ...Object.values(mesh.attributes).map((attribute) => attribute.array),
      mesh.index!.array,
    ]);
    const textureViews = textures.map((texture) => texture.image.data!);
    const borrowed = new Float32Array(9),
      borrowedPixels = new Uint8Array(4);
    meshes[0]!.setAttribute("position", new BufferAttribute(borrowed, 3));
    textures[0]!.image.data = borrowedPixels;
    owner.dispose();
    expect(originalViews.every((view) => view.byteLength === 0)).toBe(true);
    expect(textureViews.every((view) => view.byteLength === 0)).toBe(true);
    expect(borrowed.byteLength).toBe(36);
    expect(borrowedPixels.byteLength).toBe(4);
    expect(rgba.byteLength).toBe(4);
    for (const mesh of meshes) {
      expect(mesh.attributes).toEqual({});
      expect(mesh.index).toBeNull();
      expect(mesh.groups).toHaveLength(0);
    }
    for (const material of materials) {
      expect(material.map).toBeNull();
      expect(material.normalMap).toBeNull();
      expect(material.roughnessMap).toBeNull();
      expect(material.metalnessMap).toBeNull();
    }
    expect(owner.materials).toHaveLength(0);
    expect(() =>
      nativePbrOwnedTexture(owner, geometry.materials[0]!.baseColorTexture!),
    ).toThrow(/absent/);
    // Preparation is a separate immutable owner and still makes a fresh world.
    const next = createNativePbrResources(prepared);
    expect(next.textures.size).toBe(2);
    next.dispose();
    releasePreparedNativePbrResources(prepared);
  });
  it("preserves the first null destructor failure while retiring every private collection and backing", async () => {
    const { geometry, rgba } = await fixture(),
      prepared = await prepareNativePbrResources(geometry, [
        { image: "image.0", rgba },
      ]),
      owner = createNativePbrResources(prepared);
    const meshes = [...owner.geometries.values()],
      textures = [...owner.textures.values()],
      materials = [...owner.materials];
    const views = [
      ...meshes.flatMap((mesh) => [
        ...Object.values(mesh.attributes).map((attribute) => attribute.array),
        mesh.index!.array,
      ]),
      ...textures.map((texture) => texture.image.data!),
    ];
    const calls = { geometry: 0, material: 0, texture: 0 };
    for (const mesh of meshes)
      mesh.addEventListener("dispose", () => {
        calls.geometry++;
        throw null;
      });
    for (const material of materials)
      material.addEventListener("dispose", () => {
        calls.material++;
        throw Error("secondary material cleanup");
      });
    for (const texture of textures)
      texture.addEventListener("dispose", () => {
        calls.texture++;
        throw Error("secondary texture cleanup");
      });
    owner.geometries.clear();
    owner.textures.clear();
    owner.materials.length = 0;
    let caught = false;
    try {
      owner.dispose();
    } catch (error) {
      caught = true;
      expect(error).toBeNull();
    }
    expect(caught).toBe(true);
    expect(calls).toEqual({
      geometry: meshes.length,
      material: materials.length,
      texture: textures.length,
    });
    expect(views.every((view) => view.byteLength === 0)).toBe(true);
    expect(
      textures.every((texture) => texture.image.data!.byteLength === 0),
    ).toBe(true);
    expect(
      meshes.every(
        (mesh) =>
          Object.keys(mesh.attributes).length === 0 && mesh.index === null,
      ),
    ).toBe(true);
    expect(owner.geometries.size).toBe(0);
    expect(owner.textures.size).toBe(0);
    expect(owner.materials).toHaveLength(0);
    expect(() => owner.dispose()).not.toThrow();
    releasePreparedNativePbrResources(prepared);
  });
  it("preserves actual attribute-construction failure through secondary cleanup failures and detaches its partial owners", async () => {
    const { geometry, rgba } = await fixture(),
      prepared = await prepareNativePbrResources(geometry, [
        { image: "image.0", rgba },
      ]);
    const textures: DataTexture[] = [],
      views: ArrayBufferView[] = [];
    const originalTextureDispose = DataTexture.prototype.dispose,
      originalGeometryDispose = BufferGeometry.prototype.dispose;
    const textureSpy = vi
      .spyOn(DataTexture.prototype, "dispose")
      .mockImplementation(function (this: DataTexture) {
        textures.push(this);
        views.push(this.image.data!);
        originalTextureDispose.call(this);
        throw Error("secondary texture cleanup");
      });
    const geometrySpy = vi
      .spyOn(BufferGeometry.prototype, "dispose")
      .mockImplementation(function (this: BufferGeometry) {
        originalGeometryDispose.call(this);
        throw Error("secondary geometry cleanup");
      });
    const attributeSpy = vi
      .spyOn(BufferGeometry.prototype, "setAttribute")
      .mockImplementation(function (_name, attribute) {
        if (attribute instanceof BufferAttribute) views.push(attribute.array);
        throw null;
      });
    try {
      let caught = false;
      try {
        createNativePbrResources(prepared);
      } catch (error) {
        caught = true;
        expect(error).toBeNull();
      }
      expect(caught).toBe(true);
      expect(geometrySpy).toHaveBeenCalledOnce();
      expect(textures).toHaveLength(2);
      expect(views.length).toBe(3);
      expect(views.every((view) => view.byteLength === 0)).toBe(true);
      expect(rgba.byteLength).toBe(4);
    } finally {
      attributeSpy.mockRestore();
      geometrySpy.mockRestore();
      textureSpy.mockRestore();
      releasePreparedNativePbrResources(prepared);
    }
  });
});
