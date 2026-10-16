import assert from "node:assert/strict";
import { describe, it, expect } from "vitest";
import {
  createCableTiePack,
  inspectCableTiePack,
  evaluateCableTiePackFrame,
} from "../../packages/animation-engine/src/mechanism/cable-tie-pack.ts";
import {
  createMechanismFamilyAuthoring,
  applyMechanismFamilyPatch,
  inspectMechanismFamilyAuthoring,
} from "../../packages/animation-engine/src/mechanism/family-authoring.ts";
import { inspectMechanismFamilyRegistry } from "../../packages/animation-engine/src/mechanism/family-registry.ts";
import { createMechanismTeachingTopology } from "../../packages/renderer-core/src/mechanism/teaching-topology.ts";
import { sampleFixedRootPawl } from "../../packages/renderer-core/src/mechanism/teaching-pawl.ts";
import { MechanismTeachingShapeSchema } from "@still-shift/scene-contract";
import { transformPoint } from "../../packages/renderer-core/src/mechanism/matrix.ts";
const variant = "inside-serrated-extended-trigger-cutaway" as const;
function closed(positions: number[], indices: readonly number[]) {
  const edges = new Map<string, number>();
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = indices
      .slice(i, i + 3)
      .map((v) => JSON.stringify(positions.slice(v * 3, v * 3 + 3)));
    for (let j = 0; j < 3; j++) {
      const key = [triangle[j]!, triangle[(j + 1) % 3]!].sort().join("|");
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  assert(
    [...edges.values()].every((count) => count === 2),
    "Physical pawl surface has an open/nonmanifold edge",
  );
}
describe("inside-serrated extended-trigger candidate", () => {
  it("preserves original defaults and publishes a distinct bounded source/metadata reference", () => {
    const p = createCableTiePack(),
      candidate = createCableTiePack({ variant }),
      receipt = inspectCableTiePack(variant);
    expect(p.sourceSha256).toBe(
      "sha256:3a59ce85a880bf2f92d90b4cdbbbe9336b44d607b40c13836b8f6888f9f5af5d",
    );
    expect(inspectCableTiePack().sha256).toBe(
      "sha256:c4243b4d3f4ae14561f955eff5874d1954adabf944d4daf96ca27d48b22b7a7c",
    );
    expect(p.scene.teachingShapes[0]!.landmarks.map((l) => l.id)).toEqual([
      "root",
      "tip",
    ]);
    expect(
      candidate.scene.teachingShapes[0]!.landmarks.map((l) => l.id),
    ).toEqual(["root", "tip", "trigger"]);
    expect(candidate.pack.variant).toBe(variant);
    expect(receipt.pack.status).toBe("candidate");
    expect(receipt.sha256).not.toBe(inspectCableTiePack().sha256);
    expect(Buffer.byteLength(JSON.stringify(receipt))).toBeLessThanOrEqual(
      32768,
    );
    expect(
      candidate.scene.geometry.meshes
        .filter((m) => m.id.startsWith("strap.tooth."))
        .every((m) => m.bounds.max[1] <= -0.12 + 1e-7),
    ).toBe(true);
    expect(candidate.scene.parts.map((p) => p.id)).toContain("bundle");
    expect(
      receipt.pack.cameraTargets.find((t) => t.id === "macro")!.target.id,
    ).toBe("release.trigger");
  });
  it("keeps the original non-releasable guard, rejects engaged reverse and admits released withdrawal", () => {
    const p = createCableTiePack({ variant }),
      control = {
        type: "ratchet" as const,
        position: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 10, value: 0.5 },
            { frame: 20, value: 0.5 },
            { frame: 30, value: 0 },
          ],
        },
        latchKeys: [
          { frame: 0, state: "engaged" as const },
          { frame: 20, state: "released" as const },
          { frame: 35, state: "engaged" as const },
        ],
      };
    expect(() =>
      evaluateCableTiePackFrame(createCableTiePack(), {
        frame: 0,
        width: 640,
        height: 360,
        rigControls: { ratchet: control },
      }),
    ).toThrow(/no release/);
    for (const frame of [0, 5, 10, 20, 25, 30, 35])
      expect(
        evaluateCableTiePackFrame(p, {
          frame,
          width: 640,
          height: 360,
          rigControls: { ratchet: control },
        }).check.status,
      ).toBe("passed");
    expect(() =>
      evaluateCableTiePackFrame(p, {
        frame: 0,
        width: 640,
        height: 360,
        rigControls: {
          ratchet: { ...control, latchKeys: [{ frame: 0, state: "engaged" }] },
        },
      }),
    ).toThrow(/reverse/);
  });
  it("samples one closed topology with fixed root, catch and wider trigger across the full scalar envelope", () => {
    const p = createCableTiePack({ variant }),
      shape = p.scene.teachingShapes[0]!;
    assert(shape.generator === "fixed-root-pawl-curve-1");
    const topology = createMechanismTeachingTopology(shape);
    expect(
      topology.landmarks.find((l) => l.id === "tip")!.vertexIndices[0],
    ).toBe(shape.parameters.longitudinalSegments * 4);
    for (let i = 0; i <= 20; i++) {
      const sampled = sampleFixedRootPawl(shape, i / 20);
      closed(sampled.positions, topology.indices);
      expect(sampled.positions.length / 3).toBe(topology.vertices);
      for (let n = 0; n < sampled.normals.length; n += 3)
        expect(Math.hypot(...sampled.normals.slice(n, n + 3))).toBeCloseTo(
          1,
          12,
        );
    }
    const request = (state: "engaged" | "released") => ({
      frame: 0,
      width: 640,
      height: 360,
      rigControls: {
        ratchet: {
          type: "ratchet" as const,
          position: { value: 0 },
          latchKeys: [{ frame: 0, state }],
        },
      },
    });
    const seated = evaluateCableTiePackFrame(p, request("engaged")).frame,
      released = evaluateCableTiePackFrame(p, request("released")).frame;
    expect(released.anchors["pawl.root"]!.world).toEqual(
      seated.anchors["pawl.root"]!.world,
    );
    const catchDelta =
        released.anchors["pawl.tip"]!.world[1] -
        seated.anchors["pawl.tip"]!.world[1],
      triggerDelta =
        released.anchors["release.trigger"]!.world[1] -
        seated.anchors["release.trigger"]!.world[1];
    expect(catchDelta).toBeLessThan(-0.3);
    expect(triggerDelta).toBeLessThan(catchDelta);
    const frame = released.shapeStates.pawl!,
      matrix = released.parts[frame.ownerPart]!.worldMatrix,
      points = [];
    for (let i = 0; i < frame.positions.length; i += 3)
      points.push(
        transformPoint(
          matrix,
          frame.positions.slice(i, i + 3) as [number, number, number],
        ),
      );
    expect(Math.max(...points.map((p) => p[1]))).toBeLessThan(-0.4);
  });
  it("retains strict trigger envelopes/landmarks and saved-family/CAS identity", () => {
    const p = createCableTiePack({ variant }),
      shape = structuredClone(p.scene.teachingShapes[0]!);
    assert(shape.generator === "fixed-root-pawl-curve-1");
    shape.parameters.trigger!.length = 10;
    expect(MechanismTeachingShapeSchema.safeParse(shape).success).toBe(false);
    const current = createMechanismFamilyAuthoring("cable-tie", "release", {
        variant,
      }),
      changed = applyMechanismFamilyPatch(current.document, {
        schemaVersion: "mechanism-family-patch-1",
        baseRevision: current.document.revision,
        baseHash: current.projectHash,
        operations: [{ property: "parameter", id: "pitch", value: 0.6 }],
      });
    expect(
      inspectMechanismFamilyAuthoring(changed.document).instance.pack,
    ).toEqual(current.instance.pack);
    expect(() =>
      createCableTiePack({ variant, expectedPack: createCableTiePack().pack }),
    ).toThrow(/revision|variant/);
    const registry = inspectMechanismFamilyRegistry({
      schemaVersion: "mechanism-family-registry-1",
      family: "cable-tie",
    }).entries[0]!;
    expect(registry.examples.map((e) => e.id)).toEqual([
      "default",
      "inside-release",
      "load-stop",
    ]);
    expect(registry.variants.map((v) => v.id)).toContain(variant);
  });
});
