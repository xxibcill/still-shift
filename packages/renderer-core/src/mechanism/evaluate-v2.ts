import { MechanismAnchorSourceV2Schema } from "@still-shift/scene-contract";
import {
  MechanismFrameRequestV2Schema,
  MechanismFrameResultV2Schema,
} from "@still-shift/scene-contract";
import type {
  MechanismFrameRequestV2,
  MechanismFrameResultV2,
  MechanismPartFrame,
  MechanismProjectedAnchorV2,
  MechanismRelationshipFrameV2,
  MechanismRelationshipV2,
  MechanismRigFrameV2,
  MechanismShapeFrame,
} from "@still-shift/scene-contract";
import { IDENTITY_MATRIX, multiplyMatrices, transformPoint } from "./matrix.ts";
import {
  inverseMechanismMatrixV2,
  rotationAroundAxisV2,
  translationAlongAxisV2,
  transformMechanismDirectionV2,
} from "./matrix-v2.ts";
import {
  prepareMechanismRigTracksV2,
  evaluateMechanismRigTracksV2,
} from "./rig-tracks-v2.ts";
import {
  evaluateTeachingShape,
  teachingShapeInputsForPartsV2,
} from "./teaching-shapes.ts";
import { sampleMechanismCameraV2 } from "./camera-v2.ts";
import { projectMechanismAnchor } from "./projection.ts";
import { dot, scale, subtract } from "./shape-math.ts";
import { MechanismEvaluationErrorV2 } from "./types-v2.ts";
import type { PreparedMechanismSceneV2 } from "./types-v2.ts";
import type { DeepReadonly } from "./types.ts";

export function evaluateMechanismFrameV2(
  prepared: PreparedMechanismSceneV2,
  input: MechanismFrameRequestV2,
): MechanismFrameResultV2 {
  const request = MechanismFrameRequestV2Schema.parse(input);
  for (const [index, part] of request.hiddenParts.entries()) {
    if (!Object.hasOwn(prepared.partsById, part))
      throw new MechanismEvaluationErrorV2(`Unknown hidden part ${part}`, {
        code: "mechanism-part-reference",
        path: ["hiddenParts", index],
        frame: request.frame,
      });
  }
  const rigs = evaluateMechanismRigTracksV2(
    prepareMechanismRigTracksV2(prepared.scene, request.rigControls),
    request.frame,
  );
  const parts = evaluateParts(prepared, rigs, request.hiddenParts);
  const shapeStates: Record<string, MechanismShapeFrame> = {};
  for (const shape of prepared.scene.teachingShapes)
    shapeStates[shape.id] = evaluateTeachingShape(
      prepared.teachingShapes[shape.id]!,
      teachingShapeInputsForPartsV2(shape, prepared.scene, parts, rigs),
    );
  const camera = sampleMechanismCameraV2(
    request.camera ?? prepared.scene.camera,
    request.cameraKeys,
    request.frame,
  );
  const anchors: Record<string, MechanismProjectedAnchorV2> = {};
  for (const anchor of prepared.scene.anchors) {
    const source = anchor.source;
    const part =
      source.kind === "part-local"
        ? source.part
        : shapeStates[source.shape]!.ownerPart;
    const point =
      source.kind === "part-local"
        ? source.position
        : shapeStates[source.shape]!.landmarks[source.landmark]!;
    const world = transformPoint(parts[part]!.worldMatrix, point);
    anchors[anchor.id] = {
      ...projectMechanismAnchor(
        anchor.id,
        part,
        world,
        parts[part]!.visible,
        camera,
        request.width,
        request.height,
      ),
      source: MechanismAnchorSourceV2Schema.parse(source),
    };
  }
  const relationships = Object.fromEntries(
    prepared.scene.relationships.map((relationship) => [
      relationship.id,
      evaluateRelationship(relationship, prepared, parts, anchors, rigs),
    ]),
  );
  return freezeDeep(
    MechanismFrameResultV2Schema.parse({
      version: "mechanism-evaluator-2",
      frame: request.frame,
      seed: request.seed ?? prepared.scene.seed,
      camera,
      parts,
      rigs,
      shapeStates,
      anchors,
      relationships,
    }),
  );
}

function evaluateParts(
  prepared: PreparedMechanismSceneV2,
  rigs: Readonly<Record<string, MechanismRigFrameV2>>,
  hidden: readonly string[],
) {
  const parts: Record<string, MechanismPartFrame> = {};
  const hiddenSet = new Set(hidden);
  for (const id of prepared.orderedPartIds) {
    const part = prepared.partsById[id]!;
    const parent = part.parent === undefined ? undefined : parts[part.parent]!;
    const parentWorld = parent?.worldMatrix ?? IDENTITY_MATRIX;
    const base = prepared.baseLocalMatrices[id]!;
    let localMatrix = base,
      worldMatrix = multiplyMatrices(parentWorld, base);
    const rig = Object.hasOwn(prepared.physicalRigsByPart, id)
      ? prepared.physicalRigsByPart[id]
      : undefined;
    if (rig) {
      const value = rigs[rig.id]!;
      const reference = parts[rig.referencePart]!.worldMatrix;
      const neutral =
        rig.type === "hinge"
          ? rig.neutralAngle
          : rig.type === "slider"
            ? rig.neutral
            : rig.range[0] + rig.neutralTooth * rig.pitch;
      const scalar =
        value.type === "hinge"
          ? value.angleRadians
          : value.type === "slider" || value.type === "ratchet"
            ? value.position
            : neutral;
      if (scalar !== neutral) {
        const motion =
          rig.type === "hinge"
            ? rotationAroundAxisV2(rig.axis, scalar - neutral, rig.pivot)
            : translationAlongAxisV2(rig.axis, scalar - neutral);
        worldMatrix = multiplyMatrices(
          multiplyMatrices(
            multiplyMatrices(reference, motion),
            inverseMechanismMatrixV2(reference),
          ),
          worldMatrix,
        );
        localMatrix = multiplyMatrices(
          inverseMechanismMatrixV2(parentWorld),
          worldMatrix,
        );
      }
    }
    parts[id] = {
      id,
      ...(part.parent === undefined ? {} : { parent: part.parent }),
      localMatrix,
      worldMatrix,
      visible: part.visible && !hiddenSet.has(id) && (parent?.visible ?? true),
    };
  }
  return parts;
}

function outsideRange(value: number, range: readonly [number, number]) {
  return Math.max(0, range[0] - value, value - range[1]);
}
function evaluateRelationship(
  relationship: DeepReadonly<MechanismRelationshipV2>,
  prepared: PreparedMechanismSceneV2,
  parts: Readonly<Record<string, MechanismPartFrame>>,
  anchors: Readonly<Record<string, MechanismProjectedAnchorV2>>,
  rigs: Readonly<Record<string, MechanismRigFrameV2>>,
): MechanismRelationshipFrameV2 {
  const pair =
    relationship.type === "engagement"
      ? [relationship.toothDatum, relationship.pawlTip]
      : relationship.anchors;
  const delta = subtract(anchors[pair[1]!]!.world, anchors[pair[0]!]!.world);
  let measured: number[], residual: number;
  let required = true;
  if (relationship.type === "coincident") {
    measured = delta;
    residual = Math.hypot(...delta);
  } else if (relationship.type === "fixed-offset") {
    measured = transformMechanismDirectionV2(
      inverseMechanismMatrixV2(parts[relationship.referencePart]!.worldMatrix),
      delta,
    );
    residual = Math.hypot(
      ...subtract(measured as [number, number, number], relationship.offset),
    );
  } else if (relationship.type === "signed-gap") {
    const local = transformMechanismDirectionV2(
      inverseMechanismMatrixV2(parts[relationship.axisPart]!.worldMatrix),
      delta,
    );
    measured = [dot(local, relationship.axis)];
    residual = outsideRange(measured[0]!, relationship.range);
  } else {
    const rig = prepared.scene.rigs.find((rig) => rig.id === relationship.rig)!;
    const state = rigs[relationship.rig]!;
    if (rig.type !== "ratchet" || state.type !== "ratchet")
      throw new MechanismEvaluationErrorV2(
        "Engagement requires its ratchet pose",
        {
          code: "mechanism-relationship-rig",
          path: ["relationships", relationship.id, "rig"],
        },
      );
    required =
      relationship.requiredAt === "all-frames" || state.phase === "seated";
    const local = transformMechanismDirectionV2(
      inverseMechanismMatrixV2(parts[rig.referencePart]!.worldMatrix),
      delta,
    );
    const gap = subtract(local, scale(rig.axis, -state.toothIndex * rig.pitch));
    const signed = dot(gap, rig.axis);
    measured = gap;
    residual = Math.hypot(
      ...subtract(gap, scale(rig.axis, signed)),
      outsideRange(signed, relationship.clearance),
    );
  }
  return {
    id: relationship.id,
    type: relationship.type,
    measured,
    required,
    residual,
    tolerance: relationship.tolerance,
  };
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
