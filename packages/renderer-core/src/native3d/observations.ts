import {
  NativeObservedFrameSchema,
  NATIVE3D_OBSERVATION_LIMITS,
  type NativeObservedFrame,
  type NativeObservedSample,
} from "@still-shift/scene-contract";
import { renderMemory } from "../managed-memory-context.ts";
import type { MemoryLease } from "../managed-memory.ts";
import { passageError } from "../passage-diagnostics.ts";
import { freezeNativeData } from "./prepare.ts";

/** One output frame owns its measured passes until the next frame or disposal. */
export function createNativeObservationCollector() {
  let active = false;
  let passes: NativeObservedSample[] = [];
  let bytes = 256;
  let lease: MemoryLease | undefined;
  const reset = () => {
    active = false;
    passes = [];
    bytes = 256;
    lease?.release();
    lease = undefined;
  };
  return {
    begin() {
      reset();
      lease = renderMemory()?.reserve("metadata", 512, undefined, true);
      active = true;
    },
    observe(observed: NativeObservedFrame, sampleFrame: number) {
      if (!active) return;
      if (
        passes.length >= NATIVE3D_OBSERVATION_LIMITS.passes ||
        !Number.isFinite(sampleFrame) ||
        sampleFrame < 0 ||
        sampleFrame > 108_000
      )
        passageError(
          "comp-native3d-limit",
          "Observed contributing passes exceed the output frame bound",
          {
            frame: sampleFrame,
            node: observed.controller,
            path: "nativeObservations",
          },
        );
      const sample = { sampleIndex: passes.length, sampleFrame, observed };
      const next =
        bytes + new TextEncoder().encode(JSON.stringify(sample)).byteLength + 1;
      if (next > NATIVE3D_OBSERVATION_LIMITS.packetBytes)
        passageError(
          "comp-native3d-limit",
          "Native output-frame observations exceed 1 MiB",
          {
            frame: sampleFrame,
            node: observed.controller,
            path: "nativeObservations",
          },
        );
      // Include the retained objects and transient serialization backing separately
      // from pixel/GPU estimates. Worker reservations remain authoritative.
      lease?.resize(next * 2);
      const parsed = NativeObservedFrameSchema.safeParse(observed);
      if (!parsed.success)
        passageError(
          "comp-native3d-observation",
          "Completed native pass returned invalid measurements",
          {
            frame: sampleFrame,
            node: observed.controller,
            path: "nativeObservations",
          },
        );
      bytes = next;
      passes.push(freezeNativeData({ ...sample, observed: parsed.data }));
    },
    finish(): readonly NativeObservedSample[] {
      active = false;
      return Object.freeze(passes);
    },
    abort: reset,
    dispose: reset,
  };
}
