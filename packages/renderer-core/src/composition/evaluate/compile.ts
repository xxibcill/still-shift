import {
  compileExpressions,
  compositionEffectRegistryRevision,
  segmentKey,
  validateComposition,
  type CompiledExpression,
  type PropertyPathSegment,
  resolvePropertyPath,
  isResolvedProperty,
  parsePropertyPath,
  isPropertyPathError,
  type Composition,
  type CompositionLayer,
  type CompositionScope,
  type CompositionDriver,
  type CompositionPeriodic,
  type PropertyPath,
  type Signal,
} from "@still-shift/scene-contract";
import { PassageError, passageError } from "../../passage-diagnostics.ts";

export type DriverBinding = { motion: CompositionDriver; path: PropertyPath };
export type PeriodicBinding = {
  motion: CompositionPeriodic;
  path: PropertyPath;
};
export type ExpressionBinding = {
  expression: CompiledExpression;
  path: PropertyPath;
  segments: PropertyPathSegment[];
  /** Canonical segments after the layer; unique per layer (overlaps are invalid). */
  key: string;
  /** A precomp `timeRemap` expression runs in the instance clock, not the layer stage. */
  clock: boolean;
};
export type CompiledComposition = {
  comp: Composition;
  effectRevision: number;
  scopes: Map<string, CompositionScope>;
  layers: Map<CompositionScope, Map<string, CompositionLayer>>;
  signals: Map<string, Signal>;
  drivers: Map<string, DriverBinding[]>;
  periodic: Map<string, PeriodicBinding[]>;
  expressions: Map<string, ExpressionBinding[]>;
  /** Expressions or path auto-orient may read layers' pre-constraint stage values. */
  stageReads: boolean;
  /** Native shape geometry or a follow-path diagnostic needs located work budgets. */
  shapeWork: boolean;
  /** Ordinary 2D scopes do not allocate spatial world/camera geometry. */
  spatialScopes: Set<CompositionScope>;
  paths: Map<string, PropertyPath>;
  /** Static per-scope selections, so time-shifted evaluations stay cheap. */
  solo: Map<CompositionScope, Set<string> | null>;
  mattes: Map<CompositionScope, Set<string>>;
};
const compiled = new WeakMap<Composition, CompiledComposition>();
export const layerKey = (scope: readonly string[], id: string) =>
  [...scope, id].join("/");

export function resolvedPath(
  compiled: CompiledComposition,
  text: string,
): PropertyPath {
  const existing = compiled.paths.get(text);
  if (existing) return existing;
  const resolved = resolvePropertyPath(compiled.comp, text);
  if (!isResolvedProperty(resolved))
    passageError(resolved.code, resolved.message, { path: text });
  const parsed = parsePropertyPath(resolved.path);
  if (isPropertyPathError(parsed))
    passageError(parsed.code, parsed.message, { path: text });
  compiled.paths.set(text, parsed);
  return parsed;
}

export function compileComposition(comp: Composition): CompiledComposition {
  const cached = compiled.get(comp);
  const effectRevision = compositionEffectRegistryRevision();
  if (cached?.effectRevision === effectRevision) return cached;
  const validation = validateComposition(comp);
  if (!validation.ok) throw new PassageError(validation.diagnostics);
  const scopes = [comp, ...(comp.precomps ?? [])];
  const result: CompiledComposition = {
    comp,
    effectRevision,
    scopes: new Map(scopes.map((s) => [s.id, s])),
    layers: new Map(
      scopes.map((s) => [s, new Map(s.layers.map((l) => [l.id, l]))]),
    ),
    signals: new Map((comp.signals ?? []).map((signal) => [signal.id, signal])),
    drivers: new Map(),
    periodic: new Map(),
    expressions: new Map(),
    stageReads: false,
    shapeWork: scopes.some(
      (scope) =>
        scope.layers.some((layer) => layer.type === "shape") ||
        scope.constraints?.some(
          (constraint) => constraint.type === "follow-path",
        ),
    ),
    paths: new Map(),
    spatialScopes: new Set(
      scopes.filter((scope) =>
        scope.layers.some(
          (layer) => layer.threeD === true || layer.type === "camera",
        ),
      ),
    ),
    solo: new Map(),
    mattes: new Map(),
  };
  const bind = <T extends { path: PropertyPath }>(
    map: Map<string, T[]>,
    binding: T,
  ) => {
    const key = layerKey(binding.path.scope, binding.path.layer);
    const bindings = map.get(key) ?? [];
    bindings.push(binding);
    map.set(key, bindings);
  };
  for (const motion of comp.drivers ?? []) {
    bind(result.drivers, { motion, path: resolvedPath(result, motion.target) });
    for (const source of motion.sum ?? [motion.source ?? motion.signal!])
      if (source.includes(".")) resolvedPath(result, source);
  }
  for (const motion of comp.periodic ?? [])
    bind(result.periodic, {
      motion,
      path: resolvedPath(
        result,
        motion.target ?? `${motion.node}.${motion.property}`,
      ),
    });
  for (const expression of compileExpressions(comp)) {
    const path = expression.target.path;
    const layer = expression.target.resolved.layer!;
    bind(result.expressions, {
      expression,
      path,
      segments: path.segments,
      key: segmentKey(path.segments),
      clock: layer.type === "precomp" && path.segments[0]!.name === "timeRemap",
    });
  }
  result.stageReads =
    result.expressions.size > 0 ||
    scopes.some((scope) =>
      scope.layers.some((layer) => layer.transform?.autoOrient === "path"),
    );
  compiled.set(comp, result);
  return result;
}
