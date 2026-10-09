import { afterEach, expect, it, vi } from "vitest";
import { CompositionAudioPreviewLoader } from "../../apps/lab/src/composition-audio-player.ts";
import { sha256Hex } from "../../packages/renderer-core/src/browser-checksum.ts";
import { COMPOSITION_EVALUATOR_VERSION } from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import {
  compositionAudioWavHeader,
  compositionPcmBoundary,
  compositionMediaMappingDocument,
  type Composition,
  type CompositionPreparedAudio,
} from "@still-shift/scene-contract";

class AudioHarness {
  sampleRate = 48000;
  currentTime = 10;
  destination = {};
  resume = vi.fn(async () => {});
  buffers: {
    sampleRate: number;
    numberOfChannels: number;
    length: number;
    getChannelData(channel: number): Float32Array;
  }[] = [];
  sources: {
    buffer: AudioBuffer | null;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }[] = [];
  createBuffer(channels: number, length: number, rate: number) {
    const data = Array.from(
      { length: channels },
      () => new Float32Array(length),
    );
    const buffer = {
      sampleRate: rate,
      numberOfChannels: channels,
      length,
      getChannelData: (channel: number) => data[channel]!,
    };
    this.buffers.push(buffer);
    return buffer;
  }
  createBufferSource() {
    const source = {
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    this.sources.push(source);
    return source;
  }
}
afterEach(() => vi.unstubAllGlobals());
async function fixture(fps = 24, frameCount = 6) {
  const context = new AudioHarness();
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        return context;
      }
    },
  );
  const composition: Composition = {
    schemaVersion: "composition-1",
    id: "audio-preview",
    width: 64,
    height: 64,
    fps,
    frameCount,
    assets: [],
    layers: [],
  };
  const sampleCount = compositionPcmBoundary(frameCount, fps);
  const bytes = new Uint8Array(sampleCount * 8 + 58);
  bytes.set(compositionAudioWavHeader(sampleCount));
  const view = new DataView(bytes.buffer);
  for (let sample = 0; sample < sampleCount; sample++) {
    view.setFloat32(
      58 + sample * 8,
      sample === sampleCount - 1 ? 0.0625 : 0.5,
      true,
    );
    view.setFloat32(
      62 + sample * 8,
      sample === sampleCount - 1 ? -0.125 : -0.25,
      true,
    );
  }
  const audio: CompositionPreparedAudio = {
    schemaVersion: "composition-prepared-audio-1",
    decoderVersion: "composition-audio-decoder-1",
    mixerVersion: "composition-audio-mixer-2",
    evaluatorVersion: COMPOSITION_EVALUATOR_VERSION,
    mappingHash:
      "sha256:" +
      (await sha256Hex(
        new TextEncoder().encode(compositionMediaMappingDocument(composition))
          .buffer,
      )),
    sampleRate: 48000,
    channels: 2,
    sampleCount,
    resource: {
      id: "__audio:mix",
      byteLength: bytes.length,
      sha256: "sha256:" + (await sha256Hex(bytes.buffer)),
    },
    sources: [],
    waveforms: {
      source: [],
      processed: [],
      mix: {
        sampleCount,
        peaks: [0.5],
        peakDbfs: 20 * Math.log10(0.5),
        samplesAboveFullScale: 0,
      },
    },
  };
  const fetcher = vi.fn(
    async () =>
      new Response(
        new ReadableStream({
          type: "bytes",
          start(controller) {
            for (let offset = 0; offset < bytes.length; offset += 32768)
              controller.enqueue(bytes.slice(offset, offset + 32768));
            controller.close();
          },
        }),
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  const loader = new CompositionAudioPreviewLoader(),
    controller = new AbortController();
  const prepare = () =>
    loader.prepare(composition, audio, "/master.wav", controller.signal);
  return {
    context,
    composition,
    bytes,
    audio,
    fetcher,
    loader,
    controller,
    prepare,
  };
}
it("preserves every native PCM sample and schedules the complete remainder against the audio clock", async () => {
  const { context, loader, prepare } = await fixture();
  const player = await prepare();
  expect(loader.pcmWorkingBytes).toBe(12000 * 8);
  const buffer = context.buffers[0]!;
  expect(Array.from(buffer.getChannelData(0).slice(-2))).toEqual([0.5, 0.0625]);
  expect(Array.from(buffer.getChannelData(1).slice(-2))).toEqual([
    -0.25, -0.125,
  ]);
  expect(await player.play(1)).toBe(true);
  expect(context.sources[0]!.start).toHaveBeenCalledWith(
    10.04,
    2000 / 48000,
    10000 / 48000,
  );
  context.currentTime = 10.04 + 10000 / 48000;
  expect(player.frame).toBe(6);
  player.dispose();
  player.dispose();
  expect(context.sources[0]!.stop).toHaveBeenCalledOnce();
  expect(context.sources[0]!.disconnect).toHaveBeenCalledOnce();
  expect(loader.pcmWorkingBytes).toBe(0);
});
it("rejects changed mapping, evaluator, PCM bytes, header and nonfinite samples before playback", async () => {
  for (const defect of [
    "mapping",
    "clock",
    "evaluator",
    "checksum",
    "header",
    "finite",
  ] as const) {
    const f = await fixture();
    if (defect === "mapping") f.composition.name = "changed";
    if (defect === "clock") f.composition.frameCount++;
    if (defect === "evaluator")
      f.audio.evaluatorVersion = "composition-evaluator-1";
    if (defect === "checksum") f.bytes[100] = f.bytes[100]! ^ 1;
    if (defect === "header") f.bytes[0] = 0;
    if (defect === "finite")
      new DataView(f.bytes.buffer).setFloat32(58, NaN, true);
    if (defect === "header" || defect === "finite")
      f.audio.resource.sha256 = "sha256:" + (await sha256Hex(f.bytes.buffer));
    await expect(f.prepare()).rejects.toThrow(/differs|nonfinite/);
    expect(f.context.sources).toHaveLength(0);
    expect(f.loader.pcmWorkingBytes).toBe(0);
  }
});
it("accounts for active and pending masters and rejects the next candidate before fetching", async () => {
  const f = await fixture();
  const player = await f.prepare();
  f.composition.mediaLimits = {
    audioWorkingBytes: 12000 * 8 * 3 + 58 * 2 + 65536,
  };
  await expect(f.prepare()).rejects.toThrow(/working-memory/);
  expect(f.fetcher).toHaveBeenCalledOnce();
  expect(f.context.buffers).toHaveLength(1);
  player.dispose();
  expect(f.loader.pcmWorkingBytes).toBe(0);
});
it("cancels an in-flight fetch and a late context resume without leaking ownership or scheduling sound", async () => {
  const f = await fixture();
  const player = await f.prepare();
  let resume!: () => void;
  f.context.resume.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        resume = resolve;
      }),
  );
  const pending = player.play(2);
  player.dispose();
  resume();
  expect(await pending).toBe(false);
  expect(f.context.sources).toHaveLength(0);
  expect(f.loader.pcmWorkingBytes).toBe(0);
  f.controller.abort();
  await expect(f.prepare()).rejects.toThrow();
  expect(f.fetcher).toHaveBeenCalledOnce();
  const candidate = await fixture();
  let finish!: (response: Response) => void;
  candidate.fetcher.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  const preparing = candidate.prepare();
  await vi.waitFor(() => expect(finish).toBeDefined());
  expect(candidate.loader.pcmWorkingBytes).toBeGreaterThan(12000 * 8);
  candidate.controller.abort();
  finish(new Response(candidate.bytes));
  await expect(preparing).rejects.toThrow();
  expect(candidate.loader.pcmWorkingBytes).toBe(0);
  expect(candidate.context.buffers).toHaveLength(0);
});
it("rejects missing/extra bytes and a context that resamples", async () => {
  for (const defect of ["short", "long", "rate"] as const) {
    const f = await fixture();
    if (defect === "rate") f.context.sampleRate = 44100;
    else
      f.fetcher.mockImplementationOnce(async () => {
        const bytes =
          defect === "short"
            ? f.bytes.slice(0, -4)
            : defect === "long"
              ? new Uint8Array(f.bytes.length + 4)
              : f.bytes;
        return new Response(
          new ReadableStream({
            type: "bytes",
            start(controller) {
              for (let offset = 0; offset < bytes.length; offset += 32768)
                controller.enqueue(bytes.slice(offset, offset + 32768));
              controller.close();
            },
          }),
        );
      });
    await expect(f.prepare()).rejects.toThrow(/bound|count|context/);
    expect(f.loader.pcmWorkingBytes).toBe(0);
    expect(f.context.buffers).toHaveLength(0);
  }
});

it("uses the fixed BYOB page when the network provides a larger chunk", async () => {
  const f = await fixture();
  f.fetcher.mockImplementationOnce(
    async () =>
      new Response(
        new ReadableStream({
          type: "bytes",
          start(controller) {
            controller.enqueue(f.bytes.slice());
            controller.close();
          },
        }),
      ),
  );
  const player = await f.prepare();
  expect(f.context.buffers[0]!.getChannelData(1).at(-1)).toBe(-0.125);
  expect(f.loader.pcmWorkingBytes).toBe(12000 * 8);
  player.dispose();
  expect(f.loader.pcmWorkingBytes).toBe(0);
});

it.each([7, 29, 59])(
  "loads the complete rounded master at %i fps and schedules from the next PCM boundary",
  async (fps) => {
    const f = await fixture(fps, 5);
    const sampleCount = compositionPcmBoundary(5, fps);
    expect(Number.isInteger((5 * 48000) / fps)).toBe(false);
    const player = await f.prepare();
    expect(f.fetcher).toHaveBeenCalledOnce();
    const buffer = f.context.buffers[0]!;
    expect(buffer.length).toBe(sampleCount);
    expect(buffer.getChannelData(0).at(-1)).toBe(0.0625);
    expect(buffer.getChannelData(1).at(-1)).toBe(-0.125);
    expect(f.loader.pcmWorkingBytes).toBe(sampleCount * 8);
    expect(await player.play(1)).toBe(true);
    const startSample = compositionPcmBoundary(1, fps);
    expect(f.context.sources[0]!.start).toHaveBeenCalledWith(
      10.04,
      startSample / 48000,
      (sampleCount - startSample) / 48000,
    );
    player.dispose();
    expect(f.loader.pcmWorkingBytes).toBe(0);
  },
);
