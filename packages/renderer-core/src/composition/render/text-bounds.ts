import { projectBounds } from "../evaluate/geometry.ts";
import type { Bounds } from "../evaluate/types.ts";
import {
  evaluateTextPoses,
  textAnimationFrames,
  type TextPose,
} from "../../typography-animation.ts";
import { axisKey } from "../../typography-axes.ts";
import { decorationSegments } from "../../typography-decorations.ts";
import type {
  PreparedTypography,
  TextRaster,
} from "../../typography-renderer.ts";
import type { TextNode } from "../../typography-style.ts";
import type { GlyphCluster } from "../../shaped-text.ts";
import type { Matrix } from "../../node-transform.ts";

const union = (boxes: Bounds[]): Bounds => ({
  left: Math.min(...boxes.map((box) => box.left)),
  top: Math.min(...boxes.map((box) => box.top)),
  right: Math.max(...boxes.map((box) => box.right)),
  bottom: Math.max(...boxes.map((box) => box.bottom)),
});
const pad = (box: Bounds, by: number): Bounds => ({
  left: box.left - by,
  top: box.top - by,
  right: box.right + by,
  bottom: box.bottom + by,
});

function layoutBounds(raster: TextRaster): Bounds {
  const boxes = raster.layout.lines.map((line) => ({
    left: line.x,
    top: line.baseline - line.ascent,
    right: line.x + line.width,
    bottom: line.baseline + line.descent,
  }));
  for (const cluster of raster.layout.clusters)
    if (cluster.ink && cluster.ink.width > 0)
      boxes.push({
        left: cluster.ink.x,
        top: cluster.ink.y,
        right: cluster.ink.x + cluster.ink.width,
        bottom: cluster.ink.y + cluster.ink.height,
      });
  return union(boxes);
}

function posedGlyphBounds(cluster: GlyphCluster, pose: TextPose): Bounds {
  const ink = cluster.ink ?? {
    x: cluster.x,
    y: cluster.baseline - cluster.ascent,
    width: cluster.advance,
    height: cluster.ascent + cluster.descent,
  };
  const local = pad(
    {
      left: ink.x,
      top: ink.y,
      right: ink.x + ink.width,
      bottom: ink.y + ink.height,
    },
    Math.max(0, pose.strokeWidth) + 2,
  );
  const angle = (pose.rotation * Math.PI) / 180;
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  const skew = Math.tan((pose.skew * Math.PI) / 180);
  const a = cos * pose.scale,
    b = sin * pose.scale;
  const c = cos * skew - sin * pose.scale,
    d = sin * skew + cos * pose.scale;
  const matrix: Matrix = [
    a,
    b,
    c,
    d,
    pose.anchorX + pose.x - a * pose.anchorX - c * pose.anchorY,
    pose.anchorY + pose.y - b * pose.anchorX - d * pose.anchorY,
  ];
  return pad(projectBounds(local, matrix), Math.max(0, pose.blur) * 3);
}

/** Union actual combined glyph poses over reachable times, including their group pivots. */
export function animatedTextBounds(
  node: TextNode,
  raster: TextRaster,
  scene: PreparedTypography["scene"],
): Bounds {
  let bounds = layoutBounds(raster);
  const include = (box: Bounds) => {
    bounds = union([bounds, box]);
  };
  const animators = (scene.textAnimators ?? []).filter(
    (animator) => animator.node === node.id,
  );
  const frames = animators.length ? textAnimationFrames(scene, node) : [0];
  for (const frame of frames) {
    const poses = evaluateTextPoses(
      node,
      raster.layout,
      animators,
      frame,
      scene,
    );
    for (const [index, pose] of poses.entries()) {
      if (pose.opacity <= 0) continue;
      const variant = raster.variants.get(axisKey(pose.axes)) ?? raster;
      include(posedGlyphBounds(variant.layout.clusters[index]!, pose));
    }
    for (const mark of node.decorations ?? []) {
      const thickness =
        mark.thickness ??
        Math.max(
          raster.layout.capHeight * 1.25,
          raster.layout.underlineThickness,
        );
      const reach =
        raster.layout.capHeight +
        raster.layout.descent +
        Math.abs(raster.layout.underlinePosition) +
        thickness * 2;
      for (const segment of decorationSegments(
        node,
        raster.layout,
        mark.span,
        poses,
      ))
        include({
          left: segment.x - thickness,
          right: segment.x + segment.width + thickness,
          top: segment.baseline + (mark.offset ?? 0) - reach,
          bottom: segment.baseline + (mark.offset ?? 0) + reach,
        });
    }
  }
  return pad(bounds, node.revealMode === "words" ? node.fontSize * 0.2 : 0);
}
