import {
  ResolvedAnimationPresetSchema,
  type ResolvedAnimationPreset,
} from "@still-shift/scene-contract";

export const DEFAULT_EVALUATION_PRESETS = [
  "slow_push",
  "horizontal_drift",
  "cinematic_float",
] as const satisfies readonly ResolvedAnimationPreset[];

export const parseEvaluationPresets = (
  option: string | undefined,
): ResolvedAnimationPreset[] => {
  if (option === undefined) return [...DEFAULT_EVALUATION_PRESETS];

  const names = option.split(",").map((name) => name.trim());
  if (names.length === 0 || names.some((name) => name.length === 0)) {
    throw new Error("--presets must be a comma-separated list of preset names");
  }

  const presets = names.map((name) => {
    const parsed = ResolvedAnimationPresetSchema.safeParse(name);
    if (!parsed.success) {
      throw new Error(
        `Unknown evaluation preset: ${name}. Choose from ${ResolvedAnimationPresetSchema.options.join(", ")}`,
      );
    }
    return parsed.data;
  });
  if (new Set(presets).size !== presets.length) {
    throw new Error("--presets cannot contain duplicate names");
  }
  return presets;
};
export const EVALUATION_PRESETS = [
  "slow_push",
  "horizontal_drift",
  "cinematic_float",
] as const;

export const evaluationClipId = (entryId: string, preset: string): string =>
  `${entryId}-${preset.replaceAll("_", "-")}`;
