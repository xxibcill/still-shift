import type { Composition } from "@still-shift/scene-contract";
import type { EvaluationOptions } from "../composition/evaluate/types.ts";
import { nativeCompositionObservationCapacityVersions } from "./observation-capacity-versions.ts";

/** Conservative output3 admission only; never measured GPU evidence. */
export function nativeCompositionObservationCapacityV3(
  composition: Composition,
  outputFrame: number,
  options: EvaluationOptions,
): number {
  return nativeCompositionObservationCapacityVersions(
    composition,
    outputFrame,
    options,
    true,
  );
}
