import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { createServer } from "vite";
import { CompositionSchema } from "@still-shift/scene-contract";
import {
  loadComposition,
  renderComposition,
} from "@still-shift/animation-engine";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
  assertPinnedRenderEnvironment,
} from "@still-shift/execution-runtime";
import { ffmpegArguments } from "@still-shift/execution-runtime/export";
import {
  compareFrames,
  meetsTier,
} from "../../packages/renderer-core/src/frame-tolerance.ts";
import { cameraPreview } from "./camera-preview.ts";
import {
  cameraHardwarePreview,
  type CameraFixture,
} from "./camera-hardware.ts";
import { lightingDependencyAcceptance } from "./lighting-dependencies.ts";
import { lightingFailureAcceptance } from "./lighting-failures.ts";
import { lightingFixtureReference } from "../helpers/composition-lighting-reference.ts";
import { lightingSampleCosts } from "./lighting-cost.ts";
import { lightingAlphaAcceptance } from "./lighting-alpha.ts";
import { lightingLegacyAcceptance } from "./lighting-legacy.ts";
import { lightingInspectorAcceptance } from "./lighting-inspector.ts";

const root = resolve(import.meta.dirname, "../.."),
  cache = await mkdtemp(join(tmpdir(), "ce8l-lighting-vite-")),
  output = await mkdtemp(join(tmpdir(), "ce8l-lighting-export-")),
  proof = join(
    root,
    "benchmarks/results/composition-ce8-lighting-verification",
  ),
  server = await createServer({
    root,
    cacheDir: cache,
    configFile: false,
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0 },
  }),
  digest = (bytes: Uint8Array | string) =>
    createHash("sha256").update(bytes).digest("hex");
await server.listen();
const browser = await launchRenderBrowser();
try {
  const page = await browser.newPage();
  await page.addInitScript("window.__name=(fn)=>fn;");
  await page.goto(server.resolvedUrls!.local[0]!);
  const environment = await probeRenderEnvironment(page);
  assertPinnedRenderEnvironment(environment);
  const dependencies = await lightingDependencyAcceptance(page, output);
  const baselineDirectory = join(root, "tests/visual/composition-lighting"),
    baselinePath = join(
      baselineDirectory,
      `${environment.platform}-${environment.arch}.json`,
    ),
    writing = process.argv.includes("--write-ce8l-baseline"),
    fixtures: CameraFixture[] = [],
    reports: unknown[] = [],
    items: Record<string, unknown> = {};
  await mkdir(proof, { recursive: true });
  for (const name of [
    "ambient",
    "point",
    "spot",
    "overlap",
    "content",
    "scopes",
    "unlit",
    "disabled",
    "zero",
    "exposure",
    "focus",
    "effects",
    "mirror",
  ]) {
    const sourcePath = join(
        root,
        `benchmarks/fixtures/composition/ce8l/${name}.json`,
      ),
      doc = CompositionSchema.parse(
        JSON.parse(await readFile(sourcePath, "utf8")),
      ),
      assetUrls = Object.fromEntries(
        doc.assets.map((asset) => [
          asset.id,
          "/" + relative(root, resolve(dirname(sourcePath), asset.path)),
        ]),
      ),
      backends: CameraFixture["backends"] = ["unlit", "disabled"].includes(name)
        ? ["canvas2d", "webgl2"]
        : ["webgl2"],
      forward = Array.from({ length: doc.frameCount }, (_, i) => i),
      seeks = [16, 0, 31, 15, 1, 30, 0, 16, 7],
      frames = [...forward, ...[...forward].reverse(), ...seeks],
      results = [];
    fixtures.push({ name, doc, assetUrls, backends });
    const rgba = await lightingAlphaAcceptance(
      page,
      doc,
      assetUrls,
      forward,
      name,
    );
    reports.push({ fixture: name, transparentRgba: rgba });
    const hashes: Record<string, unknown> = {};
    for (const backend of backends) {
      const result = await cameraPreview(page, doc, assetUrls, backend, frames);
      const unlit = structuredClone(doc);
      for (const scope of [unlit, ...(unlit.precomps ?? [])])
        for (const layer of scope.layers)
          if (layer.receivesLight !== undefined) layer.receivesLight = false;
      const unlitPixels = await cameraPreview(
        page,
        unlit,
        assetUrls,
        backend,
        forward,
      );
      let oracleMaxDelta = 0;
      for (const frame of forward) {
        const pixels = new Uint8ClampedArray(
            Buffer.from(result.pixels[frame]!, "base64"),
          ),
          plain = new Uint8ClampedArray(
            Buffer.from(unlitPixels.pixels[frame]!, "base64"),
          ),
          expected = lightingFixtureReference(name, frame);
        for (let at = 3; at < pixels.length; at += 4)
          assert.equal(
            pixels[at],
            plain[at],
            `${name}/${frame}: alpha invariant`,
          );
        if (["unlit", "disabled"].includes(name))
          assert.deepEqual(
            pixels,
            plain,
            `${name}/${frame}: unlit byte identity`,
          );
        if (expected) {
          const comparison = compareFrames(
            pixels,
            expected,
            doc.width,
            doc.height,
          );
          assert(
            meetsTier(comparison, "near"),
            `${name}/${frame}: independent CPU light oracle ${JSON.stringify(comparison)}`,
          );
          for (let at = 3; at < pixels.length; at += 4)
            assert.equal(
              pixels[at],
              expected[at],
              `${name}/${frame}: oracle alpha`,
            );
          oracleMaxDelta = Math.max(oracleMaxDelta, comparison.maxChannelDelta);
        }
      }
      results.push(result);
      hashes[backend] = forward.map((frame) => result.hashes[frame]);
      reports.push({
        fixture: name,
        backend,
        forward: forward.length,
        reverse: forward.length,
        seeks: seeks.length,
        oracleMaxDelta,
        alpha: "exact across all frames",
        unlitIdentity: ["unlit", "disabled"].includes(name)
          ? "exact"
          : "not applicable",
      });
      if (writing) {
        await mkdir(baselineDirectory, { recursive: true });
        for (const frame of [0, 16, 31])
          await writeFile(
            join(baselineDirectory, `${name}-${backend}-${frame}.png`),
            Buffer.from(result.pngs[frame]!, "base64"),
          );
      }
      const exported = await renderComposition({
          compositionPath: sourcePath,
          outputPath: join(output, `${name}-${backend}.mp4`),
          backend,
        }),
        repeated = await renderComposition({
          compositionPath: sourcePath,
          outputPath: join(output, `${name}-${backend}-repeat.mp4`),
          backend,
        }),
        raw = await renderComposition({
          compositionPath: sourcePath,
          outputPath: join(output, `${name}-${backend}-raw.mp4`),
          backend,
          transport: "raw_rgba",
        });
      assert.deepEqual(exported.systemFontLayers, []);
      assert.equal(
        exported.checksums.output,
        repeated.checksums.output,
        `${name}/${backend}: repeat`,
      );
      assert.equal(
        exported.checksums.output,
        raw.checksums.output,
        `${name}/${backend}: raw/PNG`,
      );
      const loaded = await loadComposition(sourcePath, backend),
        previewOutput = join(output, `${name}-${backend}-preview.mp4`);
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
        for (const frame of forward)
          encoder.stdin.write(Buffer.from(result.pngs[frame]!, "base64"));
        encoder.stdin.end();
      });
      assert.equal(
        digest(await readFile(previewOutput)),
        exported.checksums.output.replace(/^sha256:/, ""),
        `${name}/${backend}: independent preview export`,
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
    if (results.length === 2)
      for (const frame of forward) {
        const a = new Uint8ClampedArray(
            Buffer.from(results[0]!.pixels[frame]!, "base64"),
          ),
          b = new Uint8ClampedArray(
            Buffer.from(results[1]!.pixels[frame]!, "base64"),
          ),
          metrics = compareFrames(a, b, doc.width, doc.height);
        assert(
          meetsTier(metrics, "near"),
          `${name}/${frame}: affine backend ${JSON.stringify(metrics)}`,
        );
      }
    items[name] = { source: digest(JSON.stringify(doc)), hashes };
    console.log("Native CE8-L fixture:", name);
  }
  const legacy = await lightingLegacyAcceptance(page, root),
    failures = await lightingFailureAcceptance(page),
    hardware = await cameraHardwarePreview(
      server.resolvedUrls!.local[0]!,
      fixtures,
    ),
    inspector = await lightingInspectorAcceptance(browser);
  if (writing)
    await writeFile(
      baselinePath,
      JSON.stringify(
        { version: "composition-lighting-baseline-1", environment, items },
        null,
        2,
      ) + "\n",
    );
  else {
    const stored = JSON.parse(await readFile(baselinePath, "utf8"));
    assert.equal(
      stored.environment.rasterFingerprint,
      environment.rasterFingerprint,
    );
    assert.deepEqual(stored.items, items, "CE8-L all-frame hashes");
  }
  if (process.argv.includes("--profile"))
    await writeFile(
      join(proof, "sample-cost.json"),
      JSON.stringify(
        { environment, timings: await lightingSampleCosts(page) },
        null,
        2,
      ) + "\n",
    );
  await writeFile(
    join(proof, "native-acceptance.json"),
    JSON.stringify(
      {
        environment,
        reports,
        dependencies,
        failures,
        legacy,
        hardware,
        inspector,
        baseline: writing ? "created new CE8-L baseline" : "exact",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Native CE8-L acceptance:",
    JSON.stringify({
      reports,
      dependencies,
      failures,
      legacy,
      hardware,
      inspector,
      baseline: writing ? "created CE8-L" : "exact",
    }),
  );
} finally {
  await browser.close();
  await server.close();
  await rm(cache, { recursive: true, force: true });
  await rm(output, { recursive: true, force: true });
}
