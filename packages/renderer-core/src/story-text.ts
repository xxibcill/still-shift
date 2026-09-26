import type { PreparedNode } from "../../scene-contract/src/prepared.ts";
import { easeMotion } from "./motion-easing.ts";

type TextNode = Extract<PreparedNode, { type: "text" }>;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export function textRevealLayout(
  text: string,
  align: TextNode["align"],
  mode: NonNullable<TextNode["revealMode"]>,
  reveal: number,
  measure: (value: string) => number,
) {
  const width = measure(text),
    left = align === "center" ? -width / 2 : align === "right" ? -width : 0;
  const words = text.split(" ");
  return {
    width,
    left,
    edge: left + width * clamp(reveal),
    words:
      mode === "words"
        ? words.map((word, i) => ({
            text: word,
            x: left + measure(words.slice(0, i).join(" ") + (i ? " " : "")),
            progress: clamp((clamp(reveal) * (words.length + 2) - i) / 3),
          }))
        : [],
  };
}

/** The completed reveal uses the original single fillText call, preserving kerning and pixels. */
export function drawStoryText(
  ctx: CanvasRenderingContext2D,
  node: TextNode,
  text: string,
  reveal: number,
) {
  if (reveal <= 0) return;
  if (reveal >= 1) {
    ctx.fillText(text, 0, 0);
    return;
  }
  const layout = textRevealLayout(
    text,
    node.align,
    node.revealMode ?? "wipe",
    reveal,
    (value) => ctx.measureText(value).width,
  );
  ctx.save();
  if (node.revealMode === "words") {
    ctx.textAlign = "left";
    const opacity = ctx.globalAlpha;
    for (const word of layout.words) {
      ctx.globalAlpha = opacity * word.progress;
      ctx.fillText(
        word.text,
        word.x,
        (1 - easeMotion(word.progress, "out-cubic")) * 10,
      );
    }
  } else {
    const pad = node.fontSize * 0.2;
    const slice = (left: number, right: number, alpha: number) => {
      if (right <= left) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, -pad, right - left, node.fontSize * 1.4);
      ctx.clip();
      ctx.globalAlpha *= alpha;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    };
    slice(layout.left - pad, layout.edge - 24, 1);
    for (let i = 0; i < 6; i++)
      slice(
        Math.max(layout.left - pad, layout.edge - 24 + i * 4),
        layout.edge - 20 + i * 4,
        1 - (i + 0.5) / 6,
      );
  }
  ctx.restore();
}
