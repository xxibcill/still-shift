import { pointBounds, preparedTextBounds } from "./provider-bounds.ts";
import { z } from "zod";
import { COMPOSITION_LIMITS } from "@still-shift/scene-contract";
import {
  ComponentNumberFormatSchema,
  ComponentTextFitSchema,
  ComponentValueSchema,
  type ComponentData,
} from "../../../../scene-contract/src/component-data.ts";
import { prepareTextFits } from "../../component-text-fit.ts";
import { prepareMeasuredText } from "../../component-values.ts";
import { drawPreparedPath } from "../../prepared-path-renderer.ts";
import { passageError } from "../../passage-diagnostics.ts";
import {
  preparedProvider,
  type CanvasContentProvider,
  type ProviderResources,
} from "../render/providers.ts";
import {
  StoryTextParamsSchema,
  StoryPathParamsSchema,
  StoryFlowParamsSchema,
} from "./story-providers.ts";
import { CommercePathGeometrySchema } from "./commerce-path.ts";
import { TextAnimatorSchema } from "../../../../scene-contract/src/motion-craft.ts";
import { drawTextContainer } from "../../text-container.ts";
import { drawAnimatedText } from "../../motion-text.ts";
import { compileStoryFlows, drawStoryFlow } from "../../story-flows.ts";
import { drawStoryText } from "../../story-text.ts";
import { AppearanceSchema, appearanceAt, paintNode } from "./appearance.ts";

const CommercePathParamsSchema = StoryPathParamsSchema.extend({
  geometry: CommercePathGeometrySchema,
});

const ComponentFlowParamsSchema = StoryFlowParamsSchema.extend({
  geometry: CommercePathGeometrySchema,
});

const CommerceTextParamsSchema = StoryTextParamsSchema.extend({
  fit: z
    .object({
      minSize: ComponentTextFitSchema.shape.minSize,
      maxSize: ComponentTextFitSchema.shape.maxSize,
    })
    .strict()
    .refine(
      (fit) => fit.minSize <= fit.maxSize,
      "Text fit minimum exceeds maximum",
    )
    .optional(),
  numeric: z
    .object({
      value: ComponentValueSchema,
      format: ComponentNumberFormatSchema,
      samples: z
        .array(z.string().max(128))
        .min(1)
        .max(COMPOSITION_LIMITS.maxKeys),
    })
    .strict()
    .optional(),
});
const CommerceAnimatedTextParamsSchema = CommerceTextParamsSchema.extend({
  animator: TextAnimatorSchema.optional(),
  blendWindows: z
    .array(
      z
        .tuple([z.number().int().nonnegative(), z.number().int().positive()])
        .refine(
          ([start, end]) => end > start,
          "Text blend window must have positive duration",
        ),
    )
    .max(100)
    .optional(),
});
const PaintedTextParamsSchema = CommerceAnimatedTextParamsSchema.extend({
  appearance: AppearanceSchema,
});
type TextParams = z.infer<typeof CommerceAnimatedTextParamsSchema> & {
  appearance?: z.infer<typeof AppearanceSchema>;
};

function validateText(
  { node, samples, fit, numeric, animator }: TextParams,
  path: string,
  extended: boolean,
) {
  if (animator && (animator.node !== node.id || animator.end <= animator.start))
    passageError(
      "comp-provider-params",
      "Text animator must target its content and have positive duration",
      { path: `${path}.params.animator` },
    );
  if (
    (!extended && (!node.textBox || node.container)) ||
    node.style ||
    node.spans?.length ||
    node.decorations?.length ||
    node.transition ||
    node.transitions?.length
  )
    passageError(
      "comp-provider-params",
      "Commerce text requires a plain measured text box",
      {
        path: `${path}.params.node`,
      },
    );
  if (numeric && (node.states || fit))
    passageError(
      "comp-provider-params",
      "Numeric text cannot have states or text fitting",
      {
        path: `${path}.params.numeric`,
      },
    );
  if (samples.some((sample) => sample.state >= (node.states?.length ?? 1)))
    passageError(
      "comp-provider-params",
      "Text sample has no corresponding state",
      {
        path: `${path}.params.samples`,
      },
    );
}

function numericData(
  node: TextParams["node"],
  numeric: NonNullable<TextParams["numeric"]>,
): ComponentData {
  return {
    schemaVersion: "scene-components-1",
    annotations: [],
    values: [numeric.value],
    bindings: [
      {
        kind: "text",
        target: node.id,
        value: numeric.value.id,
        format: numeric.format,
      },
    ],
  };
}

function prepareText(
  params: TextParams,
  resources: ProviderResources,
  path: string,
  extended = false,
) {
  validateText(params, path, extended);
  let { node } = params;
  const { samples, fit, numeric } = params;
  const font = node.fontAsset ? resources.fonts.get(node.fontAsset) : undefined;
  if (!font && (!extended || node.fontAsset || node.textBox))
    passageError(
      "comp-provider-asset",
      "Commerce text requires a declared pinned font",
      {
        path: `${path}.assets`,
      },
    );
  const canvas = document.createElement("canvas");
  const measurement = canvas.getContext("2d")!;
  const fonts = new Map(resources.fonts);
  let layouts;
  try {
    if (fit)
      node = prepareTextFits(
        { nodes: [node] },
        [{ ...fit, target: node.id }],
        measurement,
        fonts,
      ).nodes[0] as typeof node;
    layouts = node.textBox
      ? prepareMeasuredText(
          {
            nodes: [node],
            ...(numeric ? { componentData: numericData(node, numeric) } : {}),
          },
          measurement,
          fonts,
        ).get(node.id)!
      : undefined;
  } finally {
    canvas.width = canvas.height = 0;
  }
  if (numeric?.samples.some((text) => !layouts?.has(text)))
    passageError(
      "comp-provider-params",
      "Numeric sample has no corresponding formatted value",
      {
        path: `${path}.params.numeric.samples`,
      },
    );
  const preparedNode = node;
  return preparedProvider(
    (
      ctx: CanvasRenderingContext2D,
      time: number,
      contentState?: number,
      sourceTime?: number,
    ) => {
      const frame = Math.max(0, Math.floor(time));
      const node = paintNode(preparedNode, params.appearance, frame);
      const state = samples[Math.min(samples.length - 1, frame)]!;
      const text = numeric
        ? numeric.samples[Math.min(numeric.samples.length - 1, frame)]!
        : (node.states?.[contentState ?? state.state] ?? node.text);
      const probe =
        resources.textProbe?.node === node.id
          ? resources.textProbe.mode
          : undefined;
      const layout = layouts?.get(text);
      ctx.fillStyle = node.color;
      ctx.font = font
        ? `${font.weight} ${node.fontSize}px "${font.family}"`
        : `${node.weight} ${node.fontSize}px ${node.font}`;
      ctx.textAlign = node.align;
      if (extended) {
        ctx.textBaseline = "top";
        if (node.container && state.reveal > 0 && probe !== "ink-only")
          drawTextContainer(ctx, node, text);
        if (probe === "container-only") return;
        const blending = params.blendWindows?.some(
          ([start, end]) =>
            (sourceTime ?? time) >= start && (sourceTime ?? time) < end,
        );
        if (
          !blending &&
          drawAnimatedText(
            ctx,
            node,
            text,
            sourceTime ?? frame,
            params.animator,
            layout,
          )
        )
          return;
        if (!node.textBox) {
          drawStoryText(ctx, node, text, state.reveal);
          return;
        }
      }
      if (probe === "container-only") return;
      if (!layout)
        passageError("comp-provider-params", "Text state was not prepared", {
          path,
        });
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
    },
    params.animator
      ? {}
      : {
          boundedCanvas: true,
          bounds: preparedTextBounds(preparedNode, font, layouts),
          visualKey(time, contentState) {
            const frame = Math.max(0, Math.floor(time));
            const state = samples[Math.min(samples.length - 1, frame)]!;
            return JSON.stringify([
              state,
              numeric
                ? numeric.samples[Math.min(numeric.samples.length - 1, frame)]!
                : contentState,
              appearanceAt(params.appearance, frame),
            ]);
          },
        },
  );
}

/** Pinned measured text uses the same layout as commerce, with local content only. */
const TEXT_CONTENT_PROVIDERS: readonly CanvasContentProvider[] = (
  [
    ["commerce.text@1.0.0", StoryTextParamsSchema],
    ["commerce.text@1.1.0", CommerceTextParamsSchema],
    ["commerce.text@1.2.0", CommerceAnimatedTextParamsSchema],
    ["commerce.text@1.3.0", PaintedTextParamsSchema],
  ] as const
).map(([id, schema]) => ({
  id,
  prepare(layer, resources, path) {
    const parsed = schema.safeParse(layer.params);
    if (!parsed.success)
      passageError("comp-provider-params", parsed.error.issues[0]!.message, {
        path: `${path}.params`,
      });
    const extended =
      id === "commerce.text@1.2.0" || id === "commerce.text@1.3.0";
    if (extended) {
      if (!parsed.data.node.fontAsset && !layer.usesSystemFonts)
        passageError(
          "comp-provider-params",
          "Generic text must declare usesSystemFonts",
          { path: `${path}.usesSystemFonts` },
        );
      for (const state of [layer.state, layer.stateFrom])
        for (const value of typeof state === "number"
          ? [state]
          : (state?.keys.map((key) => key.value) ?? []))
          if (value >= (parsed.data.node.states?.length ?? 1))
            passageError(
              "comp-provider-params",
              "Text state has no corresponding content",
              { path: `${path}.state` },
            );
    }
    return prepareText(parsed.data, resources, path, extended);
  },
}));

export const COMMERCE_CONTENT_PROVIDERS: readonly CanvasContentProvider[] = [
  ...TEXT_CONTENT_PROVIDERS,
  {
    id: "component.flow@1.0.0",
    prepare(layer, _resources, path) {
      const parsed = ComponentFlowParamsSchema.safeParse(layer.params);
      if (!parsed.success)
        passageError("comp-provider-params", parsed.error.issues[0]!.message, {
          path: `${path}.params`,
        });
      const { node, geometry, samples } = parsed.data;
      const paths = geometry.points.map((points) => ({ ...node, points }));
      const flow = compileStoryFlows([parsed.data.flow], samples.length)[0]!;
      return preparedProvider(
        (ctx, time) => {
          const frame = Math.max(
            0,
            Math.min(samples.length - 1, Math.floor(time)),
          );
          drawStoryFlow(
            ctx,
            flow,
            paths[Math.min(frame, paths.length - 1)]!,
            samples[frame]!,
            frame,
            samples.length,
            parsed.data.interpolateColors,
          );
        },
        {
          boundedCanvas: true,
          bounds: pointBounds(
            geometry.points.flat(),
            Math.hypot(flow.size, Math.min(2, flow.size)),
          ),
        },
      );
    },
  },

  {
    id: "commerce.path@1.0.0",
    prepare(layer, _resources, path) {
      const parsed = CommercePathParamsSchema.safeParse(layer.params);
      if (!parsed.success)
        passageError("comp-provider-params", parsed.error.issues[0]!.message, {
          path: `${path}.params`,
        });
      const { node, geometry, samples } = parsed.data;
      const paths = geometry.points.map((points) => ({ ...node, points }));
      return preparedProvider(
        (ctx, time) => {
          const frame = Math.max(0, Math.floor(time));
          drawPreparedPath(
            ctx,
            paths[Math.min(frame, paths.length - 1)]!,
            samples[Math.min(frame, samples.length - 1)]!,
          );
        },
        {
          boundedCanvas: true,
          bounds: samples.some((s) => s.pulse > 0)
            ? undefined
            : pointBounds(
                geometry.points.flat(),
                Math.max(1, node.lineWidth) * 3,
              ),
          visualKey(time) {
            const frame = Math.max(0, Math.floor(time));
            return JSON.stringify([
              paths[Math.min(frame, paths.length - 1)]!.points,
              samples[Math.min(frame, samples.length - 1)]!,
            ]);
          },
        },
      );
    },
  },
];
