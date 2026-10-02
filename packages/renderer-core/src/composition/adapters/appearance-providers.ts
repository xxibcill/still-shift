import { StoryRectParamsSchema } from "./story-providers.ts";
import { AppearanceSchema, paintNode } from "./appearance.ts";
import { drawPreparedRect } from "../../prepared-rect-renderer.ts";
import { passageError } from "../../passage-diagnostics.ts";
import type { CanvasContentProvider } from "../render/providers.ts";

export const PaintedRectParamsSchema = StoryRectParamsSchema.extend({
  appearance: AppearanceSchema,
});
export const APPEARANCE_PROVIDERS: readonly CanvasContentProvider[] = [
  {
    id: "component.rect@1.0.0",
    prepare(layer, _resources, path) {
      const parsed = PaintedRectParamsSchema.safeParse(layer.params);
      if (!parsed.success)
        passageError("comp-provider-params", parsed.error.issues[0]!.message, {
          path: `${path}.params`,
        });
      const { node, samples, appearance } = parsed.data;
      return (ctx, time) => {
        const frame = Math.max(0, Math.floor(time));
        drawPreparedRect(
          ctx,
          paintNode(node, appearance, frame),
          samples[Math.min(frame, samples.length - 1)]!.reveal,
        );
      };
    },
  },
];
