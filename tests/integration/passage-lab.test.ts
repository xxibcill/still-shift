import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, test } from "vitest";
import { createServer, type ViteDevServer } from "vite";

describe("passage Lab file actions", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let base: string;

  beforeAll(async () => {
    server = await createServer({
      configFile: resolve("apps/lab/vite.config.ts"),
      server: { port: 0, strictPort: false },
    });
    await server.listen();
    base = server.resolvedUrls!.local[0]!;
    browser = await chromium.launch({ headless: true });
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  test.each([
    ["save-plan", false],
    ["save-workspace", true],
  ])(
    "%s waits for a pending valid edit",
    async (button, workspace) => {
      const page = await browser.newPage({ acceptDownloads: true });
      let releaseAsset: (() => void) | undefined;
      try {
        await page.goto(base + "passage.html");
        await page.waitForFunction(() =>
          document
            .querySelector("#status")
            ?.textContent?.includes("576 frames"),
        );
        const heldAsset = new Promise<void>((resolve) => {
          releaseAsset = resolve;
        });
        let assetRequested!: () => void;
        const requestStarted = new Promise<void>((resolve) => {
          assetRequested = resolve;
        });
        let held = false;
        await page.route("**/passage-api/asset?*", async (route) => {
          if (!held) {
            held = true;
            assetRequested();
            await heldAsset;
          }
          await route.continue();
        });
        const title = workspace
          ? "Workspace saved after edit"
          : "Plan saved after edit";
        const input = page.getByRole("textbox", { name: "title", exact: true });
        await input.fill(title);
        await input.press("Tab");
        await requestStarted;
        assert.equal(
          await page.evaluate(
            () =>
              (
                window.passageLab!.snapshot() as {
                  plan: { beats: { parameters: { title: string } }[] };
                }
              ).plan.beats[0]!.parameters.title,
          ),
          "A reusable comparison",
        );
        const downloadStarted = page.waitForEvent("download");
        await page.locator("#" + button).click();
        releaseAsset?.();
        const download = await downloadStarted;
        const saved = JSON.parse(
          await readFile(await download.path()!, "utf8"),
        );
        const plan = workspace ? saved.plan : saved;
        assert.equal(plan.beats[0].parameters.title, title);
      } finally {
        releaseAsset?.();
        await page.close();
      }
    },
    30_000,
  );
});
