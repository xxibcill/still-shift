import type { Composition, CompositionScope } from "./composition.ts";
import {
  layerNodeOf,
  segmentKey,
  segmentsOverlap,
  type CompiledExpression,
} from "./expressions.ts";
import type { CompositionLayer } from "./layers.ts";
import type { IssueReporter } from "./primitives.ts";
import type { PropertyPath, PropertyPathSegment } from "./property-path.ts";
import {
  isResolvedProperty,
  precompsById,
  resolvePropertyPath,
} from "./resolve.ts";

type Path = (string | number)[];
/** `expression` marks edges from expression reads, behaviours and auto-orient. */
type Dependency = { source: string; path: Path; expression?: boolean };
type Graph = Map<string, Dependency[]>;
type InstanceGraph = {
  graph: Graph;
  comp: Composition;
  clocks: Set<string>;
  expanded: Set<string>;
  /** Called once for every precomp-instance layer node that joins the graph. */
  onLayer?: (
    node: string,
    route: string[],
    layer: CompositionLayer,
    path: Path,
  ) => void;
};

function addDependency(
  graph: Graph,
  target: string,
  source: string,
  path: Path,
  expression = false,
) {
  const dependencies = graph.get(target) ?? [];
  dependencies.push(
    expression ? { source, path, expression } : { source, path },
  );
  graph.set(target, dependencies);
}

function addScopeDependencies(
  graph: Graph,
  scope: CompositionScope,
  prefix: string,
  base: Path,
) {
  const layers = new Set(scope.layers.map((layer) => layer.id));
  scope.layers.forEach((layer, i) => {
    if (layer.parent && layers.has(layer.parent))
      addDependency(graph, `${prefix}${layer.id}`, `${prefix}${layer.parent}`, [
        ...base,
        "layers",
        i,
        "parent",
      ]);
  });
  scope.constraints?.forEach((constraint, i) => {
    const reference: [string, string] | undefined =
      "anchor" in constraint
        ? ["anchor", constraint.anchor]
        : "surface" in constraint
          ? ["surface", constraint.surface]
          : "toward" in constraint
            ? ["toward", constraint.toward]
            : "path" in constraint
              ? ["path", constraint.path]
              : undefined;
    if (reference && layers.has(constraint.target) && layers.has(reference[1]))
      addDependency(
        graph,
        `${prefix}${constraint.target}`,
        `${prefix}${reference[1]}`,
        [...base, "constraints", i, reference[0]],
      );
  });
}

/** Instantiate only paths read by drivers, rather than expanding every reused source. */
function addInstanceDependencies(
  context: InstanceGraph,
  route: string[],
  layerId: string,
) {
  const { graph, comp, clocks, expanded } = context;
  const precomps = precompsById(comp);
  let scope: CompositionScope = comp;
  let prefix = "";
  for (const id of route) {
    const instance = scope.layers.find((layer) => layer.id === id);
    if (instance?.type !== "precomp") return;
    const next = precomps.get(instance.comp);
    if (!next) return;
    const nextPrefix = `${prefix}${id}/`;
    if (!clocks.has(nextPrefix)) {
      const base: Path =
        scope === comp ? [] : ["precomps", comp.precomps!.indexOf(scope)];
      const path = [...base, "layers", scope.layers.indexOf(instance), "comp"];
      const remap = `${prefix}${id}.timeRemap`;
      addDependency(graph, `${nextPrefix}comp.time`, remap, path);
      if (prefix) addDependency(graph, remap, `${prefix}comp.time`, path);
      clocks.add(nextPrefix);
    }
    prefix = nextPrefix;
    scope = next;
  }
  if (!prefix) return;

  // Parent/constraint edges are local templates; copy only reachable layer state.
  const templatePrefix = `@${scope.id}/`;
  const layers = new Map(scope.layers.map((layer) => [layer.id, layer]));
  const pending = [layerId];
  while (pending.length) {
    const id = pending.pop()!;
    const node = `${prefix}${id}`;
    if (expanded.has(node)) continue;
    expanded.add(node);
    const base: Path = ["precomps", comp.precomps!.indexOf(scope)];
    const layer = layers.get(id);
    if (!layer) continue;
    const path = [...base, "layers", scope.layers.indexOf(layer)];
    addDependency(graph, node, `${prefix}comp.time`, path);
    context.onLayer?.(node, route, layer, [...path, "transform", "autoOrient"]);
    if (layer.type === "precomp")
      addDependency(graph, `${node}.timeRemap`, `${prefix}comp.time`, path);
    for (const dependency of graph.get(`${templatePrefix}${id}`) ?? []) {
      const source = dependency.source.slice(templatePrefix.length);
      addDependency(graph, node, `${prefix}${source}`, dependency.path);
      pending.push(source);
    }
  }
}

function driverProperty(comp: Composition, path: string) {
  const resolved = resolvePropertyPath(comp, path);
  if (
    !isResolvedProperty(resolved) ||
    !resolved.layer ||
    resolved.type !== "scalar"
  )
    return undefined;
  const node = [...resolved.scope, resolved.layer.id].join("/");
  return {
    node,
    scope: resolved.scope,
    layerId: resolved.layer.id,
    timeNode:
      resolved.layer.type === "precomp" && resolved.path.endsWith(".timeRemap")
        ? `${node}.timeRemap`
        : undefined,
  };
}

function addDriverDependencies(context: InstanceGraph) {
  const { graph, comp } = context;
  const property = (path: string) => {
    const resolved = driverProperty(comp, path);
    if (resolved)
      addInstanceDependencies(context, resolved.scope, resolved.layerId);
    return resolved;
  };
  comp.drivers?.forEach((driver, i) => {
    const target = property(driver.target);
    if (!target) return;
    const addSource = (source: string, path: Path) => {
      const resolved = property(source);
      if (!resolved) return;
      addDependency(graph, target.node, resolved.node, path);
      // Expression reads see a layer's keyed and motion-craft stage, without constraints.
      addDependency(graph, `${target.node}@stage`, resolved.node, path);
      if (target.timeNode)
        addDependency(graph, target.timeNode, resolved.node, path);
    };
    if (driver.source) addSource(driver.source, ["drivers", i, "source"]);
    driver.sum?.forEach((source, j) => {
      if (source.includes(".")) addSource(source, ["drivers", i, "sum", j]);
    });
  });
}

function reportCycles(graph: Graph, fail: IssueReporter) {
  const active: string[] = [];
  const activeDependencies: Dependency[] = [];
  const positions = new Map<string, number>();
  const done = new Set<string>();
  const visit = (layer: string) => {
    if (done.has(layer)) return;
    positions.set(layer, active.length);
    active.push(layer);
    for (const dependency of graph.get(layer) ?? []) {
      const cycleStart = positions.get(dependency.source);
      if (cycleStart !== undefined) {
        const cycleDependencies = [
          ...activeDependencies.slice(cycleStart),
          dependency,
        ];
        const expression = cycleDependencies.findLast(
          (edge) => edge.expression,
        );
        const reportedDependency =
          expression ??
          cycleDependencies.findLast((edge) => edge.path[0] === "drivers") ??
          dependency;
        fail(
          expression ? "comp-expression-cycle" : "comp-motion-cycle",
          reportedDependency.path,
          `${expression ? "expression" : "motion"} dependencies form a cycle: ${[...active.slice(cycleStart), dependency.source].join(" → ")}`,
        );
      } else {
        activeDependencies.push(dependency);
        visit(dependency.source);
        activeDependencies.pop();
      }
    }
    active.pop();
    positions.delete(layer);
    done.add(layer);
  };
  for (const layer of graph.keys()) visit(layer);
}

const POSITION: PropertyPathSegment[] = [
  { name: "transform" },
  { name: "position" },
];

/**
 * Expression edges work per property. `L#segments` is the expression-stage value of a
 * property, `L@stage` the layer's keyed and motion-craft values before expressions,
 * and `L` the full layer state (constraints, parents) that drivers and constraints
 * read. A read depends on the stage and on every expression overlapping it. Time is
 * ignored: reading another time keeps the edge.
 */
function addExpressionDependencies(
  context: InstanceGraph,
  expressions: CompiledExpression[],
) {
  const { graph, comp } = context;
  const targets = new Map<
    string,
    { segments: PropertyPathSegment[]; origin: Path }[]
  >();
  for (const expression of expressions) {
    const node = layerNodeOf(expression.target.path);
    const list = targets.get(node) ?? [];
    list.push({
      segments: expression.target.path.segments,
      origin: expression.entry.origin,
    });
    targets.set(node, list);
  }
  const readNodes = new Set<string>();
  const readNode = (path: PropertyPath, layer: CompositionLayer) => {
    const node = layerNodeOf(path);
    if (layer.type === "precomp" && path.segments[0]!.name === "timeRemap")
      return `${node}.timeRemap`;
    const name = `${node}#${segmentKey(path.segments)}`;
    if (readNodes.has(name)) return name;
    readNodes.add(name);
    const prefix = path.scope.length ? `${path.scope.join("/")}/` : "";
    addDependency(graph, name, `${node}@stage`, []);
    if (prefix) addDependency(graph, `${node}@stage`, `${prefix}comp.time`, []);
    for (const target of targets.get(node) ?? []) {
      const source = `${node}#${segmentKey(target.segments)}`;
      if (source !== name && segmentsOverlap(target.segments, path.segments))
        addDependency(graph, name, source, target.origin, true);
    }
    return name;
  };
  const autoOrient = (
    node: string,
    route: string[],
    layer: CompositionLayer,
    path: Path,
  ) => {
    if (layer.transform?.autoOrient !== "path") return;
    const position = readNode(
      { scope: route, layer: layer.id, segments: POSITION },
      layer,
    );
    addDependency(graph, node, position, path, true);
  };
  context.onLayer = autoOrient;
  comp.layers.forEach((layer, i) =>
    autoOrient(layer.id, [], layer, ["layers", i, "transform", "autoOrient"]),
  );

  for (const expression of expressions) {
    const { path, resolved } = expression.target;
    const origin = expression.entry.origin;
    addInstanceDependencies(context, path.scope, path.layer);
    const node = layerNodeOf(path);
    const target = readNode(path, resolved.layer!);
    addDependency(graph, node, target, origin, true);
    for (const read of expression.reads) {
      if (!read.resolved.layer) continue; // composition camera: no dependencies
      addInstanceDependencies(context, read.path.scope, read.path.layer);
      addDependency(
        graph,
        target,
        readNode(read.path, read.resolved.layer),
        origin,
        true,
      );
    }
  }
}

/** Sources read evaluated layer state, as in the existing motion-craft model. */
export function checkMotionDependencies(
  comp: Composition,
  fail: IssueReporter,
  expressions: CompiledExpression[] = [],
) {
  const graph: Graph = new Map();
  addScopeDependencies(graph, comp, "", []);
  comp.precomps?.forEach((scope, i) =>
    addScopeDependencies(graph, scope, `@${scope.id}/`, ["precomps", i]),
  );
  const context: InstanceGraph = {
    graph,
    comp,
    clocks: new Set(),
    expanded: new Set(),
  };
  addExpressionDependencies(context, expressions);
  addDriverDependencies(context);
  reportCycles(graph, fail);
}
