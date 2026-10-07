import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { format } from "prettier";
import type { Page } from "playwright";
import type { Composition } from "@still-shift/scene-contract";
import {
  loadComposition,
  renderComposition,
} from "@still-shift/animation-engine";
import {
  assertPinnedRenderEnvironment,
  probeRenderEnvironment,
} from "@still-shift/execution-runtime";
import { ffmpegArguments } from "@still-shift/execution-runtime/export";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import type * as Reference from "../helpers/composition-time-reference.ts";
import { shapeHardwarePreview } from "./shape-hardware.ts";

const digest = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");

/** New CE7 hashes have a separate write flag and directory; frozen baselines are read-only. */
export async function runTimeControlAcceptance(
  page: Page,
  root: string,
  proof: string,
) {
  const environment = await probeRenderEnvironment(page);
  assertPinnedRenderEnvironment(environment);
  const baselineDirectory = join(
      root,
      "tests/visual/composition-time-controls",
    ),
    baselinePath = join(
      baselineDirectory,
      `${environment.platform}-${environment.arch}.json`,
    ),
    writing = process.argv.includes("--write-ce7-baseline"),
    directory = await mkdtemp(join(tmpdir(), "ce7-native-export-"));
  const fixtures: [string, Composition][] = [];
  const items: Record<
      string,
      { source: string; canvas2d: string[]; webgl2: string[] }
    > = {},
    reports: unknown[] = [];
  await mkdir(proof, { recursive: true });
  try {
    for (const name of ["time-controls", "adaptive"]) {
      const sourcePath = join(
          root,
          `benchmarks/fixtures/composition/ce7/${name}.json`,
        ),
        doc = JSON.parse(await readFile(sourcePath, "utf8")) as Composition;
      fixtures.push([name, doc]);
      const result = await page.evaluate(async (json: string) => {
        const doc = JSON.parse(json) as Composition,
          url = "/packages/renderer-core/src/index.ts",
          referenceUrl = "/tests/helpers/composition-time-reference.ts",
          m = (await import(url)) as typeof Render,
          ref = (await import(referenceUrl)) as typeof Reference,
          canvases = [
            document.createElement("canvas"),
            document.createElement("canvas"),
          ],
          previews = canvases.map((canvas, i) =>
            m.createCompositionPreview(
              canvas,
              doc,
              { images: new Map(), fonts: new Map() },
              { backend: i ? "webgl2" : "canvas2d" },
            ),
          ),
          hashes: [string[], string[]] = [[], []],
          pngs: [string[], string[]] = [[], []],
          samples: Record<string, string> = {},
          sampleCounts: Record<string, number> = {};
        let maxDelta = 0,
          oracleMaxDelta = 0;
        const hash = async (bytes: Uint8ClampedArray) =>
          Array.from(
            new Uint8Array(
              await crypto.subtle.digest("SHA-256", bytes.slice().buffer),
            ),
          )
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
        try {
          const forward = Array.from({ length: doc.frameCount }, (_, i) => i);
          for (const [pass, frames] of [
            forward,
            [...forward].reverse(),
            [24, 0, 47, 11, 12, 23, 24, 1, 22, 46, 0],
          ].entries())
            for (const frame of frames) {
              const expected = ref.timeControlReference(doc, frame),
                rendered = previews.map((preview) =>
                  preview.renderFrame(frame),
                ),
                pixels = previews.map((preview) => preview.readPixels()),
                comparison = m.compareFrames(
                  pixels[0]!,
                  pixels[1]!,
                  doc.width,
                  doc.height,
                );
              if (!m.meetsTier(comparison, "near"))
                throw Error(
                  `${doc.id}/${frame}: backend ${JSON.stringify(comparison)}`,
                );
              maxDelta = Math.max(maxDelta, comparison.maxChannelDelta);
              for (const i of [0, 1]) {
                // A cached stationary graph reports zero new draws. It still
                // represents the one selected shutter sample; pixels below must match.
                if (
                  rendered[i]!.samples !== expected.samples &&
                  !(expected.samples === 1 && rendered[i]!.samples === 0)
                )
                  throw Error(
                    `${doc.id}/${frame}/${i}: ${rendered[i]!.samples} samples instead of ${expected.samples}`,
                  );
                const metrics = m.compareFrames(
                  pixels[i]!,
                  expected.pixels,
                  doc.width,
                  doc.height,
                );
                if (!m.meetsTier(metrics, "near"))
                  throw Error(
                    `${doc.id}/${frame}/${i}: oracle ${JSON.stringify(metrics)}`,
                  );
                oracleMaxDelta = Math.max(
                  oracleMaxDelta,
                  metrics.maxChannelDelta,
                );
                const value = await hash(pixels[i]!);
                if (pass && hashes[i]![frame] !== value)
                  throw Error(
                    `${doc.id}/${frame}/${i}: seek history changed pixels`,
                  );
                if (!pass) {
                  hashes[i]!.push(value);
                  pngs[i]!.push(
                    canvases[i]!.toDataURL("image/png").split(",")[1]!,
                  );
                }
              }
              if (!pass) {
                sampleCounts[String(frame)] = rendered[0]!.samples;
                if ([0, 12, 24, 47].includes(frame))
                  samples[String(frame)] = pngs[0]![frame]!;
              }
            }
        } finally {
          previews.forEach((preview) => preview.dispose());
        }
        return {
          hashes,
          pngs,
          samples,
          sampleCounts,
          maxDelta,
          oracleMaxDelta,
        };
      }, JSON.stringify(doc));
      items[name] = {
        source: digest(JSON.stringify(doc)),
        canvas2d: result.hashes[0],
        webgl2: result.hashes[1],
      };
      reports.push({
        fixture: name,
        frames: doc.frameCount,
        reverseFrames: doc.frameCount,
        randomSeeks: 11,
        maxDelta: result.maxDelta,
        oracleMaxDelta: result.oracleMaxDelta,
        sampleCounts: result.sampleCounts,
      });
      if (writing) {
        await mkdir(baselineDirectory, { recursive: true });
        for (const [frame, png] of Object.entries(result.samples))
          await writeFile(
            join(baselineDirectory, `${name}-${frame}.png`),
            Buffer.from(png, "base64"),
          );
      }
      for (const [index, backend] of (
        ["canvas2d", "webgl2"] as const
      ).entries()) {
        const output = join(directory, `${name}-${backend}.mp4`),
          exported = await renderComposition({
            compositionPath: sourcePath,
            outputPath: output,
            backend,
          }),
          raw = await renderComposition({
            compositionPath: sourcePath,
            outputPath: join(directory, `${name}-${backend}-raw.mp4`),
            backend,
            transport: "raw_rgba",
          }),
          loaded = await loadComposition(sourcePath, backend),
          previewOutput = join(directory, `${name}-${backend}-preview.mp4`);
        assert.equal(
          raw.checksums.output,
          exported.checksums.output,
          `${name}/${backend}: repeated raw/PNG exports`,
        );
        assert.deepEqual(exported.systemFontLayers, []);
        await new Promise<void>((accept, reject) => {
          const encoder = spawn(
            "ffmpeg",
            ffmpegArguments(loaded.scene, previewOutput, "libx264", "png_pipe"),
            { stdio: ["pipe", "ignore", "pipe"] },
          );
          let errors = "";
          encoder.stderr.on("data", (chunk) => {
            errors += String(chunk);
          });
          encoder.on("error", reject);
          encoder.stdin.on("error", reject);
          encoder.on("close", (code) =>
            code === 0 ? accept() : reject(Error(`ffmpeg ${code}: ${errors}`)),
          );
          for (const png of result.pngs[index]!)
            encoder.stdin.write(Buffer.from(png, "base64"));
          encoder.stdin.end();
        });
        assert.equal(
          digest(await readFile(previewOutput)),
          digest(await readFile(output)),
          `${name}/${backend}: independent preview/export`,
        );
        reports.push({
          fixture: name,
          backend,
          frames: exported.frameCount,
          repeatedMp4: "byte-identical",
          independentPreviewMp4: "byte-identical",
          rawPngTransport: "byte-identical",
        });
      }
    }
    if (writing)
      await writeFile(
        baselinePath,
        await format(
          JSON.stringify({
            version: "composition-time-controls-baseline-1",
            environment,
            items,
          }),
          { parser: "json" },
        ),
      );
    else {
      const stored = JSON.parse(await readFile(baselinePath, "utf8"));
      assert.equal(
        stored.environment.rasterFingerprint,
        environment.rasterFingerprint,
        "CE7 raster fingerprint",
      );
      assert.deepEqual(items, stored.items, "CE7 full-frame hashes");
    }
    const hardware = await shapeHardwarePreview(root, fixtures);
    await writeFile(
      join(proof, "native-acceptance.json"),
      JSON.stringify(
        {
          environment,
          reports,
          hardware,
          baseline: writing ? "created new CE7 baseline" : "exact",
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      "Native CE7 acceptance:",
      JSON.stringify({
        reports,
        hardware,
        baseline: writing ? "created CE7" : "exact",
      }),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
