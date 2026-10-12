import { describe, expect, it } from "vitest";
import {
  createUnreviewedMechanismQA,
  inspectMechanismProductionDisposition,
  mechanismProductionPercentile,
  MechanismProductionEpisodeReportSchema,
  MechanismProductionQASchema,
  summarizeMechanismProductionCohort,
  type MechanismProductionEpisodeReport,
} from "../../packages/animation-engine/src/mechanism/production-report.ts";

const hash = (digit: string) => "sha256:" + digit.repeat(64);
const binding = {
  inputSha256: hash("a"),
  outputSha256: hash("b"),
  codeSha256: hash("c"),
  profileSha256: hash("d"),
};
function episode(id = "E01"): MechanismProductionEpisodeReport {
  return {
    schemaVersion: "mechanism-production-episode-report-1",
    id,
    question:
      id === "E01"
        ? "How does the declared floating hook establish zero?"
        : "How do the declared rivets retain the hook?",
    family: "tape-hook",
    designVariant: "floating-hook",
    binding: { ...binding },
    clock: { outputFrames: 60, sourceSamples: 96000 },
    attempts: [],
    qa: createUnreviewedMechanismQA(binding),
    unresolvedMechanicalFailures: 0,
    durations: {
      setupSeconds: null,
      routineSeconds: null,
      renderSeconds: null,
    },
    authoring: {
      setupTokens: null,
      routineTokens: null,
      baselineRoutineTokens: null,
      comparable: false,
      measurementEvidence: null,
    },
  };
}
function reviewed(): MechanismProductionEpisodeReport {
  const value = episode();
  value.qa = value.qa.map((q) => ({
    ...q,
    status: "passed",
    method: "fixture-review",
    evaluatedInterval: {
      unit: q.dimension === "listening" ? "source-sample" : "output-frame",
      start: 0,
      endExclusive: q.dimension === "listening" ? 96000 : 60,
    },
    evidence: [{ path: "fixture-review.json", sha256: hash("e") }],
    reviewer: { kind: "agent", id: "test-fixture-only" },
  }));
  return value;
}
describe("artifact-bound production QA", () => {
  it("starts every dimension unreviewed without fabricated intervals", () => {
    const result = inspectMechanismProductionDisposition(episode());
    expect(result.reviewedReady).toBe(false);
    expect(Object.values(result.statuses)).toEqual(Array(6).fill("unreviewed"));
  });
  it.each([
    "inputSha256",
    "outputSha256",
    "codeSha256",
    "profileSha256",
  ] as const)("retires all prior reviews after %s changes", (key) => {
    const value = reviewed();
    expect(inspectMechanismProductionDisposition(value).reviewedReady).toBe(
      true,
    );
    value.binding[key] = hash("f");
    const result = inspectMechanismProductionDisposition(value);
    expect(result.reviewedReady).toBe(false);
    expect(result.staleDimensions).toHaveLength(6);
    expect(value.qa[0]!.status).toBe("passed"); // Original evidence remains retained.
  });
  it.each([
    "technical",
    "mechanical",
    "continuous-motion",
    "listening",
    "factual",
  ] as const)(
    "does not promote a partial %s review to whole-artifact readiness",
    (dimension) => {
      const value = reviewed();
      value.qa.find(
        (q) => q.dimension === dimension,
      )!.evaluatedInterval!.start = 1;
      const result = inspectMechanismProductionDisposition(value);
      expect(result.reviewedReady).toBe(false);
      expect(result.incompleteDimensions).toEqual([dimension]);
      expect(result.statuses[dimension]).toBe("unreviewed");
    },
  );
  it("rejects current review intervals beyond the actual clock but retains older scopes", () => {
    const value = reviewed();
    value.qa[0]!.evaluatedInterval!.endExclusive = 61;
    expect(
      MechanismProductionEpisodeReportSchema.safeParse(value).success,
    ).toBe(false);
    value.binding.inputSha256 = hash("f");
    expect(
      inspectMechanismProductionDisposition(value).staleDimensions,
    ).toHaveLength(6);
  });
  it("keeps mechanical failures from a reviewed-ready state", () => {
    const value = reviewed();
    value.unresolvedMechanicalFailures = 1;
    expect(inspectMechanismProductionDisposition(value).reviewedReady).toBe(
      false,
    );
  });
  it.each(["continuous-motion", "listening", "factual"] as const)(
    "rejects automated %s acceptance",
    (dimension) => {
      const qa = reviewed().qa.find((q) => q.dimension === dimension)!;
      expect(
        MechanismProductionQASchema.safeParse({
          ...qa,
          reviewer: { kind: "automated", id: "encoder" },
        }).success,
      ).toBe(false);
    },
  );
  it("requires artifact evidence and an interval for a positive review", () => {
    const qa = reviewed().qa[0]!;
    for (const patch of [
      { evidence: [] },
      { evaluatedInterval: null },
      { binding: { ...binding, outputSha256: null } },
    ])
      expect(
        MechanismProductionQASchema.safeParse({ ...qa, ...patch }).success,
      ).toBe(false);
  });
  it("rejects duplicate dimensions, skipped attempts and unretained token evidence", () => {
    const value = episode();
    expect(
      MechanismProductionEpisodeReportSchema.safeParse({
        ...value,
        qa: Array(6).fill(value.qa[0]),
      }).success,
    ).toBe(false);
    expect(
      MechanismProductionEpisodeReportSchema.safeParse({
        ...value,
        attempts: [
          {
            number: 2,
            inputSha256: hash("a"),
            status: "failed",
            stage: "render",
            seconds: 1,
            diagnostic: "seeded export failure",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      MechanismProductionEpisodeReportSchema.safeParse({
        ...value,
        authoring: { ...value.authoring, routineTokens: 10 },
      }).success,
    ).toBe(false);
  });
});
describe("production cohort measurements", () => {
  it("defines interpolation and preserves absent observations as null", () => {
    expect(mechanismProductionPercentile([30, 10, 20], 0.5)).toBe(20);
    expect(mechanismProductionPercentile([10, 20, 30], 0.95)).toBe(29);
    expect(mechanismProductionPercentile([], 0.95)).toBeNull();
    expect(() => mechanismProductionPercentile([NaN], 0.5)).toThrow();
    expect(() => mechanismProductionPercentile([1], 2)).toThrow();
    const result = summarizeMechanismProductionCohort([episode()]);
    expect(result.durations.renderSeconds).toEqual({
      available: 0,
      p50: null,
      p95: null,
    });
    expect(result.authoring.savings).toBeNull();
    expect(result.authoring.targetSatisfied).toBeNull();
    expect(result.firstPassTechnical.targetSatisfied).toBeNull();
  });
  it("retains failed first attempts, repeated failures and pending denominator rows", () => {
    const failed = episode("E01"),
      pending = episode("E02");
    failed.attempts = ["failed", "failed", "passed"].map((status, i) => ({
      number: i + 1,
      inputSha256: hash("a"),
      status: status as "failed" | "passed",
      stage: "render",
      seconds: 2,
      diagnostic: status === "failed" ? "seeded failure" : null,
    }));
    failed.durations.routineSeconds = 6;
    const result = summarizeMechanismProductionCohort([failed, pending]);
    expect(result.selected).toBe(2);
    expect(result.attempted).toBe(1);
    expect(result.firstPassTechnical).toEqual({
      passed: 0,
      rate: 0,
      targetSatisfied: null,
    });
    expect(result.failures).toEqual({
      failedAttempts: 2,
      repeatedFailureEpisodes: 1,
      cancelled: 0,
      interrupted: 0,
    });
    expect(result.rows[0]!.failedAttempts).toBe(2);
    expect(result.reviewCounts.listening.unreviewed).toBe(2);
  });
  it("requires paired comparable evidence for all selected tasks before savings", () => {
    const a = episode("E01"),
      b = episode("E02");
    for (const value of [a, b])
      value.authoring = {
        setupTokens: 30,
        routineTokens: 40,
        baselineRoutineTokens: 100,
        comparable: true,
        measurementEvidence: {
          path: "fixture-telemetry.json",
          sha256: hash("e"),
        },
      };
    expect(summarizeMechanismProductionCohort([a, b]).authoring.savings).toBe(
      0.6,
    );
    b.authoring.comparable = false;
    expect(
      summarizeMechanismProductionCohort([a, b]).authoring.savings,
    ).toBeNull();
  });
  it("rejects normalized duplicate questions despite different IDs", () => {
    const a = episode("E01"),
      b = episode("E02");
    b.question = "  " + a.question.toUpperCase().replaceAll(" ", "  ") + "  ";
    expect(() => summarizeMechanismProductionCohort([a, b])).toThrow(
      /distinct questions/,
    );
  });
  it("rejects duplicate episode IDs", () => {
    expect(() =>
      summarizeMechanismProductionCohort([episode(), episode()]),
    ).toThrow(/distinct/);
  });
});
