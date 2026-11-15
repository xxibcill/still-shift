// ET1: an explicit pinned fallback draws exactly the code points its font lacks
// (docs/editorial-typography-improvement-plan.md#et1--exact-copy-font-coverage-gate).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import type { Composition } from "@still-shift/scene-contract";
import { compareFrames, strictestTier } from "@still-shift/renderer-core";
import type * as Render from "../../packages/renderer-core/src/index.ts";

const root = resolve(import.meta.dirname, "../..");
async function font(id: string, path: string, extra: object) {
  const bytes = await readFile(resolve(root, path));
  return {
    id,
    type: "font" as const,
    path,
    sha256:
      `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const,
    ...extra,
  };
}
// The fallback face joins the primary's weight/style descriptors, so the
// reference declares the same pinned Noto bytes at weight 600.
const plex = await font(
  "sans",
  "assets/story-motion/fonts/plex-sans-semibold.ttf",
  {
    weight: "600",
  },
);
const noto = await font(
  "thai",
  "assets/ecommerce-motion/fonts/noto-sans-thai.ttf",
  {
    weight: "600",
    variable: {
      wght: { min: 100, default: 400, max: 900 },
      wdth: { min: 62.5, default: 100, max: 100 },
    },
  },
);
function composition(
  text: string,
  fontAsset: "sans" | "thai",
  fallbacks: boolean,
): Composition {
  return {
    schemaVersion: "composition-1",
    id: "fallback",
    width: 480,
    height: 200,
    fps: 24,
    frameCount: 1,
    background: "#F4EFE2",
    assets: [fallbacks ? { ...plex, fallbacks: ["thai"] } : plex, noto],
    layers: [
      {
        id: "copy",
        type: "text",
        transform: { position: [40, 140] },
        text,
        fontSize: 96,
        color: "#1D2410",
        fontAsset,
        locale: "th",
        anchor: "baseline",
      },
    ],
  } as Composition;
}

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
  const render = async (comp: Composition) =>
    Buffer.from(
      await page.evaluate(
        async ({ compositionJson, urls }) => {
          const composition = JSON.parse(compositionJson) as Composition;
          const url = "/packages/renderer-core/src/index.ts";
          const m = (await import(url)) as typeof Render;
          const resources = await m.loadCompositionResources(
            composition,
            (id) => urls[id]!,
          );
          const preview = m.createCompositionPreview(
            document.createElement("canvas"),
            composition,
            resources,
            { backend: "canvas2d" },
          );
          try {
            const report = preview.renderFrame(0);
            if (report.diagnostics.some((d) => d.severity === "error"))
              throw new Error(JSON.stringify(report.diagnostics));
            const bytes = preview.readPixels();
            let binary = "";
            for (let at = 0; at < bytes.length; at += 0x8000)
              binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
            return btoa(binary);
          } finally {
            preview.dispose();
          }
        },
        {
          compositionJson: JSON.stringify(comp),
          urls: {
            sans: `/@fs${resolve(root, plex.path)}`,
            thai: `/@fs${resolve(root, noto.path)}`,
          } as Record<string, string>,
        },
      ),
      "base64",
    );
  const compare = (a: Buffer, b: Buffer) =>
    compareFrames(new Uint8Array(a), new Uint8Array(b), 480, 200);
  const digest = (bytes: Buffer) =>
    createHash("sha256").update(bytes).digest("hex").slice(0, 16);

  // Thai drawn through the declared fallback matches the same face drawn directly
  // and differs from the unpinned face the browser picks without one (O5).
  const thai = "ลุค";
  const fallback = await render(composition(thai, "sans", true));
  const direct = await render(composition(thai, "thai", false));
  const unpinned = await render(composition(thai, "sans", false));
  const declared = compare(direct, fallback);
  const system = compare(direct, unpinned);
  assert.equal(
    strictestTier(declared),
    "exact",
    `fallback differs from the declared face: ${JSON.stringify(declared)}`,
  );
  assert.ok(
    system.maxChannelDelta > 0,
    "the unpinned system face unexpectedly matched the declared fallback",
  );
  // Covered copy is untouched by a declared fallback.
  const latin = "OLIVE 3 ·";
  const latinFallback = await render(composition(latin, "sans", true));
  const latinPlain = await render(composition(latin, "sans", false));
  assert.equal(digest(latinFallback), digest(latinPlain));
  console.log(
    JSON.stringify({
      thai: {
        fallback: digest(fallback),
        direct: digest(direct),
        unpinned: digest(unpinned),
        fallbackVsDirect: { tier: strictestTier(declared), ...declared },
        unpinnedVsDirect: { tier: strictestTier(system), ...system },
      },
      latin: { fallback: digest(latinFallback), plain: digest(latinPlain) },
    }),
  );
  console.log("Composition font fallback: 3 checks pass");
} finally {
  await browser.close();
  await server.close();
}
