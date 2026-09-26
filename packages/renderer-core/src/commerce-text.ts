import {
  PreparedFontSchema,
  PreparedNodeSchema,
} from "../../scene-contract/src/prepared.ts";
import type { CommerceScene } from "../../scene-contract/src/commerce.ts";
import type {
  ComponentBounds,
  CommerceFragment,
} from "./commerce-composition.ts";

/** Keeps supplied copy and font dependencies together; measurement uses the shared font loader. */
export function buildTextBlock(options: {
  id: string;
  text: string;
  box: ComponentBounds;
  font: CommerceScene["fonts"][number];
  locale: "en" | "th";
  fontSize: number;
  color: string;
  maxLines?: number;
  align?: "left" | "center" | "right";
}): CommerceFragment {
  const font = PreparedFontSchema.parse(options.font);
  if (!options.text.trim()) throw new Error("Text Block needs supplied copy");
  const node = PreparedNodeSchema.parse({
    type: "text",
    id: options.id,
    text: options.text,
    ...options.box,
    fontSize: options.fontSize,
    color: options.color,
    fontAsset: font.id,
    align: options.align ?? "left",
    textBox: {
      locale: options.locale,
      maxLines: options.maxLines ?? 3,
      lineHeight: options.locale === "th" ? 1.5 : 1.28,
    },
  });
  return { nodes: [node], fonts: [font], events: [], bounds: options.box };
}
