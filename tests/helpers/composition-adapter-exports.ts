import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import type {
  CommerceScene,
  StoryScene,
  CinematicScene,
  PreparedScene,
} from "@still-shift/scene-contract";
import { renderComposition } from "@still-shift/animation-engine";
import type { CompositionBackend } from "@still-shift/renderer-core";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";

/** Verify that compiled adapter scenes remain portable through CLI JSON and export. */
export async function assertAdapterExport(
  source: CommerceScene | StoryScene | CinematicScene | PreparedScene,
  sourceDirectory: string,
  id: string,
  backend: CompositionBackend = "canvas2d",
  previewChecksum?: string,
) {
  const directory = await mkdtemp(join(tmpdir(), "still-shift-ce4b-export-"));
  try {
    const scene = structuredClone(source);
    const frameCount =
      "frameCount" in scene
        ? scene.frameCount
        : (scene.fps * scene.durationMs) / 1000;
    for (const asset of [
      ...scene.assets,
      ...("fonts" in scene ? (scene.fonts ?? []) : []),
    ])
      asset.path = relative(directory, resolve(sourceDirectory, asset.path));
    const sourcePath = join(directory, "scene.json");
    const compositionPath = join(directory, "composition.json");
    await writeFile(sourcePath, JSON.stringify(scene));
    let errors = "";
    const args = [
      "comp",
      "export-json",
      "--scene",
      sourcePath,
      "--output",
      compositionPath,
    ];
    assert.equal(
      await runCli(args, {
        stdout: () => {},
        stderr: (text) => {
          errors += text;
        },
      }),
      0,
      errors,
    );
    const exported = JSON.parse(await readFile(compositionPath, "utf8"));
    assert.equal(exported.schemaVersion, "composition-1");
    const first = await renderComposition({
      compositionPath,
      backend,
      outputPath: join(directory, "first.mp4"),
    });
    const second = await renderComposition({
      compositionPath,
      backend,
      outputPath: join(directory, "second.mp4"),
    });
    assert.equal(first.frameCount, frameCount);
    assert.equal(first.checksums.output, second.checksums.output);
    if (previewChecksum) {
      assert.equal(
        first.checksums.output.replace(/^sha256:/, ""),
        previewChecksum,
        `${id}/${backend} independent preview MP4`,
      );
      const raw = await renderComposition({
        compositionPath,
        backend,
        outputPath: join(directory, "raw.mp4"),
        transport: "raw_rgba",
      });
      assert.equal(
        first.checksums.output,
        raw.checksums.output,
        `${id}/${backend} raw/PNG transport`,
      );
    }
    if (source.schemaVersion === "illustrated-scene-1")
      assert.deepEqual(
        first.systemFontLayers.sort(),
        source.nodes
          .filter((node) => node.type === "text" && !node.fontAsset)
          .map((node) => node.id)
          .sort(),
      );
    else assert.deepEqual(first.systemFontLayers, []);
    assert.equal(await runCli(args, { stdout: () => {}, stderr: () => {} }), 1);
    console.log(
      `Adapter ${backend} ${id} export: ${frameCount} frames, two byte-identical MP4s; relocated assets and overwrite protection pass`,
    );
    return {
      id,
      backend,
      frames: frameCount,
      repeatedMp4: "byte-identical",
      ...(previewChecksum
        ? {
            independentPreviewMp4: "byte-identical",
            rawPngTransport: "byte-identical",
          }
        : {}),
      relocatedAssets: "pass",
      overwriteProtection: "pass",
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
