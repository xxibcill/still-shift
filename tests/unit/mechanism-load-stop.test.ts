import { describe, it, expect } from "vitest";
import {
  createCableTiePack,
  inspectCableTiePack,
  evaluateCableTiePackFrame,
} from "../../packages/animation-engine/src/mechanism/cable-tie-pack.ts";
import { inspectMechanismFamilyRegistry } from "../../packages/animation-engine/src/mechanism/family-registry.ts";
import {
  createMechanismFamilyAuthoring,
  applyMechanismFamilyPatch,
  inspectMechanismFamilyAuthoring,
} from "../../packages/animation-engine/src/mechanism/family-authoring.ts";
import { transformPoint } from "../../packages/renderer-core/src/mechanism/matrix.ts";
const variant = "hinged-pawl-frame-stop" as const;
const sample = (
  instance: ReturnType<typeof createCableTiePack>,
  force: number,
  frame = 0,
) =>
  evaluateCableTiePackFrame(instance, {
    frame,
    width: 640,
    height: 360,
    rigControls: { load: { type: "load-seat", loadNewtons: { value: force } } },
  }).frame;
function closeSurface(
  positions: readonly number[],
  indices: readonly number[],
) {
  const edges = new Map<string, number>();
  for (let i = 0; i < indices.length; i += 3)
    for (let j = 0; j < 3; j++) {
      const key = [indices[i + j]!, indices[i + ((j + 1) % 3)]!]
        .map((v) =>
          positions
            .slice(v * 3, v * 3 + 3)
            .map((n) => n.toFixed(10))
            .join(","),
        )
        .sort()
        .join("|");
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  expect([...edges.values()].every((n) => n === 2)).toBe(true);
}
type Point2 = [number, number];
function clippedTriangleArea(
  triangle: Point2[],
  bounds: { min: readonly number[]; max: readonly number[] },
) {
  let polygon = triangle;
  for (const [axis, limit, sign] of [
    [0, bounds.min[0]!, 1],
    [0, bounds.max[0]!, -1],
    [1, bounds.min[1]!, 1],
    [1, bounds.max[1]!, -1],
  ] as const) {
    const output: Point2[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!,
        b = polygon[(i + 1) % polygon.length]!,
        da = sign * (a[axis] - limit),
        db = sign * (b[axis] - limit);
      if (da >= 0) output.push(a);
      if (da >= 0 !== db >= 0) {
        const fraction = da / (da - db);
        output.push([
          a[0] + fraction * (b[0] - a[0]),
          a[1] + fraction * (b[1] - a[1]),
        ]);
      }
    }
    polygon = output;
  }
  return (
    Math.abs(
      polygon.reduce((sum, a, i) => {
        const b = polygon[(i + 1) % polygon.length]!;
        return sum + a[0] * b[1] - a[1] * b[0];
      }, 0),
    ) / 2
  );
}
function polygonArea(points: Point2[]) {
  return (
    Math.abs(
      points.reduce((sum, a, i) => {
        const b = points[(i + 1) % points.length]!;
        return sum + a[0] * b[1] - a[1] * b[0];
      }, 0),
    ) / 2
  );
}
function triangleIntersectionArea(a: Point2[], b: Point2[]) {
  if (polygonArea(a) < 1e-12 || polygonArea(b) < 1e-12) return 0;
  for (const axis of [0, 1])
    if (
      Math.max(...a.map((p) => p[axis]!)) <
        Math.min(...b.map((p) => p[axis]!)) ||
      Math.max(...b.map((p) => p[axis]!)) < Math.min(...a.map((p) => p[axis]!))
    )
      return 0;
  const orientation = Math.sign(
    b.reduce((sum, p, i) => {
      const q = b[(i + 1) % 3]!;
      return sum + p[0] * q[1] - p[1] * q[0];
    }, 0),
  );
  let polygon = a;
  for (let j = 0; j < 3; j++) {
    const p = b[j]!,
      q = b[(j + 1) % 3]!,
      distance = (v: Point2) =>
        orientation *
        ((q[0] - p[0]) * (v[1] - p[1]) - (q[1] - p[1]) * (v[0] - p[0])),
      output: Point2[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const x = polygon[i]!,
        y = polygon[(i + 1) % polygon.length]!,
        dx = distance(x),
        dy = distance(y);
      if (dx >= 0) output.push(x);
      if (dx >= 0 !== dy >= 0) {
        const f = dx / (dx - dy);
        output.push([x[0] + f * (y[0] - x[0]), x[1] + f * (y[1] - x[1])]);
      }
    }
    polygon = output;
  }
  return polygonArea(polygon);
}
describe("hinged two-tooth load-stop cable candidate", () => {
  it("keeps standard and release identities exact while exposing a distinct physical candidate", () => {
    expect(createCableTiePack().sourceSha256).toBe(
      "sha256:3a59ce85a880bf2f92d90b4cdbbbe9336b44d607b40c13836b8f6888f9f5af5d",
    );
    expect(inspectCableTiePack().sha256).toBe(
      "sha256:c4243b4d3f4ae14561f955eff5874d1954adabf944d4daf96ca27d48b22b7a7c",
    );
    expect(
      createCableTiePack({
        variant: "inside-serrated-extended-trigger-cutaway",
      }).sourceSha256,
    ).toBe(
      "sha256:4067278bc9a3b9815a1325fe83b4e776fc6b0859d6f4afd8090bc891290dc4d5",
    );
    const p = createCableTiePack({ variant });
    expect(p.pack.variant).toBe(variant);
    expect(p.scene.rigs.map((r) => r.type)).toEqual(["load-seat"]);
    expect(p.scene.geometry.meshes.map((m) => m.id)).toEqual(
      expect.arrayContaining([
        "pawl.body",
        "pawl.stop",
        "head.stopLedge",
        "hinge.web.mesh",
      ]),
    );
    expect(inspectCableTiePack(variant).pack.status).toBe("candidate");
  });
  it("conserves the real primary tooth point, closes second/stop gaps and saturates across 101 loads", () => {
    const p = createCableTiePack({ variant });
    let lastSecondary = Infinity,
      lastStop = Infinity;
    for (let i = 0; i <= 100; i++) {
      const force = 0.3 * i,
        frame = sample(p, force, i),
        state = frame.rigs.load!;
      expect(state.type).toBe("load-seat");
      if (state.type !== "load-seat") throw Error("load required");
      const theta = 0.12 * (1 - Math.min(force / 8, 1));
      expect(frame.relationships["primary.contact"]!.residual).toBeLessThan(
        1e-12,
      );
      const secondary = frame.relationships["secondary.gap"]!.measured[0]!;
      const stop = frame.relationships["stop.gap"]!.measured[0]!;
      expect(secondary).toBeCloseTo(0.5 * Math.sin(theta), 12);
      expect(stop).toBeCloseTo(
        0.72 * Math.sin(theta) + 0.1 * (Math.cos(theta) - 1),
        12,
      );
      expect(secondary).toBeLessThanOrEqual(lastSecondary + 1e-12);
      expect(stop).toBeLessThanOrEqual(lastStop + 1e-12);
      expect(secondary).toBeGreaterThanOrEqual(-1e-12);
      expect(stop).toBeGreaterThanOrEqual(-1e-12);
      lastSecondary = secondary;
      lastStop = stop;
      expect(frame.relationships["hinge.root.attached"]!.residual).toBeLessThan(
        1e-12,
      );
      expect(frame.relationships["hinge.pawl.attached"]!.residual).toBeLessThan(
        1e-12,
      );
      expect(state.stopReactionNewtons).toBeCloseTo(Math.max(0, force - 8), 12);
    }
    expect(sample(p, 8).parts.pawl).toEqual(sample(p, 30).parts.pawl);
    expect(sample(p, 8).parts.strap).toEqual(sample(p, 30).parts.strap);
  });
  it("uses closed solid teeth/stop/web and no sampled intrusion below tooth or stop planes", () => {
    const p = createCableTiePack({ variant });
    for (const mesh of p.scene.geometry.meshes.filter(
      (m) => m.partId === "pawl" || m.id === "hinge.web.mesh",
    ))
      closeSurface(mesh.positions, mesh.indices);
    for (let i = 0; i <= 40; i++) {
      const frame = sample(p, i / 4, i);
      for (const mesh of p.scene.geometry.meshes.filter(
        (m) => m.partId === "pawl",
      ))
        for (let v = 0; v < mesh.positions.length; v += 3) {
          const posed = transformPoint(
            frame.parts.pawl!.worldMatrix,
            mesh.positions.slice(v, v + 3) as [number, number, number],
          );
          expect(posed[1]).toBeGreaterThanOrEqual(-1e-8);
          if (mesh.id === "pawl.stop")
            expect(posed[1]).toBeGreaterThanOrEqual(0.1 - 1e-8);
        }
      const second =
        frame.anchors["pawl.secondaryTooth"]!.world[0] -
        frame.anchors["strap.secondaryTooth"]!.world[0];
      expect(Math.abs(second)).toBeLessThan(0.08);
      const web = frame.shapeStates["hinge.web"]!;
      closeSurface(
        web.positions,
        p.scene.geometry.meshes.find((m) => m.id === "hinge.web.mesh")!.indices,
      );
    }
  });
  it("has no positive triangle overlap between either pawl solid and the frame ledge across admitted pitches", () => {
    for (const pitch of [0.35, 0.5, 0.7]) {
      const p = createCableTiePack({ variant, parameters: { pitch } }),
        ledge = p.scene.geometry.meshes.find((m) => m.id === "head.stopLedge")!;
      for (let i = 0; i <= 40; i++) {
        const f = sample(p, i / 4, i);
        for (const mesh of p.scene.geometry.meshes.filter(
          (m) => m.partId === "pawl",
        ))
          for (let j = 0; j < mesh.indices.length; j += 3) {
            const triangle = mesh.indices
              .slice(j, j + 3)
              .map(
                (v) =>
                  transformPoint(
                    f.parts.pawl!.worldMatrix,
                    mesh.positions.slice(v * 3, v * 3 + 3) as [
                      number,
                      number,
                      number,
                    ],
                  ).slice(0, 2) as Point2,
              );
            expect(
              clippedTriangleArea(triangle, ledge.bounds),
              `pitch${pitch}/force${i / 4}/${mesh.id}/triangle${j / 3}`,
            ).toBeLessThanOrEqual(1e-10);
          }
      }
    }
  });
  it("holds contacts under admitted dimensions, mounted uniform scale and backward seeks", () => {
    for (const parameters of [
      { pitch: 0.35, strapWidth: 0.65, toothCount: 6 },
      { pitch: 0.7, strapWidth: 1.4, toothCount: 12 },
    ]) {
      const p = createCableTiePack({
        variant,
        parameters,
        mount: {
          position: [2, 3, -1],
          rotation: [0.3, -0.2, 0.4],
          scale: [2, 2, 2],
        },
      });
      for (const force of [0, 8, 16, 30, 16, 8, 0]) {
        const f = sample(p, force);
        expect(f.relationships["primary.contact"]!.residual).toBeLessThan(1e-8);
        expect(f.relationships["hinge.pawl.attached"]!.residual).toBeLessThan(
          1e-8,
        );
      }
    }
  });
  it("attaches the web at the lower rear beside the stop and shortens it through seating", () => {
    for (const pitch of [0.35, 0.5, 0.7]) {
      const p = createCableTiePack({ variant, parameters: { pitch } });
      const definition = p.scene.teachingShapes[0]!;
      expect(definition.generator).toBe("seated-flexible-web-1");
      const root = p.scene.anchors.find((a) => a.id === "head.hingeSeat")!,
        moving = p.scene.anchors.find((a) => a.id === "pawl.hingeSeat")!;
      if (
        root.source.kind !== "part-local" ||
        moving.source.kind !== "part-local"
      )
        throw Error("Rigid seats required");
      expect(root.source.position).toEqual([pitch + 0.3, 0.1, 0]);
      expect(moving.source.position).toEqual([pitch + 0.4, 0.18, 0]);
      const ledge = p.scene.geometry.meshes.find(
        (m) => m.id === "head.stopLedge",
      )!;
      expect(root.source.position[1]).toBeCloseTo(ledge.bounds.max[1], 7);
      expect(root.source.position[0]).toBeGreaterThan(ledge.bounds.min[0]);
      expect(root.source.position[0]).toBeLessThan(ledge.bounds.max[0]);
      let lastSpan = Infinity;
      for (let i = 0; i <= 32; i++) {
        const f = sample(p, i / 4, i),
          a = f.anchors["head.hingeSeat"]!.world,
          b = f.anchors["pawl.hingeSeat"]!.world,
          span = Math.hypot(...a.map((v, axis) => v - b[axis]!));
        expect(span).toBeLessThanOrEqual(lastSpan + 1e-12);
        expect(span).toBeGreaterThan(0.075);
        lastSpan = span;
        expect(f.relationships["hinge.root.attached"]!.residual).toBeLessThan(
          1e-12,
        );
        expect(f.relationships["hinge.pawl.attached"]!.residual).toBeLessThan(
          1e-12,
        );
      }
    }
  });
  it("keeps the deforming web clear of both pawl solids and the adjacent frame solids", () => {
    for (const pitch of [0.35, 0.5, 0.7]) {
      const p = createCableTiePack({ variant, parameters: { pitch } }),
        template = p.scene.geometry.meshes.find(
          (m) => m.id === "hinge.web.mesh",
        )!;
      for (let i = 0; i <= 40; i++) {
        const frame = sample(p, i / 4, i),
          web = frame.shapeStates["hinge.web"]!;
        const triangles = (
          positions: readonly number[],
          indices: readonly number[],
          part: string,
        ) => {
          const posed = Array.from(
            { length: positions.length / 3 },
            (_, v) =>
              transformPoint(
                frame.parts[part]!.worldMatrix,
                positions.slice(v * 3, v * 3 + 3) as [number, number, number],
              ).slice(0, 2) as Point2,
          );
          return Array.from({ length: indices.length / 3 }, (_, t) =>
            indices.slice(t * 3, t * 3 + 3).map((v) => posed[v]!),
          ).filter((t) => polygonArea(t) > 1e-12);
        };
        const webTriangles = triangles(
          web.positions,
          template.indices,
          web.ownerPart,
        );
        for (const mesh of p.scene.geometry.meshes.filter(
          (m) =>
            m.partId === "pawl" ||
            ["head.stopLedge", "head.webRoot"].includes(m.id),
        )) {
          const solidTriangles = triangles(
            mesh.positions,
            mesh.indices,
            mesh.partId,
          );
          let maximum = 0;
          for (const a of webTriangles)
            for (const b of solidTriangles)
              maximum = Math.max(maximum, triangleIntersectionArea(a, b));
          expect(
            maximum,
            `pitch${pitch}/force${i / 4}/web versus${mesh.id}`,
          ).toBeLessThanOrEqual(1e-10);
        }
      }
    }
  });
  it("discovers the variant and preserves exact-CAS saved-family identity", () => {
    const registry = inspectMechanismFamilyRegistry({
      schemaVersion: "mechanism-family-registry-1",
      family: "cable-tie",
    }).entries[0]!;
    expect(registry.variants.map((v) => v.id)).toContain(variant);
    expect(registry.examples.map((e) => e.id)).toEqual([
      "default",
      "inside-release",
      "load-stop",
    ]);
    const current = createMechanismFamilyAuthoring("cable-tie", "load-saved", {
      variant,
    });
    const inspected = inspectMechanismFamilyAuthoring(current.document);
    expect(inspected.instance.pack.variant).toBe(variant);
    const changed = applyMechanismFamilyPatch(current.document, {
      schemaVersion: "mechanism-family-patch-1",
      baseRevision: 0,
      baseHash: current.projectHash,
      operations: [
        { property: "parameter", id: "pitch", value: 0.6 },
        { property: "parameter", id: "strapWidth", value: 1.1 },
        { property: "parameter", id: "toothCount", value: 10 },
      ],
    });
    expect(changed.document.pack).toEqual(current.document.pack);
    expect(
      inspectMechanismFamilyAuthoring(changed.document).instance.sourceSha256,
    ).not.toBe(inspected.instance.sourceSha256);
  });
});
