import { readFile } from "node:fs/promises";
import {
  defaultBrowserProjectRoot,
  runtimeBrowserUrl,
  type BrowserRuntimeOptions,
} from "@still-shift/execution-runtime/browser";
import { chromium } from "playwright";
import { createServer } from "vite";
import type { CompiledStoryPassage } from "../../renderer-core/src/story-passage.ts";
import {
  PassageError,
  type PassageDiagnostic,
} from "../../renderer-core/src/passage-diagnostics.ts";

/** Measure authored text with the same pinned fonts and Chromium canvas used by preview/export. */
export async function validatePassageText(
  passage: CompiledStoryPassage,
  runtime: BrowserRuntimeOptions = {},
  options: { collectAll?: boolean; validateSafeZones?: boolean } = {},
) {
  const projectRoot = runtime.projectRoot ?? defaultBrowserProjectRoot;
  const beats = passage.beats.filter((beat) =>
    beat.scene.nodes.some(
      (node) => node.type === "text" && (node.textLayout || node.textBox),
    ),
  );
  if (!beats.length) return [] as PassageDiagnostic[];

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
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const collected: PassageDiagnostic[] = [];
  try {
    await server.listen();
    const baseUrl = server.resolvedUrls?.local[0];
    if (!baseUrl) throw new Error("Text validation server has no local URL");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(runtimeBrowserUrl(baseUrl, "passage-text"));
    await page.waitForFunction(() =>
      Boolean(window.validateStillShiftPassageText),
    );
    const urls = new Map<string, string>();
    for (const beat of beats) {
      const fontUrls: Record<string, string> = {};
      for (const font of beat.scene.fonts ?? []) {
        let url = urls.get(font.path);
        if (!url) {
          url = `data:application/octet-stream;base64,${(await readFile(font.path)).toString("base64")}`;
          urls.set(font.path, url);
        }
        fontUrls[font.id] = url;
      }
      const diagnostics = await page.evaluate(
        ({ scene, fontUrls, options }) =>
          window.validateStillShiftPassageText!(scene, fontUrls, options),
        { scene: beat.scene, fontUrls, options },
      );
      if (diagnostics.length) {
        const tagged = diagnostics.map((diagnostic) => ({
          beat: beat.id,
          ...diagnostic,
        }));
        if (!options.collectAll) throw new PassageError(tagged);
        collected.push(...tagged);
      }
    }
    return collected;
  } finally {
    try {
      await browser?.close();
    } finally {
      await server.close();
    }
  }
}
