import {
  compileExpressions,
  parsePropertyPath,
  isPropertyPathError,
  type ExpressionAst,
} from "@still-shift/scene-contract";

const clockFunctions = new Set([
  "wiggle",
  "valueAtTime",
  "velocityAtTime",
  "loopIn",
  "loopOut",
  "smooth",
  "inertia",
  "anticipate",
  "rove",
]);
function readsClock(ast: ExpressionAst): boolean {
  if ("id" in ast) return ast.id === "time" || ast.id === "frame";
  if ("call" in ast)
    return clockFunctions.has(ast.call) || ast.args.some(readsClock);
  if ("op" in ast) return ast.args.some(readsClock);
  if ("vec" in ast) return ast.vec.some(readsClock);
  if ("member" in ast) return readsClock(ast.of);
  return false;
}
import type {
  Composition,
  CompositionLayer,
  CompositionScope,
} from "@still-shift/scene-contract";
import type { RenderBackend, Surface } from "./backend.ts";
import { renderBatches } from "./batches.ts";
import type { RenderOp, SurfaceNode } from "./graph.ts";

function hasVaryingKeys(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasVaryingKeys);
  const record = value as Record<string, unknown>;
  if (Object.hasOwn(record, "keys")) {
    if (!Array.isArray(record.keys) || !record.keys.length) return true;
    const first = JSON.stringify(record.keys[0].value);
    for (const key of record.keys) {
      // Explicit temporal speed/spatial handles can move between equal endpoints.
      if (
        JSON.stringify(key.value) !== first ||
        key.in ||
        key.out ||
        key.spatialIn ||
        key.spatialOut
      )
        return true;
    }
    return false;
  }
  return Object.values(record).some(hasVaryingKeys);
}

/** Selection hints only: complete evaluated closure keys still authorize every reuse. */
export function compositionPrefixLayers(composition: Composition) {
  const candidates = new Set<string>();
  const driven = new Set<string>();
  const mark = (text: string) => {
    const path = parsePropertyPath(text);
    if (!isPropertyPathError(path))
      driven.add([...path.scope, path.layer].join("/"));
  };
  for (const expression of compileExpressions(composition))
    if (
      expression.reads.length ||
      expression.signals.length ||
      readsClock(expression.ast)
    )
      driven.add(
        [...expression.target.path.scope, expression.target.path.layer].join(
          "/",
        ),
      );
  for (const driver of composition.drivers ?? []) mark(driver.target);
  for (const periodic of composition.periodic ?? [])
    mark(periodic.target ?? `${periodic.node}.${periodic.property}`);
  // Expressions, constraints and cameras elsewhere in the document do not
  // invalidate a fixed prefix. The cache compares the complete evaluated native
  // closure on every frame, including transforms and prepared content identity.
  const visit = (scope: CompositionScope, prefix: string, depth: number) => {
    if (depth > 32) return;
    const layers = new Map(scope.layers.map((layer) => [layer.id, layer]));
    const fixed = (
      layer: CompositionLayer,
      seen = new Set<string>(),
    ): boolean => {
      if (seen.has(layer.id)) return false;
      seen.add(layer.id);
      if (
        driven.has(prefix + layer.id) ||
        hasVaryingKeys(layer) ||
        layer.threeD ||
        layer.receivesLight ||
        (layer.effects?.length ?? 0) > 0 ||
        (layer.masks?.length ?? 0) > 0 ||
        layer.trackMatte ||
        layer.type === "adjustment" ||
        layer.type === "depth-image" ||
        layer.type === "camera" ||
        layer.type === "light"
      )
        return false;
      if (
        layer.type === "text" &&
        (layer.transitions?.length || layer.decorations?.length)
      )
        return false;
      return (
        !layer.parent ||
        (layers.has(layer.parent) && fixed(layers.get(layer.parent)!, seen))
      );
    };
    for (const layer of scope.layers) {
      if (!fixed(layer)) continue;
      candidates.add(prefix + layer.id);
      if (layer.type === "precomp") {
        const nested = composition.precomps?.find(
          (scope) => scope.id === layer.comp,
        );
        if (nested) visit(nested, prefix + layer.id + "/", depth + 1);
      }
    }
  };
  visit(composition, "", 0);
  return candidates;
}

/** A closed prefix can end only between whole original batches. */
export function compositionRootPrefix<S extends Surface>(
  backend: Pick<RenderBackend<S>, "drawVectors" | "fillRects">,
  node: SurfaceNode,
  layers: ReadonlySet<string>,
): SurfaceNode | undefined {
  const eligible = (op: RenderOp): boolean => {
    if (!layers.has(op.layer)) return false;
    if (op.kind !== "draw") return false;
    if (op.content.type === "image") return !op.content.media;
    if (op.content.type === "depth-image") return false;
    if (op.content.type === "surface")
      return op.content.surface.ops.every(eligible);
    return true;
  };
  let end = 0;
  for (const batch of renderBatches(backend, node.ops, node.colorSpace)) {
    if (!batch.ops.every(eligible)) break;
    end = batch.end;
  }
  return end > 0 && end < node.ops.length
    ? { ...node, ops: node.ops.slice(0, end) }
    : undefined;
}
