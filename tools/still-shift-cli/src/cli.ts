#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import {
  NoopAnimationEngine,
  WebGLAnimationEngine,
} from "@still-shift/animation-engine";
import {
  AnimationEngineError,
  AnimationIntensitySchema,
  AnimationPresetSchema,
  ENGINE_VERSION,
  V0_1_REQUEST_CONSTRAINTS,
  V0_1_REQUEST_DEFAULTS,
  type AnimationFailure,
} from "@still-shift/scene-contract";

import { buildAnimationRequest } from "./animation-request.ts";
import { runBatch } from "./batch.ts";

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
  pnpm --silent still-shift animate --input <path> --output <path> [options]
  pnpm --silent still-shift batch --manifest <jsonl> --output-dir <path> [--concurrency 1|2]

The default adapter writes a validated 1080p H.264 MP4 and scene manifest.

Options:
  --duration <seconds>   ${V0_1_REQUEST_CONSTRAINTS.durationMs.minimum / 1000}-${V0_1_REQUEST_CONSTRAINTS.durationMs.maximum / 1000} seconds (default: ${V0_1_REQUEST_DEFAULTS.durationMs / 1000})
  --fps <integer>        fixed at ${V0_1_REQUEST_CONSTRAINTS.fps} FPS
  --preset <name>       ${AnimationPresetSchema.options.join(", ")} (default: ${V0_1_REQUEST_DEFAULTS.preset})
  --intensity <name>    ${AnimationIntensitySchema.options.join(", ")} (default: ${V0_1_REQUEST_DEFAULTS.intensity})
  --seed <integer>      unsigned 32-bit seed (default: ${V0_1_REQUEST_DEFAULTS.seed})
  --adapter <name>      webgl (default) or noop (compatibility fixture)
  --help                 show this help
  --version              show the engine version

Batch exits 0 when every item succeeds, 1 for partial failure, and 2 for invalid options.
Completed items with matching request and artifact hashes are reused on retry.
`;

const parseNamedArguments = (
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
  const fps = parseFiniteNumber(
    values.get("fps") ?? String(V0_1_REQUEST_CONSTRAINTS.fps),
    "fps",
  );

  return buildAnimationRequest({
    inputPath: requireArgument(values, "input"),
    outputPath: requireArgument(values, "output"),
    durationMs: durationSeconds * 1000,
    fps,
    preset: values.get("preset"),
    intensity: values.get("intensity"),
    seed,
  });
};

export const toCliFailure = (
  error: unknown,
): { exitCode: number; failure: AnimationFailure } => {
  if (error instanceof AnimationEngineError) {
    return {
      exitCode: error.code === "SCENE_INVALID" ? 2 : 1,
      failure: error.toFailure(),
    };
  }

  return {
    exitCode: 1,
    failure: {
      status: "failed",
      error: {
        code: "RENDER_FAILED",
        message: "Unexpected animation command failure",
        context: {
          operation: "animate",
          recovery:
            "Retry the same request; if it fails again, report the command and stderr output.",
        },
      },
    },
  };
};

const writeFailure = (error: unknown, io: CliIo): number => {
  const { exitCode, failure } = toCliFailure(error);

  io.stderr(`${JSON.stringify(failure)}\n`);
  return exitCode;
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
  if (args[0] === "batch") {
    try {
      const values = parseNamedArguments(args.slice(1), [
        "manifest",
        "output-dir",
        "concurrency",
      ]);
      const { summary, exitCode } = await runBatch({
        manifestPath: requireArgument(values, "manifest"),
        outputDir: requireArgument(values, "output-dir"),
        concurrency: parseFiniteNumber(
          values.get("concurrency") ?? "1",
          "concurrency",
        ),
      });
      io.stdout(`${JSON.stringify(summary)}\n`);
      return exitCode;
    } catch (error) {
      return writeFailure(error, io);
    }
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
    const values = parseNamedArguments(args.slice(1));
    const adapter = values.get("adapter") ?? "webgl";
    if (adapter !== "webgl" && adapter !== "noop") {
      throw new AnimationEngineError(
        "SCENE_INVALID",
        `Unknown animation adapter: ${adapter}`,
      );
    }
    const request = createRequest(values);
    const engine =
      adapter === "noop"
        ? new NoopAnimationEngine()
        : new WebGLAnimationEngine();
    const result = await engine.animate(request);
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
