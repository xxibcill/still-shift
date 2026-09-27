import { expandMotionIntents } from "./story-motion-presets.ts";
import {
  sampleSpatialPath,
  evaluateMotionAppearance,
} from "./motion-appearance.ts";
import type { SpatialPath } from "../../scene-contract/src/motion-craft.ts";
import type { StoryMove } from "../../scene-contract/src/story.ts";
import {
  NumericMotionPropertySchema,
  type MotionLayer,
  type MotionBlend,
  type ScalarKey,
  type PeriodicMotion,
  type Signal,
  type Driver,
} from "../../scene-contract/src/motion-craft.ts";
import type { PreparedNode } from "../../scene-contract/src/prepared.ts";
import type { StoryRenderScene } from "./story-scene.ts";
import type { CommerceRenderScene } from "./commerce-scene.ts";
import { sampleCurve, type CurveKey } from "./curve.ts";
import { easeMotion } from "./motion-easing.ts";
import { evaluatePreparedNodeAtTime, sampleTrack } from "./prepared-scene.ts";
import { nodeMatrix, transformPoint } from "./node-transform.ts";
import { pointOnPath } from "./prepared-scene.ts";

type Scene = StoryRenderScene | CommerceRenderScene;
type State = Record<string, number>;
export type LayerTrack = {
  node: string;
  property: string;
  layer: MotionLayer;
  blend: MotionBlend;
  keys?: CurveKey[];
  periodic?: PeriodicMotion;
  weight?: CurveKey[];
  spatial?: { paths: SpatialPath[]; frames: number[] };
  start: number;
  end: number;
  path: string;
};
export type CompiledMotionCraft = { layers: LayerTrack[]; order: string[] };
export const layerOrder: MotionLayer[] = [
  "action",
  "response",
  "current",
  "carrier",
];
export function motionError(
  code: string,
  path: string,
  message: string,
): never {
  throw Object.assign(new Error(`${code}: ${message}`), { code, path });
}
export function numericBase(node: PreparedNode, property: string): number {
  if (["scaleX", "scaleY", "reveal", "trimEnd"].includes(property)) return 1;
  if (property === "anchorX") return node.origin[0];
  if (property === "anchorY") return node.origin[1];
  if (property === "strokeWidth")
    return "lineWidth" in node ? node.lineWidth : 0;
  const value = (node as unknown as State)[property];
  return typeof value === "number" ? value : 0;
}
export function defaultBlend(
  layer: MotionLayer,
  property: string,
): MotionBlend {
  if (layer === "action") return "replace";
  return layer === "response" &&
    ["scaleX", "scaleY", "opacity"].includes(property)
    ? "multiply"
    : "add";
}
export const scalarKeys = (keys: ScalarKey[]): CurveKey[] =>
  keys.map(({ frame, ...key }) => ({ time: frame, ...key }));
function moveTracks(
  scene: Scene,
  move: StoryMove,
  path: string,
  previous: LayerTrack[] = [],
): LayerTrack[] {
  const node = scene.nodes.find((n) => n.id === move.node)!;
  return NumericMotionPropertySchema.options.flatMap((property) => {
    const layer =
      move.layer ??
      move.window?.layer ??
      move.role ??
      move.window?.role ??
      "action";
    const blend =
      move.blend ?? move.window?.blend ?? defaultBlend(layer, property);
    let keys: CurveKey[];
    if (move.keys)
      keys = move.keys
        .filter((k) => k[property] !== undefined)
        .map((k) => ({ ...k, time: k.frame, value: k[property]! }));
    else {
      const to =
        move.to?.[property] ??
        (["scaleX", "scaleY"].includes(property) ? move.to?.scale : undefined);
      if (to === undefined) return [];
      const window = move.window!;
      const legacy =
        scene.tracks[node.id]?.[
          property as keyof (typeof scene.tracks)[string]
        ];
      const preceding = previous
        .filter(
          (track) =>
            track.node === node.id &&
            track.property === property &&
            track.blend === "replace" &&
            track.end <= window.start,
        )
        .sort((a, b) => b.end - a.end)[0];
      const prior =
        blend === "replace"
          ? preceding
            ? sampleLayer(preceding, window.start, scene.fps)
            : legacy
              ? sampleTrack(legacy, window.start, scene.fps)
              : numericBase(node, property)
          : blend === "multiply"
            ? 1
            : 0;
      keys = [
        { time: window.start, value: prior },
        {
          time: window.end,
          value: to,
          ...(window.easing ? { easing: window.easing } : {}),
        },
      ];
    }
    if (!keys.length) return [];
    keys.forEach((key, i) => {
      if (
        (key.smooth || key.interpolation === "smooth") &&
        (!i || i === keys.length - 1)
      )
        motionError(
          "motion-smooth-neighbors",
          path,
          `Smooth ${property} key requires neighbors for that property`,
        );
    });
    let spatial: LayerTrack["spatial"];
    if (
      (property === "x" || property === "y") &&
      move.keys?.some((k) => k.spatialIn || k.spatialOut)
    ) {
      if (move.keys.some((k) => k.x === undefined || k.y === undefined))
        motionError(
          "motion-spatial-pose",
          path,
          "Spatial keys require both x and y",
        );
      spatial = {
        frames: move.keys.map((k) => k.frame),
        paths: move.keys.slice(1).map((b, i) => {
          const a = move.keys![i]!;
          return {
            node: node.id,
            segments: [
              [
                [a.x!, a.y!],
                [
                  a.x! + (a.spatialOut?.[0] ?? 0),
                  a.y! + (a.spatialOut?.[1] ?? 0),
                ],
                [
                  b.x! + (b.spatialIn?.[0] ?? 0),
                  b.y! + (b.spatialIn?.[1] ?? 0),
                ],
                [b.x!, b.y!],
              ],
            ],
          };
        }),
      };
    }
    const weight = move.weight ?? move.window?.weight;
    return [
      {
        node: node.id,
        property,
        layer,
        blend,
        keys,
        start: keys[0]!.time,
        end: keys.at(-1)!.time,
        path,
        ...(spatial ? { spatial } : {}),
        ...(weight ? { weight: scalarKeys(weight) } : {}),
      },
    ];
  });
}
export function compileMotionCraft(scene: Scene): CompiledMotionCraft {
  const layers: LayerTrack[] = [];
  for (const [index, binding] of (
    scene.componentData?.bindings ?? []
  ).entries()) {
    if (binding.kind !== "property") continue;
    const value = scene.componentData!.values.find(
      (v) => v.id === binding.value,
    )!;
    const map = (v: number) =>
      binding.output[0] +
      (binding.output[1] - binding.output[0]) *
        ((v - value.range[0]) / (value.range[1] - value.range[0]));
    const layer = value.window.layer ?? "action",
      blend = value.window.blend ?? defaultBlend(layer, binding.property);
    layers.push({
      node: binding.target,
      property: binding.property,
      layer,
      blend,
      start: 0,
      end: value.window.end,
      path: `/componentData/bindings/${index}`,
      keys: [
        { time: 0, value: map(value.from) },
        ...(value.window.start
          ? [{ time: value.window.start, value: map(value.from) }]
          : []),
        {
          time: value.window.end,
          value: map(value.to),
          easing: value.window.easing,
        },
      ],
      ...(value.window.weight
        ? { weight: scalarKeys(value.window.weight) }
        : {}),
    });
  }
  const intents = expandMotionIntents(scene.intentPresets);
  const moves = [
    ...intents.moves.map((move, i) => ({
      move,
      path: `/intentPresets/motions/${i}`,
    })),
    ...(scene.schemaVersion === "story-scene-1"
      ? [
          ...scene.recipe.moves.map((move, i) => ({
            move,
            path: `/recipe/moves/${i}`,
          })),
          ...scene.recipe.emphasis.map((e, i) => ({
            move: {
              node: e.node,
              window: e.window,
              to: { opacity: e.opacity },
              layer: e.window.layer ?? "response",
              blend: e.window.blend ?? "multiply",
            } as StoryMove,
            path: `/recipe/emphasis/${i}`,
          })),
        ]
      : []),
  ].sort(
    (a, b) =>
      (a.move.window?.start ?? a.move.keys?.[0]?.frame ?? 0) -
      (b.move.window?.start ?? b.move.keys?.[0]?.frame ?? 0),
  );
  for (const { move, path } of moves)
    layers.push(...moveTracks(scene, move, path, layers));
  if (scene.schemaVersion === "commerce-scene-1")
    scene.events.forEach((event, i) => {
      const layer = event.layer ?? "action",
        blend = event.blend ?? defaultBlend(layer, event.property);
      const node = scene.nodes.find((n) => n.id === event.node)!;
      const previous = layers
        .filter(
          (t) =>
            t.node === event.node &&
            t.property === event.property &&
            t.blend === "replace",
        )
        .at(-1);
      const from =
        event.from ??
        (blend === "add"
          ? 0
          : blend === "multiply"
            ? 1
            : (previous?.keys?.at(-1)?.value ??
              numericBase(node, event.property)));
      layers.push({
        node: event.node,
        property: event.property,
        layer,
        blend,
        start: event.start,
        end: event.end,
        path: `/events/${i}`,
        keys: [
          { time: event.start, value: from },
          { time: event.end, value: event.to, easing: event.easing },
        ],
        ...(event.weight ? { weight: scalarKeys(event.weight) } : {}),
      });
    });
  [...(scene.periodic ?? []), ...intents.periodic].forEach((motion, i) =>
    layers.push({
      node: motion.node,
      property: motion.property,
      layer: motion.layer ?? "carrier",
      blend: motion.blend ?? "add",
      start: motion.start,
      end: motion.end,
      periodic: motion,
      path: `/periodic/${i}`,
      ...(motion.weight ? { weight: scalarKeys(motion.weight) } : {}),
    }),
  );
  for (const [i, track] of layers.entries()) {
    if (track.blend !== "replace") continue;
    for (const other of layers.slice(0, i))
      if (
        other.blend === "replace" &&
        other.node === track.node &&
        other.property === track.property &&
        track.start < other.end &&
        other.start < track.end
      )
        motionError(
          "motion-conflict",
          track.path,
          `Overlapping replace motions on ${track.node}.${track.property}`,
        );
    const legacy =
      scene.tracks[track.node]?.[
        track.property as keyof (typeof scene.tracks)[string]
      ] ?? [];
    for (let k = 1; k < legacy.length; k++)
      if (
        legacy[k]!.value !== legacy[k - 1]!.value &&
        track.start < legacy[k]!.time &&
        legacy[k - 1]!.time < track.end
      )
        motionError(
          "motion-conflict",
          track.path,
          `Replace motion overlaps recipe motion on ${track.node}.${track.property}`,
        );
    for (const driver of scene.drivers ?? [])
      if (
        driver.target === `${track.node}.${track.property}` &&
        (driver.blend ??
          defaultBlend(driver.layer ?? "action", track.property)) === "replace"
      )
        motionError(
          "motion-conflict",
          track.path,
          `Driver and motion both replace ${driver.target}`,
        );
  }
  const replaceDrivers = new Set<string>();
  for (const [index, driver] of (scene.drivers ?? []).entries()) {
    const [id, property] = driver.target.split(".") as [string, string];
    if (
      (driver.blend ?? defaultBlend(driver.layer ?? "action", property)) !==
      "replace"
    )
      continue;
    const legacy =
      scene.tracks[id]?.[property as keyof (typeof scene.tracks)[string]];
    if (
      replaceDrivers.has(driver.target) ||
      legacy?.some((key, i) => i > 0 && key.value !== legacy[i - 1]!.value)
    )
      motionError(
        "motion-conflict",
        `/drivers/${index}`,
        `Multiple replace writers on ${driver.target}`,
      );
    replaceDrivers.add(driver.target);
  }
  const order: string[] = [],
    active: string[] = [];
  const visit = (id: string) => {
    if (active.includes(id))
      motionError("motion-cycle", "/drivers", [...active, id].join(" → "));
    if (order.includes(id)) return;
    active.push(id);
    for (const driver of scene.drivers ?? [])
      if (driver.target.split(".")[0] === id)
        for (const source of driver.sum ?? [driver.source ?? driver.signal!])
          if (source.includes(".")) visit(source.split(".")[0]!);
    for (const constraint of scene.constraints ?? [])
      if (constraint.target === id) {
        const source =
          "surface" in constraint
            ? constraint.surface
            : "anchor" in constraint
              ? constraint.anchor
              : "toward" in constraint
                ? constraint.toward
                : "path" in constraint
                  ? constraint.path
                  : undefined;
        if (source) visit(source);
      }
    active.pop();
    order.push(id);
  };
  scene.nodes.forEach((n) => visit(n.id));
  return {
    layers: layers.sort(
      (a, b) =>
        layerOrder.indexOf(a.layer) - layerOrder.indexOf(b.layer) ||
        a.start - b.start,
    ),
    order,
  };
}

function randomAt(seed: number, cell: number) {
  let h = Math.imul(seed ^ cell, 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967295) * 2 - 1;
}
export function samplePeriodic(
  motion: Pick<PeriodicMotion, "oscillate" | "noise">,
  frame: number,
) {
  if (motion.oscillate) {
    const o = motion.oscillate;
    return (
      Math.sin((frame / o.period) * Math.PI * 2 + (o.phase ?? 0)) * o.amplitude
    );
  }
  const n = motion.noise!,
    position = frame / n.period,
    cell = Math.floor(position),
    t = position - cell;
  return (
    (randomAt(n.seed, cell) +
      (randomAt(n.seed, cell + 1) - randomAt(n.seed, cell)) *
        t *
        t *
        (3 - 2 * t)) *
    n.amplitude
  );
}
export function sampleSignal(signal: Signal, frame: number, fps = 30) {
  let value = sampleCurve(scalarKeys(signal.keys), frame, fps);
  for (const addition of signal.add ?? []) {
    if ("pulse" in addition) {
      const { at, half, depth } = addition.pulse;
      const t = Math.abs(frame - at) / half;
      if (t < 1) value += (depth * (1 + Math.cos(t * Math.PI))) / 2;
    } else value += samplePeriodic(addition, frame);
  }
  return value;
}
export function sampleLayer(track: LayerTrack, frame: number, fps = 30) {
  if (track.spatial) {
    const { frames, paths } = track.spatial;
    let index = frames.findIndex((f, i) => i > 0 && frame < f) - 1;
    if (index < 0) index = frame < frames[0]! ? 0 : paths.length - 1;
    const t = easeMotion(
      (frame - frames[index]!) / (frames[index + 1]! - frames[index]!),
      track.keys?.[index + 1]?.easing,
      (frames[index + 1]! - frames[index]!) / fps,
    );
    return sampleSpatialPath(paths[index]!, t).point[
      track.property === "x" ? 0 : 1
    ];
  }
  return track.periodic
    ? samplePeriodic(track.periodic, frame - track.start)
    : sampleCurve(track.keys!, frame, fps);
}
export function isLayerActive(track: LayerTrack, frame: number) {
  if (track.periodic) return frame >= track.start && frame <= track.end;
  return track.blend !== "replace" || frame >= track.start;
}
export function blendValue(
  base: number,
  value: number,
  blend: MotionBlend,
  weight = 1,
) {
  return blend === "add"
    ? base + value * weight
    : blend === "multiply"
      ? base * (1 + (value - 1) * weight)
      : base + (value - base) * weight;
}
function sourceValue(scene: Scene, source: string, frame: number) {
  if (!source.includes("."))
    return sampleSignal(
      scene.signals!.find((s) => s.id === source)!,
      frame,
      scene.fps,
    );
  const [id, property] = source.split(".");
  const node = scene.nodes.find((n) => n.id === id)!;
  return (
    (
      evaluatePreparedNodeAtTime(
        scene,
        node,
        Math.max(0, Math.min(scene.frameCount - 1, frame)),
      ) as State
    )[property!] ?? numericBase(node, property!)
  );
}
export function sampleDriver(
  scene: Scene,
  driver: Driver,
  frame: number,
): number {
  const mapping = driver.map ?? {};
  const time = frame - (mapping.delay ?? 0);
  const read = (t: number) =>
    (driver.sum ?? [driver.source ?? driver.signal!]).reduce(
      (sum, source) => sum + sourceValue(scene, source, t),
      0,
    );
  let value = read(time);
  if (mapping.lag) {
    // Exact critically damped response to piecewise-linear source intervals; no playback state.
    const omega = 2 / mapping.lag;
    let y = read(0),
      velocity = 0;
    for (let start = 0; start < time; start++) {
      const h = Math.min(1, time - start),
        a = read(start),
        b = read(start + h),
        slope = (b - a) / h;
      const offset = y - a + (2 * slope) / omega,
        tangent = velocity - slope + omega * offset,
        decay = Math.exp(-omega * h);
      y = b - (2 * slope) / omega + (offset + tangent * h) * decay;
      velocity = slope + (tangent - omega * (offset + tangent * h)) * decay;
    }
    value = y;
  }
  if (mapping.range && mapping.to) {
    const t =
      (value - mapping.range[0]) / (mapping.range[1] - mapping.range[0]);
    value =
      mapping.to[0] +
      (mapping.to[1] - mapping.to[0]) *
        easeMotion(t, mapping.easing ?? "linear");
  }
  value *= mapping.scale ?? 1;
  if (mapping.clamp)
    value = Math.max(mapping.clamp[0], Math.min(mapping.clamp[1], value));
  if (mapping.step) value = Math.floor(value / mapping.step) * mapping.step;
  return value + (mapping.offset ?? 0);
}
function clampState(state: State) {
  for (const property of [
    "opacity",
    "reveal",
    "trimStart",
    "trimEnd",
    "gap",
    "pinch",
  ])
    if (state[property] !== undefined)
      state[property] = Math.max(0, Math.min(1, state[property]!));
  for (const property of ["scaleX", "scaleY"])
    state[property] = Math.max(1e-6, Math.min(4, state[property]!));
  if (state.blur !== undefined)
    state.blur = Math.max(0, Math.min(40, state.blur));
  if (state.strokeWidth !== undefined)
    state.strokeWidth = Math.max(0, Math.min(200, state.strokeWidth));
}
export function applyMotionCraft(
  scene: Scene,
  node: PreparedNode,
  frame: number,
  state: State,
) {
  const craft = scene.compiledMotion;
  if (!craft) return;
  const anchorOffset = () => {
    const pose = {
      x: state.x!,
      y: state.y!,
      rotation: state.rotation!,
      scaleX: state.scaleX!,
      scaleY: state.scaleY!,
      skewX: state.skewX,
      skewY: state.skewY,
      anchorX: state.anchorX,
      anchorY: state.anchorY,
    };
    const point = transformPoint(nodeMatrix(node, pose), [
      node.width * (state.anchorX ?? node.origin[0]),
      node.height * (state.anchorY ?? node.origin[1]),
    ]);
    return [point[0] - state.x!, point[1] - state.y!] as const;
  };
  const apply = (
    property: string,
    value: number,
    blend: MotionBlend,
    weight = 1,
  ) => {
    state[property] = blendValue(
      state[property] ?? numericBase(node, property),
      value,
      blend,
      weight,
    );
  };
  for (const layer of layerOrder) {
    for (const track of craft.layers)
      if (track.node === node.id && track.layer === layer) {
        if (!isLayerActive(track, frame)) continue;
        const weight = track.weight
          ? Math.max(
              0,
              Math.min(1, sampleCurve(track.weight, frame, scene.fps)),
            )
          : 1;
        apply(
          track.property,
          sampleLayer(track, frame, scene.fps),
          track.blend,
          weight,
        );
      }
    for (const driver of scene.drivers ?? [])
      if (
        driver.target.split(".")[0] === node.id &&
        (driver.layer ?? "action") === layer
      ) {
        const property = driver.target.split(".")[1]!;
        apply(
          property,
          sampleDriver(scene, driver, frame),
          driver.blend ?? defaultBlend(layer, property),
          driver.weight
            ? Math.max(
                0,
                Math.min(
                  1,
                  sampleCurve(scalarKeys(driver.weight), frame, scene.fps),
                ),
              )
            : 1,
        );
      }
    for (const constraint of scene.constraints ?? [])
      if (
        constraint.target === node.id &&
        (constraint.layer ?? "response") === layer
      ) {
        const weight = constraint.weight
          ? Math.max(
              0,
              Math.min(
                1,
                sampleCurve(scalarKeys(constraint.weight), frame, scene.fps),
              ),
            )
          : 1;
        const set = (property: string, value: number) => {
          const blend = constraint.blend ?? "replace",
            current = state[property] ?? numericBase(node, property);
          apply(
            property,
            blend === "add"
              ? value - current
              : blend === "multiply"
                ? current
                  ? value / current
                  : 1
                : value,
            blend,
            weight,
          );
        };
        const other = (id: string) => {
          const source = scene.nodes.find((n) => n.id === id)!;
          return {
            node: source,
            state: evaluatePreparedNodeAtTime(scene, source, frame),
          };
        };
        if (constraint.type === "look-at") {
          const target = other(constraint.toward);
          const center = transformPoint(nodeMatrix(target.node, target.state), [
            target.node.width / 2,
            target.node.height / 2,
          ]);
          set(
            "rotation",
            (Math.atan2(
              center[1] - state.y! - node.height / 2,
              center[0] - state.x! - node.width / 2,
            ) *
              180) /
              Math.PI +
              (constraint.offset ?? 0),
          );
        } else if (constraint.type === "attach") {
          const anchor = other(constraint.anchor),
            point = constraint.point ?? [0.5, 0.5];
          const position = transformPoint(
            nodeMatrix(anchor.node, anchor.state),
            [point[0] * anchor.node.width, point[1] * anchor.node.height],
          );
          const offset = anchorOffset();
          set("x", position[0] - offset[0] + (constraint.offset?.[0] ?? 0));
          set("y", position[1] - offset[1] + (constraint.offset?.[1] ?? 0));
        } else if (constraint.type === "contact") {
          const surface = other(constraint.surface),
            edge = constraint.edge ?? "bottom";
          const horizontal = edge === "top" || edge === "bottom",
            stroke =
              surface.node.type === "path" ? surface.node.lineWidth / 2 : 0;
          const edgeAt = horizontal
            ? edge === "top"
              ? -stroke
              : surface.node.height + stroke
            : edge === "left"
              ? -stroke
              : surface.node.width + stroke;
          const matrix = nodeMatrix(surface.node, surface.state);
          const a = transformPoint(
            matrix,
            horizontal ? [0, edgeAt] : [edgeAt, 0],
          );
          const b = transformPoint(
            matrix,
            horizontal
              ? [Math.max(1, surface.node.width), edgeAt]
              : [edgeAt, Math.max(1, surface.node.height)],
          );
          const length = Math.hypot(b[0] - a[0], b[1] - a[1]),
            nx = -(b[1] - a[1]) / length,
            ny = (b[0] - a[0]) / length;
          const pose = state as State & {
            x: number;
            y: number;
            rotation: number;
            scaleX: number;
            scaleY: number;
          };
          const contact = () =>
            transformPoint(nodeMatrix(node, pose), [
              node.width * constraint.point[0],
              node.height * constraint.point[1],
            ]);
          const distance = () => {
            const p = contact();
            return nx * (p[0] - a[0]) + ny * (p[1] - a[1]);
          };
          const dx = node.width * (constraint.point[0] - node.origin[0]),
            dy = node.height * (constraint.point[1] - node.origin[1]);
          // The first permitted degree of freedom that can solve contact wins.
          for (const property of constraint.solve) {
            const angle = (state.rotation! * Math.PI) / 180;
            const currentDistance = distance(),
              original = state[property]!;
            state[property] = original + 1;
            const derivative = distance() - currentDistance;
            state[property] = original;
            if (property !== "rotation" && Math.abs(derivative) > 1e-9) {
              set(property, state[property]! - distance() / derivative);
              break;
            }
            if (property === "rotation") {
              const kx = Math.tan(((state.skewX ?? 0) * Math.PI) / 180),
                ky = Math.tan(((state.skewY ?? 0) * Math.PI) / 180);
              const x = dx * state.scaleX! + kx * dy * state.scaleY!,
                y = ky * dx * state.scaleX! + dy * state.scaleY!,
                A = nx * x + ny * y,
                B = -nx * y + ny * x,
                radius = Math.hypot(A, B);
              const centerX = state.x! + node.width * node.origin[0],
                centerY = state.y! + node.height * node.origin[1],
                C = nx * (a[0] - centerX) + ny * (a[1] - centerY);
              if (radius > 1e-9 && Math.abs(C) <= radius) {
                const offset = Math.atan2(B, A),
                  theta = Math.acos(C / radius),
                  candidates = [offset + theta, offset - theta].map(
                    (v) =>
                      angle +
                      Math.atan2(Math.sin(v - angle), Math.cos(v - angle)),
                  );
                set(
                  "rotation",
                  (candidates.sort(
                    (a, b) => Math.abs(a - angle) - Math.abs(b - angle),
                  )[0]! *
                    180) /
                    Math.PI,
                );
                break;
              }
            }
          }
        } else if (constraint.type === "follow-path") {
          const path = other(constraint.path);
          if (path.node.type !== "path") continue;
          const progress = sourceValue(scene, constraint.progress, frame);
          const spatial = scene.spatialPaths?.find(
            (p) => p.node === path.node.id,
          );
          const appearance = evaluateMotionAppearance(scene, path.node, frame);
          if (appearance.type !== "path") continue;
          const sampled = spatial
            ? sampleSpatialPath(spatial, progress)
            : undefined;
          const position = sampled?.point ?? pointOnPath(appearance, progress);
          const point = transformPoint(
            nodeMatrix(path.node, path.state),
            position,
          );
          const offset = anchorOffset();
          set("x", point[0] - offset[0]);
          set("y", point[1] - offset[1]);
          if (constraint.orient) {
            const sample = (t: number) =>
              spatial
                ? sampleSpatialPath(spatial, t).point
                : pointOnPath(appearance, t);
            const matrix = nodeMatrix(path.node, path.state);
            const next = transformPoint(
                matrix,
                sample(Math.min(1, progress + 1e-5)),
              ),
              prior = transformPoint(
                matrix,
                sample(Math.max(0, progress - 1e-5)),
              );
            set(
              "rotation",
              (Math.atan2(next[1] - prior[1], next[0] - prior[0]) * 180) /
                Math.PI,
            );
          }
        } else if (constraint.clamp) {
          const pose = {
            x: state.x!,
            y: state.y!,
            rotation: state.rotation!,
            scaleX: state.scaleX!,
            scaleY: state.scaleY!,
            skewX: state.skewX,
            skewY: state.skewY,
            anchorX: state.anchorX,
            anchorY: state.anchorY,
          };
          const matrix = nodeMatrix(node, pose),
            points = [
              [0, 0],
              [node.width, 0],
              [node.width, node.height],
              [0, node.height],
            ].map((point) => transformPoint(matrix, point as [number, number]));
          for (const [axis, property, extent] of [
            [0, "x", scene.width],
            [1, "y", scene.height],
          ] as const) {
            const lower = Math.min(...points.map((p) => p[axis])),
              upper = Math.max(...points.map((p) => p[axis]));
            const delta =
              lower < constraint.inset
                ? constraint.inset - lower
                : upper > extent - constraint.inset
                  ? extent - constraint.inset - upper
                  : 0;
            set(property, state[property]! + delta);
          }
        }
      }
  }
  clampState(state);
}
