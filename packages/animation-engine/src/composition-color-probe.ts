/**
 * CG3 `comp probe`: pixel values at a point or region of a rendered frame,
 * before and after every stage of one layer's effect stack.
 *
 * Stage k renders the composition with the layer's first k effects (stage 0
 * is the input, with no effects). With `isolate` (default) every other layer
 * that is not the probed layer or one of its parents is disabled, so values
 * are the layer's own pixels over the background. Rendering is the export
 * renderer's, in the pinned browser (as `comp lint --pixels`); values are the
 * 8-bit output, reported in encoded, linear, HSL, CIELAB and OKLab
 * coordinates, with a qualifier suggestion for the sampled region.
 */
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import type * as Renderer from "@still-shift/renderer-core";
import {
  PassageError,
  type PassageDiagnostic,
} from "@still-shift/renderer-core";
import {
  AnimationEngineError,
  type Composition,
} from "@still-shift/scene-contract";
import {
  pixelCoordinates,
  suggestQualifier,
  type Region,
} from "@still-shift/color-science";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import { withRendererPage } from "./composition-browser-page.ts";
import { loadComposition } from "./composition-render.ts";
import { roundTo } from "./composition-color-round.ts";

export const COLOR_PROBE_VERSION = "still-shift-color-probe-1";

export type ColorProbeRequest = {
  layer: string;
  /** Pixel x, y (with `radius`, a square of side 2·radius + 1). */
  at?: readonly [number, number] | undefined;
  radius?: number | undefined;
  region?: Region | undefined;
  frame?: number | undefined;
  backend?: "canvas2d" | "webgl2" | undefined;
  isolate?: boolean | undefined;
};
export type ColorProbeOptions = {
  cacheDirectory?: string | undefined;
  signal?: AbortSignal | undefined;
  nodeMemory?: CompositionNodeMemory | undefined;
};

const round = (value: number) => roundTo(value, 6);

export async function probeCompositionFile(
  input: string,
  request: ColorProbeRequest,
  options: ColorProbeOptions = {},
) {
  const owner = new CompositionNodeMemory(options.nodeMemory);
  try {
    const backend = request.backend ?? "canvas2d";
    const loaded = await loadComposition(input, backend, {
      nodeMemory: owner,
      ...(options.cacheDirectory
        ? { cacheDirectory: options.cacheDirectory }
        : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    }).catch((error: unknown) => {
      if (
        error instanceof AnimationEngineError &&
        typeof error.context?.diagnosticsJson === "string"
      )
        throw new PassageError(
          JSON.parse(error.context.diagnosticsJson) as PassageDiagnostic[],
        );
      throw error;
    });
    const comp = loaded.composition;
    const layer = comp.layers.find((l) => l.id === request.layer);
    if (!layer)
      passageError(
        "comp-probe-layer",
        `No top-level layer "${request.layer}" in the composition`,
        { path: "layer" },
      );
    const frame = request.frame ?? 0;
    if (!Number.isInteger(frame) || frame < 0 || frame >= comp.frameCount)
      passageError(
        "comp-probe-frame",
        `Frame ${frame} is outside 0–${comp.frameCount - 1}`,
        { path: "frame" },
      );
    const region = probeRegion(comp, request);
    // Layers kept when isolating: the probed layer and its parent chain.
    const keep = new Set<string>([layer!.id]);
    for (let parent = layer!.parent; parent; ) {
      keep.add(parent);
      parent = comp.layers.find((l) => l.id === parent)?.parent;
    }
    const effects = layer!.effects ?? [];
    const variants: Composition[] = Array.from(
      { length: effects.length + 1 },
      (_, k) => ({
        ...comp,
        layers: comp.layers.map((l) =>
          l.id === layer!.id
            ? ({ ...l, effects: effects.slice(0, k) } as typeof l)
            : request.isolate === false || keep.has(l.id)
              ? l
              : ({ ...l, enabled: false } as typeof l),
        ),
      }),
    );
    const result = await withRendererPage(
      loaded.assetPaths,
      { ...options, cacheDirectoryPrefix: "composition-probe-vite-" },
      (page) =>
        page.evaluate(
          async ({ variants, preparedMedia, backend, frame, region }) => {
            const renderer = (
              globalThis as typeof globalThis & {
                __stillShiftLintRenderer: typeof Renderer;
              }
            ).__stillShiftLintRenderer;
            const out: number[][] = [];
            try {
              for (const json of variants) {
                const comp = JSON.parse(json) as Composition;
                const resources = await renderer.loadCompositionResources(
                  comp,
                  (id: string) => `/_lint/assets/${encodeURIComponent(id)}`,
                  preparedMedia ? { preparedMedia } : {},
                );
                const preview = renderer.createCompositionPreview(
                  document.createElement("canvas"),
                  comp,
                  resources,
                  { backend },
                );
                try {
                  preview.renderFrame(frame);
                  const pixels = preview.readPixels();
                  const values: number[] = [];
                  for (let y = region.y; y < region.y + region.height; y++)
                    for (let x = region.x; x < region.x + region.width; x++) {
                      const i = (y * comp.width + x) * 4;
                      values.push(
                        pixels[i]!,
                        pixels[i + 1]!,
                        pixels[i + 2]!,
                        pixels[i + 3]!,
                      );
                    }
                  out.push(values);
                } finally {
                  preview.dispose();
                }
              }
              return { ok: true as const, out };
            } catch (error) {
              return {
                ok: false as const,
                diagnostics: renderer.passageDiagnostics(error),
              };
            }
          },
          {
            variants: variants.map((v) => JSON.stringify(v)),
            preparedMedia: loaded.preparedMedia,
            backend,
            frame,
            region,
          },
        ),
    );
    if (!result.ok)
      throw new PassageError(result.diagnostics as PassageDiagnostic[]);
    const stages = result.out.map((values, k) => {
      const rgba = Uint8Array.from(values);
      const count = values.length / 4;
      const mean = [0, 1, 2].map((c) => {
        let sum = 0;
        for (let i = 0; i < count; i++) sum += rgba[i * 4 + c]!;
        return sum / count;
      });
      const coordinates = pixelCoordinates(
        mean.map((v) => v / 255) as [number, number, number],
      );
      return {
        stage: k === 0 ? "input" : `effects[${effects[k - 1]!.id}]`,
        ...(k === 0 ? {} : { effect: effects[k - 1]!.effect }),
        bytes: mean.map((v) => round(v)),
        coordinates: {
          encoded: coordinates.encoded.map(round),
          linear: coordinates.linear.map(round),
          hsl: coordinates.hsl.map(round),
          lab: coordinates.lab.map(round),
          oklab: coordinates.oklab.map(round),
        },
        rgba,
      };
    });
    const last = stages.at(-1)!;
    const qualifier = suggestQualifier({
      width: region.width,
      height: region.height,
      rgba: last.rgba,
    });
    return {
      schema: COLOR_PROBE_VERSION,
      composition: comp.id,
      layer: layer!.id,
      frame,
      backend,
      isolate: request.isolate !== false,
      region,
      pixels: region.width * region.height,
      stages: stages.map(({ rgba: _rgba, ...stage }) => stage),
      qualifier: {
        ...qualifier,
        hue: qualifier.hue && {
          center: round(qualifier.hue.center),
          width: round(qualifier.hue.width),
          softness: round(qualifier.hue.softness),
        },
        saturation: mapRound(qualifier.saturation),
        luminance: mapRound(qualifier.luminance),
      },
    };
  } finally {
    owner.dispose();
  }
}

const mapRound = (value: { min: number; max: number; softness: number }) => ({
  min: round(value.min),
  max: round(value.max),
  softness: round(value.softness),
});

function probeRegion(comp: Composition, request: ColorProbeRequest): Region {
  let region: Region;
  if (request.region) region = request.region;
  else if (request.at) {
    const r = request.radius ?? 0;
    region = {
      x: request.at[0] - r,
      y: request.at[1] - r,
      width: 2 * r + 1,
      height: 2 * r + 1,
    };
  } else
    passageError(
      "comp-probe-region",
      "Give --at x,y (optionally --radius) or --region x,y,w,h",
      { path: "at" },
    );
  if (
    ![region!.x, region!.y, region!.width, region!.height].every(
      Number.isInteger,
    ) ||
    region!.x < 0 ||
    region!.y < 0 ||
    region!.width < 1 ||
    region!.height < 1 ||
    region!.x + region!.width > comp.width ||
    region!.y + region!.height > comp.height
  )
    passageError(
      "comp-probe-region",
      `Probe region ${region!.x},${region!.y},${region!.width},${region!.height} must be whole pixels inside the ${comp.width}x${comp.height} frame`,
      { path: "region" },
    );
  return region!;
}
