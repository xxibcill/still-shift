import { compositionNodeJsonSize } from "@still-shift/execution-runtime/export";
import { z } from "zod";
import {
  AnimationEngineError,
  sanitizeDiagnosticText,
  MechanismPackReferenceSchema,
} from "@still-shift/scene-contract";
import { MechanismPackInvariantError } from "./pack-invariant.ts";

export const MechanismProductionFindingSchema = z
  .object({
    code: z.string().min(1).max(128),
    message: z.string().max(1024),
    path: z
      .array(z.union([z.string().max(128), z.number().int().finite()]))
      .max(64),
    frame: z.number().finite().optional(),
    interval: z
      .object({
        startFrame: z.number().finite(),
        endFrameExclusive: z.number().finite(),
      })
      .strict()
      .optional(),
    rig: z.string().max(128).optional(),
    parts: z.array(z.string().max(128)).max(128).optional(),
    relationship: z.string().max(128).optional(),
    pack: MechanismPackReferenceSchema.optional(),
  })
  .strict();
export type MechanismProductionFinding = z.infer<
  typeof MechanismProductionFindingSchema
>;

/** Keep trusted invariant locations through bounded engine-error wrappers. */
export function mechanismProductionFailureFinding(
  error: unknown,
): MechanismProductionFinding | undefined {
  const seen = new Set<unknown>();
  for (let depth = 0; depth < 8 && error && !seen.has(error); depth++) {
    seen.add(error);
    if (error instanceof MechanismPackInvariantError) {
      const location = Object.getOwnPropertyDescriptor(
        error,
        "location",
      )?.value;
      const message = Object.getOwnPropertyDescriptor(error, "message")?.value;
      if (typeof message !== "string" || !location) return undefined;
      try {
        compositionNodeJsonSize(location, 0, "", 32 * 1024);
        const parsed = MechanismProductionFindingSchema.safeParse({
          ...location,
          message: sanitizeDiagnosticText(message),
        });
        return parsed.success ? parsed.data : undefined;
      } catch {
        return undefined;
      }
    }
    if (!(error instanceof AnimationEngineError)) return undefined;
    error = Object.getOwnPropertyDescriptor(error, "cause")?.value;
  }
  return undefined;
}
