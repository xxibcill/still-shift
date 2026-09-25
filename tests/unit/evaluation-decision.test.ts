import { describe, expect, it } from "vitest";

import { resolveDecision } from "../../scripts/evaluation/decision.ts";

const measured = {
  outcome: "go",
  reviewer: "Reviewer",
  rationale: "All nine gates passed on the approved corpus.",
  gateStatuses: Array(9).fill("Pass") as string[],
  operatorMinutes: 32,
};

describe("evaluation decision", () => {
  it("records a reviewed go once all gates pass", () => {
    expect(resolveDecision(measured).outcome).toBe("go");
  });

  it("keeps a ready report pending until a human records the outcome", () => {
    expect(
      resolveDecision({
        gateStatuses: measured.gateStatuses,
        operatorMinutes: measured.operatorMinutes,
      }).label,
    ).toBe("Pending final human decision");
  });

  it("rejects a go when a gate fails or is pending", () => {
    expect(() =>
      resolveDecision({ ...measured, gateStatuses: ["Pass", "Fail"] }),
    ).toThrow("every exit gate");
    expect(() =>
      resolveDecision({ ...measured, gateStatuses: ["Pass", "Pending"] }),
    ).toThrow("every gate");
  });

  it("allows an explained no-go after all gates are measured", () => {
    expect(
      resolveDecision({
        ...measured,
        outcome: "no-go",
        gateStatuses: ["Pass", "Fail"],
      }).outcome,
    ).toBe("no-go");
  });
});
