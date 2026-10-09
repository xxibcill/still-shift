import { expect, it } from "vitest";
import {
  compositionPcmBoundary,
  type Composition,
} from "@still-shift/scene-contract";
import {
  evaluateComp,
  evaluateCompositionAudio,
} from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";

function document(fps: number): Composition {
  return {
    schemaVersion: "composition-1",
    id: "natural-pcm",
    width: 32,
    height: 24,
    fps,
    frameCount: 30,
    assets: [
      {
        id: "voice",
        type: "audio",
        path: "voice.wav",
        sha256: `sha256:${"a".repeat(64)}`,
        sampleRate: 48000,
        sampleCount: 32,
        channels: 2,
      },
    ],
    layers: [
      {
        id: "voice",
        type: "audio",
        asset: "voice",
        role: "narration",
        startFrame: 1,
        inPoint: 1,
      },
    ],
  };
}
it("keeps natural source and trim origins exact at every supported frame rate", () => {
  for (let fps = 1; fps <= 60; fps++) {
    const comp = document(fps);
    const voice = comp.layers[0]!;
    if (voice.type !== "audio") throw Error("Expected audio");
    voice.sourceStartSample = 3;
    voice.sourceEndSample = 32;
    const first = compositionPcmBoundary(1, fps);
    expect(evaluateCompositionAudio(comp, first - 1)).toEqual([]);
    for (const elapsed of [0, 1, 28]) {
      expect(evaluateCompositionAudio(comp, first + elapsed)[0]).toMatchObject({
        sourceSample: 3 + elapsed,
        clipSample: elapsed,
      });
    }
  }
});
it("rounds the combined origin once through differently rated natural scopes", () => {
  const comp = document(29);
  const voice = comp.layers[0]!;
  comp.layers = [
    { id: "outer", type: "precomp", comp: "middle", startFrame: 1, inPoint: 1 },
  ];
  comp.precomps = [
    {
      id: "middle",
      width: 32,
      height: 24,
      fps: 31,
      frameCount: 30,
      layers: [
        {
          id: "inner",
          type: "precomp",
          comp: "spoken",
          startFrame: 1,
          inPoint: 1,
        },
      ],
    },
    {
      id: "spoken",
      width: 32,
      height: 24,
      fps: 7,
      frameCount: 30,
      layers: [voice],
    },
  ];
  const first = 10061;
  expect(evaluateCompositionAudio(comp, first - 1)).toEqual([]);
  for (const elapsed of [0, 1, 31])
    expect(evaluateCompositionAudio(comp, first + elapsed)[0]).toMatchObject({
      key: "outer/inner/voice",
      sourceSample: elapsed,
      clipSample: elapsed,
    });
});
it("maps negative natural placement to its first following PCM origin", () => {
  const comp = document(29);
  const asset = comp.assets[0]!;
  const audio = comp.layers[0]!;
  if (asset.type !== "audio" || audio.type !== "audio")
    throw Error("Expected audio");
  asset.sampleCount = 4000;
  audio.role = "sfx";
  comp.layers[0]!.startFrame = -1;
  comp.layers[0]!.inPoint = 0;
  expect(evaluateCompositionAudio(comp, 0)[0]).toMatchObject({
    sourceSample: 1655,
    clipSample: 1655,
  });
});
it("retains authored picture clocks and explicit Q16 remapping", () => {
  const comp = document(29);
  const first = compositionPcmBoundary(1, 29);
  const picture = evaluateComp(comp, (first * 29) / 48000).layers[0]!;
  const seconds = picture.timeRemap!;
  expect(seconds * 48000).toBeCloseTo(0.8275862068965, 9);
  const remapped = structuredClone(comp);
  const audio = remapped.layers[0]!;
  if (audio.type !== "audio") throw Error("Expected audio");
  audio.role = "sfx";
  remapped.expressions = { "voice.timeRemap": { source: "value" } };
  expect(evaluateCompositionAudio(remapped, first)[0]).toMatchObject({
    sourceSample: 0.8275909423828125,
    clipSample: 0.8275909423828125,
  });
});
it("keeps natural origins with gain and pan writers", () => {
  const comp = document(29);
  comp.expressions = {
    "voice.gainDb": { source: "-3" },
    "voice.pan": { source: "0.25" },
  };
  expect(
    evaluateCompositionAudio(comp, compositionPcmBoundary(1, 29))[0],
  ).toMatchObject({ sourceSample: 0, clipSample: 0, gainDb: -3, pan: 0.25 });
});

it("keeps inherited natural group windows exact through the final fractional sample", () => {
  const comp = document(29);
  const voice = comp.layers[0]!;
  if (voice.type !== "audio") throw Error("Expected audio");
  const asset = comp.assets[0]!;
  if (asset.type !== "audio") throw Error("Expected audio");
  asset.sampleCount = 6857;
  voice.parent = "window";
  comp.layers = [
    { id: "outer", type: "precomp", comp: "middle", startFrame: 1, inPoint: 1 },
  ];
  comp.precomps = [
    {
      id: "middle",
      width: 32,
      height: 24,
      fps: 31,
      frameCount: 30,
      layers: [
        {
          id: "inner",
          type: "precomp",
          comp: "spoken",
          startFrame: 1,
          inPoint: 1,
        },
      ],
    },
    {
      id: "spoken",
      width: 32,
      height: 24,
      fps: 7,
      frameCount: 30,
      layers: [
        {
          id: "window",
          type: "group",
          size: [32, 24],
          inPoint: 1,
          outPoint: 2,
        },
        voice,
      ],
    },
  ];
  expect(evaluateCompositionAudio(comp, 10060)).toEqual([]);
  expect(evaluateCompositionAudio(comp, 10061)[0]).toMatchObject({
    sourceSample: 0,
    clipSample: 0,
  });
  expect(evaluateCompositionAudio(comp, 16917)[0]).toMatchObject({
    sourceSample: 6856,
    clipSample: 6856,
  });
  expect(evaluateCompositionAudio(comp, 16918)).toEqual([]);
  const retimed = structuredClone(comp);
  const retimedVoice = retimed.precomps![1]!.layers[1]!;
  if (retimedVoice.type !== "audio") throw Error("Expected audio");
  retimedVoice.role = "sfx";
  retimed.expressions = { "outer.timeRemap": { source: "value" } };
  expect(evaluateCompositionAudio(retimed, 10061)[0]).toMatchObject({
    sourceSample: 0.297637939453125,
    clipSample: 0.297637939453125,
  });
});

it("retains Q16 source timing under remap drivers and periodic writers", () => {
  const first = compositionPcmBoundary(1, 29);
  const driven = document(29);
  const audio = driven.layers[0]!;
  if (audio.type !== "audio") throw Error("Expected audio");
  audio.role = "sfx";
  driven.layers.push({
    id: "control",
    type: "null",
    transform: { position: [0.5 / 48000, 0] },
  });
  driven.drivers = [
    { target: "voice.timeRemap", source: "control.transform.position.x" },
  ];
  expect(evaluateCompositionAudio(driven, first)[0]!.sourceSample).toBe(0.5);
  const periodic = document(29);
  const periodicAudio = periodic.layers[0]!;
  if (periodicAudio.type !== "audio") throw Error("Expected audio");
  periodicAudio.role = "sfx";
  periodic.periodic = [
    {
      target: "voice.timeRemap",
      start: 0,
      end: 20,
      oscillate: { period: 20, amplitude: 0 },
    },
  ];
  expect(evaluateCompositionAudio(periodic, first)[0]!.sourceSample).toBe(
    0.8275909423828125,
  );
});
