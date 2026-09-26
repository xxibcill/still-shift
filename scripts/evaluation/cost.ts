import type { AnimationResult } from "@still-shift/scene-contract";

type RenderTiming = Pick<
  AnimationResult["metrics"],
  "totalWallMs" | "cacheStatus" | "archivedPreparationMs"
>;

export const selectedRenderWallMs = (
  results: readonly { metrics: RenderTiming }[],
  concurrency: number,
): number =>
  results.reduce(
    (sum, result) =>
      sum +
      result.metrics.totalWallMs -
      (result.metrics.cacheStatus === "miss"
        ? (result.metrics.archivedPreparationMs ?? 0)
        : 0),
    0,
  ) / concurrency;
