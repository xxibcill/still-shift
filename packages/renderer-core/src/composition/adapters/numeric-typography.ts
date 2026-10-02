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
  isSingleImageTypography,
  hasStableTypographyImage,
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
  bakedState,
  baked,
  type Samples,
} from "./prepared.ts";
import type {
  CanvasContentProvider,
  ProviderLayer,
} from "../render/providers.ts";
import { preparedProvider } from "../render/providers.ts";
import { preparedTextBounds } from "../render/text-bounds.ts";
import { typographyClock } from "../render/text-clock.ts";
import {
  AppearanceSchema,
  appearanceAt,
  paintNode,
  type Appearance,
} from "./appearance.ts";

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
export const RichTypographyParamsSchema = NumericTypographyParamsSchema.extend({
  numeric: NumericTypographyParamsSchema.shape.numeric.optional(),
  appearance: AppearanceSchema.optional(),
});
type Params = z.infer<typeof RichTypographyParamsSchema>;

function parse(layer: ProviderLayer, path: string): Params {
  const parsed = (
    layer.provider === "component.typography@1.0.0"
      ? NumericTypographyParamsSchema
      : RichTypographyParamsSchema
  ).safeParse(layer.params);
  if (!parsed.success)
    passageError("comp-provider-params", parsed.error.issues[0]!.message, {
      path: `${path}.params`,
    });
  const value = parsed.data;
  for (const state of [layer.state, layer.stateFrom])
    for (const index of typeof state === "number"
      ? [state]
      : (state?.keys.map((key) => key.value) ?? []))
      if (index >= (value.node.states?.length ?? 1))
        passageError(
          "comp-provider-params",
          "Text state has no corresponding content",
          { path: `${path}.state` },
        );
  if (
    !value.node.fontAsset ||
    (value.numeric &&
      (!value.node.textBox || value.node.states || value.node.textLayout)) ||
    value.samples.some(
      (sample) => sample.state >= (value.node.states?.length ?? 1),
    ) ||
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
    ...(data.numeric
      ? {
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
        }
      : {}),
  } as unknown as Parameters<typeof prepareTypography>[0];
}

/** Formatted component values stay bounded data; only local glyph drawing runs per frame. */
function typographyProvider(id: string): CanvasContentProvider {
  return {
    id,
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
      const measured = [...preparedTextBounds(data.node, prepared).values()];
      const bounds = {
        left: Math.min(...measured.map((box) => box.left)),
        top: Math.min(...measured.map((box) => box.top)),
        right: Math.max(...measured.map((box) => box.right)),
        bottom: Math.max(...measured.map((box) => box.bottom)),
      };
      if (data.node.transition || data.node.transitions?.length) {
        bounds.left -= data.node.fontSize;
        bounds.top -= data.node.fontSize;
        bounds.right += data.node.fontSize;
        bounds.bottom += data.node.fontSize;
      }
      const clock = typographyClock(
        data.node,
        data.textAnimators,
        prepared.corrections.get(data.node.id) ?? [],
        data.signals,
      );
      const frameAt = (time: number, sourceTime?: number) =>
        Math.max(
          0,
          sourceTime === undefined
            ? Math.min(data.frameCount - 1, Math.floor(time))
            : Math.floor(time),
        );
      const textAt = (frame: number) =>
        data.numeric
          ? data.numeric.samples[
              Math.min(frame, data.numeric.samples.length - 1)
            ]!
          : data.node.text;
      return preparedProvider(
        (ctx, time, state, sourceTime) => {
          const frame = frameAt(time, sourceTime);
          const text = textAt(frame);
          const sample =
            data.samples[Math.min(frame, data.samples.length - 1)]!;
          drawTypography(
            ctx,
            { ...paintNode(data.node, data.appearance, frame), text },
            { ...sample, state: state ?? sample.state },
            prepared,
            sourceTime ?? frame,
          );
        },
        {
          bounds,
          singleImage: isSingleImageTypography(data.node, prepared),
          stableImages: hasStableTypographyImage(data.node, prepared),
          visualKey(time, state, sourceTime) {
            const frame = frameAt(time, sourceTime);
            const sample =
              data.samples[Math.min(frame, data.samples.length - 1)]!;
            return JSON.stringify([
              textAt(frame),
              { ...sample, state: state ?? sample.state },
              appearanceAt(data.appearance, frame),
              clock(sourceTime ?? frame),
            ]);
          },
        },
      );
    },
  };
}
export const NUMERIC_TYPOGRAPHY_PROVIDER = typographyProvider(
  "component.typography@1.0.0",
);
export const RICH_TYPOGRAPHY_PROVIDER = typographyProvider(
  "component.typography@1.1.0",
);

export function componentTypographyLayer(
  scene: CommerceScene | StoryScene,
  node: Extract<PreparedNode, { type: "text" }>,
  samples: Samples,
  appearance?: Appearance,
): ProviderLayer | undefined {
  const binding = scene.componentData?.bindings.find(
    (b) => b.kind === "text" && b.target === node.id,
  );
  if (binding?.kind !== "text" && !appearance) return undefined;
  const numeric =
    binding?.kind === "text"
      ? {
          value: scene.componentData!.values.find(
            (v) => v.id === binding.value,
          )!,
          format: binding.format,
          samples: trimSettledSamples(
            samples.map((_, frame) => ({
              text: componentText(
                scene,
                node,
                samples.times?.[frame] ?? frame,
              )!,
            })),
          ).map((sample) => sample.text),
        }
      : undefined;
  const blends = samples.some((sample) => sample.stateFrom !== undefined);
  return {
    ...preparedBaseLayer(scene, node, samples),
    type: "provider",
    provider: appearance
      ? RICH_TYPOGRAPHY_PROVIDER.id
      : NUMERIC_TYPOGRAPHY_PROVIDER.id,
    ...(appearance
      ? { state: bakedState(samples.map((sample) => Math.round(sample.state))) }
      : {}),
    ...(blends
      ? {
          stateFrom: bakedState(
            samples.map((sample) =>
              Math.round(sample.stateFrom ?? sample.state),
            ),
          ),
          stateMix: baked(samples.map((sample) => sample.stateMix ?? 1)),
        }
      : {}),
    assets: (scene.fonts ?? []).map((font) => font.id),
    params: params(
      {
        node,
        fps: scene.fps,
        frameCount: scene.frameCount,
        samples: trimSettledSamples(
          samples.map(({ state, reveal }) => ({ state, reveal })),
        ),
        ...(numeric ? { numeric } : {}),
        ...(appearance ? { appearance } : {}),
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
