import { z } from "zod";
import { NativeFrameSnapshotSchema } from "./frame.ts";
import {
  NativeFrameSnapshotV2Schema,
  NativeScreenAnchorV2Schema,
} from "./frame-rig.ts";
import { NativeFrameSnapshotV3Schema } from "./frame-v3.ts";
export { NativeFrameSnapshotV2Schema, NativeScreenAnchorV2Schema };
export const NativeFrameSnapshotVersionsSchema = z.union([
  NativeFrameSnapshotSchema,
  NativeFrameSnapshotV2Schema,
  NativeFrameSnapshotV3Schema,
]);
export type NativeFrameSnapshotV2 = z.infer<typeof NativeFrameSnapshotV2Schema>;
export type NativeFrameSnapshotVersions = z.infer<
  typeof NativeFrameSnapshotVersionsSchema
>;
export type NativeScreenAnchorV2 = z.infer<typeof NativeScreenAnchorV2Schema>;
