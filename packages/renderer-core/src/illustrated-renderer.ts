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

type Images = Map<string, HTMLImageElement>;
type State = ReturnType<typeof evaluatePreparedNode>;

const drawImage = (
  ctx: CanvasRenderingContext2D,
  node: PreparedImage,
  state: State,
  images: Images,
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
  ctx.beginPath();
  ctx.rect(0, 0, node.width, node.height);
  ctx.clip();
  ctx.drawImage(
    image,
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

const strokeInterval = (
  ctx: CanvasRenderingContext2D,
  node: PreparedPath,
  start: number,
  end: number,
) => {
  if (end <= start) return;
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
  if (gap === 0) strokeInterval(ctx, node, 0, state.reveal);
  else {
    strokeInterval(ctx, node, 0, Math.min(state.reveal, node.gapAt - gap));
    if (state.reveal > node.gapAt + gap)
      strokeInterval(ctx, node, node.gapAt + gap, state.reveal);
  }
};

const drawShape = (
  ctx: CanvasRenderingContext2D,
  node: PreparedNode,
  state: State,
  images: Images,
) => {
  switch (node.type) {
    case "image":
      drawImage(ctx, node, state, images);
      break;
    case "path":
      drawPath(ctx, node, state);
      break;
    case "text":
      ctx.fillStyle = node.color;
      ctx.font = `${node.weight} ${node.fontSize}px ${node.font}`;
      ctx.textAlign = node.align;
      ctx.textBaseline = "top";
      ctx.fillText(node.text, 0, 0);
      break;
    case "rect":
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
    if (state.opacity <= 0) return;
    ctx.save();
    ctx.globalAlpha *= state.opacity;
    const ox = node.width * node.origin[0];
    const oy = node.height * node.origin[1];
    ctx.translate(state.x + ox, state.y + oy);
    ctx.rotate((state.rotation * Math.PI) / 180);
    ctx.scale(state.scaleX, state.scaleY);
    ctx.translate(-ox, -oy);
    drawShape(ctx, node, state, images);
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
  const images = new Map(entries);
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
  return images;
}
