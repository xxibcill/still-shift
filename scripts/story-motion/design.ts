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
  nodes: Node[];
  recipe: z.input<typeof StoryRecipeSchema>;
  connectors?: StoryScene["connectors"];
};
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
  size = 48,
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
    fontAsset: size >= 62 ? "display" : "label",
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
export const art = (
  id: string,
  asset: string,
  x: number,
  y: number,
  width: number,
  height: number,
  extra: Extra = {},
): Node =>
  ({
    id,
    type: "image",
    x,
    y,
    width,
    height,
    states: [{ asset }],
    ...extra,
  }) as Node;
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
export const ground = (y = 780) =>
  art("ground", "ground", 0, y, 1920, 1080 - y, { fit: "stretch" });
export const household = (
  id: string,
  x: number,
  y: number,
  width: number,
  extra: Extra = {},
) => art(id, "house", x, y, width, (width * 440) / 600, extra);
export const subject = (
  id: string,
  asset: string,
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Node[] => [
  group(id, x, y, width, height + 80),
  art(`${id}-art`, asset, 0, 0, width, height, { parent: id }),
  text(`${id}-label`, label, width / 2, height + 12, 48, {
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
