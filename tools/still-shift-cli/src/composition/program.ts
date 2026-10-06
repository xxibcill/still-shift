import { createHash } from "node:crypto";
import { authoredFontDiagnostics } from "@still-shift/motion";
import { CompositionProgramError, programError } from "./errors.ts";
import { createRequire } from "node:module";
import { stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, extname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
export type LoadedProgram = {
  composition: Composition;
  document?: Composition;
  sourceSha256?: string;
  dependencies: string[];
  source: "json" | "builder";
};
export type ProgramLimits = {
  timeoutMs?: number;
  maxOutputBytes?: number;
  signal?: AbortSignal;
};
export async function loadProgram(
  path: string,
  limits: ProgramLimits = {},
): Promise<LoadedProgram> {
  const requested = resolve(path),
    input = await realpath(requested).catch(() => requested),
    extension = extname(input);
  let sourceSha256: string | undefined;
  let value: unknown,
    dependencies = [input];
  if (extension === ".json") {
    let text: string;
    try {
      const bytes = await readFile(input);
      text = bytes.toString("utf8");
      sourceSha256 = createHash("sha256").update(bytes).digest("hex");
    } catch (error) {
      programError(
        "comp-program-file",
        String(error instanceof Error ? error.message : error),
        input,
      );
    }
    try {
      value = JSON.parse(text!);
    } catch (error) {
      programError(
        "comp-program-json",
        String(error instanceof Error ? error.message : error),
        input,
      );
    }
  } else {
    if (![".ts", ".mts", ".cts"].includes(extension))
      programError("comp-program-type", "Use .json, .ts, .mts or .cts", input);
    const timeoutMs = limits.timeoutMs ?? 30000,
      maxOutputBytes = limits.maxOutputBytes ?? 1048576;
    const directory = await mkdtemp(join(tmpdir(), "still-shift-program-"));
    const output = join(directory, "result.json"),
      trace = join(directory, "dependencies.jsonl");
    try {
      const child = spawn(
        process.execPath,
        [
          "--import",
          createRequire(import.meta.url).resolve("tsx"),
          fileURLToPath(new URL("./runner.ts", import.meta.url)),
          input,
          output,
          trace,
        ],
        {
          stdio: ["ignore", "pipe", "pipe"],
          ...(limits.signal ? { signal: limits.signal } : {}),
        },
      );
      let diagnostic = "",
        bytes = 0,
        timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);
      for (const stream of [child.stdout, child.stderr])
        stream.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > maxOutputBytes) child.kill("SIGKILL");
          if (diagnostic.length < 16000)
            diagnostic += chunk.toString().slice(0, 16000 - diagnostic.length);
        });
      let code: number | null;
      try {
        code = await new Promise<number | null>((yes, no) => {
          let failure: Error | undefined;
          child.on("error", (error) => {
            failure = error;
          });
          child.on("close", (code) => {
            if (failure) no(failure);
            else yes(code);
          });
        });
      } finally {
        clearTimeout(timeout);
      }
      if (timedOut)
        programError(
          "comp-program-timeout",
          `Builder exceeded ${timeoutMs} milliseconds`,
          input,
        );
      if (bytes > maxOutputBytes)
        programError(
          "comp-program-output",
          `Builder exceeded ${maxOutputBytes} bytes of console output`,
          input,
        );
      if (
        ((await stat(output).catch(() => undefined))?.size ?? 0) >
        20 * 1024 * 1024
      )
        programError(
          "comp-program-size",
          "Compiled JSON exceeds 20 MiB",
          input,
        );
      const result = JSON.parse(
        await readFile(output, "utf8").catch(() => {
          programError(
            "comp-program-load",
            `Exit ${code}: ${diagnostic}`,
            input,
          );
        }),
      );
      if (!result.ok) {
        dependencies = Array.isArray(result.dependencies)
          ? result.dependencies.filter(
              (path: unknown): path is string => typeof path === "string",
            )
          : [];
        throw new CompositionProgramError(
          [
            {
              code: String(result.diagnostic.code),
              severity: "error",
              message: String(result.diagnostic.message),
              path:
                typeof result.diagnostic.path === "string"
                  ? result.diagnostic.path
                  : input,
            },
          ],
          dependencies,
        );
      }
      value = result.input;
      dependencies = [
        ...new Set([
          input,
          ...(await readFile(trace, "utf8"))
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line) as string),
        ]),
      ];
    } catch (error) {
      const traced = await readFile(trace, "utf8").catch(() => "");
      dependencies = [
        ...new Set([
          input,
          ...(error instanceof CompositionProgramError
            ? error.dependencies
            : []),
          ...traced
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line) as string),
        ]),
      ];
      if (error instanceof CompositionProgramError)
        throw new CompositionProgramError(error.diagnostics, dependencies);
      programError(
        limits.signal?.aborted ? "comp-program-aborted" : "comp-program-load",
        error instanceof Error ? error.message : String(error),
        input,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  const validation = validateComposition(value);
  if (!validation.ok)
    throw new CompositionProgramError(validation.diagnostics, dependencies);
  const composition = validation.composition;
  const fontIssues = authoredFontDiagnostics(composition);
  if (fontIssues.length)
    throw new CompositionProgramError(fontIssues, dependencies);
  // Resolve JSON paths lexically before following directory aliases such as /var.
  const assetDirectory = dirname(extension === ".json" ? requested : input);
  composition.assets = await Promise.all(
    composition.assets.map(async (asset) => {
      const resolved = resolve(assetDirectory, asset.path);
      return {
        ...asset,
        path: await realpath(resolved).catch(async () => {
          const parent = await realpath(dirname(resolved)).catch(
            () => undefined,
          );
          return parent ? join(parent, basename(resolved)) : resolved;
        }),
      };
    }),
  );
  return {
    composition,
    ...(sourceSha256
      ? { document: structuredClone(value) as Composition, sourceSha256 }
      : {}),
    dependencies,
    source: extension === ".json" ? "json" : "builder",
  };
}
