import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import type { Browser } from "playwright";
import {
  commerceToComposition,
  storyToComposition,
  requiresCompositionTextLayout,
  PassageError,
} from "@still-shift/renderer-core";
import type {
  CommerceScene,
  StoryScene,
  Composition,
} from "@still-shift/scene-contract";
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
): Promise<Composition> {
  return compileFamilyComposition(scene, assetDirectory, runtime);
}
export async function compileStoryComposition(
  scene: StoryScene,
  assetDirectory: string,
  runtime: BrowserRuntimeOptions = {},
): Promise<Composition> {
  return compileFamilyComposition(scene, assetDirectory, runtime);
}
async function compileFamilyComposition(
  scene: CommerceScene | StoryScene,
  assetDirectory: string,
  runtime: BrowserRuntimeOptions,
) {
  if (!requiresCompositionTextLayout(scene) && !scene.typography)
    return scene.schemaVersion === "commerce-scene-1"
      ? commerceToComposition(scene)
      : storyToComposition(scene);
  const fontUrls = Object.fromEntries(
    await Promise.all(
      (scene.fonts ?? []).map(async (font) => [
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
    await page.waitForFunction(() =>
      Boolean(window.compileStillShiftComposition),
    );
    const result = await page.evaluate(
      ({ scene, fontUrls }) =>
        window.compileStillShiftComposition!(scene, fontUrls),
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
