import { describe, expect, it } from "vitest";
import {
  AnimationEngineError,
  AnimationFailureSchema,
  failureDiagnostic,
  sanitizeDiagnosticText,
} from "@still-shift/scene-contract";
import { toCliFailure } from "../../tools/still-shift-cli/src/cli.ts";

describe("shared failure cause receipts", () => {
  it("retains bind permission and located stage without secrets or stacks", () => {
    const root = Object.assign(new Error("listen EPERM token=do-not-show"), {
      code: "EPERM",
      environment: { PASSWORD: "never-copy" },
    });
    const error = new AnimationEngineError(
      "RENDER_FAILED",
      "Capture startup failed password='also secret'",
      { stage: "bridge-startup", path: "shots.contact", token: "never-copy" },
      { cause: root },
    );
    const failure = AnimationFailureSchema.parse(error.toFailure());
    expect(failure.error.diagnostic).toMatchObject({
      stage: "bridge-startup",
      path: "shots.contact",
      causes: [
        expect.any(Object),
        {
          name: "Error",
          code: "EPERM",
          message: "Permission denied by the operating environment",
        },
      ],
    });
    expect(failure.error.diagnostic?.nextAction).toContain("local server");
    const bytes = JSON.stringify(failure);
    for (const secret of [
      "do-not-show",
      "never-copy",
      "also secret",
      "stack",
      '"environment":',
    ])
      expect(bytes).not.toContain(secret);
  });

  it("removes actual Chromium stack frames embedded in diagnostic messages", () => {
    const error = new AnimationEngineError(
      "RENDER_FAILED",
      "page.evaluate: ReferenceError: renderer is unavailable\n    at eval (eval at evaluate (:311:30), <anonymous>:11:26)\n    at UtilityScript.evaluate (<anonymous>:313:16)",
      {
        stage: "bridge-capture",
        path: "shots.contact",
        stack: "Error\n    at privateFunction (/private/source.ts:1:2)",
        diagnosticsJson: JSON.stringify({
          message:
            "Renderer failed\n    at UtilityScript.evaluate (<anonymous>:313:16)",
          stack: "private nested stack",
        }),
      },
    );
    const failure = error.toFailure();
    expect(failure.error.message).toBe(
      "page.evaluate: ReferenceError: renderer is unavailable",
    );
    expect(failure.error.context?.path).toBe("shots.contact");
    expect(
      JSON.parse(failure.error.context!.diagnosticsJson as string),
    ).toEqual({
      message: "Renderer failed",
    });
    for (const stack of [
      " at ",
      "UtilityScript",
      "anonymous",
      "privateFunction",
      '"stack"',
    ])
      expect(JSON.stringify(failure)).not.toContain(stack);
  });

  it("retains the terminal Python error without subprocess traceback frames", () => {
    const message = [
      "Command failed: artifact-lock-helper.py --identity 16524",
      "Traceback (most recent call last):",
      '  File "/private/source.py", line 94, in <module>',
      "    identity = process_start_identity(int(sys.argv[2]))",
      "               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^",
      "PermissionError: [Errno 1] Operation not permitted: 'ps'",
    ].join("\n");
    expect(sanitizeDiagnosticText(message)).toBe(
      "Command failed: artifact-lock-helper.py --identity 16524\nPermissionError: [Errno 1] Operation not permitted: 'ps'",
    );
  });

  it("keeps large diagnostic JSON parseable while redacting nested credentials", () => {
    const diagnostics = Array.from({ length: 100 }, (_, index) => ({
      code: "invalid-anchor",
      path: `shots.${index}`,
      password: "private",
      message: "Check anchor",
    }));
    const error = new AnimationEngineError("SCENE_INVALID", "Invalid project", {
      diagnosticsJson: JSON.stringify(diagnostics),
    });
    const decoded = JSON.parse(
      error.toFailure().error.context!.diagnosticsJson as string,
    );
    expect(decoded).toHaveLength(100);
    expect(decoded[99].path).toBe("shots.99");
    expect(JSON.stringify(decoded)).not.toContain("private");
  });

  it("bounds a cyclic chain and ignores arbitrary objects and non-errors", () => {
    const error = Object.assign(new Error("private"), {
      cause: undefined as unknown,
    });
    error.cause = error;
    expect(failureDiagnostic(error).causes).toHaveLength(1);
    expect(
      failureDiagnostic({ cause: { environment: { secret: "private" } } })
        .causes,
    ).toHaveLength(2);
    const failure = toCliFailure("secret string").failure;
    expect(JSON.stringify(failure)).not.toContain("secret string");
  });

  it("selects output-preserving recovery instead of blanket retry", () => {
    const error = Object.assign(new Error("output conflict"), {
      code: "EEXIST",
    });
    const { exitCode, failure } = toCliFailure(error);
    expect(exitCode).toBe(1);
    expect(failure.error.diagnostic?.causes[0]?.code).toBe("EEXIST");
    expect(failure.error.context?.recovery).toContain("fresh output");
  });
});
