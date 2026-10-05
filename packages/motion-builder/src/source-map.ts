import type { Composition } from "@still-shift/scene-contract";
import type { SourceLocation } from "./source.ts";
export type BuilderSources = {
  version: "motion-builder-1";
  files: string[];
  sites: [number, number, number][];
  nodes: {
    comp: number;
    layers: number[];
    assets: number[];
    markers: number[];
    precomps: { site: number; layers: number[] }[];
    drivers: number[];
    behaviours: number[];
    periodic: number[];
    expressions: number[];
    signals: number[];
    constraints: number[];
    textAnimators: number[];
    textStyles: number[];
  };
};
export function encodeSources(
  comp: Composition,
  locations: ReadonlyMap<string, SourceLocation>,
): BuilderSources {
  const files: string[] = [],
    sites: [number, number, number][] = [];
  const fileIds = new Map<string, number>(),
    siteIds = new Map<string, number>();
  const at = (key: string) => {
    const site = locations.get(key) ?? locations.get("comp")!;
    let file = fileIds.get(site.file);
    if (file === undefined) {
      file = files.length;
      files.push(site.file);
      fileIds.set(site.file, file);
    }
    const identity = `${file}:${site.line}:${site.column}`;
    let id = siteIds.get(identity);
    if (id === undefined) {
      id = sites.length;
      sites.push([file, site.line, site.column]);
      siteIds.set(identity, id);
    }
    return id;
  };
  return {
    version: "motion-builder-1",
    files,
    sites,
    nodes: {
      comp: at("comp"),
      layers: comp.layers.map((l) => at(`layer:${l.id}`)),
      assets: comp.assets.map((a) => at(`asset:${a.id}`)),
      markers: (comp.markers ?? []).map((m) => at(`marker:${m.id}`)),
      precomps: (comp.precomps ?? []).map((p) => ({
        site: at(`precomp:${p.id}`),
        layers: p.layers.map((l) => at(`precomp:${p.id}.layer:${l.id}`)),
      })),
      drivers: (comp.drivers ?? []).map((d) => at(`driver:${d.target}`)),
      behaviours: (comp.behaviours ?? []).map((_, i) => at(`behaviour:${i}`)),
      periodic: (comp.periodic ?? []).map((_, i) => at(`periodic:${i}`)),
      signals: (comp.signals ?? []).map((n) => at(`signal:${n.id}`)),
      constraints: (comp.constraints ?? []).map((_, i) =>
        at(`constraint:${i}`),
      ),
      textAnimators: (comp.textAnimators ?? []).map((_, i) =>
        at(`textAnimator:${i}`),
      ),
      textStyles: Object.keys(comp.textStyles ?? {}).map((id) =>
        at(`textStyle:${id}`),
      ),
      expressions: Object.keys(comp.expressions ?? {}).map((p) =>
        at(`expression:${p}`),
      ),
    },
  };
}
export function builderSource(
  comp: Composition,
  path = "",
): SourceLocation | undefined {
  const value = comp.metadata?.builder as unknown as BuilderSources | undefined;
  if (
    !value ||
    value.version !== "motion-builder-1" ||
    !Array.isArray(value.files) ||
    !Array.isArray(value.sites) ||
    !value.nodes
  )
    return undefined;
  let id = value.nodes.comp;
  const layer = /^layers\[(\d+)\]/.exec(path),
    nested = /^precomps\[(\d+)\](?:\.layers\[(\d+)\])?/.exec(path),
    node =
      /^(assets|markers|drivers|behaviours|periodic|signals|constraints|textAnimators)\[(\d+)\]/.exec(
        path,
      );
  if (layer) id = value.nodes.layers?.[Number(layer[1])] ?? id;
  else if (nested) {
    const p = value.nodes.precomps?.[Number(nested[1])];
    id =
      nested[2] === undefined
        ? (p?.site ?? id)
        : (p?.layers?.[Number(nested[2])] ?? id);
  } else if (node)
    id = value.nodes[node[1] as "assets"]?.[Number(node[2])] ?? id;
  else if (path.startsWith("textStyles")) {
    const keys = Object.keys(comp.textStyles ?? {});
    const found = keys.findIndex((key) => path.includes(key));
    if (found >= 0) id = value.nodes.textStyles?.[found] ?? id;
  } else if (path.startsWith("expressions")) {
    const keys = Object.keys(comp.expressions ?? {});
    const entry = keys
      .map((key, index) => ({ key, index }))
      .sort((a, b) => b.key.length - a.key.length)
      .find((item) => path.includes(item.key));
    if (entry) id = value.nodes.expressions?.[entry.index] ?? id;
  }
  const site = value.sites[id];
  if (!site) return undefined;
  const file = value.files[site[0]];
  return typeof file === "string" &&
    Number.isInteger(site[1]) &&
    Number.isInteger(site[2])
    ? { file, line: site[1], column: site[2] }
    : undefined;
}
