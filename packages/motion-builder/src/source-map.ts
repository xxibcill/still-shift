import type { Composition } from "@still-shift/scene-contract";
import type { SourceLocation } from "./source.ts";
export type SourceTrack = {
  precomp?: string;
  layer: string;
  property: string;
  first: number;
  last: number;
  location: SourceLocation;
};
export type BuilderSources = {
  version: "motion-builder-1";
  files: string[];
  sites: [number, number, number][];
  paths?: string[];
  tracks?: [number, number, number, number, number, number][];
  nodes: {
    comp: number;
    layers: number[];
    assets: number[];
    markers: number[];
    precomps: {
      site: number;
      layers: number[];
      markers?: number[];
      constraints?: number[];
      textAnimators?: number[];
    }[];
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
  tracks: readonly SourceTrack[] = [],
): BuilderSources {
  const files: string[] = [],
    sites: [number, number, number][] = [];
  const fileIds = new Map<string, number>(),
    siteIds = new Map<string, number>();
  const siteIndex = (site: SourceLocation) => {
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
  const at = (key: string) =>
    siteIndex(locations.get(key) ?? locations.get("comp")!);
  const paths: string[] = [];
  const encoded: NonNullable<BuilderSources["tracks"]> = tracks.map((track) => {
    const scope =
      track.precomp === undefined
        ? -1
        : (comp.precomps ?? []).findIndex((p) => p.id === track.precomp);
    const layers = scope < 0 ? comp.layers : comp.precomps![scope]!.layers;
    let path = paths.indexOf(track.property);
    if (path < 0) {
      path = paths.length;
      paths.push(track.property);
    }
    return [
      scope,
      layers.findIndex((layer) => layer.id === track.layer),
      path,
      track.first,
      track.last,
      siteIndex(track.location),
    ];
  });
  return {
    ...(encoded.length ? { paths, tracks: encoded } : {}),
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
        ...(p.markers?.length
          ? {
              markers: p.markers.map((m) =>
                at(`precomp:${p.id}.marker:${m.id}`),
              ),
            }
          : {}),
        ...(p.constraints?.length
          ? {
              constraints: p.constraints.map((_, i) =>
                at(`precomp:${p.id}.constraint:${i}`),
              ),
            }
          : {}),
        ...(p.textAnimators?.length
          ? {
              textAnimators: p.textAnimators.map((_, i) =>
                at(`precomp:${p.id}.textAnimator:${i}`),
              ),
            }
          : {}),
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
  const nestedNode =
    /^precomps\[(\d+)\]\.(markers|constraints|textAnimators)\[(\d+)\]/.exec(
      path,
    );
  if (nestedNode)
    id =
      value.nodes.precomps?.[Number(nestedNode[1])]?.[
        nestedNode[2] as "markers"
      ]?.[Number(nestedNode[3])] ?? id;
  const keyed =
    /^(?:precomps\[(\d+)\]\.)?layers\[(\d+)\]\.(.+)\.keys\[(\d+)\]/.exec(path);
  if (keyed) {
    const scope = keyed[1] === undefined ? -1 : Number(keyed[1]);
    const index = Number(keyed[2]),
      key = Number(keyed[4]);
    const track = value.tracks?.find(
      (row) =>
        row[0] === scope &&
        row[1] === index &&
        value.paths?.[row[2]] === keyed[3] &&
        row[3] <= key &&
        row[4] >= key,
    );
    if (track) id = track[5];
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

export function inheritedTracks(
  comp: Composition,
  precomp: string,
): SourceTrack[] {
  const value = comp.metadata?.builder as unknown as BuilderSources | undefined;
  if (value?.version !== "motion-builder-1" || !value.tracks || !value.paths)
    return [];
  return value.tracks.flatMap(([scope, layer, path, first, last, site]) => {
    const definition = scope < 0 ? comp : comp.precomps?.[scope];
    const id = definition?.layers[layer]?.id,
      property = value.paths?.[path],
      row = value.sites[site];
    const file = row && value.files[row[0]];
    if (!definition || !id || !property || !row || !file) return [];
    return [
      {
        precomp: scope < 0 ? precomp : definition.id,
        layer: id,
        property,
        first,
        last,
        location: { file, line: row[1], column: row[2] },
      },
    ];
  });
}
