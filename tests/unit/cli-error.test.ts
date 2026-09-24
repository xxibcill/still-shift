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
        context: {
          operation: "animate",
          recovery:
            "Retry the same request; if it fails again, report the command and stderr output.",
        },
      },
    });
    expect(JSON.stringify(failure)).not.toContain("private detail");
  });
});
