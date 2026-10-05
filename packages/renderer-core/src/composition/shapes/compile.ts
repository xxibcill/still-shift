import { shapeNibs } from "./nib.ts";
import type { BezierPath } from "@still-shift/scene-contract";
import { multiplyMatrix, type Matrix } from "../../node-transform.ts";
import type { Bounds } from "../evaluate/types.ts";
import { projectBounds } from "../evaluate/geometry.ts";
import type { ShapeGeometryBudget } from "./budget.ts";
import {
  shapeMatrix,
  transformedGeometry,
  type GeometryPath,
} from "./geometry.ts";
import { bezierBounds, pathCubics } from "./path.ts";
import { rectanglePath, ellipsePath, polystarPath } from "./primitives.ts";
import { mergePaths, offsetPaths } from "./polygons.ts";
import { trimGeometry } from "./trim.ts";
import { repeaterCopies } from "./repeater.ts";
import {
  roundCorners,
  puckerBloat,
  twistPath,
  wigglePath,
  zigzagPath,
} from "./deform.ts";
import type {
  CompiledShapes,
  SampledShapeContent,
  ShapeDraw,
  ShapePaint,
} from "./types.ts";

type Binding = { paths: GeometryPath[] };
type Paint = {
  paint: ShapePaint;
  bindings: Binding[];
  matrix: Matrix;
  opacity: number;
};
type Group = { bindings: Binding[]; paints: Paint[] };
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function inverse(matrix: Matrix): Matrix | null {
  const [a, b, c, d, x, y] = matrix,
    det = a * d - b * c;
  if (!det) return null;
  return [
    d / det,
    -b / det,
    -c / det,
    a / det,
    (c * y - d * x) / det,
    (b * x - a * y) / det,
  ];
}

function replaced(
  paths: GeometryPath[],
  operation: (paths: BezierPath[]) => BezierPath[],
) {
  if (!paths.length) return [];
  const first = paths[0]!;
  return operation(paths.map((p) => p.path)).map((path) => ({
    id: first.id,
    opacity: first.opacity,
    path,
  }));
}

function deform(
  geometry: GeometryPath,
  content: SampledShapeContent,
  seconds: number,
  budget: ShapeGeometryBudget,
): GeometryPath {
  let path = geometry.path;
  switch (content.type) {
    case "round-corners":
      path = roundCorners(path, content.radius, budget);
      break;
    case "wiggle-paths":
      path = wigglePath(
        path,
        geometry.id,
        { ...content, smooth: content.smooth ?? true },
        seconds,
        budget,
      );
      break;
    case "zig-zag":
      path = zigzagPath(
        path,
        content.size,
        content.ridges,
        content.points === "smooth",
        budget,
      );
      break;
    case "pucker-bloat":
      path = puckerBloat(path, content.amount, budget);
      break;
    case "twist":
      path = twistPath(path, content.angle, content.center, budget);
      break;
  }
  // Geometry replacements establish a new nib profile; zero operators retain spans.
  return path === geometry.path
    ? geometry
    : { id: geometry.id, opacity: geometry.opacity, path };
}

function repeat(
  group: Group,
  content: Extract<SampledShapeContent, { type: "repeater" }>,
  budget: ShapeGeometryBudget,
) {
  const copies = repeaterCopies(
    { ...content, order: content.order ?? "below" },
    budget,
  );
  const originalBindings = group.bindings,
    originalPaints = group.paints;
  const allBindings = [
    ...new Set([
      ...originalBindings,
      ...originalPaints.flatMap((p) => p.bindings),
    ]),
  ];
  budget.vertices(
    copies.length *
      (allBindings.length +
        originalPaints.reduce(
          (sum, paint) => sum + paint.bindings.length + 1,
          0,
        )),
  );
  const generated = copies.map((copy) => {
    const map = new Map<Binding, Binding>();
    for (const binding of allBindings)
      map.set(binding, {
        paths: binding.paths.map((path) => ({
          ...transformedGeometry(path, copy.matrix, budget),
          opacity: path.opacity * copy.opacity,
        })),
      });
    return {
      bindings: originalBindings.map((binding) => map.get(binding)!),
      paints: originalPaints.map((paint) => ({
        ...paint,
        bindings: paint.bindings.map((binding) => map.get(binding)!),
        matrix: multiplyMatrix(copy.matrix, paint.matrix),
      })),
    };
  });
  group.bindings = generated.flatMap((copy) => copy.bindings);
  // Paint records are authored top-to-bottom, then executed bottom-to-top.
  group.paints = generated.reverse().flatMap((copy) => copy.paints);
}

function groupContents(
  contents: SampledShapeContent[],
  seconds: number,
  budget: ShapeGeometryBudget,
): Group {
  const group: Group = { bindings: [], paints: [] };
  for (const content of contents) {
    const location = budget.located({
      path: `${budget.location.path ?? ""}.contents[${content.id}]`,
    });
    switch (content.type) {
      case "group": {
        const child = groupContents(content.contents, seconds, location),
          matrix = shapeMatrix(content.transform);
        const all = [
          ...new Set([
            ...child.bindings,
            ...child.paints.flatMap((p) => p.bindings),
          ]),
        ];
        for (const binding of all)
          binding.paths = binding.paths.map((path) =>
            transformedGeometry(path, matrix, location),
          );
        group.bindings.push({
          paths: child.bindings.flatMap((binding) => binding.paths),
        });
        group.paints.push(
          ...child.paints.map((paint) => ({
            ...paint,
            matrix: multiplyMatrix(matrix, paint.matrix),
            opacity: paint.opacity * content.transform.opacity,
          })),
        );
        break;
      }
      case "rect":
      case "ellipse":
      case "polystar":
      case "path": {
        const path =
          content.type === "rect"
            ? rectanglePath(content, location)
            : content.type === "ellipse"
              ? ellipsePath(content, location)
              : content.type === "polystar"
                ? polystarPath(content, location)
                : content.path;
        group.bindings.push({
          paths: path ? [{ id: content.id, path, opacity: 1 }] : [],
        });
        break;
      }
      case "fill":
      case "stroke":
      case "gradient-fill":
      case "gradient-stroke":
        location.vertices(group.bindings.length);
        group.paints.push({
          paint: content,
          bindings: [...group.bindings],
          matrix: IDENTITY,
          opacity: 1,
        });
        break;
      case "repeater":
        repeat(group, content, location);
        break;
      case "merge-paths": {
        const paths = mergePaths(
          group.bindings.map((binding) => binding.paths.map((p) => p.path)),
          content.mode,
          location,
        );
        const first = group.bindings[0];
        const source = first?.paths[0];
        if (first)
          first.paths = paths.map((path) => ({
            id: source?.id ?? content.id,
            opacity: source?.opacity ?? 1,
            path,
          }));
        for (const binding of group.bindings.slice(1)) binding.paths = [];
        break;
      }
      case "trim-paths": {
        // Individual trim needs one accumulated interval across all source bindings.
        if (content.mode === "individual") {
          const flat = group.bindings.flatMap((binding) =>
            binding.paths.map((path) => ({ ...path, owner: binding })),
          );
          const output = trimGeometry(
            flat,
            { ...content, mode: "individual" },
            location,
          );
          for (const binding of group.bindings) binding.paths = [];
          for (const { owner, ...path } of output) owner.paths.push(path);
        } else
          for (const binding of group.bindings)
            binding.paths = trimGeometry(
              binding.paths,
              { ...content, mode: "simultaneous" },
              location,
            );
        break;
      }
      case "offset-path":
        for (const binding of group.bindings)
          binding.paths = replaced(binding.paths, (paths) =>
            offsetPaths(
              paths,
              content.amount,
              content.join ?? "miter",
              content.miterLimit ?? 4,
              location,
            ),
          );
        break;
      default:
        for (const binding of group.bindings)
          binding.paths = binding.paths.map((path) =>
            deform(path, content, seconds, location),
          );
    }
  }
  return group;
}

function unionBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  };
}

/** Capture upstream sources first; resolve final geometry and paint in reverse order. */
export function compileShapes(
  contents: SampledShapeContent[],
  seconds: number,
  budget: ShapeGeometryBudget,
): CompiledShapes {
  const group = groupContents(contents, seconds, budget),
    draws: ShapeDraw[] = [];
  let bounds: Bounds | null = null;
  for (const captured of group.paints.reverse()) {
    if (!captured.opacity || !captured.paint.opacity) continue;
    const inverted = inverse(captured.matrix);
    if (!inverted) continue;
    const paths = captured.bindings.flatMap((binding) => binding.paths);
    const runs: GeometryPath[][] = [];
    for (const path of paths) {
      const last = runs.at(-1);
      if (last?.[0]?.opacity === path.opacity) last.push(path);
      else runs.push([path]);
    }
    for (const run of runs) {
      const opacity = run[0]!.opacity;
      if (!opacity) continue;
      const painted = run.map((path) =>
        transformedGeometry(path, inverted, budget),
      );
      if (!painted.length) continue;
      const stroke =
        captured.paint.type === "stroke" ||
        captured.paint.type === "gradient-stroke"
          ? captured.paint
          : undefined;
      const drawable = painted.map((path) => {
        const nibs = stroke ? shapeNibs(path, stroke, budget) : undefined;
        return nibs ? { ...path, nibs } : path;
      });
      const draw: ShapeDraw = {
        paint: captured.paint,
        paths: drawable,
        matrix: captured.matrix,
        opacity: captured.opacity * opacity,
      };
      draws.push(draw);
      for (const path of painted) {
        budget.vertices(path.path.vertices.length * 2);
        for (const cubic of pathCubics(path.path))
          cubic.forEach((point) => budget.point(point));
        let local = bezierBounds(path.path);
        if (!local) continue;
        if (
          draw.paint.type === "stroke" ||
          draw.paint.type === "gradient-stroke"
        ) {
          const padding =
            (draw.paint.width / 2) *
            Math.max(
              1,
              draw.paint.join === "miter" || !draw.paint.join
                ? (draw.paint.miterLimit ?? 4)
                : 1,
            );
          local = {
            left: local.left - padding,
            top: local.top - padding,
            right: local.right + padding,
            bottom: local.bottom + padding,
          };
        }
        bounds = unionBounds(bounds, projectBounds(local, draw.matrix));
      }
    }
  }
  return {
    draws,
    bounds,
    paths: group.bindings.flatMap((binding) =>
      binding.paths.map((p) => p.path),
    ),
  };
}
