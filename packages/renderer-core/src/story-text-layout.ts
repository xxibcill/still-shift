import type { PreparedNode } from "../../scene-contract/src/prepared.ts";
import type { StoryRenderScene } from "./story-scene.ts";
import type { LoadedFont } from "./prepared-fonts.ts";
import { passageError } from "./passage-diagnostics.ts";

type TextNode = Extract<PreparedNode, { type: "text" }>;
export function wrapStoryText(
  text: string,
  width: number,
  measure: (text: string) => number,
) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? line + " " + word : word;
      if (line && measure(next) > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}
export function measureStoryText(
  node: TextNode,
  text: string,
  measure: (text: string) => number,
) {
  const spec = node.textLayout;
  const lines = spec ? wrapStoryText(text, spec.width, measure) : [text];
  const width = Math.max(...lines.map(measure));
  const lineHeight = node.fontSize * (spec?.lineHeight ?? 1.2);
  const height = lines.length * lineHeight;
  const left =
    node.align === "center" ? -width / 2 : node.align === "right" ? -width : 0;
  const overflow =
    !!spec && (width > spec.width + 0.01 || height > spec.height + 0.01);
  if (overflow && spec?.overflow === "error")
    passageError("text-overflow", "Text exceeds its layout box: " + node.id, {
      node: node.id,
    });
  return { lines, width, height, lineHeight, left, overflow };
}
export function validateStoryTextLayout(
  scene: StoryRenderScene,
  fonts: Map<string, LoadedFont>,
) {
  const context = document.createElement("canvas").getContext("2d")!;
  for (const node of scene.nodes) {
    if (node.type !== "text" || !node.textLayout) continue;
    const font = fonts.get(node.fontAsset ?? "");
    if (!font)
      passageError(
        "missing-layout-font",
        "Text layout requires a loaded pinned font",
        { node: node.id },
      );
    context.font = `${font.weight} ${node.fontSize}px "${font.family}"`;
    for (const text of node.states ?? [node.text])
      measureStoryText(node, text, (value) => context.measureText(value).width);
    const { width, height } = node.textLayout;
    const left =
      node.align === "center"
        ? -width / 2
        : node.align === "right"
          ? -width
          : 0;
    const inset = scene.safeInset ?? 0;
    if (
      !node.parent &&
      (node.x + left < inset ||
        node.x + left + width > scene.width - inset ||
        node.y < inset ||
        node.y + height > scene.height - inset)
    )
      passageError(
        "text-outside-safe-area",
        "Text layout is outside the output safe area",
        { node: node.id },
      );
  }
}
