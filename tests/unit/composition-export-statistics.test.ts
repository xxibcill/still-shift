import { expect, it } from "vitest";
import { CompositionRenderStatistics } from "../../packages/renderer-core/src/composition/render/statistics.ts";
import { summarizeCompositionStatistics } from "../../packages/execution-runtime/src/composition-export-statistics.ts";

it("aggregates exclusive native spans across uneven worker frame assignments", () => {
  const workers = [3, 2].map((frames) => {
    let clock = 0;
    const statistics = new CompositionRenderStatistics(() => clock);
    for (let frame = 0; frame < frames; frame++)
      statistics.measure({ stage: "graph", members: [] }, () => {
        clock += 2;
        statistics.measure(
          { stage: "draw", members: [{ layer: "title", type: "text" }] },
          () => {
            clock += 3;
          },
        );
      });
    return { render: statistics.statistics };
  });
  const result = summarizeCompositionStatistics(workers, 5);
  expect(result.totalSubmissionWallMs).toBe(25);
  expect(result.byLayerType).toEqual([
    {
      phase: "frame",
      type: "graph-overhead",
      calls: 5,
      submissionWallMs: 10,
      submissionWallMsPerOutputFrame: 2,
    },
    {
      phase: "frame",
      type: "text",
      calls: 5,
      submissionWallMs: 15,
      submissionWallMsPerOutputFrame: 3,
    },
  ]);
  expect(result.cacheEnabled).toBe(false);
  expect(result.cacheHits).toBe(0);
  expect(result.scope).toBe("synchronous-submission-wall-time");
});

it("reports cache restores and local reuse without inventing paints as hits", () => {
  const statistics = new CompositionRenderStatistics(() => 0).statistics;
  const result = summarizeCompositionStatistics(
    [
      {
        render: statistics,
        sources: {
          retainedCanvasBytes: 32,
          peakPayloadBytes: 16,
          sources: [
            {
              kind: "glyph",
              paints: 1,
              restores: 3,
              reuses: 7,
              paintAndReadbackMs: 2,
              restoreMs: 1,
              uncachedPaints: 0,
              uncachedPaintMs: 0,
            },
          ],
        },
      },
    ],
    11,
  );
  expect(result.cacheEnabled).toBe(true);
  expect(result.cacheHits).toBe(10);
});
