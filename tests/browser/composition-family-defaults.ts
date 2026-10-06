import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createServer } from "vite";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
  assertPinnedRenderEnvironment,
} from "@still-shift/execution-runtime";
import {
  loadPreparedScene,
  validatePreparedAssets,
} from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import { readStoryPassage } from "../../packages/animation-engine/src/story-passage-io.ts";
import {
  compilePreparedScene,
  type IllustratedScene,
} from "@still-shift/renderer-core";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import type * as Adapter from "../../packages/renderer-core/src/composition/adapters/illustrated-preview.ts";
import type * as Oracle from "../helpers/legacy-illustrated-oracle.ts";
import type { ToleranceTier } from "../../packages/renderer-core/src/frame-tolerance.ts";
import { familyTextProbeAcceptance } from "./family-text-probes.ts";

const root = resolve(import.meta.dirname, "../..");
const inventory = JSON.parse(
  await readFile(
    resolve(root, "tests/visual/composition-baselines/fixtures.json"),
    "utf8",
  ),
) as {
  fixtures: {
    id: string;
    family: string;
    kind: "scene" | "passage";
    path: string;
    tier: ToleranceTier;
  }[];
};
const frozen = JSON.parse(
  await readFile(
    resolve(root, "tests/visual/composition-baselines/darwin-arm64.json"),
    "utf8",
  ),
) as {
  items: Record<string, { frameCount: number; frames: string }>;
};
assert.equal(Object.keys(frozen.items).length, 176);
const candidate = process.argv.includes("--candidate");
const smoke = process.argv.includes("--smoke");
const only = process.argv.indexOf("--only");
if (candidate || smoke || only >= 0)
  console.log(
    "Diagnostic candidate/subset; production-default milestone acceptance remains pending.",
  );
const server = await createServer({
  root,
  configFile: false,
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});
await server.listen();
const browser = await launchRenderBrowser();
const reports: unknown[] = [];
const completed: string[] = [];
let totalFrames = 0;
let environment: Awaited<ReturnType<typeof probeRenderEnvironment>> | undefined;
try {
  for (const entry of inventory.fixtures.filter(
    (entry) => only < 0 || entry.id.includes(process.argv[only + 1]!),
  )) {
    const path = resolve(root, entry.path);
    const items: {
      id: string;
      scene: IllustratedScene;
      assetPaths: Record<string, string>;
    }[] =
      entry.kind === "scene"
        ? [{ id: entry.id, ...(await loadPreparedScene(path)) }]
        : await Promise.all(
            (await readStoryPassage(path)).beats.map(async (beat) => ({
              id: `${entry.id}/${beat.id}`,
              scene: compilePreparedScene(beat.scene),
              assetPaths: await validatePreparedAssets(
                beat.scene,
                dirname(path),
              ),
            })),
          );
    for (const item of items) {
      const reference = frozen.items[item.id];
      assert.ok(reference, `${item.id} must have its unchanged CE0 record`);
      assert.equal(item.scene.timeline.frameCount, reference.frameCount);
      const urls = Object.fromEntries(
        Object.entries(item.assetPaths).map(([id, path]) => [
          id,
          `/@fs${path}`,
        ]),
      );
      const page = await browser.newPage();
      try {
        await page.addInitScript("window.__name = (fn) => fn;");
        await page.goto(server.resolvedUrls!.local[0]!);
        if (!environment) {
          environment = await probeRenderEnvironment(page);
          assertPinnedRenderEnvironment(environment);
        }
        const report = await page.evaluate(
          async ({ sceneJson, urls, expected, tier, candidate, smoke }) => {
            const renderUrl = "/packages/renderer-core/src/index.ts";
            const adapterUrl =
              "/packages/renderer-core/src/composition/adapters/illustrated-preview.ts";
            const oracleUrl = "/tests/helpers/legacy-illustrated-oracle.ts";
            const render = (await import(renderUrl)) as typeof Render;
            const adapter = (await import(adapterUrl)) as typeof Adapter;
            const oracle = (await import(oracleUrl)) as typeof Oracle;
            const scene = JSON.parse(sceneJson) as IllustratedScene;
            const canvas = document.createElement("canvas"),
              oldCanvas = document.createElement("canvas");
            const images = await render.loadIllustratedImages(
              scene,
              (id) => urls[id]!,
            );
            const legacy = oracle.createIllustratedPreview(
              oldCanvas,
              scene,
              await oracle.loadIllustratedImages(scene, (id) => urls[id]!),
            );
            const preview = candidate
              ? adapter.createPreparedIllustratedPreview(canvas, scene, images)
              : render.createIllustratedPreview(canvas, scene, images);
            if (
              !candidate &&
              (!("backend" in preview) || preview.backend !== "canvas2d")
            )
              throw Error(
                "The actual family default must use the shared Canvas composition backend",
              );
            const pixels = () =>
              canvas
                .getContext("2d")!
                .getImageData(0, 0, canvas.width, canvas.height).data;
            const hash = async (bytes: Uint8ClampedArray) =>
              Array.from(
                new Uint8Array(
                  await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
                ),
                (value) => value.toString(16).padStart(2, "0"),
              ).join("");
            const frames = smoke
              ? [
                  ...new Set([
                    0,
                    Math.floor(scene.timeline.frameCount / 4),
                    Math.floor(scene.timeline.frameCount / 2),
                    Math.floor((3 * scene.timeline.frameCount) / 4),
                    scene.timeline.frameCount - 1,
                  ]),
                ]
              : Array.from(
                  { length: scene.timeline.frameCount },
                  (_, frame) => frame,
                );
            const hashes = new Map<number, string>();
            let maxDelta = 0,
              minPsnr = Infinity;
            try {
              for (const frame of frames) {
                legacy.renderFrame(frame);
                const old = oldCanvas
                  .getContext("2d")!
                  .getImageData(0, 0, oldCanvas.width, oldCanvas.height).data;
                if ((await hash(old)).slice(0, 16) !== expected[frame])
                  throw Error(
                    `Independent old oracle changed frozen CE0 frame ${frame}`,
                  );
                preview.renderFrame(frame);
                const actual = pixels();
                const comparison = render.compareFrames(
                  old,
                  actual,
                  canvas.width,
                  canvas.height,
                );
                if (!render.meetsTier(comparison, tier))
                  throw Error(
                    `Native family frame ${frame}: delta ${comparison.maxChannelDelta}, PSNR ${comparison.psnr}`,
                  );
                maxDelta = Math.max(maxDelta, comparison.maxChannelDelta);
                minPsnr = Math.min(minPsnr, comparison.psnr);
                hashes.set(frame, await hash(actual));
              }
              for (const frame of [...frames].reverse()) {
                preview.renderFrame(frame);
                if ((await hash(pixels())) !== hashes.get(frame))
                  throw Error(`Native reverse seek changed frame ${frame}`);
              }
              return {
                frames: frames.length,
                reverseFrames: frames.length,
                maxDelta,
                minPsnr,
                frozenOracle: "unchanged",
                candidate,
              };
            } finally {
              preview.dispose();
              legacy.dispose();
            }
          },
          {
            sceneJson: JSON.stringify(item.scene),
            urls,
            expected: reference.frames.split(" "),
            tier: entry.tier,
            candidate,
            smoke,
          },
        );
        const textProbes =
          entry.family === "typography"
            ? await familyTextProbeAcceptance(page, item.scene, urls)
            : undefined;
        reports.push({
          id: item.id,
          ...report,
          ...(textProbes ? { textProbes } : {}),
        });
        completed.push(item.id);
        totalFrames += report.frames;
        console.log(
          `${item.id}: ${report.frames} native/frozen/reverse frames, delta ${report.maxDelta}`,
        );
      } finally {
        await page.close();
      }
    }
  }
  assert.ok(completed.length > 0);
  if (only < 0 && !smoke) {
    assert.deepEqual([...completed].sort(), Object.keys(frozen.items).sort());
    assert.equal(totalFrames, 36061);
  }
  const directory = resolve(
    root,
    "benchmarks/results/composition-ce4d-family-defaults",
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(
      directory,
      `${candidate ? "candidate" : "defaults"}${smoke ? "-smoke" : ""}.json`,
    ),
    JSON.stringify(
      {
        environment,
        candidate,
        smoke,
        subset: only >= 0,
        items: completed.length,
        totalFrames,
        reports,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  try {
    await browser.close();
  } finally {
    await server.close();
  }
}
