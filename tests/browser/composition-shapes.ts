import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import type { Composition, ShapeContent } from "@still-shift/scene-contract";
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
  const result = await page.evaluate(async (coreJson: string) => {
    const core = JSON.parse(coreJson) as Composition;
    const url = "/packages/renderer-core/src/index.ts",
      m = (await import(url)) as typeof Render;
    const cases: { id: string; contents: ShapeContent[] }[] = [];
    const rect: ShapeContent = {
      id: "rect",
      type: "rect",
      size: [50, 40],
      position: [60, 45],
      roundness: 6,
    };
    const fill: ShapeContent = { id: "fill", type: "fill", color: "#eec344" };
    const gradient: ShapeContent = {
      id: "gradient",
      type: "gradient-fill",
      gradient: "linear",
      start: [30, 20],
      end: [90, 70],
      stops: [
        { id: "a", offset: 0, color: "#df507780" },
        { id: "b", offset: 1, color: "#26e5cc" },
      ],
    };
    cases.push(
      { id: "rect", contents: [rect, fill] },
      {
        id: "ellipse",
        contents: [
          {
            id: "ellipse",
            type: "ellipse",
            size: [70, 50],
            position: [60, 45],
          },
          fill,
        ],
      },
      {
        id: "star",
        contents: [
          {
            id: "star",
            type: "polystar",
            kind: "star",
            points: 5,
            innerRadius: 15,
            outerRadius: 30,
            position: [60, 45],
          },
          fill,
        ],
      },
      { id: "gradient", contents: [rect, gradient] },
    );
    for (const style of ["plain", "ink", "brush"] as const)
      cases.push({
        id: `stroke-${style}`,
        contents: [
          {
            id: "path",
            type: "path",
            path: {
              closed: false,
              vertices: [
                [25, 30],
                [65, 30],
                [95, 60],
              ],
              outTangents: [
                [0, 20],
                [10, 0],
                [0, 0],
              ],
              inTangents: [
                [0, 0],
                [-10, 0],
                [0, -10],
              ],
            },
          },
          {
            id: "stroke",
            type: "stroke",
            style,
            width: 10,
            color: "#eec344",
            dashes: [15, 8],
            cap: "round",
            join: "round",
          },
        ],
      });
    const operators: ShapeContent[] = [
      { id: "operator", type: "trim-paths", end: 0.6, offset: 180 },
      {
        id: "operator",
        type: "repeater",
        copies: 2.5,
        transform: { position: [10, 7] },
        startOpacity: 1,
        endOpacity: 0.4,
      },
      { id: "operator", type: "offset-path", amount: 5, join: "round" },
      { id: "operator", type: "round-corners", radius: 8 },
      {
        id: "operator",
        type: "wiggle-paths",
        size: 5,
        detail: 3,
        frequency: 2,
        seed: 42,
      },
      { id: "operator", type: "zig-zag", size: 4, ridges: 2, points: "smooth" },
      { id: "operator", type: "pucker-bloat", amount: 0.5 },
      { id: "operator", type: "twist", angle: 120, center: [60, 45] },
    ];
    for (const operator of operators)
      cases.push({ id: operator.type, contents: [rect, fill, operator] });
    for (const mode of ["union", "subtract", "intersect", "exclude"] as const)
      cases.push({
        id: `merge-${mode}`,
        contents: [
          rect,
          { ...rect, id: "second", position: [80, 55] },
          fill,
          { id: "merge", type: "merge-paths", mode },
        ],
      });
    cases.push({
      id: "painted-repeat-gradient",
      contents: [
        rect,
        gradient,
        {
          id: "repeat",
          type: "repeater",
          copies: 3,
          transform: { position: [10, 3] },
          startOpacity: 0.9,
          endOpacity: 0.5,
        },
      ],
    });
    cases.push({
      id: "compound-repeat-gradient",
      contents: [
        rect,
        {
          id: "repeat",
          type: "repeater",
          copies: 3,
          transform: { position: [10, 3] },
          startOpacity: 1,
          endOpacity: 1,
        },
        gradient,
      ],
    });
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
  }, JSON.stringify(core));
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
} finally {
  await browser.close();
  await server.close();
}
