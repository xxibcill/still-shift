import type { PreparedNode } from "../../scene-contract/src/prepared.ts";
type TextNode = Extract<PreparedNode, { type: "text" }>;
export type TextLayout = {
  lines: string[];
  lineHeight: number;
  baseline: number;
  descent: number;
};

export function measureTextLayout(
  ctx: CanvasRenderingContext2D,
  node: TextNode,
): TextLayout {
  const box = node.textBox;
  if (!box) throw new Error("Measured text requires a text box");
  const lines: string[] = [];
  const segmenter = new Intl.Segmenter(box.locale, { granularity: "word" });
  const width = (text: string) => {
    const metrics = ctx.measureText(text);
    return Math.max(
      metrics.width,
      metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight,
    );
  };
  for (const paragraph of node.text.split("\n")) {
    let line = "";
    for (const { segment } of segmenter.segment(paragraph)) {
      const candidate = line + segment;
      if (width(candidate.trimEnd()) <= node.width) {
        line = candidate;
        continue;
      }
      if (line.trim()) lines.push(line.trimEnd());
      line = segment.trimStart();
      if (width(line) > node.width)
        throw new Error(
          "Text does not fit " + node.id + "; shorten a word or widen its box",
        );
    }
    lines.push(line.trimEnd());
  }
  const lineHeight = node.fontSize * box.lineHeight;
  const metrics = lines.map((line) => ctx.measureText(line));
  const ascent = Math.max(
    node.fontSize,
    ...metrics.map((m) => m.actualBoundingBoxAscent),
  );
  const descent = Math.max(
    0,
    ...metrics.map((m) => m.actualBoundingBoxDescent),
  );
  if (
    lines.length > box.maxLines ||
    ascent + descent + Math.max(0, lines.length - 1) * lineHeight > node.height
  )
    throw new Error(
      "Text overflows " +
        node.id +
        "; shorten the copy or choose a larger layout",
    );
  return { lines, lineHeight, baseline: ascent, descent };
}
