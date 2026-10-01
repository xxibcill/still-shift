import { performance } from "node:perf_hooks";
import { cpus, platform, arch } from "node:os";
import type { Composition } from "@still-shift/scene-contract";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/index.ts";

const ramp = (a: number, b: number) => ({
  keys: [
    { frame: 0, value: a },
    { frame: 299, value: b, interpolation: "linear" as const },
  ],
});
const comp: Composition = {
  schemaVersion: "composition-1",
  id: "budget",
  width: 1920,
  height: 1080,
  fps: 30,
  frameCount: 300,
  assets: [],
  layers: Array.from({ length: 200 }, (_, i) => ({
    id: `layer${i}`,
    type: "solid",
    size: [100, 60],
    color: "#98c1d9ff",
    ...(i % 16 ? { parent: `layer${i - 1}` } : {}),
    transform: {
      position: { x: ramp(i * 3, i * 3 + 100), y: ramp(i * 2, i * 2 + 30) },
      rotation: ramp(0, 30),
      scale: { x: ramp(1, 1.2), y: ramp(1, 0.9) },
      skewX: ramp(0, 5),
      opacity: 0.8,
    },
  })),
  signals: [
    {
      id: "response",
      keys: [
        { frame: 0, value: 1 },
        { frame: 299, value: 1.1, interpolation: "linear" },
      ],
    },
  ],
  drivers: Array.from({ length: 40 }, (_, i) => ({
    target: `layer${i * 5}.scaleX`,
    signal: "response",
    layer: "response",
  })),
  periodic: Array.from({ length: 40 }, (_, i) => ({
    target: `layer${i * 5}.x`,
    start: 0,
    end: 299,
    noise: { seed: i, period: 30, amplitude: 2 },
  })),
  camera2d: {
    keys: [
      { frame: 0, x: 960, y: 540, zoom: 1 },
      { frame: 299, x: 980, y: 560, zoom: 1.1 },
    ],
  },
};
for (let i = 0; i < 1000; i++) evaluateComp(comp, i % 300);
const frames = 5000,
  batches = 5;
const measurements: number[] = [];
for (let batch = 0; batch < batches; batch++) {
  const start = performance.now();
  for (let i = 0; i < frames; i++) evaluateComp(comp, i % 300);
  measurements.push((performance.now() - start) / frames);
}
const mean = measurements.reduce((sum, value) => sum + value, 0) / batches;
console.log(
  JSON.stringify(
    {
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]!.model,
      node: process.version,
      layers: 200,
      framesPerBatch: frames,
      batches,
      meanMsPerFrame: mean,
      batchMsPerFrame: measurements,
      budgetMs: 2,
      passed: mean <= 2,
    },
    null,
    2,
  ),
);
if (mean > 2) process.exitCode = 1;
