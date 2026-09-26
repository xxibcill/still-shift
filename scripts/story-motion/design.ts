import type { z } from "zod";
import type { PreparedNodeSchema } from "../../packages/scene-contract/src/prepared.ts";
import type {
  StoryRecipeSchema,
  StoryScene,
  StoryWindow,
} from "../../packages/scene-contract/src/story.ts";
import { palette } from "./art.ts";

type Node = z.input<typeof PreparedNodeSchema>;
type Extra = Partial<Node>;
export type MotionDesign = {
  id: string;
  title: string;
  description: string;
  essentialText: string[];
  focalGroups?: { id: string; nodes: string[] }[];
  nodes: Node[];
  recipe: z.input<typeof StoryRecipeSchema>;
  connectors?: StoryScene["connectors"];
  motionGrammar?: StoryScene["motionGrammar"];
  camera?: StoryScene["camera"];
  flows?: StoryScene["flows"];
};
export const typeScale = {
  label: 56,
  qualifier: 52,
  subheading: 64,
  section: 72,
} as const;
export const cue = (
  start: number,
  end: number,
  cue: string,
  easing: StoryWindow["easing"] = "out-cubic",
) => ({
  start,
  end,
  cue,
  easing,
});
export const group = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  extra: Extra = {},
): Node => ({ id, type: "group", x, y, width, height, ...extra }) as Node;
export const text = (
  id: string,
  value: string,
  x: number,
  y: number,
  size: number = typeScale.label,
  extra: Extra = {},
): Node =>
  ({
    id,
    type: "text",
    text: value,
    x,
    y,
    fontSize: size,
    color: palette.ink,
    fontAsset: size >= 94 ? "display" : "label",
    ...extra,
  }) as Node;
export const rect = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  extra: Extra = {},
): Node => ({ id, type: "rect", x, y, width, height, fill, ...extra }) as Node;
export const path = (id: string, points: number[][], extra: Extra = {}): Node =>
  ({
    id,
    type: "path",
    points,
    stroke: palette.field,
    lineWidth: 5,
    ...extra,
  }) as Node;
export function art(
  id: string,
  asset: string,
  x: number,
  y: number,
  width: number,
  height: number,
  extra: Extra & { shadow: true },
): Node[];
export function art(
  id: string,
  asset: string,
  x: number,
  y: number,
  width: number,
  height: number,
  extra?: Extra,
): Node;
export function art(
  id: string,
  asset: string,
  x: number,
  y: number,
  width: number,
  height: number,
  extra: Extra & { shadow?: boolean } = {},
): Node | Node[] {
  const { shadow, ...attributes } = extra;
  if (shadow)
    return [
      group(id, x, y, width, height, { ...attributes, origin: [0.5, 1] }),
      art(`${id}-shadow`, `${asset}-shadow`, 0, 0, width, height, {
        parent: id,
        origin: [0.5, 1],
      }),
      art(`${id}-art`, `${asset}-body`, 0, 0, width, height, {
        parent: id,
        origin: [0.5, 1],
      }),
    ];
  return {
    id,
    type: "image",
    x,
    y,
    width,
    height,
    states: [{ asset }],
    ...attributes,
  } as Node;
}

export function strips(
  id: string,
  asset: string,
  x: number,
  y: number,
  width: number,
  height: number,
  count = 3,
): Node[] {
  if (!Number.isInteger(count) || count < 1 || count > 12)
    throw new Error("Strip count must be 1–12");
  const stripWidth = width / count;
  return [
    group(id, x, y, width, height),
    ...Array.from({ length: count }, (_, i) => [
      group(`${id}-strip-${i}`, stripWidth * i, 0, stripWidth, height, {
        parent: id,
        clip: true,
      }),
      art(`${id}-part-${i}`, asset, -stripWidth * i, 0, width, height, {
        parent: `${id}-strip-${i}`,
      }),
    ]).flat(),
  ];
}
export const bind = (
  path: string,
  from: string,
  a: [number, number],
  to: string,
  b: [number, number],
  bend = 0,
) => ({
  path,
  from: { node: from, point: a },
  to: { node: to, point: b },
  ...(bend ? { bend } : {}),
});
export const paper = () => art("paper", "paper", 0, 0, 1920, 1080);
export const ground = (y = 780, overscan = false) =>
  art(
    "ground",
    "ground",
    overscan ? -160 : 0,
    y,
    overscan ? 2240 : 1920,
    1080 - y,
    { fit: "stretch" },
  );
export function household(
  id: string,
  x: number,
  y: number,
  width: number,
  extra: Extra & { shadow: true },
): Node[];
export function household(
  id: string,
  x: number,
  y: number,
  width: number,
  extra?: Extra,
): Node;
export function household(
  id: string,
  x: number,
  y: number,
  width: number,
  extra: Extra & { shadow?: boolean } = {},
): Node | Node[] {
  return extra.shadow
    ? art(id, "house", x, y, width, (width * 440) / 600, {
        ...extra,
        shadow: true,
      })
    : art(id, "house", x, y, width, (width * 440) / 600, extra);
}
export const subject = (
  id: string,
  asset: string,
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  labelSize: number = typeScale.label,
  parent?: string,
): Node[] => [
  group(id, x, y, width, height + 88, parent ? { parent } : {}),
  art(`${id}-art`, asset, 0, 0, width, height, { parent: id }),
  text(`${id}-label`, label, width / 2, height + 20, labelSize, {
    parent: id,
    align: "center",
    fontAsset: "label-strong",
  }),
];
export const relation = (id: string, extra: Extra = {}) =>
  path(
    id,
    [
      [0, 0],
      [1, 1],
    ],
    { lineWidth: 32, lineStyle: "brush", ...extra },
  );
