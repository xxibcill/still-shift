import type {
  CommerceScene,
  StoryScene,
  CompositionLayer,
  PreparedNode,
} from "@still-shift/scene-contract";
import { resolveTextEvents } from "../../typography-events.ts";
import {
  baked,
  bakedState,
  preparedBaseLayer,
  type Samples,
} from "./prepared.ts";

type TextLayer = Extract<CompositionLayer, { type: "text" }>;
type TextNode = Extract<PreparedNode, { type: "text" }>;
const fields = [
  "text",
  "states",
  "fontSize",
  "color",
  "weight",
  "font",
  "fontAsset",
  "align",
  "textRole",
  "textLayout",
  "textBox",
  "revealMode",
  "style",
  "spans",
  "locale",
  "anchor",
  "wrap",
  "orphanFraction",
  "decorations",
  "transition",
  "transitions",
  "feather",
  "lineOverlap",
  "container",
] as const;

/** Keep shaped text as native composition content; the typography renderer owns its layout. */
export function typographyLayer(
  scene: CommerceScene | StoryScene,
  node: TextNode,
  samples: Samples,
): TextLayer {
  const content = Object.fromEntries(
    fields.flatMap((key) =>
      node[key] === undefined ? [] : [[key, node[key]]],
    ),
  ) as Pick<TextLayer, (typeof fields)[number]>;
  const corrections = resolveTextEvents(scene)
    .filter((event) => event.node === node.id && event.verb === "correct")
    .map((event) => ({
      replacement: event.replacement!,
      start: event.start,
      end: event.end,
      ...(event.span ? { span: event.span } : {}),
      ...(event.color ? { color: event.color } : {}),
    }));
  return {
    ...preparedBaseLayer(scene, node, samples),
    ...content,
    type: "text",
    rasterize: "source-colors",
    ...(corrections.length ? { corrections } : {}),
    ...(node.width > 0 && node.height > 0
      ? { size: [node.width, node.height] as [number, number] }
      : {}),
    state: bakedState(samples.map((s) => Math.round(s.state))),
    reveal: baked(samples.map((s) => s.reveal)),
    ...(samples.some((s) => s.stateFrom !== undefined)
      ? {
          stateFrom: bakedState(
            samples.map((s) => Math.round(s.stateFrom ?? s.state)),
          ),
          stateMix: baked(samples.map((s) => s.stateMix ?? 1)),
        }
      : {}),
  };
}
