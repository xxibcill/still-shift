import assert from "node:assert/strict";
import { describe, it, expect } from "vitest";
import {
  MechanismSceneV2Schema,
  type MechanismMesh,
} from "@still-shift/scene-contract";
import {
  createTapeHookPack,
  inspectTapeHookPack,
  evaluateTapeHookPackFrame,
} from "../../packages/animation-engine/src/mechanism/tape-hook-pack.ts";
import {
  createMechanismFamilyAuthoring,
  inspectMechanismFamilyAuthoring,
  applyMechanismFamilyPatch,
} from "../../packages/animation-engine/src/mechanism/family-authoring.ts";
import { inspectMechanismFamilyRegistry } from "../../packages/animation-engine/src/mechanism/family-registry.ts";
const candidate = (h: number, width: number) => ({
  scene: createTapeHookPack({
    variant: "slotted-retention",
    parameters: { hookThickness: h, bladeWidth: width },
  }).scene,
  witness: { centers: [0.5, 1.2, 1.9], upperRadius: 0.085, lowerRadius: 0.055 },
});
type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross = (a: V, b: V): V => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
function triangles(mesh: MechanismMesh, y: number) {
  const vertex = (index: number): V =>
      mesh.positions.slice(index * 3, index * 3 + 3) as V,
    result: {
      a: V;
      e1: V;
      e2: V;
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    }[] = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = vertex(mesh.indices[i]!),
      b = vertex(mesh.indices[i + 1]!),
      c = vertex(mesh.indices[i + 2]!);
    if (Math.min(a[1], b[1], c[1]) > y || Math.max(a[1], b[1], c[1]) < y)
      continue;
    result.push({
      a,
      e1: sub(b, a),
      e2: sub(c, a),
      minX: Math.min(a[0], b[0], c[0]),
      maxX: Math.max(a[0], b[0], c[0]),
      minZ: Math.min(a[2], b[2], c[2]),
      maxZ: Math.max(a[2], b[2], c[2]),
    });
  }
  return result;
}
function nearest(
  origin: V,
  direction: V,
  candidates: ReturnType<typeof triangles>,
) {
  let distance = Infinity;
  for (const triangle of candidates) {
    const p = cross(direction, triangle.e2),
      det = dot(triangle.e1, p);
    if (Math.abs(det) < 1e-12) continue;
    const inverse = 1 / det,
      t = sub(origin, triangle.a),
      u = dot(t, p) * inverse;
    if (u < -1e-10 || u > 1 + 1e-10) continue;
    const q = cross(t, triangle.e1),
      v = dot(direction, q) * inverse;
    if (v < -1e-10 || u + v > 1 + 1e-10) continue;
    const d = dot(triangle.e2, q) * inverse;
    if (d > 1e-9) distance = Math.min(distance, d);
  }
  return distance;
}
describe("three-rivet slotted retention candidate", () => {
  it("preserves the original default source and metadata pins while admitting a distinct bounded candidate", () => {
    expect(createTapeHookPack().sourceSha256).toBe(
      "sha256:0a2db1877fe83eb7ee348b6c658b2396dd4a781b3a5c3ffaa413392e182245bc",
    );
    expect(inspectTapeHookPack().sha256).toBe(
      "sha256:5f7fa4100db1ecbb36eb62d2c036857b3740ded49e41856870aed2769e260dd5",
    );
    const receipt = inspectTapeHookPack("slotted-retention"),
      instance = createTapeHookPack({ variant: "slotted-retention" });
    expect(receipt.pack.status).toBe("candidate");
    expect(receipt.sha256).not.toBe(inspectTapeHookPack().sha256);
    expect(instance.pack.variant).toBe("slotted-retention");
    expect(instance.scene.pack).toEqual(instance.pack);
    expect(receipt.pack.factualVariant.sources[0]!.url).toContain("US4930227A");
    expect(Buffer.byteLength(JSON.stringify(receipt))).toBeLessThanOrEqual(
      32768,
    );
    expect(JSON.stringify(receipt)).not.toMatch(
      /"(?:positions|normals|indices|uvs|pixels)"/,
    );
    expect(MechanismSceneV2Schema.parse(instance.scene)).toEqual(
      instance.scene,
    );
    expect(
      instance.scene.geometry.meshes.filter((m) => m.id.endsWith(".top.mesh")),
    ).toHaveLength(3);
    expect(
      receipt.pack.cameraTargets.flatMap((t) =>
        t.framing.kind === "meshes" ? t.framing.ids : [],
      ),
    ).toContain("hook-retention-neck");
  });
  it("round trips saved family identity, CAS parameter revisions and registry examples", () => {
    const current = createMechanismFamilyAuthoring("tape-hook", "retention", {
      variant: "slotted-retention",
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
      operations: [{ property: "parameter", id: "bladeLength", value: 18 }],
    };
    const revised = inspectMechanismFamilyAuthoring(
      applyMechanismFamilyPatch(current.document, patch).document,
    );
    expect(revised.instance.pack).toEqual(current.instance.pack);
    expect(
      revised.instance.scene.geometry.meshes.find(
        (m) => m.id === "blade-retention-curved",
      )!.bounds.max[0],
    ).toBe(Math.fround(18 + 0.18 + 0.025));
    expect(() => applyMechanismFamilyPatch(revised.document, patch)).toThrow(
      /changed since/,
    );
    const registry = inspectMechanismFamilyRegistry({
      schemaVersion: "mechanism-family-registry-1",
      family: "tape-hook",
    }).entries[0]!;
    expect(registry.examples.map((e) => e.id)).toEqual([
      "default",
      "slotted-retention",
    ]);
    expect(registry.variants.map((v) => v.id)).toEqual([
      "floating-hook",
      "slotted-retention",
    ]);
    expect(() =>
      createTapeHookPack({
        variant: "slotted-retention",
        expectedPack: createTapeHookPack().pack,
      }),
    ).toThrow(/variant/);
  });
  it("keeps three stepped assemblies fixed and contacts legal through mounted random seeks", () => {
    const instance = createTapeHookPack({
      variant: "slotted-retention",
      parameters: { hookThickness: 0.35, bladeWidth: 3, bladeLength: 20 },
      mount: {
        position: [3, 2, -1],
        rotation: [0.1, 0.2, 0.35],
        scale: [1.1, 0.9, 1],
        pivot: [0, 0, 0],
      },
    });
    for (const q of [0, 0.35, 0.17, 0.35, 0]) {
      const state = evaluateTapeHookPackFrame(
        instance,
        {
          frame: 0,
          width: 640,
          height: 360,
          rigControls: { slider: { type: "slider", value: q } },
        },
        q === 0 ? "outside-pull" : q === 0.35 ? "inside-push" : "free",
      );
      expect(state.check.status).toBe("passed");
      for (let i = 1; i <= 3; i++)
        expect(
          state.frame.relationships[`retention.rivet.${i}.upper.fixed`]!
            .residual,
        ).toBeLessThan(1e-8);
    }
  });
  it("independently intersects actual slot/blade triangles across nine dimensions and thirteen travel states", () => {
    let rays = 0,
      minimumUpper = Infinity,
      minimumLower = Infinity;
    const results = [];
    for (const h of [0.04, 0.18, 0.35])
      for (const width of [1, 2, 3]) {
        const { scene, witness: w } = candidate(h, width),
          neck = scene.geometry.meshes.find(
            (m) => m.id === "hook-retention-neck",
          )!,
          blade = scene.geometry.meshes.find(
            (m) => m.id === "blade-retention-curved",
          )!,
          upperTriangles = triangles(neck, 2.07),
          lowerTriangles = triangles(blade, 1.95);
        let upper = Infinity,
          lower = Infinity;
        for (let frame = 0; frame <= 12; frame++)
          for (const center of w.centers) {
            const travel = (h * frame) / 12,
              upperOrigin: V = [center - travel, 2.07, 0],
              lowerOrigin: V = [center, 1.95, 0],
              near = (origin: V, list: ReturnType<typeof triangles>) =>
                list.filter(
                  (t) =>
                    t.minX <= origin[0] + 0.5 &&
                    t.maxX >= origin[0] - 0.5 &&
                    t.minZ <= 0.5 &&
                    t.maxZ >= -0.5,
                ),
              uc = near(upperOrigin, upperTriangles),
              lc = near(lowerOrigin, lowerTriangles);
            for (let angle = 0; angle < 64; angle++) {
              const direction: V = [
                  Math.cos((angle * Math.PI) / 32),
                  0,
                  Math.sin((angle * Math.PI) / 32),
                ],
                a = nearest(upperOrigin, direction, uc) - w.upperRadius,
                b = nearest(lowerOrigin, direction, lc) - w.lowerRadius;
              assert(Number.isFinite(a) && Number.isFinite(b));
              assert(a >= 0.012 - 1e-9, `Upper mesh clearance ${a}`);
              assert(b >= 0.0044, `Blade mesh clearance ${b}`);
              upper = Math.min(upper, a);
              lower = Math.min(lower, b);
              rays += 2;
            }
          }
        minimumUpper = Math.min(minimumUpper, upper);
        minimumLower = Math.min(minimumLower, lower);
        results.push({
          hookThickness: h,
          bladeWidth: width,
          minimumUpperMeshClearance: upper,
          minimumLowerMeshClearance: lower,
        });
      }
    expect(rays).toBe(44928);
    expect(minimumUpper).toBeGreaterThanOrEqual(0.012);
    expect(minimumLower).toBeGreaterThanOrEqual(0.0044);
  });
});
