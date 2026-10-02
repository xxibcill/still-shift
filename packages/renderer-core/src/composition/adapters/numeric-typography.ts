import { z } from "zod";
import {
  COMPOSITION_LIMITS,
  type CommerceScene,
  type StoryScene,
  type PreparedNode,
} from "@still-shift/scene-contract";
import {
  ComponentNumberFormatSchema,
  ComponentValueSchema,
} from "../../../../scene-contract/src/component-data.ts";
import {
  TextStyleSchema,
  TextEventSchema,
} from "../../../../scene-contract/src/typography.ts";
import {
  TextAnimatorSchema,
  SignalSchema,
} from "../../../../scene-contract/src/motion-craft.ts";
import {
  prepareTypography,
  drawTypography,
} from "../../typography-renderer.ts";
import { loadTextStyleFont } from "../../prepared-fonts.ts";
import { loadTextAnimationFonts } from "../../typography-axes.ts";
import { resolvedTextStyle } from "../../typography-style.ts";
import { componentText } from "../../component-values.ts";
import { resolveTextEvents } from "../../typography-events.ts";
import { passageError } from "../../passage-diagnostics.ts";
import { StoryTextParamsSchema } from "./story-providers.ts";
import {
  params,
  preparedBaseLayer,
  trimSettledSamples,
  type Samples,
} from "./prepared.ts";
import type {
  CanvasContentProvider,
  ProviderLayer,
} from "../render/providers.ts";

export const NumericTypographyParamsSchema = StoryTextParamsSchema.extend({
  fps: z.number().positive().max(240),
  frameCount: z.number().int().positive().max(COMPOSITION_LIMITS.maxKeys),
  numeric: z
    .object({
      value: ComponentValueSchema,
      format: ComponentNumberFormatSchema,
      samples: z
        .array(z.string().max(128))
        .min(1)
        .max(COMPOSITION_LIMITS.maxKeys),
    })
    .strict(),
  textStyles: z.record(z.string(), TextStyleSchema),
  textAnimators: z.array(TextAnimatorSchema).max(100),
  signals: z.array(SignalSchema).max(100),
  textEvents: z.array(TextEventSchema).max(100),
}).strict();
type Params = z.infer<typeof NumericTypographyParamsSchema>;

function parse(layer: ProviderLayer, path: string): Params {
  const parsed = NumericTypographyParamsSchema.safeParse(layer.params);
  if (!parsed.success)
    passageError("comp-provider-params", parsed.error.issues[0]!.message, {
      path: `${path}.params`,
    });
  const value = parsed.data;
  if (
    !value.node.fontAsset ||
    !value.node.textBox ||
    value.node.states ||
    value.node.textLayout ||
    value.samples.some((sample) => sample.state !== 0) ||
    value.textAnimators.some((animator) => animator.node !== value.node.id) ||
    value.textEvents.some(
      (event) =>
        event.node !== value.node.id ||
        event.verb !== "correct" ||
        typeof event.at !== "number",
    )
  )
    passageError(
      "comp-provider-params",
      "Numeric typography requires one pinned text box and local resolved animation",
      { path: `${path}.params` },
    );
  return value;
}

function textScene(data: Params): Parameters<typeof prepareTypography>[0] {
  return {
    nodes: [data.node],
    fps: data.fps,
    frameCount: data.frameCount,
    timeline: {
      fps: data.fps,
      frameCount: data.frameCount,
      durationMs: (data.frameCount * 1000) / data.fps,
    },
    tracks: {},
    followers: {},
    typography: "type-1",
    textStyles: data.textStyles,
    textAnimators: data.textAnimators,
    signals: data.signals,
    textEvents: data.textEvents,
    // Preparation uses local samples, never a family evaluator. Every formatted
    // value is still shaped so an unvisited overflowing value cannot slip through.
    animationFrames: {
      [data.node.id]: Array.from({ length: data.frameCount }, (_, i) => i),
    },
    componentData: {
      schemaVersion: "scene-components-1",
      annotations: [],
      values: [data.numeric.value],
      bindings: [
        {
          kind: "text",
          target: data.node.id,
          value: data.numeric.value.id,
          format: data.numeric.format,
        },
      ],
    },
  } as unknown as Parameters<typeof prepareTypography>[0];
}

/** Formatted component values stay bounded data; only local glyph drawing runs per frame. */
export const NUMERIC_TYPOGRAPHY_PROVIDER: CanvasContentProvider = {
  id: "component.typography@1.0.0",
  async loadFonts(layer, fonts, path) {
    const data = parse(layer, path);
    for (const span of [undefined, ...(data.node.spans ?? [])])
      await loadTextStyleFont(
        resolvedTextStyle(data.node, data.textStyles, span?.style),
        fonts,
      );
    await loadTextAnimationFonts(textScene(data), fonts);
  },
  prepare(layer, resources, path) {
    const data = parse(layer, path);
    if (!resources.fonts.has(data.node.fontAsset!))
      passageError(
        "comp-provider-asset",
        "Numeric typography requires its declared pinned font",
        { path: `${path}.assets` },
      );
    const prepared = prepareTypography(
      textScene(data),
      new Map(resources.fonts),
    );
    return (ctx, time) => {
      const frame = Math.max(
        0,
        Math.min(data.frameCount - 1, Math.floor(time)),
      );
      const text =
        data.numeric.samples[Math.min(frame, data.numeric.samples.length - 1)]!;
      const sample = data.samples[Math.min(frame, data.samples.length - 1)]!;
      drawTypography(ctx, { ...data.node, text }, sample, prepared, frame);
    };
  },
};

export function numericTypographyLayer(
  scene: CommerceScene | StoryScene,
  node: Extract<PreparedNode, { type: "text" }>,
  samples: Samples,
): ProviderLayer | undefined {
  const binding = scene.componentData?.bindings.find(
    (b) => b.kind === "text" && b.target === node.id,
  );
  if (binding?.kind !== "text") return undefined;
  const value = scene.componentData!.values.find(
    (v) => v.id === binding.value,
  )!;
  return {
    ...preparedBaseLayer(scene, node, samples),
    type: "provider",
    provider: NUMERIC_TYPOGRAPHY_PROVIDER.id,
    assets: (scene.fonts ?? []).map((font) => font.id),
    params: params(
      {
        node,
        fps: scene.fps,
        frameCount: scene.frameCount,
        samples: trimSettledSamples(
          samples.map(({ state, reveal }) => ({ state, reveal })),
        ),
        numeric: {
          value,
          format: binding.format,
          samples: trimSettledSamples(
            Array.from({ length: scene.frameCount }, (_, frame) => ({
              text: componentText(scene, node, frame)!,
            })),
          ).map((sample) => sample.text),
        },
        textStyles: scene.textStyles ?? {},
        textAnimators: (scene.textAnimators ?? []).filter(
          (animator) => animator.node === node.id,
        ),
        signals: scene.signals ?? [],
        textEvents: resolveTextEvents(scene)
          .filter((e) => e.node === node.id && e.verb === "correct")
          .map((e) => ({
            node: node.id,
            verb: "correct",
            at: e.start,
            duration: e.end - e.start,
            replacement: e.replacement,
            ...(e.span ? { span: e.span } : {}),
            ...(e.color ? { color: e.color } : {}),
          })),
      },
      `nodes[${scene.nodes.indexOf(node)}]`,
      node.id,
    ),
  };
}
