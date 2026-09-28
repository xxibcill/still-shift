import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { AnimationEngineError } from "../../../packages/scene-contract/src/errors.ts";
import type { OutputFormat } from "../../../packages/scene-contract/src/output-format.ts";

type CatalogEntry = {
  id: string;
  formats?: Partial<Record<OutputFormat, string>>;
};

/** Select an explicitly authored variant adjacent to a catalogued base scene. */
export async function resolveCatalogFormatVariant(
  scenePath: string,
  format: OutputFormat,
): Promise<string> {
  const source = resolve(scenePath);
  if (format === "landscape") return source;
  const scene = JSON.parse(await readFile(source, "utf8")) as {
    format?: OutputFormat;
  };
  if (scene.format === format) return source;
  let catalog: CatalogEntry[];
  try {
    catalog = JSON.parse(
      await readFile(resolve(dirname(source), "catalog.json"), "utf8"),
    ) as CatalogEntry[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return source;
    throw error;
  }
  const entry = catalog.find(
    (candidate) => `${candidate.id}.json` === basename(source),
  );
  const variant = entry?.formats?.[format];
  return variant ? resolve(dirname(source), variant) : source;
}

/** Keep a resolved input for review and allow an identical failed render to retry. */
export async function writeResolvedInput(
  outputPath: string,
  scene: object,
): Promise<string> {
  const path = resolve(`${outputPath}.input.json`);
  const contents = JSON.stringify(scene, null, 2) + "\n";
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, contents, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if ((await readFile(path, "utf8")) !== contents)
      throw new AnimationEngineError(
        "SCENE_INVALID",
        "Resolved input already exists with different content; choose a new output path",
        { path },
      );
  }
  return path;
}
