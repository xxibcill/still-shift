import {
  CommerceEventSchema,
  type CommerceEvent,
  type CommerceScene,
} from "../../scene-contract/src/commerce.ts";
import {
  PreparedNodeSchema,
  PreparedSceneFieldsSchema,
  PreparedFontSchema,
  validatePreparedGraph,
  type PreparedNode,
} from "../../scene-contract/src/prepared.ts";

export type CommerceClock = Pick<CommerceScene, "fps" | "frameCount">;
export type ComponentBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type CommerceFragment = Partial<
  Pick<
    CommerceScene,
    | "assets"
    | "fonts"
    | "nodes"
    | "events"
    | "effects"
    | "geometry"
    | "attachments"
    | "mattes"
    | "visibility"
    | "textFits"
  >
> & { bounds?: ComponentBounds };

export function validateCommerceClock(clock: CommerceClock) {
  if (
    ![24, 30].includes(clock.fps) ||
    !Number.isInteger(clock.frameCount) ||
    clock.frameCount < 1 ||
    clock.frameCount > 108000
  )
    throw new Error(
      "Commerce clock requires 24/30 fps and 1–108000 integer frames",
    );
}

/** Merge in drawing order, resolve track-wide initial values, and reject ambiguous composition. */
export function mergeCommerceFragments(
  clock: CommerceClock,
  fragments: CommerceFragment[],
) {
  validateCommerceClock(clock);
  const nodes = fragments
    .flatMap((f) => f.nodes ?? [])
    .map((n) => PreparedNodeSchema.parse(n));
  const ids = new Set<string>();
  for (const node of nodes) {
    if (ids.has(node.id)) throw new Error(`Duplicate node ${node.id}`);
    ids.add(node.id);
  }
  const assets = mergeDependencies(
    fragments
      .flatMap((f) => f.assets ?? [])
      .map((a) => PreparedSceneFieldsSchema.shape.assets.element.parse(a)),
    "asset",
  );
  const fonts = mergeDependencies(
    fragments
      .flatMap((f) => f.fonts ?? [])
      .map((f) => PreparedFontSchema.parse(f)),
    "font",
  );
  validatePreparedGraph({ nodes, assets, fonts }, (message) => {
    throw new Error(message);
  });
  const events = resolveMotionEvents(
    clock,
    nodes,
    fragments.flatMap((f) => f.events ?? []),
  );
  const additions: CommerceFragment = {};
  for (const key of [
    "effects",
    "geometry",
    "attachments",
    "mattes",
    "visibility",
    "textFits",
  ] as const) {
    const entries = fragments.flatMap<unknown>(
      (fragment) => fragment[key] ?? [],
    );
    if (entries.length) Object.assign(additions, { [key]: entries });
  }
  return { nodes, assets, fonts, events, ...additions };
}

function mergeDependencies<T extends { id: string }>(
  entries: T[],
  kind: string,
): T[] {
  const unique = new Map<string, T>();
  for (const entry of entries) {
    const previous = unique.get(entry.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(entry))
      throw new Error(`Conflicting ${kind} ${entry.id}`);
    unique.set(entry.id, entry);
  }
  return [...unique.values()];
}

function baseValue(node: PreparedNode, property: CommerceEvent["property"]) {
  if (property === "scaleX" || property === "scaleY" || property === "reveal")
    return 1;
  return node[property];
}

function resolveMotionEvents(
  clock: CommerceClock,
  nodes: PreparedNode[],
  input: CommerceEvent[],
) {
  if (input.length > 100)
    throw new Error("Commerce composition supports at most 100 events");
  const events = input.map((event) => CommerceEventSchema.parse(event));
  const tracks = new Map<string, CommerceEvent[]>();
  for (const event of events) {
    if (event.end <= event.start || event.end >= clock.frameCount)
      throw new Error("Motion must finish inside the composition timeline");
    const key = `${event.node}.${event.property}`;
    const track = tracks.get(key) ?? [];
    track.push(event);
    tracks.set(key, track);
  }
  for (const track of tracks.values()) {
    track.sort((a, b) => a.start - b.start);
    const first = track[0]!;
    const node = nodes.find((n) => n.id === first.node);
    if (!node) throw new Error(`Missing motion target ${first.node}`);
    let value = first.from ?? baseValue(node, first.property);
    let previousEnd = -1;
    for (const event of track) {
      if (event.start < previousEnd)
        throw new Error(
          `Conflicting motion on ${event.node}.${event.property}`,
        );
      if (event !== first && event.from !== undefined) {
        if (Math.abs(event.from - value) > 1e-7)
          throw new Error(
            `Discontinuous motion on ${event.node}.${event.property}`,
          );
        delete event.from;
      }
      value = event.to;
      previousEnd = event.end;
    }
  }
  return events;
}
