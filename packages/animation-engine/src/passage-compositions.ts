import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  PassageCompositionReferencesSchema,
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import {
  passageError,
  PassageError,
  validatePassageCompositions,
} from "@still-shift/renderer-core/passage-compositions";
export {
  validatePassageCompositions,
  type PassageCompositions,
} from "@still-shift/renderer-core/passage-compositions";
import { readCompositionSource } from "./composition-source.ts";
import type { PreparedPassage } from "./story-passage-io.ts";

/** A companion map assigns native composition files without extending frozen family schemas. */
export async function loadPassageCompositions(
  path: string,
  passage: Pick<PreparedPassage, "beats"> &
    Partial<Pick<PreparedPassage, "audio">>,
  allowPath?: (path: string) => Promise<unknown>,
) {
  const sourcePath = resolve(path);
  await allowPath?.(sourcePath);
  const input = await readReferenceJson(sourcePath);
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const ids = Object.keys(input);
    if (ids.length > 400)
      passageError("comp-passage-limit", "At most 400 native beat references", {
        path: sourcePath,
      });
    // Check raw keys before parsing: record schemas deliberately discard __proto__.
    for (const id of ids)
      if (!passage.beats.some((beat) => beat.id === id))
        passageError("comp-passage-beat", `Unknown beat ${id}`, {
          beat: id,
          path: sourcePath,
        });
  }
  const parsed = PassageCompositionReferencesSchema.safeParse(input);
  if (!parsed.success)
    passageError("comp-passage-reference", parsed.error.issues[0]!.message, {
      path: "compositions",
    });
  const compositions: Record<string, Composition> = Object.create(null);
  for (const [id, reference] of Object.entries(parsed.data)) {
    const file = resolve(dirname(sourcePath), reference);
    await allowPath?.(file);
    const result = validateComposition(await readReferenceJson(file, id));
    if (!result.ok)
      throw new PassageError(
        result.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          beat: id,
          sourcePath: file,
        })),
      );
    for (const asset of result.composition.assets)
      await allowPath?.(resolve(dirname(file), asset.path));
    const loaded = await readCompositionSource(file).catch((error) =>
      passageError(
        "comp-passage-reference",
        `Cannot prepare ${file}: ${error.message}`,
        { beat: id, path: file },
      ),
    );
    compositions[id] = {
      ...loaded.composition,
      assets: loaded.composition.assets.map((asset) => ({
        ...asset,
        path: loaded.assetPaths[asset.id]!,
      })),
    };
  }
  return validatePassageCompositions(passage, compositions);
}

async function readReferenceJson(
  path: string,
  beat?: string,
): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return passageError(
      "comp-passage-reference",
      `Cannot read valid JSON from ${path}`,
      {
        path,
        ...(beat ? { beat } : {}),
      },
    );
  }
}
