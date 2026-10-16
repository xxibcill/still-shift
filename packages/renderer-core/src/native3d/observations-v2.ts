import {
  NativeObservedFrameVersionsSchema,
  type NativeObservedFrameVersions,
} from "@still-shift/scene-contract";
import { createNativeAsyncObservationCollector } from "./observations-async.ts";

/** Strict output2 collection: source3 frames remain rejected by this parser. */
export function createNativeObservationCollectorV2() {
  return createNativeAsyncObservationCollector<NativeObservedFrameVersions>(
    NativeObservedFrameVersionsSchema,
  );
}
