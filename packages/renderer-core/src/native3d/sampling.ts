import type { Native3DLayer } from "@still-shift/scene-contract";
import { passageError } from "../passage-diagnostics.ts";
import type { NativeScopeSample } from "./types.ts";

export function nativeSourceFrame(
  controller: Native3DLayer,
  sample: NativeScopeSample,
): number {
  const location = {
    node: controller.id,
    path: `${sample.scope}/${controller.id}`,
    frame: sample.scopeFrame,
  };
  if (
    ![sample.scopeFrame, sample.layerTime, sample.owningScopeFps].every(
      Number.isFinite,
    ) ||
    sample.owningScopeFps <= 0
  )
    passageError(
      "comp-native3d-clock",
      "Native sampling requires a finite resolved owning clock",
      location,
    );
  const sourceFrame =
    controller.sourceStartFrame +
    (sample.layerTime * controller.sourceFps) / sample.owningScopeFps;
  if (!Number.isFinite(sourceFrame) || sourceFrame < 0 || sourceFrame > 108_000)
    passageError(
      "comp-native3d-clock",
      "Native source time is outside its bounded source interval",
      {
        ...location,
        path: location.path + ".sourceStartFrame",
      },
    );
  if (
    !Number.isInteger(sample.width) ||
    !Number.isInteger(sample.height) ||
    sample.width < 16 ||
    sample.height < 16 ||
    sample.width > 8192 ||
    sample.height > 8192 ||
    sample.width * sample.height > 8_388_608
  )
    passageError(
      "comp-native3d-limit",
      "Native viewport exceeds the admitted pixel/axis bounds",
      location,
    );
  return sourceFrame;
}
