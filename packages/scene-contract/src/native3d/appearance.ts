import { z } from "zod";
import { MechanismHashSchema } from "../mechanism/primitives.ts";

const moduleIdentity = z
  .object({
    name: z
      .string()
      .min(1)
      .max(1024)
      .regex(/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/)
      .refine(
        (name) =>
          name.split("/").every((part) => part !== "." && part !== ".."),
        "Module names must be stable relative identifiers",
      ),
    sha256: MechanismHashSchema,
  })
  .strict();
const modules = z
  .array(moduleIdentity)
  .min(1)
  .max(4096)
  .superRefine((entries, context) => {
    entries.forEach((entry, index) => {
      if (index > 0 && entries[index - 1]!.name >= entry.name)
        context.addIssue({
          code: "custom",
          message: "Source closure names must be unique and lexically sorted",
          path: [index, "name"],
        });
    });
  });
export const NativeAppearanceCodeIdentitySchema = z
  .object({
    runtimeFormat: z.enum(["source-ts", "installed-js"]),
    modules,
    threeRuntime: z
      .object({ version: z.literal("0.186.0"), sources: modules })
      .strict(),
  })
  .strict();
export type NativeAppearanceCodeIdentity = z.infer<
  typeof NativeAppearanceCodeIdentitySchema
>;
