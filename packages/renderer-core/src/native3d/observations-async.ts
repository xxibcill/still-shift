import { NATIVE3D_OBSERVATION_LIMITS } from "@still-shift/scene-contract";
import { renderMemory } from "../managed-memory-context.ts";
import type { MemoryLease } from "../managed-memory.ts";
import { passageError } from "../passage-diagnostics.ts";
import { freezeNativeData } from "./prepare.ts";
import type { DeepReadonly } from "./types.ts";

type NativeObservedAsyncSample<T> = {
  sampleIndex: number;
  sampleFrame: number;
  observed: T;
};

/** Reserve invocation order synchronously; asynchronous hashes cannot reorder contributions. */
export function createNativeAsyncObservationCollector<
  T extends { controller: string },
>(schema: {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}) {
  let active = false,
    disposed = false,
    epoch = 0,
    bytes = 256;
  let capacity: number = NATIVE3D_OBSERVATION_LIMITS.packetBytes;
  let entries: {
    sampleFrame: number;
    observed: Promise<DeepReadonly<T>>;
  }[] = [];
  let lease: MemoryLease | undefined;
  const reset = () => {
    active = false;
    epoch++;
    entries = [];
    bytes = 256;
    lease?.release();
    lease = undefined;
  };
  return {
    begin(
      maximumPacketBytes: number = NATIVE3D_OBSERVATION_LIMITS.packetBytes,
    ) {
      if (disposed)
        passageError(
          "comp-native3d-observation",
          "Observation collector is disposed",
          { path: "nativeObservations" },
        );
      reset();
      if (
        !Number.isSafeInteger(maximumPacketBytes) ||
        maximumPacketBytes < 1 ||
        maximumPacketBytes > NATIVE3D_OBSERVATION_LIMITS.packetBytes
      )
        passageError(
          "comp-native3d-limit",
          "Invalid output-frame observation capacity",
          { path: "nativeObservations" },
        );
      // Own bounded parser objects, UTF-16 serialization, UTF-8 and invocation records first.
      lease = renderMemory()?.reserve(
        "metadata",
        maximumPacketBytes * 8 + 262144,
        undefined,
        true,
      );
      capacity = maximumPacketBytes;
      active = true;
    },
    observe(
      observed: DeepReadonly<T> | Promise<DeepReadonly<T>>,
      sampleFrame: number,
    ) {
      if (!active) return;
      if (
        entries.length >= NATIVE3D_OBSERVATION_LIMITS.passes ||
        !Number.isFinite(sampleFrame) ||
        sampleFrame < 0 ||
        sampleFrame > 108000
      )
        passageError(
          "comp-native3d-limit",
          "Observed contributing passes exceed the output frame bound",
          { frame: sampleFrame, path: "nativeObservations" },
        );
      const pending = Promise.resolve(observed);
      // Rejections remain owned by finish/runtime finalization, without unhandled promise events.
      void pending.then(
        () => {},
        () => {},
      );
      entries.push({ sampleFrame, observed: pending });
    },
    async finish(): Promise<readonly NativeObservedAsyncSample<T>[]> {
      if (!active || disposed)
        passageError(
          "comp-native3d-observation",
          "No active observation output frame",
          { path: "nativeObservations" },
        );
      active = false;
      const invocation = epoch,
        assigned = entries;
      const settled = await Promise.allSettled(
        assigned.map((entry) => entry.observed),
      );
      if (invocation !== epoch || (lease && !lease.active))
        passageError(
          "comp-native3d-observation",
          "Observed output frame was aborted or disposed",
          { path: "nativeObservations" },
        );
      const passes: NativeObservedAsyncSample<T>[] = [];
      for (const [index, result] of settled.entries()) {
        if (result.status === "rejected") throw result.reason;
        const observed = result.value;
        const sample = {
          sampleIndex: index,
          sampleFrame: assigned[index]!.sampleFrame,
          observed,
        };
        const size =
          new TextEncoder().encode(JSON.stringify(sample)).byteLength + 1;
        if (bytes + size > capacity)
          passageError(
            "comp-native3d-limit",
            "Native output-frame observations exceed their admitted capacity",
            {
              frame: sample.sampleFrame,
              node: observed.controller,
              path: "nativeObservations",
            },
          );
        const parsed = schema.safeParse(observed);
        if (!parsed.success)
          passageError(
            "comp-native3d-observation",
            "Completed native pass returned invalid measurements",
            {
              frame: sample.sampleFrame,
              node: observed.controller,
              path: "nativeObservations",
            },
          );
        bytes += size;
        passes.push(freezeNativeData({ ...sample, observed: parsed.data }));
      }
      return Object.freeze(passes);
    },
    abort: reset,
    dispose() {
      disposed = true;
      reset();
    },
  };
}
