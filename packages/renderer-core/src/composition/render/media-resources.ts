import {
  CompositionPreparedMediaSchema,
  compositionMediaFrameId,
  resolveCompositionMediaLimits,
  type Composition,
  type CompositionPreparedMedia,
  type CompositionPreparedMediaFrame,
} from "@still-shift/scene-contract";
import { sha256Hex } from "../../browser-checksum.ts";
import { passageError } from "../../passage-diagnostics.ts";
import { compositionMediaFrameDependencies } from "./graphs.ts";
import type { RenderGraphOptions } from "./graph.ts";

export function validateCompositionPreparedMedia(
  comp: Composition,
  input: CompositionPreparedMedia,
) {
  const parsed = CompositionPreparedMediaSchema.safeParse(input);
  if (!parsed.success)
    passageError(
      "comp-media-provenance",
      "Invalid captured prepared media manifest",
      { path: "preparedMedia" },
    );
  const frames = new Map<string, CompositionPreparedMediaFrame>();
  for (const frame of parsed.data.frames) {
    const asset = comp.assets.find((asset) => asset.id === frame.asset);
    if (
      !asset ||
      (asset.type !== "video" && asset.type !== "sequence") ||
      frame.id !== compositionMediaFrameId(asset.id, frame.ordinal) ||
      frame.ordinal >= asset.frameCount ||
      frame.sourceHash !== asset.sha256 ||
      frame.width !== asset.width ||
      frame.height !== asset.height ||
      frames.has(frame.id)
    )
      passageError(
        "comp-media-provenance",
        "Prepared frame identity differs from its authored source",
        { path: frame.id },
      );
    if (
      frame.byteLength >
      frame.width * frame.height * 4 + frame.height + 1024 * 1024
    )
      passageError(
        "comp-media-limit",
        "Prepared PNG exceeds its encoded allocation bound",
        { path: frame.id },
      );
    frames.set(frame.id, frame);
  }
  return frames;
}
export type CompositionMediaResourceStats = {
  decodedBytes: number;
  encodedBytes: number;
  peakDecodedBytes: number;
  peakEncodedBytes: number;
  decodedFrames: number;
  hits: number;
  evictions: number;
};
export type CompositionMediaResources = {
  prepareFrame(frame: number, options?: RenderGraphOptions): Promise<void>;
  assertReady(frame: number): void;
  stats(): Readonly<CompositionMediaResourceStats>;
  dispose(): void;
};
/** CPU LRU owns native bitmaps; a complete exposure/history set stays pinned through draw. */
export function createCompositionMediaResources(
  comp: Composition,
  prepared: CompositionPreparedMedia,
  assetUrl: (id: string) => string,
  images: Map<string, CanvasImageSource>,
  pngImages?: Set<string>,
): CompositionMediaResources {
  const entries = validateCompositionPreparedMedia(comp, prepared);
  const budget = resolveCompositionMediaLimits(
    comp.mediaLimits,
  ).decodedFrameBytes;
  const resident = new Map<string, ImageBitmap>();
  const stats: CompositionMediaResourceStats = {
    decodedBytes: 0,
    encodedBytes: 0,
    peakDecodedBytes: 0,
    peakEncodedBytes: 0,
    decodedFrames: 0,
    hits: 0,
    evictions: 0,
  };
  let generation = 0,
    disposed = false,
    ready: number | undefined;
  let active: AbortController | undefined,
    pending = Promise.resolve();
  const stale = (run: number, signal: AbortSignal) => {
    signal.throwIfAborted();
    if (disposed || run !== generation)
      throw new DOMException("Superseded media preparation", "AbortError");
  };
  const forget = (id: string) => {
    const bitmap = resident.get(id)!;
    bitmap.close();
    resident.delete(id);
    images.delete(id);
    const entry = entries.get(id)!;
    stats.decodedBytes -= entry.width * entry.height * 4;
    stats.evictions++;
  };
  async function load(
    entry: CompositionPreparedMediaFrame,
    run: number,
    signal: AbortSignal,
  ) {
    const response = await fetch(assetUrl(entry.id), { signal });
    stale(run, signal);
    if (!response.ok || !response.body)
      passageError("comp-media-format", "Prepared frame is unavailable", {
        path: entry.id,
      });
    const advertised = response.headers.get("Content-Length");
    if (advertised !== null && Number(advertised) !== entry.byteLength)
      passageError("comp-media-checksum", "Prepared frame length differs", {
        path: entry.id,
      });
    const bytes = new Uint8Array(entry.byteLength);
    const reader = response.body.getReader();
    const abortRead = () => {
      void reader.cancel().catch(() => {});
    };
    signal.addEventListener("abort", abortRead, { once: true });
    let count = 0;
    stats.encodedBytes = bytes.length;
    stats.peakEncodedBytes = Math.max(
      stats.peakEncodedBytes,
      stats.encodedBytes,
    );
    try {
      for (;;) {
        const part = await reader.read();
        stale(run, signal);
        if (part.done) break;
        if (count + part.value.length > bytes.length)
          passageError(
            "comp-media-limit",
            "Prepared frame response exceeds pinned bytes",
            { path: entry.id },
          );
        bytes.set(part.value, count);
        count += part.value.length;
      }
      if (
        count !== bytes.length ||
        `sha256:${await sha256Hex(bytes.buffer)}` !== entry.sha256
      )
        passageError(
          "comp-media-checksum",
          "Prepared frame bytes differ from the captured manifest",
          { path: entry.id },
        );
      stale(run, signal);
      if (
        ![137, 80, 78, 71, 13, 10, 26, 10].every(
          (value, index) => bytes[index] === value,
        ) ||
        bytes[24] !== 8 ||
        bytes[25] !== 6
      )
        passageError(
          "comp-media-format",
          "Prepared frame must be canonical RGBA8 PNG",
          { path: entry.id },
        );
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: "image/png" }),
        { premultiplyAlpha: "none", colorSpaceConversion: "none" },
      );
      try {
        stale(run, signal);
        if (bitmap.width !== entry.width || bitmap.height !== entry.height)
          passageError(
            "comp-media-provenance",
            "Decoded frame dimensions differ",
            { path: entry.id },
          );
      } catch (error) {
        bitmap.close();
        throw error;
      }
      resident.set(entry.id, bitmap);
      images.set(entry.id, bitmap);
      pngImages?.add(entry.id);
      stats.decodedBytes += entry.width * entry.height * 4;
      stats.decodedFrames++;
      stats.peakDecodedBytes = Math.max(
        stats.peakDecodedBytes,
        stats.decodedBytes,
      );
    } finally {
      signal.removeEventListener("abort", abortRead);
      await reader.cancel().catch(() => {});
      reader.releaseLock();
      stats.encodedBytes = 0;
    }
  }
  return {
    prepareFrame(frame, options = {}) {
      if (disposed)
        return Promise.reject(
          new DOMException("Disposed media resources", "AbortError"),
        );
      const run = ++generation;
      ready = undefined;
      active?.abort();
      const controller = new AbortController();
      active = controller;
      const task = pending
        .catch(() => {})
        .then(async () => {
          stale(run, controller.signal);
          if (!Number.isInteger(frame) || frame < 0 || frame >= comp.frameCount)
            throw new Error("Frame index outside composition timeline");
          const required = new Set<string>();
          let requiredBytes = 0;
          for (const [asset, ordinals] of compositionMediaFrameDependencies(
            comp,
            frame,
            options,
          ))
            for (const ordinal of ordinals) {
              const id = compositionMediaFrameId(asset, ordinal),
                entry = entries.get(id);
              if (!entry)
                passageError(
                  "comp-media-provenance",
                  "Prepared source lacks a required original frame",
                  { path: id },
                );
              if (!required.has(id)) {
                required.add(id);
                requiredBytes += entry.width * entry.height * 4;
              }
            }
          if (requiredBytes > budget)
            passageError(
              "comp-media-limit",
              "Complete exposure/history frame set exceeds live decoded budget",
              { path: "decodedFrameBytes" },
            );
          for (const id of required) {
            stale(run, controller.signal);
            if (resident.has(id)) {
              const bitmap = resident.get(id)!;
              resident.delete(id);
              resident.set(id, bitmap);
              stats.hits++;
              continue;
            }
            const entry = entries.get(id)!,
              bytes = entry.width * entry.height * 4;
            for (const candidate of resident.keys()) {
              if (stats.decodedBytes + bytes <= budget) break;
              if (!required.has(candidate)) forget(candidate);
            }
            await load(entry, run, controller.signal);
          }
          stale(run, controller.signal);
          ready = frame;
        });
      const guarded = task.catch((error) => {
        controller.abort();
        throw error;
      });
      pending = guarded;
      return guarded;
    },
    assertReady(frame) {
      if (disposed || ready !== frame)
        passageError(
          "comp-media-not-ready",
          "Prepare the complete native media frame before drawing",
          { path: String(frame) },
        );
    },
    stats: () => ({ ...stats }),
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      active?.abort();
      ready = undefined;
      for (const id of [...resident.keys()]) forget(id);
    },
  };
}
