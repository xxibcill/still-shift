import { prepareMeasuredText } from "../../component-values.ts";
import { passageError } from "../../passage-diagnostics.ts";
import type { CanvasContentProvider } from "../render/providers.ts";
import { StoryTextParamsSchema } from "./story-providers.ts";

/** Pinned measured text uses the same layout as commerce, with local content only. */
export const COMMERCE_CONTENT_PROVIDERS: readonly CanvasContentProvider[] = [
  {
    id: "commerce.text@1.0.0",
    prepare(layer, resources, path) {
      const parsed = StoryTextParamsSchema.safeParse(layer.params);
      if (!parsed.success)
        passageError("comp-provider-params", parsed.error.issues[0]!.message, {
          path: `${path}.params`,
        });
      const { node, samples } = parsed.data;
      if (
        !node.textBox ||
        node.container ||
        node.style ||
        node.spans?.length ||
        node.decorations?.length ||
        node.transition ||
        node.transitions?.length
      )
        passageError(
          "comp-provider-params",
          "Commerce text requires a plain measured text box",
          { path: `${path}.params.node` },
        );
      const font = node.fontAsset
        ? resources.fonts.get(node.fontAsset)
        : undefined;
      if (!font)
        passageError(
          "comp-provider-asset",
          "Commerce text requires a declared pinned font",
          { path: `${path}.assets` },
        );
      if (samples.some((sample) => sample.state >= (node.states?.length ?? 1)))
        passageError(
          "comp-provider-params",
          "Text sample has no corresponding state",
          { path: `${path}.params.samples` },
        );
      const canvas = document.createElement("canvas");
      const measurement = canvas.getContext("2d")!;
      const layouts = prepareMeasuredText(
        { nodes: [node] },
        measurement,
        new Map(resources.fonts),
      ).get(node.id)!;
      canvas.width = canvas.height = 0;
      return (ctx, time) => {
        const state =
          samples[Math.max(0, Math.min(samples.length - 1, Math.floor(time)))]!;
        const text = node.states?.[state.state] ?? node.text;
        const layout = layouts.get(text)!;
        ctx.fillStyle = node.color;
        ctx.font = `${font.weight} ${node.fontSize}px "${font.family}"`;
        ctx.textAlign = node.align;
        ctx.textBaseline = "alphabetic";
        const x =
          node.align === "center"
            ? node.width / 2
            : node.align === "right"
              ? node.width
              : 0;
        layout.lines.forEach((line, index) =>
          ctx.fillText(line, x, layout.baseline + index * layout.lineHeight),
        );
      };
    },
  },
];
