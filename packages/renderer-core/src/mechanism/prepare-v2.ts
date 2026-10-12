import {
  MechanismSceneV2Schema,
  MECHANISM_TEACHING_SHAPE_LIMITS,
  type MechanismKinematicSceneV2,
} from "@still-shift/scene-contract";
import { matrixFromTransform } from "./matrix.ts";
import { prepareTeachingShape } from "./teaching-shapes.ts";
import { MechanismEvaluationErrorV2 } from "./types-v2.ts";
import type { PreparedMechanismSceneV2 } from "./types-v2.ts";

export function prepareMechanismSceneV2(
  input: unknown,
): PreparedMechanismSceneV2 {
  const scene = MechanismSceneV2Schema.parse(input);
  return freezeDeep({
    version: "prepared-mechanism-scene-2" as const,
    ...prepareMechanismPoseV2(scene),
  });
}
/** Shared validated pose preparation; no material projection or fallback source parsing. */
export function prepareMechanismPoseV2<S extends MechanismKinematicSceneV2>(
  scene: S,
) {
  const channels =
    scene.rigs.filter((rig) => rig.type !== "spring-return").length +
    scene.teachingShapes.filter(
      (shape) => shape.generator === "fixed-root-pawl-curve-1",
    ).length;
  if (channels > MECHANISM_TEACHING_SHAPE_LIMITS.scalarChannels)
    throw new MechanismEvaluationErrorV2(
      "Aggregate physical and derived pawl scalar channels exceed the frozen budget",
      { code: "mechanism-shape-limit", path: ["rigs"] },
    );
  scene.rigs.forEach((rig, index) => {
    if (
      rig.type === "ratchet" &&
      Math.abs(
        (rig.range[1] - rig.range[0]) / rig.pitch - (rig.toothCount - 1),
      ) > 1e-8
    )
      throw new MechanismEvaluationErrorV2(
        "Ratchet range must resolve its exact declared tooth inventory",
        { code: "mechanism-ratchet-pitch", path: ["rigs", index, "range"] },
      );
  });
  const parts = new Map(scene.parts.map((part) => [part.id, part]));
  const physicalRigs = new Map(
    scene.rigs
      .filter((rig) => rig.type !== "spring-return")
      .map((rig) => [rig.movingPart, rig]),
  );
  const orderedPartIds: string[] = [],
    visited = new Set<string>();
  function visit(id: string) {
    if (visited.has(id)) return;
    const part = parts.get(id)!;
    if (part.parent !== undefined) visit(part.parent);
    const rig = physicalRigs.get(id);
    if (rig) visit(rig.referencePart);
    visited.add(id);
    orderedPartIds.push(id);
  }
  for (const part of scene.parts) visit(part.id);
  return freezeDeep({
    scene,
    orderedPartIds,
    partsById: Object.fromEntries(parts),
    physicalRigsByPart: Object.fromEntries(physicalRigs),
    baseLocalMatrices: Object.fromEntries(
      scene.parts.map((part) => [part.id, matrixFromTransform(part.transform)]),
    ),
    teachingShapes: Object.fromEntries(
      scene.teachingShapes.map((shape) => [
        shape.id,
        prepareTeachingShape(scene, shape),
      ]),
    ),
  });
}

function freezeDeep<T extends object>(root: T): T {
  const pending: object[] = [root];
  while (pending.length) {
    const item = pending.pop()!;
    for (const value of Object.values(item))
      if (
        value !== null &&
        typeof value === "object" &&
        !Object.isFrozen(value)
      )
        pending.push(value);
    Object.freeze(item);
  }
  return root;
}
