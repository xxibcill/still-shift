import assert from "node:assert/strict";
import { describe, it, expect } from "vitest";
import {
  createClothespegPack,
  inspectClothespegPack,
  evaluateClothespegPackFrame,
  ClothespegPackInputSchema,
} from "../../packages/animation-engine/src/mechanism/clothespeg-pack.ts";
import {
  createMechanismFamilyAuthoring,
  inspectMechanismFamilyAuthoring,
  applyMechanismFamilyPatch,
} from "../../packages/animation-engine/src/mechanism/family-authoring.ts";
import { inspectMechanismFamilyRegistry } from "../../packages/animation-engine/src/mechanism/family-registry.ts";
import { prepareMechanismSceneV2 } from "../../packages/renderer-core/src/mechanism/prepare-v2.ts";
import { evaluateMechanismFrameV2 } from "../../packages/renderer-core/src/mechanism/evaluate-v2.ts";
import { transformPoint } from "../../packages/renderer-core/src/mechanism/matrix.ts";
import type { MechanismMesh } from "@still-shift/scene-contract";
type Point = [number, number, number];
function crossSection(mesh: MechanismMesh): [Point, Point][] {
  const segments: [Point, Point][] = [];
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const vertices = mesh.indices
        .slice(offset, offset + 3)
        .map(
          (index) => mesh.positions.slice(index * 3, index * 3 + 3) as Point,
        ),
      hits: Point[] = [];
    for (let i = 0; i < 3; i++) {
      const a = vertices[i]!,
        b = vertices[(i + 1) % 3]!;
      if (a[2] * b[2] >= 0) continue;
      const t = -a[2] / (b[2] - a[2]);
      hits.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), 0]);
    }
    if (hits.length === 2) segments.push([hits[0]!, hits[1]!]);
  }
  return segments;
}
function segmentDistance(point: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    d = dx * dx + dy * dy;
  assert(d > 0);
  const t = Math.max(
    0,
    Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / d),
  );
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
}
describe("notched jaws and round-line candidate", () => {
  it("preserves default identities and declares a separate bounded factual candidate", () => {
    expect(createClothespegPack().sourceSha256).toBe(
      "sha256:f2d265adfc6d94480063abfb7a82a4cbec36111299025bd49156e1281143939e",
    );
    expect(inspectClothespegPack().sha256).toBe(
      "sha256:1d6050d5ac18a16722e3766bf8da86a4f0c418012d50e3a15a6eeadd1b7ac281",
    );
    const p = createClothespegPack({ variant: "notched-line" }),
      m = inspectClothespegPack("notched-line");
    expect(p.pack.variant).toBe("notched-line");
    expect(m.pack.status).toBe("candidate");
    expect(m.sha256).not.toBe(inspectClothespegPack().sha256);
    expect(m.pack.parameters.map((p) => p.id)).toEqual([
      "armLength",
      "armWidth",
      "lineRadius",
    ]);
    expect(m.pack.factualVariant.sources[0]!.url).toContain("US2590881A");
    expect(Buffer.byteLength(JSON.stringify(m))).toBeLessThanOrEqual(32768);
    expect(JSON.stringify(m)).not.toMatch(
      /"(?:positions|normals|indices|uvs|pixels)"/,
    );
    expect(p.scene.parts.map((p) => p.id)).toContain("line");
    expect(p.scene.parts.map((p) => p.id)).not.toContain("cloth");
    expect(
      p.scene.geometry.meshes.find((m) => m.id === "line.round"),
    ).toBeDefined();
    expect(p.scene.relationships.map((r) => r.id)).toContain("upper.line.gap");
    expect(p.scene.relationships.map((r) => r.id)).not.toContain(
      "upper.cloth.gap",
    );
    expect(m.pack.cameraTargets.find((t) => t.id === "macro")!.target.id).toBe(
      "line.front",
    );
  });
  it("admits only the selected variant's actual parameters and immutable reference", () => {
    expect(() =>
      createClothespegPack({
        variant: "notched-line",
        parameters: { lineRadius: 0.3 },
      }),
    ).toThrow();
    expect(
      ClothespegPackInputSchema.safeParse({
        variant: "notched-line",
        parameters: { clothThickness: 0.16 },
      }).success,
    ).toBe(false);
    expect(
      ClothespegPackInputSchema.safeParse({ parameters: { lineRadius: 0.16 } })
        .success,
    ).toBe(false);
    expect(() =>
      createClothespegPack({
        variant: "notched-line",
        expectedPack: createClothespegPack().pack,
      }),
    ).toThrow(/revision|variant/);
  });
  it("round trips saved family, CAS line-radius changes and truthful discovery schemas", () => {
    const current = createMechanismFamilyAuthoring("clothespeg", "line", {
      variant: "notched-line",
    });
    expect(
      inspectMechanismFamilyAuthoring(
        JSON.parse(JSON.stringify(current.document)),
      ).instance.sourceSha256,
    ).toBe(current.instance.sourceSha256);
    const patch = {
      schemaVersion: "mechanism-family-patch-1",
      baseRevision: current.document.revision,
      baseHash: current.projectHash,
      operations: [{ property: "parameter", id: "lineRadius", value: 0.18 }],
    };
    const changed = applyMechanismFamilyPatch(current.document, patch),
      reopened = inspectMechanismFamilyAuthoring(changed.document);
    expect(reopened.instance.pack).toEqual(current.instance.pack);
    expect(reopened.instance.sourceSha256).not.toBe(
      current.instance.sourceSha256,
    );
    expect(() => applyMechanismFamilyPatch(changed.document, patch)).toThrow(
      /changed since/,
    );
    const registry = inspectMechanismFamilyRegistry({
      schemaVersion: "mechanism-family-registry-1",
      family: "clothespeg",
    }).entries[0]!;
    expect(registry.examples.map((e) => e.id)).toEqual([
      "default",
      "notched-line",
    ]);
    expect(registry.variants.map((v) => v.id)).toEqual([
      "wood-arms-central-spring-cloth",
      "notched-line",
    ]);
    expect(registry.variants[1]).toMatchObject({
      parameterSchema: "notched-line-parameters",
    });
  });
  it("maintains mounted seated contacts and rejects closing through the line", () => {
    const p = createClothespegPack({
      variant: "notched-line",
      mount: {
        position: [3, 2, -1],
        rotation: [0.1, 0.2, 0.35],
        scale: [1.1, 0.9, 1],
        pivot: [0, 0, 0],
      },
    });
    for (const q of [0, 0.16, 0.04, 0.16, 0])
      expect(
        evaluateClothespegPackFrame(p, {
          frame: 0,
          width: 640,
          height: 360,
          rigControls: {
            "upper.hinge": { type: "hinge", value: -q },
            "lower.hinge": { type: "hinge", value: q },
          },
        }).check.status,
      ).toBe("passed");
    expect(() =>
      evaluateClothespegPackFrame(p, {
        frame: 5,
        width: 640,
        height: 360,
        rigControls: {
          "upper.hinge": { type: "hinge", value: 0.005 },
          "lower.hinge": { type: "hinge", value: -0.005 },
        },
      }),
    ).toThrow(/relationship/);
  });
  it("independently slices actual jaw triangles and keeps the round line outside both jaw solids", () => {
    let states = 0,
      minimum = Infinity;
    for (const armLength of [5, 6, 8])
      for (const [index, lineRadius] of [0.08, 0.16, 0.18].entries()) {
        const armWidth = [0.6, 0.8, 1.1][index]!,
          p = createClothespegPack({
            variant: "notched-line",
            parameters: { armLength, armWidth, lineRadius },
          }),
          prepared = prepareMechanismSceneV2(p.scene),
          sections = ["upper", "lower"].map((id) => ({
            id,
            edges: crossSection(
              p.scene.geometry.meshes.find((m) => m.id === id + ".arm")!,
            ),
          }));
        for (const section of sections) assert(section.edges.length > 20);
        for (let frame = 0; frame <= 36; frame++) {
          const q = frame * 0.005,
            state = evaluateMechanismFrameV2(prepared, {
              frame,
              width: 640,
              height: 360,
              rigControls: {
                "upper.hinge": { type: "hinge", value: -q },
                "lower.hinge": { type: "hinge", value: q },
              },
            }),
            center = transformPoint(state.parts.line!.worldMatrix, [
              (-2.9 * armLength) / 6,
              0,
              0,
            ]);
          for (const section of sections) {
            const matrix = state.parts[section.id]!.worldMatrix;
            let distance = Infinity;
            for (const [a, b] of section.edges) {
              const wa = transformPoint(matrix, a),
                wb = transformPoint(matrix, b);
              assert(
                section.id === "upper"
                  ? Math.min(wa[1], wb[1]) > 0
                  : Math.max(wa[1], wb[1]) < 0,
              );
              distance = Math.min(distance, segmentDistance(center, wa, wb));
            }
            const clearance = distance - lineRadius;
            assert(
              clearance >= -1e-8,
              `Jaw penetrates authored circle: ${clearance}`,
            );
            if (frame === 0) assert(Math.abs(clearance) <= 1e-8);
            minimum = Math.min(minimum, clearance);
            states++;
          }
        }
      }
    expect(states).toBe(666);
    expect(minimum).toBeGreaterThanOrEqual(-1e-8);
  }, 30000);
});
