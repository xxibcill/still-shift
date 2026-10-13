import { createHash } from "node:crypto";
import { compileBlenderEpisode } from "@still-shift/animation-engine";
export const blenderHash = (bytes: string | Buffer) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");
export const blenderEpisodeSource = () => ({
  schemaVersion: "blender-episode-source-1",
  family: "zipper",
  designVariant: "metal-tooth-zipper",
  asset: { path: "native.blend", bytes: 2, sha256: blenderHash("{}") },
  collection: "asset.EU-004",
  resourcePolicy: "embedded-only",
  controller: {
    object: "controls",
    properties: { "slider.travel": { min: 0.34, max: 3.65 } },
  },
  evidenceFiles: [],
});
export const blenderEpisodePlan = () => ({
  schemaVersion: "blender-episode-plan-1",
  id: "EU-004",
  locale: "en",
  width: 320,
  height: 568,
  fps: 30,
  samples: 32,
  background: "#07121d",
  narration: {
    id: "voice",
    type: "audio",
    path: "voice.wav",
    sha256: blenderHash("wave"),
    sampleRate: 48000,
    sampleCount: 96000,
    channels: 1,
  },
  originalNarrationClock: { sampleRate: 44100, samples: 88200 },
  font: { path: "font.ttf", sha256: blenderHash("font"), weight: "600" },
  sourceFrameTrack: [{ frame: 0, value: 0, interpolation: "hold" }],
  controlTracks: {
    "slider.travel": [
      { frame: 0, value: 0.34, interpolation: "linear" },
      { frame: 30, value: 3.65, interpolation: "linear" },
      { frame: 59, value: 0.34, interpolation: "hold" },
    ],
  },
  shots: [
    {
      id: "recognition",
      start: 0,
      endExclusive: 30,
      camera: "camera.main",
      hiddenParts: [],
    },
    {
      id: "guide",
      start: 30,
      endExclusive: 60,
      camera: "camera.guide",
      hiddenParts: ["slider.plate.upper"],
    },
  ],
  speech: [
    {
      id: "join",
      text: "The teeth join.",
      startSample: 0,
      endSampleExclusive: 48000,
    },
    {
      id: "separate",
      text: "Then they separate.",
      startSample: 48000,
      endSampleExclusive: 96000,
    },
  ],
});
export const blenderCompiledFixture = () =>
  compileBlenderEpisode(blenderEpisodeSource(), blenderEpisodePlan());
