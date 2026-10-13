import {
  MECHANISM_STATIC_MOMENT_LIMITS,
  MechanismStaticMomentInputSchema,
  type MechanismStaticMomentModel,
  type NativeObservedFrameV2,
} from "@still-shift/scene-contract";
import { solveMechanismStaticMomentBalance } from "../../../renderer-core/src/mechanism/static-moment.ts";
import { transformMechanismDirectionV2 } from "../../../renderer-core/src/mechanism/matrix-v2.ts";
import { mechanismPackHash } from "./pack-support.ts";
import type { MechanismProductionMeasurement } from "./production-qa-contract.ts";

export function validateProductionMomentModels(
  selectors: readonly MechanismProductionMeasurement[],
  scaleToMeters: number,
) {
  const models = new Map<string, string>();
  for (const selector of selectors) {
    if (selector.kind !== "static-moment-balance") continue;
    const model = selector.model,
      hash = mechanismPackHash(model);
    if (models.has(model.id) && models.get(model.id) !== hash)
      throw Error("QA moment model ID refers to conflicting definitions");
    models.set(model.id, hash);
  }
  if (models.size > MECHANISM_STATIC_MOMENT_LIMITS.models)
    throw Error("QA moment model count exceeds its declared limit");
  if (models.size)
    MechanismStaticMomentInputSchema.shape.scaleToMeters.parse(scaleToMeters);
}

/** Derived ideal force uses original captured positions, not expected-frame anchors. */
export function sampleProductionMoment(
  model: MechanismStaticMomentModel,
  observed: NativeObservedFrameV2,
  scaleToMeters: number,
) {
  const pivot = observed.anchors[model.pivotAnchor],
    point = observed.anchors[model.applicationAnchor],
    reference = observed.parts[model.referencePart]?.worldMatrix;
  if (
    !pivot ||
    !point ||
    pivot.status !== "positioned" ||
    point.status !== "positioned" ||
    !reference
  )
    return undefined;
  try {
    return solveMechanismStaticMomentBalance({
      pivot: pivot.world,
      applicationPoint: point.world,
      axis: transformMechanismDirectionV2(reference, model.axis),
      forceDirection: transformMechanismDirectionV2(
        reference,
        model.forceDirection,
      ),
      scaleToMeters,
      resistingTorque: model.resistingTorque,
    });
  } catch (error) {
    if (error instanceof RangeError) return undefined;
    throw error;
  }
}
