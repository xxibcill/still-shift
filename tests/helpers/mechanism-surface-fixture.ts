import { Triangle, Vector3 } from "three";
import type { compileMechanismNarratedCycle } from "@still-shift/animation-engine";
type Scene = Parameters<typeof compileMechanismNarratedCycle>[0]["scene"];
/** Explicit visible rigid faces; selection never alters the physical family source. */
export function surfaceAnnotationFixture(
  scene: Scene,
  family: "tape-hook" | "cable-tie" | "clothespeg",
) {
  const id =
    family === "tape-hook"
      ? "hook-flange"
      : family === "cable-tie"
        ? "head.back"
        : "upper.arm";
  const mesh = scene.geometry.meshes.find((mesh) => mesh.id === id)!;
  const candidates: {
    triangle: number;
    area: number;
    barycentric: [number, number, number];
    radius: number;
  }[] = [];
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const points = mesh.indices
      .slice(offset, offset + 3)
      .map(
        (index) =>
          new Vector3(
            ...mesh.positions.slice(index * 3, index * 3 + 3).map(Math.fround),
          ),
      );
    const triangle = new Triangle(...(points as [Vector3, Vector3, Vector3]));
    const normal = triangle.getNormal(new Vector3());
    if ((family === "tape-hook" ? normal.y : normal.z) < 0.999) continue;
    const weights: [number, number, number] = [1 / 3, 1 / 3, 1 / 3];
    if (family === "cable-tie") {
      const order = points
        .map((point, i) => ({ i, score: point.x + 0.25 * point.y }))
        .sort((a, b) => a.score - b.score);
      weights.fill(0.1);
      weights[order[1]!.i] = 0.3;
      weights[order[2]!.i] = 0.6;
    }
    const center = points.reduce(
      (sum, point, i) => sum.addScaledVector(point, weights[i]!),
      new Vector3(),
    );
    if (family === "tape-hook" && center.z < 0.55) continue;
    if (family === "clothespeg" && Math.abs(center.x) < 1) continue;
    if (family === "cable-tie" && (center.x < 0.05 || center.y < 0.3)) continue;
    const distances = points.map((point, i) => {
      const edge = points[(i + 1) % 3]!.clone().sub(point);
      return center.clone().sub(point).cross(edge).length() / edge.length();
    });
    const radius = Math.min(...distances);
    if (radius > 0.001)
      candidates.push({
        triangle: offset / 3,
        area: triangle.getArea(),
        barycentric: weights,
        radius,
      });
  }
  candidates.sort(
    (a, b) => b.radius - a.radius || b.area - a.area || a.triangle - b.triangle,
  );
  const selected = candidates[0];
  if (!selected)
    throw Error("No diagnostic rigid surface candidate: " + family);
  const points = mesh.indices
    .slice(selected.triangle * 3, selected.triangle * 3 + 3)
    .map(
      (index) =>
        new Vector3(
          ...mesh.positions.slice(index * 3, index * 3 + 3).map(Math.fround),
        ),
    );
  const normal = new Triangle(
    ...(points as [Vector3, Vector3, Vector3]),
  ).getNormal(new Vector3());
  const axis = points[1]!.clone().sub(points[0]!).normalize(),
    up = normal.clone().cross(axis);
  const desired = new Vector3(1, 0, 0)
    .addScaledVector(normal, -normal.x)
    .normalize();
  const rollRadians = Math.atan2(desired.dot(up), desired.dot(axis));
  const annotation = {
    id: "mark",
    kind: "surface-marking" as const,
    text: "Pin",
    mesh: mesh.id,
    triangle: selected.triangle,
    barycentric: selected.barycentric,
    rollRadians,
    pixelsPerUnit: Math.hypot(53, 43) / (selected.radius * 0.8),
    sizePixels: [104, 84] as [number, number],
    fontSizePixels: 64,
    ink: "#ff0000",
  };
  return {
    annotation,
    part: mesh.partId,
    selected: { ...selected, mesh: mesh.id },
  };
}
