export const DECISION_LABELS = {
  go: "Go — depth-first engine",
  "conditional-go-layered": "Conditional go — layered quality",
  "conditional-go-2d": "Conditional go — 2D-first engine",
  "no-go": "No-go",
} as const;

export type DecisionOutcome = keyof typeof DECISION_LABELS;

type DecisionInput = {
  outcome?: string | undefined;
  reviewer?: string | undefined;
  rationale?: string | undefined;
  gateStatuses: string[];
  operatorMinutes: number | null;
};

export const resolveDecision = (input: DecisionInput) => {
  const measured = input.gateStatuses.every(
    (status) => status === "Pass" || status === "Fail",
  );
  if (!input.outcome) {
    if (input.reviewer || input.rationale)
      throw new Error("Decision reviewer and rationale require --decision");
    return {
      label:
        measured && input.operatorMinutes !== null
          ? "Pending final human decision"
          : "Pending approved corpus, human review, or measured gates",
      outcome: null,
      reviewer: null,
      rationale: null,
    };
  }
  if (!(input.outcome in DECISION_LABELS))
    throw new Error("Unknown decision outcome");
  if (!input.reviewer?.trim() || !input.rationale?.trim())
    throw new Error("A final decision requires reviewer and rationale");
  if (!measured || input.operatorMinutes === null)
    throw new Error("A final decision requires every gate and operator time");
  if (
    input.outcome === "go" &&
    input.gateStatuses.some((status) => status !== "Pass")
  )
    throw new Error("A go decision requires every exit gate to pass");

  const outcome = input.outcome as DecisionOutcome;
  return {
    label: DECISION_LABELS[outcome],
    outcome,
    reviewer: input.reviewer.trim(),
    rationale: input.rationale.trim(),
  };
};
