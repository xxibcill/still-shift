import type { Composition, CompositionScope } from "./composition.ts";
import type { IssueReporter } from "./primitives.ts";
import {
  isResolvedProperty,
  precompsById,
  resolvePropertyPath,
} from "./resolve.ts";

type Path = (string | number)[];
type Dependency = { source: string; path: Path };
type Graph = Map<string, Dependency[]>;
type InstanceGraph = {
  graph: Graph;
  comp: Composition;
  clocks: Set<string>;
  expanded: Set<string>;
};

function addDependency(
  graph: Graph,
  target: string,
  source: string,
  path: Path,
) {
  const dependencies = graph.get(target) ?? [];
  dependencies.push({ source, path });
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

function addDriverDependencies(graph: Graph, comp: Composition) {
  const context: InstanceGraph = {
    graph,
    comp,
    clocks: new Set(),
    expanded: new Set(),
  };
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
        const reportedDependency =
          cycleDependencies.findLast((edge) => edge.path[0] === "drivers") ??
          dependency;
        fail(
          "comp-motion-cycle",
          reportedDependency.path,
          `motion dependencies form a cycle: ${[...active.slice(cycleStart), dependency.source].join(" → ")}`,
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

/** Sources read evaluated layer state, as in the existing motion-craft model. */
export function checkMotionDependencies(
  comp: Composition,
  fail: IssueReporter,
) {
  const graph: Graph = new Map();
  addScopeDependencies(graph, comp, "", []);
  comp.precomps?.forEach((scope, i) =>
    addScopeDependencies(graph, scope, `@${scope.id}/`, ["precomps", i]),
  );
  addDriverDependencies(graph, comp);
  reportCycles(graph, fail);
}
