import type { PreparedNode } from "../../scene-contract/src/prepared.ts";
import type { TextStyle } from "../../scene-contract/src/typography.ts";
import type { LoadedFont } from "./prepared-fonts.ts";

export type TextNode = Extract<PreparedNode, { type: "text" }>;
export const ROLE_LEADING = {
  heading: 1.12,
  label: 1.28,
  qualification: 1.4,
  body: 1.5,
} as const;
export function opticalTracking(size: number) {
  return Math.max(-25, Math.min(35, 35 - (size - 16) * 0.75));
}
export function resolvedTextStyle(
  node: TextNode,
  styles: Record<string, TextStyle>,
  spanStyle?: string,
): TextStyle {
  const base = node.style ? styles[node.style] : undefined;
  const style = {
    fontAsset: node.fontAsset,
    size: node.fontSize,
    leading: ROLE_LEADING[node.textRole ?? "body"],
    ...base,
    ...(spanStyle ? styles[spanStyle] : {}),
  };
  return {
    ...style,
    tracking:
      style.tracking ??
      (style.opticalTracking
        ? opticalTracking(style.size ?? node.fontSize)
        : 0),
  };
}
export function styleFontKey(style: TextStyle) {
  return `${style.fontAsset}:${JSON.stringify([Object.entries(style.features ?? {}).sort(), Object.entries(style.axes ?? {}).sort(), style.case === "small-caps", style.figures ?? null])}`;
}
export function applyTextStyle(
  ctx: CanvasRenderingContext2D,
  style: TextStyle,
  fonts: Map<string, LoadedFont>,
) {
  const font =
    fonts.get(styleFontKey(style)) ?? fonts.get(style.fontAsset ?? "");
  if (!font) throw new Error(`missing-layout-font: ${style.fontAsset}`);
  const size = style.size ?? 48;
  ctx.font = `${font.style ?? "normal"} ${font.weight} ${size}px "${font.family}"`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fontKerning = style.features?.kern === 0 ? "none" : "normal";
  ctx.fontVariantCaps = style.case === "small-caps" ? "small-caps" : "normal";
  if (!("letterSpacing" in ctx) && style.tracking)
    throw new Error("unsupported-typography: Canvas letterSpacing");
  ctx.letterSpacing = `${((style.tracking ?? 0) * size) / 1000}px`;
  return font;
}
export function caseText(text: string, style: TextStyle, locale: string) {
  return style.case === "upper"
    ? text.toLocaleUpperCase(locale)
    : style.case === "lower"
      ? text.toLocaleLowerCase(locale)
      : text;
}
