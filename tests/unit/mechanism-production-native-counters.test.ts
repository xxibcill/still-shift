import { describe, expect, it } from "vitest";
import { measureMechanismNativeSubmissionCalls } from "../../packages/animation-engine/src/mechanism/cue-plate-lifecycle.ts";
function fixture() {
  const rows = [
    { phase: "frame", type: "graph-overhead", calls: 2, submissionWallMs: 1 },
    { phase: "frame", type: "native-depth", calls: 2, submissionWallMs: 2 },
  ];
  return {
    frameCount: 2,
    metrics: {
      nativeObservations: { originalCapture: true },
      compositionStatistics: {
        version: "composition-export-statistics-1",
        scope: "synchronous-submission-wall-time",
        frameCount: 2,
        cacheEnabled: false,
        cacheHits: 0,
        totalSubmissionWallMs: 3,
        byLayerType: structuredClone(rows),
        workers: [
          {
            worker: 0,
            render: {
              version: "composition-submission-statistics-1",
              scope: "synchronous-submission-wall-time",
              byLayerType: rows,
            },
          },
        ],
      },
    },
  };
}
describe("native capture submission measurements", () => {
  it("accepts actual native-capture statistics without using a cached-only result schema", () => {
    expect(measureMechanismNativeSubmissionCalls(fixture())).toBe(2);
  });
  it("rejects aggregate/worker counter substitutions", () => {
    const value = fixture();
    value.metrics.compositionStatistics.byLayerType[1]!.calls = 0;
    expect(() => measureMechanismNativeSubmissionCalls(value)).toThrow(
      /worker measurements/,
    );
  });
  it("rejects omitted aggregate rows and inconsistent frame totals", () => {
    const value = fixture();
    value.metrics.compositionStatistics.byLayerType.pop();
    expect(() => measureMechanismNativeSubmissionCalls(value)).toThrow();
    const other = fixture();
    other.frameCount = 3;
    expect(() => measureMechanismNativeSubmissionCalls(other)).toThrow(
      /frame count/,
    );
  });
});
