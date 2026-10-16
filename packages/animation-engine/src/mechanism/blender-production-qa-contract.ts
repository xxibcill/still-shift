import { z } from "zod";
import { compositionNodeJsonSize } from "@still-shift/execution-runtime/export";
import { mechanismPackHash } from "./pack-support.ts";
import {
  MechanismIdSchema,
  MechanismHashSchema,
} from "@still-shift/scene-contract";
import { MechanismSemanticRegistrationSchema } from "./production-semantic.ts";
import { MechanismProductionBindingSchema } from "./production-report.ts";
import { MechanismProductionOwnedFileSchema } from "./production-queue-contract.ts";
import { MechanismProductionQAFactsSchema } from "./production-qa-contract.ts";

export const BLENDER_PRODUCTION_QA_LIMITS = {
  planBytes: 65536,
  factsBytes: 8 * 1024 * 1024,
  observationBytes: 2 * 1024 * 1024,
  retainedCapacityBytes: 64 * 1024 * 1024,
  programs: 32,
  measurements: 128,
  comparisons: 100000,
  warningRows: 2048,
} as const;
const name = z.string().min(1).max(128);
const frame = z.number().int().nonnegative().max(1999);
const axis = z.enum(["x", "y", "z"]);
const selector = z.discriminatedUnion("kind", [
  z
    .object({
      measurement: name,
      kind: z.literal("actual-control"),
      control: name,
    })
    .strict(),
  z
    .object({
      measurement: name,
      kind: z.literal("part-origin-drift"),
      part: name,
      referenceFrame: frame,
    })
    .strict(),
  z
    .object({
      measurement: name,
      kind: z.literal("part-matrix-drift"),
      part: name,
      referenceFrame: frame,
    })
    .strict(),
  z
    .object({
      measurement: name,
      kind: z.literal("part-origin-separation"),
      parts: z.tuple([name, name]),
    })
    .strict(),
  z
    .object({
      measurement: name,
      kind: z.literal("part-bounds-span"),
      part: name,
      axis,
    })
    .strict(),
  z
    .object({
      measurement: name,
      kind: z.literal("part-bounds-separation"),
      parts: z.tuple([name, name]),
      axis,
    })
    .strict(),
  z
    .object({
      measurement: name,
      kind: z.literal("part-render-flag"),
      part: name,
    })
    .strict(),
  z
    .object({
      measurement: name,
      kind: z.literal("surface-hash-change"),
      part: name,
      referenceFrame: frame,
    })
    .strict(),
]);
export type BlenderProductionMeasurement = z.infer<typeof selector>;
export function blenderProductionMeasurementUnit(
  s: BlenderProductionMeasurement,
) {
  switch (s.kind) {
    case "actual-control":
      return "control-value";
    case "part-matrix-drift":
      return "matrix-component";
    case "part-render-flag":
    case "surface-hash-change":
      return "boolean";
    default:
      return "native-unit";
  }
}
export const BlenderProductionQAPlanSchema = z
  .object({
    schemaVersion: z.literal("blender-production-qa-plan-1"),
    measurements: z.array(selector).min(1).max(128),
    programs: z
      .array(
        z
          .object({
            id: MechanismIdSchema,
            interval: z
              .object({
                start: frame,
                endExclusive: z.number().int().positive().max(2000),
              })
              .strict(),
            registrations: z
              .array(MechanismSemanticRegistrationSchema)
              .min(1)
              .max(32),
          })
          .strict(),
      )
      .min(1)
      .max(32),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const reject = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    const measurements = new Map(
      plan.measurements.map((s) => [s.measurement, s]),
    );
    if (measurements.size !== plan.measurements.length)
      reject("Native measurement names must be unique");
    if (new Set(plan.programs.map((p) => p.id)).size !== plan.programs.length)
      reject("Native QA program IDs must be unique");
    let work = 0;
    for (const p of plan.programs) {
      if (p.interval.endExclusive <= p.interval.start)
        reject("Native QA interval must be nonempty");
      if (
        new Set(p.registrations.map((r) => r.id)).size !==
        p.registrations.length
      )
        reject("Native registration IDs must be unique within their program");
      for (const r of p.registrations)
        for (const rule of r.rules) {
          const selected = measurements.get(rule.measurement);
          if (
            !selected ||
            rule.unit !== blenderProductionMeasurementUnit(selected)
          )
            reject(
              "Every native rule needs a declared selector with its actual measurement unit",
            );
          work += p.interval.endExclusive - p.interval.start;
        }
    }
    if (work > BLENDER_PRODUCTION_QA_LIMITS.comparisons)
      reject("Native QA comparison budget exceeded before observation reads");
  });
export type BlenderProductionQAPlan = z.infer<
  typeof BlenderProductionQAPlanSchema
>;
export function admitBlenderProductionQAPlan(
  input: unknown,
  frameCount: number,
) {
  compositionNodeJsonSize(input, 0, "", 1024 * 1024);
  const plan = BlenderProductionQAPlanSchema.parse(input);
  if (
    plan.programs.some((p) => p.interval.endExclusive > frameCount) ||
    plan.measurements.some(
      (s) => "referenceFrame" in s && s.referenceFrame >= frameCount,
    )
  )
    throw Error(
      "Native QA intervals and reference frames must fit the actual episode clock",
    );
  return plan;
}
const vector = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
export const BlenderProductionObservationSchema = z
  .object({
    schemaVersion: z.literal("blender-native-observed-frame-1"),
    sourceAssetSha256: MechanismHashSchema,
    actualControls: z.record(name, z.number().finite()),
    parts: z
      .array(
        z
          .object({
            name,
            visible: z.boolean(),
            editorial: z.boolean(),
            vertices: z.number().int().nonnegative(),
            triangles: z.number().int().nonnegative(),
            positionsSha256: MechanismHashSchema,
            triangleIndicesSha256: MechanismHashSchema,
            worldMatrix: z.array(z.number().finite()).length(16),
            worldBounds: z
              .object({ min: vector, max: vector })
              .strict()
              .refine((b) => b.min.every((v, i) => v <= b.max[i]!))
              .nullable(),
          })
          .strict(),
      )
      .max(2048),
  })
  .passthrough()
  .superRefine((o, ctx) => {
    if (new Set(o.parts.map((p) => p.name)).size !== o.parts.length)
      ctx.addIssue({
        code: "custom",
        message: "Observed native part names must be unique",
      });
  });
export type BlenderProductionObservation = z.infer<
  typeof BlenderProductionObservationSchema
>;
export const BlenderProductionQAFactsSchema = z
  .object({
    schemaVersion: z.literal("blender-production-qa-facts-1"),
    binding: MechanismProductionBindingSchema,
    planSha256: MechanismHashSchema,
    source: z
      .object({
        plates: MechanismProductionOwnedFileSchema,
        program: MechanismProductionOwnedFileSchema,
      })
      .strict(),
    semantics: z
      .array(
        z
          .object({
            id: MechanismIdSchema,
            execution: MechanismProductionQAFactsSchema.shape.semantics,
          })
          .strict(),
      )
      .min(1)
      .max(32),
    warnings: z
      .object({
        raw: MechanismProductionOwnedFileSchema,
        rendered: MechanismProductionOwnedFileSchema.optional(),
        grouped: MechanismProductionOwnedFileSchema,
        groups: z.number().int().nonnegative().max(2048),
      })
      .strict(),
    failures: z
      .object({ mechanical: z.number().int().nonnegative().max(100000) })
      .strict(),
    continuousCollision: z.literal("unreviewed"),
    mechanicalAcceptance: z.literal("separate-whole-mechanism-review"),
    qualification: z.string().max(2048),
  })
  .strict()
  .superRefine((facts, ctx) => {
    const reject = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (
      new Set(facts.semantics.map((p) => p.id)).size !== facts.semantics.length
    )
      reject("Native facts require distinct program IDs");
    let comparisons = 0,
      failures = 0;
    for (const { execution: e } of facts.semantics) {
      if (mechanismPackHash(e.binding) !== mechanismPackHash(facts.binding))
        reject("Native semantic binding must equal the current facts binding");
      if (
        e.rawSamples.length !== e.interval.endExclusive - e.interval.start ||
        e.rawSamples.some((s, i) => s.frame !== e.interval.start + i)
      )
        reject("Native facts require ordered complete interval coverage");
      for (const a of e.assertions) {
        failures += a.findings.length;
        if (
          a.checkedSamples !== e.rawSamples.length ||
          !a.completeOutputFrameCoverage ||
          a.status !== (a.findings.length ? "failed" : "passed")
        )
          reject(
            "Native assertion status must agree with its actual samples and findings",
          );
      }
      comparisons += e.comparisons;
    }
    if (comparisons > BLENDER_PRODUCTION_QA_LIMITS.comparisons)
      reject("Native facts exceed the aggregate comparison budget");
    if (failures !== facts.failures.mechanical)
      reject(
        "Native failure count must agree with the located original findings",
      );
  });
