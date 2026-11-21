/**
 * CG3 commands: `comp scopes`, `comp probe` and `comp grade diff`; CG5:
 * `comp grade bake`, `comp grade cdl-export` and `comp grade cdl-import`.
 * Reports are deterministic JSON; outputs (report, images, stills, LUTs,
 * CDL files) are never overwritten.
 */
import { readFile } from "node:fs/promises";
import {
  bakeCompositionGrade,
  cdlFileKind,
  exportCompositionCdl,
  importCdl,
  diffColorGrade,
  measureColorScopes,
  probeCompositionFile,
} from "@still-shift/animation-engine";
import { parseNamedArguments, requireArgument } from "../named-options.ts";
import { programError } from "./errors.ts";
import type { CompositionIo } from "./commands.ts";
import { backend, count, newOutput, writeNew } from "./color.ts";

const json = (value: unknown) => JSON.stringify(value) + "\n";

function integers(text: string, option: string, length: number): number[] {
  const values = text.split(",").map((part) => Number(part.trim()));
  if (values.length !== length || !values.every(Number.isInteger))
    programError(
      "comp-program-option",
      `--${option} must be ${length} comma-separated integers`,
      option,
    );
  return values;
}
const regionOf = (values: Map<string, string>) => {
  const text = values.get("region");
  if (text === undefined) return undefined;
  const [x, y, width, height] = integers(text, "region", 4) as [
    number,
    number,
    number,
    number,
  ];
  return { x, y, width, height };
};
function frameRange(values: Map<string, string>) {
  const text = values.get("frame-range");
  if (text === undefined) return undefined;
  const match = /^(\d+):(\d+)$/.exec(text);
  if (!match)
    programError(
      "comp-program-option",
      "--frame-range must be start:end (end exclusive)",
      "frame-range",
    );
  return [Number(match![1]), Number(match![2])] as const;
}
function flag(values: Map<string, string>, name: string) {
  const text = values.get(name);
  if (text === undefined) return undefined;
  if (text !== "true" && text !== "false")
    programError(
      "comp-program-option",
      `--${name} must be true or false`,
      name,
    );
  return text === "true";
}
function wholeFrame(values: Map<string, string>) {
  const frame = values.get("frame");
  if (frame !== undefined && !/^\d+$/.test(frame))
    programError(
      "comp-program-option",
      "--frame must be a whole frame number",
      "frame",
    );
  return frame === undefined ? undefined : Number(frame);
}
async function emit(
  io: CompositionIo,
  report: unknown,
  output: string | undefined,
) {
  if (output) {
    await writeNew(output, JSON.stringify(report, null, 2) + "\n", "output");
    io.stdout(json({ status: "measured", output }));
  } else io.stdout(JSON.stringify(report, null, 2) + "\n");
}

export async function runScopeCommand(
  args: string[],
  io: CompositionIo,
): Promise<number> {
  const command = args[0];
  if (command === "scopes") {
    const values = parseNamedArguments(args.slice(1), [
      "input",
      "frames",
      "frame-range",
      "region",
      "images",
      "output",
    ]);
    if (values.has("frames") && values.has("frame-range"))
      programError(
        "comp-program-option",
        "Give --frames or --frame-range, not both",
        "frames",
      );
    const output = values.has("output")
      ? await newOutput(values.get("output")!, "output")
      : undefined;
    const images = values.has("images")
      ? await newOutput(values.get("images")!, "images")
      : undefined;
    const report = await measureColorScopes(
      requireArgument(values, "input"),
      {
        frames: count(values, "frames", 100_000),
        range: frameRange(values),
        region: regionOf(values),
      },
      { imagesDirectory: images },
    );
    await emit(io, report, output);
    return 0;
  }
  if (command === "probe") {
    const values = parseNamedArguments(args.slice(1), [
      "input",
      "layer",
      "at",
      "radius",
      "region",
      "frame",
      "backend",
      "isolate",
      "output",
    ]);
    const output = values.has("output")
      ? await newOutput(values.get("output")!, "output")
      : undefined;
    const radius = values.get("radius");
    if (radius !== undefined && !/^\d+$/.test(radius))
      programError(
        "comp-program-option",
        "--radius must be a whole number of pixels",
        "radius",
      );
    const frame = values.get("frame");
    if (frame !== undefined && !/^\d+$/.test(frame))
      programError(
        "comp-program-option",
        "--frame must be a whole frame number",
        "frame",
      );
    const at = values.get("at");
    const report = await probeCompositionFile(
      requireArgument(values, "input"),
      {
        layer: requireArgument(values, "layer"),
        at:
          at === undefined
            ? undefined
            : (integers(at, "at", 2) as unknown as [number, number]),
        radius: radius === undefined ? undefined : Number(radius),
        region: regionOf(values),
        frame: frame === undefined ? undefined : Number(frame),
        backend: backend(values),
        isolate: flag(values, "isolate"),
      },
    );
    await emit(io, report, output);
    return 0;
  }
  if (command === "grade" && args[1] === "diff") {
    const values = parseNamedArguments(args.slice(2), [
      "before",
      "after",
      "frames",
      "still",
      "sheet",
      "output",
    ]);
    const output = values.has("output")
      ? await newOutput(values.get("output")!, "output")
      : undefined;
    const still = values.has("still")
      ? await newOutput(values.get("still")!, "still")
      : undefined;
    const sheet = values.has("sheet")
      ? await newOutput(values.get("sheet")!, "sheet")
      : undefined;
    const report = await diffColorGrade(
      requireArgument(values, "before"),
      requireArgument(values, "after"),
      { frames: count(values, "frames", 100_000), still, sheet },
    );
    await emit(io, report, output);
    return 0;
  }
  if (command === "grade" && args[1] === "bake") {
    const values = parseNamedArguments(args.slice(2), [
      "input",
      "layer",
      "frame",
      "size",
      "title",
      "output",
    ]);
    const output = await newOutput(requireArgument(values, "output"), "output");
    if (!/\.cube$/i.test(output))
      programError(
        "comp-program-option",
        "--output must end in .cube",
        "output",
      );
    const size = values.get("size");
    if (size !== undefined && !/^\d+$/.test(size))
      programError(
        "comp-program-option",
        "--size must be a whole number of grid points (2–129)",
        "size",
      );
    const { cube, report } = await bakeCompositionGrade(
      requireArgument(values, "input"),
      {
        layer: requireArgument(values, "layer"),
        frame: wholeFrame(values),
        size: size === undefined ? undefined : Number(size),
        title: values.get("title"),
      },
    );
    await writeNew(output, cube, "output");
    io.stdout(json({ status: "baked", output, ...report }));
    return 0;
  }
  if (command === "grade" && args[1] === "cdl-export") {
    const values = parseNamedArguments(args.slice(2), [
      "input",
      "layer",
      "effect",
      "frame",
      "output",
    ]);
    const output = await newOutput(requireArgument(values, "output"), "output");
    const kind = cdlFileKind(output);
    if (!kind)
      programError(
        "comp-program-option",
        "--output must end in .cc, .ccc or .cdl",
        "output",
      );
    const { text, report } = await exportCompositionCdl(
      requireArgument(values, "input"),
      {
        layer: requireArgument(values, "layer"),
        kind: kind!,
        effect: values.get("effect"),
        frame: wholeFrame(values),
      },
    );
    await writeNew(output, text, "output");
    io.stdout(json({ status: "exported", output, ...report }));
    return 0;
  }
  if (command === "grade" && args[1] === "cdl-import") {
    const values = parseNamedArguments(args.slice(2), [
      "input",
      "correction",
      "clamp",
      "output",
    ]);
    const output = values.has("output")
      ? await newOutput(values.get("output")!, "output")
      : undefined;
    const report = importCdl(
      await readFile(requireArgument(values, "input"), "utf8"),
      { correction: values.get("correction"), clamp: flag(values, "clamp") },
    );
    await emit(io, report, output);
    return 0;
  }
  programError(
    "comp-program-command",
    `Unknown composition command ${[command, args[1]].filter(Boolean).join(" ")}`,
    "command",
  );
}
