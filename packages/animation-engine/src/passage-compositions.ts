import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  PassageCompositionReferencesSchema,
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import {
  passageError,
  validatePassageCompositions,
} from "@still-shift/renderer-core";
export {
  validatePassageCompositions,
  type PassageCompositions,
} from "@still-shift/renderer-core";
import { loadComposition } from "./composition-render.ts";
import type { PreparedPassage } from "./story-passage-io.ts";

/** A companion map assigns native composition files without extending frozen family schemas. */
export async function loadPassageCompositions(
  path: string,
  passage: Pick<PreparedPassage, "beats">,
  allowPath?: (path: string) => Promise<unknown>,
) {
  const sourcePath = resolve(path);
  await allowPath?.(sourcePath);
  const parsed = PassageCompositionReferencesSchema.safeParse(
    JSON.parse(await readFile(sourcePath, "utf8")),
  );
  if (!parsed.success)
    passageError("comp-passage-reference", parsed.error.issues[0]!.message, {
      path: "compositions",
    });
  const compositions: Record<string, Composition> = {};
  for (const [id, reference] of Object.entries(parsed.data)) {
    const file = resolve(dirname(sourcePath), reference);
    await allowPath?.(file);
    const result = validateComposition(
      JSON.parse(await readFile(file, "utf8")),
    );
    if (!result.ok)
      passageError("comp-passage-reference", result.diagnostics[0]!.message, {
        beat: id,
        path: file,
      });
    for (const asset of result.composition.assets)
      await allowPath?.(resolve(dirname(file), asset.path));
    const loaded = await loadComposition(file);
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
