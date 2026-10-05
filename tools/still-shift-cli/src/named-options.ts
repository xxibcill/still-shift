import { AnimationEngineError } from "@still-shift/scene-contract";

export const parseNamedArguments = (
  argumentsToParse: string[],
  names: string[] = [
    "input",
    "output",
    "duration",
    "fps",
    "preset",
    "intensity",
    "seed",
    "adapter",
    "format",
    "focus",
  ],
): Map<string, string> => {
  const values = new Map<string, string>();
  const allowed = new Set(names);

  for (let index = 0; index < argumentsToParse.length; index += 2) {
    const key = argumentsToParse[index];
    const value = argumentsToParse[index + 1];
    if (key === undefined || !key.startsWith("--") || value === undefined) {
      throw new AnimationEngineError(
        "SCENE_INVALID",
        `Invalid CLI option near: ${key ?? "end of command"}`,
      );
    }
    const name = key.slice(2);
    if (!allowed.has(name) || values.has(name)) {
      throw new AnimationEngineError(
        "SCENE_INVALID",
        `Unknown or duplicate CLI option: --${name}`,
      );
    }
    values.set(name, value);
  }

  return values;
};

export const requireArgument = (
  values: Map<string, string>,
  name: string,
): string => {
  const value = values.get(name);
  if (value === undefined) {
    throw new AnimationEngineError(
      "SCENE_INVALID",
      `Missing required CLI option: --${name}`,
      { option: name },
    );
  }
  return value;
};
