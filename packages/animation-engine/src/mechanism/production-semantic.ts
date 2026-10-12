import { z } from "zod";
import {
  MechanismIdSchema,
  MechanismPackTimelineSchema,
} from "@still-shift/scene-contract";
import { compositionNodeJsonSize } from "@still-shift/execution-runtime/export";
import {
  MechanismProductionBindingSchema,
  type MechanismProductionBinding,
} from "./production-report.ts";
import { compileMechanismPackTimeline } from "./pack-timeline.ts";
import { MechanismPackInvariantError } from "./pack-invariant.ts";
import {
  freezeMechanismPack,
  mechanismPackHash,
  type MechanismPackInstanceSource,
} from "./pack-support.ts";

export const MECHANISM_SEMANTIC_LIMITS = {
  registrations: 32,
  rules: 16,
  samples: 10000,
  measurementsPerSample: 128,
  comparisons: 100000,
  timelineWork: 2000000,
  dataCapacityBytes: 8 * 1024 * 1024,
} as const;
const interval = z
  .object({
    start: z.number().int().nonnegative().max(108000),
    endExclusive: z.number().int().positive().max(108000),
  })
  .strict()
  .refine((i) => i.endExclusive > i.start);
const range = z
  .tuple([z.number().finite(), z.number().finite()])
  .refine((r) => r[0] <= r[1]);
const label = z.string().min(1).max(128);
/** A registered program is finite declarative data; execution never invokes supplied JavaScript. */
export const MechanismSemanticRegistrationSchema = z
  .object({
    schemaVersion: z.literal("mechanism-semantic-registration-1"),
    id: MechanismIdSchema,
    description: z.string().min(1).max(1024),
    domain: z.enum(["mechanical", "collision"]),
    method: z.literal("sampled-numeric-range"),
    requireEveryOutputFrame: z.boolean(),
    rules: z
      .array(
        z
          .object({
            measurement: label,
            range,
            unit: z.string().min(1).max(32),
            rig: label,
            parts: z.array(label).max(128),
            relationship: label.nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(16),
  })
  .strict();
export type MechanismSemanticRegistration = z.infer<
  typeof MechanismSemanticRegistrationSchema
>;
const sample = z
  .object({
    frame: z.number().finite().nonnegative().max(108000),
    measurements: z
      .record(z.string().min(1).max(128), z.number().finite())
      .refine((m) => Object.keys(m).length <= 128),
    evidence: z
      .object({
        path: z.string().min(1).max(2048),
        sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      })
      .strict(),
  })
  .strict();
const request = z
  .object({
    binding: MechanismProductionBindingSchema,
    interval,
    samples: z.array(sample).max(10000),
  })
  .strict();
export interface MechanismSemanticFinding {
  code: string;
  assertion: string;
  frame: number | null;
  rig: string | null;
  parts: string[];
  relationship: string | null;
  measurement: string | null;
  measured: number | null;
  expectedRange: [number, number] | null;
  unit: string | null;
  sampleIndex: number | null;
}
export interface MechanismSemanticExecution {
  schemaVersion: "mechanism-semantic-execution-1";
  registrySha256: string;
  binding: MechanismProductionBinding;
  interval: { start: number; endExclusive: number };
  comparisons: number;
  rawSamples: z.infer<typeof sample>[];
  assertions: {
    id: string;
    domain: "mechanical" | "collision";
    method: "sampled-numeric-range";
    status: "passed" | "failed" | "unreviewed";
    checkedSamples: number;
    completeOutputFrameCoverage: boolean;
    findings: MechanismSemanticFinding[];
  }[];
  continuousCollision: "unreviewed";
  qualification: string;
}
function bounded(input: unknown) {
  compositionNodeJsonSize(
    input,
    0,
    "",
    MECHANISM_SEMANTIC_LIMITS.dataCapacityBytes,
  );
}
export class MechanismSemanticRegistry {
  readonly registrations: readonly MechanismSemanticRegistration[];
  readonly sha256: string;
  constructor(input: unknown) {
    bounded(input);
    const definitions = z
      .array(MechanismSemanticRegistrationSchema)
      .max(32)
      .parse(input);
    if (new Set(definitions.map((r) => r.id)).size !== definitions.length)
      throw Error("Semantic registration IDs must be unique");
    definitions.sort((a, b) => a.id.localeCompare(b.id, "en"));
    this.registrations = freezeMechanismPack(definitions);
    this.sha256 = mechanismPackHash(definitions);
    Object.freeze(this);
  }
  execute(input: unknown): MechanismSemanticExecution {
    bounded(input);
    const data = request.parse(input);
    for (let i = 0; i < data.samples.length; i++) {
      const s = data.samples[i]!;
      if (
        s.frame < data.interval.start ||
        s.frame >= data.interval.endExclusive ||
        (i > 0 && s.frame <= data.samples[i - 1]!.frame)
      )
        throw Error(
          "Semantic samples must be unique, ordered and inside the declared interval",
        );
    }
    const cost =
      data.samples.length *
      this.registrations.reduce((n, r) => n + r.rules.length, 0);
    if (cost > MECHANISM_SEMANTIC_LIMITS.comparisons)
      throw Error("Semantic comparison budget exceeded before execution");
    let retainedCapacity = compositionNodeJsonSize(
      data,
      0,
      "",
      MECHANISM_SEMANTIC_LIMITS.dataCapacityBytes,
    ).capacityBytes;
    const retainFinding = (
      findings: MechanismSemanticFinding[],
      finding: MechanismSemanticFinding,
    ) => {
      retainedCapacity += compositionNodeJsonSize(
        finding,
        0,
        "",
        MECHANISM_SEMANTIC_LIMITS.dataCapacityBytes - retainedCapacity,
      ).capacityBytes;
      findings.push(finding);
    };
    const integers = data.samples.filter((s) =>
      Number.isInteger(s.frame),
    ).length;
    const complete =
      integers === data.interval.endExclusive - data.interval.start;
    const assertions = this.registrations.map((registration) => {
      const findings: MechanismSemanticFinding[] = [];
      for (const [sampleIndex, s] of data.samples.entries())
        for (const rule of registration.rules) {
          const measured = Object.hasOwn(s.measurements, rule.measurement)
            ? s.measurements[rule.measurement]!
            : null;
          if (
            measured === null ||
            measured < rule.range[0] ||
            measured > rule.range[1]
          )
            retainFinding(findings, {
              code:
                measured === null
                  ? "semantic-measurement-missing"
                  : "semantic-range-failed",
              assertion: registration.id,
              frame: s.frame,
              rig: rule.rig,
              parts: [...rule.parts],
              relationship: rule.relationship,
              measurement: rule.measurement,
              measured,
              expectedRange: [...rule.range] as [number, number],
              unit: rule.unit,
              sampleIndex,
            });
        }
      if (registration.requireEveryOutputFrame && !complete)
        retainFinding(findings, {
          code: "semantic-frame-coverage",
          assertion: registration.id,
          frame: null,
          rig: null,
          parts: [],
          relationship: null,
          measurement: null,
          measured: integers,
          expectedRange: [
            data.interval.endExclusive - data.interval.start,
            data.interval.endExclusive - data.interval.start,
          ],
          unit: "output-frames",
          sampleIndex: null,
        });
      return {
        id: registration.id,
        domain: registration.domain,
        method: registration.method,
        status: findings.length
          ? ("failed" as const)
          : data.samples.length
            ? ("passed" as const)
            : ("unreviewed" as const),
        checkedSamples: data.samples.length,
        completeOutputFrameCoverage: complete,
        findings,
      };
    });
    const result: MechanismSemanticExecution = {
      schemaVersion: "mechanism-semantic-execution-1",
      registrySha256: this.sha256,
      binding: data.binding,
      interval: data.interval,
      comparisons: cost,
      rawSamples: data.samples,
      assertions,
      continuousCollision: "unreviewed",
      qualification:
        "Registered scalar rules evaluate only supplied evidence samples. Even every output frame does not prove between-frame collision, factual truth or playback acceptance.",
    };
    bounded(result);
    return freezeMechanismPack(result);
  }
}
export interface MechanismProductionTimelineCheck {
  schemaVersion: "mechanism-production-timeline-check-1";
  status: "passed" | "failed";
  method: "expected-state-output-frames-and-exact-event-boundaries";
  collisionMethod: "not-evaluated";
  sourceSha256: string;
  timelineSha256: string;
  checkedOutputFrames: number;
  checkedEventFrames: number;
  finding: MechanismPackInvariantError["location"] | null;
  explanation: string;
}
/** Retain existing MS2 transition/event-order diagnostics without relabelling expected state as actual GPU/collision proof. */
export function checkMechanismProductionTimeline(
  instance: MechanismPackInstanceSource,
  input: unknown,
): MechanismProductionTimelineCheck {
  bounded(input);
  const timeline = MechanismPackTimelineSchema.parse(input);
  const work =
    (timeline.frameCount + timeline.events.length) *
    (instance.scene.parts.length +
      instance.scene.rigs.length +
      instance.scene.relationships.length +
      instance.scene.geometry.meshes.reduce(
        (count, mesh) => count + mesh.positions.length / 3,
        0,
      ));
  if (
    work > MECHANISM_SEMANTIC_LIMITS.timelineWork ||
    timeline.frameCount > MECHANISM_SEMANTIC_LIMITS.samples
  )
    throw Error(
      "Semantic timeline execution budget exceeded before compilation",
    );
  const base = {
    schemaVersion: "mechanism-production-timeline-check-1" as const,
    method: "expected-state-output-frames-and-exact-event-boundaries" as const,
    collisionMethod: "not-evaluated" as const,
    sourceSha256: instance.sourceSha256,
    timelineSha256: mechanismPackHash(timeline),
  };
  try {
    const compiled = compileMechanismPackTimeline(instance, timeline);
    return freezeMechanismPack({
      ...base,
      status: "passed" as const,
      checkedOutputFrames: compiled.checkedOutputFrames,
      checkedEventFrames: compiled.checkedEventFrames,
      finding: null,
      explanation:
        "Existing MS2 legal-transition/event-order/required-relationship checks passed at output frames and exact event boundaries; continuous collision remains separate.",
    });
  } catch (error) {
    if (!(error instanceof MechanismPackInvariantError)) throw error;
    return freezeMechanismPack({
      ...base,
      status: "failed" as const,
      checkedOutputFrames: 0,
      checkedEventFrames: 0,
      finding: error.location,
      explanation: error.message,
    });
  }
}
