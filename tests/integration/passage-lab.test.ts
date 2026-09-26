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

  test("relative-plan import uses its explicit base directory", async () => {
    const page = await browser.newPage();
    try {
      await page.goto(base + "passage.html");
      await page.waitForFunction(() =>
        document.querySelector("#status")?.textContent?.includes("576 frames"),
      );
      const file = resolve("benchmarks/fixtures/story-passages/resources.json");
      await page.locator("#open-workspace").setInputFiles(file);
      await page.waitForFunction(() =>
        document
          .querySelector("#errors")
          ?.textContent?.includes("Import base directory"),
      );
      assert.equal(
        await page.evaluate(
          () =>
            (window.passageLab!.snapshot() as { plan: { id: string } }).plan.id,
        ),
        "linked-comparison",
      );
      await page
        .locator("#import-base-directory")
        .fill("benchmarks/fixtures/story-passages");
      await page.locator("#open-workspace").setInputFiles(file);
      await page.waitForFunction(
        () =>
          (window.passageLab!.snapshot() as { plan: { id: string } }).plan
            .id === "s01e01-resources",
      );
      assert.equal(await page.locator("#errors").textContent(), "");
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
        false,
      );
    } finally {
      await page.close();
    }
  }, 30_000);

  test("relative asset parameters also require an import base directory", async () => {
    const page = await browser.newPage();
    try {
      await page.goto(base + "passage.html");
      await page.waitForFunction(() =>
        document.querySelector("#status")?.textContent?.includes("576 frames"),
      );
      const plan = JSON.parse(
        await readFile(
          resolve("benchmarks/fixtures/story-authoring/linked-comparison.json"),
          "utf8",
        ),
      );
      for (const beat of plan.beats)
        beat.template = resolve(
          "benchmarks/fixtures/story-authoring/comparison-template.json",
        );
      plan.beats[0].parameters.artwork = { path: "relative-art.svg" };
      await page.locator("#open-workspace").setInputFiles({
        name: "asset-parameter.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(plan)),
      });
      await page.waitForFunction(() =>
        document
          .querySelector("#errors")
          ?.textContent?.includes("Import base directory"),
      );
    } finally {
      await page.close();
    }
  }, 30_000);

  test("saved plans with absolute references import without a base directory", async () => {
    const page = await browser.newPage({ acceptDownloads: true });
    try {
      await page.goto(base + "passage.html");
      await page.waitForFunction(() =>
        document.querySelector("#status")?.textContent?.includes("576 frames"),
      );
      const downloadStarted = page.waitForEvent("download");
      await page.locator("#save-plan").click();
      const download = await downloadStarted;
      await page.evaluate(() => window.passageLab!.seek(42));
      await page
        .locator("#open-workspace")
        .setInputFiles(await download.path()!);
      await page.waitForFunction(
        () => (window.passageLab!.snapshot() as { frame: number }).frame === 0,
      );
      assert.equal(await page.locator("#errors").textContent(), "");
    } finally {
      await page.close();
    }
  }, 30_000);

  test("an older path response cannot replace a newer load", async () => {
    const page = await browser.newPage();
    let releaseOlder: (() => void) | undefined;
    try {
      await page.goto(base + "passage.html");
      await page.waitForFunction(() =>
        document.querySelector("#status")?.textContent?.includes("576 frames"),
      );
      const heldResponse = new Promise<void>((resolve) => {
        releaseOlder = resolve;
      });
      let olderRequested!: () => void;
      const olderStarted = new Promise<void>((resolve) => {
        olderRequested = resolve;
      });
      let held = false;
      await page.route("**/passage-api/load?*", async (route) => {
        const path = new URL(route.request().url()).searchParams.get("path");
        if (
          !held &&
          path === "benchmarks/fixtures/story-authoring/linked-comparison.json"
        ) {
          held = true;
          olderRequested();
          await heldResponse;
        }
        await route.continue();
      });
      const pathInput = page.locator("#plan-path");
      await pathInput.fill(
        "benchmarks/fixtures/story-authoring/linked-comparison.json",
      );
      await page.locator("#load-form button").click();
      await olderStarted;
      await pathInput.fill(
        "benchmarks/fixtures/story-authoring/linked-network.json",
      );
      await page.locator("#load-form button").click();
      await page.waitForFunction(
        () =>
          (window.passageLab!.snapshot() as { plan: { id: string } }).plan
            .id === "linked-network",
      );
      const staleResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).searchParams.get("path") ===
          "benchmarks/fixtures/story-authoring/linked-comparison.json",
      );
      releaseOlder?.();
      await staleResponse;
      await page.waitForLoadState("networkidle");
      assert.equal(
        await page.evaluate(
          () =>
            (window.passageLab!.snapshot() as { plan: { id: string } }).plan.id,
        ),
        "linked-network",
      );
    } finally {
      releaseOlder?.();
      await page.close();
    }
  }, 30_000);
});
