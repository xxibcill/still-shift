import { expect, it } from "vitest";
import { compositionFrameAssignment } from "../../packages/execution-runtime/src/composition-frame-assignment.ts";
import {
  compositionExecutionPolicy,
  compositionWorkerMemoryLimits,
} from "../../packages/execution-runtime/src/composition-export-memory.ts";
it("partitions all absolute frames exactly once for uneven ranges", () => {
  for (const distribution of ["round-robin", "contiguous"] as const)
    for (const frames of [4, 5, 7, 13, 121])
      for (let workers = 1; workers <= 4; workers++) {
        const assigned: number[] = [];
        for (let worker = 0; worker < workers; worker++) {
          const { start, end, step } = compositionFrameAssignment(
            frames,
            workers,
            worker,
            distribution,
          );
          expect(start).toBeLessThan(end);
          for (let frame = start; frame < end; frame += step)
            assigned.push(frame);
        }
        expect(assigned.sort((a, b) => a - b)).toEqual(
          Array.from({ length: frames }, (_, i) => i),
        );
      }
});
it("keeps ordinary frames parallel and admits full-area cache staging", () => {
  expect(compositionExecutionPolicy(1920, 1080, 4).concurrentWorkers).toBe(4);
  for (let workers = 1; workers <= 4; workers++) {
    const policy = compositionExecutionPolicy(8192, 8192, workers);
    expect(policy.concurrentWorkers).toBe(1);
    expect(policy.cacheBytes).toBeGreaterThanOrEqual(8192 * 8192 * 16 * 2);
    expect(policy.diskBytes).toBeGreaterThanOrEqual(policy.cacheBytes);
    expect(
      compositionWorkerMemoryLimits(policy.concurrentWorkers).pixels,
    ).toBeGreaterThan(policy.cacheBytes);
  }
});
