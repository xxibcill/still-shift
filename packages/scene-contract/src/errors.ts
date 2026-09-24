import {
  AnimationRequestSchema,
  type AnimationErrorCode,
  type AnimationFailure,
  type AnimationRequest,
} from "./contracts.ts";

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

export const parseAnimationRequest = (
  unvalidatedRequest: unknown,
): AnimationRequest => {
  const parsedRequest = AnimationRequestSchema.safeParse(unvalidatedRequest);
  if (!parsedRequest.success) {
    throw new AnimationEngineError(
      "SCENE_INVALID",
      "Animation request failed contract validation",
      { issueCount: parsedRequest.error.issues.length },
      { cause: parsedRequest.error },
    );
  }

  return parsedRequest.data;
};
