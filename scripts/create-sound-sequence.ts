import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { StoryAuthoringPlanSchema } from "../packages/scene-contract/src/story-authoring.ts";
import { PassageAudioSchema } from "../packages/scene-contract/src/passage-audio.ts";

const directory = resolve("assets/illustrated-sequence/sounds-v001");
const planPath = resolve(
  "benchmarks/fixtures/illustrated-sequence/sound/access-story.json",
);
await mkdir(directory, { recursive: true });
await mkdir(dirname(planPath), { recursive: true });
const sampleRate = 48000,
  duration = 2;

function wav(sample: (time: number, noise: number) => number) {
  const count = sampleRate * duration,
    bytes = Buffer.alloc(44 + count * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(count * 2, 40);
  let seed = 1207,
    previous = 0;
  for (let i = 0; i < count; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    previous += ((seed / 2 ** 32) * 2 - 1 - previous) * 0.12;
    const value = sample(i / sampleRate, previous);
    bytes.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, value)) * 32767),
      44 + i * 2,
    );
  }
  return bytes;
}
const sin = (hz: number, t: number) => Math.sin(2 * Math.PI * hz * t);
const sounds = [
  {
    id: "route-brush",
    sample: (t: number, noise: number) =>
      (noise * 0.9 + sin(320 + 180 * t, t) * 0.1) *
      Math.sin(Math.PI * Math.min(1, t / 0.84)) ** 2,
  },
  {
    id: "pressure-creak",
    sample: (t: number, noise: number) =>
      (sin(140 + 12 * t, t) * 0.18 +
        sin(287 + 18 * t, t) * 0.07 +
        noise * 0.4) *
      (0.7 + 0.3 * sin(7, t)),
  },
  {
    id: "wood-tap",
    sample: (t: number, noise: number) =>
      (sin(175, t) * 0.65 + sin(411, t) * 0.18 + noise * 0.7) *
      Math.exp(-19 * t) *
      Math.min(1, t * 1000),
  },
  {
    id: "soft-resolve",
    sample: (t: number) =>
      (sin(392, t) * 0.22 + sin(588, t) * 0.09) *
      Math.exp(-5 * t) *
      Math.min(1, t * 30),
  },
];
const assets = [];
for (const sound of sounds) {
  const path = resolve(directory, sound.id + ".wav"),
    bytes = wav(sound.sample);
  await writeFile(path, bytes);
  assets.push({
    id: sound.id,
    path: relative(dirname(planPath), path),
    sha256: "sha256:" + createHash("sha256").update(bytes).digest("hex"),
  });
}
const plan = StoryAuthoringPlanSchema.parse(
  JSON.parse(
    await readFile(
      "benchmarks/fixtures/illustrated-sequence/narrated/access-story.json",
      "utf8",
    ),
  ),
);
plan.id = "illustrated-access-sound";
plan.title = "Access changes · narration and linked sound";
for (const beat of plan.beats) beat.template = "../narrated/" + beat.template;
plan.audio = PassageAudioSchema.parse({
  schemaVersion: "passage-audio-1",
  assets,
  masterGainDb: 0,
  narrationGainDb: 0,
  sounds: [
    {
      id: "connection-brush",
      beat: "detail",
      asset: "route-brush",
      anchor: { type: "event", id: "route-reveals", edge: "start" },
      durationFrames: 20,
      gainDb: -16,
      fadeInFrames: 1,
      fadeOutFrames: 5,
    },
    {
      id: "pressure-build",
      beat: "action",
      asset: "pressure-creak",
      anchor: { type: "event", id: "pressure-arrives", edge: "start" },
      durationFrames: 36,
      gainDb: -20,
      fadeInFrames: 4,
      fadeOutFrames: 4,
    },
    {
      id: "restriction-tap",
      beat: "action",
      asset: "wood-tap",
      anchor: { type: "event", id: "access-changes", edge: "start" },
      durationFrames: 12,
      gainDb: -14,
      fadeOutFrames: 8,
    },
    {
      id: "access-resolve",
      beat: "consequence",
      asset: "soft-resolve",
      anchor: { type: "cue", id: "consequence" },
      durationFrames: 18,
      gainDb: -18,
      fadeInFrames: 2,
      fadeOutFrames: 8,
    },
  ],
});
await writeFile(planPath, JSON.stringify(plan, null, 2) + "\n");
await writeFile(
  resolve(directory, "README.md"),
  `# Original sound cues\n\nCreated procedurally by scripts/create-sound-sequence.ts. No sampled or third-party recordings, anime audio, or generated voices. Deterministic mono 48 kHz PCM WAV, two seconds per asset. These are abstract editorial accents, not reconstructions of historical sounds.\n\nThe sound plan reuses the accepted narrated-v002 pictures and voice without retiming. Gain, source trims and fades live in the passage audio contract, not baked into the video. The accepted narration-only version remains unchanged.\n`,
);
console.log(planPath);
