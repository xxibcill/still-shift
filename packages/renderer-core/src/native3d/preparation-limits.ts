import { NATIVE3D_VARIANT_LIMIT } from "@still-shift/scene-contract";
import { passageError } from "../passage-diagnostics.ts";

/** A shared catalogue can allocate a smaller remaining budget, never a larger one. */
export function nativePreparationVariantLimit(
  limit = NATIVE3D_VARIANT_LIMIT,
): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > NATIVE3D_VARIANT_LIMIT)
    passageError(
      "comp-native3d-limit",
      "Native variant admission must be an integer between 1 and 64",
      { path: "variants" },
    );
  return limit;
}
