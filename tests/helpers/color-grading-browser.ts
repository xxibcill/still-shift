/**
 * Shared setup for the color grading browser groups (CG4, CG5): the CG0
 * stills as plain arrays the page can receive, and a page served from the
 * repository root by Vite, so in-page code imports the packages' sources.
 */
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import { decodeCompositionRgbaPng } from "../../packages/animation-engine/src/composition-media-color.ts";

export const repositoryRoot = resolve(import.meta.dirname, "../..");

export type ColorStill = {
  id: string;
  width: number;
  height: number;
  rgba: number[];
};

/** CG0 stills by id (`benchmarks/fixtures/color/cg0/stills/<id>.png`). */
export function loadCg0Stills(ids: readonly string[]): Promise<ColorStill[]> {
  return Promise.all(
    ids.map(async (id) => {
      const { width, height, rgba } = decodeCompositionRgbaPng(
        await readFile(
          join(
            repositoryRoot,
            `benchmarks/fixtures/color/cg0/stills/${id}.png`,
          ),
        ),
      );
      return { id, width, height, rgba: [...rgba] };
    }),
  );
}

/** A render browser page on a local Vite server; `close` stops both. */
export async function openColorGradingPage() {
  const server = await createServer({
    root: repositoryRoot,
    configFile: false,
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  let browser: Awaited<ReturnType<typeof launchRenderBrowser>> | undefined;
  try {
    browser = await launchRenderBrowser();
    const page = await browser.newPage();
    await page.addInitScript("window.__name = (fn) => fn;");
    await page.goto(server.resolvedUrls!.local[0]!);
    const opened = browser;
    return {
      page,
      async close() {
        try {
          await opened.close();
        } finally {
          await server.close();
        }
      },
    };
  } catch (error) {
    await browser?.close();
    await server.close();
    throw error;
  }
}
