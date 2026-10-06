import {
  compositionEffectDefinition,
  shapeFields,
  type ShapeContent,
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
  effectCurve,
  discrete,
  motionScalar,
  scalar,
  vector,
  vector3,
} from "../../../packages/renderer-core/src/composition/evaluate/sample.ts";
import { readJsonPath, type JsonPath } from "./composition-document.ts";

type Key = {
  frame: number;
  value: unknown;
  in?: { ease: number; speed?: number | number[]; spatialSpeed?: number };
  out?: { ease: number; speed?: number | number[]; spatialSpeed?: number };
  smooth?: boolean;
  interpolation?: string;
  bezier?: [number, number, number, number];
  spatialIn?: [number, number] | [number, number, number];
  spatialOut?: [number, number] | [number, number, number];
};
export type KeyTrack = {
  id: string;
  label: string;
  scope: string;
  owner: string;
  path: JsonPath;
  property?: string;
  kind:
    | "scalar"
    | "vector"
    | "color"
    | "discrete"
    | "path"
    | "camera"
    | "curve";
  keys: Key[];
  raw: unknown;
  fps: number;
  spatial: boolean;
  array: boolean;
  dimensions?: 3;
  fallbackZ?: number;
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
    dimensions?: 3,
    fallbackZ = 0,
  ) {
    const keys =
      array && Array.isArray(raw)
        ? (raw as Key[])
        : isKeyed(raw)
          ? (raw.keys as Key[])
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
      spatial: keys.some(
        (k) =>
          k.spatialIn ||
          k.spatialOut ||
          k.in?.spatialSpeed !== undefined ||
          k.out?.spatialSpeed !== undefined,
      ),
      ...(dimensions ? { dimensions, fallbackZ } : {}),
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
      const kind = ["anchor", "position", "scale", "orientation"].includes(name)
        ? "vector"
        : "scalar";
      if (
        kind === "vector" &&
        raw &&
        typeof raw === "object" &&
        !Array.isArray(raw) &&
        !isKeyed(raw)
      ) {
        for (const axis of layer.threeD ||
        layer.type === "camera" ||
        layer.type === "light"
          ? ["x", "y", "z"]
          : ["x", "y"])
          add(
            (raw as Record<string, unknown>)[axis],
            [...path, "transform", name, axis],
            `transform.${name}.${axis}`,
            "scalar",
            scope,
            layer.id,
            fps,
          );
      } else
        add(
          raw,
          [...path, "transform", name],
          `transform.${name}`,
          kind,
          scope,
          layer.id,
          fps,
          false,
          kind === "vector" &&
            (layer.threeD || layer.type === "camera" || layer.type === "light")
            ? 3
            : undefined,
          name === "scale" ? 1 : 0,
        );
    }
    if (layer.type === "depth-image") {
      for (const name of ["scale", "strength", "roll"] as const)
        add(
          layer.motion?.[name],
          [...path, "motion", name],
          `motion.${name}`,
          "scalar",
          scope,
          layer.id,
          fps,
        );
      const raw = layer.motion?.offset;
      if (
        raw &&
        typeof raw === "object" &&
        !Array.isArray(raw) &&
        !isKeyed(raw)
      )
        for (const axis of ["x", "y"] as const)
          add(
            raw[axis],
            [...path, "motion", "offset", axis],
            `motion.offset.${axis}`,
            "scalar",
            scope,
            layer.id,
            fps,
          );
      else
        add(
          raw,
          [...path, "motion", "offset"],
          "motion.offset",
          "vector",
          scope,
          layer.id,
          fps,
        );
    }
    if (layer.type === "camera") {
      for (const name of ["pointOfInterest", "viewOffset"] as const) {
        const raw = layer[name];
        if (
          raw &&
          typeof raw === "object" &&
          !Array.isArray(raw) &&
          !isKeyed(raw)
        ) {
          for (const axis of name === "viewOffset"
            ? ["x", "y"]
            : ["x", "y", "z"])
            add(
              (raw as Record<string, unknown>)[axis],
              [...path, name, axis],
              `${name}.${axis}`,
              "scalar",
              scope,
              layer.id,
              fps,
            );
        } else
          add(
            raw,
            [...path, name],
            name,
            "vector",
            scope,
            layer.id,
            fps,
            false,
            name === "pointOfInterest" ? 3 : undefined,
          );
      }
      for (const name of [
        "zoom",
        "focalLength",
        "filmSize",
        "focusDistance",
        "aperture",
        "blurLevel",
      ] as const)
        add(layer[name], [...path, name], name, "scalar", scope, layer.id, fps);
    }
    if (layer.type === "light") {
      for (const name of [
        "intensity",
        "range",
        "falloffStart",
        "innerCone",
        "outerCone",
      ] as const)
        add(layer[name], [...path, name], name, "scalar", scope, layer.id, fps);
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
        false,
        name === "constraintReference" &&
          (layer.threeD || layer.type === "camera" || layer.type === "light")
          ? 3
          : undefined,
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
      for (const [name, spec] of Object.entries(definition?.properties ?? {})) {
        const raw = effect.params?.[name],
          property = `effects[${effect.id}].${name}`,
          json = [...path, "effects", i, "params", name];
        if (spec.type === "curve" && Array.isArray(raw)) {
          raw.forEach((point, index) => {
            const at = [...json, index],
              name = `${property}[p${index}]`;
            if (
              point &&
              typeof point === "object" &&
              !Array.isArray(point) &&
              !isKeyed(point)
            ) {
              for (const axis of ["x", "y"])
                add(
                  (point as Record<string, unknown>)[axis],
                  [...at, axis],
                  `${name}.${axis}`,
                  "scalar",
                  scope,
                  layer.id,
                  fps,
                );
            } else add(point, at, name, "vector", scope, layer.id, fps);
          });
        } else if (
          spec.type === "vec2" &&
          raw &&
          typeof raw === "object" &&
          !Array.isArray(raw) &&
          !("keys" in raw)
        ) {
          for (const axis of ["x", "y"])
            add(
              (raw as Record<string, unknown>)[axis],
              [...json, axis],
              `${property}.${axis}`,
              "scalar",
              scope,
              layer.id,
              fps,
            );
        } else
          add(
            raw,
            json,
            property,
            spec.type === "vec2" ? "vector" : spec.type,
            scope,
            layer.id,
            fps,
          );
      }
    });
    if (layer.type === "shape") {
      const fields = (
        value: Record<string, unknown>,
        type: string,
        at: JsonPath,
        suffix: string,
      ) => {
        for (const [name, descriptor] of Object.entries(shapeFields(type))) {
          const raw = value[name],
            kind = descriptor.type === "vec2" ? "vector" : descriptor.type;
          if (
            kind === "vector" &&
            raw &&
            typeof raw === "object" &&
            !Array.isArray(raw) &&
            !isKeyed(raw)
          ) {
            for (const axis of ["x", "y"])
              add(
                (raw as Record<string, unknown>)[axis],
                [...at, name, axis],
                `${suffix}.${name}.${axis}`,
                "scalar",
                scope,
                layer.id,
                fps,
              );
          } else
            add(
              raw,
              [...at, name],
              `${suffix}.${name}`,
              kind,
              scope,
              layer.id,
              fps,
            );
        }
      };
      const visit = (contents: ShapeContent[], at: JsonPath, suffix: string) =>
        contents.forEach((content, i) => {
          const jsonPath: JsonPath = [...at, "contents", i],
            property = `${suffix ? suffix + "." : ""}contents[${content.id}]`;
          fields(content, content.type, jsonPath, property);
          if (content.type === "group" || content.type === "repeater") {
            fields(
              content.transform ?? {},
              content.type === "group" ? "transform" : "repeater-transform",
              [...jsonPath, "transform"],
              property + ".transform",
            );
            if (content.type === "group")
              visit(content.contents, jsonPath, property);
          } else if (
            content.type === "gradient-fill" ||
            content.type === "gradient-stroke"
          )
            content.stops.forEach((stop, j) =>
              fields(
                stop,
                "stop",
                [...jsonPath, "stops", j],
                `${property}.stops[${stop.id}]`,
              ),
            );
        });
      visit(layer.contents, path, "");
    }
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
    case "curve":
      return effectCurve(track.raw, frame, track.fps, [
        [0, 0],
        [1, 1],
      ]).flat();
    case "vector":
      return track.dimensions === 3
        ? vector3(track.raw, frame, track.fps, [0, 0, track.fallbackZ ?? 0])
        : vector(track.raw, frame, track.fps, [0, 0]);
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
  return Array.from({ length: count }, (_, i) => {
    const frame = start + ((end - start) * i) / (count - 1),
      delta = 0.01;
    const value = sampleTrack(track, frame);
    const left = sampleTrack(track, Math.max(start, frame - delta)),
      right = sampleTrack(track, Math.min(end, frame + delta));
    const span = Math.min(end, frame + delta) - Math.max(start, frame - delta);
    return {
      frame,
      value,
      speed: value.map((_, axis) =>
        span ? (right[axis]! - left[axis]!) / span : 0,
      ),
    };
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
  if (track.kind === "curve" && speed !== undefined)
    throw Error(
      "Whole color curves use shared easing; edit a point for numeric speeds",
    );
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
  delete key.smooth;
  if (key.interpolation === "smooth") delete key.interpolation;
}
/** Explicitly selecting Bézier replaces the higher-priority temporal handles for this segment. */
export function editSegmentBezier(
  draft: Composition,
  track: KeyTrack,
  destination: number,
  bezier: [number, number, number, number],
) {
  if (["discrete", "path", "camera"].includes(track.kind) || destination < 1)
    throw new Error("Select a numeric segment ending after the first key");
  const keys = keysIn(draft, track),
    a = keys[destination - 1],
    b = keys[destination];
  if (!a || !b) throw new Error("Segment no longer exists");
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
  value: [number, number] | [number, number, number],
) {
  if (track.kind !== "vector")
    throw new Error("Spatial tangents need a joint vector track");
  const keys = keysIn(draft, track),
    key = keys[index];
  if (!key) throw new Error("Key no longer exists");
  if (value.length !== (track.dimensions ?? 2))
    throw Error(
      `This track requires ${track.dimensions ?? 2} tangent components`,
    );
  key[side] = [...value] as typeof value;
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
