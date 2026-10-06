import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import type { Composition } from "@still-shift/scene-contract";
import type { LoadedProgram } from "./program.ts";

export function portableComposition(
  composition: Composition,
  target: string,
): Composition {
  return {
    ...composition,
    assets: composition.assets.map((asset) => ({
      ...asset,
      path: relative(target, asset.path),
    })),
  };
}
export async function withProgramFile<T>(
  program: LoadedProgram,
  input: string,
  consume: (path: string) => Promise<T>,
): Promise<T> {
  if (program.source === "json") return consume(resolve(input));
  const directory = await mkdtemp(join(tmpdir(), "still-shift-compiled-"));
  try {
    const path = join(directory, "composition.json");
    await writeFile(path, JSON.stringify(program.composition));
    return await consume(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
export async function writeComposition(
  composition: Composition,
  input: string,
  output?: string,
): Promise<{ text: string; outputPath?: string }> {
  const outputPath = output ? resolve(output) : undefined;
  const target = dirname(outputPath ?? resolve(input));
  const text =
    JSON.stringify(portableComposition(composition, target), null, 2) + "\n";
  if (outputPath) {
    await writeFile(outputPath, text, { flag: "wx" });
    return { text, outputPath };
  }
  return { text };
}
