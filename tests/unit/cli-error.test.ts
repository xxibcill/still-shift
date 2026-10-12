import { AnimationFailureSchema } from "@still-shift/scene-contract";
import { describe, expect, it } from "vitest";

import { toCliFailure } from "../../tools/still-shift-cli/src/cli.ts";

describe("CLI failure output", () => {
  it("gives callers actionable context for an unexpected failure", () => {
    const { exitCode, failure } = toCliFailure(new Error("private detail"));

    expect(exitCode).toBe(1);
    expect(AnimationFailureSchema.parse(failure)).toEqual({
      status: "failed",
      error: {
        code: "RENDER_FAILED",
        message: "Unexpected animation command failure",
        diagnostic: {
          stage: "command",
          nextAction: expect.any(String),
          causes: [{ name: "Error", message: expect.any(String) }],
        },
        context: {
          operation: "command",
          recovery:
            "Inspect the located diagnostic and complete dependency validation before rerunning the affected stage.",
        },
      },
    });
    expect(JSON.stringify(failure)).not.toContain("private detail");
  });
});
