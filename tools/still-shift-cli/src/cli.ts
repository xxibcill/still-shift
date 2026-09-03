#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import { NoopAnimationEngine } from "@still-shift/animation-engine";
import {
  AnimationEngineError,
  AnimationRequestSchema,
  ENGINE_VERSION,
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
  --duration <seconds>   3-8 seconds (default: 5)
  --preset <name>       auto, slow_push, horizontal_drift, cinematic_float
  --intensity <name>    subtle, standard, strong (default: standard)
  --seed <integer>      unsigned 32-bit seed (default: 1842)
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
    values.get("duration") ?? "5",
    "duration",
  );
  const seed = parseFiniteNumber(values.get("seed") ?? "1842", "seed");

  const parsedRequest = AnimationRequestSchema.safeParse({
    inputPath: requireArgument(values, "input"),
    outputPath: requireArgument(values, "output"),
    durationMs: durationSeconds * 1000,
    fps: 30,
    width: 1920,
    height: 1080,
    preset: values.get("preset") ?? "auto",
    intensity: values.get("intensity") ?? "standard",
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
