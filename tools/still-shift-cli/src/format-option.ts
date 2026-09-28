import {
  AnimationEngineError,
  OutputFormatSchema,
  type OutputFormat,
} from "@still-shift/scene-contract";

export function parseOutputFormat(value: string | undefined): OutputFormat {
  const parsed = OutputFormatSchema.safeParse(value ?? "landscape");
  if (!parsed.success)
    throw new AnimationEngineError(
      "SCENE_INVALID",
      `Unknown output format: ${value}`,
    );
  return parsed.data;
}
