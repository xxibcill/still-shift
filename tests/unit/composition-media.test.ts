import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CompositionSchema,
  validateComposition,
  type Composition,
  type CompositionAsset,
  type CompositionLayer,
} from "@still-shift/scene-contract";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
import { buildRenderGraph } from "../../packages/renderer-core/src/composition/render/graph.ts";
import {
  comp,
  video as videoLayer,
  sequence as sequenceLayer,
  audio as audioLayer,
} from "@still-shift/motion";

const fixture = (): Composition =>
  CompositionSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          "../../benchmarks/fixtures/composition/ce13/contract.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
const video = (doc: Composition) =>
  doc.assets[0] as Extract<CompositionAsset, { type: "video" }>;
const clip = (doc: Composition) =>
  doc.layers[0] as Extract<CompositionLayer, { type: "video" }>;
const voice = (doc: Composition) =>
  doc.layers[2] as Extract<CompositionLayer, { type: "audio" }>;
const pair = (doc: Composition, frame: number) =>
  evaluateComp(doc, frame).layers[0]!.media!.pair;
const codes = (doc: Composition) =>
  validateComposition(doc).diagnostics.map((d) => d.code);

describe("native media source authority", () => {
  it("registers typed source descriptors and resolves deferred builder anchors", () => {
    const source = fixture();
    const built = comp({ width: 160, height: 80, fps: 30, frames: 60 }, (c) => {
      c.asset(video(source));
      c.add(videoLayer("placed", "video").anchor("center"));
      c.add(
        sequenceLayer(
          "sequence",
          source.assets[1] as Extract<CompositionAsset, { type: "sequence" }>,
        ).anchor("bottom"),
      );
      c.add(
        audioLayer(
          "sound",
          source.assets[2] as Extract<CompositionAsset, { type: "audio" }>,
        ),
      );
    });
    expect(built.assets).toHaveLength(3);
    expect(built.layers[0]!.transform!.anchor).toEqual([80, 40]);
    expect(built.layers[1]!.transform!.anchor).toEqual([80, 80]);
    expect(validateComposition(built).ok).toBe(true);
  });
  it("selects original rational source indices at exact boundaries without changing scope time", () => {
    const doc = fixture();
    video(doc).frameRate = { numerator: 30000, denominator: 1001 };
    video(doc).frameCount = 1200;
    clip(doc).sourceInFrame = 0;
    clip(doc).sourceOutFrame = 1200;
    delete clip(doc).timeRemap;
    expect(pair(doc, 1001)).toEqual({ first: 1000, second: 1001, mix: 0 });
    expect(evaluateComp(doc, 1001).time).toBe(1001);
    expect(pair(doc, 1)!.mix).toBeCloseTo(1000 / 1001, 9);
  });
  it("applies natural trim, stretch, reverse and hold before bounded source pairing", () => {
    const doc = fixture();
    const layer = clip(doc);
    delete layer.timeRemap;
    layer.sourceInFrame = 12;
    layer.sourceOutFrame = 36;
    layer.startFrame = 10;
    layer.stretch = 2;
    expect(pair(doc, 25)).toEqual({ first: 18, second: 19, mix: 0 });
    layer.stretch = -1;
    expect(pair(doc, 25)).toEqual({ first: 12, second: 13, mix: 0 });
    layer.holdFrame = 15;
    expect(pair(doc, 25)).toEqual({ first: 24, second: 25, mix: 0 });
    expect(pair(doc, 999)).toEqual(pair(doc, 25));
  });
  it("derives selected frames after drivers and expression precedence", () => {
    const doc = fixture();
    doc.layers.push({
      id: "control",
      type: "null",
      transform: { position: [1, 0] },
    });
    doc.drivers = [
      { target: "clip.timeRemap", source: "control.transform.position.x" },
    ];
    doc.expressions = { "clip.timeRemap": { source: "value + 0.125" } };
    expect(pair(doc, 0)).toEqual({ first: 27, second: 28, mix: 0 });
    expect(evaluateComp(doc, 0).layers[0]!.timeRemap).toBe(1.125);
  });
  it("uses natural asset size/contain bounds and excludes audio from picture geometry", () => {
    const doc = fixture();
    delete clip(doc).size;
    const tree = evaluateComp(doc, 0);
    expect(tree.layers[0]!.transform.anchor).toEqual([80, 40]);
    expect(tree.layers[2]!.drawable).toBe(false);
    expect(tree.layers[2]!.bounds).toBeNull();
    const resized = fixture();
    clip(resized).size = [80, 80];
    clip(resized).fit = "contain";
    const bounds = evaluateComp(resized, 0).layers[0]!.bounds!;
    expect(bounds.right - bounds.left).toBe(80);
    expect(bounds.bottom - bounds.top).toBe(40);
  });
  it("keeps identical held frame graphs stable and includes source hash/pair provenance", () => {
    const doc = fixture();
    delete clip(doc).timeRemap;
    clip(doc).frameBlending = "hold";
    const a = buildRenderGraph(doc, evaluateComp(doc, 0));
    const b = buildRenderGraph(doc, evaluateComp(doc, 0.1));
    expect(a.root).toEqual(b.root);
    expect(JSON.stringify(a.root)).toContain(video(doc).sha256);
    expect(JSON.stringify(a.root)).toContain("__media:video:2");
  });
  it("samples audio controls through expressions and clamps driven gain/pan", () => {
    const doc = fixture();
    doc.expressions = {
      "sound.gainDb": { source: "100" },
      "sound.pan": { source: "-2" },
      "sound.timeRemap": { source: "0.25" },
    };
    const state = evaluateComp(doc, 0).layers[2]!;
    expect(state.gainDb).toBe(12);
    expect(state.pan).toBe(-1);
    expect(state.media!.sourceSample).toBe(12000);
  });
  it.each([24, 25, 30, 50, 60] as const)(
    "preserves exact source sample boundaries at %i fps",
    (fps) => {
      const doc = fixture();
      doc.fps = fps;
      delete voice(doc).timeRemap;
      voice(doc).sourceStartSample = 123;
      for (const sample of [0, 1, 999, 47876])
        expect(
          evaluateComp(doc, (sample / 48000) * fps).layers[2]!.media!
            .sourceSample,
        ).toBe(sample + 123);
    },
  );
  it("rejects invalid metadata, rate, trims and configured source budgets", () => {
    const rate = fixture();
    video(rate).frameRate = { numerator: 48, denominator: 2 };
    expect(codes(rate)).toContain("comp-media-rate");
    const trim = fixture();
    clip(trim).sourceOutFrame = 49;
    expect(codes(trim)).toContain("comp-media-trim");
    const limit = fixture();
    limit.mediaLimits = { maxDurationSeconds: 1 };
    expect(codes(limit)).toContain("comp-media-limit");
    const color = fixture();
    video(color).color = {
      primaries: "bt709",
      transfer: "bt709",
      matrix: "gbr",
      range: "tv",
    };
    expect(codes(color)).toContain("comp-media-color");
    const sequence = fixture();
    (
      sequence.assets[1] as Extract<CompositionAsset, { type: "sequence" }>
    ).path = "frame_%04d_%02d.png";
    expect(codes(sequence)).toContain("comp-media-sequence");
  });
  it("protects complete narration even when disabled, before any caller chooses a crop", () => {
    const doc = fixture();
    voice(doc).role = "narration";
    delete voice(doc).timeRemap;
    voice(doc).sourceStartSample = 0;
    voice(doc).sourceEndSample = 48000;
    voice(doc).outPoint = 30;
    voice(doc).enabled = false;
    expect(validateComposition(doc).ok).toBe(true);
    voice(doc).stretch = 2;
    expect(codes(doc)).toContain("comp-media-narration-clock");
    voice(doc).stretch = 1;
    voice(doc).outPoint = 29;
    expect(codes(doc)).toContain("comp-media-narration-range");
  });
  it("rejects inherited clocks and visibility cropping on nested narration instances", () => {
    const doc = fixture();
    const narration = structuredClone(voice(doc));
    narration.role = "narration";
    delete narration.timeRemap;
    narration.sourceStartSample = 0;
    narration.sourceEndSample = 48000;
    doc.layers = [
      { id: "host", type: "precomp", comp: "spoken", startFrame: 15 },
    ];
    doc.precomps = [
      {
        id: "spoken",
        width: 160,
        height: 80,
        frameCount: 24,
        fps: 24,
        layers: [narration],
      },
    ];
    delete narration.outPoint;
    expect(validateComposition(doc).ok).toBe(true);
    doc.layers[0]!.holdFrame = 0;
    expect(codes(doc)).toContain("comp-media-narration-clock");
    delete doc.layers[0]!.holdFrame;
    doc.layers[0]!.outPoint = 44;
    expect(codes(doc)).toContain("comp-media-narration-range");
    delete doc.layers[0]!.outPoint;
    doc.expressions = { "host.timeRemap": { source: "value" } };
    expect(codes(doc)).toContain("comp-media-narration-clock");
  });
});
