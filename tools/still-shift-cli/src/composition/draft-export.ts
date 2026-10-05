import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { ServerResponse } from "node:http";
import { renderComposition } from "../../../../packages/animation-engine/src/composition-render.ts";
import type { Composition } from "@still-shift/scene-contract";
import { CompositionSaveError, editableDocument } from "./save.ts";
export type DraftAsset = { bytes: Buffer; type: string };
/** Render accepted native edits against captured source assets, never client-supplied paths. */
export async function exportCompositionDraft(
  value: unknown,
  base: Composition,
  assets: ReadonlyMap<string, DraftAsset>,
  backend: unknown,
  response: ServerResponse,
) {
  if (backend !== "canvas2d" && backend !== "webgl2")
    throw new CompositionSaveError(
      400,
      "comp-edit-backend",
      "Use canvas2d or webgl2",
    );
  const document = editableDocument(value, base),
    controller = new AbortController();
  const abort = () => {
    if (!response.writableEnded) controller.abort();
  };
  response.on("close", abort);
  const directory = await mkdtemp(join(tmpdir(), "composition-draft-export-"));
  try {
    const composition = structuredClone(document);
    for (const [index, asset] of composition.assets.entries()) {
      const captured = assets.get(asset.id);
      if (
        !captured ||
        `sha256:${createHash("sha256").update(captured.bytes).digest("hex")}` !==
          asset.sha256
      )
        throw new CompositionSaveError(
          422,
          "comp-edit-asset-race",
          `Source asset ${asset.id} does not match its captured bytes`,
        );
      const path = join(
        directory,
        `asset-${index}${extname(base.assets[index]!.path)}`,
      );
      await writeFile(path, captured.bytes);
      asset.path = path;
    }
    const input = join(directory, "composition.json"),
      output = join(directory, "composition.mp4");
    await writeFile(input, JSON.stringify(composition));
    await renderComposition({
      compositionPath: input,
      outputPath: output,
      backend,
      signal: controller.signal,
    });
    response.setHeader("Content-Type", "video/mp4");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${document.id}.mp4"`,
    );
    await pipeline(createReadStream(output), response);
  } finally {
    response.off("close", abort);
    await rm(directory, { recursive: true, force: true });
  }
}
