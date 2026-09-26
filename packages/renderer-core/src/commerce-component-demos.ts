import { SpatialDemoKindSchema } from "../../scene-contract/src/commerce-spatial-demos.ts";
import { buildCommerceSpatialDemo } from "./commerce-spatial-demos.ts";
import { EffectDemoKindSchema } from "../../scene-contract/src/commerce-effects.ts";
import { buildCommerceEffectDemo } from "./commerce-effect-demos.ts";
import {
  ComponentDemoSchema,
  COMPONENT_DEMOS,
  type ComponentDemo,
} from "../../scene-contract/src/commerce-components.ts";
import {
  CommerceSceneSchema,
  type PreparedCommerceAssets,
  type CommerceScene,
} from "../../scene-contract/src/commerce.ts";
import { PreparedNodeSchema } from "../../scene-contract/src/prepared.ts";
import {
  mergeCommerceFragments,
  type CommerceFragment,
} from "./commerce-composition.ts";
import { buildProductLayer } from "./product-layer.ts";
import { buildProductShadow } from "./product-shadow.ts";
import { buildTextBlock } from "./commerce-text.ts";
import { buildPath } from "./commerce-path.ts";
import {
  buildFloatMotion,
  buildTranslateMotion,
  buildFadeMotion,
  buildPathDrawMotion,
} from "./commerce-motion.ts";

export function buildCommerceComponentDemo(
  input: ComponentDemo,
  assets: PreparedCommerceAssets & {
    shadow: PreparedCommerceAssets["product"];
  },
): CommerceScene {
  const options = ComponentDemoSchema.parse(input);
  if (EffectDemoKindSchema.safeParse(options.kind).success)
    return buildCommerceEffectDemo(options, (kind) =>
      buildCommerceComponentDemo({ ...options, kind }, assets),
    );
  if (SpatialDemoKindSchema.safeParse(options.kind).success)
    return buildCommerceSpatialDemo(options, assets, (kind) =>
      buildCommerceComponentDemo({ ...options, kind }, assets),
    );
  const { kind, fps, frameCount } = options;
  const clock = { fps, frameCount };
  const fragments: CommerceFragment[] = [
    { assets: [assets.product], fonts: [assets.font] },
  ];
  const product = buildProductLayer({
    id: "product",
    product: assets.product,
    ...options.product,
  });
  const hasProduct = [
    "product",
    "float",
    "translate",
    "fade",
    "studio",
    "introduction",
    "callout",
  ].includes(kind);
  if (hasProduct) {
    const b = product.bounds;
    const travel = ["float", "studio"].includes(kind) ? options.travel : 0;
    if (
      b.x < 0 ||
      b.x + b.width > 1080 ||
      b.y - travel < 0 ||
      b.y + b.height > 1350
    )
      throw new Error(
        "Keep the product and its full float range inside the frame",
      );
  }
  if (["shadow", "studio"].includes(kind)) {
    const s = options.shadow;
    const shadow = buildProductShadow({
      id: "shadow",
      texture: assets.shadow,
      center: [s.x, s.y],
      width: s.width,
      height: s.height,
      opacity: s.opacity,
    });
    const b = shadow.bounds!;
    if (b.x < 0 || b.y < 0 || b.x + b.width > 1080 || b.y + b.height > 1350)
      throw new Error("Keep the padded shadow inside the frame");
    fragments.push(shadow);
  }
  if (kind === "background")
    fragments.push({
      nodes: [
        PreparedNodeSchema.parse({
          type: "rect",
          id: "background",
          width: 1080,
          height: 1350,
          fill: options.background,
        }),
      ],
    });
  if (kind === "panel")
    fragments.push({
      nodes: [
        PreparedNodeSchema.parse({
          type: "rect",
          id: "panel",
          x: 120,
          y: 460,
          width: 840,
          height: 380,
          radius: 12,
          fill: "#DCE1CF",
        }),
      ],
    });
  if (hasProduct) fragments.push(product);
  if (["float", "studio"].includes(kind))
    fragments.push({
      events: buildFloatMotion(clock, {
        target: product.target,
        restY: product.bounds.y,
        travel: options.travel,
        start: 0,
        end: frameCount - 1,
        cycles: options.cycles,
      }),
    });
  if (["translate", "introduction"].includes(kind))
    fragments.push({
      events: buildTranslateMotion(clock, {
        target: product.target,
        start: 0,
        end: Math.round(fps * 1.1),
        x: { from: -product.bounds.width, to: product.bounds.x },
      }),
    });
  if (kind === "fade")
    fragments.push({
      events: [
        ...buildFadeMotion(clock, {
          target: product.target,
          start: fps,
          end: fps * 2,
          from: 0,
          to: 1,
        }),
        ...buildFadeMotion(clock, {
          target: product.target,
          start: frameCount - fps - 1,
          end: frameCount - 1,
          from: 1,
          to: 0,
        }),
      ],
    });
  if (["text", "introduction", "callout"].includes(kind)) {
    const box =
      kind === "callout"
        ? { x: 72, y: 335, width: 250, height: 180 }
        : { x: 100, y: kind === "text" ? 470 : 80, width: 880, height: 280 };
    fragments.push(
      buildTextBlock({
        id: "message",
        text: options.text,
        font: assets.font,
        locale: options.locale,
        box,
        fontSize: kind === "callout" ? 48 : 64,
        color: "#403C32",
      }),
    );
    if (kind !== "text")
      fragments.push({
        events: buildFadeMotion(clock, {
          target: "message",
          start: fps,
          end: fps * 2,
          from: 0,
          to: 1,
        }),
      });
  }
  if (["path", "callout"].includes(kind)) {
    const b = product.bounds;
    const target: [number, number] = [
      b.x + b.width * 0.5,
      b.y + b.height * 0.12,
    ];
    const points: [number, number][] =
      kind === "path"
        ? [
            [220, 780],
            [540, 780],
            [820, 490],
          ]
        : [[322, 376], [400, 376], target];
    fragments.push(
      buildPath({
        id: "connector",
        points,
        stroke: "#758466",
        lineWidth: 3,
        ...(kind === "callout"
          ? {
              protectedRegion: {
                x: b.x + b.width * 0.37,
                y: b.y + b.height * 0.43,
                width: b.width * 0.255,
                height: b.height * 0.165,
              },
            }
          : {}),
      }),
    );
    fragments.push({
      events: buildPathDrawMotion(clock, {
        target: "connector",
        start: fps,
        end: fps * 2,
        from: 0,
        to: 1,
      }),
    });
  }
  const fields = mergeCommerceFragments(clock, fragments);
  return CommerceSceneSchema.parse({
    schemaVersion: "commerce-scene-1",
    title: COMPONENT_DEMOS.find((d) => d.id === kind)!.name,
    ...clock,
    width: 1080,
    height: 1350,
    background: options.background,
    ...fields,
    recipe: { preset: "H03" },
    provenance:
      "Fictional SAMPLE 01 engineering demonstration; supplied intact image reused without alteration.",
    metadata: {
      registration: { status: "experimental" },
      catalogVersion: "1.0",
      selection: { kind: "format", id: "H03" },
      profile: "feed",
      productId: "sample-01",
      productSource: "Existing fictional intact SAMPLE 01 PNG",
      copySource: options.text,
      claimSources:
        kind === "callout"
          ? ["Cap visibly attached in the supplied demonstration image"]
          : [],
      locale: options.locale,
      protectedRegion: [
        product.bounds.x + product.bounds.width * 0.37,
        product.bounds.y + product.bounds.height * 0.43,
        product.bounds.width * 0.255,
        product.bounds.height * 0.165,
      ],
    },
  });
}
