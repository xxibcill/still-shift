import { z } from "zod";
import {
  MECHANISM_LIMITS,
  MechanismHashSchema,
  MechanismIdSchema,
  mechanismIssue,
} from "../mechanism/primitives.ts";
import {
  MechanismFrameResultV2Schema,
  MechanismProjectedAnchorV2Schema,
} from "../mechanism/frame-v2.ts";
import { mechanismIdRecordV2 } from "../mechanism/records-v2.ts";
import { Native3DSourceKeySchema } from "./frame.ts";

/** Expected posed geometry. Independent used-GPU evidence has its own DTO. */
export const NativeScreenAnchorV2Schema =
  MechanismProjectedAnchorV2Schema.extend({
    visibility: z.enum([
      "visible",
      "occluded",
      "outside-frame",
      "behind-camera",
      "clipped",
      "hidden-part",
    ]),
    visibilityMethod: z.literal("native-expected-posed-mesh-segment-2"),
    occluderMesh: MechanismIdSchema.optional(),
  }).strict();

export const nativeRigFrameFields = z
  .object({
    version: z.literal("native3d-frame-2"),
    sourceVersion: z.literal("mechanism-scene-2"),
    controller: MechanismIdSchema,
    scope: z.string().min(1).max(2048),
    asset: MechanismIdSchema,
    sourceKey: Native3DSourceKeySchema,
    scopeFrame: z.number().finite(),
    sourceFrame: z.number().finite().min(0).max(MECHANISM_LIMITS.frames),
    viewport: z
      .object({
        width: z.number().int().min(16).max(8192),
        height: z.number().int().min(16).max(8192),
      })
      .strict(),
    sourceSha256: MechanismHashSchema,
    effectiveSceneSha256: MechanismHashSchema,
    geometrySha256: MechanismHashSchema,
    frameKey: z
      .string()
      .min(1)
      .max(1_048_576)
      .startsWith("native3d-frame-key-2:"),
    frame: MechanismFrameResultV2Schema,
    localVisibility: mechanismIdRecordV2(z.boolean(), MECHANISM_LIMITS.parts),
    anchors: mechanismIdRecordV2(
      NativeScreenAnchorV2Schema,
      MECHANISM_LIMITS.anchors,
    ),
  })
  .strict();
export const NativeFrameSnapshotV2Schema = nativeRigFrameFields.superRefine(
  (snapshot, context) => validateNativeRigSnapshot(snapshot, context, 1),
);

export function validateNativeRigSnapshot(
  snapshot: Omit<
    z.infer<typeof nativeRigFrameFields>,
    "version" | "sourceVersion"
  >,
  context: z.RefinementCtx,
  keyVersion: 1 | 3,
) {
  const issue = (message: string, path: (string | number)[]) =>
    mechanismIssue(context, "comp-native3d-frame", message, path);
  if (
    snapshot.sourceKey !==
    `native3d-source-${keyVersion}:${snapshot.sourceSha256.slice(7)}:${snapshot.effectiveSceneSha256.slice(7)}`
  )
    issue(
      "Source key must agree with original and effective source identities",
      ["sourceKey"],
    );
  if (snapshot.sourceFrame !== snapshot.frame.frame)
    issue("Source frame must agree with the posed sample", ["sourceFrame"]);
  for (const [actual, expected, field] of [
    [snapshot.localVisibility, snapshot.frame.parts, "localVisibility"],
    [snapshot.anchors, snapshot.frame.anchors, "anchors"],
  ] as const) {
    if (
      Object.keys(actual).length !== Object.keys(expected).length ||
      Object.keys(expected).some((id) => !Object.hasOwn(actual, id))
    )
      issue("Snapshot must include exactly the posed frame inventory", [field]);
  }
  for (const [id, anchor] of Object.entries(snapshot.anchors)) {
    const expected = snapshot.frame.anchors[id];
    if (
      !expected ||
      anchor.anchor !== id ||
      anchor.part !== expected.part ||
      JSON.stringify(anchor.source) !== JSON.stringify(expected.source) ||
      JSON.stringify(anchor.world) !== JSON.stringify(expected.world) ||
      JSON.stringify(anchor.pixel) !== JSON.stringify(expected.pixel) ||
      anchor.depth !== expected.depth ||
      anchor.projectionVisibility !== expected.projectionVisibility
    )
      issue("Screen anchor must retain its posed frame association", [
        "anchors",
        id,
      ]);
    if (
      (anchor.projectionVisibility === "in-frame"
        ? anchor.visibility !== "visible" && anchor.visibility !== "occluded"
        : anchor.visibility !== anchor.projectionVisibility) ||
      (anchor.visibility === "occluded") !== (anchor.occluderMesh !== undefined)
    )
      issue("Visibility and occluder must agree with the projected anchor", [
        "anchors",
        id,
        "visibility",
      ]);
  }
  if (snapshot.viewport.width * snapshot.viewport.height > 8_388_608)
    issue("Native pass pixel budget exceeded", ["viewport"]);
}
