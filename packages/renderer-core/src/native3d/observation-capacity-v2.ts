import type { Composition } from "@still-shift/scene-contract";
import type { EvaluationOptions } from "../composition/evaluate/types.ts";
import { nativeCompositionObservationCapacityVersions } from "./observation-capacity-versions.ts";

/** Original output2 capacity boundary rejects source3 passes. */
export function nativeCompositionObservationCapacityV2(
  composition: Composition,
  outputFrame: number,
  options: EvaluationOptions,
): number {
  return nativeCompositionObservationCapacityVersions(
    composition,
    outputFrame,
    options,
    false,
  );
}
