import {
  resolveSoundtrackAnchors,
  validateSoundtrackNarration,
} from "../../../packages/renderer-core/src/soundtrack-edits.ts";
import type { SoundtrackProject } from "../../../packages/scene-contract/src/soundtrack-project.ts";
import type { CompiledStoryPassage } from "../../../packages/renderer-core/src/story-passage.ts";
import { schedulePassageAudio } from "../../../packages/renderer-core/src/passage-audio-playback.ts";
import { sha256Hex } from "../../../packages/renderer-core/src/browser-checksum.ts";

export class PassageAudioPlayer {
  private context?: AudioContext;
  private soundtrack:
    | { project: SoundtrackProject; buffer: AudioBuffer }
    | undefined;
  clearSoundtrack() {
    this.stop();
    this.soundtrack = undefined;
  }
  async setSoundtrack(
    project: SoundtrackProject,
    bytes: ArrayBuffer,
    sha256: string,
    passage: CompiledStoryPassage,
  ) {
    resolveSoundtrackAnchors(project, { ...passage, fps: passage.plan.fps });
    validateSoundtrackNarration(project, {
      fps: passage.plan.fps,
      sourceStartFrame: passage.plan.sourceStartFrame,
      endFrameExclusive: passage.endFrameExclusive,
      ...(passage.plan.narration
        ? { sha256: passage.plan.narration.sha256 }
        : {}),
    });
    if ("sha256:" + (await sha256Hex(bytes)) !== sha256)
      throw new Error("Rendered soundtrack checksum differs");
    const buffer = await this.getContext().decodeAudioData(bytes);
    if (
      buffer.sampleRate !== 48000 ||
      buffer.numberOfChannels !== 2 ||
      buffer.length !== project.durationSamples
    )
      throw new Error("Soundtrack preview must be full-length 48 kHz stereo");
    this.stop();
    this.soundtrack = { project, buffer };
  }

  private cache = new Map<string, AudioBuffer>();
  private voice: { sha256: string; buffer: AudioBuffer } | undefined;
  private playback: ReturnType<typeof schedulePassageAudio> | undefined;
  private generation = 0;
  private started = 0;
  private startFrame = 0;
  private fps = 24;
  private getContext() {
    return (this.context ??= new AudioContext({ sampleRate: 48000 }));
  }

  async prepare(passage: CompiledStoryPassage) {
    for (const asset of passage.audio?.assets ?? []) {
      if (this.cache.has(asset.sha256)) continue;
      const response = await fetch(
        "/passage-api/asset?path=" + encodeURIComponent(asset.path),
      );
      if (!response.ok) throw new Error("Cannot load sound: " + asset.id);
      const bytes = await response.arrayBuffer();
      if ("sha256:" + (await sha256Hex(bytes)) !== asset.sha256)
        throw new Error("Sound checksum differs: " + asset.id);
      const buffer = await this.getContext().decodeAudioData(bytes);
      if (buffer.numberOfChannels > 2)
        throw new Error("Sound must be mono or stereo: " + asset.id);
      this.cache.set(asset.sha256, buffer);
    }
    for (const sound of passage.audio?.sounds ?? []) {
      const asset = passage.audio!.assets.find(
        (asset) => asset.id === sound.asset,
      )!;
      if (
        this.cache.get(asset.sha256)!.duration + 1 / 48000 <
        (sound.sourceStartFrame + sound.durationFrames) / passage.plan.fps
      )
        throw new Error(
          "Sound source does not cover the requested trim: " + sound.id,
        );
    }
  }
  async decodeNarration(file: File, passage: CompiledStoryPassage) {
    const identity = passage.plan.narration;
    if (!identity) throw new Error("This plan has no narration identity.");
    const voice = await this.decodeNarrationSource(file);
    if (voice.sha256 !== identity.sha256)
      throw new Error("Narration checksum differs from the plan");
    if (voice.buffer.duration < passage.endFrameExclusive / passage.plan.fps)
      throw new Error("Narration does not cover the passage");
    return voice;
  }
  async decodeNarrationSource(file: File) {
    if (!/\.(wav|mp3)$/i.test(file.name))
      throw new Error("Use a WAV or MP3 narration file");
    if (file.size > 100_000_000)
      throw new Error("Narration exceeds the 100 MB browser import limit");
    const bytes = await file.arrayBuffer();
    const sha256 = await sha256Hex(bytes);
    const buffer = await this.getContext().decodeAudioData(bytes);
    if (buffer.numberOfChannels > 2)
      throw new Error("Narration must be mono or stereo");
    return { sha256, buffer };
  }
  setNarration(voice?: { sha256: string; buffer: AudioBuffer }) {
    this.voice = voice;
  }
  hasNarration(passage: CompiledStoryPassage) {
    return (
      this.voice?.sha256 === passage.plan.narration?.sha256 &&
      Boolean(this.voice)
    );
  }
  stop() {
    this.generation++;
    this.playback?.stop();
    this.playback = undefined;
  }
  async play(
    passage: CompiledStoryPassage,
    frame: number,
    soundEffects: boolean,
  ) {
    this.stop();
    const ticket = this.generation;
    const context = this.getContext();
    await context.resume();
    if (ticket !== this.generation) return false;
    this.started = context.currentTime + 0.04;
    this.startFrame = frame;
    this.fps = passage.plan.fps;
    const buffers = new Map(
      (passage.audio?.assets ?? []).map((asset) => [
        asset.id,
        this.cache.get(asset.sha256)!,
      ]),
    );
    if (this.soundtrack) {
      resolveSoundtrackAnchors(this.soundtrack.project, {
        ...passage,
        fps: passage.plan.fps,
      });
      validateSoundtrackNarration(this.soundtrack.project, {
        fps: passage.plan.fps,
        sourceStartFrame: passage.plan.sourceStartFrame,
        endFrameExclusive: passage.endFrameExclusive,
        ...(passage.plan.narration
          ? { sha256: passage.plan.narration.sha256 }
          : {}),
      });
      const source = context.createBufferSource();
      source.buffer = this.soundtrack.buffer;
      source.connect(context.destination);
      source.start(
        this.started,
        frame / this.fps,
        (passage.frameCount - frame) / this.fps,
      );
      this.playback = {
        stop: () => {
          try {
            source.stop();
          } catch {
            /* Already stopped. */
          }
          source.disconnect();
        },
      };
      return true;
    }
    this.playback = schedulePassageAudio(
      context,
      passage,
      buffers,
      this.hasNarration(passage) ? this.voice!.buffer : undefined,
      { frame, when: this.started, soundEffects },
    );
    return true;
  }
  get frame() {
    return (
      this.startFrame +
      Math.floor(
        Math.max(0, this.getContext().currentTime - this.started) * this.fps +
          0.00001,
      )
    );
  }
}
