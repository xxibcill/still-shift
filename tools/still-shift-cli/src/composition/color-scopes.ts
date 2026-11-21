/**
 * CG3 measurement commands: `comp scopes`, `comp probe` and `comp grade diff`.
 * Reports are deterministic JSON; outputs (report, images, stills) are never
 * overwritten.
 */
import {
  diffColorGrade,
  measureColorScopes,
  probeCompositionFile,
} from "@still-shift/animation-engine";
import { parseNamedArguments, requireArgument } from "../named-options.ts";
import { programError } from "./errors.ts";
import type { CompositionIo } from "./commands.ts";
import { backend, count, newOutput, writeNew } from "./color.ts";

export const json = (value: unknown) => JSON.stringify(value) + "\n";

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
export function flag(values: Map<string, string>, name: string) {
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
/** An optional whole-number option; `rule` completes "--name must be …". */
export function wholeNumber(
  values: Map<string, string>,
  name: string,
  rule: string,
) {
  const text = values.get(name);
  if (text !== undefined && !/^\d+$/.test(text))
    programError("comp-program-option", `--${name} must be ${rule}`, name);
  return text === undefined ? undefined : Number(text);
}
export const wholeFrame = (values: Map<string, string>) =>
  wholeNumber(values, "frame", "a whole frame number");
/** An optional output path that must not exist yet. */
export const optionalOutput = (values: Map<string, string>, name: string) =>
  values.has(name) ? newOutput(values.get(name)!, name) : undefined;
export async function emit(
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
    const output = await optionalOutput(values, "output");
    const images = await optionalOutput(values, "images");
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
    const output = await optionalOutput(values, "output");
    const radius = wholeNumber(values, "radius", "a whole number of pixels");
    const frame = wholeFrame(values);
    const at = values.get("at");
    const report = await probeCompositionFile(
      requireArgument(values, "input"),
      {
        layer: requireArgument(values, "layer"),
        at:
          at === undefined
            ? undefined
            : (integers(at, "at", 2) as unknown as [number, number]),
        radius,
        region: regionOf(values),
        frame,
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
    const output = await optionalOutput(values, "output");
    const still = await optionalOutput(values, "still");
    const sheet = await optionalOutput(values, "sheet");
    const report = await diffColorGrade(
      requireArgument(values, "before"),
      requireArgument(values, "after"),
      { frames: count(values, "frames", 100_000), still, sheet },
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
