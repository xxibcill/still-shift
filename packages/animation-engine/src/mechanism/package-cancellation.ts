import { resolve } from "node:path";
import { AnimationEngineError } from "@still-shift/scene-contract";

/** Preserve ordinary diagnostics and normalize cancellation at package API boundaries. */
export function throwMechanismPackageError(
  cause: unknown,
  options: { outputDirectory: string; signal?: AbortSignal },
): never {
  if (
    !options.signal?.aborted ||
    (cause instanceof AnimationEngineError &&
      cause.context?.diagnosticCode === "mechanism-package-cancelled")
  )
    throw cause;
  const attemptDirectory =
    cause instanceof AnimationEngineError &&
    cause.context?.stage === "mechanism-package" &&
    typeof cause.context.attemptDirectory === "string"
      ? cause.context.attemptDirectory
      : undefined;
  throw new AnimationEngineError(
    "RENDER_FAILED",
    "Mechanism package was cancelled; completed work is retained",
    {
      stage: "mechanism-package",
      diagnosticCode: "mechanism-package-cancelled",
      path: resolve(options.outputDirectory),
      ...(attemptDirectory === undefined ? {} : { attemptDirectory }),
      nextAction:
        "Inspect any retained attempt and retry into a fresh output directory",
    },
    {
      cause: Object.assign(new Error("Package cancelled", { cause }), {
        code: "ABORT_ERR",
      }),
    },
  );
}
