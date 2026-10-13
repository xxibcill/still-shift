import { z } from "zod";
import { compositionNodeJsonSize } from "@still-shift/execution-runtime/export";

export const BLENDER_CAPTURE_LIMITS = Object.freeze({
  jobBytes: 1024 * 1024,
  frames: 2000,
  controls: 64,
  hiddenParts: 128,
  dimension: 4096,
  pixels: 8_388_608,
});
const name = z
  .string()
  .min(1)
  .max(256)
  .refine((s) => !s.includes("\0"));
const number = z.number().finite().min(-1e6).max(1e6);
const limits = BLENDER_CAPTURE_LIMITS;
export const BlenderCaptureJobSchema = z
  .object({
    schemaVersion: z.literal("blender-native-capture-job-1"),
    id: name,
    assetPath: z.string().min(1).max(2048),
    assetSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    collection: name,
    camera: name,
    outputDirectory: z.string().min(1).max(2048),
    width: z.number().int().min(16).max(limits.dimension),
    height: z.number().int().min(16).max(limits.dimension),
    fps: z.number().int().min(1).max(120),
    samples: z.number().int().min(1).max(256).default(32),
    controller: z
      .object({
        object: name,
        properties: z.record(
          name,
          z.object({ min: number, max: number }).strict(),
        ),
      })
      .strict()
      .optional(),
    frames: z
      .array(
        z
          .object({
            sourceFrame: z.number().finite().min(0).max(108000),
            controls: z.record(name, number).default({}),
            hiddenParts: z.array(name).max(limits.hiddenParts).default([]),
          })
          .strict(),
      )
      .min(1)
      .max(limits.frames),
  })
  .strict()
  .superRefine((job, context) => {
    if (job.width * job.height > limits.pixels)
      context.addIssue({
        code: "custom",
        message: "Capture pixel budget exceeded",
        path: ["width"],
      });
    const properties = job.controller?.properties ?? {};
    if (Object.keys(properties).length > limits.controls)
      context.addIssue({
        code: "custom",
        message: "Capture control budget exceeded",
        path: ["controller", "properties"],
      });
    for (const [key, range] of Object.entries(properties))
      if (range.max < range.min)
        context.addIssue({
          code: "custom",
          message: "Control range must be ordered",
          path: ["controller", "properties", key],
        });
    for (const [index, frame] of job.frames.entries()) {
      if (new Set(frame.hiddenParts).size !== frame.hiddenParts.length)
        context.addIssue({
          code: "custom",
          message: "Duplicate hidden part",
          path: ["frames", index, "hiddenParts"],
        });
      for (const [key, value] of Object.entries(frame.controls)) {
        const range = Object.hasOwn(properties, key)
          ? properties[key]
          : undefined;
        if (!range || value < range.min || value > range.max)
          context.addIssue({
            code: "custom",
            message: "Control must name a declared property within its range",
            path: ["frames", index, "controls", key],
          });
      }
      if (
        Object.keys(properties).length &&
        Object.keys(frame.controls).length !== Object.keys(properties).length
      )
        context.addIssue({
          code: "custom",
          message:
            "Every manual frame requires every declared control, independent of previous state",
          path: ["frames", index, "controls"],
        });
    }
  });
export type BlenderCaptureJob = z.infer<typeof BlenderCaptureJobSchema>;
export function parseBlenderCaptureJob(input: unknown): BlenderCaptureJob {
  compositionNodeJsonSize(input, 0, "blender-capture", limits.jobBytes);
  return BlenderCaptureJobSchema.parse(input);
}
