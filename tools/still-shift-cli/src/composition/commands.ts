import { createProgramPreview } from "./preview.ts";
import { writeSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  compileCommerceComposition,
  compileStoryComposition,
  lintCompositionFile,
  readCompositionSource,
  renderComposition,
} from "@still-shift/animation-engine";
import {
  bakeExpressions,
  cinematicToComposition,
  legacyToComposition,
  CompositionQualityPolicySchema,
  type CompositionQualityPolicy,
  TEXT_LEGIBILITY_CODES,
  type TextLegibilityCode,
  passageDiagnostics,
  type CompositionBackend,
} from "@still-shift/renderer-core";
import {
  CommerceSceneSchema,
  CinematicSceneSchema,
  PreparedSceneSchema,
  StorySceneSchema,
  normalizeExpressions,
  type CompositionDiagnostic,
} from "@still-shift/scene-contract";
import { parseNamedArguments, requireArgument } from "../named-options.ts";
import { loadProgram } from "./program.ts";
import { CompositionProgramError, programError } from "./errors.ts";
import { withProgramFile, writeComposition } from "./files.ts";
import {
  ownProcessSignals,
  signalExitCode,
  type OwnedSignal,
} from "./process-signals.ts";
import {
  COMPOSITION_OUTPUT_FORMATS,
  type CompositionOutputFormat,
} from "@still-shift/execution-runtime/export";
export type CompositionIo = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};
const json = (value: unknown) => JSON.stringify(value) + "\n";
const programRuntimeFailures = new Set([
  "comp-program-file",
  "comp-program-timeout",
  "comp-program-output",
  "comp-program-load",
  "comp-program-aborted",
]);
const booleanOption = (values: Map<string, string>, name: string) => {
  const value = values.get(name) ?? "false";
  if (!["true", "false"].includes(value))
    programError(
      "comp-program-option",
      `--${name} must be true or false`,
      name,
    );
  return value === "true";
};
function backendOption(values: Map<string, string>): CompositionBackend {
  const backend = values.get("backend") ?? "canvas2d";
  if (backend !== "canvas2d" && backend !== "webgl2")
    programError(
      "comp-program-option",
      "Composition backend must be canvas2d or webgl2",
      "backend",
    );
  return backend;
}
function fontCoverageOption(values: Map<string, string>) {
  const value = values.get("font-coverage");
  if (value !== undefined && value !== "legacy" && value !== "strict")
    programError(
      "comp-program-option",
      "--font-coverage must be legacy or strict",
      "font-coverage",
    );
  return value as "legacy" | "strict" | undefined;
}
/** ET3: `--strict text-contrast[,x-height-floor,platform-safe-zone]`. */
function strictLegibilityOption(values: Map<string, string>) {
  const value = values.get("strict");
  if (value === undefined) return [];
  const codes = value.split(",").map((code) => code.trim());
  if (
    !codes.length ||
    codes.some(
      (code) => !TEXT_LEGIBILITY_CODES.includes(code as TextLegibilityCode),
    )
  )
    programError(
      "comp-program-option",
      `--strict takes a comma-separated list of ${TEXT_LEGIBILITY_CODES.join(", ")}`,
      "strict",
    );
  return [...new Set(codes)] as TextLegibilityCode[];
}
/**
 * ET3: `--legibility true` declares the legibility rules with their defaults;
 * `--strict` declares them too and raises the named codes to errors. The
 * `textLegibility` and severities in effect are kept, except that strict codes
 * always gate. Lint merges the policy over the composition's saved
 * `metadata.readingPolicy` one key at a time, so they come from the policy
 * file when it sets them and otherwise from the saved policy; replacing them
 * here without the saved values would drop its waivers, safe zones, targets
 * and unrelated severities.
 */
function withLegibilityOptions(
  policy: CompositionQualityPolicy,
  legibility: boolean,
  strict: TextLegibilityCode[],
  savedPolicy: unknown,
): CompositionQualityPolicy {
  if (!legibility && !strict.length) return policy;
  // An invalid saved policy is rejected later by the lint's own resolution.
  const saved =
    savedPolicy &&
    typeof savedPolicy === "object" &&
    !Array.isArray(savedPolicy)
      ? (savedPolicy as Pick<
          CompositionQualityPolicy,
          "textLegibility" | "severities"
        >)
      : {};
  return {
    ...policy,
    textLegibility: policy.textLegibility ?? saved.textLegibility ?? {},
    ...(strict.length
      ? {
          severities: {
            ...(policy.severities ?? saved.severities),
            ...Object.fromEntries(strict.map((code) => [code, "error"])),
          },
        }
      : {}),
  };
}
/**
 * ET2: own SIGINT/SIGTERM/SIGHUP while `run` works, so media staging, the
 * media cache lock, the lint dev-server cache and the compiled program are
 * removed by their owners instead of being left by process exit. All three:
 * the browser is launched without Playwright's handlers for them, so an
 * unowned one would end the process with no cleanup (a closed terminal or
 * dropped SSH session sends SIGHUP). After a cancel and cleanup, report
 * `comp-program-aborted` and exit as a process ended by that signal would
 * (130 for SIGINT), so callers can tell an interrupted command from one with
 * findings.
 */
async function withOwnedSignals(
  command: string,
  io: CompositionIo,
  run: (signal: AbortSignal) => Promise<number>,
): Promise<number> {
  const controller = new AbortController();
  let cancelledBy: OwnedSignal | undefined;
  const aborted = (message: string) => ({
    code: "comp-program-aborted",
    severity: "error" as const,
    path: "input",
    message,
  });
  const releaseSignals = ownProcessSignals({
    cancel: (signal) => {
      cancelledBy = signal;
      controller.abort(
        new CompositionProgramError([
          aborted(`Composition ${command} cancelled by ${signal}`),
        ]),
      );
    },
    // A signal after the relay window means cleanup is taking too long for
    // the user: stop now, as an unowned signal would. Written synchronously,
    // because stderr to a pipe is asynchronous on macOS.
    force: (signal) => {
      writeSync(
        2,
        json({
          status: "failed",
          diagnostics: [
            aborted(
              `Composition ${command} stopped by repeated ${signal} before cleanup finished; temporary files may remain`,
            ),
          ],
        }),
      );
      process.exit(signalExitCode(signal));
    },
  });
  try {
    return await run(controller.signal);
  } catch (error) {
    if (!cancelledBy) throw error;
    io.stderr(
      json({
        status: "failed",
        diagnostics: diagnostics(controller.signal.reason),
      }),
    );
    return signalExitCode(cancelledBy);
  } finally {
    releaseSignals();
  }
}
function diagnostics(error: unknown): CompositionDiagnostic[] {
  if (error instanceof CompositionProgramError) return error.diagnostics;
  if (
    error &&
    typeof error === "object" &&
    "context" in error &&
    error.context &&
    typeof error.context === "object" &&
    "diagnosticsJson" in error.context &&
    typeof error.context.diagnosticsJson === "string"
  ) {
    return JSON.parse(error.context.diagnosticsJson) as CompositionDiagnostic[];
  }
  return passageDiagnostics(error).map((d) => ({ ...d, path: d.path ?? "" }));
}
export async function runCompositionCommand(
  args: string[],
  io: CompositionIo,
  renderFailure: (error: unknown, io: CompositionIo) => number,
): Promise<number> {
  const command = args[0];
  try {
    if (command === "preview") {
      const normalized = args
        .slice(1)
        .flatMap((value, index, array) =>
          value === "--watch" &&
          (array[index + 1] === undefined || array[index + 1]!.startsWith("--"))
            ? [value, "true"]
            : [value],
        );
      const values = parseNamedArguments(normalized, [
        "input",
        "watch",
        "port",
      ]);
      const portText = values.get("port"),
        port = portText === undefined ? 0 : Number(portText);
      if (!Number.isInteger(port) || port < 0 || port > 65535)
        programError(
          "comp-program-option",
          "--port must be an integer from 0 to 65535",
          "port",
        );
      const session = await createProgramPreview(
        requireArgument(values, "input"),
        { watch: booleanOption(values, "watch"), port },
      );
      io.stdout(
        json({
          status: "preview",
          url: session.url,
          watch: booleanOption(values, "watch"),
        }),
      );
      await new Promise<void>((done) => {
        const close = () => {
          process.off("SIGINT", close);
          process.off("SIGTERM", close);
          void session.close().then(done);
        };
        process.once("SIGINT", close);
        process.once("SIGTERM", close);
      });
      return 0;
    }
    if (command === "export-json") {
      const values = parseNamedArguments(args.slice(1), [
        "input",
        "scene",
        "output",
        "normalized",
      ]);
      const input = values.get("input"),
        scene = values.get("scene");
      if ((input === undefined) === (scene === undefined))
        programError(
          "comp-program-option",
          "Specify exactly one of --input or --scene",
          "input",
        );
      const source = resolve(input ?? scene!);
      let composition;
      if (input) composition = (await loadProgram(source)).composition;
      else {
        const value: unknown = JSON.parse(await readFile(source, "utf8"));
        if (
          value &&
          typeof value === "object" &&
          "schemaVersion" in value &&
          value.schemaVersion === "illustrated-scene-2"
        )
          composition = cinematicToComposition(
            CinematicSceneSchema.parse(value),
          );
        else if (
          value &&
          typeof value === "object" &&
          "schemaVersion" in value &&
          value.schemaVersion === "illustrated-scene-1"
        )
          composition = legacyToComposition(PreparedSceneSchema.parse(value));
        else
          composition =
            value &&
            typeof value === "object" &&
            "schemaVersion" in value &&
            value.schemaVersion === "commerce-scene-1"
              ? await compileCommerceComposition(
                  CommerceSceneSchema.parse(value),
                  dirname(source),
                )
              : await compileStoryComposition(
                  StorySceneSchema.parse(value),
                  dirname(source),
                );
        composition.assets = await Promise.all(
          composition.assets.map(async (asset) => {
            const path = resolve(dirname(source), asset.path);
            return { ...asset, path: await realpath(path).catch(() => path) };
          }),
        );
      }
      if (booleanOption(values, "normalized"))
        composition = normalizeExpressions(composition);
      const result = await writeComposition(
        composition,
        source,
        values.get("output"),
      );
      io.stdout(
        result.outputPath
          ? json({ status: "compiled", outputPath: result.outputPath })
          : result.text,
      );
      return 0;
    }
    if (command === "bake" || command === "normalize") {
      const values = parseNamedArguments(args.slice(1), ["input", "output"]),
        input = requireArgument(values, "input");
      const program = await loadProgram(input);
      const result =
        command === "bake"
          ? bakeExpressions(program.composition)
          : {
              ok: true as const,
              composition: normalizeExpressions(program.composition),
              diagnostics: [],
              baked: undefined,
            };
      if (!result.ok) throw new CompositionProgramError(result.diagnostics);
      const written = await writeComposition(
        result.composition,
        input,
        values.get("output"),
      );
      io.stdout(
        written.outputPath
          ? json({
              status: command === "bake" ? "baked" : "normalized",
              outputPath: written.outputPath,
              ...(result.baked ? { baked: result.baked } : {}),
              diagnostics: result.diagnostics,
            })
          : written.text,
      );
      return 0;
    }
    if (command === "validate") {
      const values = parseNamedArguments(args.slice(1), [
          "input",
          "font-coverage",
        ]),
        input = requireArgument(values, "input");
      const fontCoverage = fontCoverageOption(values);
      const program = await loadProgram(input);
      const source = await withProgramFile(program, input, (path) =>
        readCompositionSource(path, fontCoverage ? { fontCoverage } : {}),
      );
      io.stdout(
        json({
          status: "valid",
          source: program.source,
          id: program.composition.id,
          diagnostics: source.warnings,
          fontCoverage: source.fontCoverage,
        }),
      );
      return 0;
    }
    if (command === "lint") {
      const values = parseNamedArguments(args.slice(1), [
          "input",
          "policy",
          "pixels",
          "backend",
          "font-coverage",
          "legibility",
          "strict",
        ]),
        input = requireArgument(values, "input");
      const backend = backendOption(values);
      const fontCoverage = fontCoverageOption(values);
      const pixels = booleanOption(values, "pixels"),
        path = values.get("policy");
      const strict = strictLegibilityOption(values);
      const legibility = booleanOption(values, "legibility");
      const filePolicy = path
        ? CompositionQualityPolicySchema.parse(
            JSON.parse(await readFile(resolve(path), "utf8")),
          )
        : {};
      return await withOwnedSignals("lint", io, async (signal) => {
        const program = await loadProgram(input, { signal });
        signal.throwIfAborted();
        // After loading: the flags must keep the saved reading policy's values.
        const policy = withLegibilityOptions(
          filePolicy,
          legibility,
          strict,
          program.composition.metadata?.readingPolicy,
        );
        const report = await withProgramFile(program, input, (path) =>
          lintCompositionFile(path, policy, {
            pixels,
            backend,
            signal,
            ownsProcessSignals: true,
            ...(fontCoverage ? { fontCoverage } : {}),
          }),
        );
        io.stdout(json(report));
        return report.status === "failed" ? 1 : 0;
      });
    }
    if (command === "render") {
      const values = parseNamedArguments(args.slice(1), [
          "input",
          "output",
          "backend",
          "format",
          "transport",
          "workers",
          "cache-static",
          "font-coverage",
        ]),
        input = requireArgument(values, "input");
      const backend = backendOption(values);
      const fontCoverage = fontCoverageOption(values);
      const workers = values.get("workers");
      if (workers !== undefined && !/^[1-4]$/.test(workers))
        programError(
          "comp-program-option",
          "--workers must be 1, 2, 3 or 4",
          "workers",
        );
      const cacheStatic = values.has("cache-static")
        ? booleanOption(values, "cache-static")
        : undefined;
      const format = values.get("format");
      if (
        format !== undefined &&
        !COMPOSITION_OUTPUT_FORMATS.includes(format as CompositionOutputFormat)
      )
        programError(
          "comp-program-option",
          `--format must be ${COMPOSITION_OUTPUT_FORMATS.join(", ")}`,
          "format",
        );
      const transport = values.get("transport");
      if (
        transport !== undefined &&
        transport !== "png_pipe" &&
        transport !== "raw_rgba" &&
        transport !== "jpeg_pipe"
      )
        programError(
          "comp-program-option",
          "--transport must be png_pipe, raw_rgba or jpeg_pipe",
          "transport",
        );
      const program = await loadProgram(input);
      const result = await withProgramFile(program, input, (path) =>
        renderComposition({
          compositionPath: path,
          outputPath: requireArgument(values, "output"),
          backend,
          ...(format ? { format: format as CompositionOutputFormat } : {}),
          ...(workers ? { workers: Number(workers) as 1 | 2 | 3 | 4 } : {}),
          ...(cacheStatic === undefined ? {} : { cacheStatic }),
          ...(fontCoverage ? { fontCoverage } : {}),
          ...(transport
            ? { transport: transport as "png_pipe" | "raw_rgba" | "jpeg_pipe" }
            : {}),
        }),
      );
      io.stdout(json(result));
      return 0;
    }
    programError(
      "comp-program-command",
      `Unknown composition command ${command ?? ""}`,
      "command",
    );
  } catch (error) {
    if (command === "render" && !(error instanceof CompositionProgramError))
      return renderFailure(error, io);
    const findings = diagnostics(error);
    io.stderr(json({ status: "failed", diagnostics: findings }));
    return command === "render" &&
      findings.every(
        (finding) =>
          finding.code.startsWith("comp-") &&
          !programRuntimeFailures.has(finding.code),
      )
      ? 2
      : 1;
  }
}
