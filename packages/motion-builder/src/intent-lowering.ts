import {
  STORY_MOTION_PRESETS,
  compileTextEvents,
  TextEventError,
  resolveTextEvents,
  PreparedNodeSchema,
  TextEventSchema,
  TextLayerSchema,
  easeMotion,
  resolvePropertyPath,
  isResolvedProperty,
  type Composition,
  type PreparedNode,
  type TextEvent,
  type TextEventScene,
} from "@still-shift/scene-contract";
import type { Scheduled } from "./timeline.ts";
import type {
  IntentCommand,
  MotionPresetOptions,
  TextPresetOptions,
  MotionPresetName,
} from "./presets.ts";
import { BuilderError, type SourceLocation } from "./source.ts";
type Site = [string, SourceLocation];

function uniqueSignal(comp: Composition, index: number) {
  let id = `intent-${index}`,
    suffix = 1;
  while (comp.signals?.some((signal) => signal.id === id))
    id = `intent-${index}-${suffix++}`;
  return id;
}
function drawOn(comp: Composition, clip: Scheduled<IntentCommand>) {
  const layer = comp.layers.find((node) => node.id === clip.value.owner.id)!;
  if (layer.type === "shape") {
    let id = "draw-on",
      suffix = 1;
    while (layer.contents.some((content) => content.id === id))
      id = `draw-on-${suffix++}`;
    layer.contents.push({
      id,
      type: "trim-paths",
      mode: "simultaneous",
      end: {
        keys: [
          { frame: clip.start, value: 0 },
          { frame: clip.end, value: 1, easing: "in-out-cubic" },
        ],
      },
    });
    return;
  }
  if (layer.type !== "provider" || layer.provider !== "story.path@1.0.0")
    throw new BuilderError(
      "comp-builder-preset",
      "drawOn requires a native shape layer or story.path@1.0.0 provider",
      clip.value.location,
    );
  const samples = layer.params?.samples;
  if (
    samples !== undefined &&
    (!Array.isArray(samples) || samples.length !== comp.frameCount)
  )
    throw new BuilderError(
      "comp-builder-preset",
      "Path samples must match the composition duration",
      clip.value.location,
    );
  layer.params = {
    ...layer.params,
    samples: Array.from({ length: comp.frameCount }, (_, frame) => {
      const sample = Array.isArray(samples) ? samples[frame] : undefined;
      if (
        sample !== undefined &&
        (!sample || typeof sample !== "object" || Array.isArray(sample))
      )
        throw new BuilderError(
          "comp-builder-preset",
          "Path samples must be objects",
          clip.value.location,
        );
      return {
        gap: 0,
        pinch: 0,
        pulse: 0,
        ...(sample as Record<string, number> | undefined),
        reveal: easeMotion(
          (frame - clip.start) / (clip.end - clip.start),
          "in-out-cubic",
        ),
      };
    }),
  };
}
function numeric(
  comp: Composition,
  clip: Scheduled<IntentCommand>,
  index: number,
  sites: Site[],
) {
  const options = clip.value.options as MotionPresetOptions,
    name = clip.value.intent as Exclude<MotionPresetName, "draw-on">;
  const path = `${clip.value.owner.id}.${options.property ?? "y"}`;
  const resolved = resolvePropertyPath(comp, path);
  if (
    !isResolvedProperty(resolved) ||
    resolved.type !== "scalar" ||
    resolved.readOnly
  )
    throw new BuilderError(
      "comp-builder-preset",
      `Motion intent requires a writable scalar property: ${path}`,
      clip.value.location,
    );
  const target = resolved.path;
  if (name === "breathe") {
    (comp.periodic ??= []).push({
      target,
      start: clip.start,
      end: clip.end,
      layer: "carrier",
      blend: "add",
      oscillate: {
        period: clip.end - clip.start,
        amplitude: options.amount ?? 2,
      },
    });
    sites.push([`periodic:${comp.periodic.length - 1}`, clip.value.location]);
    return;
  }
  const definition = STORY_MOTION_PRESETS[name],
    amount = options.amount ?? 20,
    id = uniqueSignal(comp, index);
  const keys = definition.keys.map(([at, value], i, all) => ({
    frame: clip.start + Math.round((clip.end - clip.start) * at),
    value: value * amount,
    easing: "in-out-cubic" as const,
    ...(i > 0 && i < all.length - 1 ? { smooth: true } : {}),
  }));
  (comp.signals ??= []).push({ id, keys });
  (comp.drivers ??= []).push({
    target,
    signal: id,
    layer: definition.layer,
    blend: "add",
  });
  sites.push(
    [`signal:${id}`, clip.value.location],
    [`driver:${comp.drivers.length - 1}`, clip.value.location],
  );
}
const preparedTextSchema = PreparedNodeSchema.options[2].safeExtend({
  fontSize: TextLayerSchema.shape.fontSize,
});
const textShape = preparedTextSchema.shape;
function preparedText(layer: Composition["layers"][number]) {
  if (layer.type !== "text") return undefined;
  const position = layer.transform?.position;
  const at = Array.isArray(position)
    ? position
    : position && "keys" in position
      ? (position.keys[0]?.value ?? [0, 0])
      : position
        ? [
            typeof position.x === "number"
              ? position.x
              : (position.x.keys[0]?.value ?? 0),
            typeof position.y === "number"
              ? position.y
              : (position.y.keys[0]?.value ?? 0),
          ]
        : [0, 0];
  const content = Object.fromEntries(
    Object.entries(layer).filter(([key]) => key in textShape),
  );
  const parsed = preparedTextSchema.safeParse({
    ...content,
    x: at[0],
    y: at[1],
  });
  if (!parsed.success)
    throw new Error(
      `Native text intent requires static text content: ${parsed.error.message}`,
    );
  return parsed.data as Extract<PreparedNode, { type: "text" }>;
}
function textIntents(
  comp: Composition,
  clips: Scheduled<IntentCommand>[],
  sites: Site[],
) {
  if (!clips.length) return;
  const events: TextEvent[] = [];
  for (const clip of clips) {
    const options = clip.value.options as TextPresetOptions;
    const result = TextEventSchema.safeParse({
      ...options,
      verb: clip.value.intent.slice(5),
      node: clip.value.owner.id,
      at: clip.start,
      duration: clip.end - clip.start,
    });
    if (!result.success)
      throw new BuilderError(
        "comp-builder-preset",
        result.error.message,
        clip.value.location,
      );
    events.push(result.data);
  }
  let compiled: TextEventScene;
  try {
    const targets = new Set(
      events.flatMap((event) => [
        event.node,
        ...(event.target ? [event.target] : []),
      ]),
    );
    const scene: TextEventScene = {
      typography: "type-1",
      fps: comp.fps,
      frameCount: comp.frameCount,
      nodes: comp.layers
        .filter((layer) => targets.has(layer.id))
        .flatMap((layer) => {
          try {
            const node = preparedText(layer);
            return node ? [node] : [];
          } catch (error) {
            const index = events.findIndex(
              (event) => event.node === layer.id || event.target === layer.id,
            );
            throw new BuilderError(
              "comp-builder-preset",
              error instanceof Error ? error.message : String(error),
              clips[index]!.value.location,
            );
          }
        }),
      fonts: comp.assets.filter((asset) => asset.type === "font"),
      textStyles: comp.textStyles,
      textEvents: events,
      textAnimators: [],
    };
    compiled = compileTextEvents(scene);
  } catch (error) {
    if (error instanceof BuilderError) throw error;
    const index = error instanceof TextEventError ? error.eventIndex : 0;
    throw new BuilderError(
      "comp-builder-preset",
      error instanceof Error ? error.message : String(error),
      clips[index]!.value.location,
    );
  }
  for (const node of compiled.nodes) {
    if (node.type !== "text") continue;
    const layer = comp.layers.find((layer) => layer.id === node.id)!;
    if (layer.type !== "text") continue;
    if (node.decorations) layer.decorations = node.decorations;
    if (node.transitions) layer.transitions = node.transitions;
    const corrections = resolveTextEvents(compiled)
      .filter((event) => event.node === node.id && event.verb === "correct")
      .map((event) => ({
        replacement: event.replacement!,
        start: event.start,
        end: event.end,
        ...(event.span ? { span: event.span } : {}),
        ...(event.color ? { color: event.color } : {}),
      }));
    if (corrections.length)
      layer.corrections = [...(layer.corrections ?? []), ...corrections];
  }
  for (const animator of compiled.textAnimators ?? []) {
    (comp.textAnimators ??= []).push(animator);
    const source =
      clips.find(
        (clip) =>
          clip.value.owner.id === animator.node &&
          clip.start === animator.start,
      ) ?? clips.find((clip) => clip.start === animator.start)!;
    sites.push([
      `textAnimator:${comp.textAnimators.length - 1}`,
      source.value.location,
    ]);
  }
}
export function applyIntents(
  comp: Composition,
  clips: Scheduled<IntentCommand>[],
): Site[] {
  const sites: Site[] = [],
    paths = new Set<string>();
  for (const [index, clip] of clips.entries()) {
    if (clip.end <= clip.start || clip.end >= comp.frameCount)
      throw new BuilderError(
        "comp-builder-duration",
        "Intent needs a positive duration ending before the last composition boundary",
        clip.value.location,
      );
    if (clip.value.intent.startsWith("text-")) continue;
    if (clip.value.intent === "draw-on") {
      const id = clip.value.owner.id;
      if (paths.has(id))
        throw new BuilderError(
          "comp-builder-conflict",
          `Multiple drawOn recipes target ${id}`,
          clip.value.location,
        );
      paths.add(id);
      drawOn(comp, clip);
    } else numeric(comp, clip, index, sites);
  }
  textIntents(
    comp,
    clips.filter((clip) => clip.value.intent.startsWith("text-")),
    sites,
  );
  return sites;
}
