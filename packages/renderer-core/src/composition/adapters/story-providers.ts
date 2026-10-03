import { pointBounds, preparedTextBounds } from "./provider-bounds.ts";
import { z } from "zod";
import {
  COMPOSITION_LIMITS,
  PreparedNodeSchema,
  StoryFlowSchema,
} from "@still-shift/scene-contract";
import { drawPreparedPath } from "../../prepared-path-renderer.ts";
import { drawPreparedRect } from "../../prepared-rect-renderer.ts";
import { compileStoryFlows, drawStoryFlow } from "../../story-flows.ts";
import { drawStoryText } from "../../story-text.ts";
import { passageError } from "../../passage-diagnostics.ts";
import {
  preparedProvider,
  type CanvasContentProvider,
  type ProviderLayer,
} from "../render/providers.ts";
import { StoryPathGeometrySchema, sampleStoryPath } from "./story-path.ts";

const finite = z.number().finite();
const unit = finite.min(0).max(1);
const frames = <T extends z.ZodType>(sample: T) =>
  z.array(sample).min(1).max(COMPOSITION_LIMITS.maxKeys);
const pathNode = PreparedNodeSchema.options[1];
const textNode = PreparedNodeSchema.options[2];
const pathSample = z
  .object({ reveal: unit, gap: unit, pinch: unit, pulse: unit })
  .strict();
export const StoryPathParamsSchema = z
  .object({ node: pathNode, samples: frames(pathSample) })
  .strict();
export const StoryFlowParamsSchema = z
  .object({
    node: pathNode,
    flow: StoryFlowSchema,
    interpolateColors: z.boolean().optional(),
    samples: frames(z.object({ reveal: unit, gap: unit }).strict()),
  })
  .strict();
export const StoryTextParamsSchema = z
  .object({
    node: textNode,
    samples: frames(
      z.object({ reveal: unit, state: finite.int().min(0).max(11) }).strict(),
    ),
  })
  .strict();
export const StoryAttachedPathParamsSchema = StoryPathParamsSchema.extend({
  geometry: StoryPathGeometrySchema,
});
export const StoryAttachedFlowParamsSchema = StoryFlowParamsSchema.extend({
  geometry: StoryPathGeometrySchema,
});
export const StoryRectParamsSchema = z
  .object({
    node: PreparedNodeSchema.options[3],
    samples: frames(z.object({ reveal: unit }).strict()),
  })
  .strict();

function parse<T extends z.ZodType>(
  schema: T,
  layer: ProviderLayer,
  path: string,
): z.infer<T> {
  const result = schema.safeParse(layer.params);
  if (!result.success)
    passageError("comp-provider-params", result.error.issues[0]!.message, {
      path: `${path}.params`,
    });
  return result.data;
}
function sample<T>(samples: T[], time: number): T {
  return samples[Math.max(0, Math.min(samples.length - 1, Math.floor(time)))]!;
}

/** These providers draw local content only; the composition graph owns all transforms and compositing. */
export const STORY_CONTENT_PROVIDERS: readonly CanvasContentProvider[] = [
  {
    id: "story.rect@1.0.0",
    prepare(layer, _resources, path) {
      const params = parse(StoryRectParamsSchema, layer, path);
      const stroke = params.node.stroke
        ? Math.max(1, Math.abs(params.node.lineWidth)) / 2
        : 0;
      return preparedProvider(
        (ctx, time) =>
          drawPreparedRect(
            ctx,
            params.node,
            sample(params.samples, time).reveal,
          ),
        {
          boundedCanvas: true,
          visualKey: (time) => JSON.stringify(sample(params.samples, time)),
          bounds: {
            left: -stroke,
            top: -stroke,
            right: params.node.width + stroke,
            bottom: params.node.height + stroke,
          },
        },
      );
    },
  },
  {
    id: "story.path@1.1.0",
    prepare(layer, _resources, path) {
      const params = parse(StoryAttachedPathParamsSchema, layer, path);
      return preparedProvider(
        (ctx, time) =>
          drawPreparedPath(
            ctx,
            sampleStoryPath(params.node, params.geometry, time),
            sample(params.samples, time),
          ),
        {
          boundedCanvas: true,
          visualKey: (time) =>
            JSON.stringify([
              sampleStoryPath(params.node, params.geometry, time).points,
              sample(params.samples, time),
            ]),
          bounds: params.samples.some((s) => s.pulse > 0)
            ? undefined
            : pointBounds(
                params.geometry.endpoints.flatMap(
                  (_, frame) =>
                    sampleStoryPath(params.node, params.geometry, frame).points,
                ),
                Math.max(1, params.node.lineWidth) * 3,
              ),
        },
      );
    },
  },
  {
    id: "story.flow@1.1.0",
    prepare(layer, _resources, path) {
      const params = parse(StoryAttachedFlowParamsSchema, layer, path);
      const flow = compileStoryFlows([params.flow], params.samples.length)[0]!;
      return preparedProvider(
        (ctx, time) => {
          const frame = Math.max(
            0,
            Math.min(params.samples.length - 1, Math.floor(time)),
          );
          drawStoryFlow(
            ctx,
            flow,
            sampleStoryPath(params.node, params.geometry, frame),
            sample(params.samples, frame),
            frame,
            params.samples.length,
            params.interpolateColors,
          );
        },
        {
          boundedCanvas: true,
          bounds: pointBounds(
            params.geometry.endpoints.flatMap(
              (_, frame) =>
                sampleStoryPath(params.node, params.geometry, frame).points,
            ),
            Math.hypot(flow.size, Math.min(2, flow.size)),
          ),
        },
      );
    },
  },
  {
    id: "story.path@1.0.0",
    prepare(layer, _resources, path) {
      const params = parse(StoryPathParamsSchema, layer, path);
      return preparedProvider(
        (ctx, time) =>
          drawPreparedPath(ctx, params.node, sample(params.samples, time)),
        {
          boundedCanvas: true,
          visualKey: (time) => JSON.stringify(sample(params.samples, time)),
          bounds: params.samples.some((s) => s.pulse > 0)
            ? undefined
            : pointBounds(
                params.node.points,
                Math.max(1, params.node.lineWidth) * 3,
              ),
        },
      );
    },
  },
  {
    id: "story.flow@1.0.0",
    prepare(layer, _resources, path) {
      const params = parse(StoryFlowParamsSchema, layer, path);
      const flow = compileStoryFlows([params.flow], params.samples.length)[0]!;
      return preparedProvider(
        (ctx, time) => {
          // Baked adapter content has one exact sample per integer source frame.
          const frame = Math.max(
            0,
            Math.min(params.samples.length - 1, Math.floor(time)),
          );
          drawStoryFlow(
            ctx,
            flow,
            params.node,
            sample(params.samples, frame),
            frame,
            params.samples.length,
            params.interpolateColors,
          );
        },
        {
          boundedCanvas: true,
          bounds: pointBounds(
            params.node.points,
            Math.hypot(flow.size, Math.min(2, flow.size)),
          ),
        },
      );
    },
  },
  {
    id: "story.text@1.0.0",
    prepare(layer, resources, path) {
      const { node, samples } = parse(StoryTextParamsSchema, layer, path);
      const font = node.fontAsset
        ? resources.fonts.get(node.fontAsset)
        : undefined;
      if (!node.fontAsset && layer.usesSystemFonts !== true)
        passageError(
          "comp-provider-params",
          "Generic text must declare usesSystemFonts",
          { path: `${path}.usesSystemFonts` },
        );
      if (node.fontAsset && !font)
        passageError(
          "comp-provider-asset",
          `Font ${node.fontAsset} was not declared or loaded`,
          { path: `${path}.assets` },
        );
      if (
        node.textBox ||
        node.container ||
        node.style ||
        node.spans?.length ||
        node.decorations?.length ||
        node.transition ||
        node.transitions?.length
      )
        passageError(
          "comp-provider-params",
          "The first story text provider supports plain legacy text and textLayout",
          { path: `${path}.params.node` },
        );
      for (const state of samples)
        if (state.state >= (node.states?.length ?? 1))
          passageError(
            "comp-provider-params",
            "Text sample has no corresponding state",
            { path: `${path}.params.samples` },
          );
      return preparedProvider(
        (ctx, time) => {
          const state = sample(samples, time);
          ctx.fillStyle = node.color;
          ctx.font = font
            ? `${font.weight} ${node.fontSize}px "${font.family}"`
            : `${node.weight} ${node.fontSize}px ${node.font}`;
          ctx.textAlign = node.align;
          ctx.textBaseline = "top";
          drawStoryText(
            ctx,
            node,
            node.states?.[state.state] ?? node.text,
            state.reveal,
          );
        },
        {
          boundedCanvas: true,
          visualKey: (time) => JSON.stringify(sample(samples, time)),
          bounds: preparedTextBounds(node, font),
        },
      );
    },
  },
];
