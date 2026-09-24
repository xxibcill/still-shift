import {
  AnimationEngineError,
  parseAnimationRequest,
} from "@still-shift/scene-contract";
import { describe, expect, it } from "vitest";

describe("AnimationEngineError", () => {
  it("exposes a stable failure without a stack trace", () => {
    const failure = new AnimationEngineError(
      "INPUT_UNREADABLE",
      "Unable to read input",
      { inputPath: "missing.png" },
    ).toFailure();

    expect(failure).toEqual({
      status: "failed",
      error: {
        code: "INPUT_UNREADABLE",
        message: "Unable to read input",
        context: { inputPath: "missing.png" },
      },
    });
    expect(failure.error).not.toHaveProperty("stack");
  });

  it("wraps request validation failures consistently", () => {
    expect(() => parseAnimationRequest({ durationMs: 1 })).toThrowError(
      expect.objectContaining({
        code: "SCENE_INVALID",
        context: { issueCount: expect.any(Number) },
      }),
    );
  });
});
