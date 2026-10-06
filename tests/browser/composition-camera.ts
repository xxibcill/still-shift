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
import { cameraFailureAcceptance } from "./camera-failures.ts";
import { cameraSampleCosts } from "./camera-cost.ts";
import { cameraInspectorAcceptance } from "./camera-inspector.ts";

const root = resolve(import.meta.dirname, "../.."),
  cache = await mkdtemp(join(tmpdir(), "ce8-camera-vite-")),
  output = await mkdtemp(join(tmpdir(), "ce8-camera-export-")),
  proof = join(root, "benchmarks/results/composition-ce8-verification"),
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
  const baselineDirectory = join(root, "tests/visual/composition-camera"),
    baselinePath = join(
      baselineDirectory,
      `${environment.platform}-${environment.arch}.json`,
    ),
    writing = process.argv.includes("--write-ce8-baseline"),
    fixtures: CameraFixture[] = [],
    reports: unknown[] = [],
    items: Record<string, unknown> = {};
  await mkdir(proof, { recursive: true });
  for (const name of [
    "affine",
    "perspective",
    "checker-perspective",
    "clipping",
    "content",
    "parents",
    "focus",
    "group-mask",
    "scopes",
    "exposure",
  ]) {
    const sourcePath = join(
        root,
        `benchmarks/fixtures/composition/ce8/${name}.json`,
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
      backends: CameraFixture["backends"] = ["affine", "focus"].includes(name)
        ? ["canvas2d", "webgl2"]
        : ["webgl2"],
      forward = Array.from({ length: doc.frameCount }, (_, i) => i),
      seeks = [16, 0, 31, 15, 1, 30, 0, 16, 7],
      frames = [...forward, ...[...forward].reverse(), ...seeks],
      results = [];
    fixtures.push({ name, doc, assetUrls, backends });
    const hashes: Record<string, unknown> = {};
    for (const backend of backends) {
      const result = await cameraPreview(
        page,
        doc,
        assetUrls,
        backend,
        frames,
        name,
      );
      results.push(result);
      hashes[backend] = forward.map((frame) => result.hashes[frame]);
      reports.push({
        fixture: name,
        backend,
        forward: forward.length,
        reverse: forward.length,
        seeks: seeks.length,
        oracleMaxDelta: result.oracleMaxDelta,
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
    console.log("Native CE8 fixture:", name);
  }
  const failures = await cameraFailureAcceptance(page, root),
    hardware = await cameraHardwarePreview(
      server.resolvedUrls!.local[0]!,
      fixtures,
    ),
    inspector = await cameraInspectorAcceptance(browser);
  if (writing)
    await writeFile(
      baselinePath,
      JSON.stringify(
        { version: "composition-camera-baseline-1", environment, items },
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
    assert.deepEqual(stored.items, items, "CE8 all-frame hashes");
  }
  if (process.argv.includes("--profile"))
    await writeFile(
      join(proof, "sample-cost.json"),
      JSON.stringify(
        { environment, timings: await cameraSampleCosts(page) },
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
        failures,
        hardware,
        inspector,
        baseline: writing ? "created new CE8 baseline" : "exact",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Native CE8 acceptance:",
    JSON.stringify({
      reports,
      failures,
      hardware,
      inspector,
      baseline: writing ? "created CE8" : "exact",
    }),
  );
} finally {
  await browser.close();
  await server.close();
  await rm(cache, { recursive: true, force: true });
  await rm(output, { recursive: true, force: true });
}
