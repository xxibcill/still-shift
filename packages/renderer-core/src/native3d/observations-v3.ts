import {
  NativeObservedFrameVersionsV3Schema,
  type NativeObservedFrameVersionsV3,
} from "@still-shift/scene-contract";
import { createNativeAsyncObservationCollector } from "./observations-async.ts";

/** Explicit output3 collection includes strict source1, source2 and source3 passes. */
export function createNativeObservationCollectorV3() {
  return createNativeAsyncObservationCollector<NativeObservedFrameVersionsV3>(
    NativeObservedFrameVersionsV3Schema,
  );
}
