import { createRenderCanvas } from "../../managed-memory-context.ts";
import type { PreparedNode } from "@still-shift/scene-contract";
import type { Bounds } from "../evaluate/types.ts";
import type { LoadedFont } from "../../prepared-fonts.ts";
import type { TextLayout } from "../../text-layout.ts";
import { textRevealLayout } from "../../story-text.ts";
import {
  textContainerBounds,
  textContainerContent,
} from "../../text-container.ts";

type TextNode = Extract<PreparedNode, { type: "text" }>;

export function pointBounds(
  points: readonly (readonly [number, number])[],
  pad: number,
): Bounds {
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const [x, y] of points) {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return {
    left: left - pad,
    top: top - pad,
    right: right + pad,
    bottom: bottom + pad,
  };
}

/** Match the prepared drawer's font, alignment, measured lines and word reveal positions. */
export function preparedTextBounds(
  node: TextNode,
  font?: LoadedFont,
  layouts?: Map<string, TextLayout>,
): Bounds {
  const canvas = createRenderCanvas();
  const ctx = canvas.getContext("2d")!;
  ctx.font = font
    ? `${font.weight} ${node.fontSize}px "${font.family}"`
    : `${node.weight} ${node.fontSize}px ${node.font}`;
  const result: Bounds = {
    left: Infinity,
    top: Infinity,
    right: -Infinity,
    bottom: -Infinity,
  };
  const include = (box: Bounds) => {
    result.left = Math.min(result.left, box.left);
    result.top = Math.min(result.top, box.top);
    result.right = Math.max(result.right, box.right);
    result.bottom = Math.max(result.bottom, box.bottom);
  };
  const glyphs = (text: string, x: number, y: number, rise = 0) => {
    const m = ctx.measureText(text);
    include({
      left: x - m.actualBoundingBoxLeft,
      top: y - m.actualBoundingBoxAscent,
      right: x + m.actualBoundingBoxRight,
      bottom: y + m.actualBoundingBoxDescent + rise,
    });
  };
  try {
    for (const text of layouts?.keys() ?? node.states ?? [node.text]) {
      ctx.textAlign = node.align;
      const layout = layouts?.get(text);
      if (layout) {
        ctx.textBaseline = "alphabetic";
        const x =
          node.align === "center"
            ? node.width / 2
            : node.align === "right"
              ? node.width
              : 0;
        layout.lines.forEach((line, index) =>
          glyphs(line, x, layout.baseline + index * layout.lineHeight),
        );
      } else if (node.textLayout) {
        const left =
          node.align === "center"
            ? -node.textLayout.width / 2
            : node.align === "right"
              ? -node.textLayout.width
              : 0;
        include({
          left,
          top: 0,
          right: left + node.textLayout.width,
          bottom: node.textLayout.height,
        });
      } else {
        ctx.textBaseline = "top";
        glyphs(text, 0, 0);
        if (node.revealMode === "words") {
          const words = textRevealLayout(
            text,
            node.align,
            "words",
            1,
            (text) => ctx.measureText(text).width,
          ).words;
          ctx.textAlign = "left";
          for (const word of words) glyphs(word.text, word.x, 0, 10);
        }
      }
      if (node.container) {
        const box = textContainerBounds(
          textContainerContent(
            node,
            text,
            (value) => ctx.measureText(value).width,
          ),
          node.container,
        );
        include({
          left: box.x,
          top: box.y,
          right: box.x + box.width,
          bottom: box.y + box.height,
        });
      }
    }
    return result;
  } finally {
    canvas.width = canvas.height = 0;
  }
}
