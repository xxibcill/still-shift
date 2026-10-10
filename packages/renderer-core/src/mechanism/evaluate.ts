import { z } from "zod";
import {
  MECHANISM_LIMITS,
  MechanismCameraKeysSchema,
  MechanismCameraSchema,
  MechanismControlsSchema,
  MechanismIdSchema,
} from "@still-shift/scene-contract";
import type {
  MechanismCamera,
  MechanismVector,
} from "@still-shift/scene-contract";
import {
  IDENTITY_MATRIX,
  multiplyMatrices,
  transformPoint,
  translateMatrixX,
} from "./matrix.ts";
import type { MechanismMatrix } from "./matrix.ts";
import { projectMechanismAnchor } from "./projection.ts";
import { MechanismEvaluationError } from "./types.ts";
import type {
  MechanismAssertion,
  MechanismFrameRequest,
  MechanismFrameResult,
  MechanismPartFrame,
  MechanismRigFrame,
  PreparedMechanismScene,
} from "./types.ts";

const FrameRequestSchema = z
  .object({
    frame: z.number().finite().min(0).max(MECHANISM_LIMITS.frames),
    width: z.number().int().min(16).max(8192),
    height: z.number().int().min(16).max(8192),
    camera: MechanismCameraSchema.optional(),
    cameraKeys: MechanismCameraKeysSchema.optional(),
    controls: MechanismControlsSchema.default({}),
    hiddenParts: z
      .array(MechanismIdSchema)
      .max(MECHANISM_LIMITS.parts)
      .default([]),
    seed: z.number().int().min(0).max(2_147_483_647).optional(),
  })
  .strict();

type SampleKey = {
  readonly frame: number;
  readonly easing: "linear" | "smoothstep" | "hold";
};
function keyInterval<T extends SampleKey>(
  keys: readonly T[],
  frame: number,
): { left: T; right: T; fraction: number } {
  if (frame <= keys[0]!.frame)
    return { left: keys[0]!, right: keys[0]!, fraction: 0 };
  const last = keys[keys.length - 1]!;
  if (frame >= last.frame) return { left: last, right: last, fraction: 0 };
  let lower = 0,
    upper = keys.length - 1;
  while (upper - lower > 1) {
    const middle = Math.floor((lower + upper) / 2);
    if (keys[middle]!.frame <= frame) lower = middle;
    else upper = middle;
  }
  const left = keys[lower]!,
    right = keys[upper]!;
  const linear = (frame - left.frame) / (right.frame - left.frame);
  const fraction =
    left.easing === "hold"
      ? 0
      : left.easing === "smoothstep"
        ? linear * linear * (3 - 2 * linear)
        : linear;
  return { left, right, fraction };
}
function interpolate(left: number, right: number, fraction: number): number {
  return left + (right - left) * fraction;
}
function interpolateVector(
  left: readonly number[],
  right: readonly number[],
  fraction: number,
): MechanismVector {
  return left.map((value, axis) =>
    interpolate(value, right[axis]!, fraction),
  ) as MechanismVector;
}

function sampleCamera(
  prepared: PreparedMechanismScene,
  request: z.infer<typeof FrameRequestSchema>,
): MechanismCamera {
  const base = request.camera ?? prepared.scene.camera;
  if (!request.cameraKeys)
    return {
      ...base,
      position: [...base.position],
      target: [...base.target],
      up: [...base.up],
    };
  const { left, right, fraction } = keyInterval(
    request.cameraKeys,
    request.frame,
  );
  return MechanismCameraSchema.parse({
    ...base,
    position: interpolateVector(left.position, right.position, fraction),
    target: interpolateVector(left.target, right.target, fraction),
    up: [...base.up],
    fovDegrees: interpolate(
      left.fovDegrees ?? base.fovDegrees,
      right.fovDegrees ?? base.fovDegrees,
      fraction,
    ),
  });
}

/** Pure random access. Geometry validation and resource inspection happen only in prepare. */
export function evaluateMechanismFrame(
  prepared: PreparedMechanismScene,
  input: MechanismFrameRequest,
): MechanismFrameResult {
  if (prepared.version !== "prepared-mechanism-scene-1")
    throw new MechanismEvaluationError(
      "Unsupported prepared mechanism version",
      { code: "mechanism-version", path: ["version"] },
    );
  const request = FrameRequestSchema.parse(input);
  checkRequestReferences(prepared, request);
  const camera = sampleCamera(prepared, request);
  const localMatrices: Record<string, MechanismMatrix> = {
    ...prepared.baseLocalMatrices,
  };
  const rigs: Record<string, MechanismRigFrame> = {};
  for (const rig of prepared.scene.rigs) {
    const control = request.controls[rig.id];
    const { left, right, fraction } = keyInterval(
      control?.travelKeys ?? rig.travelKeys,
      request.frame,
    );
    const travel =
      control?.travel ?? interpolate(left.value, right.value, fraction);
    const q = rig.thickness * travel;
    const contactMode = control?.contactMode ?? rig.contactMode;
    const rootDelta =
      contactMode === "pull"
        ? rig.contactDatum - q
        : contactMode === "push"
          ? rig.contactDatum + rig.thickness - q
          : 0;
    localMatrices[rig.rootPart] = translateMatrixX(
      prepared.baseLocalMatrices[rig.rootPart]!,
      rootDelta,
    );
    localMatrices[rig.hookPart] = translateMatrixX(
      prepared.baseLocalMatrices[rig.hookPart]!,
      q,
    );
    rigs[rig.id] = {
      id: rig.id,
      q,
      thickness: rig.thickness,
      travel,
      contactMode,
      measurementMode:
        contactMode === "pull"
          ? "outside"
          : contactMode === "push"
            ? "inside"
            : "free",
      selectedContactFace:
        contactMode === "pull"
          ? rig.innerFaceAnchor
          : contactMode === "push"
            ? rig.outerFaceAnchor
            : null,
    };
  }
  const parts = composeParts(
    prepared,
    localMatrices,
    new Set(request.hiddenParts),
  );
  const anchors = Object.fromEntries(
    prepared.scene.anchors.map((anchor) => {
      const part = parts[anchor.part]!;
      const world = transformPoint(part.worldMatrix, anchor.position);
      return [
        anchor.id,
        projectMechanismAnchor(
          anchor.id,
          anchor.part,
          world,
          part.visible,
          camera,
          request.width,
          request.height,
        ),
      ];
    }),
  );
  return {
    version: "mechanism-evaluator-1",
    frame: request.frame,
    seed: request.seed ?? prepared.scene.seed,
    camera,
    parts,
    rigs,
    anchors,
    assertions: assertMechanismState(
      prepared,
      request.frame,
      parts,
      rigs,
      anchors,
    ),
  };
}

function checkRequestReferences(
  prepared: PreparedMechanismScene,
  request: z.infer<typeof FrameRequestSchema>,
) {
  const rigIds = new Set(prepared.scene.rigs.map((rig) => rig.id));
  for (const id of Object.keys(request.controls))
    if (!rigIds.has(id))
      throw new MechanismEvaluationError(`Unknown rig writer ${id}`, {
        code: "mechanism-control-reference",
        path: ["controls", id],
        frame: request.frame,
      });
  for (const id of request.hiddenParts)
    if (!Object.hasOwn(prepared.baseLocalMatrices, id))
      throw new MechanismEvaluationError(`Unknown hidden part ${id}`, {
        code: "mechanism-part-reference",
        path: ["hiddenParts"],
        frame: request.frame,
      });
}
function composeParts(
  prepared: PreparedMechanismScene,
  localMatrices: Record<string, MechanismMatrix>,
  hidden: ReadonlySet<string>,
): Record<string, MechanismPartFrame> {
  const definitions = new Map(
    prepared.scene.parts.map((part) => [part.id, part]),
  );
  const parts: Record<string, MechanismPartFrame> = {};
  for (const id of prepared.orderedPartIds) {
    const definition = definitions.get(id)!;
    const parent =
      definition.parent === undefined ? undefined : parts[definition.parent]!;
    const localMatrix = localMatrices[id]!;
    parts[id] = {
      id,
      ...(definition.parent === undefined ? {} : { parent: definition.parent }),
      localMatrix,
      worldMatrix: parent
        ? multiplyMatrices(parent.worldMatrix, localMatrix)
        : localMatrix,
      visible:
        definition.visible && !hidden.has(id) && (parent?.visible ?? true),
    };
  }
  return parts;
}

function assertMechanismState(
  prepared: PreparedMechanismScene,
  frame: number,
  parts: Readonly<Record<string, MechanismPartFrame>>,
  rigs: Readonly<Record<string, MechanismRigFrame>>,
  anchors: MechanismFrameResult["anchors"],
): MechanismAssertion[] {
  const assertions: MechanismAssertion[] = [];
  function add(
    rigId: string,
    id: string,
    code: MechanismAssertion["code"],
    partIds: readonly string[],
    property: string,
    measured: number,
    expected: number,
    tolerance = 1e-8,
  ) {
    assertions.push({
      id,
      code,
      rigId,
      partIds,
      property,
      frame,
      measured,
      expected,
      tolerance,
      passed:
        Number.isFinite(measured) && Math.abs(measured - expected) <= tolerance,
    });
  }
  for (const rig of prepared.scene.rigs) {
    const state = rigs[rig.id]!;
    add(
      rig.id,
      `${rig.id}.travel`,
      "mechanism-travel-range",
      [rig.hookPart],
      "q",
      Math.max(0, -state.q, state.q - rig.thickness),
      0,
    );
    add(
      rig.id,
      `${rig.id}.thickness`,
      "mechanism-travel-thickness",
      [rig.hookPart],
      "hookTravel",
      state.thickness,
      prepared.scene.geometry.dimensions.hookTravel,
    );
    if (state.selectedContactFace !== null) {
      const face = prepared.scene.anchors.find(
        (anchor) => anchor.id === state.selectedContactFace,
      )!;
      const root = parts[rig.rootPart]!;
      const authoredRootWorld = multiplyMatrices(
        root.parent === undefined
          ? IDENTITY_MATRIX
          : parts[root.parent]!.worldMatrix,
        prepared.baseLocalMatrices[rig.rootPart]!,
      );
      const hook = prepared.scene.parts.find(
        (part) => part.id === rig.hookPart,
      )!;
      // Datum is defined in the authored root's local +X system, independently of q.
      const expected = transformPoint(authoredRootWorld, [
        rig.contactDatum,
        hook.transform.position[1] + face.position[1],
        hook.transform.position[2] + face.position[2],
      ]);
      const actual = anchors[state.selectedContactFace]!.world;
      add(
        rig.id,
        `${rig.id}.contact`,
        "mechanism-contact",
        [rig.rootPart, rig.hookPart],
        state.selectedContactFace,
        distance(actual, expected),
        0,
      );
    }
    const expectedBladeWorld = multiplyMatrices(
      parts[rig.rootPart]!.worldMatrix,
      prepared.baseLocalMatrices[rig.bladePart]!,
    );
    for (const id of rig.rivetMeshIds) {
      const mesh = prepared.scene.geometry.meshes.find(
        (mesh) => mesh.id === id,
      )!;
      const center = interpolateVector(mesh.bounds.min, mesh.bounds.max, 0.5);
      const actual = transformPoint(parts[mesh.partId]!.worldMatrix, center);
      const expected = transformPoint(expectedBladeWorld, center);
      add(
        rig.id,
        `${rig.id}.${id}.fixed`,
        "mechanism-fixed-rivet",
        [rig.bladePart],
        id,
        distance(actual, expected),
        0,
      );
    }
  }
  return assertions;
}
function distance(left: readonly number[], right: readonly number[]) {
  return Math.hypot(
    left[0]! - right[0]!,
    left[1]! - right[1]!,
    left[2]! - right[2]!,
  );
}
