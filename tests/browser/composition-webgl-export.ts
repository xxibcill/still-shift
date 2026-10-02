import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import {
  loadComposition,
  renderComposition,
  type CompositionRenderResult,
} from "@still-shift/animation-engine";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import { ffmpegArguments } from "@still-shift/execution-runtime/export";
import { COMPOSITION_WEBGL_RENDERER_VERSION } from "@still-shift/renderer-core";
import type * as Render from "@still-shift/renderer-core";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";

const root = resolve(import.meta.dirname, "../..");
const directory = await mkdtemp(join(tmpdir(), "composition-webgl-export-"));
const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
});
const lab = await createServer({
  configFile: resolve(root, "apps/lab/vite.config.ts"),
  logLevel: "error",
  server: { port: 0, strictPort: false, watch: null },
});
await server.listen();
await lab.listen();
const browser = await launchRenderBrowser();
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
try {
  const page = await browser.newPage(),
    labPage = await browser.newPage();
  await page.addInitScript("window.__name=(fn)=>fn;");
  await labPage.addInitScript("window.__name=(fn)=>fn;");
  await page.goto(server.resolvedUrls!.local[0]!);
  const errors: string[] = [];
  labPage.on("pageerror", (error) => errors.push(error.message));
  let invalid = "";
  assert.equal(
    await runCli(
      [
        "comp",
        "render",
        "--input",
        "unused.json",
        "--output",
        "unused.mp4",
        "--backend",
        "invalid",
      ],
      {
        stdout: () => {},
        stderr: (value) => {
          invalid += value;
        },
      },
    ),
    2,
  );
  assert.match(invalid, /backend must be canvas2d or webgl2/);
  for (const path of [
    "ce6/echo.json",
    "ce6/generators.json",
    "ce7/exposure.json",
    "ce4a/providers.json",
  ]) {
    const compositionPath = resolve(
      root,
      "benchmarks/fixtures/composition",
      path,
    );
    const loaded = await loadComposition(compositionPath, "webgl2");
    const canvasLoaded = await loadComposition(compositionPath);
    assert.equal(loaded.scene.backend, "webgl2");
    assert.equal(canvasLoaded.scene.backend, undefined);
    assert.notEqual(
      loaded.scene.rendererVersion,
      canvasLoaded.scene.rendererVersion,
    );
    assert.equal(loaded.sourceChecksum, canvasLoaded.sourceChecksum);
    const stem = path.replaceAll("/", "-");
    const outputPath = join(directory, `${stem}.mp4`);
    let output = "",
      error = "";
    const args = [
      "comp",
      "render",
      "--input",
      compositionPath,
      "--output",
      outputPath,
      "--backend",
      "webgl2",
    ];
    assert.equal(
      await runCli(args, {
        stdout: (value) => {
          output += value;
        },
        stderr: (value) => {
          error += value;
        },
      }),
      0,
      error,
    );
    const first = JSON.parse(output) as CompositionRenderResult;
    assert.equal(first.rendererVersion, COMPOSITION_WEBGL_RENDERER_VERSION);
    assert.match(first.metrics.gpuRenderer, /SwiftShader/);
    const manifest = JSON.parse(
      await readFile(first.sceneManifestPath, "utf8"),
    );
    assert.equal(manifest.scene.backend, "webgl2");
    assert.equal(manifest.rendererVersion, COMPOSITION_WEBGL_RENDERER_VERSION);
    for (const transport of ["png_pipe", "raw_rgba"] as const) {
      const next = await renderComposition({
        compositionPath,
        outputPath: join(directory, `${stem}-${transport}.mp4`),
        backend: "webgl2",
        transport,
      });
      assert.equal(
        next.checksums.output,
        first.checksums.output,
        `${path}: repeat/transport bytes`,
      );
    }
    assert.equal(
      await runCli(args, { stdout: () => {}, stderr: () => {} }),
      2,
      "existing output is protected",
    );
    const rendered = await page.evaluate(async (path) => {
      const url = "/packages/renderer-core/src/index.ts";
      const m = (await import(url)) as typeof Render;
      const comp = await (
        await fetch(`/benchmarks/fixtures/composition/${path}`)
      ).json();
      const resources = await m.loadCompositionResources(comp, (id) => {
        const asset = comp.assets.find((a: { id: string }) => a.id === id);
        return new URL(
          asset.path,
          new URL(`/benchmarks/fixtures/composition/${path}`, location.href),
        ).href;
      });
      const canvas = document.createElement("canvas"),
        preview = m.createCompositionPreview(canvas, comp, resources, {
          backend: "webgl2",
        });
      const pngs: string[] = [],
        frames: Record<string, string> = {};
      try {
        for (let frame = 0; frame < comp.frameCount; frame++) {
          preview.renderFrame(frame);
          pngs.push(canvas.toDataURL("image/png").split(",")[1]!);
          if (
            [0, Math.floor(comp.frameCount / 2), comp.frameCount - 1].includes(
              frame,
            )
          ) {
            const bytes = preview.readPixels();
            let binary = "";
            for (let i = 0; i < bytes.length; i += 0x8000)
              binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            frames[frame] = btoa(binary);
          }
        }
      } finally {
        preview.dispose();
      }
      return { pngs, frames };
    }, path);
    const previewPath = join(directory, `${stem}-preview.mp4`);
    await new Promise<void>((accept, reject) => {
      const encoder = spawn(
        "ffmpeg",
        ffmpegArguments(loaded.scene, previewPath, "libx264", "png_pipe"),
        { stdio: ["pipe", "ignore", "pipe"] },
      );
      let errors = "";
      encoder.stderr.on("data", (chunk) => {
        errors += String(chunk);
      });
      encoder.on("error", reject);
      encoder.stdin.on("error", reject);
      encoder.on("close", (code) =>
        code === 0 ? accept() : reject(new Error(`ffmpeg ${code}: ${errors}`)),
      );
      for (const png of rendered.pngs)
        encoder.stdin.write(Buffer.from(png, "base64"));
      encoder.stdin.end();
    });
    assert.equal(
      digest(await readFile(previewPath)),
      digest(await readFile(outputPath)),
      `${path}: preview encodes to identical export`,
    );
    await labPage.goto(
      new URL(
        `/composition.html?scene=${path}&backend=webgl2`,
        lab.resolvedUrls!.local[0]!,
      ).href,
    );
    for (const backend of ["webgl2", "canvas2d", "webgl2"]) {
      if ((await labPage.locator("#backend").inputValue()) !== backend)
        await labPage.locator("#backend").selectOption(backend);
      await labPage.waitForFunction(
        ({ path, backend }) => {
          const status = document.querySelector<HTMLElement>("#status");
          return (
            status?.dataset.ready === path && status.dataset.backend === backend
          );
        },
        { path, backend },
        { timeout: 30_000 },
      );
      assert.equal(await labPage.locator("#error").textContent(), "");
      assert.equal(
        await labPage.locator("#renderer").getAttribute("data-kind"),
        "software",
      );
      assert.match(
        (await labPage.locator("#command").textContent())!,
        new RegExp(`--backend ${backend}`),
      );
      if (backend !== "webgl2") continue;
      for (const [frame, expected] of Object.entries(rendered.frames)) {
        const actual = await labPage.evaluate((frame) => {
          const slider = document.querySelector<HTMLInputElement>("#frame")!;
          slider.value = frame;
          slider.dispatchEvent(new Event("input", { bubbles: true }));
          const canvas = document.querySelector<HTMLCanvasElement>("#preview")!,
            gl = canvas.getContext("webgl2")!;
          const bottom = new Uint8Array(canvas.width * canvas.height * 4),
            top = new Uint8Array(bottom.length),
            row = canvas.width * 4;
          gl.readPixels(
            0,
            0,
            canvas.width,
            canvas.height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            bottom,
          );
          for (let y = 0; y < canvas.height; y++)
            top.set(
              bottom.subarray(y * row, (y + 1) * row),
              (canvas.height - 1 - y) * row,
            );
          let binary = "";
          for (let i = 0; i < top.length; i += 0x8000)
            binary += String.fromCharCode(...top.subarray(i, i + 0x8000));
          return btoa(binary);
        }, frame);
        assert.equal(
          actual,
          expected,
          `${path}: Lab frame ${frame} agrees with export`,
        );
      }
    }
    console.log(
      `WebGL export ${path}: ${first.frameCount} frames; CLI, repeat, raw/PNG, encoded preview, Lab switching and overwrite protection pass`,
    );
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await lab.close();
  await server.close();
  await rm(directory, { recursive: true, force: true });
}
