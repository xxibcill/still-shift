#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";
import { storyToComposition } from "@still-shift/renderer-core";
import { prepareCommerceFile } from "../../../packages/animation-engine/src/commerce-preparation.ts";
import { pathToFileURL } from "node:url";
import { readStoryPassage } from "../../../packages/animation-engine/src/story-passage-io.ts";
import {
  PassageError,
  passageDiagnostics,
} from "../../../packages/renderer-core/src/passage-diagnostics.ts";
import { lintVertical } from "../../../packages/renderer-core/src/story-vertical.ts";
import { resolveCinematicFormat } from "../../../packages/renderer-core/src/cinematic-scene.ts";
import { resolveStoryFormat } from "../../../packages/renderer-core/src/story-template.ts";
import { CinematicSceneSchema } from "../../../packages/scene-contract/src/cinematic.ts";
import { StorySceneSchema } from "../../../packages/scene-contract/src/story.ts";

import {
  NoopAnimationEngine,
  WebGLAnimationEngine,
  PreparedAnimationEngine,
  loadPreparedScene,
  generateSfx,
  SfxGenerationError,
  importNarrationFile,
  renderComposition,
} from "@still-shift/animation-engine";
import {
  AnimationEngineError,
  AnimationIntensitySchema,
  AnimationPresetSchema,
  ENGINE_VERSION,
  formatSize,
  parseAnimationRequest,
  V0_1_REQUEST_CONSTRAINTS,
  V0_1_REQUEST_DEFAULTS,
  type AnimationFailure,
} from "@still-shift/scene-contract";

import { runBatch } from "./batch.ts";
import { parseOutputFormat } from "./format-option.ts";
import {
  resolveCatalogFormatVariant,
  writeResolvedInput,
} from "./format-variant.ts";

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
  pnpm still-shift animate-scene --scene <prepared.json> --output <path> [--format landscape|vertical]
  pnpm still-shift passage lint --plan <plan.json> --format vertical
  pnpm still-shift passage import-narration --plan <plan.json> --narration <audio.wav|mp3> --timing <words.json|captions.srt> --mode match|add --output <new-plan.json>
  pnpm still-shift sfx generate --provider elevenlabs --id <slug> --prompt <text> --duration <seconds> --output-dir <new-directory> [--prompt-influence 0.3] [--loop true|false]
  pnpm still-shift prepare-commerce --brief <brief.json> --output <prepared.json>
  pnpm --silent still-shift comp render --input <composition.json> --output <path.mp4>
  pnpm --silent still-shift comp export-json --scene <story.json> [--output <composition.json>]
  pnpm --silent still-shift batch --manifest <jsonl> --output-dir <path> [--format landscape|vertical] [--concurrency 1|2]

The default adapter writes a validated 1080p H.264 MP4 and scene manifest.

Options:
  --duration <seconds>   ${V0_1_REQUEST_CONSTRAINTS.durationMs.minimum / 1000}-${V0_1_REQUEST_CONSTRAINTS.durationMs.maximum / 1000} seconds (default: ${V0_1_REQUEST_DEFAULTS.durationMs / 1000})
  --fps <integer>        fixed at ${V0_1_REQUEST_CONSTRAINTS.fps} FPS
  --format <name>        landscape (default) or vertical
  --focus <x,y>          normalized focal point for vertical crops (0–1)
  --preset <name>       ${AnimationPresetSchema.options.join(", ")} (default: ${V0_1_REQUEST_DEFAULTS.preset})
  --intensity <name>    ${AnimationIntensitySchema.options.join(", ")} (default: ${V0_1_REQUEST_DEFAULTS.intensity})
  --seed <integer>      unsigned 32-bit seed (default: ${V0_1_REQUEST_DEFAULTS.seed})
  --adapter <name>      webgl (default) or noop (compatibility fixture)
  --help                 show this help
  --version              show the engine version

Batch exits 0 after processing every item, including recorded item failures, and 2 for invalid configuration.
Completed items with matching request and artifact hashes are reused on retry.

SFX generation uses ELEVENLABS_API_KEY from the server environment and consumes account credits.
SFX duration: 0.5–30 seconds. Prompt influence: 0–1. Loop defaults to false.
Each SFX request needs a fresh output directory; paid requests are never automatically retried.
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

const parseFocus = (
  value: string | undefined,
): [number, number] | undefined => {
  if (value === undefined) return undefined;
  const parts = value.split(",");
  const point = parts.map(Number);
  if (
    parts.length !== 2 ||
    parts.some((part) => part.trim() === "") ||
    point.some(
      (coordinate) =>
        !Number.isFinite(coordinate) || coordinate < 0 || coordinate > 1,
    )
  )
    throw new AnimationEngineError(
      "SCENE_INVALID",
      "--focus must be two normalized coordinates, for example 0.5,0.5",
    );
  return [point[0]!, point[1]!];
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
  const size = formatSize(parseOutputFormat(values.get("format")));
  const focus = parseFocus(values.get("focus"));

  return parseAnimationRequest({
    inputPath: requireArgument(values, "input"),
    outputPath: requireArgument(values, "output"),
    durationMs: durationSeconds * 1000,
    fps,
    width: size.width,
    height: size.height,
    ...(focus ? { focus } : {}),
    preset: values.get("preset") ?? V0_1_REQUEST_DEFAULTS.preset,
    intensity: values.get("intensity") ?? V0_1_REQUEST_DEFAULTS.intensity,
    seed,
  });
};

export const toCliFailure = (
  error: unknown,
): { exitCode: number; failure: AnimationFailure } => {
  if (error instanceof PassageError) {
    const report = "report" in error ? error.report : undefined;
    const wrapped = new AnimationEngineError(
      "SCENE_INVALID",
      error.message,
      {
        diagnosticsJson: JSON.stringify(error.diagnostics),
        ...(report ? { reportJson: JSON.stringify(report) } : {}),
      },
      { cause: error },
    );
    return { exitCode: 2, failure: wrapped.toFailure() };
  }
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
  if (args[0] === "sfx" && args[1] === "generate") {
    try {
      const values = parseNamedArguments(args.slice(2), [
        "provider",
        "id",
        "prompt",
        "duration",
        "output-dir",
        "prompt-influence",
        "loop",
      ]);
      const loop = values.get("loop") ?? "false";
      if (loop !== "true" && loop !== "false")
        throw new SfxGenerationError("--loop must be true or false");
      const result = await generateSfx(
        {
          provider: requireArgument(values, "provider"),
          id: requireArgument(values, "id"),
          prompt: requireArgument(values, "prompt"),
          durationSeconds: Number(requireArgument(values, "duration")),
          promptInfluence: Number(values.get("prompt-influence") ?? "0.3"),
          loop: loop === "true",
        },
        { outputDir: requireArgument(values, "output-dir") },
      );
      io.stdout(JSON.stringify(result) + "\n");
      return 0;
    } catch (error) {
      if (!(error instanceof SfxGenerationError))
        return writeFailure(error, io);
      io.stderr(
        JSON.stringify({ status: "failed", message: error.message }) + "\n",
      );
      return 1;
    }
  }
  if (args[0] === "passage" && args[1] === "import-narration") {
    try {
      const values = parseNamedArguments(args.slice(2), [
        "plan",
        "narration",
        "timing",
        "mode",
        "output",
      ]);
      const mode = requireArgument(values, "mode");
      if (mode !== "match" && mode !== "add")
        throw new Error("--mode must be match or add");
      const result = await importNarrationFile({
        plan: requireArgument(values, "plan"),
        narration: requireArgument(values, "narration"),
        timing: requireArgument(values, "timing"),
        mode,
        output: requireArgument(values, "output"),
      });
      io.stdout(JSON.stringify(result) + "\n");
      return 0;
    } catch (error) {
      io.stderr(
        JSON.stringify({
          status: "failed",
          diagnostics: passageDiagnostics(error),
        }) + "\n",
      );
      return 1;
    }
  }
  if (args[0] === "batch") {
    try {
      const values = parseNamedArguments(args.slice(1), [
        "manifest",
        "output-dir",
        "concurrency",
        "format",
      ]);
      const { summary, exitCode } = await runBatch({
        manifestPath: requireArgument(values, "manifest"),
        outputDir: requireArgument(values, "output-dir"),
        concurrency: parseFiniteNumber(
          values.get("concurrency") ?? "1",
          "concurrency",
        ),
        format: parseOutputFormat(values.get("format")),
      });
      io.stdout(`${JSON.stringify(summary)}\n`);
      return exitCode;
    } catch (error) {
      return writeFailure(error, io);
    }
  }
  if (args[0] === "passage" && args[1] === "lint") {
    try {
      const values = parseNamedArguments(args.slice(2), ["plan", "format"]);
      const planPath = requireArgument(values, "plan");
      if (values.get("format") !== "vertical")
        throw new AnimationEngineError(
          "SCENE_INVALID",
          "Pass --format vertical to lint a vertical passage",
        );
      const passage = await readStoryPassage(planPath, {
        format: "vertical",
        lint: true,
      });
      const diagnostics = [
        ...passage.diagnostics,
        ...(passage.lintDiagnostics ?? []),
        ...passage.beats.flatMap((beat) =>
          lintVertical(beat.scene, { focusIds: beat.focus }).map(
            (diagnostic) => ({
              beat: beat.id,
              ...diagnostic,
            }),
          ),
        ),
      ];
      const status = diagnostics.some(
        (diagnostic) => diagnostic.severity === "error",
      )
        ? "failed"
        : "passed";
      io.stdout(
        `${JSON.stringify({ status, plan: passage.plan.id, format: "vertical", diagnostics })}\n`,
      );
      return status === "passed" ? 0 : 1;
    } catch (error) {
      if (error instanceof AnimationEngineError) return writeFailure(error, io);
      io.stderr(
        `${JSON.stringify({ status: "failed", diagnostics: passageDiagnostics(error) })}\n`,
      );
      return 1;
    }
  }
  if (args[0] === "comp" && args[1] === "export-json") {
    try {
      const values = parseNamedArguments(args.slice(2), ["scene", "output"]);
      const scenePath = resolve(requireArgument(values, "scene"));
      const scene = StorySceneSchema.parse(
        JSON.parse(await readFile(scenePath, "utf8")),
      );
      const composition = storyToComposition(scene);
      const output = values.get("output");
      if (!output) io.stdout(`${JSON.stringify(composition, null, 2)}\n`);
      else {
        const outputPath = resolve(output);
        composition.assets = composition.assets.map((asset) => ({
          ...asset,
          path: relative(
            dirname(outputPath),
            resolve(dirname(scenePath), asset.path),
          ),
        }));
        await writeFile(
          outputPath,
          `${JSON.stringify(composition, null, 2)}\n`,
          { flag: "wx" },
        );
        io.stdout(`${JSON.stringify({ status: "compiled", outputPath })}\n`);
      }
      return 0;
    } catch (error) {
      io.stderr(
        `${JSON.stringify({ status: "failed", diagnostics: passageDiagnostics(error) })}\n`,
      );
      return 1;
    }
  }
  if (args[0] === "comp" && args[1] === "render") {
    try {
      const values = parseNamedArguments(args.slice(2), ["input", "output"]);
      const result = await renderComposition({
        compositionPath: requireArgument(values, "input"),
        outputPath: requireArgument(values, "output"),
      });
      io.stdout(`${JSON.stringify(result)}\n`);
      return 0;
    } catch (error) {
      return writeFailure(error, io);
    }
  }
  if (args[0] === "prepare-commerce") {
    try {
      const values = parseNamedArguments(args.slice(1), ["brief", "output"]);
      const result = await prepareCommerceFile(
        requireArgument(values, "brief"),
        requireArgument(values, "output"),
      );
      io.stdout(JSON.stringify(result) + "\n");
      return 0;
    } catch (error) {
      return writeFailure(error, io);
    }
  }
  if (args[0] === "animate-scene") {
    try {
      const values = parseNamedArguments(args.slice(1), [
        "scene",
        "output",
        "format",
      ]);
      const requestedScenePath = requireArgument(values, "scene");
      const outputPath = requireArgument(values, "output");
      let scenePath = requestedScenePath;
      if (values.has("format")) {
        const format = parseOutputFormat(values.get("format"));
        scenePath = await resolveCatalogFormatVariant(scenePath, format);
        const expected = formatSize(format);
        let { scene } = await loadPreparedScene(scenePath);
        if (
          format === "vertical" &&
          scenePath === resolve(requestedScenePath) &&
          (scene.width !== expected.width || scene.height !== expected.height)
        ) {
          const authored = JSON.parse(await readFile(scenePath, "utf8"));
          let resolvedInput: object | undefined;
          if (authored.schemaVersion === "illustrated-scene-2") {
            const resolved = resolveCinematicFormat(
              CinematicSceneSchema.parse(authored),
              format,
            );
            for (const asset of resolved.assets)
              asset.path = resolve(dirname(scenePath), asset.path);
            if (resolved.provenance)
              resolved.provenance = resolve(
                dirname(scenePath),
                resolved.provenance,
              );
            resolvedInput = resolved;
          } else if (authored.schemaVersion === "story-scene-1") {
            const resolved = resolveStoryFormat(
              StorySceneSchema.parse(authored),
              format,
            );
            for (const asset of resolved.assets)
              asset.path = resolve(dirname(scenePath), asset.path);
            for (const font of resolved.fonts ?? [])
              font.path = resolve(dirname(scenePath), font.path);
            resolvedInput = resolved;
          }
          if (resolvedInput) {
            scenePath = await writeResolvedInput(outputPath, resolvedInput);
            ({ scene } = await loadPreparedScene(scenePath));
          }
        }
        if (scene.width !== expected.width || scene.height !== expected.height)
          throw new AnimationEngineError(
            "SCENE_INVALID",
            `Prepared scene is ${scene.width} × ${scene.height}; select a resolved ${values.get("format")} variant before rendering`,
          );
      }
      const result = await new PreparedAnimationEngine().animate({
        scenePath,
        outputPath,
      });
      io.stdout(`${JSON.stringify(result)}\n`);
      return 0;
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
