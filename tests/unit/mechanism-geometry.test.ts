import { describe, expect, it } from "vitest";
import { MechanismGeometrySchema } from "@still-shift/scene-contract";
import {
  createTapeHookGeometry,
  createTapeHookMaterials,
  type GeometryVector3,
  type IndexedMechanismMesh,
} from "../../packages/animation-engine/src/mechanism/geometry.ts";

function vertex(mesh: IndexedMechanismMesh, index: number): GeometryVector3 {
  return mesh.positions.slice(index * 3, index * 3 + 3) as GeometryVector3;
}

function areaSquared(
  a: GeometryVector3,
  b: GeometryVector3,
  c: GeometryVector3,
): number {
  const ab = b.map((value, axis) => value - a[axis]!);
  const ac = c.map((value, axis) => value - a[axis]!);
  return (
    (ab[1]! * ac[2]! - ab[2]! * ac[1]!) ** 2 +
    (ab[2]! * ac[0]! - ab[0]! * ac[2]!) ** 2 +
    (ab[0]! * ac[1]! - ab[1]! * ac[0]!) ** 2
  );
}

function signedVolume(mesh: IndexedMechanismMesh): number {
  let volume = 0;
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const a = vertex(mesh, mesh.indices[index]!);
    const b = vertex(mesh, mesh.indices[index + 1]!);
    const c = vertex(mesh, mesh.indices[index + 2]!);
    volume +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) +
        a[1] * (b[2] * c[0] - b[0] * c[2]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
  }
  return volume;
}

function positionalEdges(mesh: IndexedMechanismMesh): Map<string, number> {
  const edges = new Map<string, number>();
  const key = (index: number) =>
    vertex(mesh, index)
      .map((value) => Math.round(value * 1e5))
      .join(",");
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const vertices = mesh.indices.slice(index, index + 3).map(key);
    for (let edge = 0; edge < 3; edge++) {
      const pair = [vertices[edge]!, vertices[(edge + 1) % 3]!]
        .sort()
        .join("/");
      edges.set(pair, (edges.get(pair) ?? 0) + 1);
    }
  }
  return edges;
}

function verticalIntersections(
  mesh: IndexedMechanismMesh,
  x: number,
  z: number,
): number[] {
  const heights: number[] = [];
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const a = vertex(mesh, mesh.indices[index]!);
    const b = vertex(mesh, mesh.indices[index + 1]!);
    const c = vertex(mesh, mesh.indices[index + 2]!);
    const denominator =
      (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(denominator) < 1e-12) continue;
    const wa =
      ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / denominator;
    const wb =
      ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / denominator;
    const wc = 1 - wa - wb;
    if (Math.min(wa, wb, wc) >= -1e-8)
      heights.push(wa * a[1] + wb * b[1] + wc * c[1]);
  }
  return [
    ...new Set(heights.map((height) => Math.round(height * 1e6) / 1e6)),
  ].sort((a, b) => a - b);
}

const meshById = (meshes: IndexedMechanismMesh[], id: string) =>
  meshes.find((mesh) => mesh.id === id)!;

describe("reusable tape-hook geometry", () => {
  it("serializes deterministic finite indexed meshes with valid outward surfaces and measured bounds", () => {
    const catalog = createTapeHookGeometry();
    expect(MechanismGeometrySchema.parse(catalog)).toEqual(catalog);
    expect(JSON.parse(JSON.stringify(catalog))).toEqual(catalog);
    expect(createTapeHookGeometry()).toEqual(catalog);
    expect(new Set(catalog.meshes.map((mesh) => mesh.id)).size).toBe(
      catalog.meshes.length,
    );
    for (const mesh of catalog.meshes) {
      expect(mesh.positions.length % 3).toBe(0);
      expect(signedVolume(mesh), mesh.id).toBeGreaterThan(0);
      expect(mesh.normals.length).toBe(mesh.positions.length);
      expect(mesh.uvs.length).toBe((mesh.positions.length / 3) * 2);
      expect(mesh.indices.length % 3).toBe(0);
      expect(
        [...mesh.positions, ...mesh.normals, ...mesh.uvs].every(
          Number.isFinite,
        ),
        mesh.id,
      ).toBe(true);
      for (const index of mesh.indices)
        expect(
          Number.isInteger(index) &&
            index >= 0 &&
            index < mesh.positions.length / 3,
          mesh.id,
        ).toBe(true);
      for (let index = 0; index < mesh.normals.length; index += 3) {
        expect(
          Math.hypot(...mesh.normals.slice(index, index + 3)),
          mesh.id,
        ).toBeCloseTo(1, 5);
      }
      for (let index = 0; index < mesh.indices.length; index += 3) {
        expect(
          areaSquared(
            vertex(mesh, mesh.indices[index]!),
            vertex(mesh, mesh.indices[index + 1]!),
            vertex(mesh, mesh.indices[index + 2]!),
          ),
          `${mesh.id} triangle${index / 3}`,
        ).toBeGreaterThan(1e-16);
      }
      for (let axis = 0; axis < 3; axis++) {
        const values = mesh.positions.filter((_, index) => index % 3 === axis);
        expect(mesh.bounds.min[axis]).toBe(Math.min(...values));
        expect(mesh.bounds.max[axis]).toBe(Math.max(...values));
      }
      expect(mesh.groups).toEqual([
        {
          start: 0,
          count: mesh.indices.length,
          materialIndex: catalog.materials.findIndex(
            (material) => material.id === mesh.materialId,
          ),
        },
      ]);
      expect(
        catalog.materials.some((material) => material.id === mesh.materialId),
      ).toBe(true);
    }
  });

  it("keeps both flange slots physically open through beveled top and bottom caps", () => {
    for (const hookThickness of [0.04, 0.18, 0.28, 0.35]) {
      const catalog = createTapeHookGeometry({ hookThickness });
      const flange = meshById(catalog.meshes, "hook-flange");
      for (const center of catalog.dimensions.slotCenters) {
        for (const offset of [-0.025, 0, 0.025]) {
          expect(
            verticalIntersections(
              flange,
              center - hookThickness / 2 + offset,
              0,
            ),
            `slot at${center}`,
          ).toEqual([]);
        }
      }
      for (const center of catalog.dimensions.slotCenters) {
        for (const travel of [0, hookThickness / 2, hookThickness]) {
          for (let sample = 0; sample < 16; sample++) {
            const angle = (sample * Math.PI) / 8;
            const x =
              center -
              travel +
              Math.cos(angle) * catalog.dimensions.rivetStemRadius;
            const z = Math.sin(angle) * catalog.dimensions.rivetStemRadius;
            expect(
              verticalIntersections(flange, x, z),
              `stem surface at travel${travel}`,
            ).toEqual([]);
          }
        }
      }
      expect(verticalIntersections(flange, 0.25, 0.35).length).toBe(2);
      expect(new Set(positionalEdges(flange).values())).toEqual(new Set([2]));
    }
  });

  it("provides a closed blade with curvature, underside thickness and safe pushed-hook clearance", () => {
    const catalog = createTapeHookGeometry();
    const blade = meshById(catalog.meshes, "blade-curved");
    const center = verticalIntersections(blade, 5, 0);
    const edge = verticalIntersections(blade, 5, 1);
    expect(center).toHaveLength(2);
    expect(center[1]! - center[0]!).toBeCloseTo(0.06, 5);
    expect(center[1]! - edge.at(-1)!).toBeCloseTo(0.075, 5);
    expect(blade.bounds.min[0] - catalog.dimensions.hookTravel).toBeCloseTo(
      0.025,
      6,
    );
    expect(new Set(positionalEdges(blade).values())).toEqual(new Set([2]));
  });

  it("keeps rivets mounted to blade and fits stems in slots across the entire allowed travel", () => {
    const catalog = createTapeHookGeometry({ hookThickness: 0.28, scale: 1.3 });
    const { hookTravel, slotCenters, rivetStemRadius, slotEndClearance } =
      catalog.dimensions;
    const rivets = catalog.meshes.filter((mesh) =>
      mesh.id.startsWith("rivet-"),
    );
    expect(rivets).toHaveLength(6);
    expect(rivets.every((mesh) => mesh.partId === "blade")).toBe(true);
    for (const center of slotCenters) {
      for (let frame = 0; frame <= 100; frame++) {
        const travel = (frame / 100) * hookTravel;
        const left = center - hookTravel - slotEndClearance + travel;
        const right = center + slotEndClearance + travel;
        expect(left).toBeLessThanOrEqual(center - rivetStemRadius + 1e-9);
        expect(right).toBeGreaterThanOrEqual(center + rivetStemRadius - 1e-9);
      }
    }
    expect(catalog.dimensions.hookTravel).toBe(
      catalog.dimensions.hookThickness,
    );
  });

  it("scales mesh bounds without changing topology and keeps material styling independent", () => {
    const original = createTapeHookGeometry();
    const larger = createTapeHookGeometry({ scale: 1.5 });
    for (let index = 0; index < original.meshes.length; index++) {
      const a = original.meshes[index]!;
      const b = larger.meshes[index]!;
      expect(b.indices).toEqual(a.indices);
      for (let axis = 0; axis < 3; axis++) {
        expect(b.bounds.min[axis]!).toBeCloseTo(a.bounds.min[axis]! * 1.5, 5);
        expect(b.bounds.max[axis]!).toBeCloseTo(a.bounds.max[axis]! * 1.5, 5);
      }
    }
    const styled = createTapeHookMaterials({
      steelColor: "#f0a32b",
      steelRoughness: 0.6,
      steelMetalness: 0.4,
    });
    expect(styled.find((material) => material.id === "steel")).toMatchObject({
      id: "steel",
      color: "#f0a32b",
      roughness: 0.6,
      metalness: 0.4,
    });
    expect(createTapeHookGeometry().meshes).toEqual(original.meshes);
  });

  it("rejects invalid or unbounded dimensions at their model paths", () => {
    for (const hookThickness of [NaN, Infinity, -1, 0, 0.36]) {
      expect(() => createTapeHookGeometry({ hookThickness })).toThrow(
        /model.hookThickness/,
      );
    }
    expect(() => createTapeHookGeometry({ bladeLength: 200 })).toThrow(
      /model.bladeLength/,
    );
    expect(() => createTapeHookGeometry({ bladeWidth: 0 })).toThrow(
      /model.bladeWidth/,
    );
    expect(() => createTapeHookGeometry({ scale: -1 })).toThrow(/model.scale/);
    expect(() => createTapeHookMaterials({ steelRoughness: 2 })).toThrow(
      /materials.steel.roughness/,
    );
    expect(() => createTapeHookMaterials({ steelColor: "red" })).toThrow(
      /materials.steel.color/,
    );
  });
});
