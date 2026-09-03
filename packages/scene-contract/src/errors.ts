import type { AnimationErrorCode, AnimationFailure } from "./contracts.ts";

type AnimationErrorContext = AnimationFailure["error"]["context"];

export class AnimationEngineError extends Error {
  readonly code: AnimationErrorCode;
  readonly context?: AnimationErrorContext;

  constructor(
    code: AnimationErrorCode,
    message: string,
    context?: AnimationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AnimationEngineError";
    this.code = code;
    this.context = context;
  }

  toFailure(): AnimationFailure {
    return {
      status: "failed",
      error: {
        code: this.code,
        message: this.message,
        ...(this.context === undefined ? {} : { context: this.context }),
      },
    };
  }
}
