import { z } from "zod";
import { NATIVE3D_OBSERVATION_LIMITS } from "./observation.ts";
import {
  NativeObservedFrameVersionsSchema,
  NativeObservedSampleV2Schema,
  NativeObservedOutputFrameV2Schema,
} from "./observation-v2.ts";
import { NativeObservedFrameV3Schema } from "./observation-v3.ts";

/** The explicit output3 envelope does not widen original frame/output parsers. */
export const NativeObservedFrameVersionsV3Schema = z.union([
  NativeObservedFrameVersionsSchema,
  NativeObservedFrameV3Schema,
]);
export const NativeObservedSampleV3Schema = z
  .object({
    sampleIndex: NativeObservedSampleV2Schema.shape.sampleIndex,
    sampleFrame: NativeObservedSampleV2Schema.shape.sampleFrame,
    observed: NativeObservedFrameVersionsV3Schema,
  })
  .strict();
export const NativeObservedOutputFrameV3Schema = z
  .object({
    version: z.literal("native3d-observed-output-frame-3"),
    outputFrame: NativeObservedOutputFrameV2Schema.shape.outputFrame,
    executionSha256: NativeObservedOutputFrameV2Schema.shape.executionSha256,
    passes: z
      .array(NativeObservedSampleV3Schema)
      .max(NATIVE3D_OBSERVATION_LIMITS.passes),
  })
  .strict()
  .superRefine((packet, context) => {
    packet.passes.forEach((pass, index) => {
      if (pass.sampleIndex !== index)
        context.addIssue({
          code: "custom",
          message: "Observed passes retain contiguous invocation order",
          path: ["passes", index, "sampleIndex"],
        });
    });
  });
export type NativeObservedFrameVersionsV3 = z.infer<
  typeof NativeObservedFrameVersionsV3Schema
>;
export type NativeObservedSampleV3 = z.infer<
  typeof NativeObservedSampleV3Schema
>;
export type NativeObservedOutputFrameV3 = z.infer<
  typeof NativeObservedOutputFrameV3Schema
>;
