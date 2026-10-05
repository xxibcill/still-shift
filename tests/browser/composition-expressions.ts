/**
 * CE9 browser coverage: expression-driven compositions render the same pixels as
 * their baked keys on both backends, seek deterministically, and export repeatably.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Page } from "playwright";
import { createServer } from "vite";
import { renderComposition } from "@still-shift/animation-engine";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import type { Composition } from "@still-shift/scene-contract";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import { bakeExpressions } from "../../packages/renderer-core/src/composition/bake.ts";

const root = resolve(import.meta.dirname, "../..");
const fixture = async (name: string) =>
  JSON.parse(
    await readFile(
      resolve(root, `benchmarks/fixtures/composition/ce9/${name}.json`),
      "utf8",
    ),
  ) as Composition;
const backends = ["canvas2d", "webgl2"] as const;

/** SHA-256 of each frame's pixels, rendered in `frames` order by one preview. */
async function frameHashes(
  page: Page,
  composition: Composition,
  backend: (typeof backends)[number],
  frames: number[],
) {
  return page.evaluate(
    async ({ json, backend, frames }) => {
      const composition = JSON.parse(json) as Composition;
      const moduleUrl = "/packages/renderer-core/src/index.ts";
      const m = (await import(moduleUrl)) as typeof Render;
      const resources = await m.loadCompositionResources(composition, () => {
        throw new Error("CE9 fixtures use no assets");
      });
      const preview = m.createCompositionPreview(
        document.createElement("canvas"),
        composition,
        resources,
        { backend },
      );
      try {
        const hashes: string[] = [];
        for (const frame of frames) {
          const report = preview.renderFrame(frame);
          if (report.diagnostics.some((d) => d.severity === "error"))
            throw new Error(JSON.stringify(report.diagnostics));
          const digest = await crypto.subtle.digest(
            "SHA-256",
            new Uint8Array(preview.readPixels()),
          );
          hashes.push(
            [...new Uint8Array(digest)]
              .map((b) => b.toString(16).padStart(2, "0"))
              .join(""),
          );
        }
        return hashes;
      } finally {
        preview.dispose();
      }
    },
    { json: JSON.stringify(composition), backend, frames },
  );
}

const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
const browser = await launchRenderBrowser();
const directory = await mkdtemp(join(tmpdir(), "composition-expressions-"));
const results: string[] = [];
try {
  const page = await browser.newPage();
  await page.addInitScript("window.__name = (fn) => fn;");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(server.resolvedUrls!.local[0]!);

  const committed = await fixture("overlap-demo.baked");
  const cases: { name: string; source: Composition }[] = [
    { name: "overlap-demo", source: await fixture("overlap-demo") },
    { name: "built-ins", source: await fixture("built-ins") },
    { name: "nested-echo", source: await fixture("nested-echo") },
    { name: "separated-roving", source: await fixture("separated-roving") },
    {
      name: "auto-orient-boundaries",
      source: {
        schemaVersion: "composition-1",
        id: "main",
        width: 200,
        height: 200,
        fps: 30,
        frameCount: 40,
        assets: [],
        layers: [
          {
            id: "a",
            type: "solid",
            size: [20, 10],
            color: "#808080",
            transform: { autoOrient: "path" },
          },
        ],
        expressions: {
          "a.transform.position": {
            source: "[50 + frame, 40 + frame * frame / 40]",
          },
          "a.transform.rotation": {
            source: "if(frame >= 0, 0, valueAtTime(10000))",
          },
        },
      },
    },
  ];
  for (const { name, source } of cases) {
    const baked = bakeExpressions(source);
    assert.ok(baked.ok, JSON.stringify(baked.diagnostics));
    if (name === "overlap-demo")
      assert.deepEqual(
        baked.composition,
        committed,
        "committed bake is current",
      );
    const forward = Array.from({ length: source.frameCount }, (_, i) => i);
    // Fixed shuffled order for seek determinism.
    const shuffled = forward
      .map((frame) => ({ frame, key: (frame * 7919 + 13) % 101 }))
      .sort((a, b) => a.key - b.key)
      .map(({ frame }) => frame);
    for (const backend of backends) {
      const expression = await frameHashes(page, source, backend, forward);
      const keyed = await frameHashes(
        page,
        baked.composition,
        backend,
        forward,
      );
      const sought = await frameHashes(page, source, backend, shuffled);
      const mismatched = forward.filter((i) => expression[i] !== keyed[i]);
      assert.deepEqual(
        mismatched,
        [],
        `${name} ${backend}: expression and baked frames differ`,
      );
      shuffled.forEach((frame, i) =>
        assert.equal(
          sought[i],
          expression[frame],
          `${name} ${backend}: seeking to frame ${frame} differs from forward play`,
        ),
      );
      assert.ok(
        new Set(expression).size > source.frameCount / 2,
        `${name} ${backend}: frames should keep changing`,
      );
      results.push(
        `${name} ${backend}: ${source.frameCount} expression frames equal their baked keys and random seeks`,
      );
    }
  }
  assert.deepEqual(errors, []);

  // Export: repeatable, and identical for the expression and baked compositions.
  const demoPath = resolve(
    root,
    "benchmarks/fixtures/composition/ce9/overlap-demo.json",
  );
  const bakedPath = join(directory, "overlap-demo.baked.json");
  await writeFile(bakedPath, JSON.stringify(committed));
  for (const backend of backends) {
    const render = (input: string, output: string) =>
      renderComposition({
        compositionPath: input,
        outputPath: join(directory, `${output}-${backend}.mp4`),
        backend,
      });
    const first = await render(demoPath, "demo-a");
    const second = await render(demoPath, "demo-b");
    const keyed = await render(bakedPath, "baked");
    assert.equal(
      first.checksums.output,
      second.checksums.output,
      `${backend}: repeated export`,
    );
    assert.equal(
      first.checksums.output,
      keyed.checksums.output,
      `${backend}: baked export`,
    );
    assert.equal(first.frameCount, 90);
    results.push(
      `${backend} export: repeated and baked MP4s are byte-identical (${first.checksums.output.slice(0, 12)}…)`,
    );
  }
  console.log(`Composition expressions:\n- ${results.join("\n- ")}`);
} finally {
  await browser.close();
  await server.close();
  await rm(directory, { recursive: true, force: true });
}
