import { behaviourExpressions } from "./behaviours.ts";
import type { Composition } from "./composition.ts";
import type { CompositionLayer } from "./layers.ts";
import {
  jsonEqual,
  parseExpression,
  printExpression,
  type ExpressionAst,
} from "./expression-ast.ts";
import {
  checkExpression,
  isExpressionFunction,
  type ExpressionTargetType,
} from "./expression-check.ts";
import { COMPOSITION_LIMITS } from "./primitives.ts";
import {
  formatPropertyPath,
  parsePropertyPath,
  type PropertyPath,
  type PropertyPathSegment,
} from "./property-path.ts";
import {
  isResolvedProperty,
  resolvePropertyPath,
  type ResolvedProperty,
} from "./resolve.ts";

type Path = (string | number)[];

/** An expression as authored, or as compiled from a behaviour. */
export type ExpressionEntry = {
  target: string;
  source: string;
  ast?: unknown;
  /** JSON path of the authored entry, used for target and dependency diagnostics. */
  origin: Path;
  /** JSON path that source diagnostics (with a column) point at. */
  sourcePath: Path;
};

export type ResolvedExpressionPath = {
  text: string;
  resolved: ResolvedProperty;
  path: PropertyPath;
};

export type CompiledExpression = {
  entry: ExpressionEntry;
  target: ResolvedExpressionPath;
  type: ExpressionTargetType;
  ast: ExpressionAst;
  reads: ResolvedExpressionPath[];
  signals: string[];
};

export type ExpressionReporter = (
  code: string,
  path: Path,
  message: string,
  column?: number,
) => void;

/** Every expression the composition evaluates: the map, then each behaviour in order. */
export function expressionEntries(comp: Composition): ExpressionEntry[] {
  const entries: ExpressionEntry[] = [];
  for (const [target, expression] of Object.entries(comp.expressions ?? {}))
    entries.push({
      target,
      source: expression.source,
      ...(expression.ast === undefined ? {} : { ast: expression.ast }),
      origin: ["expressions", target],
      sourcePath: ["expressions", target, "source"],
    });
  comp.behaviours?.forEach((behaviour, i) => {
    for (const compiled of behaviourExpressions(behaviour, comp.fps))
      entries.push({
        ...compiled,
        origin: ["behaviours", i],
        sourcePath: ["behaviours", i],
      });
  });
  return entries;
}

/** Path segments after the layer, canonical (aliases expanded). */
export const segmentKey = (segments: readonly PropertyPathSegment[]) =>
  formatPropertyPath({ scope: [], layer: "_", segments: [...segments] }).slice(
    2,
  );

/** Two properties overlap when one path is the other or a component of it. */
export function segmentsOverlap(
  a: readonly PropertyPathSegment[],
  b: readonly PropertyPathSegment[],
) {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++)
    if (a[i]!.name !== b[i]!.name || a[i]!.index !== b[i]!.index) return false;
  return true;
}

/** Unwritten reference axes inherit the corresponding expression-stage anchor. */
export function implicitAnchorDependencies(
  layer: CompositionLayer,
  segments: readonly PropertyPathSegment[],
  writtenAxes: readonly boolean[],
): PropertyPathSegment[][] {
  if (
    layer.constraintReference !== undefined ||
    segments[0]?.name !== "constraintReference"
  )
    return [];
  const axes =
    layer.threeD || layer.type === "camera" ? ["x", "y", "z"] : ["x", "y"];
  return axes.flatMap((axis, i) =>
    !writtenAxes[i] && (!segments[1] || segments[1].name === axis)
      ? [[{ name: "transform" }, { name: "anchor" }, { name: axis }]]
      : [],
  );
}

export const layerNodeOf = (path: PropertyPath) =>
  [...path.scope, path.layer].join("/");

function resolveExpressionPath(
  comp: Composition,
  text: string,
): ResolvedExpressionPath | { code: string; message: string } {
  const resolved = resolvePropertyPath(comp, text);
  if (!isResolvedProperty(resolved)) return resolved;
  const path = parsePropertyPath(resolved.path) as PropertyPath;
  return { text, resolved, path };
}

/**
 * Resolve, parse and type-check every expression. Diagnostics go to `report`; only
 * expressions without errors are returned.
 */
export function compileExpressions(
  comp: Composition,
  report: ExpressionReporter = () => {},
): CompiledExpression[] {
  const entries = expressionEntries(comp);
  if (entries.length > COMPOSITION_LIMITS.maxExpressions) {
    report(
      "comp-limit",
      ["behaviours"],
      `expressions and behaviours compile to ${entries.length} expressions; at most ${COMPOSITION_LIMITS.maxExpressions} are allowed`,
    );
    return [];
  }
  const signals = new Set(comp.signals?.map((signal) => signal.id));
  const compiled: CompiledExpression[] = [];
  const claimed = new Map<
    string,
    { segments: PropertyPathSegment[]; origin: Path }[]
  >();
  for (const entry of entries) {
    const target = resolveExpressionPath(comp, entry.target);
    if ("code" in target) {
      report(target.code, entry.origin, target.message);
      continue;
    }
    if (target.resolved.readOnly) {
      report(
        "comp-path-readonly",
        entry.origin,
        `"${entry.target}" can be read but not driven`,
      );
      continue;
    }
    const type = target.resolved.type;
    if (type === "discrete" || type === "path" || type === "curve") {
      report(
        "comp-expression-type",
        entry.origin,
        `"${entry.target}" is a ${type} property; expressions target numbers, vectors and colours`,
      );
      continue;
    }
    const node = layerNodeOf(target.path);
    const others = claimed.get(node) ?? [];
    const conflict = others.find((other) =>
      segmentsOverlap(other.segments, target.path.segments),
    );
    if (conflict) {
      report(
        "comp-expression-overlap",
        entry.origin,
        `"${entry.target}" overlaps another expression on the same property (${conflict.origin.join(".")})`,
      );
      continue;
    }
    others.push({ segments: target.path.segments, origin: entry.origin });
    claimed.set(node, others);

    const parsed = parseExpression(entry.source, isExpressionFunction);
    if ("error" in parsed) {
      report(
        parsed.error.code,
        entry.sourcePath,
        parsed.error.message,
        parsed.error.column,
      );
      continue;
    }
    if (entry.ast !== undefined && !jsonEqual(parsed.ast, entry.ast)) {
      report(
        "comp-expression-mismatch",
        [...entry.origin, "ast"],
        `ast does not match the parsed source; its canonical form is "${printExpression(parsed.ast)}"`,
      );
      continue;
    }
    const reads: ResolvedExpressionPath[] = [];
    const checked = checkExpression(parsed, {
      target: type,
      resolve: (text) => {
        const read = resolveExpressionPath(comp, text);
        if ("code" in read) return read;
        reads.push(read);
        return { type: read.resolved.type };
      },
      hasSignal: (id) => signals.has(id),
    });
    if ("error" in checked) {
      report(
        checked.error.code,
        entry.sourcePath,
        checked.error.message,
        checked.error.column,
      );
      continue;
    }
    compiled.push({
      entry,
      target,
      type,
      ast: parsed.ast,
      reads,
      signals: checked.signals,
    });
  }
  return compiled;
}

/**
 * Normalised output: each authored expression keeps its source text and gains the
 * canonical AST the engine evaluates. Behaviours stay as authored. Expressions
 * must already be valid.
 */
export function normalizeExpressions(comp: Composition): Composition {
  if (!comp.expressions) return comp;
  const asts = new Map(
    compileExpressions(comp)
      .filter((compiled) => compiled.entry.origin[0] === "expressions")
      .map((compiled) => [compiled.entry.target, compiled.ast]),
  );
  return {
    ...comp,
    expressions: Object.fromEntries(
      Object.entries(comp.expressions).map(([target, expression]) => [
        target,
        { source: expression.source, ast: asts.get(target) ?? expression.ast },
      ]),
    ),
  };
}
