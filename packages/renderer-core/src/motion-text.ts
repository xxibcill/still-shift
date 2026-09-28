import type { TextAnimator } from "../../scene-contract/src/motion-craft.ts";
import type { PreparedNode } from "../../scene-contract/src/prepared.ts";
import { easeMotion } from "./motion-easing.ts";
import { interpolateColor } from "./motion-appearance.ts";
import { measureStoryText } from "./story-text-layout.ts";
import type { TextLayout } from "./text-layout.ts";

type TextNode = Extract<PreparedNode, { type: "text" }>;
export function textUnitProgress(
  animator: TextAnimator,
  index: number,
  count: number,
  frame: number,
) {
  const position = count <= 1 ? 0.5 : index / (count - 1),
    selector = animator.selector;
  const left = Number(selector.start) + Number(selector.offset ?? 0),
    right = Number(selector.end) + Number(selector.offset ?? 0);
  if (position < left || position > right) return 1;
  const lastStart = Math.min(
    animator.end - 1,
    animator.start + (count - 1) * animator.stagger,
  );
  const start = Math.min(lastStart, animator.start + index * animator.stagger);
  const progress = easeMotion(
    (frame - start) / (animator.end - lastStart),
    selector.easing ?? "in-out-cubic",
  );
  const x = right > left ? (position - left) / (right - left) : 1;
  const amount =
    selector.shape === "ramp"
      ? x
      : selector.shape === "triangle"
        ? 1 - Math.abs(2 * x - 1)
        : 1;
  return 1 - (1 - progress) * amount;
}
/** Returning false delegates completion to the existing single-call text renderer. */
export function drawAnimatedText(
  ctx: CanvasRenderingContext2D,
  node: TextNode,
  text: string,
  frame: number,
  animator?: TextAnimator,
  measured?: TextLayout,
) {
  if (!animator || frame >= animator.end) return false;
  const layout =
    measured ??
    (node.textLayout
      ? measureStoryText(node, text, (s) => ctx.measureText(s).width)
      : { lines: text.split("\n"), lineHeight: node.fontSize * 1.4 });
  if (measured) ctx.textBaseline = "alphabetic";
  const units: { text: string; x: number; y: number }[] = [];
  layout.lines.forEach((line, row) => {
    const left =
      node.align === "center"
        ? -ctx.measureText(line).width / 2
        : node.align === "right"
          ? -ctx.measureText(line).width
          : 0;
    const pieces =
      animator.unit === "line"
        ? [line]
        : animator.unit === "word"
          ? (line.match(/\S+\s*|\s+/g) ?? [])
          : Array.from(
              new Intl.Segmenter("en", { granularity: "grapheme" }).segment(
                line,
              ),
              (s) => s.segment,
            );
    let prefix = "";
    pieces.forEach((piece) => {
      units.push({
        text: piece,
        x:
          left +
          ctx.measureText(prefix).width +
          (measured
            ? node.align === "center"
              ? node.width / 2
              : node.align === "right"
                ? node.width
                : 0
            : 0),
        y: row * layout.lineHeight + (measured?.baseline ?? 0),
      });
      prefix += piece;
    });
  });
  units.forEach((unit, index) => {
    const p = textUnitProgress(animator, index, units.length, frame),
      remainder = 1 - p,
      from = animator.from;
    ctx.save();
    ctx.textAlign = "left";
    ctx.globalAlpha *= 1 + ((from.opacity ?? 1) - 1) * remainder;
    ctx.translate(
      unit.x + (from.offset?.[0] ?? 0) * remainder,
      unit.y + (from.offset?.[1] ?? 0) * remainder,
    );
    ctx.rotate(((from.rotation ?? 0) * remainder * Math.PI) / 180);
    const scale = 1 + ((from.scale ?? 1) - 1) * remainder;
    ctx.scale(scale, scale);
    if (from.blur) ctx.filter = `blur(${from.blur * remainder}px)`;
    if (from.color) ctx.fillStyle = interpolateColor(from.color, node.color, p);
    ctx.fillText(unit.text, 0, 0);
    ctx.restore();
  });
  return true;
}
