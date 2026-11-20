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
