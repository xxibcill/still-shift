/**
 * `comp bake`: replace expressions and behaviours with keys, for inspection and for
 * consumers that cannot evaluate expressions. Keys hold each property's
 * expression-stage value (keys, motion craft and expressions, before constraints) at
 * every integer composition frame, so the baked composition evaluates identically at
 * those frames.
 */
import {
  COMPOSITION_LIMITS,
  compileExpressions,
  formatJsonPath,
  isResolvedProperty,
  layerNodeOf,
  parsePropertyPath,
  resolvePropertyPath,
  segmentKey,
  segmentsOverlap,
  validateComposition,
  type Composition,
  type CompositionDiagnostic,
  type CompositionLayer,
  type CompositionScope,
  type PropertyPath,
  type PropertyPathSegment,
} from "@still-shift/scene-contract";
import { evaluateStageProperties } from "./evaluate/index.ts";

export type BakedProperty = { path: string; keys: number };
export type BakeResult =
  | {
      ok: true;
      composition: Composition;
      baked: BakedProperty[];
      diagnostics: CompositionDiagnostic[];
    }
  | { ok: false; diagnostics: CompositionDiagnostic[] };

type Group = {
  path: PropertyPath;
  /** Property root: the target without a trailing vector/colour component. */
  segments: PropertyPathSegment[];
  text: string;
  origin: string;
};

const COMPONENTS = new Set(["x", "y", "z", "r", "g", "b", "a"]);
const ROOT_LENGTH: Record<string, number> = {
  transform: 2,
  masks: 2,
  effects: 2,
};

function propertyRoot(segments: PropertyPathSegment[]) {
  const length = ROOT_LENGTH[segments[0]!.name] ?? 1;
  return segments.slice(0, length);
}

const error = (
  code: string,
  path: string,
  message: string,
): CompositionDiagnostic => ({ code, severity: "error", message, path });

function hex(channels: number[]) {
  return `#${channels
    .map((c) =>
      Math.round(Math.max(0, Math.min(1, c)) * 255)
        .toString(16)
        .padStart(2, "0")
        .toUpperCase(),
    )
    .join("")}`;
}

const equal = (a: number | number[], b: number | number[]) =>
  Array.isArray(a)
    ? Array.isArray(b) && a.every((x, i) => x === b[i])
    : a === b;

/** Make every precomp along `route` referenced once, cloning shared definitions. */
function uniqueScope(comp: Composition, route: readonly string[]) {
  let scope: CompositionScope = comp;
  for (const id of route) {
    const host = scope.layers.find((layer) => layer.id === id)!;
    if (host.type !== "precomp") throw new Error(`"${id}" is not a precomp`);
    const references = [comp, ...(comp.precomps ?? [])]
      .flatMap((s) => s.layers)
      .filter((layer) => layer.type === "precomp" && layer.comp === host.comp);
    let definition = comp.precomps!.find((p) => p.id === host.comp)!;
    if (references.length > 1) {
      let n = 1;
      const ids = new Set(comp.precomps!.map((p) => p.id));
      while (ids.has(`${definition.id}-baked-${n}`)) n++;
      definition = {
        ...structuredClone(definition),
        id: `${definition.id}-baked-${n}`,
      };
      comp.precomps!.push(definition);
      host.comp = definition.id;
    }
    scope = definition;
  }
  return scope;
}

function write(
  layer: CompositionLayer,
  segments: PropertyPathSegment[],
  value: unknown,
) {
  const [head, next] = segments;
  const target = layer as Record<string, unknown>;
  switch (head!.name) {
    case "transform":
      target.transform = { ...(layer.transform ?? {}), [next!.name]: value };
      return;
    case "masks": {
      const mask = layer.masks!.find((m) => m.id === head!.index)!;
      (mask as Record<string, unknown>)[next!.name] = value;
      return;
    }
    case "effects": {
      const effect = layer.effects!.find((e) => e.id === head!.index)!;
      effect.params = {
        ...(effect.params ?? {}),
        [next!.name]: value,
      } as never;
      return;
    }
    default:
      target[head!.name] = value;
  }
}

/** Bake every expression and behaviour of a valid composition into keys. */
export function bakeExpressions(input: unknown): BakeResult {
  const validation = validateComposition(input);
  if (!validation.ok) return validation;
  const source = validation.composition;
  const diagnostics: CompositionDiagnostic[] = [];
  const expressions = compileExpressions(source);
  if (!expressions.length && !source.behaviours?.length)
    return { ok: true, composition: source, baked: [], diagnostics };

  const groups = new Map<string, Group>();
  for (const expression of expressions) {
    const { path } = expression.target;
    let segments = path.segments;
    const last = segments.at(-1)!;
    if (
      COMPONENTS.has(last.name) &&
      segments.length > propertyRoot(segments).length
    )
      segments = segments.slice(0, -1);
    segments = propertyRoot(segments);
    const node = layerNodeOf(path);
    const key = `${node}#${segmentKey(segments)}`;
    if (!groups.has(key))
      groups.set(key, {
        path: { ...path, segments },
        segments,
        text: `${node}.${segmentKey(segments)}`,
        origin: formatJsonPath(expression.entry.origin),
      });
  }
  const list = [...groups.values()];
  const samples = list.map(() => new Map<number, number | number[]>());
  for (let frame = 0; frame < source.frameCount; frame++) {
    const values = evaluateStageProperties(
      source,
      list.map((group) => group.text),
      frame,
    );
    for (const [i, sample] of values.entries()) {
      const keyTime = sample.keyTime;
      const rounded = Math.round(keyTime);
      if (Math.abs(keyTime - rounded) > 1e-9)
        return {
          ok: false,
          diagnostics: [
            error(
              "comp-bake-time",
              list[i]!.origin,
              `"${list[i]!.text}" samples layer time ${keyTime} at frame ${frame}; keys need integer layer frames (stretch ±1, no fractional remap)`,
            ),
          ],
        };
      const previous = samples[i]!.get(rounded);
      if (previous !== undefined && !equal(previous, sample.value))
        return {
          ok: false,
          diagnostics: [
            error(
              "comp-bake-time",
              list[i]!.origin,
              `"${list[i]!.text}" has different values at layer frame ${rounded} (a held or repeated layer time); it cannot be keyed`,
            ),
          ],
        };
      samples[i]!.set(rounded, sample.value);
    }
  }

  const output = structuredClone(source);
  const baked: BakedProperty[] = [];
  for (const [i, group] of list.entries()) {
    const scope = uniqueScope(output, group.path.scope);
    const layer = scope.layers.find((l) => l.id === group.path.layer)!;
    const resolved = resolvePropertyPath(source, group.text);
    const color = isResolvedProperty(resolved) && resolved.type === "color";
    const frames = [...samples[i]!.keys()].sort((a, b) => a - b);
    let quantized = false;
    const format = (value: number | number[]) => {
      if (!color) return value;
      const channels = value as number[];
      if (channels.some((c) => Math.abs(c * 255 - Math.round(c * 255)) > 1e-6))
        quantized = true;
      return hex(channels);
    };
    // Drop the middle of runs of equal values; linear keys reproduce them exactly.
    const keys: { frame: number; value: unknown; interpolation: "linear" }[] =
      [];
    frames.forEach((frame, index) => {
      const value = samples[i]!.get(frame)!;
      const before = samples[i]!.get(frames[index - 1]!);
      const after = samples[i]!.get(frames[index + 1]!);
      if (
        before !== undefined &&
        after !== undefined &&
        equal(before, value) &&
        equal(after, value)
      )
        return;
      keys.push({ frame, value: format(value), interpolation: "linear" });
    });
    if (keys.length > COMPOSITION_LIMITS.maxKeys)
      return {
        ok: false,
        diagnostics: [
          error(
            "comp-bake-limit",
            group.origin,
            `"${group.text}" needs ${keys.length} keys; at most ${COMPOSITION_LIMITS.maxKeys} are allowed`,
          ),
        ],
      };
    if (quantized)
      diagnostics.push({
        code: "comp-bake-quantized",
        severity: "warning",
        message: `"${group.text}" colours were rounded to 8-bit channels`,
        path: group.origin,
      });
    write(
      layer,
      group.segments,
      keys.every((key) => equal(key.value as never, keys[0]!.value as never))
        ? keys[0]!.value
        : { keys },
    );
    baked.push({ path: group.text, keys: keys.length });
  }

  // Motion craft on a baked property is folded into its keys.
  const bakedPath = (text: string) => {
    const resolved = resolvePropertyPath(source, text);
    if (!isResolvedProperty(resolved)) return false;
    const path = parsePropertyPath(resolved.path) as PropertyPath;
    return list.some(
      (group) =>
        layerNodeOf(group.path) === layerNodeOf(path) &&
        segmentsOverlap(group.segments, path.segments),
    );
  };
  if (output.drivers) {
    output.drivers = output.drivers.filter(
      (driver) => !bakedPath(driver.target),
    );
    for (const [i, driver] of output.drivers.entries()) {
      const reads = [driver.source, ...(driver.sum ?? [])].filter(
        (text): text is string => !!text && text.includes("."),
      );
      if ((driver.map?.delay || driver.map?.lag) && reads.some(bakedPath))
        diagnostics.push({
          code: "comp-bake-history",
          severity: "warning",
          message:
            "This driver reads a baked property at earlier times; values before frame 0 hold the first key",
          path: formatJsonPath(["drivers", i]),
        });
    }
    if (!output.drivers.length) delete output.drivers;
  }
  if (output.periodic) {
    output.periodic = output.periodic.filter(
      (motion) =>
        !bakedPath(motion.target ?? `${motion.node}.${motion.property}`),
    );
    if (!output.periodic.length) delete output.periodic;
  }
  delete output.expressions;
  delete output.behaviours;

  const check = validateComposition(output);
  if (!check.ok) return check;
  return {
    ok: true,
    composition: check.composition,
    baked,
    diagnostics: [...diagnostics, ...check.diagnostics],
  };
}
