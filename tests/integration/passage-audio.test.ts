import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import {
  renderPassageAudio,
  verifyPassageAudioAssets,
} from "../../packages/animation-engine/src/passage-audio.ts";
import { readStoryPassage } from "../../packages/animation-engine/src/story-passage-io.ts";
import { compileStoryPassage } from "../../packages/renderer-core/src/story-passage.ts";
import { PassageAudioSchema } from "../../packages/scene-contract/src/passage-audio.ts";
import { writeStoryWorkspace } from "../../packages/animation-engine/src/story-workspace.ts";

let directory: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "passage-audio-"));
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const source = await readStoryPassage(
    "benchmarks/fixtures/story-authoring/linked-comparison.json",
  );
  const path = join(directory, "tone.wav");
  await runProcess("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "aevalsrc=0.5:s=48000:d=2",
    "-c:a",
    "pcm_s16le",
    path,
  ]);
  const plan = structuredClone(source.plan);
  if (plan.schemaVersion !== "story-passage-2")
    throw new Error("Expected authoring plan");
  plan.audio = PassageAudioSchema.parse({
    schemaVersion: "passage-audio-1",
    assets: [
      {
        id: "tone",
        path,
        sha256:
          "sha256:" +
          createHash("sha256")
            .update(await readFile(path))
            .digest("hex"),
      },
    ],
    sounds: [
      {
        id: "tone",
        beat: plan.beats[0]!.id,
        asset: "tone",
        anchor: { type: "cue", id: plan.beats[0]!.cues[0]!.id },
        durationFrames: 24,
        sourceStartFrame: 12,
        gainDb: -6,
        fadeInFrames: 6,
        fadeOutFrames: 6,
      },
    ],
  });
  return {
    passage: { ...source, ...compileStoryPassage(plan, source.templates) },
    templates: source.templates,
    path,
  };
}
async function samples(path: string) {
  const raw = path + ".f32";
  await runProcess("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    path,
    "-f",
    "f32le",
    "-acodec",
    "pcm_f32le",
    raw,
  ]);
  const bytes = await readFile(raw);
  return new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
}
describe("exported passage audio", () => {
  it("does not count MP3 encoder padding as usable source audio", async () => {
    const { passage, path } = await fixture();
    const mp3 = join(directory, "padded.mp3");
    await runProcess("ffmpeg", [
      "-v",
      "error",
      "-n",
      "-i",
      path,
      "-c:a",
      "libmp3lame",
      "-q:a",
      "4",
      mp3,
    ]);
    passage.audio!.assets[0]!.path = mp3;
    passage.audio!.assets[0]!.sha256 =
      "sha256:" +
      createHash("sha256")
        .update(await readFile(mp3))
        .digest("hex");
    passage.plan.fps = 30;
    passage.audio!.sounds[0]!.sourceStartFrame = 0;
    passage.audio!.sounds[0]!.durationFrames = 61;
    await expect(verifyPassageAudioAssets(passage)).rejects.toThrow(/cover/);
    passage.audio!.sounds[0]!.durationFrames = 60;
    await expect(verifyPassageAudioAssets(passage)).resolves.toBeInstanceOf(
      Map,
    );
  });
  it("packages sound assets portably and rejects altered packaged bytes", async () => {
    const { passage, path } = await fixture();
    const provenance = {
      provider: "elevenlabs" as const,
      model: "eleven_text_to_sound_v2" as const,
      prompt: "A wooden tap",
      durationSeconds: 2,
      promptInfluence: 0.3,
      loop: false,
      generatedAt: "2026-09-28T00:00:00.000Z",
    };
    if (passage.plan.schemaVersion !== "story-passage-2")
      throw new Error("Expected linked plan");
    passage.plan.audio!.assets[0]!.generation = provenance;
    passage.audio!.assets[0]!.generation = provenance;
    const output = join(directory, "package"),
      moved = join(directory, "moved");
    const manifest = await writeStoryWorkspace(output, passage);
    expect(manifest.files.filter((file) => file.kind === "audio")).toHaveLength(
      1,
    );
    await rename(output, moved);
    await rm(path);
    const restored = await readStoryPassage(join(moved, "workspace.json"));
    expect(restored.audio!.sounds).toEqual(passage.audio!.sounds);
    expect(restored.audio!.assets[0]!.path.startsWith(moved)).toBe(true);
    expect(restored.audio!.assets[0]!.generation).toEqual(provenance);
    const asset = manifest.files.find((file) => file.kind === "audio")!;
    await writeFile(join(moved, asset.path), "tampered");
    await expect(
      readStoryPassage(join(moved, "workspace.json")),
    ).rejects.toThrow(/checksum/);
  }, 30_000);
  it("mixes exact onsets, gain and fades, including a range beginning mid-fade", async () => {
    const { passage } = await fixture();
    const full = join(directory, "full.wav");
    await renderPassageAudio(full, passage);
    const data = await samples(full),
      start = passage.audio!.sounds[0]!.start;
    const at = (frame: number) =>
      data[Math.round((frame / passage.plan.fps) * 48000) * 2]!;
    expect(data.length).toBe(
      (passage.frameCount / passage.plan.fps) * 48000 * 2,
    );
    expect(at(start - 1)).toBe(0);
    expect(at(start + 3)).toBeCloseTo(0.5 * 10 ** (-6 / 20) * 0.5, 4);
    expect(at(start + 10)).toBeCloseTo(0.5 * 10 ** (-6 / 20), 4);
    expect(at(start + 21)).toBeCloseTo(at(start + 3), 4);
    expect(at(start + 24)).toBe(0);
    const range = { start: start + 3, end: start + 28 };
    const partial = join(directory, "partial.wav");
    await renderPassageAudio(partial, passage, undefined, { range });
    const cropped = await samples(partial);
    const offset = (range.start / passage.plan.fps) * 48000 * 2;
    expect(cropped).toEqual(data.slice(offset, offset + cropped.length));
    expect(
      await renderPassageAudio(
        join(directory, "muted.wav"),
        passage,
        undefined,
        { soundEffects: false },
      ),
    ).toBeUndefined();
  });
  it("rejects altered assets and trims longer than the decoded source", async () => {
    const { passage, path } = await fixture();
    passage.audio!.sounds[0]!.sourceStartFrame = 40;
    await expect(verifyPassageAudioAssets(passage)).rejects.toThrow(/cover/);
    passage.audio!.sounds[0]!.sourceStartFrame = 0;
    await writeFile(path, "changed bytes");
    await expect(verifyPassageAudioAssets(passage)).rejects.toThrow(/checksum/);
  });
  it("trims source audio and narration independently and applies both mix levels", async () => {
    const { passage, path } = await fixture();
    const narration = join(directory, "voice.wav");
    await runProcess("ffmpeg", [
      "-v",
      "error",
      "-n",
      "-f",
      "lavfi",
      "-i",
      "aevalsrc=0.01*t:s=48000:d=30",
      "-c:a",
      "pcm_f32le",
      narration,
    ]);
    await runProcess("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "aevalsrc=0.1*t:s=48000:d=2",
      "-c:a",
      "pcm_f32le",
      path,
    ]);
    passage.audio!.assets[0]!.sha256 =
      "sha256:" +
      createHash("sha256")
        .update(await readFile(path))
        .digest("hex");
    passage.plan.sourceStartFrame = 24;
    passage.endFrameExclusive = 24 + passage.frameCount;
    passage.audio!.masterGainDb = -3;
    passage.audio!.narrationGainDb = -6;
    const sound = passage.audio!.sounds[0]!;
    const range = { start: sound.start + 10, end: sound.start + 13 };
    const output = join(directory, "voice-and-trim.wav");
    await renderPassageAudio(output, passage, narration, { range });
    const data = await samples(output);
    const voice = 0.01 * ((24 + range.start) / 24) * 10 ** (-6 / 20);
    const effect =
      0.1 * ((sound.sourceStartFrame + 10) / 24) * 10 ** (sound.gainDb / 20);
    expect(data[0]).toBeCloseTo((voice + effect) * 10 ** (-3 / 20), 6);
    const voiceOnly = join(directory, "voice-only.wav");
    await renderPassageAudio(voiceOnly, passage, narration, {
      range,
      soundEffects: false,
    });
    expect((await samples(voiceOnly))[0]).toBeCloseTo(
      voice * 10 ** (-3 / 20),
      6,
    );
  });
});
