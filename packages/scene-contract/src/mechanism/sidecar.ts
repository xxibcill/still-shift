import { z } from "zod";
import { MechanismCameraSchema } from "./scene.ts";
import {
  MechanismAssertionsSchema,
  MechanismPartFramesSchema,
  MechanismProjectedAnchorSchema,
  MechanismRigFramesSchema,
} from "./frame.ts";
import {
  checkUniqueIds,
  MECHANISM_LIMITS,
  MechanismFrameSchema,
  MechanismHashSchema,
  MechanismIdSchema,
  mechanismIssue,
} from "./primitives.ts";

const renderedAnchor = MechanismProjectedAnchorSchema.extend({
  visibility: z.enum([
    "visible",
    "occluded",
    "outside-frame",
    "behind-camera",
    "clipped",
    "hidden-part",
  ]),
  visibilityMethod: z.literal("scene-raycast"),
  projectionErrorPixels: z.number().finite().min(0).max(0.5),
}).superRefine((anchor, context) => {
  if (
    (anchor.projectionVisibility === "in-frame" &&
      anchor.visibility !== "visible" &&
      anchor.visibility !== "occluded") ||
    (anchor.projectionVisibility !== "in-frame" &&
      anchor.visibility !== anchor.projectionVisibility)
  )
    mechanismIssue(
      context,
      "mechanism-sidecar-visibility",
      "Raycast visibility must agree with geometric visibility",
      ["visibility"],
    );
});
export const MechanismSidecarSchema = z
  .object({
    schemaVersion: z.literal("mechanism-sidecar-1"),
    sceneId: MechanismIdSchema,
    sceneSha256: MechanismHashSchema,
    geometrySha256: MechanismHashSchema,
    rendererProfile: z.string().min(1).max(128),
    rendererVersion: z.string().min(1).max(128),
    evaluatorVersion: z.literal("mechanism-evaluator-1"),
    width: z.number().int().min(16).max(8192),
    height: z.number().int().min(16).max(8192),
    fps: z.number().int().min(1).max(60),
    frameCount: MechanismFrameSchema.refine((v) => v > 0),
    frames: z
      .array(
        z
          .object({
            frame: MechanismFrameSchema,
            sourceFrame: z
              .number()
              .finite()
              .min(0)
              .max(MECHANISM_LIMITS.frames),
            seed: z.number().int().min(0).max(2_147_483_647),
            shotId: MechanismIdSchema,
            plateSha256: MechanismHashSchema,
            camera: MechanismCameraSchema,
            parts: MechanismPartFramesSchema,
            rigs: MechanismRigFramesSchema,
            assertions: MechanismAssertionsSchema,
            anchors: z.array(renderedAnchor).max(MECHANISM_LIMITS.anchors),
            protectedRegions: z
              .array(
                z
                  .object({
                    id: MechanismIdSchema,
                    bounds: z.tuple([
                      z.number().finite(),
                      z.number().finite(),
                      z.number().finite(),
                      z.number().finite(),
                    ]),
                  })
                  .strict(),
              )
              .max(64)
              .default([]),
          })
          .strict(),
      )
      .max(MECHANISM_LIMITS.frames),
  })
  .strict()
  .superRefine((sidecar, context) => {
    if (sidecar.frames.length !== sidecar.frameCount)
      mechanismIssue(
        context,
        "mechanism-sidecar-clock",
        "Sidecar must cover every output frame",
        ["frames"],
      );
    sidecar.frames.forEach((frame, index) => {
      if (frame.frame !== index)
        mechanismIssue(
          context,
          "mechanism-sidecar-clock",
          "Sidecar frames must be contiguous absolute output ordinals",
          ["frames", index, "frame"],
        );
      checkUniqueIds(
        frame.anchors.map((anchor) => ({ id: anchor.anchor })),
        context,
        ["frames", index, "anchors"],
      );
      checkUniqueIds(frame.protectedRegions, context, [
        "frames",
        index,
        "protectedRegions",
      ]);
      frame.assertions.forEach((assertion, assertionIndex) => {
        if (assertion.frame !== frame.sourceFrame)
          mechanismIssue(
            context,
            "mechanism-sidecar-clock",
            "Assertion frame must equal the evaluated source frame",
            ["frames", index, "assertions", assertionIndex, "frame"],
          );
      });
    });
    if (
      sidecar.frames.reduce((count, frame) => count + frame.anchors.length, 0) >
      MECHANISM_LIMITS.sidecarAnchors
    )
      mechanismIssue(
        context,
        "mechanism-resource-limit",
        "Sidecar anchor metadata exceeds its aggregate budget",
        ["frames"],
      );
  });
export type MechanismSidecar = z.infer<typeof MechanismSidecarSchema>;
