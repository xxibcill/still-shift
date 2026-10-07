import { expect, it } from "vitest";
import {
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import {
  evaluateComp,
  evaluateCompositionAudio,
} from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";

function document(fps: Composition["fps"] = 24): Composition {
  return {
    schemaVersion: "composition-1",
    id: "audio-clock",
    width: 64,
    height: 48,
    fps,
    frameCount: fps * 2,
    assets: [
      {
        id: "pcm",
        type: "audio",
        path: "voice.wav",
        sha256: `sha256:${"0".repeat(64)}`,
        sampleRate: 48000,
        sampleCount: 48123,
        channels: 1,
      },
    ],
    layers: [
      {
        id: "sound",
        type: "audio",
        asset: "pcm",
        sourceStartSample: 123,
        sourceEndSample: 48123,
      },
    ],
  };
}

it.each([24, 25, 30, 50, 60] as const)(
  "keeps every source sample through the last nested frame at %i root fps",
  (fps) => {
    const comp = document(fps);
    const audio = comp.layers[0]!;
    if (audio.type !== "audio") throw Error("Expected audio");
    audio.role = "narration";
    comp.layers = [
      { id: "host", type: "precomp", comp: "spoken", startFrame: 2 },
    ];
    comp.precomps = [
      {
        id: "spoken",
        width: 64,
        height: 48,
        fps: 25,
        frameCount: 25,
        layers: [audio],
      },
    ];
    expect(validateComposition(comp).ok).toBe(true);
    const origin = (2 * 48000) / fps;
    for (const elapsed of [0, 1, 1999, 24000, 46080, 47998, 47999]) {
      const state = evaluateCompositionAudio(comp, origin + elapsed)[0]!;
      expect(state).toMatchObject({
        key: "host/sound",
        sourceSample: 123 + elapsed,
        clipSample: elapsed,
        gainDb: 0,
        pan: 0,
      });
    }
    expect(evaluateCompositionAudio(comp, origin - 1)).toEqual([]);
    expect(evaluateCompositionAudio(comp, origin + 48000)).toEqual([]);
    // Picture evaluation retains its established frameCount-1 clamp.
    expect(
      evaluateComp(comp, ((origin + 47999) * fps) / 48000).layers[0]!.precomp!
        .layers[0]!.media!.sourceSample,
    ).toBe(46203);
  },
);

it("evaluates actual gain/pan/remap dependencies without unrelated picture layers", () => {
  const comp = document();
  comp.layers.push(
    { id: "control", type: "null", transform: { position: [10, 0] } },
    { id: "unrelated", type: "solid", size: [4, 4], color: "#ffffff" },
  );
  comp.drivers = [
    { target: "sound.gainDb", source: "control.transform.position.x" },
  ];
  comp.expressions = {
    "sound.gainDb": { source: "value + 4" },
    "sound.pan": { source: "-2" },
    "sound.timeRemap": { source: "value + 0.125" },
    "unrelated.transform.rotation": { source: "1 / 0" },
  };
  expect(evaluateCompositionAudio(comp, 1)[0]).toMatchObject({
    sourceSample: 6124,
    clipSample: 1,
    gainDb: 12,
    pan: -1,
  });
  expect(() => evaluateComp(comp, 0)).toThrow();
});

it("applies ordinary stretch and hold on the continuous source and local clip clocks", () => {
  const comp = document();
  comp.layers[0]!.stretch = 2;
  expect(evaluateCompositionAudio(comp, 1)[0]).toMatchObject({
    sourceSample: 123.5,
    clipSample: 0.5,
  });
  const held = structuredClone(comp);
  held.layers[0]!.holdFrame = 1;
  expect(evaluateCompositionAudio(held, 47000)[0]).toMatchObject({
    sourceSample: 2123,
    clipSample: 2000,
  });
});

it("preserves singleton PCM cycle length and ends finite cycles in silence", () => {
  const comp = document();
  const audio = comp.layers[0]!;
  if (audio.type !== "audio") throw Error("Expected audio");
  audio.sourceStartSample = 0;
  audio.sourceEndSample = 2000;
  comp.layers = [
    { id: "host", type: "precomp", comp: "one", loop: "cycle", loopCount: 2 },
  ];
  comp.precomps = [
    {
      id: "one",
      width: 64,
      height: 48,
      fps: 24,
      frameCount: 1,
      layers: [audio],
    },
  ];
  for (const sample of [0, 1, 1999, 2000, 2001, 3999])
    expect(evaluateCompositionAudio(comp, sample)[0]!.sourceSample).toBe(
      sample % 2000,
    );
  expect(evaluateCompositionAudio(comp, 4000)).toEqual([]);
  expect(
    evaluateComp(comp, 1.5).layers[0]!.precomp!.layers[0]!.media!.sourceSample,
  ).toBe(0);
});

it("reflects pingpong at the last PCM sample without inserting endpoint silence", () => {
  const comp = document();
  const audio = comp.layers[0]!;
  if (audio.type !== "audio") throw Error("Expected audio");
  audio.sourceStartSample = 0;
  audio.sourceEndSample = 4000;
  comp.layers = [
    {
      id: "host",
      type: "precomp",
      comp: "two",
      loop: "pingpong",
      loopCount: 1,
    },
  ];
  comp.precomps = [
    {
      id: "two",
      width: 64,
      height: 48,
      fps: 24,
      frameCount: 2,
      layers: [audio],
    },
  ];
  for (const [sample, source] of [
    [0, 0],
    [3998, 3998],
    [3999, 3999],
    [4000, 3998],
    [7997, 1],
  ])
    expect(evaluateCompositionAudio(comp, sample!)[0]!.sourceSample).toBe(
      source,
    );
  expect(evaluateCompositionAudio(comp, 7998)).toEqual([]);
});

it("respects group and precomp visibility and retains distinct audio instance routes", () => {
  const comp = document();
  const audio = comp.layers[0]!;
  comp.layers = [
    { id: "hidden", type: "group", size: [64, 48], enabled: false },
    { id: "muted", type: "precomp", comp: "sounds", parent: "hidden" },
    { id: "first", type: "precomp", comp: "sounds" },
    { id: "second", type: "precomp", comp: "sounds", inPoint: 1, outPoint: 2 },
  ];
  comp.precomps = [
    { id: "sounds", width: 64, height: 48, frameCount: 48, layers: [audio] },
  ];
  expect(evaluateCompositionAudio(comp, 0).map((state) => state.key)).toEqual([
    "first/sound",
  ]);
  expect(
    evaluateCompositionAudio(comp, 2000).map((state) => state.key),
  ).toEqual(["first/sound", "second/sound"]);
  expect(
    evaluateCompositionAudio(comp, 4000).map((state) => state.key),
  ).toEqual(["first/sound"]);
});

it("rejects baked source sample clocks for protected voice and its ancestor before ranges are selected", () => {
  const comp = document();
  const audio = comp.layers[0]!;
  if (audio.type !== "audio") throw Error("Expected audio");
  audio.role = "narration";
  audio.enabled = false;
  audio.sampleTimes = [0, 23];
  expect(
    validateComposition(comp).diagnostics.map((diagnostic) => diagnostic.code),
  ).toContain("comp-media-narration-clock");
  delete audio.sampleTimes;
  comp.layers = [
    { id: "host", type: "precomp", comp: "spoken", sampleTimes: [0, 23] },
  ];
  comp.precomps = [
    { id: "spoken", width: 64, height: 48, frameCount: 48, layers: [audio] },
  ];
  expect(
    validateComposition(comp).diagnostics.map((diagnostic) => diagnostic.code),
  ).toContain("comp-media-narration-clock");
});

it("rejects fractional, negative and nonfinite output sample indices", () => {
  const comp = document();
  for (const sample of [-1, 0.5, Infinity, NaN])
    expect(() => evaluateCompositionAudio(comp, sample)).toThrow("sample");
  expect(() =>
    evaluateCompositionAudio(comp, 0, { scopeTimes: { host: 0 } }),
  ).toThrow("scope clocks");
});

it.each([24, 25, 30, 50, 60] as const)(
  "ends singleton PCM pingpong on the exact quantized terminal sample at %i fps",
  (fps) => {
    const comp = document(fps);
    const audio = comp.layers[0]!;
    if (audio.type !== "audio") throw Error("Expected audio");
    audio.sourceStartSample = 0;
    audio.sourceEndSample = 48000 / fps;
    comp.layers = [
      {
        id: "host",
        type: "precomp",
        comp: "one",
        loop: "pingpong",
        loopCount: 1,
      },
    ];
    comp.precomps = [
      { id: "one", width: 64, height: 48, fps, frameCount: 1, layers: [audio] },
    ];
    const period = 2 * (48000 / fps - 1);
    expect(evaluateCompositionAudio(comp, period - 1)[0]!.sourceSample).toBe(1);
    expect(evaluateCompositionAudio(comp, period)).toEqual([]);
    expect(evaluateCompositionAudio(comp, period + 1)).toEqual([]);
  },
);
