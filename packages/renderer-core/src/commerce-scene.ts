import { buildPath } from "./commerce-path.ts";
import { buildTextBlock } from "./commerce-text.ts";
import {
  buildTranslateMotion,
  buildFadeMotion,
  buildPathDrawMotion,
} from "./commerce-motion.ts";
import { commerceFormatRegistration } from "../../scene-contract/src/commerce-library.ts";
import {
  PreparedNodeSchema,
  type PreparedNode,
} from "../../scene-contract/src/prepared.ts";
import {
  CommerceBriefSchema,
  CommerceSceneSchema,
  COMMERCE_PROFILES,
  type CommerceBrief,
  type CommerceScene,
  type CommerceEvent,
  type PreparedCommerceAssets,
} from "../../scene-contract/src/commerce.ts";
import { requireCommerceCapability } from "../../scene-contract/src/commerce-library.ts";
import { createFrameTracks } from "./frame-tracks.ts";
import type { Tracks } from "./prepared-scene.ts";

import { buildCommerceFloating } from "./commerce-floating.ts";

type Box = { x: number; y: number; width: number; height: number };
type Point = [number, number];
export type CommerceRenderScene = CommerceScene & {
  rendererVersion: "commerce-canvas-0.16.0";
  durationMs: number;
  canvas: { width: number; height: number };
  timeline: { fps: number; durationMs: number; frameCount: number };
  tracks: Record<string, Tracks>;
  followers: Record<string, never>;
};

function layoutFor(brief: CommerceBrief) {
  const { width, height } = COMMERCE_PROFILES[brief.profile];
  const p = Math.round(Math.min(width, height) * brief.safeInset);
  if (brief.artDirection === "studio") {
    if (brief.profile !== "feed")
      throw new Error("The studio cutout layout requires 4:5");
    return {
      width,
      height,
      padding: p,
      headline: { x: p, y: p + 100, width: width - 2 * p, height: 250 },
      headlineSize: 72,
      product: { x: 310, y: 385, width: 780, height: 975 },
      cta: { x: p, y: height - p - 110, width: 400, height: 100 },
      callouts: [
        { x: p, y: 530, width: 290, height: 150 },
        { x: p, y: 790, width: 290, height: 150 },
      ],
      calloutSize: 32,
    };
  }
  if (brief.artDirection === "editorial") {
    if (brief.selection.id !== "H03" || brief.profile !== "feed")
      throw new Error("The editorial photo layout requires H03 in 4:5");
    return {
      width,
      height,
      padding: p,
      headline: { x: p, y: p + 100, width: width - 2 * p, height: 295 },
      headlineSize: 80,
      product: { x: 0, y: 0, width, height },
      cta: { x: p, y: height - p - 110, width: 570, height: 100 },
      callouts: [] as Box[],
      calloutSize: 34,
    };
  }
  if (brief.profile === "feed")
    return {
      width,
      height,
      padding: p,
      headline: {
        x: p,
        y: Math.max(160, p + 110),
        width: width - 2 * p,
        height: 220,
      },
      headlineSize: 66,
      product: { x: 435, y: 410, width: 535, height: 710 },
      cta: { x: p, y: height - p - 110, width: width - 2 * p, height: 100 },
      callouts: [
        { x: p, y: 550, width: 310, height: 160 },
        { x: p, y: 820, width: 310, height: 160 },
      ],
      calloutSize: 32,
    };
  const portrait = brief.profile === "portrait";
  const square = brief.profile === "square";
  return {
    width,
    height,
    padding: p,
    headline: portrait
      ? { x: p, y: Math.max(170, p + 110), width: width - p * 2, height: 290 }
      : square
        ? { x: p, y: Math.max(130, p + 110), width: width - p * 2, height: 200 }
        : { x: p, y: Math.max(190, p + 110), width: 800 - p, height: 295 },
    headlineSize: portrait ? 78 : square ? 58 : 88,
    product: portrait
      ? { x: 215, y: 515, width: 650, height: 800 }
      : square
        ? { x: 445, y: 360, width: 520, height: 560 }
        : { x: 1030, y: 150, width: 740, height: 780 },
    cta: {
      x: p,
      y: Math.min(
        height - (portrait ? 220 : square ? 150 : 180),
        height - p - (portrait ? 160 : 130),
      ),
      width: portrait || square ? width - 2 * p : 820,
      height: portrait ? 160 : 130,
    },
    callouts: portrait
      ? [
          { x: p, y: 1380, width: 430, height: 190 },
          { x: 590, y: 1380, width: width - 590 - p, height: 190 },
        ]
      : square
        ? [
            { x: p, y: 410, width: 310, height: 185 },
            { x: p, y: 650, width: 310, height: 185 },
          ]
        : [
            { x: p, y: 525, width: 630, height: 145 },
            { x: p, y: 700, width: 630, height: 145 },
          ],
    calloutSize: square ? 30 : portrait ? 35 : 38,
  };
}

function fitImage(box: Box, asset: PreparedCommerceAssets["product"]): Box {
  const scale = Math.min(box.width / asset.width, box.height / asset.height);
  const width = asset.width * scale,
    height = asset.height * scale;
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
}

function resolveTiming(brief: CommerceBrief, calloutCount: number) {
  const count = brief.frameCount;
  const timing = brief.timing ?? {
    entranceEnd: Math.round(count * 0.17),
    bodyStart: Math.round(count * 0.22),
    closeStart: Math.round(count * (calloutCount ? 0.7 : 0.625)),
    closeEnd: Math.round(count * (calloutCount ? 0.8 : 0.75)),
  };
  if (
    timing.bodyStart < timing.entranceEnd ||
    timing.closeStart <= timing.bodyStart ||
    timing.closeEnd <= timing.closeStart ||
    timing.closeEnd >= count ||
    count - timing.closeEnd < brief.fps ||
    timing.closeStart - timing.bodyStart <
      brief.fps * Math.max(1, calloutCount * 1.5)
  )
    throw new Error(
      "Timing must preserve entrance order, callout reading holds and at least one second for the close",
    );
  return timing;
}

function calloutPoints(
  box: Box,
  image: Box,
  target: Point,
  index: number,
  portrait: boolean,
): Point[] {
  const end: Point = [
    image.x + image.width * target[0],
    image.y + image.height * target[1],
  ];
  if (portrait) {
    const side = index === 0 ? image.x - 30 : image.x + image.width + 30;
    return [
      [box.x + box.width / 2, box.y - 20],
      [side, box.y - 20],
      [side, end[1]],
      end,
    ];
  }
  const side = Math.max(image.x - 30, box.x + box.width + 35);
  return [
    [box.x + box.width + 18, box.y + 24],
    [side, box.y + 24],
    [side, end[1]],
    end,
  ];
}

export function buildCommerceScene(
  value: unknown,
  assets: PreparedCommerceAssets,
): CommerceScene {
  const brief = CommerceBriefSchema.parse(value);
  const capability = requireCommerceCapability(brief.selection);
  const preset = capability.implementation!;
  if (brief.artDirection === "floating")
    return buildCommerceFloating(brief, assets);
  const usesCallouts = preset === "H04" || preset === "A01";
  if (
    (preset !== "H03" || brief.artDirection === "studio") &&
    brief.product.preparation !== "cutout"
  )
    throw new Error(preset + " requires a prepared product cutout");
  if (usesCallouts && brief.copy.callouts.length !== 2)
    throw new Error(
      preset + " requires two sourced callouts with image targets",
    );
  if (!usesCallouts && brief.copy.callouts.length)
    throw new Error(preset + " does not consume callouts; select H04 or A01");
  const layout = layoutFor(brief);
  const product = fitImage(layout.product, assets.product);
  if (
    brief.artDirection === "editorial" &&
    Math.abs(
      assets.product.width / assets.product.height -
        layout.width / layout.height,
    ) > 0.01
  )
    throw new Error(
      "The editorial layout needs a 4:5 photo with space above the product for copy",
    );

  const [rx, ry, rw, rh] = brief.product.protectedRegion;
  const protectedRegion: [number, number, number, number] = [
    product.x + rx * product.width,
    product.y + ry * product.height,
    rw * product.width,
    rh * product.height,
  ];
  const timing = resolveTiming(brief, usesCallouts ? 2 : 0);
  const nodes: PreparedNode[] = [],
    events: CommerceEvent[] = [];
  const add = (value: unknown) => nodes.push(PreparedNodeSchema.parse(value));
  const event = (
    node: string,
    property: CommerceEvent["property"],
    start: number,
    end: number,
    to: number,
    from?: number,
  ) => {
    const window = { target: node, start, end };
    const endpoint = { to, ...(from === undefined ? {} : { from }) };
    if (property === "opacity")
      events.push(...buildFadeMotion(brief, { ...window, ...endpoint }));
    else if (property === "x" || property === "y")
      events.push(
        ...buildTranslateMotion(brief, { ...window, [property]: endpoint }),
      );
    else if (property === "reveal")
      events.push(...buildPathDrawMotion(brief, { ...window, ...endpoint }));
    else
      events.push({
        node,
        property,
        start,
        end,
        ...endpoint,
        easing: "out-cubic",
      });
  };
  const text = (
    id: string,
    content: string,
    box: Box,
    size: number,
    color: string,
    maxLines = 3,
  ) =>
    nodes.push(
      ...buildTextBlock({
        id,
        text: content,
        box,
        font: assets.font,
        locale: brief.locale,
        fontSize: size,
        color,
        maxLines,
      }).nodes!,
    );
  const enter = (id: string, start: number, end: number) =>
    event(id, "opacity", start, end, 1, 0);
  const exit = (id: string, start: number, end: number) =>
    event(id, "opacity", start, end, 0);

  add({
    type: "rect",
    id: "accent",
    x: layout.padding,
    y: layout.padding,
    width: 58,
    height: 7,
    fill: brief.theme.accent,
  });
  text(
    "product-name",
    brief.product.name,
    {
      x: layout.padding,
      y: layout.padding + 31,
      width: layout.width - layout.padding * 2,
      height: 64,
    },
    26,
    brief.theme.muted,
    1,
  );
  add({ type: "group", id: "product", ...product });
  add({
    type: "image",
    id: "product-art",
    parent: "product",
    x: 0,
    y: 0,
    width: product.width,
    height: product.height,
    fit: "contain",
    states: [{ asset: assets.product.id }],
  });
  if (brief.artDirection === "editorial") {
    // Paint the full-frame photograph behind every editable overlay.
    nodes.unshift(...nodes.splice(nodes.length - 2, 2));
  }
  if (preset === "H01" || preset === "A01")
    event("product", "x", 0, timing.entranceEnd, product.x, layout.width + 30);

  const headlineSegment = timing.closeStart / brief.copy.headlines.length;
  brief.copy.headlines.forEach((headline, index) => {
    const id = "headline-" + index,
      start = Math.round(headlineSegment * index);
    const end =
      start +
      Math.min(Math.round(brief.fps * 0.65), Math.floor(headlineSegment * 0.3));
    text(
      id,
      headline,
      layout.headline,
      layout.headlineSize,
      brief.theme.ink,
      3,
    );
    enter(id, start, end);
    event(id, "y", start, end, layout.headline.y, layout.headline.y + 26);
    if (index < brief.copy.headlines.length - 1) {
      const next = Math.round(headlineSegment * (index + 1));
      exit(id, next - Math.round(brief.fps * 0.22), next);
    }
  });
  if (usesCallouts)
    brief.copy.callouts.forEach((callout, index) => {
      const box = layout.callouts[index]!;
      const pathId = "callout-path-" + index,
        labelId = "callout-label-" + index;
      const points = calloutPoints(
        box,
        product,
        callout.target,
        index,
        brief.profile === "portrait",
      );
      nodes.push(
        ...buildPath({
          id: pathId,
          points,
          stroke: brief.theme.accent,
          lineWidth: 3,
          protectedRegion: {
            x: protectedRegion[0],
            y: protectedRegion[1],
            width: protectedRegion[2],
            height: protectedRegion[3],
          },
        }).nodes!,
      );
      text(labelId, callout.text, box, layout.calloutSize, brief.theme.ink);
      const start = Math.round(
        timing.bodyStart + (index * (timing.closeStart - timing.bodyStart)) / 2,
      );
      const end = start + Math.round(brief.fps * 0.5);
      event(pathId, "reveal", start, end, 1, 0);
      enter(labelId, start + 3, end + 3);
      exit(pathId, timing.closeStart, timing.closeEnd);
      exit(labelId, timing.closeStart, timing.closeEnd);
    });
  text(
    "cta",
    brief.copy.cta,
    layout.cta,
    brief.artDirection !== "standard"
      ? 30
      : brief.profile === "square"
        ? 34
        : 42,
    brief.theme.accent,
    2,
  );
  enter("cta", timing.closeStart, timing.closeEnd);
  return CommerceSceneSchema.parse({
    schemaVersion: "commerce-scene-1",
    title: brief.title,
    fps: brief.fps,
    frameCount: brief.frameCount,
    width: layout.width,
    height: layout.height,
    background: brief.theme.background,
    assets: [assets.product],
    fonts: [assets.font],
    nodes,
    events,
    recipe: { preset },
    provenance: brief.product.provenance,
    metadata: {
      registration: commerceFormatRegistration(
        brief.selection,
        brief.artDirection,
        brief.profile,
      ),
      catalogVersion: brief.catalogVersion,
      selection: brief.selection,
      profile: brief.profile,
      productId: brief.product.id,
      productSource: brief.product.provenance,
      copySource: brief.copy.source,
      claimSources: brief.copy.callouts.map((callout) => callout.source),
      locale: brief.locale,
      protectedRegion,
    },
  });
}

export function compileCommerceScene(
  input: CommerceScene,
): CommerceRenderScene {
  const tracks = createFrameTracks(input.nodes);
  const initialized = new Set<string>();
  for (const event of input.events) {
    if (event.from !== undefined) {
      const key = event.node + "." + event.property;
      if (initialized.has(key))
        throw new Error("Conflicting initial value for " + key);
      initialized.add(key);
      tracks.initial(event.node, event.property, event.from);
    }
    tracks.add(event.node, event.property, event, event.to);
  }
  const durationMs = (input.frameCount * 1000) / input.fps;
  return {
    ...input,
    rendererVersion: "commerce-canvas-0.16.0",
    durationMs,
    canvas: { width: input.width, height: input.height },
    timeline: { fps: input.fps, frameCount: input.frameCount, durationMs },
    tracks: tracks.finish(),
    followers: {},
  };
}
