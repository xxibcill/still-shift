import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MechanismGeometrySchema,
  MechanismSceneSchema,
} from "@still-shift/scene-contract";
import {
  canonicalMechanismJson,
  prepareMechanismScene,
  evaluateMechanismFrame,
} from "@still-shift/renderer-core";
import {
  createTapeHookGeometry,
  createTapeHookMaterials,
  TAPE_HOOK_MARKER_PARTS,
  TAPE_HOOK_RIVET_MESH_IDS,
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
      let coveredIndices = 0;
      for (const group of mesh.groups) {
        expect(group.start).toBe(coveredIndices);
        expect(group.count % 3).toBe(0);
        expect(group.count).toBeGreaterThan(0);
        expect(Number.isInteger(group.materialIndex)).toBe(true);
        expect(group.materialIndex).toBeGreaterThanOrEqual(0);
        expect(group.materialIndex).toBeLessThan(catalog.materials.length);
        coveredIndices += group.count;
      }
      expect(coveredIndices).toBe(mesh.indices.length);
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

  it("assigns graduations only to explicit top triangles and metal to the underside and closed walls", () => {
    const catalog = createTapeHookGeometry();
    const blade = meshById(catalog.meshes, "blade-curved");
    const topVertexCount = 81 * 25;
    expect(blade.groups).toHaveLength(3);
    const [top, underside, walls] = blade.groups;
    const groupIndices = (group: IndexedMechanismMesh["groups"][number]) =>
      blade.indices.slice(group.start, group.start + group.count);
    expect(catalog.materials[top!.materialIndex]!.id).toBe("blade");
    expect(catalog.materials[underside!.materialIndex]!.id).toBe("edges");
    expect(catalog.materials[walls!.materialIndex]!.id).toBe("edges");
    expect(top!.count).toBe(80 * 24 * 6);
    expect(underside!.count).toBe(top!.count);
    expect(walls!.count).toBe((80 + 24) * 2 * 6);
    expect(groupIndices(top!).every((index) => index < topVertexCount)).toBe(
      true,
    );
    expect(
      groupIndices(underside!).every((index) => index >= topVertexCount),
    ).toBe(true);
    const topPositions = new Set(
      groupIndices(top!).map((index) => vertex(blade, index).join(",")),
    );
    const undersidePositions = new Set(
      groupIndices(underside!).map((index) => vertex(blade, index).join(",")),
    );
    for (
      let triangle = walls!.start;
      triangle < blade.indices.length;
      triangle += 3
    ) {
      const points = blade.indices
        .slice(triangle, triangle + 3)
        .map((index) => vertex(blade, index).join(","));
      expect(points.some((point) => topPositions.has(point))).toBe(true);
      expect(points.some((point) => undersidePositions.has(point))).toBe(true);
    }
    expect(signedVolume(blade)).toBeGreaterThan(0);
    expect(new Set(positionalEdges(blade).values())).toEqual(new Set([2]));
    const floor = meshById(catalog.meshes, "studio-floor");
    expect(floor.bounds.max[0] - floor.bounds.min[0]).toBeCloseTo(200, 5);
    expect(floor.bounds.max[2] - floor.bounds.min[2]).toBeCloseTo(200, 5);
    expect(floor.bounds.max[1]).toBeCloseTo(-1.5, 5);
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

  it("serializes solid explanatory markers at original Y-up coordinates without changing physical mesh dimensions", () => {
    for (const hookThickness of [0.04, 0.18, 0.35]) {
      const catalog = createTapeHookGeometry({ hookThickness });
      expect(TAPE_HOOK_MARKER_PARTS).toEqual({
        datum: { id: "datum" },
        thickness: { id: "thickness", parent: "hook" },
        travel: { id: "travel", parent: "model" },
      });
      const markers = catalog.meshes.filter((mesh) =>
        ["datum", "thickness", "travel"].includes(mesh.partId),
      );
      expect(markers).toHaveLength(7);
      expect(markers.every((mesh) => mesh.materialId === "teal")).toBe(true);
      for (const marker of markers)
        expect(new Set(positionalEdges(marker).values()), marker.id).toEqual(
          new Set([2]),
        );
      const datum = meshById(markers, "datum-line");
      expect(datum.bounds.min[1]).toBeCloseTo(-0.05, 6);
      expect(datum.bounds.max[1]).toBeCloseTo(2.8, 6);
      expect(datum.bounds.min[0]).toBeCloseTo(-0.012, 6);
      expect(datum.bounds.max[0]).toBeCloseTo(0.012, 6);
      expect((datum.bounds.min[2] + datum.bounds.max[2]) / 2).toBeCloseTo(
        1.15,
        6,
      );
      const thickness = meshById(markers, "thickness-crossbar");
      const travel = meshById(markers, "travel-crossbar");
      expect(thickness.bounds.min[0]).toBeCloseTo(-hookThickness, 6);
      expect(thickness.bounds.max[0]).toBeCloseTo(0, 6);
      expect(travel.bounds.min[0]).toBeCloseTo(0.72 - hookThickness, 6);
      expect(travel.bounds.max[0]).toBeCloseTo(0.72, 6);
      expect(thickness.bounds.max[0] - thickness.bounds.min[0]).toBeCloseTo(
        catalog.dimensions.hookThickness,
        6,
      );
      expect(travel.bounds.max[0] - travel.bounds.min[0]).toBeCloseTo(
        catalog.dimensions.hookTravel,
        6,
      );
      expect(catalog.dimensions.datumMarkerMidpoint).toEqual([0, 1.375, 1.15]);
      expect(catalog.dimensions.thicknessMarkerMidpoint).toEqual([
        -hookThickness / 2,
        1.18,
        1.2,
      ]);
      expect(catalog.dimensions.travelMarkerMidpoint).toEqual([
        0.72 - hookThickness / 2,
        2.22,
        0.47,
      ]);
      for (const [mesh, midpoint] of [
        [datum, catalog.dimensions.datumMarkerMidpoint],
        [thickness, catalog.dimensions.thicknessMarkerMidpoint],
        [travel, catalog.dimensions.travelMarkerMidpoint],
      ] as const)
        for (let axis = 0; axis < 3; axis++)
          expect(
            (mesh.bounds.min[axis]! + mesh.bounds.max[axis]!) / 2,
          ).toBeCloseTo(midpoint[axis]!, 6);
    }
    const original = createTapeHookGeometry();
    const styled = createTapeHookMaterials({
      steelColor: "#ffffff",
      steelMetalness: 0,
    });
    expect(styled.find((material) => material.id === "teal")).toEqual(
      original.materials.find((material) => material.id === "teal"),
    );
    expect(createTapeHookGeometry().meshes).toEqual(original.meshes);
    expect(original.meshes.some((mesh) => mesh.id.includes("glow"))).toBe(
      false,
    );
  });

  it("moves thickness with the hook while travel follows the model and the world datum stays fixed", () => {
    const catalog = createTapeHookGeometry();
    const scene = MechanismSceneSchema.parse({
      schemaVersion: "mechanism-scene-1",
      id: "marker-rig",
      coordinateSystem: "right-handed-y-up",
      units: { kind: "illustrative", scaleToMeters: 0.01 },
      geometry: catalog,
      geometrySha256: `sha256:${createHash("sha256").update(canonicalMechanismJson(catalog)).digest("hex")}`,
      parts: [
        { id: "model" },
        { id: "hook", parent: "model" },
        { id: "blade", parent: "model" },
        { id: "housing", parent: "model" },
        { id: "board" },
        { id: "wall" },
        { id: "floor" },
        ...Object.values(TAPE_HOOK_MARKER_PARTS),
      ],
      rigs: [
        {
          id: "slider",
          type: "tape-hook-slider",
          rootPart: "model",
          hookPart: "hook",
          bladePart: "blade",
          rivetMeshIds: [...TAPE_HOOK_RIVET_MESH_IDS],
          thickness: 0.18,
          contactMode: "free",
        },
      ],
      anchors: [
        {
          id: "hook.innerFace",
          part: "hook",
          position: [0, 1.25, 0],
          role: "physical-inner-face",
        },
        {
          id: "hook.outerFace",
          part: "hook",
          position: [-0.18, 1.25, 0],
          role: "physical-outer-face",
        },
      ],
      camera: {
        position: [-4, 5, 6],
        target: [0.8, 1.25, 0],
        fovDegrees: 36,
        near: 0.03,
        far: 100,
      },
      profile: {
        toneMapping: "aces-filmic",
        exposure: 1.14,
        output: "srgb-rgba8-straight",
      },
      lights: [],
    });
    const prepared = prepareMechanismScene(scene);
    for (const contactMode of ["free", "pull", "push"] as const) {
      const at = (travel: number) =>
        evaluateMechanismFrame(prepared, {
          frame: 0,
          width: 160,
          height: 284,
          controls: { slider: { travel, contactMode } },
        });
      const first = at(0),
        last = at(1);
      const displacement = (part: string) =>
        last.parts[part]!.worldMatrix[12]! -
        first.parts[part]!.worldMatrix[12]!;
      expect(displacement("datum")).toBeCloseTo(0, 8);
      expect(displacement("travel")).toBeCloseTo(
        contactMode === "free" ? 0 : -0.18,
        8,
      );
      expect(displacement("thickness")).toBeCloseTo(
        contactMode === "free" ? 0.18 : 0,
        8,
      );
      expect(displacement("blade")).toBeCloseTo(displacement("model"), 8);
      expect(first.assertions.every((assertion) => assertion.passed)).toBe(
        true,
      );
      expect(last.assertions.every((assertion) => assertion.passed)).toBe(true);
    }
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
