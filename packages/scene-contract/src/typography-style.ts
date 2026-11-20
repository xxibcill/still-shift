import type { PreparedNode } from "./prepared.ts";
import type { TextStyle } from "./typography.ts";

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
/**
 * A font asset's variable axes by id (any value per axis tag), or undefined
 * when the font is unknown here.
 */
export type FontAxesLookup = (
  fontAsset: string,
) => Readonly<Record<string, unknown>> | undefined;

/**
 * Declared axes of a scene's fonts (a static font has none). Accepts a
 * scene's `fonts` or a composition's assets, whose non-font entries (any
 * other `type`) are skipped.
 */
export function declaredFontAxes(
  fonts:
    | Iterable<{
        id: string;
        type?: string;
        variable?: Readonly<Record<string, unknown>> | undefined;
      }>
    | undefined,
): FontAxesLookup | undefined {
  if (!fonts) return undefined;
  const axes = new Map<string, Readonly<Record<string, unknown>>>();
  for (const font of fonts)
    if ((font.type === undefined || font.type === "font") && !axes.has(font.id))
      axes.set(font.id, font.variable ?? {});
  return (id) => axes.get(id);
}

/**
 * A span style over its layer's style. A span style that sets no `axes`
 * inherits the base axes, but with `fontAxes` it keeps only those its own
 * font has: a static script span under a variable serif's `wght` gets no
 * `wght`. Without `fontAxes` (or for an unknown font) the merge is plain.
 * Inherited axes the font has are kept and still range-checked, and explicit
 * span axes are never dropped.
 */
export function spanStyleOver<T extends TextStyle>(
  base: T,
  span: TextStyle | undefined,
  fontAxes?: FontAxesLookup,
): T & TextStyle {
  const style = { ...base, ...span };
  if (!span || span.axes !== undefined || !style.axes || !fontAxes)
    return style;
  const own = fontAxes(style.fontAsset ?? "");
  if (!own) return style;
  const kept = Object.entries(style.axes).filter(([tag]) =>
    Object.hasOwn(own, tag),
  );
  if (kept.length === Object.keys(style.axes).length) return style;
  const resolved: TextStyle = { ...style };
  if (kept.length) resolved.axes = Object.fromEntries(kept);
  else delete resolved.axes;
  return resolved as T & TextStyle;
}

/**
 * A text node's style, or with `spanStyle` that span's style over it.
 * `fontAxes` resolves a span style's inherited axes against its own font.
 * It is required with a span style, so a caller that reads only case, size
 * or font passes `undefined` deliberately rather than by omission.
 */
export function resolvedTextStyle(
  node: TextNode,
  styles: Record<string, TextStyle>,
): TextStyle;
export function resolvedTextStyle(
  node: TextNode,
  styles: Record<string, TextStyle>,
  spanStyle: string | undefined,
  fontAxes: FontAxesLookup | undefined,
): TextStyle;
export function resolvedTextStyle(
  node: TextNode,
  styles: Record<string, TextStyle>,
  spanStyle?: string,
  fontAxes?: FontAxesLookup,
): TextStyle {
  const base = node.style ? styles[node.style] : undefined;
  const style = spanStyleOver(
    {
      fontAsset: node.fontAsset,
      size: node.fontSize,
      leading: ROLE_LEADING[node.textRole ?? "body"],
      ...base,
    },
    spanStyle ? styles[spanStyle] : undefined,
    fontAxes,
  );
  return {
    ...style,
    tracking:
      style.tracking ??
      (style.opticalTracking
        ? opticalTracking(style.size ?? node.fontSize)
        : 0),
  };
}
