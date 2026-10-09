import { compositionSourceFixture } from "./composition-source-fixture.ts";
import { RichTypographyParamsSchema } from "../../packages/renderer-core/src/composition/adapters/numeric-typography.ts";

export const COMPOSITION_TINT_VARIANTS = [
  "colors",
  "axes",
  "correction",
  "state-mix",
] as const;
export type CompositionTintVariant = (typeof COMPOSITION_TINT_VARIANTS)[number];

/** Real evaluated colours, variable native/provider glyphs and replacement glyph sources. */
export async function compositionTintFixture(
  software: boolean,
  variant: CompositionTintVariant,
) {
  const fixture = await compositionSourceFixture(software, false);
  const { composition } = fixture;
  const scope = composition.precomps![0]!;
  const native = scope.layers.find((layer) => layer.type === "text")!;
  const provider = scope.layers.find((layer) => layer.type === "provider")!;
  if (native.type !== "text" || provider.type !== "provider")
    throw Error("Missing typography fixture layers");
  const data = RichTypographyParamsSchema.parse(provider.params);
  native.state = {
    keys: [
      { frame: 0, value: 0 },
      { frame: 4, value: 1 },
    ],
  };
  native.color = {
    keys: [
      { frame: 0, value: "#d8b46680" },
      { frame: 7, value: "#5599aa44" },
    ],
  };
  if (variant === "colors") {
    composition.frameCount = scope.frameCount = data.frameCount = 24;
    const moving = composition.layers.find((layer) => layer.id === "moving")!;
    moving.transform = {
      ...moving.transform,
      position: {
        keys: [
          { frame: 0, value: [2.25, 1.35] },
          { frame: 23, value: [134.45, 51.25] },
        ],
      },
    };
    native.color = {
      keys: [
        { frame: 0, value: "#d8b46680" },
        { frame: 23, value: "#5599aa44" },
      ],
    };
    data.appearance = {
      color: Array.from(
        { length: 24 },
        (_, frame) =>
          `#${(0x224455 + frame * 0x030201).toString(16).padStart(6, "0")}`,
      ),
    };
    scope.textAnimators = scope.textAnimators!.map((animator) => ({
      ...animator,
      end: 24,
      from: { strokeWidth: 1, stroke: "#113355" },
      to: { strokeWidth: 1, stroke: "#557799" },
    }));
  } else if (variant === "axes") {
    composition.assets.push({
      id: "thai",
      type: "font",
      path: "/assets/ecommerce-motion/fonts/noto-sans-thai.ttf",
      sha256:
        "sha256:5a1c559bb539583c8a1fd99d1c5b9491e5e14478c9cd2bd0970d5c3096cc9ef8",
      weight: "400",
      variable: {
        wght: { min: 100, default: 400, max: 900 },
        wdth: { min: 62.5, default: 100, max: 100 },
      },
    });
    native.fontAsset = data.node.fontAsset = "thai";
    native.fontSize = data.node.fontSize = 20;
    native.text = "ไทย";
    native.states = ["ไทย", "เวลา"];
    data.node.text = "ดี";
    provider.assets = ["thai"];
    scope.textAnimators = [
      {
        node: "native",
        unit: "glyph",
        start: 0,
        end: 8,
        stagger: 0,
        selector: { start: 0, end: 1 },
        from: { axes: { wdth: -30, wght: 200 } },
        to: { axes: { wdth: 0, wght: 0 } },
      },
    ];
    data.textAnimators = [
      {
        node: "provider",
        unit: "glyph",
        start: 0,
        end: 8,
        stagger: 0,
        selector: { start: 0, end: 1 },
        from: { axes: { wdth: -20, wght: 100 }, fill: "#cc8855" },
        to: { axes: { wdth: 0, wght: 0 }, fill: "#5577aa" },
      },
    ];
  } else if (variant === "correction") {
    data.node.text = "old";
    data.textEvents = [
      {
        id: "repair",
        node: "provider",
        verb: "correct",
        replacement: "new",
        color: "#aa5533",
        at: 0,
        duration: 6,
      },
    ];
  }
  if (variant === "state-mix") {
    native.stateFrom = 0;
    native.stateMix = {
      keys: [
        { frame: 0, value: 0 },
        { frame: 7, value: 1 },
      ],
    };
    data.node.states = ["77", "88"];
    provider.state = {
      keys: [
        { frame: 0, value: 0 },
        { frame: 4, value: 1 },
      ],
    };
    provider.stateFrom = 0;
    provider.stateMix = native.stateMix;
  }
  provider.params = JSON.parse(JSON.stringify(data));
  return fixture;
}
