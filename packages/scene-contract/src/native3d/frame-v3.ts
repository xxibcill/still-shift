import { z } from "zod";
import {
  nativeRigFrameFields,
  validateNativeRigSnapshot,
} from "./frame-rig.ts";
export const Native3DSourceKeyV3Schema = z
  .string()
  .regex(/^native3d-source-3:[a-f0-9]{64}:[a-f0-9]{64}$/);
export const NativeFrameSnapshotV3Schema = z
  .object({
    ...nativeRigFrameFields.shape,
    version: z.literal("native3d-frame-3"),
    sourceVersion: z.literal("mechanism-scene-3"),
    sourceKey: Native3DSourceKeyV3Schema,
    frameKey: z
      .string()
      .min(1)
      .max(1048576)
      .startsWith("native3d-frame-key-3:"),
  })
  .strict()
  .superRefine((snapshot, context) =>
    validateNativeRigSnapshot(snapshot, context, 3),
  );
export type NativeFrameSnapshotV3 = z.infer<typeof NativeFrameSnapshotV3Schema>;
