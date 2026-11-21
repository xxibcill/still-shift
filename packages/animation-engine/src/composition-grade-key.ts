/**
 * CG6 `comp grade key`: one `grade.key`'s matte over a frame range, rendered
 * by the export renderer in the pinned browser (as `comp probe`) with the
 * key's view set to the gray key, and the layer isolated (its parents and,
 * for a group, its content kept). Per frame: the mean key, the keyed
 * fraction and, from the second frame, the matte flicker (frame-to-frame
 * change, the matte-stability metric). Optionally one frame of a matte view
 * (gray key, highlight or high contrast) is written as a PNG.
 */
import { writeFile } from "node:fs/promises";
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
import { matteFlicker } from "@still-shift/color-science";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import { withRendererPage } from "./composition-browser-page.ts";
import { loadComposition } from "./composition-render.ts";
import { roundTo } from "./composition-color-round.ts";
import { encodeColorPng } from "./composition-color-png.ts";
import { isolatedLayerIds } from "./composition-color-probe.ts";

export const GRADE_KEY_REPORT_VERSION = "still-shift-grade-key-1";
/** `grade.key` `view` values by name. */
export const GRADE_KEY_VIEWS = { key: 1, highlight: 2, contrast: 3 } as const;
/** The most frames one report renders. */
export const MAX_GRADE_KEY_FRAMES = 10_000;

export type GradeKeyRequest = {
  layer: string;
  /** The `grade.key` effect's id on the layer. */
  effect: string;
  /** [start, end) composition frames; default the first frame. */
  range?: readonly [number, number] | undefined;
  backend?: "canvas2d" | "webgl2" | undefined;
  isolate?: boolean | undefined;
  /** Write this view of the range's first frame to `still`. */
  view?: keyof typeof GRADE_KEY_VIEWS | undefined;
  still?: string | undefined;
};
export type GradeKeyOptions = {
  cacheDirectory?: string | undefined;
  signal?: AbortSignal | undefined;
  nodeMemory?: CompositionNodeMemory | undefined;
};

const round = (value: number) => roundTo(value, 6);

export async function measureGradeKey(
  input: string,
  request: GradeKeyRequest,
  options: GradeKeyOptions = {},
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
    const index = comp.layers.findIndex((l) => l.id === request.layer);
    if (index < 0)
      passageError(
        "comp-grade-key-layer",
        `No top-level layer "${request.layer}" in the composition`,
        { path: "layer" },
      );
    const layer = comp.layers[index]!;
    const slot = (layer.effects ?? []).findIndex(
      (e) => e.id === request.effect,
    );
    if (slot < 0 || layer.effects![slot]!.effect !== "grade.key")
      passageError(
        "comp-grade-key-effect",
        `Layer "${layer.id}" has no grade.key effect "${request.effect}"`,
        { path: "effect" },
      );
    const [start, end] = request.range ?? [0, 1];
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end > comp.frameCount ||
      end <= start ||
      end - start > MAX_GRADE_KEY_FRAMES
    )
      passageError(
        "comp-grade-key-frames",
        `Frames ${start}:${end} are not a non-empty range within 0:${comp.frameCount} (at most ${MAX_GRADE_KEY_FRAMES})`,
        { path: "frame-range" },
      );
    const keep = isolatedLayerIds(comp, layer.id);
    const variant = (view: number): Composition => ({
      ...comp,
      layers: comp.layers.map((l, i) => {
        if (i === index)
          return {
            ...l,
            effects: l.effects!.map((e, k) =>
              k === slot ? { ...e, params: { ...e.params, view } } : e,
            ),
          } as typeof l;
        return request.isolate === false || keep.has(l.id)
          ? l
          : ({ ...l, enabled: false } as typeof l);
      }),
    });
    const stillView =
      request.still && request.view ? GRADE_KEY_VIEWS[request.view] : 0;
    const result = await withRendererPage(
      loaded.assetPaths,
      { ...options, cacheDirectoryPrefix: "composition-grade-key-vite-" },
      (page) =>
        page.evaluate(
          async ({ docs, preparedMedia, backend, start, end }) => {
            const renderer = (
              globalThis as typeof globalThis & {
                __stillShiftLintRenderer: typeof Renderer;
              }
            ).__stillShiftLintRenderer;
            // No named functions in here: tsx would wrap them in __name.
            const encoded: string[][] = [[], []];
            try {
              for (let d = 0; d < docs.length; d++) {
                const comp = JSON.parse(docs[d]!) as Composition;
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
                  for (
                    let frame = start;
                    frame < (d ? start + 1 : end);
                    frame++
                  ) {
                    // Native media must be decoded before the frame draws.
                    await preview.prepareFrame(frame);
                    await renderer.renderCompositionFrameAsync(preview, frame);
                    const pixels = preview.readPixels();
                    // Keys leave the page one byte per pixel (the gray key's
                    // red); the view still leaves whole.
                    const bytes = d
                      ? new Uint8Array(pixels)
                      : Uint8Array.from(
                          { length: pixels.length / 4 },
                          (_, i) => pixels[i * 4]!,
                        );
                    let binary = "";
                    for (let i = 0; i < bytes.length; i += 0x8000)
                      binary += String.fromCharCode(
                        ...bytes.subarray(i, i + 0x8000),
                      );
                    encoded[d]!.push(btoa(binary));
                  }
                } finally {
                  preview.dispose();
                }
              }
              const keys = encoded[0]!,
                still = encoded[1]![0] ?? "";
              return { ok: true as const, keys, still };
            } catch (error) {
              return {
                ok: false as const,
                diagnostics: renderer.passageDiagnostics(error),
              };
            }
          },
          {
            docs: [
              JSON.stringify(variant(1)),
              ...(stillView ? [JSON.stringify(variant(stillView))] : []),
            ],
            preparedMedia: loaded.preparedMedia,
            backend,
            start,
            end,
          },
        ),
    );
    if (!result.ok)
      throw new PassageError(result.diagnostics as PassageDiagnostic[]);
    if (request.still && stillView)
      await writeFile(
        request.still,
        encodeColorPng(
          comp.width,
          comp.height,
          Buffer.from(result.still, "base64"),
        ),
        { flag: "wx" },
      );
    const keys = result.keys.map((k) => Buffer.from(k, "base64"));
    const frames = keys.map((key, i) => {
      let sum = 0,
        keyed = 0;
      for (const v of key) {
        sum += v;
        if (v) keyed++;
      }
      const flicker = i
        ? matteFlicker(keys[i - 1]!, key, undefined, 255)
        : null;
      return {
        frame: start + i,
        meanKey: round(sum / key.length / 255),
        keyedFraction: round(keyed / key.length),
        flicker: flicker && {
          meanChange: round(flicker.meanChange),
          changedFraction: round(flicker.changedFraction),
          maxChange: round(flicker.maxChange),
        },
      };
    });
    const changes = frames.flatMap((f) => (f.flicker ? [f.flicker] : []));
    const mean = (key: "meanChange" | "changedFraction") =>
      changes.length
        ? round(changes.reduce((a, c) => a + c[key], 0) / changes.length)
        : null;
    return {
      schema: GRADE_KEY_REPORT_VERSION,
      composition: comp.id,
      layer: layer.id,
      effect: request.effect,
      backend,
      isolate: request.isolate !== false,
      range: [start, end],
      pixels: comp.width * comp.height,
      frames,
      stability: {
        meanChange: mean("meanChange"),
        changedFraction: mean("changedFraction"),
      },
      ...(request.still && stillView
        ? { still: { path: request.still, view: request.view } }
        : {}),
    };
  } finally {
    owner.dispose();
  }
}
