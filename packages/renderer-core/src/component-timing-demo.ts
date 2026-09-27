import {
  ComponentDefinitionSchema,
  type ComponentDefinition,
} from "../../scene-contract/src/components.ts";
import type { ReusableDemo } from "../../scene-contract/src/reusable-component-demo.ts";
import { sequenceComponents } from "./component-sequence.ts";
import { instantiateComponent } from "./component-instances.ts";
import {
  drawComponent,
  fitComponentText,
  maskComponent,
  pinComponent,
  showComponentDuring,
  stepComponentState,
  travelComponentPath,
} from "./component-behaviors.ts";

type Settings = Extract<ReusableDemo, { schemaVersion: "reusable-demo-3" }>;
export function timingDemo(
  settings: Settings,
  font: ComponentDefinition["fonts"][number],
  asset: ComponentDefinition["assets"][number],
) {
  const composed = ["detail-sequence", "supply-sequence"].includes(
    settings.example,
  );
  const sequence = composed || settings.example === "sequence";
  const pinned = composed || settings.example === "pin";
  const fitted = composed || settings.example === "text-fit";
  const masked = composed || settings.example === "mask";
  const symbolic =
    settings.example === "supply-sequence" || settings.mode === "story";
  const duration = settings.clipDuration;
  const animated =
    composed || ["pin", "mask", "text-fit"].includes(settings.example);
  const window = { start: 0, end: 35, easing: "in-out-sine" as const };
  const definition = (index: number) => {
    const text =
      index === 1 || !sequence
        ? settings.middleText === "Second marker"
          ? "A closer look at the supplied detail"
          : settings.middleText
        : symbolic
          ? `Phase ${index + 1} · the shared route`
          : `Detail ${index + 1} · the supplied image`;
    const draw = masked
      ? drawComponent("aperture", "mask", 0.2, 1, window)
      : undefined;
    return ComponentDefinitionSchema.parse({
      schemaVersion: "component-3",
      bounds: { x: 0, y: 0, width: 500, height: 300 },
      fonts: [font],
      assets: [asset],
      exports: { subject: "detail", label: "caption", badge: "badge" },
      nodes: [
        {
          id: "detail",
          type: "group",
          width: 220,
          height: 190,
          origin: [0, 0],
        },
        {
          id: "paper",
          parent: "detail",
          type: "rect",
          width: 220,
          height: 190,
          radius: 10,
          fill: "#E5E0D4",
        },
        {
          id: "image",
          parent: "detail",
          type: "image",
          x: 10,
          y: 10,
          width: 200,
          height: 170,
          fit: "contain",
          states: [
            { asset: asset.id },
            {
              asset: asset.id,
              crop: [
                asset.width * 0.15,
                asset.height * 0.1,
                asset.width * 0.7,
                asset.height * 0.7,
              ],
            },
          ],
        },
        ...(symbolic && composed
          ? [
              {
                id: "route",
                parent: "detail",
                type: "path",
                x: 15,
                y: 140,
                points: [
                  [0, 0],
                  [60, -35],
                  [150, 0],
                ],
                stroke: "#477D65",
                lineWidth: 6,
              },
              {
                id: "resource",
                parent: "detail",
                type: "rect",
                width: 12,
                height: 12,
                radius: 6,
                fill: "#AA5A44",
              },
            ]
          : []),
        {
          id: "badge",
          type: "text",
          x: 244,
          y: 30,
          width: 220,
          height: 100,
          origin: [0, 0],
          text: symbolic ? `Phase ${index + 1}` : `Detail ${index + 1}`,
          color: "#477D65",
          fontAsset: font.id,
          fontSize: 42,
          textBox: { locale: "en", maxLines: 2, lineHeight: 1.2 },
        },
        {
          id: "caption",
          type: "text",
          y: 220,
          width: 480,
          height: 110,
          origin: [0, 0],
          text,
          ...(fitted
            ? {
                states: [
                  text,
                  symbolic
                    ? "เส้นทางร่วมกัน · shared route"
                    : "The same image, a different view",
                ],
              }
            : {}),
          color: "#233B32",
          fontAsset: font.id,
          fontSize: fitted ? settings.maxSize : 36,
          textBox: { locale: "th", maxLines: 2, lineHeight: 1.2 },
        },
        ...(masked
          ? [
              {
                id: "mask",
                type: "rect",
                width: 220,
                height: 190,
                origin: [0, 0],
                radius: 45,
                fill: "#8F2FE0",
              },
            ]
          : []),
      ],
      motions: pinned
        ? [{ id: "rise", node: "detail", property: "y", to: -24, window }]
        : [],
      componentData: {
        schemaVersion: "scene-components-3",
        values: draw?.values ?? [],
        bindings: draw?.bindings ?? [],
        visibility:
          !sequence && settings.example === "visibility"
            ? ["detail", "badge", "caption"].map((target) =>
                showComponentDuring({
                  id: "show-" + target,
                  target,
                  window: {
                    start: settings.clipStart,
                    end: settings.clipStart + duration,
                  },
                }),
              )
            : [],
        pins: pinned
          ? [
              pinComponent({
                id: "badge-pin",
                target: "badge",
                anchor: {
                  node: "detail",
                  point: [220, 30],
                  offset: [settings.anchorX, settings.anchorY],
                },
              }),
            ]
          : [],
        textFits: fitted
          ? [
              fitComponentText({
                target: "caption",
                minSize: settings.minSize,
                maxSize: settings.maxSize,
              }),
            ]
          : [],
        masks: masked
          ? [
              maskComponent({
                target: "detail",
                mask: "mask",
                invert: settings.invert,
              }),
            ]
          : [],
        states: animated
          ? [
              stepComponentState({
                id: "crop",
                target: "image",
                initial: 0,
                cuts: [{ id: "crop-change", frame: 24, state: 1 }],
              }),
              ...(fitted
                ? [
                    stepComponentState({
                      id: "caption-state",
                      target: "caption",
                      initial: 0,
                      cuts: [{ id: "caption-change", frame: 24, state: 1 }],
                    }),
                  ]
                : []),
            ]
          : [],
        travels:
          symbolic && composed
            ? [
                travelComponentPath({
                  id: "journey",
                  target: "resource",
                  path: "route",
                  from: 0,
                  to: 1,
                  window,
                }),
              ]
            : [],
      },
    });
  };
  if (!sequence)
    return [
      instantiateComponent(definition(0), { id: "timing", offset: [680, 690] }),
    ];
  const secondStart = settings.clipStart + duration + 12 + settings.middleDelay;
  const thirdStart =
    settings.example === "detail-sequence"
      ? secondStart + duration - Math.min(12, duration)
      : undefined;
  return sequenceComponents(
    {
      fps: settings.fps,
      frameCount: settings.fps * 8,
      consumer: settings.mode === "story" ? "story" : "commerce",
    },
    [0, 1, 2].map((index) => ({
      definition: definition(index),
      id: "phase" + (index + 1),
      duration,
      ...(index === 0
        ? { start: settings.clipStart }
        : index === 1
          ? { start: secondStart }
          : thirdStart === undefined
            ? {}
            : { start: thirdStart }),
      offset: [150 + 550 * index, 690] as [number, number],
    })),
  );
}
