import { StoryRectParamsSchema } from "./story-providers.ts";
import { AppearanceSchema, appearanceAt, paintNode } from "./appearance.ts";
import { drawPreparedRect } from "../../prepared-rect-renderer.ts";
import { passageError } from "../../passage-diagnostics.ts";
import {
  preparedProvider,
  type CanvasContentProvider,
} from "../render/providers.ts";

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
      return preparedProvider(
        (ctx, time) => {
          const frame = Math.max(0, Math.floor(time));
          drawPreparedRect(
            ctx,
            paintNode(node, appearance, frame),
            samples[Math.min(frame, samples.length - 1)]!.reveal,
          );
        },
        {
          bounds: (() => {
            const stroke =
              Math.max(
                1,
                Math.abs(node.lineWidth),
                ...(appearance.strokeWidth ?? []).map(Math.abs),
              ) / 2;
            return {
              left: -stroke,
              top: -stroke,
              right: node.width + stroke,
              bottom: node.height + stroke,
            };
          })(),
          visualKey: (time) =>
            JSON.stringify([
              appearanceAt(appearance, time),
              samples[
                Math.min(Math.max(0, Math.floor(time)), samples.length - 1)
              ],
            ]),
        },
      );
    },
  },
];
