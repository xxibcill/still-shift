import { z } from "zod";

export const MECHANISM_LIMITS = {
  parts: 128,
  vertices: 100_000,
  triangles: 200_000,
  anchors: 64,
  materials: 32,
  rigs: 8,
  shadowLights: 2,
  shadowMapSize: 2048,
  shots: 64,
  dependencies: 500,
  frames: 108_000,
  keys: 2000,
  sidecarAnchors: 131_072,
} as const;
export const MechanismIdSchema = z
  .string()
  .regex(/^[A-Za-z][\w.-]*$/)
  .max(128);
export const MechanismHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const MechanismNumberSchema = z
  .number()
  .finite()
  .min(-1_000_000)
  .max(1_000_000);
export const MechanismVectorSchema = z.tuple([
  MechanismNumberSchema,
  MechanismNumberSchema,
  MechanismNumberSchema,
]);
export const MechanismPixelSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
]);
export const MechanismFrameSchema = z
  .number()
  .finite()
  .int()
  .min(0)
  .max(MECHANISM_LIMITS.frames);
export const MechanismIntervalSchema = z
  .object({
    startFrame: MechanismFrameSchema,
    endFrameExclusive: MechanismFrameSchema,
  })
  .strict()
  .refine((v) => v.endFrameExclusive > v.startFrame, {
    message: "A frame interval must have a positive half-open duration",
  });
export type MechanismVector = z.infer<typeof MechanismVectorSchema>;

export function mechanismIssue(
  context: z.RefinementCtx,
  code: string,
  message: string,
  path: (string | number)[] = [],
) {
  context.addIssue({
    code: "custom",
    message,
    path,
    params: { diagnosticCode: code },
  });
}
export function checkUniqueIds(
  items: readonly { id: string }[],
  context: z.RefinementCtx,
  path: (string | number)[],
) {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id))
      mechanismIssue(
        context,
        "mechanism-id-duplicate",
        `Duplicate id ${item.id}`,
        [...path, index, "id"],
      );
    seen.add(item.id);
  });
}
