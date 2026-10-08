export type CompositionFrameDistribution = "round-robin" | "contiguous";

/** End-exclusive ownership shared by browser producers and the ordered Node receiver. */
export function compositionFrameAssignment(
  frameCount: number,
  workers: number,
  worker: number,
  distribution: CompositionFrameDistribution = "round-robin",
) {
  if (
    !Number.isSafeInteger(frameCount) ||
    frameCount < 1 ||
    !Number.isInteger(workers) ||
    workers < 1 ||
    workers > 4 ||
    workers > frameCount ||
    !Number.isInteger(worker) ||
    worker < 0 ||
    worker >= workers ||
    (distribution !== "round-robin" && distribution !== "contiguous")
  )
    throw Error("Composition frame assignment is invalid");
  return distribution === "contiguous"
    ? {
        start: Math.floor((worker * frameCount) / workers),
        end: Math.floor(((worker + 1) * frameCount) / workers),
        step: 1,
      }
    : { start: worker, end: frameCount, step: workers };
}
