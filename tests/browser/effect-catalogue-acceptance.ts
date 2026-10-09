import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { format } from "prettier";
import type { Page } from "playwright";
import {
  compositionEffectDefinition,
  type Composition,
} from "@still-shift/scene-contract";
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
import { shapeHardwarePreview } from "./shape-hardware.ts";
import { CE6_NATIVE_FIXTURES } from "../../benchmarks/fixtures/composition/ce6/catalogue.ts";

const digest = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");

/** New CE6 hashes have a separate write flag and directory; frozen baselines are read-only. */
export async function runEffectCatalogueAcceptance(
  page: Page,
  root: string,
  proof: string,
) {
  const environment = await probeRenderEnvironment(page);
  assertPinnedRenderEnvironment(environment);
  const baselineDirectory = join(
      root,
      "tests/visual/composition-effect-catalogue",
    ),
    baselinePath = join(
      baselineDirectory,
      `${environment.platform}-${environment.arch}.json`,
    ),
    writing = process.argv.includes("--write-ce6-baseline"),
    directory = await mkdtemp(join(tmpdir(), "ce6-native-export-"));
  const fixtures: [string, Composition][] = [];
  const items: Record<
      string,
      { source: string; canvas2d: string[]; webgl2: string[] }
    > = {},
    reports: unknown[] = [];
  await mkdir(proof, { recursive: true });
  try {
    for (const name of CE6_NATIVE_FIXTURES) {
      console.log(`CE6 native acceptance ${name}`);
      const sourcePath = join(
          root,
          `benchmarks/fixtures/composition/ce6/${name}.json`,
        ),
        doc = JSON.parse(await readFile(sourcePath, "utf8")) as Composition;
      fixtures.push([name, doc]);
      const result = await page.evaluate(async (json: string) => {
        const doc = JSON.parse(json) as Composition,
          url = "/packages/renderer-core/src/index.ts",
          m = (await import(url)) as typeof Render,
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
        let maxDelta = 0;
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
            [16, 0, 31, 7, 8, 15, 16, 1, 14, 30, 0],
          ].entries())
            for (const frame of frames) {
              const rendered = previews.map((preview) =>
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
                if ([0, 8, 16, 31].includes(frame))
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
    if (writing) {
      await writeFile(
        baselinePath,
        await format(
          JSON.stringify({
            version: "composition-effect-catalogue-baseline-1",
            environment,
            items: Object.fromEntries(
              Object.entries(items).filter(([id]) => id !== "catalogue-mesh"),
            ),
          }),
          { parser: "json" },
        ),
      );
      await writeFile(
        join(
          baselineDirectory,
          `${environment.platform}-${environment.arch}-mesh-1.json`,
        ),
        await format(
          JSON.stringify({
            version: "composition-mesh-catalogue-baseline-1",
            environment,
            effectVersions: Object.fromEntries(
              ["distort.mesh-warp", "distort.puppet"].map((id) => [
                id,
                compositionEffectDefinition(id)!.version,
              ]),
            ),
            items: { "catalogue-mesh": items["catalogue-mesh"] },
          }),
          { parser: "json" },
        ),
      );
    } else {
      const stored = JSON.parse(await readFile(baselinePath, "utf8"));
      assert.equal(
        stored.environment.rasterFingerprint,
        environment.rasterFingerprint,
        "CE6 raster fingerprint",
      );
      // Keep the original catalogue intact; corrected coverage has a versioned Canvas oracle.
      const transitionIds = [
        "transition.linear-wipe",
        "transition.radial-wipe",
        "transition.venetian-blinds",
        "transition.block-dissolve",
      ];
      const transitionVersion = compositionEffectDefinition(
        transitionIds[0]!,
      )!.version;
      const corrected = JSON.parse(
        await readFile(
          join(
            baselineDirectory,
            `${environment.platform}-${environment.arch}-transition-coverage-${transitionVersion}.json`,
          ),
          "utf8",
        ),
      );
      assert.equal(
        corrected.version,
        "composition-transition-coverage-baseline-1",
      );
      assert.equal(
        corrected.environment.rasterFingerprint,
        environment.rasterFingerprint,
        "Transition coverage raster fingerprint",
      );
      assert.deepEqual(
        corrected.effectVersions,
        Object.fromEntries(
          transitionIds.map((id) => [
            id,
            compositionEffectDefinition(id)!.version,
          ]),
        ),
        "Transition coverage effect versions",
      );
      assert.equal(corrected.fixture, "catalogue-transition");
      assert.equal(
        corrected.source,
        stored.items[corrected.fixture].source,
        "Transition coverage source fingerprint",
      );
      const expected = structuredClone(stored.items);
      expected[corrected.fixture].canvas2d = corrected.canvas2d;
      const mesh = JSON.parse(
        await readFile(
          join(
            baselineDirectory,
            `${environment.platform}-${environment.arch}-mesh-1.json`,
          ),
          "utf8",
        ),
      );
      assert.equal(mesh.version, "composition-mesh-catalogue-baseline-1");
      assert.equal(
        mesh.environment.rasterFingerprint,
        environment.rasterFingerprint,
      );
      assert.deepEqual(Object.keys(mesh.items), ["catalogue-mesh"]);
      assert.deepEqual(
        mesh.effectVersions,
        Object.fromEntries(
          ["distort.mesh-warp", "distort.puppet"].map((id) => [
            id,
            compositionEffectDefinition(id)!.version,
          ]),
        ),
      );
      assert.equal(
        Object.hasOwn(expected, "catalogue-mesh"),
        false,
        "Keep the original CE6 catalogue frozen",
      );
      expected["catalogue-mesh"] = mesh.items["catalogue-mesh"];
      assert.deepEqual(items, expected, "CE6 full-frame hashes");
    }
    const hardware = await shapeHardwarePreview(root, fixtures);
    await writeFile(
      join(proof, "native-acceptance.json"),
      JSON.stringify(
        {
          environment,
          reports,
          hardware,
          baseline: writing ? "created new CE6 baseline" : "exact",
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      "Native CE6 acceptance:",
      JSON.stringify({
        reports,
        hardware,
        baseline: writing ? "created CE6" : "exact",
      }),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
