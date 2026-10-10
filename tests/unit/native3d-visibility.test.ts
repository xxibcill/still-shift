import { afterEach, describe, expect, it, vi } from "vitest";
import { nativeScreenAnchors } from "../../packages/renderer-core/src/native3d/visibility.ts";
import * as matrixOperations from "../../packages/renderer-core/src/mechanism/matrix.ts";
import {
  IDENTITY_MATRIX,
  matrixFromTransform,
} from "../../packages/renderer-core/src/mechanism/matrix.ts";
import { projectMechanismAnchor } from "../../packages/renderer-core/src/mechanism/projection.ts";
import { nativeSolidFixture } from "../helpers/native3d-fixture.ts";

// Frozen pre-optimization algorithm from 3ac7d29f. It intentionally transforms
// every triangle vertex for every anchor, independently of the new reuse path.
import type {
  Native3DSource,
  NativeSceneFrame,
  NativeScreenAnchor,
  MechanismVector,
  MechanismMaterial,
} from "@still-shift/scene-contract";
import type { DeepReadonly } from "../../packages/renderer-core/src/native3d/types.ts";
import { transformPoint } from "../../packages/renderer-core/src/mechanism/matrix.ts";

const NATIVE_ANCHOR_ENDPOINT_EPSILON = 0.0001;
type Vec = readonly number[];
const sub = (a: Vec, b: Vec): MechanismVector => [
  a[0]! - b[0]!,
  a[1]! - b[1]!,
  a[2]! - b[2]!,
];
const dot = (a: Vec, b: Vec) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: Vec, b: Vec): MechanismVector => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!,
];

/** Möller–Trumbore in source world units, preserving authored front-side winding. */
function triangleDistance(
  origin: Vec,
  direction: Vec,
  a: Vec,
  b: Vec,
  c: Vec,
  side: "front" | "double",
): number | null {
  const edge1 = sub(b, a),
    edge2 = sub(c, a),
    p = cross(direction, edge2),
    determinant = dot(edge1, p);
  if (determinant === 0 || (side === "front" && determinant < 0)) return null;
  const inverse = 1 / determinant,
    offset = sub(origin, a),
    u = dot(offset, p) * inverse;
  if (u < -1e-12 || u > 1 + 1e-12) return null;
  const q = cross(offset, edge1),
    v = dot(direction, q) * inverse;
  if (v < -1e-12 || u + v > 1 + 1e-12) return null;
  const distance = dot(edge2, q) * inverse;
  return distance >= 0 && Number.isFinite(distance) ? distance : null;
}
const materialSurvives = (material: DeepReadonly<MechanismMaterial>) =>
  material.alphaMode !== "mask" || material.opacity >= material.alphaCutoff;

/** Physical catalogue only: floors and anchor-owning parts participate, graphics do not. */
function referenceScreenAnchors(
  source: DeepReadonly<Native3DSource>,
  frame: NativeSceneFrame,
): Record<string, NativeScreenAnchor> {
  const camera = frame.camera,
    forwardRaw = sub(camera.target, camera.position),
    forwardLength = Math.hypot(...forwardRaw);
  const forward = forwardRaw.map((value) => value / forwardLength);
  const materials = new Map(
    source.geometry.materials.map((material) => [material.id, material]),
  );
  return Object.fromEntries(
    Object.entries(frame.anchors).map(([id, anchor]) => {
      let visibility: NativeScreenAnchor["visibility"] =
        anchor.projectionVisibility === "in-frame"
          ? "visible"
          : anchor.projectionVisibility;
      let occluderMesh: string | undefined;
      if (visibility === "visible") {
        const segment = sub(anchor.world, camera.position),
          distance = Math.hypot(...segment),
          direction = segment.map((value) => value / distance);
        let closest = distance - NATIVE_ANCHOR_ENDPOINT_EPSILON;
        for (const mesh of source.geometry.meshes) {
          const part = frame.parts[mesh.partId]!;
          if (!part.visible) continue;
          for (let offset = 0; offset < mesh.indices.length; offset += 3) {
            const group = mesh.groups?.find(
              (entry) =>
                offset >= entry.start && offset < entry.start + entry.count,
            );
            const material = group
              ? source.geometry.materials[group.materialIndex]!
              : materials.get(mesh.materialId)!;
            if (!materialSurvives(material)) continue;
            const vertices = [0, 1, 2].map((index) => {
              const vertex = mesh.indices[offset + index]! * 3;
              return transformPoint(
                part.worldMatrix,
                mesh.positions.slice(vertex, vertex + 3),
              );
            });
            const hit = triangleDistance(
              camera.position,
              direction,
              vertices[0]!,
              vertices[1]!,
              vertices[2]!,
              material.side,
            );
            if (hit === null || hit >= closest) continue;
            const hitDepth = hit * dot(direction, forward);
            if (hitDepth < camera.near || hitDepth > camera.far) continue;
            closest = hit;
            occluderMesh = mesh.id;
          }
        }
        if (occluderMesh !== undefined) visibility = "occluded";
      }
      return [
        id,
        {
          ...anchor,
          visibility,
          visibilityMethod: "native-physical-mesh-segment" as const,
          ...(occluderMesh === undefined ? {} : { occluderMesh }),
        },
      ];
    }),
  );
}

function sourceFixture() {
  const source = nativeSolidFixture(),
    mesh = source.geometry.meshes[0]!;
  mesh.positions = [-2, -2, 0, 2, -2, 0, 2, 2, 0, -2, 2, 0];
  mesh.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
  mesh.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
  mesh.indices = [0, 1, 2, 0, 2, 3];
  source.anchors.push(
    {
      id: "second-behind",
      part: "child",
      position: [0.5, -0.5, -1],
      role: "proof-target",
    },
    {
      id: "within-endpoint",
      part: "child",
      position: [0, 0, -0.00005],
      role: "proof-target",
    },
    {
      id: "past-endpoint",
      part: "child",
      position: [0, 0, -0.0002],
      role: "proof-target",
    },
    {
      id: "camera-back",
      part: "child",
      position: [0, 0, 11],
      role: "proof-target",
    },
    {
      id: "far-anchor",
      part: "child",
      position: [0, 0, -101],
      role: "proof-target",
    },
  );
  return source;
}
function frameFixture(
  source: Native3DSource,
  pose = {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    pivot: [0, 0, 0],
  },
  hidden = false,
): NativeSceneFrame {
  const matrix = matrixFromTransform(pose);
  const parts = Object.fromEntries(
    source.parts.map((part) => [
      part.id,
      {
        id: part.id,
        ...(part.parent === undefined ? {} : { parent: part.parent }),
        localMatrix: part.parent === undefined ? matrix : IDENTITY_MATRIX,
        worldMatrix: matrix,
        visible: !hidden,
      },
    ]),
  );
  const anchors = Object.fromEntries(
    source.anchors.map((anchor) => [
      anchor.id,
      projectMechanismAnchor(
        anchor.id,
        anchor.part,
        transformPoint(matrix, anchor.position),
        !hidden,
        source.camera,
        320,
        180,
      ),
    ]),
  );
  return {
    version: "solid-evaluator-1",
    frame: 0.25,
    seed: 0,
    camera: source.camera,
    parts,
    anchors,
  };
}
afterEach(() => vi.restoreAllMocks());
describe("frame-local indexed native visibility reuse", () => {
  it("matches the frozen full scan exactly at fractional, nonuniform and reverse-seek poses", () => {
    const source = sourceFixture();
    for (const amount of [0, 0.125, 0.7, -0.4, 0.125, 0]) {
      const frame = frameFixture(source, {
        position: [amount, -amount / 3, amount / 7],
        rotation: [amount / 9, amount / 5, -amount / 11],
        scale: [1.25, 0.75, 1.125],
        pivot: [0.1, -0.2, 0.3],
      });
      const expected = referenceScreenAnchors(source, frame);
      expect(nativeScreenAnchors(source, frame)).toEqual(expected);
    }
  });
  it("preserves endpoint, mask-group, front winding, near/far and hidden classifications", () => {
    const base = sourceFixture(),
      mesh = base.geometry.meshes[0]!;
    const baseline = nativeScreenAnchors(base, frameFixture(base));
    expect(baseline.behind!.visibility).toBe("occluded");
    expect(baseline.face!.visibility).toBe("visible");
    expect(baseline["within-endpoint"]!.visibility).toBe("visible");
    expect(baseline["past-endpoint"]!.visibility).toBe("occluded");
    expect(baseline["camera-back"]!.visibility).toBe("behind-camera");
    expect(baseline["far-anchor"]!.visibility).toBe("clipped");

    const cases: Native3DSource[] = [];
    for (const opacity of [0.499999999999, 0.5, 1]) {
      const source = structuredClone(base);
      Object.assign(source.geometry.materials[0]!, {
        alphaMode: "mask",
        opacity,
        alphaCutoff: 0.5,
      });
      source.geometry.materials.push({
        ...source.geometry.materials[0]!,
        id: "other",
        alphaMode: "opaque",
        opacity: 1,
      });
      source.geometry.meshes[0]!.groups = [
        { start: 0, count: 3, materialIndex: 0 },
        { start: 3, count: 3, materialIndex: 1 },
      ];
      cases.push(source);
    }
    for (const side of ["front", "double"] as const) {
      const source = structuredClone(base);
      source.geometry.materials[0]!.side = side;
      source.geometry.meshes[0]!.indices = [2, 1, 0, 3, 2, 0];
      cases.push(source);
    }
    const near = structuredClone(base);
    near.camera.near = 10.5;
    cases.push(near);
    const far = structuredClone(base);
    far.camera.far = 9.5;
    cases.push(far);
    for (const source of cases)
      expect(nativeScreenAnchors(source, frameFixture(source))).toEqual(
        referenceScreenAnchors(source, frameFixture(source)),
      );
    expect(
      nativeScreenAnchors(cases[0]!, frameFixture(cases[0]!))["second-behind"]!
        .visibility,
    ).toBe("visible");
    expect(
      nativeScreenAnchors(cases[1]!, frameFixture(cases[1]!))["second-behind"]!
        .visibility,
    ).toBe("occluded");
    expect(
      nativeScreenAnchors(near, frameFixture(near)).behind!.visibility,
    ).toBe("visible");
    expect(
      nativeScreenAnchors(cases[3]!, frameFixture(cases[3]!)).behind!
        .visibility,
    ).toBe("visible");
    expect(
      nativeScreenAnchors(cases[4]!, frameFixture(cases[4]!)).behind!
        .visibility,
    ).toBe("occluded");
    expect(
      nativeScreenAnchors(base, frameFixture(base, undefined, true)),
    ).toEqual(
      referenceScreenAnchors(base, frameFixture(base, undefined, true)),
    );
    expect(mesh.uvs).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
  });
  it("retains authored mesh tie order and does not share vertices between equal mesh IDs across calls", () => {
    const source = sourceFixture();
    source.geometry.meshes.push({
      ...structuredClone(source.geometry.meshes[0]!),
      id: "tied-second",
    });
    const frame = frameFixture(source);
    const expected = referenceScreenAnchors(source, frame);
    expect(nativeScreenAnchors(source, frame)).toEqual(expected);
    expect(expected.behind!.occluderMesh).toBe("floor");
    source.geometry.meshes.reverse();
    const reversed = nativeScreenAnchors(source, frame);
    expect(reversed).toEqual(referenceScreenAnchors(source, frame));
    expect(reversed.behind!.occluderMesh).toBe("tied-second");
    const edited = sourceFixture();
    edited.geometry.meshes[0]!.positions =
      edited.geometry.meshes[0]!.positions.map((value, index) =>
        index % 3 === 0 ? value + 20 : value,
      );
    expect(nativeScreenAnchors(edited, frameFixture(edited))).toEqual(
      referenceScreenAnchors(edited, frameFixture(edited)),
    );
    expect(
      nativeScreenAnchors(edited, frameFixture(edited)).behind!.visibility,
    ).toBe("visible");
  });
  it("transforms four shared indexed vertices once per call while leaving source arrays untouched", () => {
    const source = sourceFixture(),
      frame = frameFixture(source);
    const before = structuredClone(source);
    const expected = referenceScreenAnchors(source, frame);
    const transform = vi.spyOn(matrixOperations, "transformPoint");
    expect(nativeScreenAnchors(source, frame)).toEqual(expected);
    expect(transform).toHaveBeenCalledTimes(4);
    expect(source).toEqual(before);
    transform.mockClear();
    expect(nativeScreenAnchors(source, frame)).toEqual(expected);
    expect(transform).toHaveBeenCalledTimes(4);
  });
});
