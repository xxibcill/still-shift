import { describe, expect, it } from "vitest";
import { CompositionRenderStatistics } from "../../packages/renderer-core/src/composition/render/statistics.ts";

describe("actual submission spans", () => {
  it("keeps exclusive time and inherited preparation phase without double counting", () => {
    let time = 0;
    const statistics = new CompositionRenderStatistics(() => time);
    statistics.measure(
      { stage: "graph", phase: "preparation", members: [] },
      () => {
        time = 2;
        statistics.measure(
          { stage: "operation", members: [{ layer: "title", type: "text" }] },
          () => {
            time = 7;
          },
        );
        time = 11;
      },
    );
    const actual = statistics.statistics;
    expect(actual.exclusiveMs).toBe(11);
    expect(actual.byLayerType).toEqual([
      {
        phase: "preparation",
        type: "graph-overhead",
        calls: 1,
        submissionWallMs: 6,
      },
      { phase: "preparation", type: "text", calls: 1, submissionWallMs: 5 },
    ]);
    expect(actual.spans[0]!.inclusiveMs).toBe(11);
  });
  it("keeps mixed native membership and gives shared overhead its own row", () => {
    let time = 0;
    const statistics = new CompositionRenderStatistics(() => time);
    const members = [
      { layer: "floor", type: "solid" },
      { layer: "title", type: "text" },
    ];
    statistics.measure({ stage: "vectors-batch", members }, () => {
      statistics.measure(
        { stage: "native-content", members: [members[1]!] },
        () => {
          time = 4;
        },
      );
      time = 9;
    });
    expect(statistics.statistics.byLayerType).toEqual([
      { phase: "frame", type: "mixed", calls: 1, submissionWallMs: 5 },
      { phase: "frame", type: "text", calls: 1, submissionWallMs: 4 },
    ]);
    expect(statistics.statistics.spans[0]!.members).toEqual(members);
  });
  it("records failures, preserves null reasons and unwinds the nesting stack", () => {
    let time = 0;
    const statistics = new CompositionRenderStatistics(() => time);
    let reason: unknown = "unset";
    try {
      statistics.measure(
        { stage: "failure", phase: "coverage", members: [] },
        () => {
          time = 3;
          throw null;
        },
      );
    } catch (error) {
      reason = error;
    }
    expect(reason).toBeNull();
    statistics.measure({ stage: "next", members: [] }, () => {
      time = 5;
    });
    expect(
      statistics.statistics.spans.map(({ phase, failures, exclusiveMs }) => ({
        phase,
        failures,
        exclusiveMs,
      })),
    ).toEqual([
      { phase: "coverage", failures: 1, exclusiveMs: 3 },
      { phase: "frame", failures: 0, exclusiveMs: 2 },
    ]);
  });
  it("does not expose mutable counter or membership references", () => {
    const statistics = new CompositionRenderStatistics();
    const members = [{ layer: "floor", type: "solid" }];
    statistics.measure({ stage: "operation", members }, () => {});
    members[0]!.layer = "changed";
    const copy = statistics.statistics;
    copy.spans[0]!.members[0]!.layer = "also-changed";
    copy.spans[0]!.calls = 99;
    expect(statistics.statistics.spans[0]!.members[0]!.layer).toBe("floor");
    expect(statistics.statistics.spans[0]!.calls).toBe(1);
  });
});
