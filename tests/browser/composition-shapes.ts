import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import type { Composition } from "@still-shift/scene-contract";
import { shapeCases } from "../../scripts/composition/shape-fixtures.ts";
import { runShapeAcceptance } from "./shape-acceptance.ts";
import type * as Render from "../../packages/renderer-core/src/index.ts";

const root = resolve(import.meta.dirname, "../.."),
  proof = resolve(root, "benchmarks/results/composition-ce5-verification");
await mkdir(proof, { recursive: true });
const core = JSON.parse(
  await readFile(
    resolve(root, "benchmarks/fixtures/composition/ce5/core.json"),
    "utf8",
  ),
) as Composition;
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
  await page.addInitScript("window.__name = (fn) => fn;");
  await page.goto(server.resolvedUrls!.local[0]!);
  const result = await page.evaluate(
    async ({
      coreJson,
      casesJson,
    }: {
      coreJson: string;
      casesJson: string;
    }) => {
      const core = JSON.parse(coreJson) as Composition;
      const url = "/packages/renderer-core/src/index.ts",
        m = (await import(url)) as typeof Render;
      const cases = JSON.parse(casesJson) as ReturnType<typeof shapeCases>;
      const results: {
        id: string;
        frames: number;
        maxDelta: number;
        changedBytes: number;
        minPsnr: number;
      }[] = [];
      for (const fixture of [
        { id: "connector", doc: core },
        ...cases.map((entry) => ({
          id: entry.id,
          doc: {
            schemaVersion: "composition-1",
            id: "shapes",
            width: 128,
            height: 96,
            fps: 24,
            frameCount: 48,
            assets: [],
            background: "#25313b",
            layers: [{ id: "shape", type: "shape", contents: entry.contents }],
          } as Composition,
        })),
      ]) {
        const previews = ["canvas2d", "webgl2"].map((backend) =>
          m.createCompositionPreview(
            document.createElement("canvas"),
            fixture.doc,
            { images: new Map(), fonts: new Map() },
            { backend: backend as "canvas2d" | "webgl2" },
          ),
        );
        let maxDelta = 0,
          changedBytes = 0,
          minPsnr = Infinity;
        const saved = new Map<number, [Uint8ClampedArray, Uint8ClampedArray]>();
        try {
          for (const frame of [0, 8, 24, 47, 24, 8, 0]) {
            previews.forEach((preview) => preview.renderFrame(frame));
            const a = previews[0]!.readPixels(),
              b = previews[1]!.readPixels();
            for (let i = 0; i < a.length; i++) {
              const delta = Math.abs(a[i]! - b[i]!);
              maxDelta = Math.max(maxDelta, delta);
              changedBytes += Number(delta > 0);
            }
            const metrics = m.compareFrames(
              a,
              b,
              fixture.doc.width,
              fixture.doc.height,
            );
            minPsnr = Math.min(
              minPsnr,
              Number.isFinite(metrics.psnr) ? metrics.psnr : 999,
            );
            if (!m.meetsTier(metrics, "near"))
              throw Error(
                `${fixture.id}: failed unchanged near tier (${JSON.stringify(metrics)})`,
              );
            const earlier = saved.get(frame);
            if (
              earlier &&
              (earlier[0].some((byte, i) => byte !== a[i]) ||
                earlier[1].some((byte, i) => byte !== b[i]))
            )
              throw Error(`${fixture.id}: reverse seek changed frame ${frame}`);
            saved.set(frame, [a.slice(), b.slice()]);
          }
        } finally {
          previews.forEach((preview) => preview.dispose());
        }
        results.push({
          id: fixture.id,
          frames: 7,
          maxDelta,
          changedBytes,
          minPsnr,
        });
      }
      return results;
    },
    { coreJson: JSON.stringify(core), casesJson: JSON.stringify(shapeCases()) },
  );
  await writeFile(
    resolve(proof, "native-backend-probe.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  for (const entry of result) console.log(JSON.stringify(entry));
  assert(
    result
      .filter(
        (entry) =>
          entry.id === "connector" ||
          entry.id === "stroke-ink" ||
          entry.id === "stroke-brush",
      )
      .every((entry) => entry.maxDelta === 0),
    "Native connector/ink/brush Canvas/WebGL pixels differ",
  );
  await runShapeAcceptance(page, root, proof);
} finally {
  await browser.close();
  await server.close();
}
