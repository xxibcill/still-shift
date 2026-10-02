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
import { passageError } from "../../passage-diagnostics.ts";
import type {
  CanvasContentProvider,
  ProviderResources,
} from "../render/providers.ts";
import { StoryTextParamsSchema } from "./story-providers.ts";

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
type TextParams = z.infer<typeof CommerceTextParamsSchema>;

function validateText(
  { node, samples, fit, numeric }: TextParams,
  path: string,
) {
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
) {
  validateText(params, path);
  let { node } = params;
  const { samples, fit, numeric } = params;
  const font = node.fontAsset ? resources.fonts.get(node.fontAsset) : undefined;
  if (!font)
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
    layouts = prepareMeasuredText(
      {
        nodes: [node],
        ...(numeric ? { componentData: numericData(node, numeric) } : {}),
      },
      measurement,
      fonts,
    ).get(node.id)!;
  } finally {
    canvas.width = canvas.height = 0;
  }
  if (numeric?.samples.some((text) => !layouts.has(text)))
    passageError(
      "comp-provider-params",
      "Numeric sample has no corresponding formatted value",
      {
        path: `${path}.params.numeric.samples`,
      },
    );
  return (ctx: CanvasRenderingContext2D, time: number) => {
    const frame = Math.max(0, Math.floor(time));
    const state = samples[Math.min(samples.length - 1, frame)]!;
    const text = numeric
      ? numeric.samples[Math.min(numeric.samples.length - 1, frame)]!
      : (node.states?.[state.state] ?? node.text);
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
}

/** Pinned measured text uses the same layout as commerce, with local content only. */
export const COMMERCE_CONTENT_PROVIDERS: readonly CanvasContentProvider[] = (
  [
    ["commerce.text@1.0.0", StoryTextParamsSchema],
    ["commerce.text@1.1.0", CommerceTextParamsSchema],
  ] as const
).map(([id, schema]) => ({
  id,
  prepare(layer, resources, path) {
    const parsed = schema.safeParse(layer.params);
    if (!parsed.success)
      passageError("comp-provider-params", parsed.error.issues[0]!.message, {
        path: `${path}.params`,
      });
    return prepareText(parsed.data, resources, path);
  },
}));
