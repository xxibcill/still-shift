import { PassThrough, Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { CompositionOrderedFrames } from "../../packages/execution-runtime/src/composition-ordered-frames.ts";

const frame = (index: number) =>
  Readable.from([Buffer.from([index, 255 - index])]);
const capture = async (source: Readable) => {
  for await (const chunk of source) expect(Buffer.isBuffer(chunk)).toBe(true);
};

describe("bounded ordered composition frames", () => {
  it("runs four producers while exactly one consumer writes frames in absolute order", async () => {
    let release!: () => void;
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
    const bytes: number[] = [],
      writes: number[] = [];
    let activeWriters = 0;
    const ordered = new CompositionOrderedFrames(
      12,
      4,
      async (source, index) => {
        activeWriters++;
        expect(activeWriters).toBe(1);
        if (index === 0) await first;
        for await (const chunk of source) bytes.push(...chunk);
        writes.push(index);
        activeWriters--;
      },
    );
    const producers = [3, 2, 1, 0].map(async (worker) => {
      for (let index = worker; index < 12; index += 4)
        await ordered.accept(worker, index, frame(index));
    });
    expect(ordered.statistics.pendingFrames).toBe(4);
    expect(writes).toEqual([]);
    release();
    await Promise.all(producers);
    ordered.finish();
    expect(writes).toEqual(Array.from({ length: 12 }, (_, index) => index));
    expect(bytes).toEqual(
      Array.from({ length: 12 }, (_, index) => [index, 255 - index]).flat(),
    );
    expect(ordered.statistics).toEqual({
      deliveredFrames: 12,
      pendingFrames: 0,
      peakPendingFrames: 4,
    });
  });

  it("propagates the original abort reason to the active reader and every queued worker", async () => {
    const ordered = new CompositionOrderedFrames(4, 4, capture);
    const source = new PassThrough(),
      reason = Error("Owner cancelled parallel export");
    const pending = [3, 2, 1].map((worker) =>
      ordered.accept(worker, worker, frame(worker)),
    );
    pending.push(ordered.accept(0, 0, source));
    const observed = pending.map((promise) =>
      promise.catch((error: unknown) => error),
    );
    ordered.fail(reason);
    expect(await Promise.all(observed)).toEqual([
      reason,
      reason,
      reason,
      reason,
    ]);
    expect(source.destroyed).toBe(true);
    expect(ordered.statistics.pendingFrames).toBe(0);
    expect(ordered.statistics.deliveredFrames).toBe(0);
    await expect(ordered.accept(0, 0, frame(0))).rejects.toBe(reason);
  });

  it("rejects a second pending body from the same worker without replacing the first error", async () => {
    const ordered = new CompositionOrderedFrames(4, 2, capture);
    const original = ordered
      .accept(0, 0, new PassThrough())
      .catch((error: unknown) => error);
    const duplicate = await ordered
      .accept(0, 0, frame(0))
      .catch((error: unknown) => error);
    expect(duplicate).toBeInstanceOf(Error);
    expect(String(duplicate)).toContain("ownership");
    expect(await original).toBe(duplicate);
    await expect(ordered.accept(1, 1, frame(1))).rejects.toBe(duplicate);
  });

  it.each([
    [1, 0],
    [0, 4],
    [0, -1],
    [4, 0],
    [0, 0.5],
  ])(
    "rejects invalid ownership worker %s / frame %s",
    async (worker, index) => {
      const ordered = new CompositionOrderedFrames(8, 4, capture);
      await expect(ordered.accept(worker, index, frame(0))).rejects.toThrow(
        "ownership",
      );
      expect(ordered.statistics.deliveredFrames).toBe(0);
    },
  );

  it("preserves an encoder error across all waiting producers", async () => {
    const reason = Error("Encoder input failed");
    const ordered = new CompositionOrderedFrames(4, 4, async () => {
      throw reason;
    });
    const pending = [3, 2, 1, 0].map((worker) =>
      ordered
        .accept(worker, worker, frame(worker))
        .catch((error: unknown) => error),
    );
    expect(await Promise.all(pending)).toEqual([
      reason,
      reason,
      reason,
      reason,
    ]);
    expect(ordered.statistics.deliveredFrames).toBe(0);
  });

  it("does not accept a consumer that returns before reading the complete body", async () => {
    const ordered = new CompositionOrderedFrames(1, 1, async () => {});
    await expect(ordered.accept(0, 0, frame(0))).rejects.toThrow(
      "complete frame body",
    );
    expect(ordered.statistics.deliveredFrames).toBe(0);
  });

  it("rejects missing final frames and invalid worker bounds", async () => {
    const ordered = new CompositionOrderedFrames(2, 1, capture);
    await ordered.accept(0, 0, frame(0));
    expect(() => ordered.finish()).toThrow("incomplete");
    for (const [frames, workers] of [
      [4, 0],
      [4, 5],
      [1, 2],
      [0, 1],
      [4.5, 1],
    ])
      expect(
        () => new CompositionOrderedFrames(frames!, workers!, capture),
      ).toThrow("bounds");
  });
  it("keeps a non-Error abort reason without wrapping or replacing it", async () => {
    const ordered = new CompositionOrderedFrames(1, 1, capture);
    const pending = ordered
      .accept(0, 0, new PassThrough())
      .catch((error: unknown) => error);
    ordered.fail(null);
    expect(await pending).toBe(null);
    expect(ordered.hasFailed).toBe(true);
    expect(ordered.failureReason).toBe(null);
  });
});

it("drains contiguous workers in sequential groups without waiting on an unstarted owner", async () => {
  const actual: number[] = [];
  const ordered = new CompositionOrderedFrames(
    11,
    4,
    async (source, frame, worker) => {
      await capture(source);
      expect(worker).toBe(frame < 2 ? 0 : frame < 5 ? 1 : frame < 8 ? 2 : 3);
      actual.push(frame);
    },
    "contiguous",
  );
  const ranges = [
    [0, 2],
    [2, 5],
    [5, 8],
    [8, 11],
  ] as const;
  for (const [worker, [start, end]] of ranges.entries())
    for (let index = start; index < end; index++)
      await ordered.accept(worker, index, frame(index));
  ordered.finish();
  expect(actual).toEqual(Array.from({ length: 11 }, (_, i) => i));
  expect(ordered.statistics.peakPendingFrames).toBe(1);
});
