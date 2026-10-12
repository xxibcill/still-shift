import { z } from "zod";
import { mechanismPackHash } from "./pack-support.ts";
import {
  MechanismHashSchema,
  MechanismIdSchema,
} from "@still-shift/scene-contract";
import { MechanismSemanticRegistrationSchema } from "./production-semantic.ts";
import { MechanismProductionBindingSchema } from "./production-report.ts";
import { MechanismProductionOwnedFileSchema } from "./production-queue-contract.ts";
export const MECHANISM_PRODUCTION_QA_LIMITS = {
  planBytes: 65536,
  factsBytes: 8 * 1024 * 1024,
  retainedCapacityBytes: 64 * 1024 * 1024,
  qualityLayerFrames: 100000,
  qualityCapacityBytes: 256 * 1024 * 1024,
  warningRows: 2048,
} as const;
const measurement = z.string().min(1).max(128);
const selector = z.discriminatedUnion("kind", [
  z
    .object({
      measurement,
      kind: z.literal("part-matrix-change"),
      part: MechanismIdSchema,
    })
    .strict(),
  z
    .object({
      measurement,
      kind: z.literal("part-origin-distance"),
      part: MechanismIdSchema,
    })
    .strict(),
  z
    .object({
      measurement,
      kind: z.literal("anchor-separation"),
      anchors: z.tuple([MechanismIdSchema, MechanismIdSchema]),
    })
    .strict(),
]);
export const MechanismProductionQAPlanSchema = z
  .object({
    schemaVersion: z.literal("mechanism-production-qa-plan-1"),
    registrations: z.array(MechanismSemanticRegistrationSchema).max(31),
    measurements: z.array(selector).max(127),
    warningBindings: z
      .array(
        z
          .object({
            layer: z.string().min(1).max(1024),
            controllingRig: MechanismIdSchema,
            parts: z.array(MechanismIdSchema).max(128),
          })
          .strict(),
      )
      .max(128),
  })
  .strict();
export const MechanismProductionQAProgramSchema = z
  .object({
    schemaVersion: z.literal("mechanism-production-qa-program-1"),
    plan: MechanismProductionQAPlanSchema,
    planSha256: MechanismHashSchema,
    registrySha256: MechanismHashSchema,
    registrations: z.array(MechanismSemanticRegistrationSchema).min(1).max(32),
    measurements: z.array(selector).min(1).max(128),
  })
  .strict()
  .superRefine((program, ctx) => {
    if (
      mechanismPackHash(program.plan) !== program.planSha256 ||
      mechanismPackHash(program.registrations) !== program.registrySha256
    )
      ctx.addIssue({
        code: "custom",
        message: "Retained QA program hashes must match its actual definitions",
      });
  });
export type MechanismProductionQAPlan = z.infer<
  typeof MechanismProductionQAPlanSchema
>;
export type MechanismProductionMeasurement = z.infer<typeof selector>;
const status = z.enum(["passed", "failed", "unreviewed"]);
const interval = z
  .object({
    start: z.number().int().nonnegative(),
    endExclusive: z.number().int().positive(),
  })
  .strict();
const artifact = z
  .object({ path: z.string().min(1).max(2048), sha256: MechanismHashSchema })
  .strict();
const nullableLabel = z.string().max(128).nullable();
const finding = z
  .object({
    code: z.string().max(128),
    assertion: z.string().max(128),
    frame: z.number().nonnegative().nullable(),
    rig: nullableLabel,
    parts: z.array(z.string().max(128)).max(128),
    relationship: nullableLabel,
    measurement: nullableLabel,
    measured: z.number().finite().nullable(),
    expectedRange: z
      .tuple([z.number().finite(), z.number().finite()])
      .nullable(),
    unit: z.string().max(32).nullable(),
    sampleIndex: z.number().int().nonnegative().nullable(),
  })
  .strict();
export const MechanismProductionQAFactsSchema = z
  .object({
    schemaVersion: z.literal("mechanism-production-qa-facts-1"),
    binding: MechanismProductionBindingSchema,
    planSha256: MechanismHashSchema,
    source: z
      .object({
        cueProjectHash: MechanismHashSchema,
        sourceSceneSha256: MechanismHashSchema,
        nativeCapture: MechanismProductionOwnedFileSchema,
        program: MechanismProductionOwnedFileSchema,
      })
      .strict(),
    timeline: z
      .object({
        method: z.literal(
          "current-cue-compiler-expected-state-output-frames-and-exact-event-boundaries",
        ),
        evidence: z.literal("pure-expected-state"),
        sourceSha256: MechanismHashSchema,
        timelineSha256: MechanismHashSchema,
        checkedOutputFrames: z.number().int().positive(),
        checkedEventFrames: z.number().int().nonnegative(),
        status: z.literal("passed"),
        collisionMethod: z.literal("not-evaluated"),
      })
      .strict(),
    semantics: z
      .object({
        schemaVersion: z.literal("mechanism-semantic-execution-1"),
        registrySha256: MechanismHashSchema,
        binding: MechanismProductionBindingSchema,
        interval,
        comparisons: z.number().int().nonnegative().max(100000),
        rawSamples: z
          .array(
            z
              .object({
                frame: z.number().nonnegative(),
                measurements: z
                  .record(measurement, z.number().finite())
                  .refine((m) => Object.keys(m).length <= 128),
                evidence: artifact,
              })
              .strict(),
          )
          .max(10000),
        assertions: z
          .array(
            z
              .object({
                id: MechanismIdSchema,
                domain: z.enum(["mechanical", "collision"]),
                method: z.literal("sampled-numeric-range"),
                status,
                checkedSamples: z.number().int().nonnegative().max(10000),
                completeOutputFrameCoverage: z.boolean(),
                findings: z.array(finding).max(100000),
              })
              .strict(),
          )
          .max(32),
        continuousCollision: z.literal("unreviewed"),
        qualification: z.string().max(2048),
      })
      .strict(),
    warnings: z
      .object({
        raw: MechanismProductionOwnedFileSchema,
        grouped: MechanismProductionOwnedFileSchema,
        groups: z.number().int().nonnegative().max(2048),
        errors: z.number().int().nonnegative().max(2048),
      })
      .strict(),
    failures: z
      .object({
        mechanical: z.number().int().nonnegative().max(100000),
        sampledVisual: z.number().int().nonnegative().max(2048),
      })
      .strict(),
    collision: z
      .object({
        analytic: z.literal("not-evaluated"),
        sampled: status,
        continuous: z.literal("unreviewed"),
      })
      .strict(),
    mechanicalAcceptance: z.literal("separate-whole-mechanism-review"),
    qualification: z.string().max(2048),
  })
  .strict()
  .superRefine((facts, ctx) => {
    const reject = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (
      mechanismPackHash(facts.binding) !==
      mechanismPackHash(facts.semantics.binding)
    )
      reject("Semantic execution must use the facts artifact binding");
    if (
      facts.timeline.sourceSha256 !== facts.source.sourceSceneSha256 ||
      facts.semantics.interval.start !== 0 ||
      facts.semantics.interval.endExclusive !==
        facts.timeline.checkedOutputFrames
    )
      reject("Source/timeline/semantic clocks must agree");
    const samples = facts.semantics.rawSamples;
    if (
      samples.length !== facts.timeline.checkedOutputFrames ||
      samples.some(
        (s, i) =>
          s.frame !== i ||
          s.evidence.path !==
            facts.source.nativeCapture.path + "#outputFrame=" + i ||
          s.evidence.sha256 !== facts.source.nativeCapture.sha256,
      )
    )
      reject(
        "Semantic samples require exact original capture coverage and references",
      );
    if (
      facts.semantics.assertions.some(
        (a) =>
          a.checkedSamples !== samples.length ||
          !a.completeOutputFrameCoverage ||
          a.status !== (a.findings.length ? "failed" : "passed"),
      )
    )
      reject(
        "Assertion statuses and output-frame coverage must agree with retained samples/findings",
      );
    if (
      facts.failures.mechanical !==
        facts.semantics.assertions.reduce((n, a) => n + a.findings.length, 0) ||
      facts.failures.sampledVisual !== facts.warnings.errors
    )
      reject("Failure counts must agree with their retained actual results");
    const collision = facts.semantics.assertions.filter(
      (a) => a.domain === "collision",
    );
    const status = !collision.length
      ? "unreviewed"
      : collision.some((a) => a.status === "failed")
        ? "failed"
        : collision.every((a) => a.status === "passed")
          ? "passed"
          : "unreviewed";
    if (facts.collision.sampled !== status)
      reject("Sampled collision status must agree with declared sampled rules");
  });
export type MechanismProductionQAFacts = z.infer<
  typeof MechanismProductionQAFactsSchema
>;
export function mechanismProductionMeasurementUnit(
  m: MechanismProductionMeasurement,
) {
  return m.kind === "part-matrix-change"
    ? "maximum-matrix-component-delta"
    : "scene-unit";
}
