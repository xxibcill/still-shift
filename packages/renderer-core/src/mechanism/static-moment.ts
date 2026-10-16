import {
  MECHANISM_STATIC_MOMENT_LIMITS,
  MechanismStaticMomentInputSchema,
  MechanismStaticMomentModelSchema,
  MechanismStaticMomentResultSchema,
  type MechanismFrameRequestV2,
  type MechanismStaticMomentInput,
  type MechanismStaticMomentModel,
} from "@still-shift/scene-contract";
import { z } from "zod";
import { evaluateMechanismFrameV2 } from "./evaluate-v2.ts";
import { transformMechanismDirectionV2 } from "./matrix-v2.ts";
import { MechanismEvaluationErrorV2 } from "./types-v2.ts";
import type { PreparedMechanismPoseV2 } from "./types-v2.ts";

function normalized(values: readonly number[], name: string) {
  const magnitude = Math.hypot(...values);
  if (magnitude <= 1e-12) throw new RangeError(`${name} must be nonzero`);
  return values.map((value) => value / magnitude);
}
/** Force magnitude balances one signed resistance about a fixed axis.
 * Distances use the scene's declared physical calibration; no measured peg force is implied. */
export function solveMechanismStaticMomentBalance(
  input: MechanismStaticMomentInput,
) {
  const value = MechanismStaticMomentInputSchema.parse(input),
    axis = normalized(value.axis, "axis"),
    direction = normalized(value.forceDirection, "forceDirection"),
    displacement = value.applicationPoint.map(
      (component, index) =>
        (component - value.pivot[index]!) * value.scaleToMeters,
    ),
    [rx, ry, rz] = displacement,
    [fx, fy, fz] = direction;
  const arm =
    axis[0]! * (ry! * fz! - rz! * fy!) +
    axis[1]! * (rz! * fx! - rx! * fz!) +
    axis[2]! * (rx! * fy! - ry! * fx!);
  if (Math.abs(arm) < MECHANISM_STATIC_MOMENT_LIMITS.minimumArmMeters)
    throw new RangeError(
      "Force line has no admitted moment arm about the declared axis",
    );
  const resistance =
      value.resistingTorque.value *
      (value.resistingTorque.unit === "N*mm" ? 0.001 : 1),
    force = -resistance / arm;
  if (
    !Number.isFinite(force) ||
    force < 0 ||
    force > MECHANISM_STATIC_MOMENT_LIMITS.maximumForceNewtons
  )
    throw new RangeError(
      "Declared force direction cannot balance the resistance within the admitted magnitude",
    );
  return Object.freeze(
    MechanismStaticMomentResultSchema.parse({
      method: "ideal-static-single-axis-moment-balance-1",
      signedMomentArmMeters: arm,
      resistingTorqueNewtonMeters: resistance,
      requiredForceNewtons: force === 0 ? 0 : force,
      assumption: "fixed-axis-rigid-arm-prescribed-resistance-1",
    }),
  );
}

/** Sample the normal pose once, then calculate bounded ideal forces from its
 * world-space anchors and the declared reference directions. Results are expected-state evidence. */
export function evaluateMechanismStaticMomentFrame(
  prepared: PreparedMechanismPoseV2,
  request: MechanismFrameRequestV2,
  models: readonly MechanismStaticMomentModel[],
) {
  const definitions = z
      .array(MechanismStaticMomentModelSchema)
      .min(1)
      .max(MECHANISM_STATIC_MOMENT_LIMITS.models)
      .parse(models),
    ids = new Set<string>();
  for (const [index, model] of definitions.entries()) {
    if (ids.has(model.id))
      throw new MechanismEvaluationErrorV2("Moment model IDs must be unique", {
        code: "mechanism-moment-reference",
        path: ["models", index, "id"],
        frame: request.frame,
      });
    ids.add(model.id);
    for (const field of ["pivotAnchor", "applicationAnchor"] as const)
      if (!prepared.scene.anchors.some((anchor) => anchor.id === model[field]))
        throw new MechanismEvaluationErrorV2(
          `Unknown moment anchor ${model[field]}`,
          {
            code: "mechanism-moment-reference",
            path: ["models", index, field],
            frame: request.frame,
          },
        );
    if (!Object.hasOwn(prepared.partsById, model.referencePart))
      throw new MechanismEvaluationErrorV2("Unknown moment reference part", {
        code: "mechanism-moment-reference",
        path: ["models", index, "referencePart"],
        frame: request.frame,
      });
  }
  const frame = evaluateMechanismFrameV2(prepared, request),
    moments = Object.fromEntries(
      definitions.map((model, index) => {
        const reference = frame.parts[model.referencePart]!.worldMatrix;
        try {
          return [
            model.id,
            solveMechanismStaticMomentBalance({
              pivot: frame.anchors[model.pivotAnchor]!.world,
              applicationPoint: frame.anchors[model.applicationAnchor]!.world,
              axis: transformMechanismDirectionV2(reference, model.axis),
              forceDirection: transformMechanismDirectionV2(
                reference,
                model.forceDirection,
              ),
              scaleToMeters: prepared.scene.units.scaleToMeters,
              resistingTorque: model.resistingTorque,
            }),
          ] as const;
        } catch (error) {
          throw new MechanismEvaluationErrorV2(
            error instanceof Error ? error.message : "Moment balance failed",
            {
              code: "mechanism-moment-balance",
              path: ["models", index],
              frame: request.frame,
            },
          );
        }
      }),
    );
  return Object.freeze({ frame, moments: Object.freeze(moments) });
}
