import { z } from "zod";
import { MechanismMatrixSchema } from "../mechanism/frame.ts";
import {
  MECHANISM_LIMITS,
  MechanismHashSchema,
  MechanismIdSchema,
} from "../mechanism/primitives.ts";
import { mechanismIdRecordV2 } from "../mechanism/records-v2.ts";
import { Native3DSourceKeyV3Schema } from "./frame-v3.ts";
import {
  NativeObservedFrameSchema,
  NativeObservedAnchorSchema,
} from "./observation.ts";

export const NATIVE3D_PBR_FRAME_FINALIZER_VERSION =
  "native3d-used-pbr-frame-finalizer-3" as const;
export const NATIVE3D_PBR_PRECISION_POLICY =
  "native3d-rigid-pbr-float32-1" as const;
const boundedCount = z.number().int().min(0).max(100_000_000);
const error = z.number().finite().min(0).max(0.0001);
const mip = z
  .object({
    level: z.number().int().min(0).max(12),
    width: z.number().int().min(1).max(4096),
    height: z.number().int().min(1).max(4096),
    storage: z.enum(["srgb8-alpha8", "rgba8"]),
    texels: boundedCount,
    samples: boundedCount,
    maxError: error,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.texels !== value.width * value.height ||
      value.samples !== value.texels * 4
    )
      context.addIssue({
        code: "custom",
        message: "Mip receipt covers every texel channel",
      });
  });
export const NativeObservedPbrTextureSchema = z
  .object({
    image: MechanismIdSchema,
    pixelSha256: MechanismHashSchema,
    colorSpace: z.enum(["srgb", "linear"]),
    samples: boundedCount,
    maxError: error,
    reference: z.literal("native-pbr-current-environment-mips-1"),
    levels: z.array(mip).min(1).max(13),
  })
  .strict()
  .superRefine((value, context) => {
    let samples = 0,
      maximum = 0;
    value.levels.forEach((entry, index) => {
      const previous = value.levels[index - 1];
      if (
        entry.level !== index ||
        entry.storage !==
          (value.colorSpace === "srgb" ? "srgb8-alpha8" : "rgba8") ||
        (previous &&
          ((previous.width === 1 && previous.height === 1) ||
            entry.width !== Math.max(1, Math.floor(previous.width / 2)) ||
            entry.height !== Math.max(1, Math.floor(previous.height / 2))))
      )
        context.addIssue({
          code: "custom",
          message: "Mip receipt has an invalid extent, storage or order",
          path: ["levels", index],
        });
      samples += entry.samples;
      maximum = Math.max(maximum, entry.maxError);
    });
    if (samples !== value.samples || maximum !== value.maxError)
      context.addIssue({
        code: "custom",
        message: "Texture totals must match the used mip receipts",
      });
  });
const submission = z
  .object({
    groupIndex: z.number().int().min(0).max(31),
    drawOrdinal: z.number().int().min(0).max(4095),
    start: z
      .number()
      .int()
      .min(0)
      .max(MECHANISM_LIMITS.triangles * 3),
    count: z
      .number()
      .int()
      .positive()
      .max(MECHANISM_LIMITS.triangles * 3),
    material: MechanismIdSchema,
    materialSha256: MechanismHashSchema,
    mode: z.literal(4),
    type: z.union([z.literal(5123), z.literal(5125)]),
    byteOffset: boundedCount,
    modelViewMatrix: MechanismMatrixSchema,
    projectionMatrix: MechanismMatrixSchema,
    normalMatrix: z.array(z.number().finite()).length(9),
    vertexHashes: z
      .object({
        position: MechanismHashSchema,
        normal: MechanismHashSchema,
        indices: MechanismHashSchema,
        uv: MechanismHashSchema.optional(),
        tangent: MechanismHashSchema.optional(),
      })
      .strict(),
    shaderSha256: MechanismHashSchema,
    textures: z.array(NativeObservedPbrTextureSchema).max(3),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.count % 3 ||
      value.byteOffset !== value.start * (value.type === 5125 ? 4 : 2)
    )
      context.addIssue({
        code: "custom",
        message: "Indexed PBR range must match its byte offset",
      });
  });
const meshCommon = {
  part: MechanismIdSchema,
  ownerWorldMatrix: MechanismMatrixSchema,
};
export const NativeObservedPbrMeshSchema = z.discriminatedUnion("status", [
  z
    .object({
      ...meshCommon,
      status: z.literal("drawn"),
      submissions: z.array(submission).min(1).max(32),
    })
    .strict(),
  z
    .object({
      ...meshCommon,
      status: z.literal("not-drawn"),
      reason: z.enum(["authored-hidden", "outside-frustum"]),
    })
    .strict(),
]);
const anchor = NativeObservedAnchorSchema.extend({
  visibilityMethod: z.literal("three-physical-used-pbr-mesh-segment-3"),
}).superRefine((value, context) => {
  if (
    (value.visibility === "occluded") !== (value.occluderMesh !== undefined) ||
    (value.visibility === "behind-camera" && value.pixel !== null) ||
    (["visible", "occluded", "outside-frame"].includes(value.visibility) &&
      value.pixel === null)
  )
    context.addIssue({
      code: "custom",
      message:
        "Observed anchor visibility must carry its projection and occluder witness",
    });
});
/** Explicit source3 protocol. The original frame1/frame2 and output2 parsers stay strict. */
export const NativeObservedFrameV3Schema = z
  .object({
    version: z.literal("native3d-observed-frame-3"),
    sourceVersion: z.literal("mechanism-scene-3"),
    finalizerVersion: z.literal(NATIVE3D_PBR_FRAME_FINALIZER_VERSION),
    precisionPolicy: z.literal(NATIVE3D_PBR_PRECISION_POLICY),
    sourceKey: Native3DSourceKeyV3Schema,
    frameKeySha256: MechanismHashSchema,
    controller: NativeObservedFrameSchema.shape.controller,
    scope: NativeObservedFrameSchema.shape.scope,
    sourceFrame: NativeObservedFrameSchema.shape.sourceFrame,
    scopeFrame: NativeObservedFrameSchema.shape.scopeFrame,
    sourceSha256: MechanismHashSchema,
    effectiveSceneSha256: MechanismHashSchema,
    geometrySha256: MechanismHashSchema,
    appearanceCodeSha256: MechanismHashSchema,
    viewport: NativeObservedFrameSchema.shape.viewport,
    camera: NativeObservedFrameSchema.shape.camera,
    parts: NativeObservedFrameSchema.shape.parts,
    anchors: mechanismIdRecordV2(anchor, MECHANISM_LIMITS.anchors),
    meshes: mechanismIdRecordV2(
      NativeObservedPbrMeshSchema,
      MECHANISM_LIMITS.parts,
    ),
    pass: NativeObservedFrameSchema.shape.pass,
  })
  .strict()
  .superRefine((frame, context) => {
    // Reuse the original hierarchy, viewport and anchor/part invariants without widening that parser.
    const legacy = NativeObservedFrameSchema.safeParse({
      version: "native3d-observed-frame-1",
      frameKey: "validation-only",
      controller: frame.controller,
      scope: frame.scope,
      sourceFrame: frame.sourceFrame,
      scopeFrame: frame.scopeFrame,
      sourceSha256: frame.sourceSha256,
      effectiveSceneSha256: frame.effectiveSceneSha256,
      geometrySha256: frame.geometrySha256,
      appearanceCodeSha256: frame.appearanceCodeSha256,
      viewport: frame.viewport,
      camera: frame.camera,
      parts: frame.parts,
      anchors: Object.fromEntries(
        Object.entries(frame.anchors).map(([id, value]) => [
          id,
          { ...value, visibilityMethod: "three-physical-mesh-segment" },
        ]),
      ),
      pass: frame.pass,
    });
    if (!legacy.success)
      for (const issue of legacy.error.issues)
        context.addIssue({ ...issue, code: "custom" });
    const ordinals: number[] = [];
    let triangles = 0;
    for (const [id, mesh] of Object.entries(frame.meshes)) {
      if (!Object.hasOwn(frame.parts, mesh.part))
        context.addIssue({
          code: "custom",
          message: "Observed mesh references an observed part",
          path: ["meshes", id, "part"],
        });
      if (mesh.status !== "drawn") continue;
      const groups = new Set<number>();
      for (const draw of mesh.submissions) {
        if (groups.has(draw.groupIndex))
          context.addIssue({
            code: "custom",
            message: "Each mesh group is submitted once",
            path: ["meshes", id],
          });
        groups.add(draw.groupIndex);
        ordinals.push(draw.drawOrdinal);
        triangles += draw.count / 3;
      }
    }
    if (
      ordinals.sort((a, b) => a - b).some((value, index) => value !== index) ||
      frame.pass.calls < ordinals.length ||
      frame.pass.triangles < triangles
    )
      context.addIssue({
        code: "custom",
        message:
          "Draw coverage has contiguous ordinals and sufficient pass counters",
        path: ["meshes"],
      });
    for (const [id, value] of Object.entries(frame.anchors))
      if (
        value.occluderMesh !== undefined &&
        (!Object.hasOwn(frame.meshes, value.occluderMesh) ||
          frame.meshes[value.occluderMesh]!.status !== "drawn")
      )
        context.addIssue({
          code: "custom",
          message: "Occlusion requires a used physical mesh",
          path: ["anchors", id, "occluderMesh"],
        });
  });
export type NativeObservedFrameV3 = z.infer<typeof NativeObservedFrameV3Schema>;
export type NativeObservedPbrMesh = z.infer<typeof NativeObservedPbrMeshSchema>;
