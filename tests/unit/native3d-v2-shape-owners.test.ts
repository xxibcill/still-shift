import type { NativeSceneFrame } from "@still-shift/scene-contract";
import type { DeepReadonly } from "../../packages/renderer-core/src/native3d/types.ts";
import type { NativeThreeWorld } from "../../packages/renderer-core/src/native3d/three-world.ts";
import type { BufferAttribute } from "three";
import { describe, expect, expectTypeOf, it } from "vitest";
import { Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import * as browser from "../../packages/renderer-core/src/native3d/browser.ts";
import { createNativeThreeShapeOwners } from "../../packages/renderer-core/src/native3d/three-shapes.ts";
import {
  createNativeThreeGeometry,
  verifyNativeThreeGeometry,
} from "../../packages/renderer-core/src/native3d/three-world.ts";
import { prepareNative3DSceneV2 } from "../../packages/renderer-core/src/native3d/prepare-v2.ts";
import { sampleNativeFrameV2 } from "../../packages/renderer-core/src/native3d/evaluate-v2.ts";
import { Native3DLayerSchema } from "@still-shift/scene-contract";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { mechanismV2Fixture } from "../helpers/mechanism-v2-fixture.ts";
import { nativeFixtureHash } from "../helpers/native3d-fixture.ts";

const controller = Native3DLayerSchema.parse({
  id: "world",
  type: "native3d",
  asset: "mechanism",
  sourceStartFrame: 0,
  sourceFps: 30,
});
const scope = {
  scope: "comp",
  scopeFrame: 0,
  layerTime: 0,
  owningScopeFps: 30,
  width: 320,
  height: 180,
};
async function fixture(empty = false) {
  const source = mechanismV2Fixture();
  if (empty) {
    source.teachingShapes = [];
    source.rigs = source.rigs.filter((rig) => rig.type !== "ratchet");
    source.anchors = source.anchors.filter(
      (anchor) => anchor.source.kind === "part-local",
    );
    source.relationships = [];
  }
  const prepared = await prepareNative3DSceneV2(source, nativeFixtureHash);
  const variant = prepared.variants[prepared.baseSourceKey]!;
  const geometry = createNativeThreeGeometry(variant.source);
  verifyNativeThreeGeometry(variant.source, geometry);
  const parts = new Map(
    source.parts.map((part) => {
      const group = new Group();
      group.name = part.id;
      return [part.id, group];
    }),
  );
  const material = new MeshStandardMaterial();
  const meshes = source.geometry.meshes.map((definition) => {
    const mesh = new Mesh(geometry.geometries.get(definition.id)!, material);
    mesh.name = definition.id;
    parts.get(definition.partId)!.add(mesh);
    return mesh;
  });
  return {
    variant,
    meshes,
    geometry,
    frame: (bend = false) =>
      sampleNativeFrameV2(
        prepared,
        bend
          ? {
              ...controller,
              rigControls: {
                hinge: { type: "hinge", value: 0.5 },
                latch: {
                  type: "ratchet",
                  position: { value: 0.5 },
                  latchKeys: [{ frame: 0, state: "engaged" }],
                },
              },
            }
          : controller,
        scope,
      ).frame,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const pawlMesh = (f: Fixture) =>
  f.meshes.find((mesh) => mesh.name === "pawl.mesh")!;
const values = (mesh: Mesh, name: string) =>
  Array.from(mesh.geometry.getAttribute(name).array);

describe("owned native2 changing geometry", () => {
  it("retains the original v1 frame method type", () => {
    expectTypeOf<Parameters<NativeThreeWorld["applyFrame"]>[0]>().toEqualTypeOf<
      DeepReadonly<NativeSceneFrame>
    >();
  });
  it("exposes a versioned browser world factory while keeping the v1 entry", () => {
    expect(browser.createNativeThreeWorld).toBeTypeOf("function");
    expect(browser.createNativeThreeWorldV2).toBeTypeOf("function");
  });
  it("updates both absolute Float32 streams, upload versions and bounds before drawing", async () => {
    const f = await fixture();
    const owner = createNativeThreeShapeOwners(f.variant, f.meshes, {});
    try {
      const mesh = pawlMesh(f),
        original = f.geometry.geometries.get(mesh.name)!;
      expect(mesh.geometry).not.toBe(original);
      const position = mesh.geometry.getAttribute(
        "position",
      ) as BufferAttribute;
      const normal = mesh.geometry.getAttribute("normal") as BufferAttribute;
      const a = f.frame(),
        b = f.frame(true);
      owner.applyFrame(a);
      const positionsA = values(mesh, "position"),
        normalsA = values(mesh, "normal");
      const versionsA = [position.version, normal.version];
      owner.applyFrame(b);
      expect(values(mesh, "position")).toEqual(
        b.shapeStates.pawl!.positions.map(Math.fround),
      );
      expect(values(mesh, "normal")).toEqual(
        b.shapeStates.pawl!.normals.map(Math.fround),
      );
      expect([position.version, normal.version]).toEqual(
        versionsA.map((value) => value + 1),
      );
      expect(values(mesh, "position")).not.toEqual(positionsA);
      expect(values(mesh, "normal")).not.toEqual(normalsA);
      for (let vertex = 0; vertex < position.count; vertex++)
        expect(
          mesh.geometry.boundingBox!.containsPoint(
            new Vector3().fromBufferAttribute(position, vertex),
          ),
        ).toBe(true);
      expect(mesh.geometry.boundingSphere!.radius).toBeGreaterThan(0);
      owner.applyFrame(a);
      expect(values(mesh, "position")).toEqual(positionsA);
      expect(values(mesh, "normal")).toEqual(normalsA);
      expect(Array.from(original.getAttribute("position").array)).toEqual(
        positionsA,
      );
      expect(mesh.geometry.getIndex()!.array).not.toBe(
        original.getIndex()!.array,
      );
    } finally {
      owner.dispose();
      f.dispose();
    }
  });
  it("isolates aliases and bounds retained owners across a shared renderer context", async () => {
    const a = await fixture(),
      b = await fixture(),
      c = await fixture(),
      context = {};
    const first = createNativeThreeShapeOwners(a.variant, a.meshes, context);
    const second = createNativeThreeShapeOwners(b.variant, b.meshes, context);
    let third: ReturnType<typeof createNativeThreeShapeOwners> | undefined;
    try {
      first.applyFrame(a.frame(true));
      second.applyFrame(b.frame());
      expect(values(pawlMesh(a), "position")).not.toEqual(
        values(pawlMesh(b), "position"),
      );
      expect(pawlMesh(a).geometry.getAttribute("normal").array).not.toBe(
        pawlMesh(b).geometry.getAttribute("normal").array,
      );
      expect(() =>
        createNativeThreeShapeOwners(c.variant, c.meshes, context),
      ).toThrow("live changing meshes");
      expect(pawlMesh(c).geometry).toBe(c.geometry.geometries.get("pawl.mesh"));
      first.dispose();
      first.dispose();
      third = createNativeThreeShapeOwners(c.variant, c.meshes, context);
      expect(third.ownerCount).toBe(2);
      expect(() => first.applyFrame(a.frame())).toThrow("disposed");
      expect(pawlMesh(a).geometry).toBe(a.geometry.geometries.get("pawl.mesh"));
    } finally {
      first.dispose();
      second.dispose();
      third?.dispose();
      a.dispose();
      b.dispose();
      c.dispose();
    }
  });
  it("does not let retired empty owner sets erase a newer nonempty pool", async () => {
    const empty = await fixture(true),
      a = await fixture(),
      b = await fixture(),
      c = await fixture(),
      context = {};
    const empty1 = createNativeThreeShapeOwners(
      empty.variant,
      empty.meshes,
      context,
    );
    const empty2 = createNativeThreeShapeOwners(
      empty.variant,
      empty.meshes,
      context,
    );
    empty1.dispose();
    const first = createNativeThreeShapeOwners(a.variant, a.meshes, context);
    empty2.dispose();
    const second = createNativeThreeShapeOwners(b.variant, b.meshes, context);
    try {
      expect(() =>
        createNativeThreeShapeOwners(c.variant, c.meshes, context),
      ).toThrow("live changing meshes");
    } finally {
      first.dispose();
      second.dispose();
      empty.dispose();
      a.dispose();
      b.dispose();
      c.dispose();
    }
  });
  it("validates the complete shape inventory before any position or normal write", async () => {
    const f = await fixture(),
      owner = createNativeThreeShapeOwners(f.variant, f.meshes, {});
    try {
      const a = f.frame(),
        b = f.frame(true),
        mesh = pawlMesh(f);
      owner.applyFrame(a);
      const before = values(mesh, "position");
      const version = (
        mesh.geometry.getAttribute("position") as BufferAttribute
      ).version;
      expect(() =>
        owner.applyFrame({
          ...b,
          shapeStates: {
            ...b.shapeStates,
            spring: {
              ...b.shapeStates.spring!,
              topologySha256: "sha256:" + "b".repeat(64),
            },
          },
        }),
      ).toThrow("association");
      expect(values(mesh, "position")).toEqual(before);
      expect(
        (mesh.geometry.getAttribute("position") as BufferAttribute).version,
      ).toBe(version);
      expect(() => owner.applyFrame({ ...a, shapeStates: {} })).toThrow(
        "inventory",
      );
    } finally {
      owner.dispose();
      f.dispose();
    }
  });
  it.each(["index", "uv", "groups", "layout"])(
    "rejects mutated immutable %s topology",
    async (fault) => {
      const f = await fixture(),
        owner = createNativeThreeShapeOwners(f.variant, f.meshes, {});
      try {
        const mesh = pawlMesh(f),
          geometry = mesh.geometry;
        if (fault === "index") geometry.getIndex()!.array[0] = 10;
        if (fault === "uv") geometry.getAttribute("uv").array[0] = 0.125;
        if (fault === "groups") geometry.addGroup(0, 3, 0);
        if (fault === "layout")
          (geometry.getAttribute("normal") as BufferAttribute).itemSize = 2;
        expect(() => owner.applyFrame(f.frame(true))).toThrow(
          /topology|groups|layout/,
        );
        expect(() =>
          verifyNativeThreeGeometry(f.variant.source, f.geometry),
        ).not.toThrow();
      } finally {
        owner.dispose();
        f.dispose();
      }
    },
  );
  it("rejects duplicate/foreign physical owners without changing any geometry", async () => {
    const f = await fixture(),
      mesh = pawlMesh(f);
    try {
      expect(() =>
        createNativeThreeShapeOwners(f.variant, [...f.meshes, mesh], {}),
      ).toThrow("one declared owner");
      mesh.parent!.name = "other";
      expect(() =>
        createNativeThreeShapeOwners(f.variant, f.meshes, {}),
      ).toThrow("one declared owner");
      expect(mesh.geometry).toBe(f.geometry.geometries.get(mesh.name));
    } finally {
      f.dispose();
    }
  });
  it("admits managed bytes before clones and releases quota on failure/disposal", async () => {
    const f = await fixture();
    try {
      const small = new ManagedMemory({ pixels: 1, metadata: 100_000 });
      await withManagedMemory(small, async () => {
        expect(() =>
          createNativeThreeShapeOwners(f.variant, f.meshes, {}),
        ).toThrow("aggregate worker quota");
        expect(small.statistics.current).toEqual({ pixels: 0, metadata: 0 });
        expect(pawlMesh(f).geometry).toBe(
          f.geometry.geometries.get("pawl.mesh"),
        );
      });
      const memory = new ManagedMemory({
        pixels: 1_000_000,
        metadata: 100_000,
      });
      await withManagedMemory(memory, async () => {
        const owner = createNativeThreeShapeOwners(f.variant, f.meshes, {});
        expect(memory.statistics.current.pixels).toBeGreaterThan(0);
        memory.dispose();
        expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
        expect(owner.ownerCount).toBe(0);
        expect(() => owner.applyFrame(f.frame())).toThrow("disposed");
        expect(pawlMesh(f).geometry).toBe(
          f.geometry.geometries.get("pawl.mesh"),
        );
      });
    } finally {
      f.dispose();
    }
  });
});
