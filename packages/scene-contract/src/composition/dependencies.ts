import type { Composition, CompositionScope } from "./composition.ts";
import type { IssueReporter } from "./primitives.ts";
import { isResolvedProperty, resolvePropertyPath } from "./resolve.ts";

type Path = (string | number)[];
type Dependency = { source: string; path: Path };
type Graph = Map<string, Dependency[]>;

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

/** Each precomp layer samples its contents using its evaluated remap. */
function addPrecompTimeDependencies(graph: Graph, comp: Composition) {
  const precomps = new Set(comp.precomps?.map((scope) => scope.id));
  for (const scope of [comp, ...(comp.precomps ?? [])]) {
    const prefix = scope === comp ? "" : `${scope.id}/`;
    const base: Path =
      scope === comp ? [] : ["precomps", comp.precomps!.indexOf(scope)];
    scope.layers.forEach((layer, i) => {
      const node = `${prefix}${layer.id}`;
      const path = [...base, "layers", i];
      if (scope !== comp) {
        // One scope clock avoids duplicating every child edge for reused precomps.
        const clock = `${scope.id}/comp.time`;
        addDependency(graph, node, clock, path);
        if (layer.type === "precomp")
          addDependency(graph, `${node}.timeRemap`, clock, path);
      }
      if (layer.type === "precomp" && precomps.has(layer.comp))
        addDependency(graph, `${layer.comp}/comp.time`, `${node}.timeRemap`, [
          ...path,
          "comp",
        ]);
    });
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
  // A reused precomp owns one layer namespace, regardless of the route into it.
  const scope = resolved.scope.at(-1);
  const node = `${scope ? `${scope}/` : ""}${resolved.layer.id}`;
  return {
    node,
    timeNode:
      resolved.layer.type === "precomp" && resolved.path.endsWith(".timeRemap")
        ? `${node}.timeRemap`
        : undefined,
  };
}

function addDriverDependencies(graph: Graph, comp: Composition) {
  comp.drivers?.forEach((driver, i) => {
    const target = driverProperty(comp, driver.target);
    if (!target) return;
    const addSource = (source: string, path: Path) => {
      const property = driverProperty(comp, source);
      if (!property) return;
      addDependency(graph, target.node, property.node, path);
      if (target.timeNode)
        addDependency(graph, target.timeNode, property.node, path);
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
    addScopeDependencies(graph, scope, `${scope.id}/`, ["precomps", i]),
  );
  addPrecompTimeDependencies(graph, comp);
  addDriverDependencies(graph, comp);
  reportCycles(graph, fail);
}
