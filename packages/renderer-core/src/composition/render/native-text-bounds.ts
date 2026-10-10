import type { TextNode } from "../../typography-style.ts";
import {
  typographyDrawPlan,
  typographyRevealPoses,
  displayedContainerContent,
  type PreparedTypography,
  type TextRaster,
} from "../../typography-renderer.ts";
import {
  evaluateTextPoses,
  type TextPose,
} from "../../typography-animation.ts";
import { axisKey } from "../../typography-axes.ts";
import { decorationSegments } from "../../typography-decorations.ts";
import { sampleCurve } from "../../curve.ts";
import { scalarKeys } from "../../motion-craft.ts";
import { easeMotion } from "../../motion-easing.ts";
import { textContainerBounds } from "../../text-container.ts";
import { posedGlyphBounds } from "./text-bounds.ts";
import type { Bounds } from "../evaluate/types.ts";

/** Local conservative ink bounds of only the copies drawn at this source sample. */
export function nativeTypographyContentBounds(
  node: TextNode,
  prepared: PreparedTypography,
  state: number,
  reveal: number,
  frame: number,
): Bounds {
  const glyphs: Bounds[] = [],
    containers: Bounds[] = [];
  const includeRaster = (
    node: TextNode,
    raster: TextRaster,
    poses: TextPose[],
    offset = [0, 0],
  ) => {
    const original = poses;
    poses = typographyRevealPoses(node, raster, poses, reveal).poses;
    poses.forEach((pose, index) => {
      if (pose.opacity <= 0) return;
      const variant = raster.variants.get(axisKey(pose.axes)) ?? raster;
      const box = posedGlyphBounds(variant.layout.clusters[index]!, pose);
      glyphs.push({
        left: box.left + offset[0]!,
        right: box.right + offset[0]!,
        top: box.top + offset[1]!,
        bottom: box.bottom + offset[1]!,
      });
    });
    for (const mark of node.decorations ?? []) {
      const amount = mark.reveal
        ? Math.max(
            0,
            Math.min(
              1,
              sampleCurve(scalarKeys(mark.reveal), frame, prepared.scene.fps),
            ),
          )
        : 1;
      const segments = decorationSegments(
        node,
        raster.layout,
        mark.span,
        original,
      );
      let remaining =
        segments.reduce((sum, segment) => sum + segment.width, 0) * amount;
      const thickness =
        mark.thickness ??
        (mark.kind === "highlight"
          ? raster.layout.capHeight * 1.25
          : Math.max(1, raster.layout.underlineThickness));
      for (const segment of segments) {
        const width = Math.min(segment.width, Math.max(0, remaining));
        remaining -= segment.width;
        if (width <= 0) continue;
        const y =
          segment.baseline +
          (mark.offset ?? 0) +
          (mark.kind === "underline"
            ? raster.layout.underlinePosition
            : mark.kind === "strike" || mark.kind === "highlight"
              ? -raster.layout.xHeight * 0.5
              : -raster.layout.capHeight);
        const reach = thickness * 2 + 2;
        glyphs.push({
          left: segment.x - reach + offset[0]!,
          right: segment.x + width + reach + offset[0]!,
          top: y - reach + offset[1]!,
          bottom:
            y +
            (mark.kind === "box"
              ? raster.layout.capHeight + raster.layout.descent
              : 0) +
            reach +
            offset[1]!,
        });
      }
    }
  };
  const plan = typographyDrawPlan(node, { state, reveal }, prepared, frame);
  if (plan.kind === "blend") {
    includeRaster(node, plan.from, plan.before);
    includeRaster(node, plan.to, plan.after);
  } else {
    includeRaster(node, plan.raster, plan.poses);
    if (plan.kind === "retype" && plan.caret)
      glyphs.push({
        left: plan.caret.x,
        right: plan.caret.x + plan.caret.width,
        top: plan.caret.y,
        bottom: plan.caret.y + plan.caret.height,
      });
  }
  for (const correction of prepared.corrections.get(node.id) ?? []) {
    const progress = easeMotion(
      (frame - correction.start) /
        Math.max(1, correction.end - correction.start),
      "out-cubic",
    );
    if (progress <= 0) continue;
    const poses = evaluateTextPoses(
      correction.node,
      correction.raster.layout,
      [],
      frame,
      prepared.scene,
    );
    includeRaster(correction.node, correction.raster, poses, [
      correction.x,
      correction.y + (1 - progress) * node.fontSize * 0.15,
    ]);
  }
  if (node.textLayout?.overflow === "clip") {
    const width = node.textLayout.width,
      left =
        node.align === "center"
          ? -width / 2
          : node.align === "right"
            ? -width
            : 0;
    for (let index = glyphs.length - 1; index >= 0; index--) {
      const box = glyphs[index]!;
      box.left = Math.max(box.left, left);
      box.right = Math.min(box.right, left + width);
      box.top = Math.max(box.top, 0);
      box.bottom = Math.min(box.bottom, node.textLayout.height);
      if (box.right <= box.left || box.bottom <= box.top)
        glyphs.splice(index, 1);
    }
  }
  if (node.container && reveal > 0) {
    const box = textContainerBounds(
      displayedContainerContent(node, prepared, frame, state),
      node.container,
    );
    containers.push({
      left: box.x,
      right: box.x + box.width,
      top: box.y,
      bottom: box.y + box.height,
    });
  }
  const boxes = [...glyphs, ...containers];
  return boxes.length
    ? {
        left: Math.min(...boxes.map((box) => box.left)),
        top: Math.min(...boxes.map((box) => box.top)),
        right: Math.max(...boxes.map((box) => box.right)),
        bottom: Math.max(...boxes.map((box) => box.bottom)),
      }
    : { left: 0, top: 0, right: 1, bottom: 1 };
}
