import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const at = process.argv.indexOf("--baseline-root");
assert.ok(
  at >= 0,
  "Pass --baseline-root <clean starting-commit source snapshot>",
);
const root = resolve("."),
  baseline = resolve(process.argv[at + 1]!),
  output = resolve("/tmp/still-shift-type-legacy-browser");
await mkdir(output, { recursive: true });
const server = await createServer({
  root,
  configFile: false,
  logLevel: "silent",
  server: {
    host: "127.0.0.1",
    port: 0,
    fs: { allow: [root, baseline, "/private/tmp"] },
  },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
const reports: unknown[] = [];
try {
  const page = await browser.newPage();
  await page.addInitScript("window.__name = (fn) => fn;");
  await page.goto(server.resolvedUrls!.local[0]!);
  page.on("pageerror", (error) => console.error(error));
  for (const name of [
    "unequal-margins",
    "access-constraint",
    "relationship-build",
    "evidence-boundary",
    "dated-system-break",
    "category-swap",
    "motif-resolve",
  ]) {
    const manifest = JSON.parse(
      await readFile(
        `benchmarks/results/story-motion-v013/${name}.mp4.scene.json`,
        "utf8",
      ),
    );
    const result = await page.evaluate(
      async ({ root, baseline, manifest }) => {
        const render = async (directory: string) => {
          const { StorySceneSchema } = await import(
            `/@fs/${directory}/packages/scene-contract/src/story.ts`
          );
          const { compileStoryScene } = await import(
            `/@fs/${directory}/packages/renderer-core/src/story-scene.ts`
          );
          const { createIllustratedPreview, loadIllustratedImages } =
            await import(
              `/@fs/${directory}/packages/renderer-core/src/illustrated-renderer.ts`
            );
          const input = StorySceneSchema.parse(
            Object.fromEntries(
              Object.entries(manifest.scene).filter(([key]) =>
                Object.hasOwn(StorySceneSchema.shape, key),
              ),
            ),
          );
          const scene = compileStoryScene(input),
            images = await loadIllustratedImages(
              scene,
              (id: string) => `/@fs/${manifest.assetPaths[id]}`,
            );
          const canvas = document.createElement("canvas"),
            preview = createIllustratedPreview(canvas, scene, images),
            context = canvas.getContext("2d")!;
          const hashes: string[] = [];
          for (let frame = 0; frame < scene.frameCount; frame++) {
            preview.renderFrame(frame);
            const bytes = context.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            ).data;
            const digest = await crypto.subtle.digest("SHA-256", bytes);
            hashes.push(
              [...new Uint8Array(digest)]
                .map((b) => b.toString(16).padStart(2, "0"))
                .join(""),
            );
          }
          preview.dispose();
          return { hashes, version: scene.rendererVersion };
        };
        const before = await render(baseline),
          after = await render(root);
        return {
          versionBefore: before.version,
          versionAfter: after.version,
          frames: before.hashes.length,
          differences: before.hashes.flatMap((hash, frame) =>
            hash === after.hashes[frame] ? [] : [frame],
          ),
        };
      },
      { root, baseline, manifest },
    );
    assert.equal(
      result.versionBefore,
      result.versionAfter,
      `${name}: legacy renderer version changed`,
    );
    assert.deepEqual(result.differences, [], `${name}: legacy pixels changed`);
    reports.push({ name, ...result });
    console.log(
      `${name}: ${result.frames} full-resolution frames identical to starting commit`,
    );
  }
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(reports, null, 2),
  );
} finally {
  await browser.close();
  await server.close();
}
