import { SpatialDemoSettingsSchema } from "../../scene-contract/src/commerce-spatial-demos.ts";
import {
  COMPONENT_DEMOS,
  type ComponentDemo,
} from "../../scene-contract/src/commerce-components.ts";
import {
  CommerceSceneSchema,
  COMMERCE_PROFILES,
  type CommerceScene,
  type PreparedCommerceAssets,
} from "../../scene-contract/src/commerce.ts";
import { PreparedNodeSchema } from "../../scene-contract/src/prepared.ts";
import {
  buildScaleMotion,
  buildRotateMotion,
  buildFadeMotion,
  buildTranslateMotion,
} from "./commerce-motion.ts";
import { buildPath } from "./commerce-path.ts";
import { buildTextBlock } from "./commerce-text.ts";
import { buildDetailWindow } from "./commerce-detail.ts";
import { buildFittedTextPanel, stackBoxes } from "./commerce-layout.ts";
import {
  mergeCommerceFragments,
  type CommerceFragment,
} from "./commerce-composition.ts";
import { sequenceCommerceFragments } from "./commerce-sequence.ts";
export function buildCommerceSpatialDemo(
  options: ComponentDemo,
  assets: PreparedCommerceAssets & {
    shadow: PreparedCommerceAssets["product"];
  },
  base: (kind: ComponentDemo["kind"]) => CommerceScene,
): CommerceScene {
  const settings = SpatialDemoSettingsSchema.parse(options.spatial ?? {}),
    { kind, fps, frameCount } = options,
    clock = { fps, frameCount };
  let scene = base(
    ["anchor", "attachment", "sequence"].includes(kind) ? "float" : "product",
  );
  const product = scene.nodes.find((n) => n.id === "product")!;
  product.origin = [0.5, 0.82];
  const w = assets.product.width,
    h = assets.product.height;
  const geometry = {
    node: "product-art",
    asset: assets.product.id,
    sha256: assets.product.sha256,
    visibleBounds: [w * 0.28, h * 0.055, w * 0.445, h * 0.89] as [
      number,
      number,
      number,
      number,
    ],
    anchors: {
      cap: [settings.anchor[0] * w, settings.anchor[1] * h] as [number, number],
    },
    protectedRegions: [
      [w * 0.37, h * 0.43, w * 0.255, h * 0.165] as [
        number,
        number,
        number,
        number,
      ],
    ],
  };
  const fragments: CommerceFragment[] = [{ ...scene, geometry: [geometry] }];
  const text = (
    id: string,
    copy: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fontSize = 44,
  ) =>
    buildTextBlock({
      id,
      text: copy,
      box: { x, y, width, height },
      font: assets.font,
      locale: options.locale,
      fontSize,
      color: "#403C32",
    });
  if (kind === "anchor" || kind === "scale")
    fragments.push({
      events: buildScaleMotion(clock, {
        target: "product",
        start: 0,
        end: Math.round(frameCount * 0.65),
        from: 1,
        to: settings.scale,
        easing: "smoothstep",
      }),
    });
  if (kind === "anchor" || kind === "rotate")
    fragments.push({
      events: buildRotateMotion(clock, {
        target: "product",
        start: 0,
        end: Math.round(frameCount * 0.65),
        from: 0,
        to: settings.rotation,
        easing: "smoothstep",
      }),
    });
  if (kind === "anchor") {
    for (const [id, offsets] of [
      [
        "marker-x",
        [
          [-10, 0],
          [10, 0],
        ],
      ],
      [
        "marker-y",
        [
          [0, -10],
          [0, 10],
        ],
      ],
    ] as const) {
      fragments.push(
        buildPath({
          id,
          points: [
            [0, 0],
            [1, 1],
          ],
          stroke: "#496B52",
          lineWidth: 4,
        }),
      );
      fragments.push({
        attachments: [
          {
            path: id,
            endpoint: "start",
            source: "product-art",
            anchor: "cap",
            offset: [...offsets[0]],
            protect: false,
          },
          {
            path: id,
            endpoint: "end",
            source: "product-art",
            anchor: "cap",
            offset: [...offsets[1]],
            protect: false,
          },
        ],
      });
    }
    fragments.push(
      text("caption", "One point. Always attached.", 100, 1050, 880, 160, 44),
    );
  }
  if (kind === "attachment" || kind === "sequence") {
    fragments.push(text("feature", options.text, 72, 340, 230, 240, 42));
    fragments.push(
      buildPath({
        id: "attached-line",
        points: [
          [315, 375],
          [380, 375],
          [540, 310],
        ],
        stroke: "#758466",
        lineWidth: 3,
      }),
    );
    fragments.push({
      attachments: [
        {
          path: "attached-line",
          endpoint: "end",
          source: "product-art",
          anchor: "cap",
          offset: [0, 0],
          protect: true,
        },
      ],
    });
  }
  if (kind === "detail") {
    fragments.push({
      nodes: [
        PreparedNodeSchema.parse({
          type: "rect",
          id: "detail-panel",
          x: 700,
          y: 220,
          width: 300,
          height: 250,
          fill: "#E1DFD1",
          radius: 16,
        }),
      ],
    });
    fragments.push(
      buildDetailWindow({
        id: "detail-window",
        product: assets.product,
        crop: [w * 0.32, h * 0.04, w * 0.36, h * 0.24],
        box: { x: 725, y: 245, width: 250, height: 200 },
      }),
    );
    fragments.push(text("detail-title", options.text, 720, 500, 280, 260, 38));
    fragments.push({
      events: buildFadeMotion(clock, {
        target: "detail-window",
        start: 0,
        end: fps,
        from: 0,
        to: 1,
      }),
    });
  }
  if (kind === "layout") {
    const { width, height } = COMMERCE_PROFILES[settings.profile];
    const box = stackBoxes(
      { x: 80, y: height * 0.6, width: width - 160, height: height * 0.34 },
      [height * 0.3],
      0,
    )[0]!;
    // Keep a whole product above the message in each format.
    const scale = (height * 0.5) / product.height;
    product.width *= scale;
    product.height *= scale;
    product.x = (width - product.width) / 2;
    product.y = 60;
    const art = scene.nodes.find((n) => n.id === "product-art")!;
    art.width = product.width;
    art.height = product.height;
    fragments.push(
      buildFittedTextPanel({
        id: "fitted-copy",
        text: options.text,
        box,
        font: assets.font,
        locale: options.locale,
        fontSize: 64,
        minSize: 28,
        maxSize: 64,
        maxLines: 5,
        color: "#403C32",
        padding: 24,
        fill: "#DCE1CF",
      }),
    );
    scene = {
      ...scene,
      width,
      height,
      metadata: { ...scene.metadata, profile: settings.profile },
    };
  }
  if (kind === "matte") {
    fragments.push({
      assets: [assets.shadow],
      nodes: [
        PreparedNodeSchema.parse({
          type: "image",
          id: "alpha-mask",
          x: -150,
          y: 300,
          width: 1200,
          height: 680,
          states: [{ asset: assets.shadow.id }],
          fit: "stretch",
        }),
      ],
      mattes: [
        {
          target: "product",
          mask: "alpha-mask",
          invert: settings.invert,
          space: "canvas",
          order: "after-effects",
        },
      ],
      events: buildTranslateMotion(clock, {
        target: "alpha-mask",
        start: 0,
        end: frameCount - 1,
        x: { from: -150, to: 150 },
        easing: "smoothstep",
      }),
    });
    fragments.push(
      text(
        "matte-caption",
        "A soft window through the image.",
        100,
        1080,
        880,
        160,
        40,
      ),
    );
  }
  if (kind === "sequence") {
    const introEnd = Math.round(frameCount * 0.25),
      closeStart = Math.round(frameCount * 0.72);
    const intro = text("intro", options.text, 100, 90, 880, 190, 58),
      close = text(
        "close",
        "SAMPLE 01.\nA closer look.",
        100,
        1030,
        880,
        230,
        52,
      );
    intro.events = buildFadeMotion(
      { fps, frameCount: introEnd },
      {
        target: "intro",
        start: 0,
        end: Math.max(1, introEnd - 1),
        from: 0,
        to: 1,
      },
    );
    const feature = fragments.splice(1);
    const featureMerged = mergeCommerceFragments(clock, feature);
    fragments.push(
      sequenceCommerceFragments(clock, [
        { fragment: intro, start: 0, duration: introEnd },
        {
          fragment: featureMerged,
          start: introEnd,
          duration: closeStart - introEnd,
        },
        {
          fragment: close,
          start: closeStart,
          duration: frameCount - closeStart,
        },
      ]),
    );
  }
  const merged = mergeCommerceFragments(clock, fragments);
  return CommerceSceneSchema.parse({
    ...scene,
    ...merged,
    title: COMPONENT_DEMOS.find((d) => d.id === kind)!.name,
    metadata: {
      ...scene.metadata,
      registration: { status: "experimental" },
      copySource: options.text,
    },
  });
}
