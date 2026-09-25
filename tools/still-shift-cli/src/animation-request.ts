import {
  parseAnimationRequest,
  V0_1_REQUEST_CONSTRAINTS,
  V0_1_REQUEST_DEFAULTS,
  type AnimationRequest,
} from "@still-shift/scene-contract";

type AnimationRequestInput = {
  inputPath: string;
  outputPath: string;
  durationMs?: number | undefined;
  fps?: number | undefined;
  preset?: string | undefined;
  intensity?: string | undefined;
  seed?: number | undefined;
};

export const buildAnimationRequest = (
  input: AnimationRequestInput,
): AnimationRequest =>
  parseAnimationRequest({
    inputPath: input.inputPath,
    outputPath: input.outputPath,
    durationMs: input.durationMs ?? V0_1_REQUEST_DEFAULTS.durationMs,
    fps: input.fps ?? V0_1_REQUEST_CONSTRAINTS.fps,
    width: V0_1_REQUEST_CONSTRAINTS.width,
    height: V0_1_REQUEST_CONSTRAINTS.height,
    preset: input.preset ?? V0_1_REQUEST_DEFAULTS.preset,
    intensity: input.intensity ?? V0_1_REQUEST_DEFAULTS.intensity,
    seed: input.seed ?? V0_1_REQUEST_DEFAULTS.seed,
  });
