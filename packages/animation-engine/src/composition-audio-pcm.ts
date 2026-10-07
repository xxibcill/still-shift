export { compositionPcmWavHeader } from "@still-shift/execution-runtime/pcm";
import { createReadStream } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import type { PreparedCompositionAudioSource } from "./composition-media-audio.ts";

export const COMPOSITION_PCM_PAGE_SAMPLES = 4096;
export const COMPOSITION_PCM_PAGE_BYTES = COMPOSITION_PCM_PAGE_SAMPLES * 8;
export const COMPOSITION_PCM_VERIFY_BYTES = 64 * 1024;
type Page = { bytes: Buffer; frames: number; channels: 1 | 2 };

/** Fixed-size buffers are reused on eviction, rather than allocating until GC runs. */
export class CompositionSourcePcmPages {
  private readonly pages = new Map<string, Page>();
  private readonly files = new Map<string, FileHandle>();
  allocatedBytes = 0;
  loads = 0;
  evictions = 0;
  constructor(private readonly capacity: number) {}
  sample(
    source: PreparedCompositionAudioSource,
    sample: number,
  ): [number, number] | undefined {
    const key = `${source.asset}:${Math.floor(sample / COMPOSITION_PCM_PAGE_SAMPLES)}`;
    const page = this.pages.get(key);
    if (!page) return undefined;
    this.pages.delete(key);
    this.pages.set(key, page);
    const local = sample % COMPOSITION_PCM_PAGE_SAMPLES;
    if (local >= page.frames)
      passageError(
        "comp-media-provenance",
        "PCM page does not contain the requested source sample",
        { path: source.asset },
      );
    const at = local * page.channels * 4;
    const left = page.bytes.readFloatLE(at);
    const right = page.channels === 1 ? left : page.bytes.readFloatLE(at + 4);
    return [left, right];
  }
  async load(
    source: PreparedCompositionAudioSource,
    sample: number,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    const ordinal = Math.floor(sample / COMPOSITION_PCM_PAGE_SAMPLES);
    const key = `${source.asset}:${ordinal}`;
    if (this.pages.has(key)) return;
    let bytes: Buffer;
    if (this.pages.size === this.capacity) {
      const [oldKey, oldPage] = this.pages.entries().next().value!;
      this.pages.delete(oldKey);
      bytes = oldPage.bytes;
      this.evictions++;
    } else {
      bytes = Buffer.allocUnsafe(COMPOSITION_PCM_PAGE_BYTES);
      this.allocatedBytes += bytes.length;
    }
    let file = this.files.get(source.path);
    if (!file) {
      if (this.files.size === 32) {
        const [path, oldFile] = this.files.entries().next().value!;
        this.files.delete(path);
        await oldFile.close();
      }
      file = await open(source.path, "r");
      this.files.set(source.path, file);
    } else {
      this.files.delete(source.path);
      this.files.set(source.path, file);
    }
    const first = ordinal * COMPOSITION_PCM_PAGE_SAMPLES;
    const frames = Math.min(
      COMPOSITION_PCM_PAGE_SAMPLES,
      source.sampleCount - first,
    );
    const byteLength = frames * source.channels * 4;
    if (frames <= 0)
      passageError(
        "comp-media-provenance",
        "PCM page lies outside the verified source",
        { path: source.asset },
      );
    let at = 0;
    while (at < byteLength) {
      signal?.throwIfAborted();
      const result = await file.read(
        bytes,
        at,
        byteLength - at,
        first * source.channels * 4 + at,
      );
      if (!result.bytesRead)
        passageError(
          "comp-media-provenance",
          "PCM source changed during paging",
          { path: source.path },
        );
      at += result.bytesRead;
    }
    signal?.throwIfAborted();
    this.pages.set(key, { bytes, frames, channels: source.channels });
    this.loads++;
  }
  async dispose() {
    this.pages.clear();
    const files = [...this.files.values()];
    this.files.clear();
    const results = await Promise.allSettled(files.map((file) => file.close()));
    this.allocatedBytes = 0;
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length)
      throw new AggregateError(
        failures.map((result) => result.reason),
        "PCM source handles could not close",
      );
  }
}

export class CompositionPcmWaveform {
  private readonly peaks: Float32Array;
  private peak = 0;
  private overs = 0;
  constructor(
    readonly sampleCount: number,
    points: number,
  ) {
    this.peaks = new Float32Array(Math.min(sampleCount, points));
  }
  add(sample: number, left: number, right: number) {
    const peak = Math.max(Math.abs(left), Math.abs(right));
    if (!Number.isFinite(peak))
      passageError(
        "comp-media-format",
        "PCM processing produced a nonfinite sample",
        { path: "audio" },
      );
    const bin = Math.floor((sample * this.peaks.length) / this.sampleCount);
    this.peaks[bin] = Math.max(this.peaks[bin]!, peak);
    this.peak = Math.max(this.peak, peak);
    if (peak > 1) this.overs++;
  }
  result() {
    return {
      sampleCount: this.sampleCount,
      peaks: Array.from(this.peaks),
      peakDbfs: this.peak ? 20 * Math.log10(this.peak) : null,
      samplesAboveFullScale: this.overs,
    };
  }
}

export async function compositionSourceWaveform(
  source: PreparedCompositionAudioSource,
  points: number,
  signal?: AbortSignal,
) {
  const wave = new CompositionPcmWaveform(source.sampleCount, points);
  let sample = 0;
  for await (const chunk of createReadStream(source.path, {
    highWaterMark: COMPOSITION_PCM_VERIFY_BYTES,
    signal,
  })) {
    const bytes = chunk as Buffer;
    if (bytes.length % (source.channels * 4))
      passageError("comp-media-provenance", "PCM source frame bytes changed", {
        path: source.path,
      });
    for (let at = 0; at < bytes.length; at += source.channels * 4) {
      if (sample >= source.sampleCount)
        passageError("comp-media-provenance", "PCM source count changed", {
          path: source.path,
        });
      const left = bytes.readFloatLE(at);
      wave.add(
        sample++,
        left,
        source.channels === 1 ? left : bytes.readFloatLE(at + 4),
      );
    }
  }
  signal?.throwIfAborted();
  if (sample !== source.sampleCount)
    passageError("comp-media-provenance", "PCM source count changed", {
      path: source.path,
    });
  return { ...wave.result(), asset: source.asset, channels: source.channels };
}

export async function writeCompositionPcmBytes(
  file: FileHandle,
  bytes: Buffer,
) {
  let offset = 0;
  while (offset < bytes.length) {
    const result = await file.write(bytes, offset, bytes.length - offset);
    if (!result.bytesWritten) throw new Error("PCM write made no progress");
    offset += result.bytesWritten;
  }
}
