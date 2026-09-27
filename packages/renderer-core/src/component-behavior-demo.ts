import { ComponentDefinitionSchema } from "../../scene-contract/src/components.ts";
import type { ComponentDefinition } from "../../scene-contract/src/components.ts";
type PreparedFont = ComponentDefinition["fonts"][number];
type PreparedAsset = ComponentDefinition["assets"][number];
import type { ReusableDemo } from "../../scene-contract/src/reusable-component-demo.ts";
import {
  scaleComponent,
  rotateComponent,
  drawComponent,
  stepComponentState,
  travelComponentPath,
} from "./component-behaviors.ts";

/** Existing supplied assets, authored crops and symbolic captions; no generated evidence or claims. */
export function behaviorDemo(
  settings: Extract<ReusableDemo, { schemaVersion: "reusable-demo-2" }>,
  font: PreparedFont,
  asset: PreparedAsset,
) {
  const composed = settings.example === "tour" || settings.example === "supply";
  const transform = composed || settings.example === "transform";
  const state = composed || settings.example === "state";
  const travel = composed || settings.example === "travel";
  const end = settings.fps * 7,
    cut = settings.cutFrame;
  const window = { start: settings.fps, end, easing: "in-out-sine" as const };
  const draw = drawComponent(
    "draw",
    "route",
    settings.drawFrom,
    settings.drawTo,
    { start: 6, end: settings.fps * 2, easing: "linear" },
  );
  const symbolic = settings.example === "supply" || settings.mode === "story";
  return ComponentDefinitionSchema.parse({
    schemaVersion: "component-2",
    bounds: {
      x: 0,
      y: 0,
      width: 1500,
      height: settings.mode === "story" ? 700 : 600,
    },
    fonts: [font],
    assets: [asset],
    exports: {
      subject: "detail",
      caption: "caption",
      route: "route",
      marker: "marker",
    },
    nodes: [
      {
        type: "group",
        id: "detail",
        x: 1090,
        y: settings.mode === "story" ? 390 : 160,
        width: 260,
        height: 260,
      },
      {
        type: "rect",
        id: "panel",
        parent: "detail",
        width: 260,
        height: 260,
        fill: "#E5E0D4",
        radius: 16,
      },
      {
        type: "image",
        id: "inset",
        parent: "detail",
        x: 18,
        y: 18,
        width: 224,
        height: 224,
        fit: "contain",
        states: [
          { asset: asset.id },
          {
            asset: asset.id,
            crop: [
              asset.width * 0.2,
              asset.height * 0.1,
              asset.width * 0.6,
              asset.height * 0.6,
            ],
          },
        ],
      },
      {
        type: "text",
        id: "caption",
        x: settings.mode === "story" ? 60 : 770,
        y: settings.mode === "story" ? 580 : 465,
        width: 730,
        height: 110,
        text: symbolic ? "Route A · overview" : "Product · overview",
        states: symbolic
          ? [
              "Route A · overview",
              settings.middleText === "Second marker"
                ? "Route B · detail"
                : settings.middleText,
            ]
          : [
              "Product · overview",
              settings.middleText === "Second marker"
                ? "Product · detail crop"
                : settings.middleText,
            ],
        fontAsset: font.id,
        fontSize: 38,
        color: "#233B32",
        textBox: { locale: "en", maxLines: 2, lineHeight: 1.25 },
      },
      {
        type: "group",
        id: "route-plane",
        x: 80,
        y: 340,
        width: 980,
        height: 140,
        origin: [0, 0],
      },
      {
        type: "path",
        id: "route",
        parent: "route-plane",
        points: [
          [0, 100],
          [260, 100],
          [510, 20],
          [980, 20],
        ],
        stroke: "#477D65",
        lineWidth: 5,
      },
      {
        type: "rect",
        id: "marker",
        width: 28,
        height: 28,
        radius: 14,
        fill: "#A65E46",
        origin: [0.5, 0.5],
        x: 66,
        y: 426,
        opacity: travel ? 1 : 0,
      },
    ],
    motions: transform
      ? [
          scaleComponent("grow", "detail", settings.scale, window),
          rotateComponent("turn", "detail", settings.rotation, window),
        ]
      : [],
    componentData: {
      schemaVersion: "scene-components-2",
      annotations: [],
      values: transform ? draw.values : [],
      bindings: transform ? draw.bindings : [],
      states: state
        ? [
            stepComponentState({
              id: "image-states",
              target: "inset",
              initial: 0,
              cuts: [{ id: "image-change", frame: cut, state: 1 }],
            }),
            stepComponentState({
              id: "caption-states",
              target: "caption",
              initial: 0,
              cuts: [{ id: "caption-change", frame: cut, state: 1 }],
            }),
          ]
        : [],
      travels: travel
        ? [
            travelComponentPath({
              id: "journey",
              target: "marker",
              path: "route",
              from: settings.travelFrom,
              to: settings.travelTo,
              window,
            }),
          ]
        : [],
    },
  });
}
