import { z } from "zod";

export const MechanismProductionSubmissionKindSchema = z.enum([
  "initial",
  "retry",
  "planned-edit",
  "repair",
  "manual-recovery",
  "recovery",
  "unknown",
]);
export const MechanismProductionAttemptProvenanceSchema = z
  .object({
    kind: MechanismProductionSubmissionKindSchema,
    reason: z.string().trim().min(1).max(512),
    failureOrigin: z.enum(["transient", "authored", "unknown"]).optional(),
  })
  .strict();
export type MechanismProductionAttemptProvenance = z.infer<
  typeof MechanismProductionAttemptProvenanceSchema
>;
export const MechanismProductionRevisionChangeSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/),
    kind: z.enum(["planned-edit", "repair", "manual-recovery"]),
    reason: z.string().trim().min(1).max(512),
  })
  .strict();

export const MechanismProductionInterventionSchema = z
  .object({
    afterAttempt: z.number().int().min(1).max(96),
    kind: z.enum([
      "planned-edit",
      "repair",
      "manual-recovery",
      "recovery",
      "unknown",
    ]),
    reason: z.string().trim().min(1).max(512),
  })
  .strict();
export type MechanismProductionIntervention = z.infer<
  typeof MechanismProductionInterventionSchema
>;

type Attempt = {
  status: "running" | "passed" | "failed" | "cancelled" | "interrupted";
  provenance?: MechanismProductionAttemptProvenance | undefined;
};
/** Classify the original submitted job; a later planned edit starts new work. */
export function mechanismProductionFirstPass(
  attempts: readonly Attempt[],
  interventions: readonly MechanismProductionIntervention[] = [],
): "pending" | "passed" | "failed" | "unverified" {
  const first = attempts[0];
  if (!first || first.status === "running") return "pending";
  if (first.status !== "passed") return "failed";
  if (first.provenance?.kind !== "initial") return "unverified";
  const classify = (kind: string | undefined) =>
    kind === "planned-edit"
      ? ("passed" as const)
      : ["repair", "retry", "manual-recovery", "recovery"].includes(kind ?? "")
        ? ("failed" as const)
        : ("unverified" as const);
  for (const [index, attempt] of attempts.entries()) {
    if (index > 0) return classify(attempt.provenance?.kind);
    const intervention = interventions.find(
      (event) => event.afterAttempt === index + 1,
    );
    if (intervention) return classify(intervention.kind);
  }
  return "passed";
}
