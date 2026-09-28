import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { beforeAll, afterAll, expect, it } from "vitest";

let server: ViteDevServer, browser: Browser, base: string;
const path = resolve("assets/illustrated-sequence/sounds-v001/wood-tap.wav");
let asset: object;
beforeAll(async () => {
  asset = {
    id: "generated-tap",
    path,
    sha256:
      "sha256:" +
      createHash("sha256")
        .update(await readFile(path))
        .digest("hex"),
    generation: {
      provider: "elevenlabs",
      prompt: "One wooden tap",
      durationSeconds: 1,
      promptInfluence: 0.3,
      loop: false,
      model: "eleven_text_to_sound_v2",
      generatedAt: "2026-09-28T00:00:00.000Z",
    },
  };
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
async function open(page: Page, configured = true) {
  await page.route("**/passage-api/sfx/config", (route) =>
    route.fulfill({ json: { configured } }),
  );
  await page.goto(base + "passage.html");
  await page.waitForFunction(() => Boolean(window.passageLab?.snapshot()));
  await page
    .getByText("Generate sound with ElevenLabs", { exact: true })
    .click({ timeout: 3000 });
  await page
    .getByLabel("Generated sound ID", { exact: true })
    .fill("generated-tap");
  await page
    .getByLabel("Sound description", { exact: true })
    .fill("One wooden tap");
}
it("registers a generated sound, previews it and preserves provenance when saving", async () => {
  const page = await browser.newPage({ acceptDownloads: true });
  try {
    let calls = 0;
    await page.route("**/passage-api/sfx", async (route) => {
      calls++;
      expect(route.request().postDataJSON()).toMatchObject({
        provider: "elevenlabs",
        id: "generated-tap",
        prompt: "One wooden tap",
        durationSeconds: 1,
      });
      await route.fulfill({
        json: {
          asset,
          duration: 2,
          channels: 1,
          manifestPath: "generation.json",
        },
      });
    });
    await open(page);
    await page
      .getByRole("button", { name: "Generate with ElevenLabs", exact: true })
      .click();
    await page.waitForFunction(() =>
      document
        .getElementById("sfx-status")
        ?.textContent?.includes("Registered"),
    );
    expect(calls).toBe(1);
    expect(await page.locator("#sfx-preview").getAttribute("src")).toContain(
      "/passage-api/asset?path=",
    );
    await page
      .getByRole("button", { name: "Add sound to this beat", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        (window.passageLab!.snapshot() as { audio?: { sounds: unknown[] } })
          .audio?.sounds.length === 1,
    );
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save plan", exact: true }).click();
    const plan = JSON.parse(
      await readFile((await (await download).path())!, "utf8"),
    );
    expect(plan.audio.assets[0]).toEqual(asset);
    expect(plan.audio.sounds[0].asset).toBe("generated-tap");
  } finally {
    await page.close();
  }
}, 30_000);
it("keeps an in-flight take through beat changes and never attaches it to a newly loaded plan", async () => {
  const page = await browser.newPage();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    let calls = 0;
    await page.route("**/passage-api/sfx", async (route) => {
      calls++;
      await pending;
      await route.fulfill({ json: { asset } });
    });
    await open(page);
    const requested = page.waitForRequest("**/passage-api/sfx");
    await page
      .getByRole("button", { name: "Generate with ElevenLabs", exact: true })
      .click();
    await requested;
    await page.locator("#beat").selectOption("1");
    expect(
      await page.getByLabel("Sound description", { exact: true }).inputValue(),
    ).toBe("One wooden tap");
    expect(
      await page
        .getByRole("button", { name: "Generate with ElevenLabs", exact: true })
        .isDisabled(),
    ).toBe(true);
    await page
      .getByLabel("Passage plan", { exact: true })
      .fill(
        "benchmarks/fixtures/illustrated-sequence/narrated/access-story.json",
      );
    await page
      .getByRole("button", { name: "Load passage", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        (window.passageLab!.snapshot() as { plan: { id: string } }).plan.id ===
        "illustrated-access-narrated",
    );
    release();
    await page.waitForFunction(() =>
      document
        .getElementById("sfx-status")
        ?.textContent?.includes("Add to current passage"),
    );
    expect(
      (
        (await page.evaluate(() => window.passageLab!.snapshot())) as {
          audio?: unknown;
        }
      ).audio,
    ).toBeUndefined();
    await page
      .getByRole("button", { name: "Add to current passage", exact: true })
      .click();
    await page.waitForFunction(() =>
      document
        .getElementById("sfx-status")
        ?.textContent?.includes("Registered"),
    );
    expect(calls).toBe(1);
  } finally {
    release();
    await page.close();
  }
}, 30_000);
it("shows provider errors, preserves the prompt and re-enables explicit generation without retrying", async () => {
  const page = await browser.newPage();
  try {
    let calls = 0;
    await page.route("**/passage-api/sfx", (route) => {
      calls++;
      return route.fulfill({
        status: 429,
        json: {
          message: "ElevenLabs quota reached. No automatic retry was made.",
        },
      });
    });
    await open(page);
    await page
      .getByRole("button", { name: "Generate with ElevenLabs", exact: true })
      .click();
    await page.waitForFunction(() =>
      document
        .getElementById("sfx-status")
        ?.textContent?.includes("quota reached"),
    );
    expect(
      await page
        .getByRole("button", { name: "Generate with ElevenLabs", exact: true })
        .isEnabled(),
    ).toBe(true);
    expect(
      await page.getByLabel("Sound description", { exact: true }).inputValue(),
    ).toBe("One wooden tap");
    expect(calls).toBe(1);
    expect(
      (
        (await page.evaluate(() => window.passageLab!.snapshot())) as {
          audio?: unknown;
        }
      ).audio,
    ).toBeUndefined();
  } finally {
    await page.close();
  }
}, 30_000);
it("explains missing credentials and never enables paid generation", async () => {
  const page = await browser.newPage();
  try {
    await open(page, false);
    expect(await page.locator("#sfx-config").innerText()).toContain(
      "ELEVENLABS_API_KEY",
    );
    expect(
      await page
        .getByRole("button", { name: "Generate with ElevenLabs", exact: true })
        .isDisabled(),
    ).toBe(true);
  } finally {
    await page.close();
  }
}, 30_000);
