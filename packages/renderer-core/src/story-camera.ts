import type { StoryScene } from "../../scene-contract/src/story.ts";
import type { PreparedImage } from "../../scene-contract/src/prepared.ts";
import type { StoryRenderScene } from "./story-scene.ts";
import { evaluatePreparedNode } from "./prepared-scene.ts";

type Axis = "x" | "y" | "zoom";
type Camera = NonNullable<StoryScene["camera"]>;
type Curve = { frames: number[]; values: number[]; tangents: number[] };
const curves = new WeakMap<Camera, Record<Axis, Curve>>();

function cameraCurves(camera: Camera) {
  const existing = curves.get(camera);
  if (existing) return existing;
  const result = Object.fromEntries(
    (["x", "y", "zoom"] as const).map((axis) => {
      const frames = camera.keys.map((k) => k.frame),
        values = camera.keys.map((k) => k[axis]);
      const slopes = values
        .slice(1)
        .map((v, i) => (v - values[i]!) / (frames[i + 1]! - frames[i]!));
      const tangents = values.map((_, i) => {
        if (i === 0) return slopes[0]!;
        if (i === values.length - 1) return slopes.at(-1)!;
        const left = slopes[i - 1]!,
          right = slopes[i]!;
        if (left * right <= 0) return 0;
        return (left + right) / 2;
      });
      // Authored handoff velocities must obey the same monotonicity limits.
      if (camera.startTangent) tangents[0] = camera.startTangent[axis];
      if (camera.endTangent)
        tangents[tangents.length - 1] = camera.endTangent[axis];
      // Fritsch–Carlson limits each interval without reversing its monotone direction.
      slopes.forEach((slope, i) => {
        if (slope === 0) {
          tangents[i] = 0;
          tangents[i + 1] = 0;
          return;
        }
        if (tangents[i]! / slope < 0) tangents[i] = 0;
        if (tangents[i + 1]! / slope < 0) tangents[i + 1] = 0;
        const a = tangents[i]! / slope,
          b = tangents[i + 1]! / slope;
        const radius = Math.hypot(a, b);
        if (radius > 3) {
          tangents[i] = (3 * a * slope) / radius;
          tangents[i + 1] = (3 * b * slope) / radius;
        }
      });
      return [axis, { frames, values, tangents }];
    }),
  ) as Record<Axis, Curve>;
  curves.set(camera, result);
  return result;
}

function sampleCurve(curve: Curve, frame: number, camera: Camera) {
  const { frames, values, tangents } = curve;
  if (frame <= frames[0]!) return values[0]!;
  if (frame >= frames.at(-1)!) return values.at(-1)!;
  const i = frames.findIndex((f, i) => i > 0 && f > frame) - 1;
  const duration = frames[i + 1]! - frames[i]!;
  let t = (frame - frames[i]!) / duration;
  const easeIn = i === 0 && camera.easeIn !== false;
  const easeOut = i === frames.length - 2 && camera.easeOut !== false;
  // These time profiles have derivative 1 at an interior key, retaining C1 continuity.
  if (easeIn && easeOut) t = t - Math.sin(2 * Math.PI * t) / (2 * Math.PI);
  else if (easeIn) t = t - ((1 - t) * Math.sin(Math.PI * t)) / Math.PI;
  else if (easeOut) t = t + (t * Math.sin(Math.PI * t)) / Math.PI;
  return (
    (2 * t ** 3 - 3 * t ** 2 + 1) * values[i]! +
    (t ** 3 - 2 * t ** 2 + t) * duration * tangents[i]! +
    (-2 * t ** 3 + 3 * t ** 2) * values[i + 1]! +
    (t ** 3 - t ** 2) * duration * tangents[i + 1]!
  );
}

export function sampleStoryCamera(scene: StoryScene, frame: number) {
  const camera = scene.camera;
  if (!camera) return { x: scene.width / 2, y: scene.height / 2, zoom: 1 };
  const prepared = cameraCurves(camera);
  let x = sampleCurve(prepared.x, frame, camera),
    y = sampleCurve(prepared.y, frame, camera);
  for (const jolt of camera.jolts ?? []) {
    if (frame < jolt.frame || frame >= jolt.frame + jolt.decayFrames) continue;
    const decay = (1 - (frame - jolt.frame) / jolt.decayFrames) ** 3;
    x += jolt.dx * decay;
    y += jolt.dy * decay;
  }
  return { x, y, zoom: sampleCurve(prepared.zoom, frame, camera) };
}

/** Actual endpoint velocity after monotonicity limiting and endpoint easing. */
export function storyCameraBoundaryVelocity(
  scene: StoryScene,
  edge: "start" | "end",
) {
  const camera = scene.camera;
  if (!camera) return { x: 0, y: 0, zoom: 0 };
  const prepared = cameraCurves(camera);
  const eased =
    edge === "start" ? camera.easeIn !== false : camera.easeOut !== false;
  const velocity = Object.fromEntries(
    (["x", "y", "zoom"] as const).map((axis) => [
      axis,
      eased
        ? 0
        : edge === "start"
          ? prepared[axis].tangents[0]!
          : prepared[axis].tangents.at(-1)!,
    ]),
  ) as { x: number; y: number; zoom: number };
  const frame = edge === "start" ? 0 : scene.frameCount - 1;
  for (const jolt of camera.jolts ?? []) {
    if (frame < jolt.frame || frame >= jolt.frame + jolt.decayFrames) continue;
    const slope =
      (-3 * (1 - (frame - jolt.frame) / jolt.decayFrames) ** 2) /
      jolt.decayFrames;
    velocity.x += jolt.dx * slope;
    velocity.y += jolt.dy * slope;
  }
  return velocity;
}

export function storyCameraTransform(
  scene: StoryScene,
  root: string,
  frame: number,
) {
  const depth = scene.connectors.some((c) => c.path === root)
    ? 0
    : (scene.camera?.depth[root] ?? 1);
  if (!scene.camera || depth === 0) return { scale: 1, x: 0, y: 0 };
  const camera = sampleStoryCamera(scene, frame),
    cx = scene.width / 2,
    cy = scene.height / 2;
  const scale = 1 + (camera.zoom - 1) * depth;
  return {
    scale,
    x: cx - scale * (cx + (camera.x - cx) * depth),
    y: cy - scale * (cy + (camera.y - cy) * depth),
  };
}

export function projectStoryPoint(
  scene: StoryScene,
  root: string,
  point: [number, number],
  frame: number,
): [number, number] {
  const { scale, x, y } = storyCameraTransform(scene, root, frame);
  return [point[0] * scale + x, point[1] * scale + y];
}

type Bounds = { left: number; top: number; right: number; bottom: number };
type AlphaPixels = Pick<ImageData, "width" | "height" | "data">;

function imageDrawBounds(
  scene: StoryRenderScene,
  node: PreparedImage,
  stateIndex: number,
): Bounds {
  if (node.fit === "stretch")
    return { left: 0, top: 0, right: node.width, bottom: node.height };
  const variant = node.states[stateIndex];
  if (!variant) throw new Error(`Missing state ${stateIndex} on ${node.id}`);
  const asset = scene.assets.find((item) => item.id === variant.asset)!;
  const sourceWidth = variant.crop?.[2] ?? asset.width;
  const sourceHeight = variant.crop?.[3] ?? asset.height;
  const ratio =
    node.fit === "cover"
      ? Math.max(node.width / sourceWidth, node.height / sourceHeight)
      : Math.min(node.width / sourceWidth, node.height / sourceHeight);
  const width = sourceWidth * ratio;
  const height = sourceHeight * ratio;
  return {
    left: (node.width - width) / 2,
    top: (node.height - height) / 2,
    right: (node.width + width) / 2,
    bottom: (node.height + height) / 2,
  };
}

export function validateStoryCameraCoverage(scene: StoryRenderScene) {
  for (const id of scene.camera?.cover ?? []) {
    const node = scene.nodes.find((n) => n.id === id)!;
    const fittedBounds =
      node.type === "image" && node.fit === "contain"
        ? node.states.map((_, index) => imageDrawBounds(scene, node, index))
        : undefined;
    for (let frame = 0; frame < scene.frameCount; frame++) {
      const state = evaluatePreparedNode(scene, node, frame);
      // Cover and stretch fill the clipped node box; contain can letterbox it.
      const painted = fittedBounds
        ? fittedBounds[Math.round(state.state)]
        : {
            left: 0,
            top: 0,
            right: node.width,
            bottom: node.height,
          };
      if (!painted) throw new Error(`Missing state ${state.state} on ${id}`);
      const ox = node.width * node.origin[0],
        oy = node.height * node.origin[1];
      const left =
          state.x + ox * (1 - state.scaleX) + painted.left * state.scaleX,
        top = state.y + oy * (1 - state.scaleY) + painted.top * state.scaleY;
      const a = projectStoryPoint(scene, id, [left, top], frame);
      const b = projectStoryPoint(
        scene,
        id,
        [
          state.x + ox * (1 - state.scaleX) + painted.right * state.scaleX,
          state.y + oy * (1 - state.scaleY) + painted.bottom * state.scaleY,
        ],
        frame,
      );
      if (
        state.rotation !== 0 ||
        state.opacity !== 1 ||
        state.scaleX <= 0 ||
        state.scaleY <= 0 ||
        a[0] > 1e-6 ||
        a[1] > 1e-6 ||
        b[0] < scene.width - 1e-6 ||
        b[1] < scene.height - 1e-6
      )
        throw new Error(
          `Camera exposes uncovered edge on ${id} at frame ${frame}`,
        );
    }
  }
}

function alphaPrefix(pixels: AlphaPixels) {
  const stride = pixels.width + 1;
  const counts = new Uint32Array(stride * (pixels.height + 1));
  for (let y = 0; y < pixels.height; y++) {
    let transparentInRow = 0;
    for (let x = 0; x < pixels.width; x++) {
      if (pixels.data[(y * pixels.width + x) * 4 + 3]! < 254)
        transparentInRow++;
      counts[(y + 1) * stride + x + 1] =
        counts[y * stride + x + 1]! + transparentInRow;
    }
  }
  return (left: number, top: number, right: number, bottom: number) => {
    const x0 = Math.max(0, Math.floor(left));
    const y0 = Math.max(0, Math.floor(top));
    const x1 = Math.min(pixels.width, Math.ceil(right));
    const y1 = Math.min(pixels.height, Math.ceil(bottom));
    return (
      counts[y1 * stride + x1]! -
        counts[y0 * stride + x1]! -
        counts[y1 * stride + x0]! +
        counts[y0 * stride + x0]! >
      0
    );
  };
}

/** Check the actual source pixels sampled by each declared image cover. */
export function validateStoryCameraAlphaCoverage(
  scene: StoryRenderScene,
  readPixels: (assetId: string) => AlphaPixels,
) {
  const hasTransparency = new Map<string, ReturnType<typeof alphaPrefix>>();
  for (const id of scene.camera?.cover ?? []) {
    const node = scene.nodes.find((item) => item.id === id)!;
    if (node.type !== "image") continue;
    for (let frame = 0; frame < scene.frameCount; frame++) {
      const state = evaluatePreparedNode(scene, node, frame);
      const variant = node.states[Math.round(state.state)];
      if (!variant) throw new Error(`Missing state ${state.state} on ${id}`);
      let transparent = hasTransparency.get(variant.asset);
      if (!transparent) {
        transparent = alphaPrefix(readPixels(variant.asset));
        hasTransparency.set(variant.asset, transparent);
      }
      const asset = scene.assets.find((item) => item.id === variant.asset)!;
      const [sx, sy, sw, sh] = variant.crop ?? [
        0,
        0,
        asset.width,
        asset.height,
      ];
      const drawn = imageDrawBounds(scene, node, Math.round(state.state));
      const camera = storyCameraTransform(scene, id, frame);
      const ox = node.width * node.origin[0];
      const oy = node.height * node.origin[1];
      const localX = (screenX: number) =>
        ox +
        ((screenX - camera.x) / camera.scale - state.x - ox) / state.scaleX;
      const localY = (screenY: number) =>
        oy +
        ((screenY - camera.y) / camera.scale - state.y - oy) / state.scaleY;
      const left =
        sx + ((localX(0) - drawn.left) / (drawn.right - drawn.left)) * sw;
      const right =
        sx +
        ((localX(scene.width) - drawn.left) / (drawn.right - drawn.left)) * sw;
      const top =
        sy + ((localY(0) - drawn.top) / (drawn.bottom - drawn.top)) * sh;
      const bottom =
        sy +
        ((localY(scene.height) - drawn.top) / (drawn.bottom - drawn.top)) * sh;
      if (transparent(left, top, right, bottom))
        throw new Error(
          `Camera exposes uncovered edge on ${id} at frame ${frame}: transparent image pixels`,
        );
    }
  }
}
