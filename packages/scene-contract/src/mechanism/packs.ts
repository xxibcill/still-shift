import { z } from "zod";
import { MechanismHashSchema, MechanismIdSchema } from "./primitives.ts";

/** Hash identifies the immutable pack document, not a self-hash field. */
export const MechanismPackReferenceSchema = z
  .object({
    id: MechanismIdSchema,
    version: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/)
      .max(64),
    sha256: MechanismHashSchema,
    variant: MechanismIdSchema,
    detail: MechanismIdSchema,
  })
  .strict();

export type MechanismPackReference = z.infer<
  typeof MechanismPackReferenceSchema
>;
