import { z } from "zod";

const path = z
  .string()
  .regex(
    /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.[a-zA-Z0-9]+$/,
    "Expected a portable relative file path",
  );
export const StoryWorkspaceManifestSchema = z
  .object({
    schemaVersion: z.literal("story-workspace-package-1"),
    plan: path,
    narration: path.optional(),
    files: z
      .array(
        z
          .object({
            path,
            kind: z.enum(["plan", "template", "asset", "font", "narration"]),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            bytes: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1)
      .max(10000),
  })
  .strict()
  .superRefine((manifest, context) => {
    const paths = new Set<string>();
    for (const file of manifest.files) {
      const key = file.path.toLowerCase();
      if (paths.has(key))
        context.addIssue({
          code: "custom",
          message: "Duplicate workspace path: " + file.path,
        });
      paths.add(key);
    }
  });

export type StoryWorkspaceManifest = z.infer<
  typeof StoryWorkspaceManifestSchema
>;
export type StoryWorkspaceFile = StoryWorkspaceManifest["files"][number];
export function isStoryWorkspacePackage(input: unknown) {
  return Boolean(
    input &&
      typeof input === "object" &&
      "schemaVersion" in input &&
      input.schemaVersion === "story-workspace-package-1",
  );
}
