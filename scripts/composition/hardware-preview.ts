/**
 * Hardware-GPU preview drift for composition-1 (docs/composition-engine-plan.md,
 * GPU determinism policy and CE3). Renders sampled frames of the CE3 charts and the
 * composition fixtures through `createCompositionPreview` in the pinned software
 * browser and in a hardware-GPU browser, then records the tolerance tier per item.
 *
 *   pnpm composition:hardware-preview            measure and write the report
 *   options: --only <id prefix>[,<id prefix>]
 *
 * As in CE0, each sampled frame renders on a fresh canvas and is read back once,
 * because Chromium moves a canvas off the GPU after repeated readbacks.
 */
import { join, resolve } from "node:path";
import { arch, argv, platform } from "node:process";
import { readFile, writeFile } from "node:fs/promises";
import { format } from "prettier";
import { createServer } from "vite";
import type { Page } from "playwright";
import type { Composition } from "@still-shift/scene-contract";
import {
  assertPinnedRenderEnvironment,
  launchRenderBrowser,
  probeRenderEnvironment,
  type RenderBrowserProfile,
} from "../../packages/execution-runtime/src/render-browser.ts";
import {
  compareFrames,
  FRAME_TOLERANCE_VERSION,
  meetsTier,
  strictestTier,
  worstTier,
} from "../../packages/renderer-core/src/frame-tolerance.ts";
import { COMPOSITION_RENDERER_VERSION } from "../../packages/renderer-core/src/composition/render/version.ts";
import { ce3Charts } from "../../benchmarks/fixtures/composition/ce3/charts.ts";
import type * as Render from "../../packages/renderer-core/src/composition/render/index.ts";

const root = resolve(import.meta.dirname, "../..");
const fixtureRoot = join(root, "benchmarks/fixtures/composition");
const reportPath = join(
  root,
  `tests/visual/composition-baselines/ce3-hardware-preview-${platform}-${arch}.json`,
);
const only = (() => {
  const index = argv.indexOf("--only");
  return index >= 0 ? argv[index + 1]?.split(",") : undefined;
})();

type Item = {
  id: string;
  comp: Composition;
  frames: number[];
  assetBase?: string;
};
const sampled = (frameCount: number) => [
  ...new Set([
    ...Array.from({ length: Math.ceil(frameCount / 10) }, (_, i) => i * 10),
    frameCount - 1,
  ]),
];
const items: Item[] = [...ce3Charts()];
for (const name of ["ce1/first-slice", "ce1/every-field", "ce2/timing"]) {
  const comp = JSON.parse(
    await readFile(join(fixtureRoot, `${name}.json`), "utf8"),
  ) as Composition;
  items.push({
    id: name,
    comp,
    frames: sampled(comp.frameCount),
    assetBase: join(fixtureRoot, name, ".."),
  });
}
const selected = items.filter(
  (item) => !only || only.some((prefix) => item.id.startsWith(prefix)),
);

const server = await createServer({
  root,
  configFile: false,
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});
await server.listen();
const origin = server.resolvedUrls!.local[0]!;
const moduleUrl = `${origin}packages/renderer-core/src/composition/render/index.ts`;

async function session(profile: RenderBrowserProfile) {
  const browser = await launchRenderBrowser({ profile });
  const page = await browser.newPage();
  await page.goto(origin);
  const environment = await probeRenderEnvironment(page, profile);
  if (profile === "pinned") assertPinnedRenderEnvironment(environment);
  return { browser, page, environment };
}

/** One fresh canvas and preview per frame, read back once. */
async function renderFrame(page: Page, item: Item, frame: number) {
  const urls = Object.fromEntries(
    item.comp.assets.map((a) => [
      a.id,
      new URL(`/@fs${resolve(item.assetBase!, a.path)}`, origin).href,
    ]),
  );
  const encoded = await page.evaluate(
    async ({ id, compJson, urls, frame, moduleUrl }) => {
      type Cache = { id: string; resources: unknown };
      const state = window as unknown as { __ce3?: Cache };
      const m = (await import(moduleUrl)) as typeof Render;
      const comp = JSON.parse(compJson);
      if (state.__ce3?.id !== id)
        state.__ce3 = {
          id,
          resources: await m.loadCompositionResources(comp, (a) => urls[a]!),
        };
      const canvas = document.createElement("canvas");
      const preview = m.createCompositionPreview(
        canvas,
        comp,
        state.__ce3.resources as Render.CompositionResources,
      );
      preview.renderFrame(frame);
      const data = canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      preview.dispose();
      let binary = "";
      for (let at = 0; at < data.length; at += 0x8000)
        binary += String.fromCharCode(...data.subarray(at, at + 0x8000));
      return btoa(binary);
    },
    {
      id: item.id,
      compJson: JSON.stringify(item.comp),
      urls,
      frame,
      moduleUrl,
    },
  );
  return new Uint8Array(Buffer.from(encoded, "base64"));
}

const pinned = await session("pinned");
const hardware = await session("hardware");
console.log(`pinned:   ${pinned.environment.webglRenderer}`);
console.log(`hardware: ${hardware.environment.webglRenderer}`);
const report: Record<string, unknown> = {};
const missed: string[] = [];
try {
  for (const item of selected) {
    const comparisons = [];
    for (const frame of item.frames)
      comparisons.push(
        compareFrames(
          await renderFrame(pinned.page, item, frame),
          await renderFrame(hardware.page, item, frame),
          item.comp.width,
          item.comp.height,
        ),
      );
    const observedTier = worstTier(comparisons.map(strictestTier));
    const minPsnr = Math.min(...comparisons.map((c) => c.psnr));
    const perceptual = comparisons.every((c) => meetsTier(c, "perceptual"));
    if (!perceptual) missed.push(item.id);
    report[item.id] = {
      observedTier,
      sampledFrames: item.frames.length,
      maxChannelDelta: Math.max(...comparisons.map((c) => c.maxChannelDelta)),
      minPsnr: Number.isFinite(minPsnr)
        ? Math.round(minPsnr * 100) / 100
        : "identical",
      minSsim:
        Math.round(Math.min(...comparisons.map((c) => c.ssim)) * 1e5) / 1e5,
    };
    console.log(
      `${item.id.padEnd(28)} ${String(item.frames.length).padStart(3)}f ${String(observedTier ?? "none").padEnd(10)} ${JSON.stringify(report[item.id])}`,
    );
  }
} finally {
  await pinned.browser.close();
  await hardware.browser.close();
  await server.close();
}

// A partial run (--only) updates its items and keeps the rest of the report.
type Entry = { observedTier: string | null };
const previous = only
  ? ((
      JSON.parse(await readFile(reportPath, "utf8").catch(() => "{}")) as {
        items?: Record<string, Entry>;
      }
    ).items ?? {})
  : {};
const merged: Record<string, Entry> = {
  ...previous,
  ...(report as Record<string, Entry>),
};
// A null tier misses even `perceptual`, the hardware-preview guarantee.
const below = Object.keys(merged)
  .filter((id) => merged[id]!.observedTier === null)
  .sort();
await writeFile(
  reportPath,
  await format(
    JSON.stringify({
      version: "ce3-hardware-preview-1",
      tolerance: FRAME_TOLERANCE_VERSION,
      renderer: COMPOSITION_RENDERER_VERSION,
      method:
        "Each sampled frame renders through createCompositionPreview on a fresh canvas and is read back once, in the pinned software browser and in a hardware-GPU browser.",
      pinned: pinned.environment,
      hardware: hardware.environment,
      belowPerceptual: below,
      items: Object.fromEntries(
        Object.entries(merged).sort(([a], [b]) => (a < b ? -1 : 1)),
      ),
    }),
    { filepath: reportPath },
  ),
);
console.log(`wrote ${reportPath}`);
if (missed.length)
  console.log(`below the perceptual tier: ${missed.join(", ")}`);
