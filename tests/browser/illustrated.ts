import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { createServer } from "vite";
import {
  PreparedAnimationEngine,
  loadPreparedScene,
} from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import { compareFrameSamples } from "../../packages/renderer-core/src/parity.ts";
import { compilePreparedScene } from "../../packages/renderer-core/src/prepared-scene.ts";
import type * as IllustratedRenderer from "../../packages/renderer-core/src/illustrated-renderer.ts";
import {
  PreparedSceneSchema,
  PreparedAnimationResultSchema,
} from "../../packages/scene-contract/src/prepared.ts";

const run = promisify(execFile);
const temporary = await mkdtemp(join(tmpdir(), "still-shift-illustrated-"));
const root = resolve(".");
const argument = process.argv.indexOf("--renders");
const renders =
  argument >= 0 ? resolve(process.argv[argument + 1]!) : temporary;
const server = await createServer({
  configFile: resolve("apps/lab/vite.config.ts"),
  server: { port: 0, strictPort: false },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const samples: unknown[] = [];
const rgb = async (path: string, frame?: number) => {
  const filters = [
    ...(frame === undefined ? [] : [`select=eq(n\\,${frame})`]),
    "scale=96:54:flags=bicubic",
  ].join(",");
  const { stdout } = await run(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path,
      "-vf",
      filters,
      "-fps_mode",
      "vfr",
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ],
    { encoding: "buffer" },
  );
  return new Uint8Array(stdout);
};
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${server.resolvedUrls!.local[0]}illustrated.html`);
  const entries = JSON.parse(
    await readFile(
      "benchmarks/fixtures/history-offstage-v2/catalog.json",
      "utf8",
    ),
  ) as { id: string; title: string }[];
  for (const entry of entries) {
    await page.locator("#scene").selectOption(entry.id);
    await page.waitForFunction(
      (title) =>
        document
          .querySelector("#status")
          ?.textContent?.startsWith(`${title} ready`),
      entry.title,
    );
    const scenePath = resolve(
      `benchmarks/fixtures/history-offstage-v2/${entry.id}.json`,
    );
    const video = join(renders, `${entry.id}.mp4`);
    if (renders === temporary)
      await new PreparedAnimationEngine().animate({
        scenePath,
        outputPath: video,
      });
    const result = PreparedAnimationResultSchema.parse(
      JSON.parse(await readFile(`${video}.result.json`, "utf8")),
    );
    const expectedHash = `sha256:${createHash("sha256")
      .update(await readFile(scenePath))
      .digest("hex")}`;
    assert.equal(
      result.checksums.source,
      expectedHash,
      "Existing render must match current scene",
    );
    assert.equal(result.frameCount, 168);
    const firstLast: Uint8Array[] = [];
    for (const frame of [0, 36, 50, 88, 89, 103, 167]) {
      const base64 = await page.evaluate((index) => {
        const slider = document.querySelector<HTMLInputElement>("#scrub")!;
        slider.value = String(index);
        slider.dispatchEvent(new Event("input"));
        return document
          .querySelector<HTMLCanvasElement>("#illustrated-preview")!
          .toDataURL("image/png")
          .split(",")[1]!;
      }, frame);
      const path = join(temporary, `${entry.id}-${frame}.png`);
      await writeFile(path, Buffer.from(base64, "base64"));
      const preview = await rgb(path);
      const exported = await rgb(video, frame);
      const score = compareFrameSamples(preview, exported, 96, 54);
      assert.equal(
        score.warning,
        null,
        `${entry.id} frame ${frame}: ${JSON.stringify(score)}`,
      );
      samples.push({ id: entry.id, frame, score });
      if (frame === 0 || frame === 167) firstLast.push(preview);
    }
    assert.notDeepEqual(
      firstLast[0],
      firstLast[1],
      `${entry.id} must not be static`,
    );
    const source = PreparedSceneSchema.parse(
      JSON.parse(await readFile(scenePath, "utf8")),
    );
    const variant = PreparedSceneSchema.parse({
      ...source,
      fps: 30,
      title: `Alternate ${source.title}`,
      nodes: source.nodes.map((node) => ({
        ...node,
        ...(!node.parent ? { x: node.x + 8 } : {}),
        ...(node.type === "path"
          ? { points: node.points.map(([x, y]) => [x * 0.98, y + 8]) }
          : {}),
      })),
    });
    const compiled = compilePreparedScene(variant);
    const changed = await page.evaluate(
      async ({ scene, moduleUrl }) => {
        const mod = (await import(moduleUrl)) as typeof IllustratedRenderer;
        const canvas = document.createElement("canvas");
        const images = await mod.loadIllustratedImages(
          scene,
          (id) =>
            `/illustrated/assets/${scene.assets
              .find((a) => a.id === id)!
              .path.split("/")
              .at(-1)}`,
        );
        const preview = mod.createIllustratedPreview(canvas, scene, images);
        preview.renderFrame(0);
        const first = canvas.toDataURL();
        preview.renderFrame(scene.timeline.frameCount - 1);
        const last = canvas.toDataURL();
        preview.renderFrame(0);
        const repeat = canvas.toDataURL();
        preview.dispose();
        return { changed: first !== last, deterministic: first === repeat };
      },
      {
        scene: compiled,
        moduleUrl: `/@fs${root}/packages/renderer-core/src/illustrated-renderer.ts`,
      },
    );
    assert.ok(
      changed.changed && changed.deterministic,
      `Alternate scene failed: ${entry.id}`,
    );
  }
  const input = PreparedSceneSchema.parse(
    JSON.parse(
      await readFile(
        "benchmarks/fixtures/history-offstage-v2/pose-prop-change.json",
        "utf8",
      ),
    ),
  );
  input.fps = 30;
  for (const asset of input.assets)
    asset.path = resolve("benchmarks/fixtures/history-offstage-v2", asset.path);
  const variantPath = join(temporary, "variant.json");
  await writeFile(variantPath, JSON.stringify(input));
  const result30 = await new PreparedAnimationEngine().animate({
    scenePath: variantPath,
    outputPath: join(temporary, "variant-30.mp4"),
  });
  assert.equal(result30.frameCount, 210);
  const tampered = structuredClone(input);
  tampered.assets[0]!.sha256 = `sha256:${"0".repeat(64)}`;
  await writeFile(variantPath, JSON.stringify(tampered));
  await assert.rejects(loadPreparedScene(variantPath), /checksum differs/);
  assert.deepEqual(errors, []);
  if (renders !== temporary)
    await writeFile(
      join(renders, "parity-report.json"),
      JSON.stringify(
        {
          comparisons: samples.length,
          alternateScenes: 6,
          additional30fpsFrames: 210,
          samples,
        },
        null,
        2,
      ) + "\n",
    );
  console.log(
    `Illustrated QA passed: ${samples.length} preview/export comparisons, six alternate scenes, 24/30 fps, asset integrity.`,
  );
} finally {
  await browser?.close();
  await server.close();
  await rm(temporary, { recursive: true, force: true });
}
