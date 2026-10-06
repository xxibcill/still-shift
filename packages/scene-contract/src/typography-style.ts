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
