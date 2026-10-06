import { createProgramPreview } from "./preview.ts";
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
  passageDiagnostics,
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
      const values = parseNamedArguments(args.slice(1), ["input"]),
        input = requireArgument(values, "input");
      const program = await loadProgram(input);
      const source = await withProgramFile(
        program,
        input,
        readCompositionSource,
      );
      io.stdout(
        json({
          status: "valid",
          source: program.source,
          id: program.composition.id,
          diagnostics: source.warnings,
        }),
      );
      return 0;
    }
    if (command === "lint") {
      const values = parseNamedArguments(args.slice(1), [
          "input",
          "policy",
          "pixels",
        ]),
        input = requireArgument(values, "input");
      const pixels = booleanOption(values, "pixels"),
        path = values.get("policy");
      const policy = path
        ? CompositionQualityPolicySchema.parse(
            JSON.parse(await readFile(resolve(path), "utf8")),
          )
        : {};
      const program = await loadProgram(input);
      const report = await withProgramFile(program, input, (path) =>
        lintCompositionFile(path, policy, { pixels }),
      );
      io.stdout(json(report));
      return report.status === "failed" ? 1 : 0;
    }
    if (command === "render") {
      const values = parseNamedArguments(args.slice(1), [
          "input",
          "output",
          "backend",
        ]),
        input = requireArgument(values, "input");
      const backend = values.get("backend") ?? "canvas2d";
      if (backend !== "canvas2d" && backend !== "webgl2")
        programError(
          "comp-program-option",
          "Composition backend must be canvas2d or webgl2",
          "backend",
        );
      const program = await loadProgram(input);
      const result = await withProgramFile(program, input, (path) =>
        renderComposition({
          compositionPath: path,
          outputPath: requireArgument(values, "output"),
          backend,
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
