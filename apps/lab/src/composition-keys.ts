import {
  compositionEffectDefinition,
  isKeyed,
  type Composition,
  resolvePropertyPath,
  isResolvedProperty,
  type Camera2d,
  type CompositionLayer,
  type Keyed,
} from "../../../packages/scene-contract/src/index.ts";
import { sampleCameraMotion } from "../../../packages/renderer-core/src/camera-sampling.ts";
import {
  color,
  discrete,
  motionScalar,
  scalar,
  smoothKeyVelocity,
  vector,
} from "../../../packages/renderer-core/src/composition/evaluate/sample.ts";
import { sampleCurveGraph } from "./composition-graph-sample.ts";
import { readJsonPath, type JsonPath } from "./composition-document.ts";

type Key = {
  frame: number;
  value: unknown;
  in?: { ease: number; speed?: number | number[]; spatialSpeed?: number };
  out?: { ease: number; speed?: number | number[]; spatialSpeed?: number };
  smooth?: boolean;
  interpolation?: string;
  bezier?: [number, number, number, number];
  spatialIn?: [number, number];
  spatialOut?: [number, number];
};
export type KeyTrack = {
  id: string;
  label: string;
  scope: string;
  owner: string;
  path: JsonPath;
  property?: string;
  kind: "scalar" | "vector" | "color" | "discrete" | "path" | "camera";
  keys: Key[];
  raw: unknown;
  fps: number;
  spatial: boolean;
  array: boolean;
};

/** Only contract-owned domains are visited; provider parameters and metadata stay opaque. */
export function compositionTracks(document: Composition): KeyTrack[] {
  const tracks: KeyTrack[] = [];
  function add(
    raw: unknown,
    path: JsonPath,
    property: string | undefined,
    kind: KeyTrack["kind"],
    scope: string,
    owner: string,
    fps: number,
    array = false,
  ) {
    if (
      kind === "vector" &&
      raw &&
      typeof raw === "object" &&
      !Array.isArray(raw) &&
      !isKeyed(raw)
    ) {
      for (const axis of ["x", "y"]) {
        add(
          (raw as Record<string, unknown>)[axis],
          [...path, axis],
          property ? `${property}.${axis}` : undefined,
          "scalar",
          scope,
          owner,
          fps,
        );
      }
      return;
    }
    const keys =
      array && Array.isArray(raw)
        ? (raw as Key[])
        : isKeyed(raw)
          ? raw.keys
          : undefined;
    if (!keys?.length) return;
    const id = JSON.stringify(path);
    tracks.push({
      id,
      label: `${scope} / ${owner} · ${property ?? path.at(-1)}`,
      scope,
      owner,
      path,
      ...(property ? { property } : {}),
      kind,
      keys,
      raw,
      fps,
      array,
      spatial: keys.some((k) => k.spatialIn || k.spatialOut),
    });
  }
  function layerTracks(
    layer: CompositionLayer,
    path: JsonPath,
    scope: string,
    fps: number,
  ) {
    const value = layer as unknown as Record<string, unknown>;
    for (const [name, raw] of Object.entries(layer.transform ?? {})) {
      const kind = ["anchor", "position", "scale"].includes(name)
        ? "vector"
        : "scalar";
      add(
        raw,
        [...path, "transform", name],
        `transform.${name}`,
        kind,
        scope,
        layer.id,
        fps,
      );
    }
    for (const name of [
      "color",
      "state",
      "stateFrom",
      "stateMix",
      "reveal",
      "timeRemap",
      "constraintReference",
      "path",
    ])
      add(
        value[name],
        [...path, name],
        name,
        name === "color"
          ? "color"
          : name === "constraintReference"
            ? "vector"
            : name === "path"
              ? "path"
              : ["state", "stateFrom"].includes(name)
                ? "discrete"
                : "scalar",
        scope,
        layer.id,
        fps,
      );
    layer.masks?.forEach((mask, i) => {
      for (const name of ["path", "feather", "expansion", "opacity"] as const)
        add(
          mask[name],
          [...path, "masks", i, name],
          `masks[${mask.id}].${name}`,
          name === "path" ? "path" : "scalar",
          scope,
          layer.id,
          fps,
        );
    });
    layer.effects?.forEach((effect, i) => {
      const definition = compositionEffectDefinition(effect.effect);
      for (const [name, spec] of Object.entries(definition?.properties ?? {}))
        add(
          effect.params?.[name],
          [...path, "effects", i, "params", name],
          `effects[${effect.id}].${name}`,
          spec.type,
          scope,
          layer.id,
          fps,
        );
    });
    if (layer.type === "text")
      layer.decorations?.forEach((decoration, i) =>
        add(
          decoration.reveal,
          [...path, "decorations", i, "reveal"],
          undefined,
          "scalar",
          scope,
          layer.id,
          fps,
          true,
        ),
      );
  }
  const scopes = [
    { scope: "root", value: document, path: [] as JsonPath },
    ...(document.precomps ?? []).map((value, i) => ({
      scope: value.id,
      value,
      path: ["precomps", i] as JsonPath,
    })),
  ];
  for (const { scope, value, path } of scopes) {
    const fps = value.fps ?? document.fps;
    value.layers.forEach((layer, i) =>
      layerTracks(layer, [...path, "layers", i], scope, fps),
    );
    value.constraints?.forEach((constraint, i) =>
      add(
        constraint.weight,
        [...path, "constraints", i, "weight"],
        undefined,
        "scalar",
        scope,
        `constraint ${i + 1}`,
        fps,
        true,
      ),
    );
    value.textAnimators?.forEach((animator, i) => {
      add(
        animator.weight,
        [...path, "textAnimators", i, "weight"],
        undefined,
        "scalar",
        scope,
        `animator ${i + 1}`,
        fps,
        true,
      );
      for (const [name, selector] of [
        ["selector", animator.selector],
        ...(animator.selectors ?? []).map((s, j) => [j, s] as const),
      ] as const) {
        if (!selector) continue;
        const selectorPath =
          typeof name === "number"
            ? [...path, "textAnimators", i, "selectors", name]
            : [...path, "textAnimators", i, name];
        for (const field of ["start", "end", "offset"] as const)
          add(
            selector[field],
            [...selectorPath, field],
            undefined,
            "scalar",
            scope,
            `selector ${i + 1}`,
            fps,
            true,
          );
      }
    });
  }
  document.signals?.forEach((signal, i) =>
    add(
      signal.keys,
      ["signals", i, "keys"],
      undefined,
      "scalar",
      "root",
      `signal ${signal.id} (before additions)`,
      document.fps,
      true,
    ),
  );
  if (document.camera2d)
    add(
      document.camera2d,
      ["camera2d"],
      undefined,
      "camera",
      "root",
      "Camera 2D (source controls)",
      document.fps,
    );
  return tracks;
}
export function sampleTrack(track: KeyTrack, frame: number): number[] {
  if (track.kind === "path") return [];
  if (track.kind === "camera") {
    const state = sampleCameraMotion(track.raw as Camera2d, frame);
    return [state.x, state.y, state.zoom];
  }
  if (track.array) return [motionScalar(track.keys, frame, track.fps)];
  switch (track.kind) {
    case "vector":
      return vector(track.raw, frame, track.fps, [0, 0]);
    case "color":
      return color(track.raw, frame, track.fps);
    case "discrete":
      return [discrete(track.raw, frame)];
    default:
      return [scalar(track.raw, frame, track.fps)];
  }
}
export function trackGraph(track: KeyTrack, samples = 160) {
  const start = track.keys[0]!.frame,
    end = track.keys.at(-1)!.frame;
  const count = Math.max(2, Math.min(512, samples));
  return sampleCurveGraph((frame) => sampleTrack(track, frame), {
    start,
    end,
    count,
  });
}
function keysIn(draft: Composition, track: KeyTrack): Key[] {
  const raw = readJsonPath(draft, track.path);
  return track.array ? (raw as Key[]) : (raw as Keyed<unknown>).keys;
}
export function editTemporalHandle(
  draft: Composition,
  track: KeyTrack,
  index: number,
  side: "in" | "out",
  ease: number,
  speed?: number | number[],
) {
  if (["discrete", "path", "camera"].includes(track.kind))
    throw new Error("This track has no numeric temporal handle editor");
  const key = keysIn(draft, track)[index];
  if (!key) throw new Error("Key no longer exists");
  key[side] = {
    ease,
    ...(speed === undefined
      ? {}
      : track.spatial
        ? { spatialSpeed: speed as number }
        : { speed }),
  };
}
function retainSmoothSide(
  keys: Key[],
  kind: "scalar" | "vector" | "color",
  index: number,
  side: "in" | "out",
) {
  const key = keys[index]!;
  if (!key.smooth && key.interpolation !== "smooth") return;
  const handle = key[side];
  if (handle?.speed !== undefined || handle?.spatialSpeed !== undefined) return;
  key[side] = {
    ease: handle?.ease ?? 1 / 3,
    ...smoothKeyVelocity(keys as Keyed<unknown>["keys"], kind, index, side),
  };
}
/** Explicitly selecting Bézier replaces the higher-priority temporal handles for this segment. */
export function editSegmentBezier(
  draft: Composition,
  track: KeyTrack,
  destination: number,
  bezier: [number, number, number, number],
) {
  const kind = track.kind;
  if (
    (kind !== "scalar" && kind !== "vector" && kind !== "color") ||
    destination < 1
  )
    throw new Error("Select a numeric segment ending after the first key");
  const keys = keysIn(draft, track),
    a = keys[destination - 1],
    b = keys[destination];
  if (!a || !b) throw new Error("Segment no longer exists");
  retainSmoothSide(keys, kind, destination - 1, "in");
  retainSmoothSide(keys, kind, destination, "out");
  delete a.out;
  delete b.in;
  delete a.smooth;
  delete b.smooth;
  if (a.interpolation === "smooth") delete a.interpolation;
  b.interpolation = "bezier";
  b.bezier = bezier;
}
export function editSpatialTangent(
  draft: Composition,
  track: KeyTrack,
  index: number,
  side: "spatialIn" | "spatialOut",
  value: [number, number],
) {
  if (track.kind !== "vector")
    throw new Error("Spatial tangents need a joint vector track");
  const keys = keysIn(draft, track),
    key = keys[index];
  if (!key) throw new Error("Key no longer exists");
  key[side] = value;
  for (const k of keys)
    for (const handle of [k.in, k.out])
      if (handle && Array.isArray(handle.speed)) delete handle.speed;
}
export function editedKeysCode(track: KeyTrack) {
  const keys = JSON.stringify(track.keys, null, 2);
  const note = `// ${track.label}; authored local key frames, ${track.fps} fps.\n`;
  if (!track.property)
    return `${note}// Replace the native keys at ${JSON.stringify(track.path)}:\n${keys}`;
  return `${note}// Replace this property animation at timeline zero; c is the owning scope and layer is ${JSON.stringify(track.owner)}:\nc.timeline(layer.property(${JSON.stringify(track.property)}).keys(${keys}));`;
}

/** Routes distinguish reused definitions and carry the evaluator's inherited scope fps. */
export function resolvedTrackRoutes(
  document: Composition,
  track: KeyTrack,
): { path: string; fps: number }[] {
  if (!track.property) return [];
  const routes: { path: string; fps: number }[] = [];
  let visited = 0;
  const definitions = new Map((document.precomps ?? []).map((p) => [p.id, p]));
  function visit(
    scope: string,
    layers: CompositionLayer[],
    route: string[],
    fps: number,
  ) {
    if (++visited > 4096 || routes.length >= 128) return;
    if (scope === track.scope) {
      const path = [...route, `${track.owner}.${track.property}`].join("/");
      if (isResolvedProperty(resolvePropertyPath(document, path)))
        routes.push({ path, fps });
    }
    for (const layer of layers)
      if (layer.type === "precomp" && route.length < 16) {
        const definition = definitions.get(layer.comp);
        if (definition)
          visit(
            definition.id,
            definition.layers,
            [...route, layer.id],
            definition.fps ?? fps,
          );
      }
  }
  visit("root", document.layers, [], document.fps);
  return routes;
}
