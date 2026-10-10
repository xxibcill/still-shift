import {
  cameraOpticalDependencies,
  compileExpressions,
  implicitAnchorDependencies,
  isPropertyPathError,
  isResolvedProperty,
  layerNodeOf,
  locateShapeProperty,
  parsePropertyPath,
  resolvePropertyPath,
  segmentsOverlap,
  type Composition,
  type CompositionLayer,
  type ExpressionAst,
  type PropertyPath,
  type PropertyPathSegment,
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

function readsValue(ast: ExpressionAst): boolean {
  if ("id" in ast) return ast.id === "value";
  if ("call" in ast || "op" in ast) return ast.args.some(readsValue);
  if ("vec" in ast) return ast.vec.some(readsValue);
  if ("member" in ast) return readsValue(ast.of);
  return false;
}

function hasVaryingKeys(
  value: unknown,
  ignored?: ReadonlySet<object>,
): boolean {
  if (value === null || typeof value !== "object") return false;
  if (ignored?.has(value)) return false;
  if (Array.isArray(value))
    return value.some((part) => hasVaryingKeys(part, ignored));
  const record = value as Record<string, unknown>;
  if (Object.hasOwn(record, "keys")) {
    if (!Array.isArray(record.keys) || !record.keys.length) return true;
    const first = JSON.stringify(record.keys[0].value);
    return record.keys.some(
      (key) =>
        JSON.stringify(key.value) !== first ||
        key.in ||
        key.out ||
        key.spatialIn ||
        key.spatialOut,
    );
  }
  return Object.values(record).some((part) => hasVaryingKeys(part, ignored));
}

function field(value: unknown, name: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    const axis = (
      { x: 0, y: 1, z: 2, r: 0, g: 1, b: 2, a: 3 } as Record<string, number>
    )[name];
    return axis === undefined ? undefined : value[axis];
  }
  return (value as Record<string, unknown>)[name];
}

/** Walk authored values, stopping at keys before descending into a component. */
function varyingPath(
  value: unknown,
  segments: readonly PropertyPathSegment[],
): boolean {
  if (!segments.length) return hasVaryingKeys(value);
  if (value && typeof value === "object" && "keys" in value) {
    const keys = (value as { keys: { value: unknown }[] }).keys;
    // Even equal projected endpoints can move when explicit handles are present.
    if (hasVaryingKeys(value)) {
      const projected = keys.map((key) => ({
        ...key,
        value: pathValue(key.value, segments),
      }));
      if (projected.some((key) => key.value === undefined)) return true;
      return hasVaryingKeys({ keys: projected });
    }
    return false;
  }
  const [head, ...rest] = segments;
  let next = field(value, head!.name);
  if (head!.index !== undefined && Array.isArray(next))
    next =
      next.find((item) => item?.id === head!.index) ??
      next[Number(head!.index)];
  return varyingPath(next, rest);
}
function pathValue(
  value: unknown,
  segments: readonly PropertyPathSegment[],
): unknown {
  for (const segment of segments) value = field(value, segment.name);
  return value;
}
function authoredVaries(
  layer: CompositionLayer,
  segments: readonly PropertyPathSegment[],
): boolean {
  const [head, next, ...rest] = segments;
  if (head?.name === "contents" && layer.type === "shape") {
    const location = locateShapeProperty(layer.contents, [...segments]);
    if (!location) return true;
    const value = location.owner[location.key];
    return location.component === undefined
      ? hasVaryingKeys(value)
      : varyingPath(value, [
          { name: ["x", "y", "z", "a"][location.component]! },
        ]);
  }
  if (head?.name === "effects") {
    const effect = layer.effects?.find((effect) => effect.id === head.index);
    return varyingPath(effect?.params, [next!, ...rest]);
  }
  return varyingPath(layer, segments);
}

/** Only a whole authored track can be hidden by a complete expression overwrite. */
function authoredTrack(
  layer: CompositionLayer,
  segments: readonly PropertyPathSegment[],
): unknown {
  if (segments[0]?.name === "contents" && layer.type === "shape") {
    const location = locateShapeProperty(layer.contents, [...segments]);
    return location?.component === undefined
      ? location?.owner[location.key]
      : undefined;
  }
  let value: unknown = layer;
  for (let i = 0; i < segments.length; i++) {
    if (value && typeof value === "object" && "keys" in value) return undefined;
    const segment = segments[i]!;
    value = field(value, segment.name);
    if (segment.index !== undefined && Array.isArray(value))
      value = value.find((item) => item?.id === segment.index);
    if (i === 0 && segment.name === "effects") value = field(value, "params");
  }
  return value;
}

/** Dynamic selection hints; evaluated closure hashes remain the authority for reuse. */
export function compositionLayerVariation(composition: Composition) {
  const expressions = compileExpressions(composition);
  const motion = [
    ...(composition.drivers ?? []).map((driver) => driver.target),
    ...(composition.periodic ?? []).map(
      (periodic) => periodic.target ?? `${periodic.node}.${periodic.property}`,
    ),
  ].flatMap((text) => {
    const resolved = resolvePropertyPath(composition, text);
    if (!isResolvedProperty(resolved)) return [];
    const path = parsePropertyPath(resolved.path);
    return isPropertyPathError(path) ? [] : [path];
  });
  const overlaps = (a: PropertyPath, b: PropertyPath) =>
    layerNodeOf(a) === layerNodeOf(b) &&
    segmentsOverlap(a.segments, b.segments);
  const evaluateProperty = (
    path: PropertyPath,
    layer: CompositionLayer | undefined,
    seen: Set<string>,
  ): boolean => {
    const nextSeen = seen;
    if (!layer) {
      const camera = composition.camera2d;
      const axis = path.segments[1]?.name as "x" | "y" | "zoom";
      return (
        !!camera &&
        (!!camera.startTangent?.[axis] ||
          !!camera.endTangent?.[axis] ||
          (axis !== "zoom" &&
            !!camera.jolts?.some(
              (jolt) => jolt[axis === "x" ? "dx" : "dy"] !== 0,
            )) ||
          camera.keys.some((key) => key[axis] !== camera.keys[0]![axis]))
      );
    }
    const propertyWriters = expressions.filter((expression) =>
      overlaps(expression.target.path, path),
    );
    if (
      propertyWriters.some(
        (expression) =>
          expression.signals.length > 0 ||
          readsClock(expression.ast) ||
          expression.reads.some((read) =>
            varying(read.path, read.resolved.layer, nextSeen),
          ),
      )
    )
      return true;
    // A complete expression overwrite does not read authored keys or the implicit clock
    // unless its AST consumes the pre-expression value.
    if (
      propertyWriters.some(
        (expression) =>
          expression.target.path.segments.length <= path.segments.length &&
          !readsValue(expression.ast),
      )
    )
      return false;
    if (
      authoredVaries(layer, path.segments) ||
      motion.some((target) => overlaps(target, path))
    )
      return true;
    const head = path.segments[0]?.name;
    if (
      head === "timeRemap" &&
      (!("timeRemap" in layer) || layer.timeRemap === undefined)
    )
      return true;
    const dependencies: PropertyPathSegment[][] = [];

    if (
      head === "transform" &&
      path.segments[1]?.name === "rotation" &&
      layer.transform?.autoOrient === "path"
    )
      dependencies.push([{ name: "transform" }, { name: "position" }]);
    const writers = [
      ...expressions.map((expression) => expression.target.path),
      ...motion,
    ].filter((target) => layerNodeOf(target) === layerNodeOf(path));
    const referenceAxes = [false, false, false];
    for (const expression of expressions) {
      // `value` sees the base anchor before this expression writes the reference.
      if (readsValue(expression.ast)) continue;
      const target = expression.target.path;
      if (
        layerNodeOf(target) !== layerNodeOf(path) ||
        target.segments[0]?.name !== "constraintReference"
      )
        continue;
      const axis = target.segments[1]?.name;
      if (axis === undefined) referenceAxes.fill(true);
      else referenceAxes[["x", "y", "z"].indexOf(axis)] = true;
    }
    dependencies.push(
      ...implicitAnchorDependencies(layer, path.segments, referenceAxes),
    );
    for (const name of cameraOpticalDependencies(
      layer,
      head!,
      writers.map((target) => target.segments[0]!.name),
    ))
      dependencies.push([{ name }]);
    if (
      dependencies.some((segments) =>
        varying({ ...path, segments }, layer, nextSeen),
      )
    )
      return true;
    return false;
  };
  const completed = new Map<string, boolean>();
  const varying = (
    path: PropertyPath,
    layer: CompositionLayer | undefined,
    seen: Set<string>,
  ): boolean => {
    const key = `${layerNodeOf(path)}:${JSON.stringify(path.segments)}`;
    const cached = completed.get(key);
    if (cached !== undefined) return cached;
    if (seen.has(key)) return true;
    seen.add(key);
    try {
      const result = evaluateProperty(path, layer, seen);
      completed.set(key, result);
      return result;
    } finally {
      seen.delete(key);
    }
  };
  const driven = new Set(motion.map(layerNodeOf));
  const ignoredKeys = new Map<string, Set<object>>();
  const overrideCounts = new Map<string, Map<object, number>>();
  const overrideLayers = new Map<string, CompositionLayer>();
  for (const expression of expressions)
    if (
      expression.signals.length ||
      readsClock(expression.ast) ||
      expression.reads.some((read) =>
        varying(read.path, read.resolved.layer, new Set()),
      )
    )
      driven.add(layerNodeOf(expression.target.path));
  for (const expression of expressions) {
    if (
      readsValue(expression.ast) ||
      readsClock(expression.ast) ||
      expression.signals.length ||
      expression.reads.some((read) =>
        varying(read.path, read.resolved.layer, new Set()),
      )
    )
      continue;
    const layer = expression.target.resolved.layer;
    if (!layer) continue;
    const raw = authoredTrack(layer, expression.target.path.segments);
    if (!raw || typeof raw !== "object" || !("keys" in raw)) continue;
    const node = layerNodeOf(expression.target.path);
    const ignored = ignoredKeys.get(node) ?? new Set<object>();
    ignored.add(raw);
    ignoredKeys.set(node, ignored);
    const counts = overrideCounts.get(node) ?? new Map<object, number>();
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
    overrideCounts.set(node, counts);
    overrideLayers.set(node, layer);
  }
  // In-memory callers can alias a track across properties. Suppress it only when
  // every occurrence in this instance is covered by a constant overwrite.
  for (const [node, ignored] of ignoredKeys) {
    const remaining = new Map(overrideCounts.get(node));
    const count = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      if (remaining.has(value)) remaining.set(value, remaining.get(value)! - 1);
      for (const part of Object.values(value)) count(part);
    };
    count(overrideLayers.get(node));
    for (const [track, left] of remaining) if (left < 0) ignored.delete(track);
  }
  return (layer: CompositionLayer, node: string) =>
    layer.type === "native3d" ||
    layer.native3D !== undefined ||
    layer.overlayAfter !== undefined ||
    driven.has(node) ||
    hasVaryingKeys(layer, ignoredKeys.get(node));
}
