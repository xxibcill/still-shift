import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { beforeAll, afterAll, expect, it } from "vitest";

let server: ViteDevServer, browser: Browser, base: string;
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
async function setup(page: Page) {
  page.setDefaultTimeout(5000);
  await page.goto(
    base +
      "passage.html?plan=benchmarks/fixtures/illustrated-sequence/sound/access-story.json",
  );
  await page.waitForFunction(() => Boolean(window.passageLab?.snapshot()));
  await page
    .getByText("Import narration timing", { exact: true })
    .click({ timeout: 3000 });
  await page
    .getByLabel("Narration audio to import", { exact: true })
    .setInputFiles(
      resolve("assets/illustrated-sequence/narration-v001/narration.wav"),
    );
  await page
    .getByLabel("Word timing JSON or SRT", { exact: true })
    .setInputFiles({
      name: "timing.srt",
      mimeType: "application/x-subrip",
      buffer: Buffer.from(
        "1\n00:00:04,800 --> 00:00:05,600\nWatch the connection.\n",
      ),
    });
  await page
    .getByLabel("Timing import mode", { exact: true })
    .selectOption("add");
  await page
    .getByRole("button", { name: "Preview timing import", exact: true })
    .click();
  await page.waitForFunction(() => {
    const text = document.getElementById("timing-status")?.textContent;
    return Boolean(text && !text.startsWith("Reading"));
  });
  expect(
    await page.locator("#timing-apply").isEnabled(),
    await page.locator("#timing-status").innerText(),
  ).toBe(true);
}
it("previews before applying, loads the voice, preserves sound timing and supports undo/save", async () => {
  const page = await browser.newPage({ acceptDownloads: true });
  try {
    await setup(page);
    const cues = () =>
      page.evaluate(
        () =>
          (
            window.passageLab!.snapshot() as {
              plan: { beats: { cues: unknown[] }[] };
            }
          ).plan.beats[0]!.cues.length,
      );
    expect(await cues()).toBe(2);
    expect(await page.locator("#timing-preview").innerText()).toContain("115");
    await page
      .getByRole("button", { name: "Apply timing import", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        (window.passageLab!.snapshot() as { narrationReady: boolean })
          .narrationReady,
    );
    expect(await cues()).toBe(3);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page.waitForFunction(
      () =>
        (
          window.passageLab!.snapshot() as {
            plan: { beats: { cues: unknown[] }[] };
          }
        ).plan.beats[0]!.cues.length === 2,
    );
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await page.waitForFunction(
      () =>
        (
          window.passageLab!.snapshot() as {
            plan: { beats: { cues: unknown[] }[] };
          }
        ).plan.beats[0]!.cues.length === 3,
    );
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save plan", exact: true }).click();
    const saved = JSON.parse(
      await readFile((await (await download).path())!, "utf8"),
    );
    expect(saved.narration.timing.granularity).toBe("subtitle");
    expect(saved.audio.sounds[0].anchor.id).toBe("route-reveals");
  } finally {
    await page.close();
  }
}, 30_000);
it("rejects stale previews after edits instead of overwriting newer work", async () => {
  const page = await browser.newPage();
  try {
    await setup(page);
    await page.getByLabel("connection frame", { exact: true }).fill("116");
    await page.getByLabel("connection frame", { exact: true }).press("Tab");
    await page.waitForFunction(
      () =>
        (
          window.passageLab!.snapshot() as {
            audio: { sounds: { start: number }[] };
          }
        ).audio.sounds[0]!.start === 116,
    );
    await page
      .getByRole("button", { name: "Apply timing import", exact: true })
      .click();
    await page.waitForFunction(() =>
      document
        .getElementById("timing-status")
        ?.textContent?.includes("changed"),
    );
    expect(
      (
        (await page.evaluate(() => window.passageLab!.snapshot())) as {
          plan: { beats: { cues: unknown[] }[] };
        }
      ).plan.beats[0]!.cues.length,
    ).toBe(2);
  } finally {
    await page.close();
  }
}, 30_000);
