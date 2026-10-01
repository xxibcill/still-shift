import {
  validateComposition,
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
} from "@still-shift/scene-contract";
import { PassageError, passageError } from "../../passage-diagnostics.ts";

export type DriverBinding = { motion: CompositionDriver; path: PropertyPath };
export type PeriodicBinding = {
  motion: CompositionPeriodic;
  path: PropertyPath;
};
export type CompiledComposition = {
  comp: Composition;
  scopes: Map<string, CompositionScope>;
  layers: Map<CompositionScope, Map<string, CompositionLayer>>;
  drivers: Map<string, DriverBinding[]>;
  periodic: Map<string, PeriodicBinding[]>;
  paths: Map<string, PropertyPath>;
};
const compiled = new WeakMap<Composition, CompiledComposition>();
export const layerKey = (scope: string | undefined, id: string) =>
  `${scope ? scope + "/" : ""}${id}`;

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
  if (cached) return cached;
  const validation = validateComposition(comp);
  if (!validation.ok) throw new PassageError(validation.diagnostics);
  const scopes = [comp, ...(comp.precomps ?? [])];
  const result: CompiledComposition = {
    comp,
    scopes: new Map(scopes.map((s) => [s.id, s])),
    layers: new Map(
      scopes.map((s) => [s, new Map(s.layers.map((l) => [l.id, l]))]),
    ),
    drivers: new Map(),
    periodic: new Map(),
    paths: new Map(),
  };
  const bind = <T extends { path: PropertyPath }>(
    map: Map<string, T[]>,
    binding: T,
  ) => {
    const key = layerKey(binding.path.scope.at(-1), binding.path.layer);
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
  compiled.set(comp, result);
  return result;
}
