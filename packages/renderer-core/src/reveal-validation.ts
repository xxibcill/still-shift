import type { PreparedImage } from "../../scene-contract/src/prepared.ts";
import {
  projectCinematicNode,
  type CinematicRenderScene,
} from "./cinematic-scene.ts";

export type AlphaImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};
type Point = [number, number];

function insidePolygon([x, y]: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!,
      b = polygon[j]!;
    if (
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}

function alphaAt(image: AlphaImage, x: number, y: number) {
  const x0 = Math.floor(x),
    y0 = Math.floor(y),
    dx = x - x0,
    dy = y - y0;
  const at = (px: number, py: number) =>
    image.data[
      (Math.max(0, Math.min(image.height - 1, py)) * image.width +
        Math.max(0, Math.min(image.width - 1, px))) *
        4 +
        3
    ]! / 255;
  return (
    (at(x0, y0) * (1 - dx) + at(x0 + 1, y0) * dx) * (1 - dy) +
    (at(x0, y0 + 1) * (1 - dx) + at(x0 + 1, y0 + 1) * dx) * dy
  );
}

function sampleNode(
  node: PreparedImage,
  image: AlphaImage,
  x: number,
  y: number,
) {
  if (x < 0 || y < 0 || x >= node.width || y >= node.height) return 0;
  const [sx, sy, sw, sh] = node.states[0]!.crop ?? [
    0,
    0,
    image.width,
    image.height,
  ];
  return alphaAt(
    image,
    sx + (x / node.width) * sw - 0.5,
    sy + (y / node.height) * sh - 0.5,
  );
}

/** Asset-aware gate shared by preview and export after image decoding. */
export function inspectForegroundReveal(
  scene: CinematicRenderScene,
  images: Map<string, AlphaImage>,
) {
  const polygon = scene.recipe.revealRegion;
  if (scene.recipe.preset !== "foreground_reveal" || !polygon)
    throw new Error("Missing reveal target");
  const subject = scene.nodes.find((node) => node.id === scene.recipe.subject)!;
  const subjectDepth = scene.layers.find(
    (layer) => layer.node === subject.id,
  )!.depth;
  const imageFor = (node: PreparedImage) => {
    const image = images.get(node.states[0]!.asset);
    if (!image) throw new Error(`Missing alpha image for ${node.id}`);
    return image;
  };
  const targetImage = imageFor(subject);
  const step = 4;
  const points: Point[] = [];
  const xs = polygon.map((point) => point[0]),
    ys = polygon.map((point) => point[1]);
  for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step)
    for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step)
      if (
        insidePolygon([x, y], polygon) &&
        sampleNode(subject, targetImage, x, y) >= 0.95
      )
        points.push([x, y]);
  if (points.length < 100)
    throw new Error("Reveal target has too few opaque samples");
  const occluders = scene.nodes.filter(
    (node) =>
      scene.layers.find((layer) => layer.node === node.id)!.depth <
      subjectDepth,
  );
  const coverage: number[] = [];
  for (let frame = 0; frame < scene.timeline.frameCount; frame++) {
    const target = projectCinematicNode(scene, subject, frame);
    const foreground = occluders.map((node) => ({
      node,
      image: imageFor(node),
      p: projectCinematicNode(scene, node, frame),
    }));
    let total = 0;
    for (const [x, y] of points) {
      const screenX = target.left + x * target.scale,
        screenY = target.top + y * target.scale;
      let transmission = 1;
      for (const { node, image, p } of foreground)
        transmission *=
          1 -
          sampleNode(
            node,
            image,
            (screenX - p.left) / p.scale,
            (screenY - p.top) / p.scale,
          );
      total += 1 - transmission;
    }
    coverage.push(total / points.length);
  }
  const initialOcclusion = coverage[0]!;
  if (initialOcclusion < 0.1 || initialOcclusion > 0.35)
    throw new Error(
      `Reveal initial occlusion must be 10–35%; measured ${(initialOcclusion * 100).toFixed(2)}%`,
    );
  const settleFrame = scene.cameraFrames[2]!.frame;
  if (coverage[settleFrame]! > 0.01)
    throw new Error(`Reveal does not clear the target by frame ${settleFrame}`);
  let minimum = initialOcclusion;
  for (let frame = 1; frame < coverage.length; frame++) {
    if (coverage[frame]! > minimum + 0.01)
      throw new Error(`Reveal reocclusion at frame ${frame}`);
    minimum = Math.min(minimum, coverage[frame]!);
  }
  const clearFrame = coverage.findIndex((value) => value <= 0.01);
  const worstAfterClear = Math.max(...coverage.slice(clearFrame));
  if (worstAfterClear > 0.01) throw new Error("Reveal does not stay clear");
  return {
    initialOcclusion,
    finalOcclusion: coverage.at(-1)!,
    clearFrame,
    settleFrame,
    worstAfterClear,
    checkedFrames: coverage.length,
    sampleSpacingPx: step,
    targetSamples: points.length,
    coverage,
  };
}
