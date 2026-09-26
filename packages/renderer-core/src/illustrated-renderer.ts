import type {
  PreparedImage,
  PreparedNode,
  PreparedPath,
} from "../../scene-contract/src/prepared.ts";
import {
  evaluatePreparedNode,
  pathLength,
  pointOnPath,
  type IllustratedScene,
} from "./prepared-scene.ts";

import { inspectForegroundReveal } from "./reveal-validation.ts";
import { sampleCinematicBlur } from "./cinematic-scene.ts";
import { drawStoryFlow } from "./story-flows.ts";
import { drawStoryText } from "./story-text.ts";
import { storyCameraTransform } from "./story-camera.ts";
import { evaluateStoryPath } from "./story-geometry.ts";
import { loadPreparedFonts, type LoadedFont } from "./prepared-fonts.ts";
import { inkStrokeOutline } from "./ink-path.ts";
import { brushStroke } from "./brush-path.ts";

type Images = Map<string, HTMLImageElement> & {
  revealValidation?: ReturnType<typeof inspectForegroundReveal>;
  fonts?: Map<string, LoadedFont>;
  rasters?: Map<string, HTMLCanvasElement>;
};
type State = ReturnType<typeof evaluatePreparedNode>;

const drawImage = (
  ctx: CanvasRenderingContext2D,
  node: PreparedImage,
  state: State,
  images: Images,
  clip = true,
) => {
  const variant = node.states[Math.round(state.state)];
  if (!variant) throw new Error(`Missing state ${state.state} on ${node.id}`);
  const image = images.get(variant.asset);
  if (!image) throw new Error(`Missing decoded image ${variant.asset}`);
  const [sx, sy, sw, sh] = variant.crop ?? [
    0,
    0,
    image.naturalWidth,
    image.naturalHeight,
  ];
  let width = node.width;
  let height = node.height;
  if (node.fit !== "stretch") {
    const ratio =
      node.fit === "cover"
        ? Math.max(width / sw, height / sh)
        : Math.min(width / sw, height / sh);
    width = sw * ratio;
    height = sh * ratio;
  }
  ctx.save();
  if (clip) {
    ctx.beginPath();
    ctx.rect(0, 0, node.width, node.height);
    ctx.clip();
  }
  ctx.drawImage(
    images.rasters?.get(variant.asset) ?? image,
    sx,
    sy,
    sw,
    sh,
    (node.width - width) / 2,
    (node.height - height) / 2,
    width,
    height,
  );
  ctx.restore();
};

const traceOutline = (
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
) => {
  if (!points.length) return;
  ctx.moveTo(...points[0]!);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
};

const strokeInterval = (
  ctx: CanvasRenderingContext2D,
  node: PreparedPath,
  start: number,
  end: number,
  pinch = 0,
) => {
  if (end <= start) return;
  if (node.lineStyle === "brush") {
    const mark = brushStroke(node, start, end, pinch);
    ctx.save();
    ctx.fillStyle = node.stroke;
    const opacity = ctx.globalAlpha;
    ctx.globalAlpha = opacity * 0.18;
    ctx.beginPath();
    traceOutline(ctx, mark.wash);
    ctx.fill();
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    traceOutline(ctx, mark.body);
    for (const cut of mark.cuts) traceOutline(ctx, cut);
    ctx.fill("evenodd");
    ctx.restore();
    return;
  }
  if (node.lineStyle === "ink") {
    const outline = inkStrokeOutline(node, start, end);
    if (outline.length === 0) return;
    ctx.beginPath();
    traceOutline(ctx, outline);
    ctx.fillStyle = node.stroke;
    ctx.fill();
    return;
  }
  const total = pathLength(node.points);
  const first = pointOnPath(node, start);
  ctx.beginPath();
  ctx.moveTo(...first);
  let distance = 0;
  for (let i = 1; i < node.points.length; i++) {
    const a = node.points[i - 1]!;
    const b = node.points[i]!;
    distance += Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (distance / total > start && distance / total < end) ctx.lineTo(...b);
  }
  ctx.lineTo(...pointOnPath(node, end));
  ctx.stroke();
};

const drawPath = (
  ctx: CanvasRenderingContext2D,
  node: PreparedPath,
  state: State,
) => {
  ctx.strokeStyle = node.stroke;
  ctx.lineWidth = node.lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (state.pulse > 0) {
    ctx.shadowColor = "#8B3F36";
    ctx.shadowOffsetX = 5 * state.pulse;
    ctx.shadowOffsetY = -3 * state.pulse;
  }
  const gap = (node.gapSize * state.gap) / 2;
  if (gap === 0) strokeInterval(ctx, node, 0, state.reveal, state.pinch);
  else {
    strokeInterval(
      ctx,
      node,
      0,
      Math.min(state.reveal, node.gapAt - gap),
      state.pinch,
    );
    if (state.reveal > node.gapAt + gap)
      strokeInterval(ctx, node, node.gapAt + gap, state.reveal, state.pinch);
  }
  if (node.endArrow && state.reveal === 1) {
    const tip = pointOnPath(node, 1);
    const before = pointOnPath(node, 0.97);
    const angle = Math.atan2(tip[1] - before[1], tip[0] - before[0]);
    const length = node.lineWidth * 2.2;
    const wing = node.lineWidth * 0.95;
    const bx = tip[0] - Math.cos(angle) * length;
    const by = tip[1] - Math.sin(angle) * length;
    if (node.lineStyle === "brush") {
      for (const side of [-1, 1]) {
        strokeInterval(
          ctx,
          {
            ...node,
            id: `${node.id}-wing-${side}`,
            lineWidth: node.lineWidth * 0.55,
            points: [
              [
                bx - Math.sin(angle) * wing * side,
                by + Math.cos(angle) * wing * side,
              ],
              tip,
            ],
          },
          0,
          1,
        );
      }
      return;
    }
    ctx.beginPath();
    ctx.moveTo(bx - Math.sin(angle) * wing, by + Math.cos(angle) * wing);
    ctx.lineTo(...tip);
    ctx.lineTo(bx + Math.sin(angle) * wing, by - Math.cos(angle) * wing);
    ctx.lineWidth = node.lineWidth * 0.45;
    ctx.stroke();
  }
};

const drawShape = (
  ctx: CanvasRenderingContext2D,
  node: PreparedNode,
  state: State,
  images: Images,
  clipImages = true,
) => {
  switch (node.type) {
    case "image":
      drawImage(ctx, node, state, images, clipImages);
      break;
    case "path":
      drawPath(ctx, node, state);
      break;
    case "text": {
      const font = node.fontAsset
        ? images.fonts?.get(node.fontAsset)
        : undefined;
      if (node.fontAsset && !font)
        throw new Error(`Font not prepared: ${node.fontAsset}`);
      ctx.fillStyle = node.color;
      ctx.font = font
        ? `${font.weight} ${node.fontSize}px "${font.family}"`
        : `${node.weight} ${node.fontSize}px ${node.font}`;
      ctx.textAlign = node.align;
      ctx.textBaseline = "top";
      const text = node.states
        ? node.states[Math.round(state.state)]
        : node.text;
      if (text === undefined)
        throw new Error(`Missing text state on ${node.id}`);
      drawStoryText(ctx, node, text, state.reveal);
      break;
    }
    case "rect":
      if (state.reveal < 1) {
        ctx.beginPath();
        ctx.rect(0, 0, node.width * state.reveal, node.height);
        ctx.clip();
      }
      ctx.fillStyle = node.fill;
      ctx.beginPath();
      ctx.roundRect(0, 0, node.width, node.height, node.radius);
      ctx.fill();
      if (node.stroke && node.lineWidth) {
        ctx.strokeStyle = node.stroke;
        ctx.lineWidth = node.lineWidth;
        ctx.stroke();
      }
      break;
    case "group":
      if (node.clip) {
        ctx.beginPath();
        ctx.rect(0, 0, node.width, node.height);
        ctx.clip();
      }
      break;
  }
};

export function createIllustratedPreview(
  canvas: HTMLCanvasElement,
  scene: IllustratedScene,
  images: Images,
) {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  const focus =
    scene.schemaVersion === "illustrated-scene-2" &&
    scene.recipe.preset === "focus_handoff";
  if (focus && !("filter" in ctx))
    throw new Error("Focus handoff requires Canvas 2D filter support");
  canvas.width = scene.width;
  canvas.height = scene.height;
  const children = new Map<string | undefined, PreparedNode[]>();
  for (const node of scene.nodes) {
    const siblings = children.get(node.parent) ?? [];
    siblings.push(node);
    children.set(node.parent, siblings);
  }
  const paint = (node: PreparedNode, frame: number) => {
    const state = evaluatePreparedNode(scene, node, frame);
    const flows =
      scene.schemaVersion === "story-scene-1"
        ? (scene.compiledFlows?.filter((flow) => flow.path === node.id) ?? [])
        : [];
    if (state.opacity <= 0 && !flows.length) return;
    ctx.save();
    const parentOpacity = ctx.globalAlpha;
    ctx.globalAlpha *= state.opacity;
    if (
      scene.schemaVersion === "story-scene-1" &&
      scene.camera &&
      !node.parent
    ) {
      const camera = storyCameraTransform(scene, node.id, frame);
      ctx.translate(camera.x, camera.y);
      ctx.scale(camera.scale, camera.scale);
    }
    const ox = node.width * node.origin[0];
    const oy = node.height * node.origin[1];
    ctx.translate(state.x + ox, state.y + oy);
    ctx.rotate((state.rotation * Math.PI) / 180);
    ctx.scale(state.scaleX, state.scaleY);
    ctx.translate(-ox, -oy);
    if (focus && scene.schemaVersion === "illustrated-scene-2") {
      const blur = sampleCinematicBlur(scene, node.id, frame);
      ctx.filter = blur > 0 ? `blur(${blur}px)` : "none";
    }
    const drawable =
      scene.schemaVersion === "story-scene-1" && node.type === "path"
        ? evaluateStoryPath(scene, node, frame)
        : node;
    drawShape(ctx, drawable, state, images, !focus);
    if (drawable.type === "path") {
      ctx.globalAlpha = parentOpacity;
      for (const flow of flows)
        drawStoryFlow(
          ctx,
          flow,
          drawable,
          state,
          frame,
          scene.timeline.frameCount,
        );
      ctx.globalAlpha = parentOpacity * state.opacity;
    }
    for (const child of children.get(node.id) ?? []) paint(child, frame);
    ctx.restore();
  };
  return {
    renderFrame(frame: number) {
      if (
        !Number.isInteger(frame) ||
        frame < 0 ||
        frame >= scene.timeline.frameCount
      )
        throw new Error("Frame index outside illustrated timeline");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = scene.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const node of children.get(undefined) ?? []) paint(node, frame);
    },
    dispose() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}

export async function loadIllustratedImages(
  scene: IllustratedScene,
  assetUrl: (id: string) => string,
) {
  const entries = await Promise.all(
    scene.assets.map(async (asset) => {
      const image = new Image();
      image.src = assetUrl(asset.id);
      await image.decode();
      if (
        image.naturalWidth !== asset.width ||
        image.naturalHeight !== asset.height
      )
        throw new Error(`Dimensions differ for ${asset.id}`);
      return [asset.id, image] as const;
    }),
  );
  const images: Images = new Map(entries);
  images.fonts = await loadPreparedFonts(scene, assetUrl);
  if (scene.schemaVersion === "story-scene-1" && scene.motionGrammar === "v2") {
    // SVG rasterization can depend on the active clip. Cache the complete image
    // once so adjacent assembly strips share exactly the same deposited pixels.
    images.rasters = new Map(
      entries.map(([id, image]) => {
        const raster = document.createElement("canvas");
        raster.width = image.naturalWidth;
        raster.height = image.naturalHeight;
        raster.getContext("2d")!.drawImage(image, 0, 0);
        return [id, raster];
      }),
    );
  }
  if (scene.schemaVersion === "illustrated-scene-2") {
    const node = scene.nodes.find(
      (item) => item.id === scene.recipe.background,
    )!;
    const bounds = scene.layers.find(
      (item) => item.node === node.id,
    )!.paintedBounds!;
    const source = node.states[0]!;
    const image = images.get(source.asset)!;
    const [sx, sy, sw, sh] = source.crop ?? [
      0,
      0,
      image.naturalWidth,
      image.naturalHeight,
    ];
    const left = Math.floor(sx + (bounds[0] / node.width) * sw);
    const top = Math.floor(sy + (bounds[1] / node.height) * sh);
    const right = Math.ceil(sx + ((bounds[0] + bounds[2]) / node.width) * sw);
    const bottom = Math.ceil(sy + ((bounds[1] + bounds[3]) / node.height) * sh);
    const probe = document.createElement("canvas");
    probe.width = image.naturalWidth;
    probe.height = image.naturalHeight;
    const context = probe.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(
      left,
      top,
      right - left,
      bottom - top,
    ).data;
    for (let i = 3; i < pixels.length; i += 4)
      if (pixels[i]! < 254)
        throw new Error(
          "Declared painted background coverage contains transparent pixels",
        );
  }
  if (
    scene.schemaVersion === "illustrated-scene-2" &&
    scene.recipe.preset === "foreground_reveal"
  ) {
    const alphaImages = new Map(
      entries.map(([id, image]) => {
        const probe = document.createElement("canvas");
        probe.width = image.naturalWidth;
        probe.height = image.naturalHeight;
        const ctx = probe.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(image, 0, 0);
        return [id, ctx.getImageData(0, 0, probe.width, probe.height)] as const;
      }),
    );
    images.revealValidation = inspectForegroundReveal(scene, alphaImages);
  }
  return images;
}
