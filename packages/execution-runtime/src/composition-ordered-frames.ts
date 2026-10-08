import {
  compositionFrameAssignment,
  type CompositionFrameDistribution,
} from "./composition-frame-assignment.ts";
import type { Readable } from "node:stream";

type Worker = { next: number; end: number; step: number; pending: boolean };
type Turn = { resolve(): void; reject(reason: unknown): void };

/** One-frame chunks distribute absolute time evenly without retaining complete Node frame bodies. */
export class CompositionOrderedFrames {
  private readonly workers: Worker[];
  private readonly readers = new Set<Readable>();
  private readonly turns = new Map<number, Turn>();
  private failure: { reason: unknown } | undefined;
  private next = 0;
  private peakPending = 0;

  constructor(
    private readonly frameCount: number,
    workerCount: number,
    private readonly consume: (
      source: Readable,
      frame: number,
      worker: number,
    ) => Promise<void>,
    distribution: CompositionFrameDistribution = "round-robin",
  ) {
    if (
      !Number.isSafeInteger(frameCount) ||
      frameCount < 1 ||
      !Number.isInteger(workerCount) ||
      workerCount < 1 ||
      workerCount > 4 ||
      workerCount > frameCount
    )
      throw Error("Composition parallel frame bounds are invalid");
    this.workers = Array.from({ length: workerCount }, (_, worker) => {
      const assignment = compositionFrameAssignment(
        frameCount,
        workerCount,
        worker,
        distribution,
      );
      return {
        next: assignment.start,
        end: assignment.end,
        step: assignment.step,
        pending: false,
      };
    });
  }

  get statistics() {
    return {
      deliveredFrames: this.next,
      pendingFrames: this.readers.size,
      peakPendingFrames: this.peakPending,
    };
  }
  get hasFailed() {
    return this.failure !== undefined;
  }
  get failureReason() {
    return this.failure?.reason;
  }
  private assertOpen() {
    if (this.failure) throw this.failure.reason;
  }
  private waitForTurn(frame: number) {
    if (frame === this.next) return;
    return new Promise<void>((resolve, reject) =>
      this.turns.set(frame, { resolve, reject }),
    );
  }

  async accept(worker: number, frame: number, source: Readable) {
    this.assertOpen();
    const assignment = Number.isInteger(worker)
      ? this.workers[worker]
      : undefined;
    if (
      !assignment ||
      !Number.isSafeInteger(frame) ||
      frame < 0 ||
      frame >= this.frameCount ||
      frame >= assignment.end ||
      frame !== assignment.next ||
      assignment.pending ||
      this.readers.has(source)
    ) {
      const reason = Error("Composition frame ownership or order mismatch");
      this.fail(reason);
      throw reason;
    }
    assignment.pending = true;
    this.readers.add(source);
    this.peakPending = Math.max(this.peakPending, this.readers.size);
    const failed = (reason: unknown) => this.fail(reason);
    const closed = () => {
      if (!source.readableEnded)
        this.fail(
          Error("Composition worker closed before its complete frame body"),
        );
    };
    source.on("error", failed);
    // Node marks closed before emitting a deferred destroy error; keep this
    // listener through the actual close event, including close-before-read.
    source.once("close", () => source.off("error", failed));
    source.once("close", closed);
    try {
      await this.waitForTurn(frame);
      this.assertOpen();
      await this.consume(source, frame, worker);
      this.assertOpen();
      if (!source.readableEnded)
        throw Error("Encoder must consume the complete frame body");
      assignment.next += assignment.step;
      this.next++;
      const turn = this.turns.get(this.next);
      this.turns.delete(this.next);
      turn?.resolve();
    } catch (reason) {
      this.fail(reason);
      throw this.failure!.reason;
    } finally {
      assignment.pending = false;
      this.readers.delete(source);
      this.turns.delete(frame);
      source.off("close", closed);
    }
  }

  fail(reason: unknown) {
    if (this.failure) return;
    this.failure = { reason };
    for (const turn of this.turns.values()) turn.reject(reason);
    this.turns.clear();
    for (const reader of this.readers)
      reader.destroy(reason instanceof Error ? reason : Error(String(reason)));
  }

  finish() {
    this.assertOpen();
    if (this.next !== this.frameCount || this.readers.size) {
      const reason = Error("Composition parallel frame delivery is incomplete");
      this.fail(reason);
      throw reason;
    }
  }
}
