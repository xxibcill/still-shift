import { describe, expect, it } from "vitest";
import {
  CompositionSchema,
  VideoLayerSchema,
  SequenceLayerSchema,
  AudioLayerSchema,
  validateComposition,
  type Composition,
  type CompositionLayer,
} from "@still-shift/scene-contract";
import {
  evaluateComp,
  evaluateProperty,
} from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import { sourceFramePair } from "../../packages/renderer-core/src/composition/evaluate/time-controls.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";

const keyed = (from: number, to: number) => ({
  keys: [
    { frame: -20, value: from },
    { frame: 60, value: to, interpolation: "linear" as const },
  ],
});
const solid = (): Extract<CompositionLayer, { type: "solid" }> => ({
  id: "box",
  type: "solid",
  size: [10, 10],
  color: "#ffffff",
  transform: { anchor: [0, 0], position: { x: keyed(-20, 60), y: 0 } },
});
const fixture = (): Composition => ({
  schemaVersion: "composition-1",
  id: "clock",
  width: 160,
  height: 100,
  fps: 30,
  frameCount: 60,
  assets: [],
  layers: [solid()],
});
const childFixture = (): Composition => ({
  ...fixture(),
  layers: [{ id: "host", type: "precomp", comp: "source" }],
  precomps: [
    {
      id: "source",
      width: 160,
      height: 100,
      frameCount: 10,
      layers: [solid()],
    },
  ],
});
const host = (doc: Composition) =>
  doc.layers[0] as Extract<CompositionLayer, { type: "precomp" }>;
const childTime = (doc: Composition, t: number) =>
  evaluateComp(doc, t).layers[0]!.precomp!.time;

describe("native content clocks", () => {
  it("retains ordinary start/stretch arithmetic including reversed source time", () => {
    const doc = fixture();
    doc.layers[0]!.startFrame = 5;
    doc.layers[0]!.stretch = 2;
    expect(evaluateProperty(doc, "box.transform.position.x", 9)).toBeCloseTo(2);
    const reverse = structuredClone(doc);
    reverse.layers[0]!.stretch = -2;
    expect(
      evaluateProperty(reverse, "box.transform.position.x", 9),
    ).toBeCloseTo(-2);
  });
  it("posterizes local seconds and floors negative clocks without moving visibility gates", () => {
    for (const fps of [24, 25, 30, 50, 60] as const) {
      const doc = fixture();
      doc.fps = fps;
      doc.layers[0]!.posterizeFps = 12;
      for (const frame of [-1, 0, 7.1, 7.2, 59])
        expect(evaluateComp(doc, frame).layers[0]!.time).toBeCloseTo(
          (Math.floor((frame * 12) / fps) * fps) / 12,
        );
    }
    const doc = fixture();
    doc.layers[0]!.posterizeFps = 12;
    doc.layers[0]!.inPoint = 7;
    expect(evaluateComp(doc, 6.9).layers[0]!.visible).toBe(false);
    expect(evaluateComp(doc, 7).layers[0]!.visible).toBe(true);
  });
  it("holds fractional local keys while a current-clock parent continues moving", () => {
    const doc = fixture();
    doc.layers[0]!.holdFrame = 7.5;
    doc.layers[0]!.posterizeFps = 12;
    doc.layers[0]!.parent = "parent";
    doc.layers.push({
      id: "parent",
      type: "null",
      transform: { position: { x: keyed(-20, 60), y: 0 } },
    });
    for (const t of [0, 10, 59, 5, 10]) {
      const state = evaluateComp(doc, t).layers[0]!;
      expect(state.time).toBe(7.5);
      expect(state.transform.position[0]).toBeCloseTo(7.5);
      expect(state.worldMatrix[4]).toBeCloseTo(t + 7.5);
    }
  });
  it("preserves explicitly root-bound expressions while value reads the stepped keyed input", () => {
    const doc = fixture();
    doc.layers[0]!.posterizeFps = 12;
    doc.expressions = {
      "box.transform.position.x": { source: "value + frame" },
    };
    expect(evaluateProperty(doc, "box.transform.position.x", 7.1)).toBeCloseTo(
      12.1,
    );
    expect(evaluateProperty(doc, "box.transform.position.x", 7.2)).toBeCloseTo(
      12.2,
    );
  });
  it("selects baked indices while retaining the authored sample time", () => {
    const doc = fixture();
    doc.layers[0]!.sampleTimes = [0, 2, 4, 6];
    doc.layers[0]!.posterizeFps = 12;
    const state = evaluateComp(doc, 7.2).layers[0]!;
    expect(state.sampleIndex).toBe(2);
    expect(state.time).toBe(4);
    expect(state.transform.position[0]).toBeCloseTo(2);
  });
  it("applies child FPS conversion before source loops and separates repeated instances", () => {
    const doc = childFixture();
    doc.precomps![0]!.fps = 60;
    host(doc).loop = "cycle";
    doc.layers.push({ ...host(doc), id: "slow", stretch: 2 });
    const states = evaluateComp(doc, 7).layers;
    expect(states[0]!.precomp!.time).toBe(4);
    expect(states[1]!.precomp!.time).toBe(7);
    expect(evaluateComp(doc, 7)).toEqual(evaluateComp(doc, 7));
  });
  it("supports signed unlimited cycle/pingpong and finite terminal holds", () => {
    for (const loop of ["cycle", "pingpong"] as const) {
      const doc = childFixture();
      host(doc).loop = loop;
      host(doc).timeRemap = -1;
      expect(childTime(doc, 0)).toBe(loop === "cycle" ? 9 : 1);
      if (loop === "cycle") {
        host(doc).timeRemap = -Number.EPSILON;
        expect(childTime(doc, 0)).toBe(9);
        host(doc).timeRemap = 0.1;
        expect(childTime(doc, 0)).toBe(0.1);
      }
      delete host(doc).timeRemap;
      const period = loop === "cycle" ? 10 : 18;
      expect(childTime(doc, period)).toBe(0);
      const finite = structuredClone(doc);
      host(finite).loopCount = 2;
      host(finite).timeRemap = -1;
      expect(childTime(finite, 0)).toBe(0);
      delete host(finite).timeRemap;
      expect(childTime(finite, 2 * period)).toBe(loop === "cycle" ? 9 : 0);
    }
  });
  it("loops the final expression remap, and singleton sources stay constant", () => {
    const doc = childFixture();
    host(doc).loop = "cycle";
    doc.expressions = { "host.timeRemap": { source: "frame * 2.5" } };
    expect(childTime(doc, 7)).toBe(7.5);
    expect(evaluateProperty(doc, "host.timeRemap", 7)).toBe(17.5);
    const one = structuredClone(doc);
    one.precomps![0]!.frameCount = 1;
    expect(childTime(one, 7)).toBe(0);
  });
  it("freezes a source using one native hold remap key", () => {
    const doc = childFixture();
    host(doc).timeRemap = {
      keys: [{ frame: 0, value: 4, interpolation: "hold" }],
    };
    expect(validateComposition(doc).ok).toBe(true);
    for (const t of [0, 20, 59, 5, 20]) expect(childTime(doc, t)).toBe(4);
  });
  it("rejects enormous modulo clocks at the root frame while ordinary source clamps remain valid", () => {
    const doc = childFixture();
    host(doc).loop = "cycle";
    doc.expressions = { "host.timeRemap": { source: "frame * 1000000000000" } };
    try {
      evaluateComp(doc, 7);
      throw new Error("Expected failure");
    } catch (error) {
      expect(passageDiagnostics(error)[0]).toMatchObject({
        code: "comp-evaluation-time",
        node: "host",
        path: "host.loop",
        frame: 7,
      });
    }
    const clamped = structuredClone(doc);
    delete host(clamped).loop;
    expect(childTime(clamped, 7)).toBe(9);
    const finite = structuredClone(doc);
    host(finite).loopCount = 2;
    expect(childTime(finite, 7)).toBe(9);
  });
  it("holds a precomp local clock before converting its source FPS", () => {
    const doc = childFixture();
    doc.precomps![0]!.fps = 60;
    host(doc).holdFrame = 3.5;
    for (const t of [0, 20, 59, 5]) expect(childTime(doc, t)).toBe(7);
    host(doc).posterizeFps = 12;
    expect(childTime(doc, 20)).toBe(7);
  });
  it("validates time bounds and rejects a count without a loop", () => {
    for (const fields of [
      { posterizeFps: 0 },
      { posterizeFps: 241 },
      { holdFrame: 216001 },
      { holdFrame: NaN },
    ])
      expect(
        CompositionSchema.safeParse({
          ...fixture(),
          layers: [{ ...solid(), ...fields }],
        }).success,
      ).toBe(false);
    const doc = childFixture();
    host(doc).loopCount = 2;
    const result = validateComposition(doc);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "comp-time-control")).toBe(
      true,
    );
  });
});

describe("CE13 frame-blending handoff", () => {
  it("declares visual media blending while native decoding remains explicitly unavailable", () => {
    for (const schema of [VideoLayerSchema, SequenceLayerSchema])
      expect(
        schema.safeParse({
          id: "media",
          type: schema === VideoLayerSchema ? "video" : "sequence",
          asset: "asset",
          frameBlending: "linear",
        }).success,
      ).toBe(true);
    expect(
      AudioLayerSchema.safeParse({
        id: "audio",
        type: "audio",
        asset: "asset",
        frameBlending: "linear",
      }).success,
    ).toBe(false);
    const doc = fixture();
    doc.layers = [
      { id: "video", type: "video", asset: "missing", frameBlending: "linear" },
    ];
    expect(
      validateComposition(doc).diagnostics.some(
        (d) =>
          d.code === "comp-feature-unavailable" && d.message.includes("CE13"),
      ),
    ).toBe(true);
  });
  it("returns bounded hold or linear source indices and clamps outside source range", () => {
    expect(sourceFramePair(2.75, 10)).toEqual({ first: 2, second: 2, mix: 0 });
    expect(sourceFramePair(2.75, 10, "linear")).toEqual({
      first: 2,
      second: 3,
      mix: 0.75,
    });
    expect(sourceFramePair(-1, 10, "linear")).toEqual({
      first: 0,
      second: 1,
      mix: 0,
    });
    expect(sourceFramePair(10, 10, "linear")).toEqual({
      first: 9,
      second: 9,
      mix: 0,
    });
    expect(sourceFramePair(10, 1, "linear")).toEqual({
      first: 0,
      second: 0,
      mix: 0,
    });
  });
  it("rejects invalid public sampling inputs with stable diagnostics", () => {
    for (const [time, count] of [
      [NaN, 10],
      [Infinity, 10],
      [0, 0],
      [0, 1.5],
    ]) {
      try {
        sourceFramePair(time!, count!);
        throw new Error("Expected failure");
      } catch (error) {
        expect(passageDiagnostics(error)[0]!.code).toBe("comp-media-time");
      }
    }
  });
});
