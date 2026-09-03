#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import { NoopAnimationEngine } from "@still-shift/animation-engine";
import {
  AnimationEngineError,
  AnimationIntensitySchema,
  AnimationPresetSchema,
  AnimationRequestSchema,
  ENGINE_VERSION,
  V0_1_REQUEST_CONSTRAINTS,
  V0_1_REQUEST_DEFAULTS,
  type AnimationFailure,
} from "@still-shift/scene-contract";

type CliIo = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

const DEFAULT_IO: CliIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

const HELP = `Still Shift v${ENGINE_VERSION}

Usage:
  pnpm still-shift animate --input <path> --output <path> [options]

v0.1 writes a deterministic no-op JSON artifact, not a video.

Options:
  --duration <seconds>   ${V0_1_REQUEST_CONSTRAINTS.durationMs.minimum / 1000}-${V0_1_REQUEST_CONSTRAINTS.durationMs.maximum / 1000} seconds (default: ${V0_1_REQUEST_DEFAULTS.durationMs / 1000})
  --preset <name>       ${AnimationPresetSchema.options.join(", ")} (default: ${V0_1_REQUEST_DEFAULTS.preset})
  --intensity <name>    ${AnimationIntensitySchema.options.join(", ")} (default: ${V0_1_REQUEST_DEFAULTS.intensity})
  --seed <integer>      unsigned 32-bit seed (default: ${V0_1_REQUEST_DEFAULTS.seed})
  --help                 show this help
  --version              show the engine version
`;

const parseNamedArguments = (
  argumentsToParse: string[],
): Map<string, string> => {
  const values = new Map<string, string>();

  for (let index = 0; index < argumentsToParse.length; index += 2) {
    const key = argumentsToParse[index];
    const value = argumentsToParse[index + 1];
    if (key === undefined || !key.startsWith("--") || value === undefined) {
      throw new AnimationEngineError(
        "SCENE_INVALID",
        `Invalid CLI option near: ${key ?? "end of command"}`,
      );
    }
    values.set(key.slice(2), value);
  }

  return values;
};

const requireArgument = (values: Map<string, string>, name: string): string => {
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

const parseFiniteNumber = (value: string, name: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AnimationEngineError(
      "SCENE_INVALID",
      `CLI option --${name} must be a finite number`,
      { option: name, value },
    );
  }
  return parsed;
};

const createRequest = (values: Map<string, string>) => {
  const durationSeconds = parseFiniteNumber(
    values.get("duration") ?? String(V0_1_REQUEST_DEFAULTS.durationMs / 1000),
    "duration",
  );
  const seed = parseFiniteNumber(
    values.get("seed") ?? String(V0_1_REQUEST_DEFAULTS.seed),
    "seed",
  );

  const parsedRequest = AnimationRequestSchema.safeParse({
    inputPath: requireArgument(values, "input"),
    outputPath: requireArgument(values, "output"),
    durationMs: durationSeconds * 1000,
    fps: V0_1_REQUEST_CONSTRAINTS.fps,
    width: V0_1_REQUEST_CONSTRAINTS.width,
    height: V0_1_REQUEST_CONSTRAINTS.height,
    preset: values.get("preset") ?? V0_1_REQUEST_DEFAULTS.preset,
    intensity: values.get("intensity") ?? V0_1_REQUEST_DEFAULTS.intensity,
    seed,
  });

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

const writeFailure = (error: unknown, io: CliIo): number => {
  const failure: AnimationFailure =
    error instanceof AnimationEngineError
      ? error.toFailure()
      : {
          status: "failed",
          error: {
            code: "RENDER_FAILED",
            message: "Unexpected animation command failure",
          },
        };

  io.stderr(`${JSON.stringify(failure)}\n`);
  return error instanceof AnimationEngineError && error.code === "SCENE_INVALID"
    ? 2
    : 1;
};

export const runCli = async (
  args: string[],
  io: CliIo = DEFAULT_IO,
): Promise<number> => {
  if (args.includes("--help") || args.length === 0) {
    io.stdout(HELP);
    return 0;
  }
  if (args.includes("--version")) {
    io.stdout(`${ENGINE_VERSION}\n`);
    return 0;
  }
  if (args[0] !== "animate") {
    return writeFailure(
      new AnimationEngineError(
        "SCENE_INVALID",
        `Unknown command: ${args[0] ?? "none"}`,
      ),
      io,
    );
  }

  try {
    const request = createRequest(parseNamedArguments(args.slice(1)));
    const result = await new NoopAnimationEngine().animate(request);
    io.stdout(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    return writeFailure(error, io);
  }
};

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  process.exitCode = await runCli(process.argv.slice(2));
}
