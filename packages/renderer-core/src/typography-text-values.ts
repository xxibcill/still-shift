import { componentTextVariants } from "./component-values.ts";
import { countText } from "./typography-transition.ts";
import type { TextNode } from "./typography-style.ts";

/** Font variants and glyph rasters must prepare the same authored and generated text. */
export function typographyTextValues(
  scene: Parameters<typeof componentTextVariants>[0],
  node: TextNode,
): Set<string> {
  const values = new Set([
    node.text,
    ...(node.states ?? []),
    ...componentTextVariants(scene, node),
  ]);
  for (const transition of node.transitions ??
    (node.transition ? [node.transition] : []))
    if (transition.kind === "count")
      for (
        let frame = transition.window.start;
        frame <= transition.window.end;
        frame++
      )
        values.add(countText(node, transition, frame));
  if (values.size > 10000)
    throw new Error("text-layout-budget: more than 10000 states");
  return values;
}
