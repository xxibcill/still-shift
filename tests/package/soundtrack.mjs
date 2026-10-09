import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  soundtrackChecksum,
  readSoundtrackProject,
  renderSoundtrackProject,
} from "still-shift/engine";

const project = {
  schemaVersion: "soundtrack-project-1",
  revision: 0,
  history: { undo: [], redo: [] },
  sampleRate: 48000,
  channels: 2,
  durationSamples: 4800,
  channelConversion: "mono-duplicate-stereo-preserve",
  normalization: "none",
  tailPolicy: "retain-to-project-end",
  assets: [
    {
      id: "source",
      path: "source.wav",
      sha256: await soundtrackChecksum("source.wav"),
    },
  ],
  clips: [
    {
      id: "cue",
      asset: "source",
      track: "effect",
      sourceStartSample: 0,
      sourceEndSample: 4800,
      startSample: 0,
      gainDb: 0,
      fadeInSamples: 0,
      fadeOutSamples: 0,
      automation: { interpolation: "linear", points: [] },
    },
  ],
  tracks: [
    {
      id: "effect",
      role: "sfx",
      output: "master",
      gainDb: 0,
      mute: false,
      solo: false,
      processors: [],
    },
  ],
  buses: [],
  master: { id: "master", gainDb: 0 },
};
await writeFile("soundtrack.json", JSON.stringify(project));
await readSoundtrackProject("soundtrack.json");
await renderSoundtrackProject("soundtrack.json", "soundtrack-output");
assert.ok((await readFile("soundtrack-output/audio/mix.wav")).length > 44);
