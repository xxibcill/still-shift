/**
 * `comp bake`: replace expressions and behaviours with keys, for inspection and for
 * consumers that cannot evaluate expressions. Keys hold each property's
 * expression-stage value (keys, motion craft and expressions, before constraints) at
 * every integer composition frame, so the baked composition evaluates identically at
 * those frames.
 */
import {
  COMPOSITION_LIMITS,
  compositionEffectDefinition,
  effectCurvePointIndex,
  splitEffectCurve,
  compileExpressions,
  formatJsonPath,
  implicitAnchorDependencies,
  isResolvedProperty,
  layerNodeOf,
  locateShapeProperty,
  parsePropertyPath,
  resolvePropertyPath,
  segmentKey,
  segmentsOverlap,
  validateComposition,
  type Composition,
  type CompositionDiagnostic,
  type CompositionLayer,
  type CompositionScope,
  type CompiledExpression,
  type ExpressionAst,
  type PropertyPath,
  type PropertyPathSegment,
} from "@still-shift/scene-contract";
import { AUTO_ORIENT_LOOKAROUND_FRAMES } from "./evaluate/evaluate.ts";
import { layerContentTime } from "./evaluate/time-controls.ts";
import {
  evaluateComp,
  evaluateProperty,
  evaluateStageProperties,
  type EvaluationOptions,
  type EvaluatedLayerTree,
  type StageSample,
} from "./evaluate/index.ts";

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
  lookaround: boolean;
};

type EchoClock = {
  frame: number;
  options: EvaluationOptions;
  layers: { node: string; revision?: string }[];
};
type EchoProperty = { index: number; components?: number[] };
type RequiredComponents = ReadonlyMap<number, ReadonlySet<number> | undefined>;

const COMPONENTS = new Set(["x", "y", "z", "r", "g", "b", "a"]);
const COMPONENT_INDEX: Record<string, number> = {
  x: 0,
  y: 1,
  z: 2,
  r: 0,
  g: 1,
  b: 2,
  a: 3,
};
const ROOT_LENGTH: Record<string, number> = {
  transform: 2,
  masks: 2,
  effects: 2,
};

function propertyRoot(segments: PropertyPathSegment[]) {
  if (segments[0]!.name === "contents") {
    const last = segments.at(-1)!;
    return last.index === undefined && COMPONENTS.has(last.name)
      ? segments.slice(0, -1)
      : segments;
  }
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

/** These path readers can leave the current root clock. */
function shiftedPropertyReads(ast: ExpressionAst): Set<string> {
  const paths = new Set<string>();
  const visit = (node: ExpressionAst) => {
    if ("call" in node) {
      if (
        ["valueAtTime", "velocityAtTime", "spring", "heading"].includes(
          node.call,
        ) &&
        node.args[0] &&
        "str" in node.args[0]
      )
        paths.add(node.args[0].str);
      node.args.forEach(visit);
    } else if ("op" in node) node.args.forEach(visit);
    else if ("vec" in node) node.vec.forEach(visit);
    else if ("member" in node) visit(node.of);
  };
  visit(ast);
  return paths;
}

/** Match the root/scope clocks used by the render graph's temporal echo samples. */
function echoClocks(source: Composition, frame: number) {
  const clocks = new Map<string, EchoClock>();
  const visit = (tree: EvaluatedLayerTree, route: string[]) => {
    const mattes = new Set(
      tree.layers.flatMap((layer) =>
        layer.layer.trackMatte ? [layer.layer.trackMatte.layer] : [],
      ),
    );
    for (const layer of tree.layers) {
      if (
        !layer.drawable &&
        !(layer.visible && layer.layer.type === "group") &&
        !mattes.has(layer.id)
      )
        continue;
      const echo = layer.effects.find(
        (effect) => effect.enabled && effect.effect === "time.echo",
      );
      if (echo) {
        const { count, spacing, decay, skipUnchanged } = echo.params as Record<
          string,
          number
        >;
        if (decay)
          for (let i = count!; i >= 1; i--) {
            const time = Math.max(0, tree.time - i * spacing!);
            const scope = route.join("/");
            const key = `${scope}:${time}`;
            const layers = clocks.get(key)?.layers ?? [];
            layers.push({
              node: [...route, layer.id].join("/"),
              ...(skipUnchanged ? { revision: echo.id } : {}),
            });
            clocks.set(key, {
              frame: route.length ? frame : time,
              options: route.length ? { scopeTimes: { [scope]: time } } : {},
              layers,
            });
          }
      }
      if (layer.precomp) visit(layer.precomp, [...route, layer.id]);
    }
  };
  visit(evaluateComp(source, frame), []);
  return [...clocks.values()];
}

/** Baked properties contributing to one echo, including property and clock reads. */
function echoProperties(
  source: Composition,
  expressions: CompiledExpression[],
  groups: Group[],
  clock: EchoClock,
  node: string,
  revision?: string,
) {
  const scopes = new Map(source.precomps?.map((scope) => [scope.id, scope]));
  const needed = new Map<string, { path: PropertyPath; shifted: boolean }>();
  const neededRoots = new Map<string, Set<number> | undefined>();
  const keyOf = (path: PropertyPath) =>
    `${layerNodeOf(path)}#${segmentKey(propertyRoot(path.segments))}`;
  const resolve = (text: string) => {
    const property = resolvePropertyPath(source, text);
    return isResolvedProperty(property)
      ? (parsePropertyPath(property.path) as PropertyPath)
      : undefined;
  };
  const scopeAt = (route: string[]) => {
    let scope: CompositionScope = source;
    for (const id of route) {
      const host = scope.layers.find((layer) => layer.id === id)!;
      scope = scopes.get(
        (host as Extract<CompositionLayer, { type: "precomp" }>).comp,
      )!;
    }
    return scope;
  };
  const scopeTimes = new Map<string, number>();
  const scopeTime = (route: string[]) => {
    if (!route.length) return clock.frame;
    const key = route.join("/");
    const cached = scopeTimes.get(key);
    if (cached !== undefined) return cached;
    const remap =
      clock.options.scopeTimes?.[key] ??
      (evaluateProperty(
        source,
        `${key}.timeRemap`,
        clock.frame,
        clock.options,
      ) as number);
    const time = Math.max(0, Math.min(scopeAt(route).frameCount - 1, remap));
    scopeTimes.set(key, time);
    return time;
  };
  const request = (path: PropertyPath, shifted: boolean) => {
    const key = `${layerNodeOf(path)}#${segmentKey(path.segments)}#${shifted}`;
    needed.set(key, { path, shifted });
    const root = keyOf(path);
    if (neededRoots.has(root) && neededRoots.get(root) === undefined) return;
    if (path.segments.length === propertyRoot(path.segments).length) {
      neededRoots.set(root, undefined);
      return;
    }
    const components = neededRoots.get(root) ?? new Set<number>();
    components.add(COMPONENT_INDEX[path.segments.at(-1)!.name]!);
    neededRoots.set(root, components);
  };
  const add = (text: string, shifted = false) => {
    const path = resolve(text);
    if (!path || path.layer === "comp") return;
    request(path, shifted);
    path.scope.forEach((_, i) => {
      const clock = resolve(
        `${path.scope.slice(0, i + 1).join("/")}.timeRemap`,
      )!;
      request(clock, shifted);
    });
  };
  const transforms = new Set<string>();
  const motionTargets = new Set(
    [
      ...(source.drivers ?? []).map((writer) => writer.target),
      ...(source.periodic ?? []).map(
        (writer) => writer.target ?? `${writer.node}.${writer.property}`,
      ),
    ].map((text) => keyOf(resolve(text)!)),
  );
  const transform = (
    route: string[],
    layer: CompositionLayer,
    opacity: boolean,
    shifted = false,
  ) => {
    const node = [...route, layer.id].join("/");
    if (opacity) add(`${node}.transform.opacity`, shifted);
    const key = `${node}#${shifted}`;
    if (transforms.has(key)) return;
    transforms.add(key);
    for (const field of [
      "anchor",
      "position",
      "scale",
      "rotation",
      "skewX",
      "skewY",
    ])
      add(`${node}.transform.${field}`, shifted);
    const scope = scopeAt(route);
    if (layer.parent) {
      const parent = scope.layers.find(
        (candidate) => candidate.id === layer.parent,
      )!;
      transform(route, parent, parent.type === "group", shifted);
    }
    for (const constraint of scope.constraints ?? []) {
      if (constraint.target !== layer.id) continue;
      add(`${node}.constraintReference`, shifted);
      const reference =
        "anchor" in constraint
          ? constraint.anchor
          : "surface" in constraint
            ? constraint.surface
            : "toward" in constraint
              ? constraint.toward
              : "path" in constraint
                ? constraint.path
                : undefined;
      if (reference)
        transform(
          route,
          scope.layers.find((candidate) => candidate.id === reference)!,
          true,
          shifted,
        );
    }
  };
  const painted = new Set<string>();
  const paint = (route: string[], layer: CompositionLayer, raw = false) => {
    const node = [...route, layer.id].join("/");
    if (painted.has(node)) return;
    painted.add(node);
    transform(route, layer, true);
    for (const field of ["color", "reveal", "stateMix"])
      add(`${node}.${field}`);
    // Raw ghosts retain their own primitive blur and inherited group blur.
    const scope = scopeAt(route);
    for (
      let current: CompositionLayer | undefined = layer;
      current;
      current = current.parent
        ? scope.layers.find((candidate) => candidate.id === current!.parent)
        : undefined
    ) {
      if (current !== layer && current.type !== "group") continue;
      if (!current.effects?.length) continue;
      const time = layerContentTime(
        current,
        scopeTime(route),
        scope.fps ?? source.fps,
      );
      const blur = current.effects?.find(
        (effect) =>
          effect.enabled !== false &&
          effect.effect === "blur.primitive" &&
          time >= (effect.inPoint ?? -Infinity) &&
          time < (effect.outPoint ?? Infinity),
      );
      if (blur) {
        const text = `${[...route, current.id].join("/")}.effects[${blur.id}].radius`;
        add(text);
        const key = keyOf(resolve(text)!);
        if (
          typeof blur.params?.radius === "number" &&
          blur.params.radius > 0 &&
          !groups.some((group) => keyOf(group.path) === key) &&
          !motionTargets.has(key)
        )
          break;
      }
    }
    if (!raw) {
      for (const group of groups)
        if (
          layerNodeOf(group.path) === node &&
          (group.segments[0]!.name === "masks" ||
            (group.segments[0]!.name === "effects" &&
              layer.effects?.find(
                (effect) => effect.id === group.segments[0]!.index,
              )?.effect !== "time.echo"))
        )
          add(group.text);
      if (layer.trackMatte)
        paint(
          route,
          scope.layers.find(
            (candidate) => candidate.id === layer.trackMatte!.layer,
          )!,
        );
      for (const effect of layer.effects ?? [])
        if (effect.space)
          transform(
            route,
            scope.layers.find((candidate) => candidate.id === effect.space)!,
            true,
          );
    }
    if (layer.type === "precomp") {
      add(`${node}.timeRemap`);
      for (const child of scopes.get(layer.comp)!.layers)
        paint([...route, layer.id], child);
    } else if (layer.type === "group") {
      for (const child of scopeAt(route).layers)
        if (child.parent === layer.id) paint(route, child);
    }
  };
  const route = node.split("/");
  const id = route.pop()!;
  paint(route, scopeAt(route).layers.find((layer) => layer.id === id)!, true);
  if (revision) add(`${node}.effects[${revision}].sourceRevision`);
  const drivers = (source.drivers ?? []).map((driver) => ({
    driver,
    path: resolve(driver.target)!,
  }));
  const periodic = (source.periodic ?? []).map((motion) => ({
    motion,
    path: resolve(motion.target ?? `${motion.node}.${motion.property}`)!,
  }));
  const overlaps = (a: PropertyPath, b: PropertyPath) =>
    layerNodeOf(a) === layerNodeOf(b) &&
    segmentsOverlap(a.segments, b.segments);
  for (const { path, shifted } of needed.values()) {
    for (const expression of expressions) {
      if (!overlaps(expression.target.path, path)) continue;
      const shiftedReads = shiftedPropertyReads(expression.ast);
      for (const read of expression.reads)
        add(read.resolved.path, shifted || shiftedReads.has(read.text));
    }
    for (const { driver, path: target } of drivers) {
      if (!overlaps(target, path)) continue;
      const shiftedRead = shifted || !!(driver.map?.delay || driver.map?.lag);
      for (const text of [driver.source, ...(driver.sum ?? [])]) {
        if (!text?.includes(".")) continue;
        add(text, shiftedRead);
        const read = resolve(text)!;
        if (read.segments[0]!.name === "transform")
          transform(
            read.scope,
            scopeAt(read.scope).layers.find(
              (layer) => layer.id === read.layer,
            )!,
            true,
            shiftedRead,
          );
      }
    }
    const layer = scopeAt(path.scope).layers.find(
      (layer) => layer.id === path.layer,
    )!;
    const writers = [
      ...expressions.map((expression) => expression.target.path),
      ...drivers.map(({ path }) => path),
      ...periodic.flatMap(({ motion, path }) =>
        !shifted && clock.frame >= motion.start && clock.frame <= motion.end
          ? [path]
          : [],
      ),
    ].filter(
      (writer) =>
        layerNodeOf(writer) === layerNodeOf(path) &&
        writer.segments[0]!.name === "constraintReference",
    );
    const written = ["x", "y"].map((axis) =>
      writers.some(
        (writer) => !writer.segments[1] || writer.segments[1].name === axis,
      ),
    );
    for (const segments of implicitAnchorDependencies(
      layer,
      path.segments,
      written,
    ))
      add(`${layerNodeOf(path)}.${segmentKey(segments)}`, shifted);
  }
  return groups.flatMap((group, index): EchoProperty[] => {
    const key = keyOf(group.path);
    if (!neededRoots.has(key)) return [];
    const components = neededRoots.get(key);
    return [{ index, ...(components ? { components: [...components] } : {}) }];
  });
}

function autoOrientMismatch(
  source: EvaluatedLayerTree,
  baked: EvaluatedLayerTree,
  route: string[] = [],
): string | undefined {
  for (const [i, layer] of source.layers.entries()) {
    const output = baked.layers[i]!;
    const path = [...route, layer.id];
    if (
      layer.layer.transform?.autoOrient === "path" &&
      layer.transform.rotation !== output.transform.rotation
    )
      return `${path.join("/")}.transform.autoOrient`;
    if (layer.precomp && output.precomp) {
      const mismatch = autoOrientMismatch(layer.precomp, output.precomp, path);
      if (mismatch) return mismatch;
    }
  }
  return undefined;
}

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
    case "contents": {
      if (layer.type !== "shape") return;
      const location = locateShapeProperty(layer.contents, segments)!;
      let parent = target;
      for (const part of location.jsonPath.slice(0, -1)) {
        if (parent[part] === undefined) parent[part] = {};
        parent = parent[part] as Record<string, unknown>;
      }
      parent[location.jsonPath.at(-1)!] = value;
      return;
    }
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
      if (next!.index !== undefined) {
        const descriptor = compositionEffectDefinition(effect.effect)!
          .properties[next!.name]!;
        if (descriptor.type !== "curve")
          throw Error("Unexpected indexed effect property");
        const points = splitEffectCurve(
          effect.params?.[next!.name],
          descriptor.default,
        );
        points[effectCurvePointIndex(next!.index)!] = value;
        effect.params = {
          ...(effect.params ?? {}),
          [next!.name]: points,
        } as never;
        return;
      }
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
        lookaround:
          expression.target.resolved.layer?.transform?.autoOrient === "path" &&
          segments[0]!.name === "transform" &&
          segments[1]!.name === "position",
      });
  }
  const list = [...groups.values()];
  const samples = list.map(() => new Map<number, number | number[]>());
  const sampledComponents = list.map(
    () => new Map<number, Set<number> | undefined>(),
  );
  const margin = list.some((group) => group.lookaround)
    ? AUTO_ORIENT_LOOKAROUND_FRAMES
    : 0;
  const recordSamples = (
    indices: number[],
    values: StageSample[],
    frame: number,
    required?: RequiredComponents,
  ): CompositionDiagnostic | undefined => {
    for (const [at, sample] of values.entries()) {
      const i = indices[at]!;
      const keyTime = sample.keyTime;
      const rounded = Math.round(keyTime);
      if (Math.abs(keyTime - rounded) > 1e-9)
        return error(
          "comp-bake-time",
          list[i]!.origin,
          `"${list[i]!.text}" samples layer time ${keyTime} at frame ${frame}; keys need integer layer frames (stretch ±1, no fractional remap)`,
        );
      const previous = samples[i]!.get(rounded);
      const recorded = sampledComponents[i]!.get(rounded);
      const components = Array.isArray(sample.value)
        ? required?.get(i)
        : undefined;
      const conflict =
        previous !== undefined &&
        (Array.isArray(previous) && Array.isArray(sample.value)
          ? sample.value.some(
              (value, axis) =>
                (!components || components.has(axis)) &&
                (!recorded || recorded.has(axis)) &&
                previous[axis] !== value,
            )
          : !equal(previous, sample.value));
      if (conflict)
        return error(
          "comp-bake-time",
          list[i]!.origin,
          `"${list[i]!.text}" has different values at layer frame ${rounded} (a held or repeated layer time); it cannot be keyed`,
        );
      const value =
        Array.isArray(previous) && Array.isArray(sample.value) && components
          ? previous.map((value, axis) =>
              components.has(axis) ? (sample.value as number[])[axis]! : value,
            )
          : sample.value;
      samples[i]!.set(rounded, value);
      sampledComponents[i]!.set(
        rounded,
        components && (previous === undefined || recorded)
          ? new Set([...(recorded ?? []), ...components])
          : undefined,
      );
    }
  };
  const sampleAt = (
    indices: number[],
    frame: number,
    options: EvaluationOptions = {},
    required?: RequiredComponents,
  ) =>
    recordSamples(
      indices,
      evaluateStageProperties(
        source,
        indices.map((i) => list[i]!.text),
        frame,
        options,
      ),
      frame,
      required,
    );
  const hasEcho = [source, ...(source.precomps ?? [])].some((scope) =>
    scope.layers.some((layer) =>
      layer.effects?.some((effect) => effect.effect === "time.echo"),
    ),
  );
  const timedBlur = [source, ...(source.precomps ?? [])].some((scope) =>
    scope.layers.some((layer) =>
      layer.effects?.some(
        (effect) =>
          effect.effect === "blur.primitive" &&
          (effect.inPoint !== undefined || effect.outPoint !== undefined),
      ),
    ),
  );
  const periodicReference = source.periodic?.some((motion) => {
    const target = resolvePropertyPath(
      source,
      motion.target ?? `${motion.node}.${motion.property}`,
    );
    return (
      isResolvedProperty(target) &&
      (parsePropertyPath(target.path) as PropertyPath).segments[0]!.name ===
        "constraintReference"
    );
  });
  const echoTargets = new Map<string, EchoProperty[]>();
  for (let frame = -margin; frame < source.frameCount + margin; frame++) {
    const indices = list.flatMap((group, i) =>
      group.lookaround || (frame >= 0 && frame < source.frameCount) ? [i] : [],
    );
    const diagnostic = sampleAt(indices, frame);
    if (diagnostic) return { ok: false, diagnostics: [diagnostic] };
    if (hasEcho && frame >= 0 && frame < source.frameCount)
      for (const clock of echoClocks(source, frame)) {
        const clockKey =
          timedBlur || periodicReference
            ? JSON.stringify([clock.frame, clock.options.scopeTimes])
            : "";
        const required = new Map<number, Set<number> | undefined>();
        for (const { node, revision } of clock.layers) {
          const key = `${node}#${revision ?? ""}#${clockKey}`;
          let targets = echoTargets.get(key);
          if (!targets) {
            targets = echoProperties(
              source,
              expressions,
              list,
              clock,
              node,
              revision,
            );
            echoTargets.set(key, targets);
          }
          for (const { index, components } of targets) {
            if (required.has(index) && required.get(index) === undefined)
              continue;
            if (!components) {
              required.set(index, undefined);
              continue;
            }
            const selected = required.get(index) ?? new Set<number>();
            components.forEach((axis) => selected.add(axis));
            required.set(index, selected);
          }
        }
        if (!required.size) continue;
        const diagnostic = sampleAt(
          [...required.keys()],
          clock.frame,
          clock.options,
          required,
        );
        if (diagnostic) return { ok: false, diagnostics: [diagnostic] };
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
  const hasAutoOrient = [source, ...(source.precomps ?? [])].some((scope) =>
    scope.layers.some((layer) => layer.transform?.autoOrient === "path"),
  );
  if (hasAutoOrient)
    for (let frame = 0; frame < source.frameCount; frame++) {
      const mismatch = autoOrientMismatch(
        evaluateComp(source, frame),
        evaluateComp(check.composition, frame),
      );
      if (mismatch)
        return {
          ok: false,
          diagnostics: [
            error(
              "comp-bake-auto-orient",
              mismatch,
              `Auto-orientation changes at frame ${frame}; its position history cannot be preserved by these keys`,
            ),
          ],
        };
    }
  return {
    ok: true,
    composition: check.composition,
    baked,
    diagnostics: [...diagnostics, ...check.diagnostics],
  };
}
