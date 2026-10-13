import type {
  MechanismKinematicSceneV2,
  MechanismRigV2,
  MechanismVector,
} from "@still-shift/scene-contract";
import { transformPoint } from "./matrix.ts";
import { rotationAroundAxisV2 } from "./matrix-v2.ts";
import { MechanismEvaluationErrorV2 } from "./types-v2.ts";
import type { DeepReadonly } from "./types.ts";
type LoadSeat = Extract<DeepReadonly<MechanismRigV2>, { type: "load-seat" }>;
export type LoadSeatCalibration = {
  metersPerReferenceUnit: number;
  referenceScale: number;
};
const dot = (a: readonly number[], b: readonly number[]) =>
  a.reduce((sum, value, index) => sum + value * b[index]!, 0);
function loadSeatBasis(rig: LoadSeat) {
  const normalize = (v: readonly number[]) =>
    v.map((value) => value / Math.hypot(...v)) as MechanismVector;
  const cross = (
    a: readonly number[],
    b: readonly number[],
  ): MechanismVector => [
    a[1]! * b[2]! - a[2]! * b[1]!,
    a[2]! * b[0]! - a[0]! * b[2]!,
    a[0]! * b[1]! - a[1]! * b[0]!,
  ];
  const reaction = normalize(rig.reactionAxis),
    rotation = normalize(cross(reaction, rig.normalAxis));
  return { reaction, normal: cross(rotation, reaction), rotation };
}
export function loadSeatRotationAxis(rig: LoadSeat): MechanismVector {
  return loadSeatBasis(rig).rotation;
}
/** Static uniform scale changes the geometric stop length, not the prescribed SI compliance. */
export function prepareLoadSeatCalibrations(
  scene: DeepReadonly<MechanismKinematicSceneV2>,
) {
  const parts = new Map(scene.parts.map((part) => [part.id, part])),
    output: Record<string, LoadSeatCalibration> = {};
  for (const rig of scene.rigs) {
    if (rig.type !== "load-seat") continue;
    let id: string | undefined = rig.referencePart,
      referenceScale = 1;
    const visited = new Set<string>();
    while (id !== undefined) {
      const part = parts.get(id);
      if (!part || visited.has(id))
        throw new MechanismEvaluationErrorV2(
          "Invalid load reference hierarchy",
          {
            code: "mechanism-load-reference",
            path: ["rigs", rig.id, "referencePart"],
          },
        );
      visited.add(id);
      const scale = part.transform.scale;
      if (
        scale[0] <= 0 ||
        scale.some((component) => Math.abs(component - scale[0]) > 1e-8)
      )
        throw new MechanismEvaluationErrorV2(
          "Load seating requires positive uniform reference scale",
          {
            code: "mechanism-load-scale",
            path: ["parts", id, "transform", "scale"],
          },
        );
      referenceScale *= scale[0];
      id = part.parent;
    }
    const metersPerReferenceUnit = scene.units.scaleToMeters * referenceScale,
      stopTravelMeters = rig.maxTravelMeters * referenceScale;
    if (
      !Number.isFinite(metersPerReferenceUnit) ||
      metersPerReferenceUnit <= 0 ||
      !Number.isFinite(stopTravelMeters) ||
      stopTravelMeters <= 0 ||
      stopTravelMeters > 1e6 ||
      rig.maxTravelMeters / scene.units.scaleToMeters > 1e6
    )
      throw new MechanismEvaluationErrorV2(
        "Load calibration exceeds finite coordinate limits",
        {
          code: "mechanism-load-scale",
          path: ["rigs", rig.id, "maxTravelMeters"],
        },
      );
    output[rig.id] = { metersPerReferenceUnit, referenceScale };
  }
  return output;
}
/** Prescribed force/compliance drives one bounded state. Primary contact is conserved
 * by the coupled reaction translation; this is an illustrative law, not material simulation. */
export function sampleLoadSeatV2(
  rig: LoadSeat,
  loadNewtons: number,
  calibration: LoadSeatCalibration,
) {
  const basis = loadSeatBasis(rig),
    stopTravelMeters = rig.maxTravelMeters * calibration.referenceScale,
    displacementMeters = Math.min(
      loadNewtons * rig.complianceMetersPerNewton,
      stopTravelMeters,
    ),
    fraction = displacementMeters / stopTravelMeters,
    angleRadians = fraction === 0 ? 0 : rig.seatingAngleRadians * fraction,
    rotation = rotationAroundAxisV2(
      loadSeatRotationAxis(rig),
      angleRadians,
      rig.pivot,
    ),
    point = transformPoint(rotation, rig.contactPoint),
    travel = -displacementMeters / calibration.metersPerReferenceUnit,
    axial = basis.reaction.map((value) => value * travel),
    normal = dot(
      basis.normal,
      rig.contactPoint.map(
        (value, index) => value - point[index]! - axial[index]!,
      ),
    ),
    movingTranslation = axial.map(
      (value, index) => value + basis.normal[index]! * normal,
    ) as MechanismVector,
    reactionTravel = dot(
      basis.reaction,
      point.map(
        (value, index) =>
          value + movingTranslation[index]! - rig.contactPoint[index]!,
      ),
    ),
    reactionTranslation = basis.reaction.map(
      (value) => value * reactionTravel,
    ) as MechanismVector;
  return {
    id: rig.id,
    type: "load-seat" as const,
    loadNewtons,
    displacementMeters,
    stopTravelMeters,
    angleRadians,
    movingTranslation,
    reactionTranslation,
    phase:
      loadNewtons === 0
        ? ("unloaded" as const)
        : fraction === 1
          ? ("stopped" as const)
          : ("seating" as const),
    stopReactionNewtons:
      fraction === 1
        ? Math.max(
            0,
            loadNewtons - stopTravelMeters / rig.complianceMetersPerNewton,
          )
        : 0,
  };
}
