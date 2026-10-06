type Renderer = {
  renderFrame: (frame: number) => unknown;
  readPixels: () => unknown;
};

type Timing = {
  legacyMs: number;
  compositionMs: number;
  ratio: number;
  cycles: number;
  frames: number;
};

const MINIMUM_OBSERVATION_MS = 500;
const MAXIMUM_TIMELINE_CYCLES = 64;

/** Paired complete timelines retain render/readback costs, including runtime pauses. */
export function measurePairedRenderTimings(
  frameCount: number,
  legacy: Renderer,
  composition: Renderer,
  now: () => number = () => performance.now(),
): { ratio: number; timings: Timing[] } {
  if (!Number.isSafeInteger(frameCount) || frameCount <= 0)
    throw new RangeError("Timing frame count must be a positive integer.");

  const measure = (renderer: Renderer, frame: number) => {
    const start = now();
    renderer.renderFrame(frame);
    renderer.readPixels();
    const elapsed = now() - start;
    if (!Number.isFinite(elapsed) || elapsed < 0)
      throw new RangeError(
        "Timing observation requires a monotonic finite clock.",
      );
    return elapsed;
  };

  const timings = Array.from({ length: 3 }, (_, pass): Timing => {
    let legacyMs = 0,
      compositionMs = 0,
      cycles = 0;
    while (
      Math.min(legacyMs, compositionMs) < MINIMUM_OBSERVATION_MS &&
      cycles < MAXIMUM_TIMELINE_CYCLES
    ) {
      for (let frame = 0; frame < frameCount; frame++) {
        if ((frame + cycles + pass) % 2 === 0) {
          legacyMs += measure(legacy, frame);
          compositionMs += measure(composition, frame);
        } else {
          compositionMs += measure(composition, frame);
          legacyMs += measure(legacy, frame);
        }
      }
      cycles++;
    }
    if (Math.min(legacyMs, compositionMs) < MINIMUM_OBSERVATION_MS)
      throw new Error(
        "Timing observation is too short after the bounded cycle budget.",
      );
    return {
      legacyMs,
      compositionMs,
      ratio: compositionMs / legacyMs,
      cycles,
      frames: cycles * frameCount,
    };
  });
  const median = timings
    .map((timing) => timing.ratio)
    .sort((a, b) => a - b)[1]!;
  return { ratio: median, timings };
}
