import type { Composition } from "@still-shift/scene-contract";
import { createCompositionPreview } from "../../packages/renderer-core/src/composition/render/renderer.ts";

/** RAF-paced calls without readback; intervals include queuing and are not GPU timers. */
export async function measureExposurePreview() {
  const results = [];
  for (const backend of ["canvas2d", "webgl2"] as const)
    for (const samples of [1, 2, 4, 8, 16, 32, 64]) {
      const comp: Composition = {
        schemaVersion: "composition-1",
        id: "exposure-cost",
        width: 1920,
        height: 1080,
        fps: 30,
        frameCount: 60,
        background: "#26313b",
        assets: [],
        motionBlur: {
          enabled: samples > 1,
          shutterAngle: 360,
          shutterPhase: 0,
          samples: Math.max(2, samples),
        },
        layers: [
          {
            id: "moving",
            type: "solid",
            size: [400, 300],
            color: "#d87047",
            motionBlur: true,
            transform: {
              anchor: [0, 0],
              position: {
                x: {
                  keys: [
                    { frame: 0, value: 100 },
                    { frame: 59, value: 1400, interpolation: "linear" },
                  ],
                },
                y: 300,
              },
              opacity: 0.6,
            },
          },
        ],
      };
      const canvas = document.createElement("canvas");
      const start = performance.now();
      const preview = createCompositionPreview(
        canvas,
        comp,
        { images: new Map(), fonts: new Map() },
        { backend },
      );
      const coldInitializationMs = performance.now() - start;
      let coldCallMs = 0,
        coldNextRafIntervalMs = 0;
      const calls: number[] = [],
        intervals: number[] = [];
      let previous: number | undefined;
      try {
        for (let frame = 20; frame < 35; frame++) {
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
          const now = performance.now();
          if (frame === 21 && previous !== undefined)
            coldNextRafIntervalMs = now - previous;
          if (frame >= 24 && previous !== undefined)
            intervals.push(now - previous);
          previous = now;
          preview.renderFrame(frame);
          const callMs = performance.now() - now;
          if (frame === 20) coldCallMs = callMs;
          if (frame >= 24) calls.push(callMs);
        }
        // Complete pending work after the preview window; excluded from call/RAF budgets.
        const drain = performance.now();
        preview.readPixels();
        const median = (values: number[]) =>
          [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
        results.push({
          backend,
          samples,
          width: comp.width,
          height: comp.height,
          coldInitializationMs,
          coldCallMs,
          coldNextRafIntervalMs,
          warmFrames: 4,
          measuredFrames: 11,
          callMs: calls,
          rafIntervalMs: intervals,
          medianCallMs: median(calls),
          medianRafIntervalMs: median(intervals),
          finalDrainReadMs: performance.now() - drain,
          elapsedMs: performance.now() - start,
          method:
            "RAF-paced preview without per-frame readback; no GPU-completion guarantee",
        });
      } finally {
        preview.dispose();
        canvas.width = canvas.height = 0;
      }
    }
  return results;
}
