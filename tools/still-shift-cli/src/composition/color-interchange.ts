/**
 * CG5 interchange commands: `comp grade bake` (a layer's grade.* stack as a
 * `.cube`), `comp grade cdl-export` and `comp grade cdl-import` (ASC CDL).
 * Outputs (LUTs, CDL files, reports) are never overwritten.
 */
import { readFile } from "node:fs/promises";
import {
  bakeCompositionGrade,
  cdlFileKind,
  exportCompositionCdl,
  importCdl,
} from "@still-shift/animation-engine";
import { parseNamedArguments, requireArgument } from "../named-options.ts";
import { programError } from "./errors.ts";
import type { CompositionIo } from "./commands.ts";
import { newOutput, writeNew } from "./color.ts";
import {
  emit,
  flag,
  json,
  optionalOutput,
  wholeFrame,
  wholeNumber,
} from "./color-scopes.ts";

/** `comp grade bake|cdl-export|cdl-import`; other commands are not handled. */
export async function runInterchangeCommand(
  args: string[],
  io: CompositionIo,
): Promise<number> {
  const command = args[0];
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
    const size = wholeNumber(
      values,
      "size",
      "a whole number of grid points (2–129)",
    );
    const { cube, report } = await bakeCompositionGrade(
      requireArgument(values, "input"),
      {
        layer: requireArgument(values, "layer"),
        frame: wholeFrame(values),
        size,
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
    const output = await optionalOutput(values, "output");
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
