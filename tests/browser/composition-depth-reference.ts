import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import {
  assertPinnedRenderEnvironment,
  launchRenderBrowser,
  probeRenderEnvironment,
} from "@still-shift/execution-runtime";
import { depthReferenceFixtures } from "../helpers/composition-depth-fixtures.ts";
import type * as Depth from "../../packages/renderer-core/src/webgl-renderer.ts";
import type * as Scene from "../../packages/renderer-core/src/scene.ts";

const root = resolve(import.meta.dirname, "../..");
const destination = resolve(root, "tests/visual/composition-depth-reference");
const capture = process.argv.includes("--capture");
const fixtures = depthReferenceFixtures();
const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
const browser = await launchRenderBrowser();
try {
  const page = await browser.newPage();
  await page.addInitScript("window.__name=(fn)=>fn;");
  await page.goto(server.resolvedUrls!.local[0]!);
  const environment = await probeRenderEnvironment(page);
  assertPinnedRenderEnvironment(environment);
  const rows = [];
  for (const fixture of fixtures) {
    const assets = resolve(root, "benchmarks/fixtures/composition/ce4d");
    const sourceHash = createHash("sha256")
      .update(await readFile(resolve(assets, fixture.source)))
      .digest("hex");
    const depthHash = fixture.depth
      ? createHash("sha256")
          .update(await readFile(resolve(assets, fixture.depth)))
          .digest("hex")
      : null;
    const output = await page.evaluate(async (fixture) => {
      const rendererUrl = "/packages/renderer-core/src/webgl-renderer.ts";
      const renderer: typeof Depth = await import(rendererUrl);
      const sceneUrl = "/packages/renderer-core/src/scene.ts";
      const sampling: typeof Scene = await import(sceneUrl);
      const image = async (name: string) => {
        const image = new Image();
        image.src = `/benchmarks/fixtures/composition/ce4d/${name}`;
        await image.decode();
        return image;
      };
      const source = await image(fixture.source);
      const depth = fixture.depth ? await image(fixture.depth) : null;
      const canvas = document.createElement("canvas");
      canvas.width = fixture.width;
      canvas.height = fixture.height;
      const preview = renderer.createWebGLPreview(
        canvas,
        fixture.scene,
        source,
        depth,
      );
      const gl = canvas.getContext("webgl2")!;
      const hashes: string[] = [],
        states = [],
        samples: Record<number, string> = {};
      const captures = [
        0,
        Math.floor(fixture.scene.timeline.frameCount / 2),
        fixture.scene.timeline.frameCount - 1,
      ];
      try {
        for (
          let frame = 0;
          frame < fixture.scene.timeline.frameCount;
          frame++
        ) {
          preview.renderFrame(frame);
          const bytes = new Uint8Array(canvas.width * canvas.height * 4);
          gl.readPixels(
            0,
            0,
            canvas.width,
            canvas.height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            bytes,
          );
          const digest = new Uint8Array(
            await crypto.subtle.digest("SHA-256", bytes),
          );
          hashes.push(
            Array.from(digest, (value) =>
              value.toString(16).padStart(2, "0"),
            ).join(""),
          );
          states.push(sampling.evaluateFrame(fixture.scene, frame));
          if (captures.includes(frame))
            samples[frame] = canvas.toDataURL("image/png").split(",")[1]!;
        }
        // A complete reverse seek must reproduce the captured forward bytes.
        for (
          let frame = fixture.scene.timeline.frameCount - 1;
          frame >= 0;
          frame--
        ) {
          preview.renderFrame(frame);
          const bytes = new Uint8Array(canvas.width * canvas.height * 4);
          gl.readPixels(
            0,
            0,
            canvas.width,
            canvas.height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            bytes,
          );
          const digest = new Uint8Array(
            await crypto.subtle.digest("SHA-256", bytes),
          );
          const hash = Array.from(digest, (value) =>
            value.toString(16).padStart(2, "0"),
          ).join("");
          if (hash !== hashes[frame])
            throw new Error(
              `Depth reference reverse seek changed frame ${frame}`,
            );
        }
        return { hashes, states, samples, shader: renderer.SHADER_VERSION };
      } finally {
        preview.dispose();
      }
    }, fixture);
    if (capture) {
      await mkdir(destination, { recursive: true });
      for (const [frame, bytes] of Object.entries(output.samples))
        await writeFile(
          resolve(destination, `${fixture.id}-${frame}.png`),
          Buffer.from(bytes, "base64"),
        );
    }
    rows.push({
      ...fixture,
      sourceHash,
      depthHash,
      shader: output.shader,
      hashes: output.hashes,
      states: output.states,
    });
    console.log(
      `${fixture.id}: ${output.hashes.length} forward/reverse reference frames`,
    );
  }
  const manifest = { version: "ce4d-depth-reference-1", environment, rows };
  if (capture)
    await writeFile(
      resolve(destination, "darwin-arm64.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
  else {
    const stored = JSON.parse(
      await readFile(resolve(destination, "darwin-arm64.json"), "utf8"),
    );
    assert.deepEqual(
      rows,
      stored.rows,
      "Dedicated old-depth references changed",
    );
  }
} finally {
  await browser.close();
  await server.close();
}
