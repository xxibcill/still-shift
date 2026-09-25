export const EVALUATION_PRESETS = [
  "slow_push",
  "horizontal_drift",
  "cinematic_float",
] as const;

export const evaluationClipId = (entryId: string, preset: string): string =>
  `${entryId}-${preset.replaceAll("_", "-")}`;
