import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import type { Browser } from "playwright";
import {
  commerceToComposition,
  PassageError,
} from "@still-shift/renderer-core";
import type { CommerceScene } from "@still-shift/scene-contract";
import { launchRenderBrowser } from "@still-shift/execution-runtime/render-browser";
import {
  defaultBrowserProjectRoot,
  runtimeBrowserUrl,
  type BrowserRuntimeOptions,
} from "@still-shift/execution-runtime/browser";

/** Compile font-dependent geometry using the same pinned browser and fonts as export. */
export async function compileCommerceComposition(
  scene: CommerceScene,
  assetDirectory: string,
  runtime: BrowserRuntimeOptions = {},
) {
  if (!scene.textFits?.some((fit) => fit.panel))
    return commerceToComposition(scene);
  const fontUrls = Object.fromEntries(
    await Promise.all(
      scene.fonts.map(async (font) => [
        font.id,
        `data:application/octet-stream;base64,${(await readFile(resolve(assetDirectory, font.path))).toString("base64")}`,
      ]),
    ),
  );
  const projectRoot = runtime.projectRoot ?? defaultBrowserProjectRoot;
  const server = await createServer({
    root: projectRoot,
    configFile: false,
    logLevel: "silent",
    server: {
      host: "127.0.0.1",
      port: 0,
      fs: { allow: [projectRoot, defaultBrowserProjectRoot] },
    },
  });
  let browser: Browser | undefined;
  try {
    await server.listen();
    const baseUrl = server.resolvedUrls?.local[0];
    if (!baseUrl) throw new Error("Composition preparation server has no URL");
    browser = await launchRenderBrowser();
    const page = await browser.newPage();
    await page.goto(runtimeBrowserUrl(baseUrl, "composition-compile"));
    await page.waitForFunction(() => Boolean(window.compileStillShiftCommerce));
    const result = await page.evaluate(
      ({ scene, fontUrls }) =>
        window.compileStillShiftCommerce!(scene, fontUrls),
      { scene, fontUrls },
    );
    if (result.diagnostics) throw new PassageError(result.diagnostics);
    return result.composition;
  } finally {
    try {
      await browser?.close();
    } finally {
      await server.close();
    }
  }
}
