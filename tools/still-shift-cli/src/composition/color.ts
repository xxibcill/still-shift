/**
 * CGA commands: `comp color-stats`, `comp look fit|apply|export` and
 * `comp auto-color`. Folders are processed clip by clip with a summary.
 */
import {
  access,
  readdir,
  readFile,
  stat,
  writeFile,
  mkdir,
} from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import {
  autoColorClip,
  autoColorDiffPaths,
  cdlFileKind,
  COLOR_LOOK_MODELS,
  colorSampleOrdinals,
  exportColorLook,
  fitColorLook,
  fitColorLook2,
  loadColorLookLuts,
  measureColorFrames,
  openColorClip,
  parseAnyColorLook,
  readColorFrames,
  type AnyColorLook,
  type AutoColorRequest,
  type ColorLookLut,
  type ColorLookModel,
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
/** A correction switch: true, false or a 0–1 scale. */
const correction = (values: Map<string, string>, name: string) => {
  const value = values.get(name);
  if (value === undefined) return undefined;
  if (value === "true" || value === "false") return value === "true";
  const scale = Number(value);
  if (value.trim() === "" || !Number.isFinite(scale) || scale < 0 || scale > 1)
    programError(
      "comp-program-option",
      `--${name} must be true, false or a scale 0–1`,
      name,
    );
  return scale;
};
const unit = (values: Map<string, string>, name: string) => {
  const text = values.get(name);
  if (text === undefined) return undefined;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || value > 1)
    programError("comp-program-option", `--${name} must be 0–1`, name);
  return value;
};
export const count = (
  values: Map<string, string>,
  name: string,
  max: number,
) => {
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
export const backend = (values: Map<string, string>) => {
  const value = values.get("backend") ?? "canvas2d";
  if (value !== "canvas2d" && value !== "webgl2")
    programError(
      "comp-program-option",
      "--backend must be canvas2d or webgl2",
      "backend",
    );
  return value;
};
/** `--engine grade|legacy` (CGA2); absent leaves the request's default. */
const engine = (values: Map<string, string>) => {
  const value = values.get("engine");
  if (value === undefined) return {};
  if (value !== "grade" && value !== "legacy")
    programError(
      "comp-program-option",
      "--engine must be grade or legacy",
      "engine",
    );
  return { engine: value as "grade" | "legacy" };
};
/**
 * CGA2 A2: `--scopes true|false` (report 2 for legacy runs) and `--diff
 * <folder>` (split still and contact sheet per clip).
 */
const reportOptions = (values: Map<string, string>) => {
  const scopes = flag(values, "scopes");
  const diff = values.get("diff");
  return {
    ...(scopes === undefined ? {} : { scopes }),
    ...(diff === undefined ? {} : { diff }),
  };
};
/** A look-1 or look-2 file and its verified LUT assets. */
async function loadLook(path: string | undefined): Promise<{
  look?: AnyColorLook;
  lookLuts?: Map<string, ColorLookLut>;
}> {
  if (path === undefined) return {};
  let value: unknown;
  try {
    value = JSON.parse(await readFile(resolve(path), "utf8"));
  } catch {
    programError("comp-look-format", "Look file is not readable JSON", "look");
  }
  const look = parseAnyColorLook(value);
  const lookLuts = await loadColorLookLuts(look, path);
  return { look, ...(lookLuts.size ? { lookLuts } : {}) };
}
/** Outputs are never overwritten: resolve a path that must not exist yet. */
export async function newOutput(path: string, option: string): Promise<string> {
  const resolved = resolve(path);
  if (
    await access(resolved).then(
      () => true,
      () => false,
    )
  )
    programError(
      "comp-program-output",
      `${resolved} already exists; choose a new path`,
      option,
    );
  return resolved;
}
/** Write a new file; fails rather than replacing one that appeared meanwhile. */
export async function writeNew(path: string, text: string, option: string) {
  try {
    await writeFile(path, text, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      programError(
        "comp-program-output",
        `${path} already exists; choose a new path`,
        option,
      );
    throw error;
  }
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
  /** `--diff` files of one clip, and whether after is the render or the prediction. */
  const diffOf = (path: string) =>
    base.diff === undefined
      ? {}
      : {
          diff: {
            ...autoColorDiffPaths(base.diff, path),
            after: output ? "output" : "prediction",
          },
        };
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
        ...(report.scopes ? { scopesChange: report.scopes.change } : {}),
        ...diffOf(inputs[0]!),
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
  const summaryPath = await newOutput(
    join(resolve(output ?? composition!), "auto-color-summary.json"),
    output ? "output" : "write-composition",
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
        ...(report.scopes ? { scopesChange: report.scopes.change } : {}),
        ...diffOf(path),
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
  await mkdir(dirname(summaryPath), { recursive: true });
  const summary = { status: failed ? "partial" : "complete", items };
  await writeNew(
    summaryPath,
    JSON.stringify(summary, null, 2) + "\n",
    output ? "output" : "write-composition",
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
    const output = values.has("output")
      ? await newOutput(values.get("output")!, "output")
      : undefined;
    const clip = await openColorClip(requireArgument(values, "input"));
    const ordinals = colorSampleOrdinals(
      clip.probe.frameCount,
      count(values, "frames", 100_000) ?? 12,
    );
    const statistics = measureColorFrames({
      frames: await readColorFrames(clip, ordinals),
      width: clip.probe.width,
    });
    const report = {
      input: { name: clip.name, sha256: clip.probe.sourceHash },
      color: clip.probe.color,
      sampledOrdinals: ordinals,
      statistics,
    };
    if (output) {
      await writeNew(output, JSON.stringify(report, null, 2) + "\n", "output");
      io.stdout(json({ status: "measured", output }));
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
      "engine",
      "model",
    ]);
    const lookEngine = engine(values).engine ?? "legacy";
    const model = values.get("model");
    if (
      model !== undefined &&
      model !== "auto" &&
      !(COLOR_LOOK_MODELS as readonly string[]).includes(model)
    )
      programError(
        "comp-program-option",
        `--model must be auto, ${COLOR_LOOK_MODELS.join(", ")}`,
        "model",
      );
    if (model !== undefined && lookEngine !== "grade")
      programError(
        "comp-program-option",
        "--model chooses a look-2 model; it needs --engine grade",
        "model",
      );
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
    // Check the outputs before decoding and fitting (minutes on real clips).
    const output = await newOutput(requireArgument(values, "output"), "output");
    // A LUT look's table is written beside it: <output stem>.cube.
    const cubePath =
      model === "lut"
        ? await newOutput(
            join(dirname(output), `${basename(output, extname(output))}.cube`),
            "output",
          )
        : undefined;
    if (cubePath === output)
      programError(
        "comp-program-option",
        "A LUT look's table is written as <output stem>.cube; give the look a .json name",
        "output",
      );
    const before: string[] = [];
    for (const entry of requireArgument(values, "before").split(","))
      before.push(...(await videos(entry)));
    const fitOptions = {
      ...(values.has("pairs-per-shot")
        ? { pairsPerShot: count(values, "pairs-per-shot", 64)! }
        : {}),
      ...(interpretation
        ? {
            afterInterpretation: interpretation as "code-values" | "media-path",
          }
        : {}),
      progress: progress(io),
    };
    if (lookEngine === "grade") {
      const { look, cube } = await fitColorLook2(
        before,
        requireArgument(values, "after"),
        {
          ...fitOptions,
          model: (model ?? "auto") as "auto" | ColorLookModel,
          ...(cubePath ? { lutPath: basename(cubePath) } : {}),
        },
      );
      if (cubePath && cube !== undefined)
        await writeNew(cubePath, cube, "output");
      await writeNew(output, JSON.stringify(look, null, 2) + "\n", "output");
      io.stdout(
        json({
          status: "fitted",
          output,
          ...(cubePath ? { lut: cubePath } : {}),
          schemaVersion: look.schemaVersion,
          model: look.model,
          space: look.space,
          shots: look.fit.shots.length,
          unmatchedShots: look.fit.unmatchedShots.length,
          residual: look.fit.residual,
          heldOut: look.fit.heldOut,
          candidates: look.fit.candidates.map((candidate) => ({
            model: candidate.model,
            space: candidate.space,
            score: candidate.score,
            heldOutRms: candidate.heldOut?.rmsMean ?? null,
            selected: candidate.selected,
          })),
          summary: look.summary,
        }),
      );
      return 0;
    }
    const look = await fitColorLook(
      before,
      requireArgument(values, "after"),
      fitOptions,
    );
    await writeNew(output, JSON.stringify(look, null, 2) + "\n", "output");
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
      "engine",
      "scopes",
      "diff",
    ]);
    const look = await loadLook(requireArgument(values, "look"));
    return runClips(
      io,
      requireArgument(values, "input"),
      values.get("output"),
      values.get("write-composition"),
      {
        ...look,
        adaptive: false,
        lookStrength: unit(values, "strength"),
        report: values.get("report"),
        backend: backend(values),
        ...engine(values),
        ...reportOptions(values),
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
      "engine",
      "scopes",
      "diff",
    ]);
    const { look, lookLuts } = await loadLook(values.get("look"));
    const toggles = {
      exposure: correction(values, "exposure"),
      contrast: correction(values, "contrast"),
      saturation: correction(values, "saturation"),
      whiteBalance: correction(values, "white-balance"),
    };
    // true or a nonzero scale asks for that correction.
    const explicitToggle = Object.values(toggles).some((value) =>
      typeof value === "number" ? value > 0 : value === true,
    );
    return runClips(
      io,
      requireArgument(values, "input"),
      values.get("output"),
      values.get("write-composition"),
      {
        look,
        ...(lookLuts ? { lookLuts } : {}),
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
        ...engine(values),
        ...reportOptions(values),
      },
    );
  }
  if (command === "look" && args[1] === "export") {
    const values = parseNamedArguments(args.slice(2), [
      "look",
      "cube",
      "cdl",
      "size",
      "title",
      "strength",
    ]);
    const cube = values.get("cube"),
      cdl = values.get("cdl");
    if ((cube === undefined) === (cdl === undefined))
      programError(
        "comp-program-option",
        "Give exactly one of --cube <new.cube> or --cdl <new.cc|.ccc|.cdl>",
        "cube",
      );
    const kind = cdl === undefined ? undefined : cdlFileKind(cdl);
    if (cdl !== undefined && !kind)
      programError(
        "comp-program-option",
        "--cdl must end in .cc, .ccc or .cdl",
        "cdl",
      );
    if (cdl !== undefined)
      for (const name of ["size", "title", "strength"])
        if (values.has(name))
          programError(
            "comp-program-option",
            `--${name} applies to --cube only`,
            name,
          );
    const output = await newOutput((cube ?? cdl)!, cube ? "cube" : "cdl");
    const { look, lookLuts } = await loadLook(requireArgument(values, "look"));
    const { text, report } = exportColorLook(
      look!,
      lookLuts ?? new Map(),
      kind
        ? { format: kind }
        : {
            format: "cube",
            size: count(values, "size", 129),
            title: values.get("title"),
            strength: unit(values, "strength"),
          },
    );
    await writeNew(output, text, cube ? "cube" : "cdl");
    io.stdout(json({ status: "exported", output, ...report }));
    return 0;
  }
  programError(
    "comp-program-command",
    `Unknown composition command ${[command, args[1]].filter(Boolean).join(" ")}`,
    "command",
  );
}
