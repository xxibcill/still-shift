import {
  CompositionPreparedAudioSchema,
  compositionAudioWavHeader,
  compositionMediaMappingDocument,
  resolveCompositionMediaLimits,
  type Composition,
  type CompositionPreparedAudio,
} from "../../../packages/scene-contract/src/index.ts";
import { COMPOSITION_EVALUATOR_VERSION } from "../../../packages/renderer-core/src/composition/evaluate/index.ts";
import { sha256Hex } from "../../../packages/renderer-core/src/browser-checksum.ts";
import { scheduleRenderedAudio } from "../../../packages/renderer-core/src/rendered-audio-playback.ts";

const FETCH_CHUNK_BYTES = 64 * 1024;

/** One budget includes active buffers, in-flight candidates and digest-copy reservations. */
export class CompositionAudioPreviewLoader {
  private context?: AudioContext;
  private reservedBytes = 0;
  get pcmWorkingBytes() {
    return this.reservedBytes;
  }
  private getContext() {
    const context = (this.context ??= new AudioContext({ sampleRate: 48000 }));
    if (context.sampleRate !== 48000)
      throw new Error("Native audio preview requires a 48 kHz audio context");
    return context;
  }
  async prepare(
    composition: Composition,
    input: CompositionPreparedAudio,
    url: string,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    const audio = CompositionPreparedAudioSchema.parse(input);
    if (
      audio.sampleCount !==
        (composition.frameCount * 48000) / composition.fps ||
      audio.evaluatorVersion !== COMPOSITION_EVALUATOR_VERSION
    )
      throw new Error("Native audio preview clock or evaluator differs");
    // Encoded master, full digest-copy reservation, planar buffer, canonical header and one fetch page.
    const planarBytes = audio.sampleCount * 8;
    const reservation = audio.resource.byteLength * 3 + FETCH_CHUNK_BYTES;
    const limit = resolveCompositionMediaLimits(
      composition.mediaLimits,
    ).audioWorkingBytes;
    if (this.reservedBytes + reservation > limit)
      throw new Error(
        "Native audio preview exceeds its PCM working-memory limit",
      );
    this.reservedBytes += reservation;
    let retained = 0;
    try {
      const expectedHeader = compositionAudioWavHeader(audio.sampleCount);
      const mapping = new TextEncoder().encode(
        compositionMediaMappingDocument(composition),
      );
      if ("sha256:" + (await sha256Hex(mapping.buffer)) !== audio.mappingHash)
        throw new Error(
          "Native audio preview mapping differs; prepare this document again",
        );
      signal.throwIfAborted();
      const bytes = await this.fetchMaster(
        url,
        audio.resource.byteLength,
        signal,
      );
      if ("sha256:" + (await sha256Hex(bytes.buffer)) !== audio.resource.sha256)
        throw new Error("Native audio preview checksum differs");
      signal.throwIfAborted();
      if (expectedHeader.some((byte, index) => bytes[index] !== byte))
        throw new Error("Native audio preview WAV header differs");
      const context = this.getContext();
      const buffer = context.createBuffer(2, audio.sampleCount, 48000);
      const left = buffer.getChannelData(0),
        right = buffer.getChannelData(1);
      const view = new DataView(bytes.buffer);
      for (let sample = 0; sample < audio.sampleCount; sample++) {
        const at = expectedHeader.length + sample * 8;
        const l = view.getFloat32(at, true),
          r = view.getFloat32(at + 4, true);
        if (!Number.isFinite(l) || !Number.isFinite(r))
          throw new Error("Native audio preview contains a nonfinite sample");
        left[sample] = l;
        right[sample] = r;
        if ((sample & 32767) === 32767) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          signal.throwIfAborted();
        }
      }
      signal.throwIfAborted();
      retained = planarBytes;
      return new CompositionAudioPlayer(context, buffer, composition, () => {
        this.reservedBytes -= planarBytes;
      });
    } finally {
      this.reservedBytes -= reservation - retained;
    }
  }
  private async fetchMaster(
    url: string,
    byteLength: number,
    signal: AbortSignal,
  ) {
    const response = await fetch(url, { signal });
    signal.throwIfAborted();
    if (!response.ok || !response.body)
      throw new Error("Cannot load native audio master");
    const reader = response.body.getReader({ mode: "byob" });
    try {
      const length = response.headers.get("Content-Length");
      if (length !== null && Number(length) !== byteLength)
        throw new Error("Native audio preview byte count differs");
      const bytes = new Uint8Array(byteLength);
      let offset = 0;
      let page = new Uint8Array(FETCH_CHUNK_BYTES);
      while (true) {
        signal.throwIfAborted();
        const chunk = await reader.read(page);
        if (chunk.done) break;
        if (
          chunk.value.length > FETCH_CHUNK_BYTES ||
          offset + chunk.value.length > byteLength
        )
          throw new Error(
            "Native audio preview exceeds its byte or fetch-chunk bound",
          );
        bytes.set(chunk.value, offset);
        offset += chunk.value.length;
        page = new Uint8Array(chunk.value.buffer as ArrayBuffer);
      }
      if (offset !== byteLength)
        throw new Error("Native audio preview byte count differs");
      return bytes;
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
  }
}

export class CompositionAudioPlayer {
  private playback: ReturnType<typeof scheduleRenderedAudio> | undefined;
  private generation = 0;
  private disposed = false;
  constructor(
    private readonly context: AudioContext,
    private buffer: AudioBuffer | undefined,
    private readonly composition: Pick<Composition, "fps" | "frameCount">,
    private readonly release: () => void,
  ) {}
  get frame() {
    return this.playback?.frame;
  }
  async play(frame: number) {
    this.stop();
    const ticket = this.generation;
    if (this.disposed || !this.buffer) return false;
    await this.context.resume();
    if (this.disposed || ticket !== this.generation || !this.buffer)
      return false;
    this.playback = scheduleRenderedAudio(this.context, this.buffer, {
      frame,
      frameCount: this.composition.frameCount,
      fps: this.composition.fps,
      when: this.context.currentTime + 0.04,
    });
    return true;
  }
  stop() {
    this.generation++;
    this.playback?.stop();
    this.playback = undefined;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.buffer = undefined;
    this.release();
  }
}
