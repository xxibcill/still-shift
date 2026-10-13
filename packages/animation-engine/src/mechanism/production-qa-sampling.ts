import {
  sampleProductionMoment,
  validateProductionMomentModels,
} from "./production-qa-moment.ts";
import { compositionNodeJsonSize } from "@still-shift/execution-runtime/export";
import type {
  NativeObservedOutputFrameV2,
  MechanismSceneV2,
} from "@still-shift/scene-contract";
import {
  MechanismSemanticRegistry,
  MECHANISM_SEMANTIC_LIMITS,
} from "./production-semantic.ts";
import { freezeMechanismPack, mechanismPackHash } from "./pack-support.ts";
import type { MechanismProductionBinding } from "./production-report.ts";
import {
  MechanismProductionQAPlanSchema,
  MechanismProductionQAProgramSchema,
  mechanismProductionMeasurementUnit,
  type MechanismProductionQAPlan,
  type MechanismProductionMeasurement,
} from "./production-qa-contract.ts";
const builtin = {
  schemaVersion: "mechanism-semantic-registration-1" as const,
  id: "production.stationary-mount",
  description:
    "Actual captured mount world matrices remain constant relative to the first captured output frame",
  domain: "mechanical" as const,
  method: "sampled-numeric-range" as const,
  requireEveryOutputFrame: true,
  rules: [
    {
      measurement: "production.mount.matrix-change",
      range: [0, 1e-8] as [number, number],
      unit: "maximum-matrix-component-delta",
      rig: "mount",
      parts: ["mount"],
      relationship: null,
    },
  ],
};
export const DEFAULT_MECHANISM_PRODUCTION_QA_PLAN: MechanismProductionQAPlan =
  freezeMechanismPack({
    schemaVersion: "mechanism-production-qa-plan-1",
    registrations: [],
    measurements: [],
    warningBindings: [],
  });
/** Declarative selectors read original captured scalars; they never execute supplied JavaScript. */
export class MechanismProductionQASampler {
  readonly plan: MechanismProductionQAPlan;
  readonly planSha256: string;
  readonly registry: MechanismSemanticRegistry;
  private readonly selectors: MechanismProductionMeasurement[];
  private readonly reference = new Map<string, readonly number[]>();
  private readonly samples: {
    frame: number;
    measurements: Record<string, number>;
    evidence: { path: string; sha256: string };
  }[] = [];
  private retainedCapacity = 0;
  private readonly scaleToMeters: number;
  constructor(
    input: unknown,
    scene: MechanismSceneV2,
    readonly frameCount: number,
  ) {
    if (compositionNodeJsonSize(input, 0, "", 1024 * 1024).encodedBytes > 65536)
      throw Error("QA plan exceeds its encoded byte limit");
    compositionNodeJsonSize(scene, 0, "", 32 * 1024 * 1024);
    this.plan = freezeMechanismPack(
      MechanismProductionQAPlanSchema.parse(input),
    );
    this.planSha256 = mechanismPackHash(this.plan);
    this.selectors = [
      {
        measurement: builtin.rules[0]!.measurement,
        kind: "part-matrix-change",
        part: "mount",
      },
      ...this.plan.measurements,
    ];
    this.scaleToMeters = scene.units.scaleToMeters;
    validateProductionMomentModels(this.selectors, this.scaleToMeters);
    const parts = new Set(scene.parts.map((p) => p.id)),
      anchors = new Set(scene.anchors.map((a) => a.id));
    if (
      new Set(this.selectors.map((s) => s.measurement)).size !==
      this.selectors.length
    )
      throw Error(
        "QA measurement names must be unique, including the built-in mount measurement",
      );
    for (const selector of this.selectors) {
      if (
        selector.kind === "static-moment-balance"
          ? !parts.has(selector.model.referencePart) ||
            [selector.model.pivotAnchor, selector.model.applicationAnchor].some(
              (a) => !anchors.has(a),
            )
          : selector.kind === "anchor-separation"
            ? selector.anchors.some((a) => !anchors.has(a))
            : !parts.has(selector.part)
      )
        throw Error("QA selector names an absent physical part or anchor");
    }
    const rigs = new Set(scene.rigs.map((r) => r.id)),
      relationships = new Set(scene.relationships.map((r) => r.id));
    for (const registration of this.plan.registrations)
      for (const rule of registration.rules) {
        const selector = this.selectors.find(
          (s) => s.measurement === rule.measurement,
        );
        if (
          !selector ||
          rule.unit !== mechanismProductionMeasurementUnit(selector)
        )
          throw Error(
            "Semantic rule lacks its actual measurement selector or declares the wrong unit",
          );
        if (!rigs.has(rule.rig) && !parts.has(rule.rig))
          throw Error("Semantic rule names an absent controlling rig or part");
        if (rule.relationship !== null && !relationships.has(rule.relationship))
          throw Error("Semantic rule names an absent relationship");
        if (rule.parts.some((p) => !parts.has(p)))
          throw Error("Semantic rule names an absent physical part");
      }
    if (!Number.isInteger(frameCount) || frameCount < 1)
      throw Error("Native QA requires a positive integer output clock");
    this.registry = new MechanismSemanticRegistry([
      builtin,
      ...this.plan.registrations,
    ]);
    const rules = this.registry.registrations.reduce(
      (n, r) => n + r.rules.length,
      0,
    );
    if (
      frameCount > MECHANISM_SEMANTIC_LIMITS.samples ||
      frameCount * rules > MECHANISM_SEMANTIC_LIMITS.comparisons
    )
      throw Error(
        "Native QA sample/comparison budget exceeded before capture traversal",
      );
  }
  get program() {
    return freezeMechanismPack(
      MechanismProductionQAProgramSchema.parse({
        schemaVersion: "mechanism-production-qa-program-1",
        plan: this.plan,
        planSha256: this.planSha256,
        registrySha256: this.registry.sha256,
        registrations: this.registry.registrations,
        measurements: this.selectors,
      }),
    );
  }
  observe(
    packet: NativeObservedOutputFrameV2,
    evidence: { path: string; sha256: string },
  ) {
    if (
      compositionNodeJsonSize(packet, 0, "", 4 * 1024 * 1024).encodedBytes >
      1024 * 1024
    )
      throw Error(
        "Native QA observation exceeds the original packet byte limit",
      );
    if (
      packet.outputFrame !== this.samples.length ||
      packet.passes.length !== 1 ||
      packet.passes[0]!.observed.version !== "native3d-observed-frame-2"
    )
      throw Error(
        "QA requires ordered complete output-frame native2 observations",
      );
    if (this.samples.length >= this.frameCount)
      throw Error("Native QA capture exceeds its output clock");
    const observed = packet.passes[0]!.observed,
      measurements: Record<string, number> = {},
      moments = new Map<string, ReturnType<typeof sampleProductionMoment>>();
    for (const selector of this.selectors) {
      if (selector.kind === "static-moment-balance") {
        if (!moments.has(selector.model.id))
          moments.set(
            selector.model.id,
            sampleProductionMoment(
              selector.model,
              observed,
              this.scaleToMeters,
            ),
          );
        const result = moments.get(selector.model.id);
        if (result)
          measurements[selector.measurement] =
            selector.quantity === "required-force-newtons"
              ? result.requiredForceNewtons
              : selector.quantity === "signed-arm-meters"
                ? result.signedMomentArmMeters
                : result.requiredForceNewtons * result.signedMomentArmMeters +
                  result.resistingTorqueNewtonMeters;
      } else if (selector.kind === "anchor-separation") {
        const a = observed.anchors[selector.anchors[0]],
          b = observed.anchors[selector.anchors[1]];
        if (a && b && a.status === "positioned" && b.status === "positioned")
          measurements[selector.measurement] = Math.hypot(
            ...a.world.map((v, i) => v - b.world[i]!),
          );
      } else {
        const matrix = observed.parts[selector.part]?.worldMatrix;
        if (!matrix) continue;
        if (!this.reference.has(selector.measurement))
          this.reference.set(selector.measurement, [...matrix]);
        const first = this.reference.get(selector.measurement)!;
        measurements[selector.measurement] =
          selector.kind === "part-matrix-change"
            ? Math.max(...matrix.map((v, i) => Math.abs(v - first[i]!)))
            : Math.hypot(
                ...matrix.slice(12, 15).map((v, i) => v - first[i + 12]!),
              );
      }
    }
    const sample = {
      frame: packet.outputFrame,
      measurements,
      evidence: {
        ...evidence,
        path: evidence.path + "#outputFrame=" + packet.outputFrame,
      },
    };
    this.retainedCapacity += compositionNodeJsonSize(
      sample,
      0,
      "",
      MECHANISM_SEMANTIC_LIMITS.dataCapacityBytes - this.retainedCapacity,
    ).capacityBytes;
    this.samples.push(sample);
  }
  finish(binding: MechanismProductionBinding) {
    if (this.samples.length !== this.frameCount)
      throw Error("Native QA lacks the complete original capture interval");
    return this.registry.execute({
      binding,
      interval: { start: 0, endExclusive: this.frameCount },
      samples: this.samples,
    });
  }
}
