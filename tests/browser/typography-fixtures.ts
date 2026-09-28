import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { compareFrameSamples } from "../../packages/renderer-core/src/parity.ts";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import {
  loadPreparedScene,
  PreparedAnimationEngine,
} from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import { runtimeBrowserUrl } from "@still-shift/execution-runtime/browser";

const root = resolve("."),
  output = resolve(
    process.env.TYPOGRAPHY_OUTPUT ?? "/tmp/still-shift-type-fixtures",
  );
await mkdir(output, { recursive: true });
const server = await createServer({
  root,
  configFile: false,
  logLevel: "silent",
  server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
const reports: unknown[] = [];
try {
  const page = await browser.newPage();
  await page.addInitScript("window.__name = (fn) => fn;");
  await page.goto(runtimeBrowserUrl(server.resolvedUrls!.local[0]!, "export"));
  for (const name of [
    "editorial",
    "selectors",
    "transitions",
    "semantic",
    "variable-thai",
    "glyph-performance",
    "vertical",
    "commerce",
  ].filter(
    (name) =>
      !process.argv.includes("--only") ||
      process.argv[process.argv.indexOf("--only") + 1]!.split(",").includes(
        name,
      ),
  )) {
    const source = JSON.parse(
      await readFile(
        resolve(`benchmarks/fixtures/typography/${name}.json`),
        "utf8",
      ),
    );
    const loaded = await loadPreparedScene(
      resolve(`benchmarks/fixtures/typography/${name}.json`),
    );
    const result = await page.evaluate(
      async ({ root, scene, source, paths, name }) => {
        if (
          scene.schemaVersion !== "story-scene-1" &&
          scene.schemaVersion !== "commerce-scene-1"
        )
          throw new Error("Wrong fixture schema");
        const { createIllustratedPreview, loadIllustratedImages } =
          await import(
            `/@fs/${root}/packages/renderer-core/src/illustrated-renderer.ts`
          );
        const { renderTypeSpecimen } = await import(
          `/@fs/${root}/packages/renderer-core/src/typography-specimen.ts`
        );
        const { analyzeStoryQuality } = await import(
          `/@fs/${root}/packages/renderer-core/src/story-quality.ts`
        );
        const { measureTypographyPixels } = await import(
          `/@fs/${root}/packages/renderer-core/src/typography-pixels.ts`
        );
        const { createTypographyTools } = await import(
          `/@fs/${root}/apps/lab/src/typography-tools.ts`
        );
        const images = await loadIllustratedImages(
          scene,
          (id: string) => `/@fs/${paths[id]}`,
        );
        const canvas = document.createElement("canvas"),
          preview = createIllustratedPreview(canvas, scene, images);
        const frames = [0, 20, 40, 60, 80, 100, scene.frameCount - 1];
        const capture = (frame: number) => {
          preview.renderFrame(frame);
          return canvas.toDataURL().split(",")[1]!;
        };
        const captures = frames.map((frame) => ({
          frame,
          png: capture(frame),
        }));
        const backward = [...frames]
          .reverse()
          .every(
            (frame) =>
              capture(frame) === captures.find((c) => c.frame === frame)!.png,
          );
        const endpointChecks: { node: string; frame: number; same: boolean }[] =
          [];
        for (const node of scene.nodes) {
          if (node.type !== "text") continue;
          // A release fades an emphasis through its weight curve, so an animator
          // settles at its end or its last weight key, whichever is later.
          const settles = (a: {
            end: number;
            weight?: { frame: number }[] | undefined;
          }) => Math.max(a.end, ...(a.weight ?? []).map((k) => k.frame));
          const ends = [
            ...(scene.textAnimators ?? [])
              .filter((a: { node: string }) => a.node === node.id)
              .map(settles),
            ...(
              node.transitions ?? (node.transition ? [node.transition] : [])
            ).map((t: { window: { end: number } }) => t.window.end),
          ];
          for (const frame of ends) {
            if (frame + 1 >= scene.frameCount) continue;
            const isolated = {
              ...scene,
              nodes: [{ ...node, parent: undefined, x: 140, y: 300 }],
              textEvents: [],
              tracks: {},
              camera: undefined,
              compiledMotion: { layers: [] },
              drivers: [],
              constraints: [],
              effects: [],
              compiledFlows: [],
              componentData: undefined,
              textAnimators: (scene.textAnimators ?? []).filter(
                (a: {
                  node: string;
                  end: number;
                  weight?: { frame: number }[] | undefined;
                }) => a.node === node.id && settles(a) <= frame,
              ),
            };
            const probe = document.createElement("canvas"),
              renderer = createIllustratedPreview(probe, isolated, images);
            renderer.renderFrame(frame);
            const end = probe.toDataURL();
            renderer.renderFrame(frame + 1);
            endpointChecks.push({
              node: node.id,
              frame,
              same: end === probe.toDataURL(),
            });
            renderer.dispose();
          }
        }
        const specimen = renderTypeSpecimen(scene, images.fonts).map(
          (c: HTMLCanvasElement) => c.toDataURL().split(",")[1]!,
        );
        const quality =
          scene.schemaVersion === "story-scene-1"
            ? analyzeStoryQuality(scene, {
                typography: {
                  prepared: preview.typography,
                  pixels: measureTypographyPixels(scene, images),
                },
              })
            : undefined;
        let performanceRatio: number | undefined;
        if (name === "glyph-performance") {
          const durations = (frame: number) => {
            const values: number[] = [];
            for (let round = 0; round < 7; round++) {
              const start = performance.now();
              for (let i = 0; i < 80; i++) preview.renderFrame(frame);
              canvas.getContext("2d")!.getImageData(0, 0, 1, 1);
              values.push((performance.now() - start) / 80);
            }
            return values.sort((a, b) => a - b)[3]!;
          };
          durations(60);
          const staticMs = durations(60),
            animatedMs = durations(30);
          performanceRatio = animatedMs / staticMs;
        }
        let labActions:
          | { emphasis: boolean; pixels: boolean; seeking: boolean }
          | undefined;
        if (scene.schemaVersion === "story-scene-1") {
          let applied = false,
            seekFrame = -1;
          const host: HTMLElement = createTypographyTools(
            source,
            (frame: number) => {
              seekFrame = frame;
            },
            images,
            (draft: { textEvents?: unknown[] }) => {
              applied =
                draft.textEvents?.length === source.textEvents.length + 1;
            },
          );
          document.body.replaceChildren(host);
          if (name === "semantic") {
            const wordSelect = host.querySelector<HTMLSelectElement>(
              'select[aria-label="Spoken word"]',
            )!;
            wordSelect.value = String(
              source.narrationTiming.segments.findIndex(
                (word: { text: string }) =>
                  word.text.toLowerCase().replace(/[^a-z]/g, "") === "wrong",
              ),
            );
            [...host.querySelectorAll<HTMLButtonElement>("button")]
              .find((b) => b.textContent === "Emphasize on spoken word")!
              .click();
            host.querySelector<HTMLButtonElement>(".type-word")!.click();
            [...host.querySelectorAll<HTMLButtonElement>("button")]
              .find(
                (b) => b.textContent === "Check contrast and animation handoff",
              )!
              .click();
            await new Promise(requestAnimationFrame);
            labActions = {
              emphasis: applied,
              seeking: seekFrame >= 0,
              pixels: host
                .querySelector('[role="status"]')!
                .textContent!.includes("checks complete"),
            };
          }
        }
        const rag = preview.typography.nodes
          .get("rag")
          ?.values()
          .next()
          .value?.layout.lines.map((l: { text: string }) => l.text);
        const variableWidths =
          name === "variable-thai"
            ? [...preview.typography.nodes.get("thai").values()][0].variants
                .values()
                .map((r: { layout: { width: number } }) => r.layout.width)
                .toArray()
            : [];
        let thaiBreaks: { before: string[]; after: string[] }[] = [];
        if (name === "commerce") {
          const { measureTextLayout } = await import(
            `/@fs/${root}/packages/renderer-core/src/text-layout.ts`
          );
          const { applyTextStyle } = await import(
            `/@fs/${root}/packages/renderer-core/src/typography-style.ts`
          );
          const ctx = document.createElement("canvas").getContext("2d")!;
          thaiBreaks = scene.nodes
            .filter((n) => n.type === "text")
            .filter((n) => n.textBox?.locale === "th")
            .map((node) => {
              const layout = preview.typography.nodes
                .get(node.id)
                .get(node.text).layout;
              applyTextStyle(ctx, layout.runs[0].style, images.fonts);
              const before = measureTextLayout(ctx, {
                ...node,
                fontSize: layout.runs[0].style.size,
              }).lines;
              return {
                before,
                after: layout.lines.map((l: { text: string }) => l.text),
              };
            });
        }
        preview.dispose();
        return {
          thaiBreaks,
          labActions,
          captures,
          backward,
          endpointChecks,
          specimen,
          quality,
          performanceRatio,
          rag,
          variableWidths,
        };
      },
      { root, scene: loaded.scene, source, paths: loaded.assetPaths, name },
    );
    if (name === "commerce") {
      assert.ok(result.thaiBreaks.length > 0, "Missing Thai commerce boxes");
      for (const breaks of result.thaiBreaks)
        assert.deepEqual(
          breaks.after,
          breaks.before,
          "Thai line breaks changed",
        );
    }
    if (name === "semantic")
      assert.deepEqual(result.labActions, {
        emphasis: true,
        pixels: true,
        seeking: true,
      });
    assert.ok(result.backward, `${name}: seek determinism`);
    assert.ok(
      result.endpointChecks.every((c) => c.same),
      `${name}: completion snap ${JSON.stringify(result.endpointChecks)}`,
    );
    const jumps = (result.quality?.diagnostics ?? []).filter(
      (d: { code: string }) => d.code === "text-pose-jump",
    );
    assert.deepEqual(jumps, [], `${name}: single-frame glyph jump`);
    if (name === "editorial")
      assert.ok(
        result.rag!.at(-1)!.trim().split(/\s+/).length > 1,
        "Pretty wrapping left an orphan",
      );
    if (name === "variable-thai")
      assert.ok(
        new Set(result.variableWidths.map((w: number) => Math.round(w))).size >
          2,
        "Variable axes did not change measured widths",
      );
    if (result.performanceRatio !== undefined)
      assert.ok(
        result.performanceRatio <= 1.5,
        `Glyph animation takes ${result.performanceRatio.toFixed(2)}× static`,
      );
    for (const capture of result.captures)
      await writeFile(
        resolve(output, `${name}-${capture.frame}.png`),
        Buffer.from(capture.png, "base64"),
      );
    for (const [i, png] of result.specimen.entries())
      await writeFile(
        resolve(output, `${name}-specimen-${i}.png`),
        Buffer.from(png, "base64"),
      );
    if (result.quality)
      await writeFile(
        resolve(output, `${name}.quality.json`),
        JSON.stringify(result.quality, null, 2),
      );
    const report = {
      name,
      backward: result.backward,
      endpoints: result.endpointChecks,
      performanceRatio: result.performanceRatio,
      thaiBreaks: result.thaiBreaks,
      labActions: result.labActions,
      rag: result.rag,
    };
    reports.push(report);
    console.log(JSON.stringify(report));
  }
  await writeFile(
    resolve(output, "acceptance.json"),
    JSON.stringify(reports, null, 2),
  );
  if (process.argv.includes("--export")) {
    const engine = new PreparedAnimationEngine();
    const result = await engine.animate({
      scenePath: resolve("benchmarks/fixtures/typography/transitions.json"),
      outputPath: resolve(output, "transitions.mp4"),
    });
    assert.ok(result);
    const run = promisify(execFile);
    const rgb = async (path: string, frame?: number) => {
      const filter = [
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
          filter,
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
    const parity = [];
    for (const frame of [0, 20, 40, 60, 80, 100, 150]) {
      const score = compareFrameSamples(
        await rgb(resolve(output, `transitions-${frame}.png`)),
        await rgb(resolve(output, "transitions.mp4"), frame),
        96,
        54,
      );
      assert.equal(
        score.warning,
        null,
        `Export parity frame ${frame}: ${JSON.stringify(score)}`,
      );
      parity.push({ frame, ...score });
    }
    await writeFile(
      resolve(output, "export-parity.json"),
      JSON.stringify(parity, null, 2),
    );
    console.log("CLI export and 7 preview/export comparisons passed");
  }
} finally {
  await browser.close();
  await server.close();
}
