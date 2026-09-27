import {
  ComponentDefinitionSchema,
  type ComponentDefinition,
} from "../../scene-contract/src/components.ts";
import {
  ComponentNumberFormatSchema,
  type ComponentAnchor,
} from "../../scene-contract/src/component-data.ts";
import type { z } from "zod";

type Style = {
  color: string;
  accent: string;
  font: ComponentDefinition["fonts"][number];
};
/** Authored boxes, not animated collision or silhouette bounds. */
export function labeledMarker(
  options: Style & {
    text: string;
    width: number;
    height: number;
    fontSize: number;
    duration: number;
  },
): ComponentDefinition {
  const { width, height } = options;
  return ComponentDefinitionSchema.parse({
    schemaVersion: "component-1",
    fonts: [options.font],
    bounds: { x: 0, y: 0, width, height: height + 18 },
    exports: { subject: "body", label: "label", mark: "mark" },
    nodes: [
      { id: "body", type: "group", width, height, y: 18, opacity: 0 },
      {
        id: "mark",
        parent: "body",
        type: "rect",
        width: 10,
        height: height - 16,
        fill: options.accent,
      },
      {
        id: "label",
        parent: "body",
        type: "text",
        x: 24,
        width: width - 24,
        height,
        text: options.text,
        fontAsset: options.font.id,
        fontSize: options.fontSize,
        color: options.color,
        textBox: { locale: "en", maxLines: 2, lineHeight: 1.25 },
      },
    ],
    motions: [
      {
        id: "rise",
        node: "body",
        property: "y",
        to: 0,
        window: { start: 0, end: options.duration, easing: "out-cubic" },
      },
      {
        id: "appear",
        node: "body",
        property: "opacity",
        to: 1,
        window: { start: 0, end: options.duration, easing: "linear" },
      },
    ],
  });
}

const anchor = (
  node: string,
  point: [number, number],
  offset: [number, number] = [0, 0],
) => ({ node, point, offset, space: "node" as const });
function annotation(
  points: ComponentAnchor[],
  externals: string[],
  color: string,
  bounds: ComponentDefinition["bounds"],
  protect: string[] = [],
): ComponentDefinition {
  return ComponentDefinitionSchema.parse({
    schemaVersion: "component-1",
    bounds,
    exports: { path: "line" },
    externals,
    nodes: [
      {
        id: "line",
        type: "path",
        points: [
          [0, 0],
          [1, 1],
        ],
        stroke: color,
        lineWidth: 3,
      },
    ],
    componentData: {
      schemaVersion: "scene-components-1",
      annotations: [{ path: "line", points, protect }],
    },
  });
}

export function boundsHighlight(options: {
  width: number;
  height: number;
  padding?: number;
  kind: "outline" | "underline";
  color: string;
}): ComponentDefinition {
  const p = options.padding ?? 8,
    w = options.width,
    h = options.height;
  if (
    ![w, h].every((v) => Number.isFinite(v) && v > 0) ||
    !Number.isFinite(p) ||
    p < 0
  )
    throw new Error("Highlight needs positive bounds and nonnegative padding");
  const points: [number, number][] =
    options.kind === "underline"
      ? [
          [-p, h + p],
          [w + p, h + p],
        ]
      : [
          [-p, -p],
          [w + p, -p],
          [w + p, h + p],
          [-p, h + p],
          [-p, -p],
        ];
  return annotation(
    points.map((point) => anchor("target", point)),
    ["target"],
    options.color,
    { x: -p, y: -p, width: w + 2 * p, height: h + 2 * p },
  );
}

export function rangeBracket(options: {
  from: [number, number];
  to: [number, number];
  offset: number;
  tick: number;
  color: string;
  bounds: ComponentDefinition["bounds"];
}): ComponentDefinition {
  if (
    ![...options.from, ...options.to, options.offset, options.tick].every(
      Number.isFinite,
    ) ||
    options.tick <= 0
  )
    throw new Error("Bracket requires finite points and positive tick");
  const { from, to, offset, tick } = options;
  return annotation(
    [
      anchor("from", from, [0, offset - tick]),
      anchor("from", from, [0, offset]),
      anchor("to", to, [0, offset]),
      anchor("to", to, [0, offset - tick]),
    ],
    ["from", "to"],
    options.color,
    options.bounds,
  );
}

/** The target must be an explicitly authored group. Text inherits its transform; no grouping is inserted. */
export function leaderLabel(
  options: Style & {
    text: string;
    box: { x: number; y: number; width: number; height: number };
    point: [number, number];
    fontSize: number;
  },
): ComponentDefinition {
  const { box } = options;
  const result = annotation(
    [anchor("label", [0, box.height / 2]), anchor("target", options.point)],
    ["target"],
    options.accent,
    box,
  );
  return ComponentDefinitionSchema.parse({
    ...result,
    fonts: [options.font],
    exports: { ...result.exports, label: "label" },
    nodes: [
      ...result.nodes,
      {
        id: "label",
        type: "text",
        parent: "target",
        ...box,
        text: options.text,
        fontSize: options.fontSize,
        color: options.color,
        fontAsset: options.font.id,
        textBox: { locale: "en", maxLines: 2, lineHeight: 1.25 },
      },
    ],
  });
}

export function scalarDisplay(
  options: Style & {
    from: number;
    to: number;
    range: [number, number];
    width: number;
    window: { start: number; end: number };
    format?: z.input<typeof ComponentNumberFormatSchema>;
  },
): ComponentDefinition {
  const format = ComponentNumberFormatSchema.parse(options.format ?? {});
  return ComponentDefinitionSchema.parse({
    schemaVersion: "component-1",
    fonts: [options.font],
    bounds: { x: 0, y: 0, width: options.width, height: 140 },
    exports: { label: "number", bar: "bar" },
    nodes: [
      {
        id: "number",
        type: "text",
        text: "0",
        width: options.width,
        height: 80,
        fontAsset: options.font.id,
        fontSize: 52,
        color: options.color,
        textBox: { locale: "en", maxLines: 1, lineHeight: 1.25 },
      },
      {
        id: "track",
        type: "rect",
        y: 96,
        width: options.width,
        height: 24,
        fill: options.color,
        opacity: 0.12,
      },
      {
        id: "bar",
        type: "rect",
        y: 96,
        width: options.width,
        height: 24,
        fill: options.accent,
      },
    ],
    componentData: {
      schemaVersion: "scene-components-1",
      values: [
        {
          id: "amount",
          range: options.range,
          from: options.from,
          to: options.to,
          window: { ...options.window, easing: "linear", cue: "amount" },
        },
      ],
      bindings: [
        { kind: "text", value: "amount", target: "number", format },
        {
          kind: "property",
          value: "amount",
          target: "bar",
          property: "reveal",
          output: [0, 1],
        },
      ],
    },
  });
}
