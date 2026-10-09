import type { CompositionPreview } from "@still-shift/renderer-core";

type Snapshot<K extends keyof CompositionPreview> = ReturnType<
  Extract<NonNullable<CompositionPreview[K]>, (...args: never[]) => unknown>
>;

export type CompositionWorkerStatistics = {
  render: Snapshot<"renderStatistics">;
  sources?: Snapshot<"sourceCacheStatistics">;
  roots?: Snapshot<"rootCacheStatistics">;
  surfaces?: Snapshot<"surfaceCacheStatistics">;
};

/** Sum exclusive submission spans across workers; never label these GPU execution time. */
export function summarizeCompositionStatistics(
  workers: readonly CompositionWorkerStatistics[],
  frameCount: number,
) {
  if (!workers.length || !Number.isSafeInteger(frameCount) || frameCount < 1)
    throw Error(
      "Composition statistics require workers and a positive frame count",
    );
  const types = new Map<
    string,
    {
      phase: string;
      type: string;
      calls: number;
      submissionWallMs: number;
    }
  >();
  let cacheHits = 0;
  for (const worker of workers) {
    if (worker.render.scope !== "synchronous-submission-wall-time")
      throw Error("Composition worker omitted actual submission statistics");
    for (const row of worker.render.byLayerType) {
      const key = JSON.stringify([row.phase, row.type]);
      const total = types.get(key) ?? {
        phase: row.phase,
        type: row.type,
        calls: 0,
        submissionWallMs: 0,
      };
      total.calls += row.calls;
      total.submissionWallMs += row.submissionWallMs;
      types.set(key, total);
    }
    cacheHits +=
      worker.sources?.sources.reduce(
        (sum, row) => sum + row.restores + row.reuses,
        0,
      ) ?? 0;
    cacheHits +=
      worker.roots?.roots.reduce((sum, row) => sum + row.copies, 0) ?? 0;
    cacheHits +=
      (worker.surfaces?.surfaceRestores ?? 0) +
      (worker.surfaces?.surfaceReuses ?? 0);
  }
  return {
    version: "composition-export-statistics-1" as const,
    scope: "synchronous-submission-wall-time" as const,
    frameCount,
    totalSubmissionWallMs: [...types.values()].reduce(
      (sum, row) => sum + row.submissionWallMs,
      0,
    ),
    byLayerType: [...types.values()].map((row) => ({
      ...row,
      submissionWallMsPerOutputFrame: row.submissionWallMs / frameCount,
    })),
    cacheEnabled: workers.some(
      (worker) => worker.sources || worker.roots || worker.surfaces,
    ),
    cacheHits,
    cacheHitScope:
      "source-restores-and-reuses/root-copies/surface-restores-and-reuses" as const,
    workers,
  };
}
