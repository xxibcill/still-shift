import { expect, it } from "vitest";
import { parseBlenderCaptureJob } from "../../packages/animation-engine/src/mechanism/blender-capture-contract.ts";
const job = () => ({
  schemaVersion: "blender-native-capture-job-1",
  id: "zipper",
  assetPath: "asset.blend",
  assetSha256: "sha256:" + "a".repeat(64),
  collection: "asset.EU-004",
  camera: "camera.main",
  outputDirectory: "output",
  width: 320,
  height: 568,
  fps: 30,
  controller: {
    object: "controls",
    properties: { "slider.travel": { min: 0.34, max: 3.65 } },
  },
  frames: [
    { sourceFrame: 0, controls: { "slider.travel": 0.34 } },
    { sourceFrame: 0, controls: { "slider.travel": 3.65 } },
    { sourceFrame: 0, controls: { "slider.travel": 0.34 } },
  ],
});
it("admits absolute complete controls and backwards/repeated states without mutating input", () => {
  const input = job();
  const before = JSON.stringify(input);
  expect(parseBlenderCaptureJob(input).frames).toHaveLength(3);
  expect(JSON.stringify(input)).toBe(before);
});
it("rejects undeclared, out-of-range, incomplete and reversed control contracts", () => {
  for (const change of [
    (j: ReturnType<typeof job>) => {
      j.frames[1]!.controls["slider.travel"] = 4;
    },
    (j: ReturnType<typeof job>) => {
      j.controller.properties["slider.travel"].min = 5;
    },
    (j: ReturnType<typeof job>) => {
      j.frames[1]!.controls = {} as (typeof j.frames)[number]["controls"];
    },
    (j: ReturnType<typeof job>) => {
      Object.assign(j.frames[1]!.controls, { extra: 1 });
    },
  ]) {
    const j = job();
    change(j);
    expect(() => parseBlenderCaptureJob(j)).toThrow();
  }
});
it("rejects inherited names as undeclared controls", () => {
  const input = job();
  input.frames[1]!.controls = {
    constructor: 1,
  } as unknown as (typeof input.frames)[number]["controls"];
  expect(() => parseBlenderCaptureJob(input)).toThrow();
});
it("rejects active and oversized data before source execution", () => {
  let calls = 0;
  const j = job();
  Object.defineProperty(j, "id", {
    enumerable: true,
    get() {
      calls++;
      return "unsafe";
    },
  });
  expect(() => parseBlenderCaptureJob(j)).toThrow();
  expect(calls).toBe(0);
  expect(() =>
    parseBlenderCaptureJob({ ...job(), extra: "x".repeat(1024 * 1024) }),
  ).toThrow();
});
it("rejects unknown job instructions, duplicate hides and pixel budget violations", () => {
  expect(() =>
    parseBlenderCaptureJob({ ...job(), python: "arbitrary()" }),
  ).toThrow();
  const j = { ...job(), width: 4096, height: 4096 };
  expect(() => parseBlenderCaptureJob(j)).toThrow();
  expect(() =>
    parseBlenderCaptureJob({
      ...job(),
      frames: [{ ...job().frames[0], hiddenParts: ["part", "part"] }],
    }),
  ).toThrow();
});

it("bounds native framing and requires disjoint visibility overrides", () => {
  const input = job();
  Object.assign(input.frames[0]!, {
    framing: { orthoScale: 2.5, shiftX: -0.2 },
    shownParts: ["section"],
  });
  expect(parseBlenderCaptureJob(input).frames[0]).toMatchObject({
    framing: { orthoScale: 2.5, shiftX: -0.2 },
    shownParts: ["section"],
  });
  for (const framing of [
    {},
    { orthoScale: 0 },
    { orthoScale: 10001 },
    { shiftX: 11 },
    { lensMillimeters: Infinity },
    { orthoScale: 3, lensMillimeters: 50 },
    { arbitrary: 1 },
  ]) {
    expect(() =>
      parseBlenderCaptureJob({
        ...job(),
        frames: [{ ...job().frames[0], framing }],
      }),
    ).toThrow();
  }
  for (const overrides of [
    { hiddenParts: ["a"], shownParts: ["a"] },
    { shownParts: ["a", "a"] },
    {
      hiddenParts: Array.from({ length: 128 }, (_, i) => "hidden" + i),
      shownParts: ["shown"],
    },
  ])
    expect(() =>
      parseBlenderCaptureJob({
        ...job(),
        frames: [{ ...job().frames[0], ...overrides }],
      }),
    ).toThrow();
});
