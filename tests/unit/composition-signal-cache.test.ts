import { describe, expect, it, vi } from "vitest";
import type { Composition } from "@still-shift/scene-contract";
import {
  evaluateComp,
  evaluateProperty,
} from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import * as curves from "../../packages/renderer-core/src/curve.ts";
import { sampleSignal } from "../../packages/renderer-core/src/motion-sampling.ts";

const composition = (): Composition => ({
  schemaVersion: "composition-1",
  id: "signals",
  width: 200,
  height: 100,
  fps: 30,
  frameCount: 60,
  assets: [],
  layers: [
    { id: "first", type: "null" },
    { id: "second", type: "null" },
  ],
  signals: [
    {
      id: "wave",
      keys: [
        { frame: 0, value: 0 },
        { frame: 20, value: 20, smooth: true },
        { frame: 40, value: 40 },
      ],
    },
  ],
  drivers: [
    { target: "first.x", sum: ["wave", "wave"], map: { delay: 2 } },
    { target: "second.x", signal: "wave", map: { delay: 2 } },
  ],
});

describe("composition signal caching", () => {
  it("shares a signal sample per source time and reuses immutable curves across seeks", () => {
    const doc = composition();
    const sample = vi.spyOn(curves, "sampleCurve");
    const tangents = vi.spyOn(curves, "monotoneTangents");
    try {
      expect(
        evaluateComp(doc, 22).layers.map(
          (layer) => layer.transform.position[0],
        ),
      ).toEqual([40, 20]);
      expect(sample).toHaveBeenCalledTimes(1);
      evaluateComp(doc, 23);
      evaluateComp(doc, 22);
      expect(sample).toHaveBeenCalledTimes(3);
      expect(tangents).toHaveBeenCalledTimes(1);
      const compiled = sample.mock.calls[0]!;
      for (const call of sample.mock.calls) {
        expect(call[0]).toBe(compiled[0]);
        expect(call[3]).toBe(compiled[3]);
      }
      const edited = structuredClone(doc);
      for (const key of edited.signals![0]!.keys) key.value *= 2;
      expect(
        evaluateComp(edited, 22).layers.map(
          (layer) => layer.transform.position[0],
        ),
      ).toEqual([80, 40]);
      expect(tangents).toHaveBeenCalledTimes(2);
      expect(sample.mock.calls[3]![0]).not.toBe(compiled[0]);
    } finally {
      sample.mockRestore();
      tangents.mockRestore();
    }
  });

  it("shares fractional lag samples across root and historical dependency evaluations", () => {
    const doc = composition();
    doc.layers.push({ id: "source", type: "null" });
    doc.signals![0]!.keys = [
      { frame: 0, value: 0 },
      { frame: 20, value: 20, interpolation: "linear" },
    ];
    doc.drivers = [
      { target: "first.x", signal: "wave", map: { lag: 2 } },
      { target: "second.x", source: "source.x", map: { lag: 2 } },
      { target: "source.x", signal: "wave" },
    ];
    const sample = vi.spyOn(curves, "sampleCurve");
    try {
      const result = evaluateComp(doc, 2.5);
      const expected = 2.5 - 2 + 4.5 * Math.exp(-2.5);
      expect(result.layers[0]!.transform.position[0]).toBeCloseTo(expected, 9);
      expect(result.layers[1]!.transform.position[0]).toBeCloseTo(expected, 9);
      expect(result.layers[2]!.transform.position[0]).toBe(2.5);
      expect(
        sample.mock.calls.map((call) => call[1]).sort((a, b) => a - b),
      ).toEqual([0, 1, 2, 2.5]);
    } finally {
      sample.mockRestore();
    }
  });

  it("preserves legacy signal interpolation, pulses, oscillators and seeded noise", () => {
    const doc = composition();
    const signal = doc.signals![0]!;
    signal.add = [
      { pulse: { at: 10, half: 3, depth: 2 } },
      { oscillate: { period: 12, amplitude: 2 } },
      { noise: { seed: 37, period: 5, amplitude: 3 } },
    ];
    doc.drivers = [{ target: "first.x", signal: "wave" }];
    for (const time of [21.75, -1, 9.5, 0, 10, 20, 39.9])
      expect(evaluateProperty(doc, "first.x", time)).toBe(
        sampleSignal(signal, time, doc.fps),
      );
  });
  it("keeps long lag histories exact when bounded sample caches evict old times", () => {
    const doc = composition();
    doc.frameCount = 600;
    doc.layers.push({ id: "source", type: "null" });
    doc.signals![0]!.keys = [
      { frame: 0, value: 0 },
      { frame: 400, value: 400, interpolation: "linear" },
    ];
    doc.drivers = [
      { target: "first.x", signal: "wave", map: { lag: 2 } },
      { target: "second.x", source: "source.x", map: { lag: 2 } },
      { target: "source.x", signal: "wave" },
    ];
    for (const time of [200.5, 0, 200.5]) {
      const result = evaluateComp(doc, time);
      const expected = time - 2 + (2 + time) * Math.exp(-time);
      expect(result.layers[0]!.transform.position[0]).toBeCloseTo(expected, 9);
      expect(result.layers[1]!.transform.position[0]).toBeCloseTo(expected, 9);
    }
  });
});
