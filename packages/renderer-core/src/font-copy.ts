import type { PreparedNode } from "../../scene-contract/src/prepared.ts";
import type { TextStyle } from "../../scene-contract/src/typography.ts";
import { typographyTextValues } from "./typography-text-values.ts";
import {
  caseText,
  resolvedTextStyle,
  type TextNode,
} from "./typography-style.ts";
import { FONT_IDENTITY_LIMITS, type FontTextRun } from "./font-identity.ts";
import { passageError } from "./passage-diagnostics.ts";

export type FontCopyScene = Parameters<typeof typographyTextValues>[0] & {
  nodes?: readonly PreparedNode[] | undefined;
  textStyles?: Record<string, TextStyle> | undefined;
  textEvents?:
    | readonly {
        node: string;
        verb: string;
        replacement?: string | undefined;
        at?: unknown;
        duration?: number | undefined;
      }[]
    | undefined;
};
export type CollectedFontTextRun = FontTextRun & { fontAsset: string };

/** Collect the same generated values and per-grapheme case transforms as shaping. */
export function collectFontTextRuns(
  scene: FontCopyScene,
): CollectedFontTextRun[] {
  const runs: CollectedFontTextRun[] = [];
  let codeUnits = 0;
  const append = (node: TextNode, text: string, path: string) => {
    codeUnits += text.length;
    if (
      text.length > FONT_IDENTITY_LIMITS.textValueCodeUnits ||
      codeUnits > FONT_IDENTITY_LIMITS.textCodepoints
    )
      passageError(
        "font-copy-budget",
        "font-copy-budget: reachable copy exceeds the inspection budget",
        { node: node.id, path },
      );
    runs.push(...textRuns(node, text, scene.textStyles ?? {}, path));
  };
  for (const [nodeIndex, node] of (scene.nodes ?? []).entries()) {
    if (node.type !== "text") continue;
    for (const text of typographyTextValues(scene, node)) {
      const state = node.states?.indexOf(text) ?? -1;
      const path = valuePath(scene, node, nodeIndex, text, state);
      append(node, text, path);
      if (runs.length > FONT_IDENTITY_LIMITS.textRuns)
        passageError(
          "font-copy-budget",
          "font-copy-budget: too many reachable font runs",
          { node: node.id, path },
        );
    }
  }
  for (const [index, event] of (scene.textEvents ?? []).entries()) {
    if (event.verb !== "correct" || event.replacement === undefined) continue;
    const node = scene.nodes?.find(
      (node): node is TextNode =>
        node.id === event.node && node.type === "text",
    );
    if (!node) continue;
    append(
      { ...node, spans: undefined },
      event.replacement,
      `textEvents.${index}.replacement`,
    );
  }
  if (runs.length > FONT_IDENTITY_LIMITS.textRuns)
    passageError(
      "font-copy-budget",
      "font-copy-budget: too many correction font runs",
    );
  return runs;
}
function textRuns(
  node: TextNode,
  text: string,
  styles: Record<string, TextStyle>,
  path: string,
): CollectedFontTextRun[] {
  const locale = node.locale ?? node.textBox?.locale ?? "en";
  const runs: CollectedFontTextRun[] = [];
  for (const [index, segment] of [
    ...new Intl.Segmenter(locale, { granularity: "grapheme" }).segment(text),
  ].entries()) {
    const span = node.spans?.find(
      (span) => index >= span.start && index < span.end,
    );
    const style = resolvedTextStyle(node, styles, span?.style);
    if (!style.fontAsset) continue;
    const value = caseText(segment.segment, style, locale);
    const previous = runs.at(-1);
    if (
      previous?.fontAsset === style.fontAsset &&
      previous.span === span?.id &&
      JSON.stringify(previous.axes) === JSON.stringify(style.axes)
    )
      previous.text += value;
    else
      runs.push({
        text: value,
        fontAsset: style.fontAsset,
        node: node.id,
        path,
        ...(span?.id ? { span: span.id } : {}),
        ...(style.axes ? { axes: style.axes } : {}),
      });
  }
  return runs;
}

function valuePath(
  scene: FontCopyScene,
  node: TextNode,
  nodeIndex: number,
  text: string,
  state: number,
) {
  if (state >= 0) return `nodes.${nodeIndex}.states.${state}`;
  if (text === node.text) return `nodes.${nodeIndex}.text`;
  const binding =
    scene.componentData?.bindings.findIndex(
      (binding) => binding.kind === "text" && binding.target === node.id,
    ) ?? -1;
  if (binding >= 0) return `componentData.bindings.${binding}`;
  const count =
    node.transitions?.findIndex((transition) => transition.kind === "count") ??
    -1;
  return `nodes.${nodeIndex}.${count >= 0 ? `transitions.${count}` : "transition"}`;
}
