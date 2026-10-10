import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import type { MechanismMesh } from "@still-shift/scene-contract";
import {
  createMechanismPrimitiveMesh,
  createMechanismPrimitiveGeometry,
  admitMechanismPrimitive,
  MechanismPrimitiveInputSchema,
  MechanismPrimitiveAdmissionError,
  type MechanismPrimitiveInput,
} from "../../packages/animation-engine/src/mechanism/primitive-mesh.ts";
import { mechanismPrimitiveExamples } from "../helpers/mechanism-primitive-fixtures.ts";

function meshHash(mesh: MechanismMesh) {
  return createHash("sha256").update(JSON.stringify(mesh)).digest("hex");
}
function assertClosedOutward(mesh: MechanismMesh) {
  const edges = new Map<string, number>();
  const point = (i: number) => mesh.positions.slice(i * 3, i * 3 + 3);
  const key = (i: number) =>
    point(i)
      .map((v) => Math.round(v * 100000))
      .join(",");
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const indices = mesh.indices.slice(i, i + 3),
      [a, b, c] = indices.map(point);
    const ab = b!.map((v, axis) => v - a![axis]!),
      ac = c!.map((v, axis) => v - a![axis]!);
    const cross = [
      ab[1]! * ac[2]! - ab[2]! * ac[1]!,
      ab[2]! * ac[0]! - ab[0]! * ac[2]!,
      ab[0]! * ac[1]! - ab[1]! * ac[0]!,
    ];
    const dot = cross.reduce(
      (sum, v, axis) =>
        sum +
        v *
          indices.reduce((n, index) => n + mesh.normals[index * 3 + axis]!, 0),
      0,
    );
    expect(
      dot,
      `${mesh.id}: outward nondegenerate triangle${i / 3}`,
    ).toBeGreaterThan(0);
    for (let j = 0; j < 3; j++) {
      const edge = [key(indices[j]!), key(indices[(j + 1) % 3]!)]
        .sort()
        .join(";");
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  expect(
    [...edges.values()].every((count) => count === 2),
    `${mesh.id}: closed geometric edge membership`,
  ).toBe(true);
}
describe("bounded shared mechanism primitives", () => {
  for (const input of mechanismPrimitiveExamples()) {
    it(`constructs deterministic closed outward ${input.id} within prospective admission`, () => {
      const mesh = createMechanismPrimitiveMesh(input),
        { admission } = admitMechanismPrimitive(input);
      expect(meshHash(createMechanismPrimitiveMesh(input))).toBe(
        meshHash(mesh),
      );
      expect(mesh.positions.length / 3).toBeLessThanOrEqual(
        admission.verticesUpperBound,
      );
      expect(mesh.indices.length / 3).toBeLessThanOrEqual(
        admission.trianglesUpperBound,
      );
      expect(mesh.uvs?.length).toBe((mesh.positions.length / 3) * 2);
      assertClosedOutward(mesh);
    });
  }
  it("keeps extruded holes open through both caps, including bevels", () => {
    for (const input of mechanismPrimitiveExamples().filter(
      (v) => v.kind === "extruded-profile",
    )) {
      const mesh = createMechanismPrimitiveMesh(input);
      for (let i = 0; i < mesh.indices.length; i += 3) {
        const vertices = mesh.indices
          .slice(i, i + 3)
          .map((index) => mesh.positions.slice(index * 3, index * 3 + 3));
        if (vertices.every((v) => v[2] === vertices[0]![2])) {
          const x = vertices.reduce((sum, v) => sum + v[0]!, 0) / 3,
            y = vertices.reduce((sum, v) => sum + v[1]!, 0) / 3;
          expect(Math.abs(x) < 0.29 && Math.abs(y) < 0.29).toBe(false);
        }
      }
    }
  });
  it("accepts zero rounding as a box and a closed cone without degenerate faces", () => {
    assertClosedOutward(
      createMechanismPrimitiveMesh({
        id: "box",
        partId: "root",
        materialId: "paint",
        kind: "rounded-box",
        size: [1, 1, 1],
        radius: 0,
      }),
    );
    assertClosedOutward(
      createMechanismPrimitiveMesh({
        id: "cone",
        partId: "root",
        materialId: "paint",
        kind: "cylinder",
        radiusTop: 0,
        radiusBottom: 1,
        height: 2,
      }),
    );
  });
  it("rejects collapsed dimensions, reversed paths and spring clearance before generation", () => {
    const identity = { id: "invalid", partId: "root", materialId: "paint" };
    const invalid: MechanismPrimitiveInput[] = [
      { ...identity, kind: "rounded-box", size: [1, 1, 1], radius: 0.5 },
      {
        ...identity,
        kind: "cylinder",
        radiusTop: 0,
        radiusBottom: 0,
        height: 1,
      },
      { ...identity, kind: "torus", radius: 1, tubeRadius: 1 },
      {
        ...identity,
        kind: "coil",
        radius: 1,
        wireRadius: 0.1,
        pitch: 0.2,
        turns: 2,
      },
      {
        ...identity,
        kind: "coil",
        radius: 1,
        wireRadius: 0.1,
        pitch: 0.3,
        turns: 12,
        tubularSegments: 16,
      },
      {
        ...identity,
        kind: "swept-ribbon",
        points: [
          [0, 0, 0],
          [1, 0, 0],
          [0, 0, 0],
        ],
        width: 0.2,
        thickness: 0.1,
      },
    ];
    for (const input of invalid)
      expect(() => createMechanismPrimitiveMesh(input)).toThrow();
  });
  it("rejects crossing, external, nested and touching profile holes with located paths", () => {
    const base = {
      id: "profile",
      partId: "root",
      materialId: "paint",
      kind: "extruded-profile" as const,
      points: [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as [number, number][],
      depth: 0.3,
    };
    for (const input of [
      { ...base, holes: [[]] },
      { ...base, points: [] },
      {
        ...base,
        points: [
          [-1, -1],
          [1, 1],
          [1, -1],
          [-1, 1],
        ],
      },
      {
        ...base,
        holes: [
          [
            [2, 2],
            [3, 2],
            [3, 3],
            [2, 3],
          ],
        ],
      },
      {
        ...base,
        holes: [
          [
            [-1, -0.2],
            [-0.5, -0.2],
            [-0.5, 0.2],
            [-1, 0.2],
          ],
        ],
      },
      {
        ...base,
        holes: [
          [
            [-0.5, -0.5],
            [0.5, -0.5],
            [0.5, 0.5],
            [-0.5, 0.5],
          ],
          [
            [-0.2, -0.2],
            [0.2, -0.2],
            [0.2, 0.2],
            [-0.2, 0.2],
          ],
        ],
      },
      { ...base, bevel: { size: 1.01, thickness: 0.1 } },
    ]) {
      const parsed = MechanismPrimitiveInputSchema.safeParse(input);
      expect(parsed.success).toBe(false);
      if (!parsed.success)
        expect(
          parsed.error.issues.some((v) =>
            ["points", "holes", "bevel"].includes(String(v.path[0])),
          ),
        ).toBe(true);
    }
  });
  it("admits complete catalogues and preserves physical meshes through material edits", () => {
    const meshes = mechanismPrimitiveExamples(),
      material = {
        id: "paint",
        color: "#cc8844",
        roughness: 0.5,
        metalness: 0,
      };
    const first = createMechanismPrimitiveGeometry({
        meshes,
        materials: [material],
      }),
      second = createMechanismPrimitiveGeometry({
        meshes,
        materials: [{ ...material, roughness: 0, color: "#0099cc" }],
      });
    expect(second.meshes).toEqual(first.meshes);
    expect(second.materials).not.toEqual(first.materials);
  });
  it("rejects oversized single/cumulative catalogues and unknown materials before construction", () => {
    const largest: MechanismPrimitiveInput = {
      id: "large",
      partId: "root",
      materialId: "paint",
      kind: "coil",
      radius: 1,
      wireRadius: 0.1,
      pitch: 0.3,
      turns: 12,
      radialSegments: 32,
      tubularSegments: 256,
    };
    expect(() => admitMechanismPrimitive(largest)).toThrow(
      MechanismPrimitiveAdmissionError,
    );
    const meshes = Array.from({ length: 16 }, (_, i) => ({
      id: `torus${i}`,
      partId: "root",
      materialId: "paint",
      kind: "torus" as const,
      radius: 1,
      tubeRadius: 0.1,
      radialSegments: 32,
      tubularSegments: 128,
    }));
    const materials = [
      { id: "paint", color: "#ffffff", roughness: 0.5, metalness: 0 },
    ];
    expect(() =>
      createMechanismPrimitiveGeometry({ meshes, materials }),
    ).toThrow(MechanismPrimitiveAdmissionError);
    expect(() =>
      createMechanismPrimitiveGeometry({
        meshes: [meshes[0]!],
        materials: [{ ...materials[0]!, id: "other" }],
      }),
    ).toThrow(/material/);
  });
});
