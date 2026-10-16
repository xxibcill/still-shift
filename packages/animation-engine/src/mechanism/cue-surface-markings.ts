import type { MechanismNarratedCycle } from "@still-shift/scene-contract";
import type { MechanismPackInstanceSource } from "./pack-support.ts";
type Annotation = NonNullable<
  MechanismNarratedCycle["cues"][number]["worldAnnotations"]
>[number];
type Surface = Extract<Annotation, { kind: "surface-marking" }>;
type Vector = [number, number, number];
type Failure = (message: string, field: string) => never;
const dot = (a: readonly number[], b: readonly number[]) =>
  a.reduce((sum, v, i) => sum + v * b[i]!, 0);
const sub = (a: readonly number[], b: readonly number[]): Vector => [
  a[0]! - b[0]!,
  a[1]! - b[1]!,
  a[2]! - b[2]!,
];
const cross = (a: readonly number[], b: readonly number[]): Vector => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!,
];
const unit = (v: Vector): Vector =>
  v.map((x) => x / Math.hypot(...v)) as Vector;
function rotation(x: Vector, y: Vector, normal: Vector): Vector {
  const cosine = Math.hypot(normal[1], normal[2]);
  const pitch = Math.atan2(normal[0], cosine);
  return cosine > 0
    ? [Math.atan2(-normal[1], normal[2]), pitch, Math.atan2(-y[0], x[0])]
    : [Math.atan2(y[2], y[1]), pitch, 0];
}
/** Conservative Float32 placement budget for the admitted unit-scale rigid family source. */
function placementBias(
  scene: MechanismPackInstanceSource["scene"],
  vertices: Vector[],
  altitude: number,
  fail: Failure,
  cameraBound: number,
) {
  let bound = Math.max(
    cameraBound,
    1,
    scene.camera.far,
    Math.hypot(...scene.camera.position),
    Math.hypot(...scene.camera.target),
    ...vertices.map((v) => Math.hypot(...v)),
  );
  for (const part of scene.parts) {
    if (part.transform.scale.some((scale) => scale !== 1))
      fail(
        "Surface marking requires unit part scale in the rigid precision subset",
        "mesh",
      );
    bound +=
      Math.hypot(...part.transform.position) +
      2 * Math.hypot(...part.transform.pivot);
  }
  for (const rig of scene.rigs) {
    if (rig.type === "hinge") bound += 2 * Math.hypot(...rig.pivot);
    else if (rig.type === "slider")
      bound += Math.max(...rig.range.map(Math.abs)) + Math.abs(rig.neutral);
    else if (rig.type === "load-seat")
      bound +=
        2 * Math.hypot(...rig.pivot) +
        rig.maxTravelMeters / scene.units.scaleToMeters;
    else if (rig.type === "ratchet")
      bound += Math.max(...rig.range.map(Math.abs));
  }
  const bias = Math.max(0.000001, 32 * 2 ** (Math.ceil(Math.log2(bound)) - 23));
  if (!Number.isFinite(bias) || bias > altitude * 0.001)
    fail(
      "Surface triangle cannot support the required Float32 placement bias",
      "triangle",
    );
  return bias;
}
/** Admit a fitted front-face marking on one immutable, actually indexed rigid triangle. */
export function resolveCueSurfaceMarking(
  scene: MechanismPackInstanceSource["scene"],
  annotation: Surface,
  fail: Failure,
  cameraBound = 0,
) {
  const mesh = scene.geometry.meshes.find(
    (mesh) => mesh.id === annotation.mesh,
  );
  if (!mesh) fail("Unknown surface marking mesh", "mesh");
  if (scene.teachingShapes.some((shape) => shape.mesh === mesh.id))
    fail("Surface marking does not support a deforming teaching mesh", "mesh");
  const offset = annotation.triangle * 3;
  if (offset + 3 > mesh.indices.length)
    fail("Unknown surface marking triangle", "triangle");
  const groups = mesh.groups?.filter(
    (group) => group.start <= offset && offset + 3 <= group.start + group.count,
  );
  if (mesh.groups?.length && groups?.length !== 1)
    fail("Surface triangle must have one submitted material group", "triangle");
  const material = groups?.length
    ? scene.geometry.materials[groups[0]!.materialIndex]
    : scene.geometry.materials.find(
        (material) => material.id === mesh.materialId,
      );
  if (!material || material.alphaMode !== "opaque" || material.opacity !== 1)
    fail("Surface marking requires an opaque substrate material", "mesh");
  const vertices = mesh.indices
    .slice(offset, offset + 3)
    .map(
      (index) =>
        mesh.positions
          .slice(index * 3, index * 3 + 3)
          .map(Math.fround) as Vector,
    );
  const a = sub(vertices[1]!, vertices[0]!),
    b = sub(vertices[2]!, vertices[0]!),
    area = cross(a, b);
  const doubledArea = Math.hypot(...area),
    longest = Math.max(
      Math.hypot(...a),
      Math.hypot(...b),
      Math.hypot(...sub(vertices[2]!, vertices[1]!)),
    );
  if (!Number.isFinite(doubledArea) || doubledArea <= 1e-12 || longest <= 1e-9)
    fail("Surface triangle degenerates in GPU Float32 positions", "triangle");
  const normal = unit(area),
    axis = unit(a),
    up = cross(normal, axis);
  const cos = Math.cos(annotation.rollRadians),
    sin = Math.sin(annotation.rollRadians);
  const x = axis.map((v, i) => v * cos + up[i]! * sin) as Vector;
  const y = up.map((v, i) => v * cos - axis[i]! * sin) as Vector;
  const sum = annotation.barycentric.reduce((a, b) => a + b, 0);
  const weights = annotation.barycentric.map((value) => value / sum);
  const center = [0, 1, 2].map((i) =>
    vertices.reduce((value, p, k) => value + p[i]! * weights[k]!, 0),
  ) as Vector;
  const aa = dot(a, a),
    ab = dot(a, b),
    bb = dot(b, b),
    determinant = doubledArea * doubledArea;
  // Enclose the entire logical box and one raster pixel guard on each edge.
  const halfWidth =
    (annotation.sizePixels[0] / 2 + 1) / annotation.pixelsPerUnit;
  const halfHeight =
    (annotation.sizePixels[1] / 2 + 1) / annotation.pixelsPerUnit;
  let minimumWeight = 1;
  for (const dx of [-halfWidth, halfWidth])
    for (const dy of [-halfHeight, halfHeight]) {
      const p = center.map((v, i) => v + x[i]! * dx + y[i]! * dy) as Vector;
      const relative = sub(p, vertices[0]!);
      const ap = dot(a, relative),
        bp = dot(b, relative);
      const v = (bb * ap - ab * bp) / determinant,
        w = (aa * bp - ab * ap) / determinant;
      minimumWeight = Math.min(minimumWeight, 1 - v - w, v, w);
    }
  if (!Number.isFinite(minimumWeight) || minimumWeight < 1e-7)
    fail(
      "Surface marking box and raster guard escape the authored triangle",
      "sizePixels",
    );
  const bias = placementBias(
    scene,
    vertices,
    doubledArea / longest,
    fail,
    cameraBound,
  );
  const world: Extract<Annotation, { kind: "world-text" }> = {
    id: annotation.id,
    kind: "world-text",
    text: annotation.text,
    part: mesh.partId,
    transform: {
      position: center.map((v, i) => v + normal[i]! * bias) as Vector,
      rotation: rotation(x, y, normal),
      scale: [1, 1, 1],
      pivot: [0, 0, 0],
    },
    pixelsPerUnit: annotation.pixelsPerUnit,
    sizePixels: annotation.sizePixels,
    fontSizePixels: annotation.fontSizePixels,
    ink: annotation.ink,
    side: "front",
  };
  return {
    annotation: world,
    surface: {
      mesh: mesh.id,
      triangle: annotation.triangle,
      barycentric: weights,
      normal,
      bias,
      minimumFootprintWeight: minimumWeight,
      precision: "gpu-float32-rigid-triangle-1",
    },
  };
}
