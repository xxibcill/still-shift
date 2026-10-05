import type { TextStyle } from "../../scene-contract/src/typography.ts";
import type { LoadedFont } from "./prepared-fonts.ts";

import {
  ROLE_LEADING,
  opticalTracking,
  resolvedTextStyle,
} from "@still-shift/scene-contract";
export { ROLE_LEADING, opticalTracking, resolvedTextStyle };
export type { TextNode } from "@still-shift/scene-contract";
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
