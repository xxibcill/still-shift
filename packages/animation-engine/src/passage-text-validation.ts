import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import type { CompiledStoryPassage } from "../../renderer-core/src/story-passage.ts";
import { PassageError } from "../../renderer-core/src/passage-diagnostics.ts";

const projectRoot = resolve(import.meta.dirname, "../../..");

/** Measure authored text with the same pinned fonts and Chromium canvas used by preview/export. */
export async function validatePassageText(passage: CompiledStoryPassage) {
  const beats = passage.beats.filter((beat) =>
    beat.scene.nodes.some((node) => node.type === "text" && node.textLayout),
  );
  if (!beats.length) return;

  const server = await createServer({
    root: projectRoot,
    configFile: false,
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0, fs: { allow: [projectRoot] } },
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await server.listen();
    const baseUrl = server.resolvedUrls?.local[0];
    if (!baseUrl) throw new Error("Text validation server has no local URL");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(
      new URL("tools/export-worker/passage-text.html", baseUrl).href,
    );
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
        ({ scene, fontUrls }) =>
          window.validateStillShiftPassageText!(scene, fontUrls),
        { scene: beat.scene, fontUrls },
      );
      if (diagnostics.length)
        throw new PassageError(
          diagnostics.map((diagnostic) => ({ beat: beat.id, ...diagnostic })),
        );
    }
  } finally {
    try {
      await browser?.close();
    } finally {
      await server.close();
    }
  }
}
