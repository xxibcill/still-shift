import { describe, expect, it } from "vitest";
import {
  CompositionRenderStatistics,
  renderMembers,
} from "../../packages/renderer-core/src/composition/render/statistics.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { releaseRenderMetadata } from "../../packages/renderer-core/src/managed-metadata.ts";

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

describe("admitted submission metadata", () => {
  it("rolls back retained rows and keys when their preview construction scratch fails", async () => {
    const memory = new ManagedMemory({ pixels: 1, metadata: 8192 });
    await withManagedMemory(memory, async () => {
      memory.beginScratch();
      const statistics = new CompositionRenderStatistics();
      statistics.measure({ stage: "preparation", members: [] }, () => {});
      expect(memory.statistics.reservations).toBeGreaterThan(2);
      memory.endScratch();
      expect(memory.statistics.current.metadata).toBe(0);
      expect(memory.statistics.reservations).toBe(0);
      expect(() => statistics.statistics).toThrow("disposed");
      memory.dispose();
    });
  });
  it("preserves an original null submission error after allocator disposal", async () => {
    const memory = new ManagedMemory({ pixels: 1, metadata: 8192 });
    await withManagedMemory(memory, async () => {
      const statistics = new CompositionRenderStatistics();
      let reason: unknown = "not thrown";
      try {
        statistics.measure({ stage: "operation", members: [] }, () => {
          memory.dispose();
          throw null;
        });
      } catch (error) {
        reason = error;
      }
      expect(reason).toBe(null);
      expect(memory.statistics.reservations).toBe(0);
      expect(memory.statistics.current.metadata).toBe(0);
    });
  });
  it("retains rows across frames, releases lookup duplicates and keeps snapshots alive through acknowledgement", async () => {
    const memory = new ManagedMemory({ pixels: 1, metadata: 65536 });
    await withManagedMemory(memory, async () => {
      let time = 0;
      memory.beginScratch();
      const statistics = new CompositionRenderStatistics(() => time);
      memory.commitScratch();
      const members = [{ layer: "title", type: "text" }];
      const run = () => {
        memory.beginScratch();
        statistics.measure({ stage: "operation", members }, () => {
          time += 3;
        });
        memory.endScratch();
      };
      run();
      const first = memory.statistics;
      run();
      expect(memory.statistics.current.metadata).toBe(first.current.metadata);
      expect(memory.statistics.reservations).toBe(first.reservations);
      members[0]!.layer = "changed";
      const result = statistics.statistics;
      expect(result.spans).toEqual([
        {
          phase: "frame",
          stage: "operation",
          members: [{ layer: "title", type: "text" }],
          calls: 2,
          failures: 0,
          inclusiveMs: 6,
          exclusiveMs: 6,
        },
      ]);
      expect(result.byLayerType).toEqual([
        { phase: "frame", type: "text", calls: 2, submissionWallMs: 6 },
      ]);
      statistics.dispose();
      expect(memory.statistics.reservations).toBe(1);
      expect(result.spans[0]!.members[0]!.layer).toBe("title");
      releaseRenderMetadata(result);
      expect(result.spans).toEqual([]);
      expect(result.byLayerType).toEqual([]);
      expect(memory.statistics.current.metadata).toBe(0);
      memory.dispose();
    });
  });
  it("denies an oversized key before submission and leaves only the original empty containers", async () => {
    const memory = new ManagedMemory({ pixels: 1, metadata: 4096 });
    await withManagedMemory(memory, async () => {
      const statistics = new CompositionRenderStatistics();
      let calls = 0;
      expect(() =>
        statistics.measure(
          { stage: "x".repeat(10000), members: [] },
          () => calls++,
        ),
      ).toThrow("aggregate worker quota");
      expect(calls).toBe(0);
      expect(memory.statistics.current.metadata).toBe(128);
      expect(memory.statistics.reservations).toBe(2);
      statistics.measure({ stage: "small", members: [] }, () => calls++);
      expect(calls).toBe(1);
      statistics.dispose();
      expect(memory.statistics.reservations).toBe(0);
      memory.dispose();
    });
  });
  it("denies snapshot capacity before copying while keeping complete retained counters", async () => {
    const memory = new ManagedMemory({ pixels: 1, metadata: 8192 });
    await withManagedMemory(memory, async () => {
      let time = 0;
      const statistics = new CompositionRenderStatistics(() => time);
      statistics.measure({ stage: "operation", members: [] }, () => {
        time = 5;
      });
      const before = memory.statistics;
      const occupied = memory.reserve(
        "metadata",
        8192 - before.current.metadata - 256,
      );
      expect(() => statistics.statistics).toThrow("aggregate worker quota");
      occupied.release();
      expect(memory.statistics.current.metadata).toBe(before.current.metadata);
      expect(memory.statistics.reservations).toBe(before.reservations);
      const result = statistics.statistics;
      expect(result.spans[0]!.calls).toBe(1);
      expect(result.exclusiveMs).toBe(5);
      releaseRenderMetadata(result);
      statistics.dispose();
      expect(memory.statistics.current.metadata).toBe(0);
      memory.dispose();
    });
  });
  it("preserves null member-copy errors, rolls back map capacity and releases generated members on early denial", async () => {
    const memory = new ManagedMemory({ pixels: 1, metadata: 8192 });
    await withManagedMemory(memory, async () => {
      const statistics = new CompositionRenderStatistics();
      let reads = 0;
      const members = [
        {
          layer: "title",
          get type() {
            if (++reads === 2) throw null;
            return "text";
          },
        },
      ];
      let reason: unknown = "not thrown";
      try {
        statistics.measure({ stage: "operation", members }, () => {});
      } catch (error) {
        reason = error;
      }
      expect(reason).toBe(null);
      expect(reads).toBe(2);
      expect(memory.statistics.current.metadata).toBe(128);
      expect(memory.statistics.reservations).toBe(2);
      const occupied = memory.reserve("metadata", 8192 - 320);
      expect(() =>
        statistics.measure(
          { stage: "operation", members: renderMembers([]) },
          () => {},
        ),
      ).toThrow("aggregate worker quota");
      occupied.release();
      expect(memory.statistics.current.metadata).toBe(128);
      statistics.dispose();
      expect(memory.statistics.reservations).toBe(0);
      memory.dispose();
    });
  });
});
