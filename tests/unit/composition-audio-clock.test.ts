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

it.each(["host", "group", "sound"])(
  "ignores a text attachment on %s while retaining audio clocks and picture layout",
  (target) => {
    const comp = document();
    const sound = comp.layers[0]!;
    comp.layers = [
      {
        id: "title",
        type: "text",
        text: "Title",
        fontSize: 24,
        color: "#ffffff",
      },
      { id: "group", type: "group", size: [64, 48] },
      { id: "host", type: "precomp", comp: "nested", parent: "group" },
    ];
    if (target === "sound") {
      sound.parent = "group";
      comp.layers.push(sound);
      comp.constraints = [{ type: "attach", target: "group", anchor: "title" }];
    } else comp.constraints = [{ type: "attach", target, anchor: "title" }];
    comp.precomps = [
      {
        id: "nested",
        width: 64,
        height: 48,
        frameCount: 48,
        layers: target === "sound" ? [] : [sound],
      },
    ];
    expect(validateComposition(comp).ok).toBe(true);
    expect(evaluateCompositionAudio(comp, 1)[0]).toMatchObject({
      key: target === "sound" ? "sound" : "host/sound",
      sourceSample: 124,
      clipSample: 1,
      gainDb: 0,
      pan: 0,
    });
    expect(() => evaluateComp(comp, 0)).toThrow("measured layer bounds");
    const measured = evaluateComp(comp, 0, {
      textBounds: { title: [{ left: 0, top: 0, right: 40, bottom: 24 }] },
    });
    expect(
      measured.layers.find(
        (layer) => layer.id === (target === "sound" ? "group" : target),
      )!.transform.position,
    ).not.toEqual([0, 0]);
  },
);

it("reads keyed, driven and expression audio properties without evaluating unrelated host expressions", () => {
  const comp = document();
  comp.layers = [
    { id: "host", type: "precomp", comp: "nested" },
    { id: "control", type: "null" },
  ];
  comp.precomps = [
    {
      id: "nested",
      width: 64,
      height: 48,
      frameCount: 48,
      layers: [
        {
          id: "sound",
          type: "audio",
          asset: "pcm",
          gainDb: {
            keys: [
              { frame: 0, value: -6 },
              { frame: 2, value: 0 },
            ],
          },
        },
      ],
    },
  ];
  comp.drivers = [
    { target: "host/sound.pan", source: "control.transform.position.x" },
  ];
  comp.expressions = {
    "host.transform.rotation": { source: "1 / 0" },
    "host.timeRemap": { source: "value + 1" },
    "host/sound.gainDb": { source: "value - 1" },
    "host/sound.pan": { source: "value + 0.25" },
    "host/sound.timeRemap": { source: "value + 0.125" },
  };
  expect(validateComposition(comp).ok).toBe(true);
  expect(evaluateCompositionAudio(comp, 0)[0]).toMatchObject({
    key: "host/sound",
    sourceSample: 8000,
    clipSample: 2000,
    gainDb: -4,
    pan: 0.25,
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

it("retains measured layout when an audio driver actually reads constrained geometry", () => {
  const comp = document();
  const sound = comp.layers[0]!;
  comp.layers = [
    {
      id: "title",
      type: "text",
      text: "Title",
      fontSize: 24,
      color: "#ffffff",
    },
    { id: "host", type: "precomp", comp: "nested" },
  ];
  comp.precomps = [
    { id: "nested", width: 64, height: 48, frameCount: 48, layers: [sound] },
  ];
  comp.constraints = [{ type: "attach", target: "host", anchor: "title" }];
  comp.drivers = [
    { target: "host/sound.gainDb", source: "host.transform.position.x" },
  ];
  expect(validateComposition(comp).ok).toBe(true);
  expect(() => evaluateCompositionAudio(comp, 0)).toThrow(
    "measured layer bounds",
  );
  const options = {
    textBounds: { title: [{ left: 0, top: 0, right: 16, bottom: 24 }] },
  };
  const picture = evaluateComp(comp, 0, options);
  expect(evaluateCompositionAudio(comp, 0, options)[0]!.gainDb).toBe(
    picture.layers.find((layer) => layer.id === "host")!.transform.position[0],
  );
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

it.each([
  ["disabled-group", false],
  ["disabled-host", false],
  ["disabled-audio", false],
  ["guide-group", false],
  ["guide-host", false],
  ["guide-audio", false],
  ["other-solo", false],
  ["group-solo", true],
  ["host-solo", true],
  ["disabled-null", true],
  ["guide-null", true],
  ["disabled-matte-group", true],
] as const)(
  "preserves audio visibility for %s without picture evaluation",
  (mode, audible) => {
    const comp = document();
    const sound = comp.layers[0]!;
    const group = {
      id: "group",
      type: "group" as const,
      size: [64, 48] as [number, number],
    };
    const bridge = { id: "bridge", type: "null" as const, parent: "group" };
    const host = {
      id: "host",
      type: "precomp" as const,
      comp: "nested",
      parent: "bridge",
    };
    const other = {
      id: "other",
      type: "solid" as const,
      size: [64, 48] as [number, number],
      color: "#ffffff",
    };
    comp.layers = [group, bridge, host, other];
    comp.precomps = [
      { id: "nested", width: 64, height: 48, frameCount: 48, layers: [sound] },
    ];
    const selected = mode.endsWith("group")
      ? group
      : mode.endsWith("host")
        ? host
        : mode.endsWith("audio")
          ? sound
          : bridge;
    if (mode.startsWith("disabled"))
      Object.assign(selected, { enabled: false });
    if (mode.startsWith("guide")) Object.assign(selected, { guide: true });
    if (mode.endsWith("solo"))
      Object.assign(
        mode === "other-solo" ? other : mode === "host-solo" ? host : group,
        { solo: true },
      );
    if (mode === "disabled-matte-group")
      Object.assign(other, { trackMatte: { layer: "group", mode: "alpha" } });
    expect(validateComposition(comp).ok).toBe(true);
    expect(evaluateCompositionAudio(comp, 0).map((state) => state.key)).toEqual(
      audible ? ["host/sound"] : [],
    );
    if (mode.startsWith("guide"))
      expect(
        evaluateCompositionAudio(comp, 0, { includeGuides: true }),
      ).toHaveLength(1);
  },
);

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

function setAudioSampleCount(comp: Composition, sampleCount: number) {
  const asset = comp.assets[0]!;
  if (asset.type !== "audio") throw Error("Expected audio");
  asset.sampleCount = sampleCount;
}

const audioRates = [24, 25, 30, 50, 60] as const;
const audioRatePairs = audioRates.flatMap((rootFps) =>
  audioRates.map((nestedFps) => [rootFps, nestedFps] as const),
);

it.each(audioRatePairs)(
  "keeps exact half-open audio visibility boundaries at %i root/%i nested fps",
  (rootFps, nestedFps) => {
    const samplesPerFrame = 48000 / nestedFps;
    for (const hostStart of [7, 53, 101])
      for (const voiceStart of [3, 7, 11, 17])
        for (const parent of ["none", "group", "matte"] as const) {
          const comp = document(rootFps);
          comp.frameCount = rootFps * 6;
          setAudioSampleCount(comp, samplesPerFrame);
          comp.layers = [
            {
              id: "host",
              type: "precomp",
              comp: "spoken",
              startFrame: hostStart,
            },
          ];
          comp.precomps = [
            {
              id: "spoken",
              width: 64,
              height: 48,
              fps: nestedFps,
              frameCount: 100,
              layers: [
                {
                  id: "voice",
                  type: "audio",
                  asset: "pcm",
                  role: "narration",
                  startFrame: voiceStart,
                  inPoint: voiceStart,
                  outPoint: voiceStart + 1,
                  ...(parent === "none" ? {} : { parent: "window" }),
                },
              ],
            },
          ];
          if (parent !== "none") {
            const layers = comp.precomps[0]!.layers;
            layers.unshift({
              id: "window",
              type: "group",
              size: [64, 48],
              inPoint: voiceStart,
              outPoint: voiceStart + 1,
              ...(parent === "matte" ? { enabled: false } : {}),
            });
            if (parent === "matte")
              layers.push({
                id: "picture",
                type: "solid",
                size: [64, 48],
                color: "#ffffff",
                trackMatte: { layer: "window", mode: "alpha" },
              });
          }
          expect(validateComposition(comp).ok).toBe(true);
          const origin =
            hostStart * (48000 / rootFps) + voiceStart * samplesPerFrame;
          for (const elapsed of [
            -1,
            0,
            1,
            samplesPerFrame - 1,
            samplesPerFrame,
            samplesPerFrame + 1,
          ]) {
            const voices = evaluateCompositionAudio(comp, origin + elapsed);
            if (elapsed < 0 || elapsed >= samplesPerFrame)
              expect(voices).toEqual([]);
            else {
              expect(voices).toHaveLength(1);
              expect(voices[0]!.key).toBe("host/voice");
              expect(voices[0]!.sourceSample === elapsed).toBe(true);
              expect(voices[0]!.clipSample === elapsed).toBe(true);
            }
          }
        }
  },
);

it("retains exact PCM scope endpoints through two natural precomp clocks", () => {
  for (const rootFps of audioRates)
    for (const nestedFps of audioRates)
      for (const voiceFps of audioRates) {
        const count = 48000 / voiceFps;
        const comp = document(rootFps);
        comp.frameCount = rootFps * 3;
        setAudioSampleCount(comp, count);
        comp.layers = [
          { id: "outer", type: "precomp", comp: "middle", startFrame: 7 },
        ];
        comp.precomps = [
          {
            id: "middle",
            width: 64,
            height: 48,
            fps: nestedFps,
            frameCount: 80,
            layers: [
              { id: "inner", type: "precomp", comp: "spoken", startFrame: 17 },
            ],
          },
          {
            id: "spoken",
            width: 64,
            height: 48,
            fps: voiceFps,
            frameCount: 1,
            layers: [
              { id: "voice", type: "audio", asset: "pcm", role: "narration" },
            ],
          },
        ];
        expect(validateComposition(comp).ok).toBe(true);
        const origin = 7 * (48000 / rootFps) + 17 * (48000 / nestedFps);
        for (const elapsed of [-1, 0, 1, count - 1, count, count + 1]) {
          const voices = evaluateCompositionAudio(comp, origin + elapsed);
          if (elapsed < 0 || elapsed >= count) expect(voices).toEqual([]);
          else {
            expect(voices).toHaveLength(1);
            expect(voices[0]!.key).toBe("outer/inner/voice");
            expect(voices[0]!.sourceSample === elapsed).toBe(true);
          }
        }
      }
});

it("preserves fractional authored clocks on either side of audio visibility boundaries", () => {
  const quantum = 1 / 65536;
  for (const boundary of [11, 12])
    for (const offset of [-quantum, 0, quantum, 0.5]) {
      const comp = document();
      setAudioSampleCount(comp, 48000);
      const sourceFrame = boundary + offset * (25 / 48000);
      comp.layers = [
        { id: "host", type: "precomp", comp: "spoken", timeRemap: sourceFrame },
      ];
      comp.precomps = [
        {
          id: "spoken",
          width: 64,
          height: 48,
          fps: 25,
          frameCount: 20,
          layers: [
            {
              id: "voice",
              type: "audio",
              asset: "pcm",
              startFrame: 11,
              inPoint: 11,
              outPoint: 12,
              gainDb: {
                keys: [
                  { frame: 0, value: 0 },
                  { frame: 1, value: 1, interpolation: "linear" },
                ],
              },
            },
          ],
        },
      ];
      comp.expressions = { "host/voice.gainDb": { source: "value" } };
      const voices = evaluateCompositionAudio(comp, 0);
      const inside = boundary === 11 ? offset >= 0 : offset < 0;
      if (!inside) expect(voices).toEqual([]);
      else {
        expect(voices[0]!.sourceSample).toBe((boundary - 11) * 1920 + offset);
        // Source quantization must not rewrite expression/key time.
        expect(voices[0]!.gainDb).toBe(
          Math.max(0, Math.min(1, sourceFrame - 11)),
        );
      }
    }
  const comp = document();
  comp.frameCount = 20;
  setAudioSampleCount(comp, 1920);
  comp.layers = [
    { id: "host", type: "precomp", comp: "spoken", startFrame: 7 },
  ];
  comp.precomps = [
    {
      id: "spoken",
      width: 64,
      height: 48,
      fps: 25,
      frameCount: 13,
      layers: [
        {
          id: "voice",
          type: "audio",
          asset: "pcm",
          startFrame: 11,
          inPoint: 11,
          outPoint: 12,
        },
      ],
    },
  ];
  // Ordinary picture visibility retains its existing unsnapped frame clock.
  expect(
    evaluateComp(comp, 35120 * (24 / 48000)).layers[0]!.precomp!.layers[0]!
      .visible,
  ).toBe(false);
});

it.each(audioRates)(
  "retains half-open root group and precomp windows at %i fps",
  (fps) => {
    const comp = document(fps);
    const count = 48000 / fps;
    comp.frameCount = fps * 2;
    setAudioSampleCount(comp, 48000);
    comp.layers = [
      { id: "window", type: "group", size: [64, 48], inPoint: 7, outPoint: 8 },
      {
        id: "host",
        type: "precomp",
        comp: "spoken",
        startFrame: 7,
        inPoint: 7,
        outPoint: 8,
        parent: "window",
      },
    ];
    comp.precomps = [
      {
        id: "spoken",
        width: 64,
        height: 48,
        fps: 25,
        frameCount: 25,
        layers: [{ id: "sound", type: "audio", asset: "pcm" }],
      },
    ];
    for (const elapsed of [-1, 0, 1, count - 1, count, count + 1]) {
      const sounds = evaluateCompositionAudio(comp, 7 * count + elapsed);
      if (elapsed < 0 || elapsed >= count) expect(sounds).toEqual([]);
      else {
        expect(sounds).toHaveLength(1);
        expect(sounds[0]!.sourceSample === elapsed).toBe(true);
      }
    }
  },
);

it("retains silent far-out authored scope clocks outside the Q16 coordinate bound", () => {
  const comp = document();
  comp.layers = [{ id: "host", type: "precomp", comp: "spoken" }];
  comp.precomps = [
    {
      id: "spoken",
      width: 64,
      height: 48,
      frameCount: 48,
      layers: [{ id: "sound", type: "audio", asset: "pcm" }],
    },
  ];
  comp.expressions = { "host.timeRemap": { source: "1000000000000" } };
  expect(evaluateCompositionAudio(comp, 0)).toEqual([]);
});
