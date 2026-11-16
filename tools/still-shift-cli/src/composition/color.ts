/**
 * CGA commands: `comp color-stats`, `comp look fit|apply` and
 * `comp auto-color`. Folders are processed clip by clip with a summary.
 */
import { readdir, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import {
  autoColorClip,
  colorSampleOrdinals,
  fitColorLook,
  measureColorFrames,
  openColorClip,
  parseColorLook,
  readColorFrames,
  type AutoColorRequest,
  type ColorLook,
} from "@still-shift/animation-engine";
import { passageDiagnostics } from "@still-shift/renderer-core";
import { parseNamedArguments, requireArgument } from "../named-options.ts";
import { programError } from "./errors.ts";
import type { CompositionIo } from "./commands.ts";

const VIDEO = new Set([".mp4", ".mov", ".m4v", ".mkv"]);
const json = (value: unknown) => JSON.stringify(value) + "\n";
const isDirectory = (path: string) =>
  stat(path).then(
    (info) => info.isDirectory(),
    () => false,
  );
async function videos(path: string): Promise<string[]> {
  if (!(await isDirectory(path))) return [resolve(path)];
  return (await readdir(path))
    .filter(
      (name) => !name.startsWith(".") && VIDEO.has(extname(name).toLowerCase()),
    )
    .sort()
    .map((name) => resolve(path, name));
}
const flag = (values: Map<string, string>, name: string) => {
  const value = values.get(name);
  if (value === undefined) return undefined;
  if (value !== "true" && value !== "false")
    programError(
      "comp-program-option",
      `--${name} must be true or false`,
      name,
    );
  return value === "true";
};
const unit = (values: Map<string, string>, name: string) => {
  const text = values.get(name);
  if (text === undefined) return undefined;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || value > 1)
    programError("comp-program-option", `--${name} must be 0–1`, name);
  return value;
};
const count = (values: Map<string, string>, name: string, max: number) => {
  const text = values.get(name);
  if (text === undefined) return undefined;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 1 || value > max)
    programError(
      "comp-program-option",
      `--${name} must be an integer 1–${max}`,
      name,
    );
  return value;
};
const backend = (values: Map<string, string>) => {
  const value = values.get("backend") ?? "canvas2d";
  if (value !== "canvas2d" && value !== "webgl2")
    programError(
      "comp-program-option",
      "--backend must be canvas2d or webgl2",
      "backend",
    );
  return value;
};
async function loadLook(
  path: string | undefined,
): Promise<ColorLook | undefined> {
  if (path === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(await readFile(resolve(path), "utf8"));
  } catch {
    programError("comp-look-format", "Look file is not readable JSON", "look");
  }
  return parseColorLook(value);
}
const progress = (io: CompositionIo) => (message: string) =>
  io.stderr(json({ status: "progress", message }));

/** Run one clip or a folder; folders write `auto-color-summary.json`. */
async function runClips(
  io: CompositionIo,
  input: string,
  output: string | undefined,
  composition: string | undefined,
  base: Omit<AutoColorRequest, "input" | "output" | "writeComposition">,
): Promise<number> {
  const inputs = await videos(input);
  const folder = await isDirectory(input);
  if (!inputs.length)
    programError("comp-program-option", "No video files found", "input");
  if (!folder) {
    const report = await autoColorClip({
      ...base,
      input: inputs[0]!,
      output,
      writeComposition: composition,
      progress: progress(io),
    });
    io.stdout(
      json({
        status: output ? "rendered" : "composed",
        input: report.input.name,
        effects: report.effects,
        change: report.change,
        ...(report.output
          ? {
              output: {
                frameCount: report.output.frameCount,
                durationSeconds: report.output.durationSeconds,
                predictedRms: report.output.predictedRms,
                audio: report.output.audio,
              },
            }
          : {}),
      }),
    );
    return 0;
  }
  if (base.report !== undefined)
    programError(
      "comp-program-option",
      "--report names one file; a folder writes one report per clip",
      "report",
    );
  const items: unknown[] = [];
  let failed = 0;
  for (const path of inputs) {
    const stem = basename(path, extname(path));
    try {
      const report = await autoColorClip({
        ...base,
        input: path,
        output: output ? join(resolve(output), `${stem}.mp4`) : undefined,
        writeComposition: composition
          ? join(resolve(composition), `${stem}.composition.json`)
          : undefined,
        progress: progress(io),
      });
      items.push({
        input: report.input.name,
        status: "ok",
        effects: report.effects.map((effect) => effect.effect),
        change: report.change,
        ...(report.output
          ? {
              frameCount: report.output.frameCount,
              audio: report.output.audio !== null,
            }
          : {}),
      });
    } catch (error) {
      failed++;
      items.push({
        input: basename(path),
        status: "failed",
        diagnostics: passageDiagnostics(error),
      });
    }
  }
  const summaryDirectory = resolve(output ?? composition!);
  await mkdir(summaryDirectory, { recursive: true });
  const summary = { status: failed ? "partial" : "complete", items };
  await writeFile(
    join(summaryDirectory, "auto-color-summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
  io.stdout(json({ ...summary, items: items.length, failed }));
  return failed ? 1 : 0;
}

export async function runColorCommand(
  args: string[],
  io: CompositionIo,
): Promise<number> {
  const command = args[0];
  if (command === "color-stats") {
    const values = parseNamedArguments(args.slice(1), [
      "input",
      "frames",
      "output",
    ]);
    const clip = await openColorClip(requireArgument(values, "input"));
    const ordinals = colorSampleOrdinals(
      clip.probe.frameCount,
      count(values, "frames", 100_000) ?? 12,
    );
    const statistics = measureColorFrames(
      await readColorFrames(clip, ordinals),
      clip.probe.width,
    );
    const report = {
      input: { name: clip.name, sha256: clip.probe.sourceHash },
      color: clip.probe.color,
      sampledOrdinals: ordinals,
      statistics,
    };
    const output = values.get("output");
    if (output) {
      await writeFile(resolve(output), JSON.stringify(report, null, 2) + "\n");
      io.stdout(json({ status: "measured", output: resolve(output) }));
    } else io.stdout(JSON.stringify(report, null, 2) + "\n");
    return 0;
  }
  if (command === "look" && args[1] === "fit") {
    const values = parseNamedArguments(args.slice(2), [
      "before",
      "after",
      "output",
      "pairs-per-shot",
      "after-interpretation",
    ]);
    const interpretation = values.get("after-interpretation");
    if (
      interpretation !== undefined &&
      interpretation !== "code-values" &&
      interpretation !== "media-path"
    )
      programError(
        "comp-program-option",
        "--after-interpretation must be code-values or media-path",
        "after-interpretation",
      );
    const before: string[] = [];
    for (const entry of requireArgument(values, "before").split(","))
      before.push(...(await videos(entry)));
    const look = await fitColorLook(before, requireArgument(values, "after"), {
      ...(values.has("pairs-per-shot")
        ? { pairsPerShot: count(values, "pairs-per-shot", 64)! }
        : {}),
      ...(interpretation
        ? {
            afterInterpretation: interpretation as "code-values" | "media-path",
          }
        : {}),
      progress: progress(io),
    });
    const output = resolve(requireArgument(values, "output"));
    await writeFile(output, JSON.stringify(look, null, 2) + "\n");
    io.stdout(
      json({
        status: "fitted",
        output,
        shots: look.fit.shots.length,
        unmatchedShots: look.fit.unmatchedShots.length,
        residual: look.fit.residual,
        heldOut: look.fit.heldOut,
        summary: look.summary,
      }),
    );
    return 0;
  }
  if (command === "look" && args[1] === "apply") {
    const values = parseNamedArguments(args.slice(2), [
      "look",
      "input",
      "output",
      "strength",
      "write-composition",
      "report",
      "backend",
    ]);
    const look = await loadLook(requireArgument(values, "look"));
    return runClips(
      io,
      requireArgument(values, "input"),
      values.get("output"),
      values.get("write-composition"),
      {
        look,
        adaptive: false,
        lookStrength: unit(values, "strength"),
        report: values.get("report"),
        backend: backend(values),
      },
    );
  }
  if (command === "auto-color") {
    const values = parseNamedArguments(args.slice(1), [
      "input",
      "output",
      "look",
      "strength",
      "adaptive-strength",
      "adaptive",
      "exposure",
      "contrast",
      "saturation",
      "white-balance",
      "write-composition",
      "report",
      "frames",
      "backend",
    ]);
    const look = await loadLook(values.get("look"));
    const toggles = {
      exposure: flag(values, "exposure"),
      contrast: flag(values, "contrast"),
      saturation: flag(values, "saturation"),
      whiteBalance: flag(values, "white-balance"),
    };
    const explicitToggle = Object.values(toggles).some((value) => value);
    return runClips(
      io,
      requireArgument(values, "input"),
      values.get("output"),
      values.get("write-composition"),
      {
        look,
        // With a look, adaptive corrections run only when asked for.
        adaptive: flag(values, "adaptive") ?? (look ? explicitToggle : true),
        toggles: Object.fromEntries(
          Object.entries(toggles).filter(([, value]) => value !== undefined),
        ),
        // --strength scales the look when one is given (default 0.6), and
        // the adaptive corrections otherwise (default 1).
        ...(look
          ? {
              lookStrength: unit(values, "strength"),
              strength: unit(values, "adaptive-strength"),
            }
          : {
              strength:
                unit(values, "strength") ?? unit(values, "adaptive-strength"),
            }),
        report: values.get("report"),
        sampleFrames: count(values, "frames", 10_000),
        backend: backend(values),
      },
    );
  }
  programError(
    "comp-program-command",
    `Unknown composition command ${[command, args[1]].filter(Boolean).join(" ")}`,
    "command",
  );
}
