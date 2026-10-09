import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  loadComposition,
  renderComposition,
  type LoadedComposition,
} from "@still-shift/animation-engine";
import { exportScene } from "@still-shift/execution-runtime/export";
import {
  COMPOSITION_OUTPUT_FORMATS,
  compositionOutputProfile,
} from "../../packages/execution-runtime/src/composition-output.ts";
import type { Composition } from "@still-shift/scene-contract";

export async function verifyCompositionOutputLifecycle(
  directory: string,
  compositionPath: string,
  loaded: LoadedComposition,
) {
  const reports: unknown[] = [];
  const audio = loaded.preparedAudio!;
  for (const format of COMPOSITION_OUTPUT_FORMATS)
    for (const failure of ["cancel", "validation"] as const) {
      const profile = compositionOutputProfile(format);
      const prefix = `failure-${format}-${failure}`;
      const outputPath = join(
        directory,
        prefix +
          (profile.container === "image2"
            ? ".%06d.png"
            : `.${profile.container}`),
      );
      const controller = new AbortController();
      const reason = Error(`CE15 ${format} ${failure}`);
      await assert.rejects(
        exportScene({
          scene: loaded.scene,
          sourcePath: compositionPath,
          expectedSourceChecksum: loaded.sourceChecksum,
          depthPath: null,
          assetPaths: loaded.assetPaths,
          audioInput: {
            path: loaded.assetPaths[audio.resource.id]!,
            sha256: audio.resource.sha256,
            byteLength: audio.resource.byteLength,
            sampleCount: audio.sampleCount,
          },
          outputPath,
          signal: controller.signal,
          format,
          transport: "raw_rgba",
          resultManifestContents: () => "{}\n",
          validateResult: () => {
            if (failure === "cancel") controller.abort(reason);
            else throw reason;
          },
        }),
        (error: unknown) => error === reason,
      );
      assert.equal(
        (await readdir(directory)).some((name) => name.includes(prefix)),
        false,
        `${format}/${failure}: media, sidecars and private stages removed`,
      );
      reports.push({
        format,
        failure,
        originalReason: true,
        publication: "none",
        stageCleanup: true,
      });
    }
  for (const source of ["json", "image"] as const) {
    const path = source === "json" ? compositionPath : loaded.assetPaths.ramp!;
    const original = await readFile(path);
    const prefix = `failure-source-${source}`;
    try {
      await assert.rejects(
        exportScene({
          scene: loaded.scene,
          sourcePath: compositionPath,
          expectedSourceChecksum: loaded.sourceChecksum,
          depthPath: null,
          assetPaths: loaded.assetPaths,
          audioInput: {
            path: loaded.assetPaths[audio.resource.id]!,
            sha256: audio.resource.sha256,
            byteLength: audio.resource.byteLength,
            sampleCount: audio.sampleCount,
          },
          outputPath: join(directory, `${prefix}.%06d.png`),
          format: "png16",
          transport: "raw_rgba",
          validateResult: () =>
            writeFile(path, Buffer.concat([original, Buffer.from(" ")])),
          validateSources: async () => {
            const verified = await loadComposition(
              compositionPath,
              "canvas2d",
              {
                cacheDirectory: join(directory, "media-cache"),
              },
            );
            if (verified.sourceChecksum !== loaded.sourceChecksum)
              throw Error(
                "Composition source changed before output publication",
              );
          },
        }),
        /changed before output publication|checksum/i,
      );
    } finally {
      await writeFile(path, original);
    }
    assert.equal(
      (await readdir(directory)).some((name) => name.includes(prefix)),
      false,
    );
    reports.push({
      source,
      mutation: "after encoding and validation",
      publication: "none",
      stageCleanup: true,
    });
  }
  return reports;
}

export async function verifyCompositionOutputDimensions(
  directory: string,
  fixture: Composition,
) {
  const reports: unknown[] = [];
  const oddPath = join(directory, "odd-source.json");
  await writeFile(
    oddPath,
    JSON.stringify({ ...fixture, id: "odd-size", width: 17, height: 19 }),
  );
  for (const backend of ["canvas2d", "webgl2"] as const)
    for (const format of COMPOSITION_OUTPUT_FORMATS) {
      const profile = compositionOutputProfile(format);
      const prefix = `odd-${backend}-${format}`;
      const outputPath = join(
        directory,
        prefix +
          (profile.container === "image2"
            ? ".%06d.png"
            : `.${profile.container}`),
      );
      const request = {
        compositionPath: oddPath,
        outputPath,
        backend,
        format,
        transport: "raw_rgba" as const,
        cacheDirectory: join(directory, "media-cache"),
      };
      if (profile.evenDimensions) {
        await assert.rejects(
          renderComposition(request),
          /requires even width and height/,
        );
        assert.equal(
          (await readdir(directory)).some((name) => name.includes(prefix)),
          false,
        );
        reports.push({
          format,
          backend,
          width: 17,
          height: 19,
          rejected: "codec requires even dimensions",
        });
      } else {
        const result = await renderComposition(request);
        assert.equal(result.metrics.width, 17);
        assert.equal(result.metrics.height, 19);
        reports.push({
          format,
          backend,
          width: 17,
          height: 19,
          checksum: result.checksums.output,
        });
      }
    }
  for (const [width, height] of [
    [8192, 16],
    [16, 8192],
  ])
    for (const backend of ["canvas2d", "webgl2"] as const) {
      const path = join(directory, `limit-${width}-${height}.json`);
      await writeFile(
        path,
        JSON.stringify({
          ...fixture,
          id: "maximum-axis",
          width,
          height,
          frameCount: 1,
          assets: fixture.assets.filter((asset) => asset.type !== "audio"),
          layers: fixture.layers.filter((layer) => layer.type !== "audio"),
        }),
      );
      const result = await renderComposition({
        compositionPath: path,
        outputPath: join(
          directory,
          `limit-${width}-${height}-${backend}.%06d.png`,
        ),
        backend,
        format: "png8",
        transport: "raw_rgba",
      });
      assert.equal(result.metrics.width, width);
      assert.equal(result.metrics.height, height);
      reports.push({
        format: "png8",
        backend,
        width,
        height,
        checksum: result.checksums.output,
      });
    }
  return reports;
}
