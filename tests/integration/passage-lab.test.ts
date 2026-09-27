import assert from "node:assert/strict";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, test } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { readStoryPassage } from "../../packages/animation-engine/src/story-passage-io.ts";
import { writeStoryWorkspace } from "../../packages/animation-engine/src/story-workspace.ts";

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

  test("relocated packages load the same frames and reject corruption without replacing the preview", async () => {
    const directory = await mkdtemp(
      resolve("benchmarks/results/workspace-lab-"),
    );
    const page = await browser.newPage();
    try {
      const passage = await readStoryPassage(
        resolve("benchmarks/fixtures/story-authoring/linked-comparison.json"),
      );
      const manifest = await writeStoryWorkspace(
        join(directory, "original"),
        passage,
      );
      const moved = join(directory, "moved");
      await rename(join(directory, "original"), moved);
      await page.goto(base + "passage.html");
      await page.waitForFunction(() =>
        document.querySelector("#status")?.textContent?.includes("576 frames"),
      );
      const capture = (frame: number) =>
        page.evaluate((frame) => {
          window.passageLab!.seek(frame);
          return document
            .querySelector<HTMLCanvasElement>("#preview")!
            .toDataURL();
        }, frame);
      const expected = await capture(192);
      await page.locator("#plan-path").fill(join(moved, "workspace.json"));
      await page.locator("#load-form button").click();
      await page.waitForFunction(
        () => (window.passageLab!.snapshot() as { frame: number }).frame === 0,
      );
      assert.equal(await capture(192), expected);
      const snapshot = await page.evaluate(() => window.passageLab!.snapshot());
      const file = manifest.files.find((file) => file.kind === "asset")!;
      await writeFile(join(moved, file.path), "corrupted");
      await page.locator("#load-form button").click();
      await page.waitForFunction(() =>
        document
          .querySelector("#errors")
          ?.textContent?.includes("checksum or size differs"),
      );
      assert.deepEqual(
        await page.evaluate(() => window.passageLab!.snapshot()),
        snapshot,
      );
    } finally {
      await page.close();
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);

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

  test("shared state cuts expose point controls and preserve cue edits through undo, redo and unlink", async () => {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    try {
      await page.goto(base + "passage.html");
      await page.waitForFunction(() =>
        document.querySelector("#status")?.textContent?.includes("576 frames"),
      );
      await page
        .locator("#plan-path")
        .fill(
          resolve(
            "benchmarks/fixtures/reusable-components/story-behaviors.passage.json",
          ),
        );
      await page.locator("#load-form button").click();
      await page.waitForFunction(() =>
        document.querySelector("#status")?.textContent?.includes("768 frames"),
      );
      await page.locator("#beat").selectOption("3");
      assert.equal(
        await page
          .getByLabel("behavior__caption-change duration", { exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page.getByLabel("change frame", { exact: true }).count(),
        2,
      );
      // The cue and optional timing slot deliberately share their human label; choose the cue group.
      const input = page
        .locator("#cues")
        .getByLabel("change frame", { exact: true });
      await input.fill("96");
      await input.press("Tab");
      await page.waitForFunction(() =>
        document
          .querySelector("#bindings")
          ?.textContent?.includes("behavior__caption-change · frame 96"),
      );
      await page.locator("#undo").click();
      await page.waitForFunction(() =>
        document
          .querySelector("#bindings")
          ?.textContent?.includes("behavior__caption-change · frame 80"),
      );
      await page.locator("#redo").click();
      await page.waitForFunction(() =>
        document
          .querySelector("#bindings")
          ?.textContent?.includes("behavior__caption-change · frame 96"),
      );
      await page.getByText("Linked events", { exact: true }).click();
      await page
        .getByRole("button", {
          name: "Unlink behavior__caption-change",
          exact: true,
        })
        .click();
      await page.waitForFunction(() =>
        document
          .querySelector("#bindings")
          ?.textContent?.includes("Link behavior__caption-change to cue"),
      );
      const snapshot = (await page.evaluate(() =>
        window.passageLab!.snapshot(),
      )) as {
        plan: {
          beats: { timing: Record<string, { start: number; end: number }> }[];
        };
      };
      assert.deepEqual(
        snapshot.plan.beats[3]!.timing["behavior__caption-change"],
        { start: 96, end: 96 },
      );
    } catch (error) {
      throw new Error(
        "Shared state controls: " +
          (await page.locator("#status").textContent()) +
          " / " +
          (await page.locator("#errors").textContent()),
        { cause: error },
      );
    } finally {
      await page.close();
    }
  }, 30000);

  test("shared lifetimes expose exclusive ends and retime a whole linked phase", async () => {
    const page = await browser.newPage();
    try {
      await page.goto(base + "passage.html");
      await page.waitForFunction(() =>
        document.querySelector("#status")?.textContent?.includes("576 frames"),
      );
      await page
        .locator("#plan-path")
        .fill(
          resolve(
            "benchmarks/fixtures/reusable-components/story-timing.passage.json",
          ),
        );
      await page.locator("#load-form button").click();
      await page.waitForFunction(
        () =>
          (window.passageLab!.snapshot() as { plan: { id: string } }).plan
            .id === "shared-timing",
      );
      await page.locator("#beat").selectOption("2");
      await page
        .locator("#cues")
        .getByLabel("phase2 frame", { exact: true })
        .fill("78");
      await page
        .locator("#cues")
        .getByLabel("phase2 frame", { exact: true })
        .press("Tab");
      await page.waitForFunction(() =>
        document
          .querySelector("#bindings")
          ?.textContent?.includes(
            "phase2__lifetime-detail · 78–126 (end exclusive)",
          ),
      );
      await page.locator("#undo").click();
      await page.waitForFunction(() =>
        document
          .querySelector("#bindings")
          ?.textContent?.includes(
            "phase2__lifetime-detail · 72–120 (end exclusive)",
          ),
      );
      await page.locator("#redo").click();
      await page.waitForFunction(() =>
        document
          .querySelector("#bindings")
          ?.textContent?.includes(
            "phase2__lifetime-detail · 78–126 (end exclusive)",
          ),
      );
      await page.getByText("Linked events", { exact: true }).click();
      await page
        .getByRole("button", {
          name: "Unlink phase2__lifetime-detail",
          exact: true,
        })
        .click();
      await page.waitForFunction(() =>
        document
          .querySelector("#bindings")
          ?.textContent?.includes("Link phase2__lifetime-detail to cue"),
      );
      const snapshot = (await page.evaluate(() =>
        window.passageLab!.snapshot(),
      )) as {
        plan: {
          beats: { timing: Record<string, { start: number; end: number }> }[];
        };
      };
      assert.deepEqual(
        snapshot.plan.beats[2]!.timing["phase2__lifetime-detail"],
        { start: 78, end: 126 },
      );
    } finally {
      await page.close();
    }
  }, 30000);

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

  test("handoff identity and carried properties edit, undo, redo, and save", async () => {
    const page = await browser.newPage({ acceptDownloads: true });
    try {
      await page.goto(base + "passage.html");
      await page.waitForFunction(() =>
        document.querySelector("#status")?.textContent?.includes("576 frames"),
      );
      await page.locator("#beat").selectOption("1");
      await page.getByText("Beat handoff", { exact: true }).click();
      const identity = page.getByRole("textbox", {
        name: "household identity",
      });
      await identity.fill("family");
      await identity.press("Tab");
      await page.waitForFunction(
        () =>
          (
            window.passageLab!.snapshot() as {
              plan: { beats: { handoff: { subjects: { id: string }[] } }[] };
            }
          ).plan.beats[1]!.handoff.subjects[0]!.id === "family",
      );
      await page
        .getByRole("checkbox", { name: "family carry rotation" })
        .uncheck();
      await page.waitForFunction(
        () =>
          !(
            window.passageLab!.snapshot() as {
              plan: {
                beats: { handoff: { subjects: { properties: string[] }[] } }[];
              };
            }
          ).plan.beats[1]!.handoff.subjects[0]!.properties.includes("rotation"),
      );
      await page.locator("#undo").click();
      await page.waitForFunction(() =>
        (
          window.passageLab!.snapshot() as {
            plan: {
              beats: { handoff: { subjects: { properties: string[] }[] } }[];
            };
          }
        ).plan.beats[1]!.handoff.subjects[0]!.properties.includes("rotation"),
      );
      await page.waitForFunction(
        () =>
          (
            document.querySelector(
              'input[aria-label="family carry rotation"]',
            ) as HTMLInputElement | null
          )?.checked === true,
      );
      assert.equal(
        await page
          .getByRole("checkbox", { name: "family carry rotation" })
          .isChecked(),
        true,
      );
      await page.locator("#redo").click();
      await page.waitForFunction(
        () =>
          !(
            window.passageLab!.snapshot() as {
              plan: {
                beats: { handoff: { subjects: { properties: string[] }[] } }[];
              };
            }
          ).plan.beats[1]!.handoff.subjects[0]!.properties.includes("rotation"),
      );
      for (const property of ["y", "scaleX", "scaleY", "opacity"])
        await page
          .getByRole("checkbox", { name: "family carry " + property })
          .uncheck();
      await page.waitForFunction(
        () =>
          (
            window.passageLab!.snapshot() as {
              plan: {
                beats: { handoff: { subjects: { properties: string[] }[] } }[];
              };
            }
          ).plan.beats[1]!.handoff.subjects[0]!.properties.length === 1,
      );
      assert.equal(
        await page
          .getByRole("checkbox", { name: "family carry x" })
          .isDisabled(),
        true,
      );
      const downloadStarted = page.waitForEvent("download");
      await page.locator("#save-plan").click();
      const download = await downloadStarted;
      const saved = JSON.parse(await readFile(await download.path()!, "utf8"));
      assert.deepEqual(saved.beats[1].handoff.subjects[0], {
        id: "family",
        from: "house-a",
        to: "house-a",
        mode: "carry",
        properties: ["x"],
      });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
        false,
      );
      const invalidIdentity = page.getByRole("textbox", {
        name: "family identity",
      });
      await invalidIdentity.fill("");
      await invalidIdentity.press("Tab");
      await page.waitForFunction(() =>
        Boolean(document.querySelector("#errors")?.textContent),
      );
      assert.equal(
        await page.evaluate(
          () =>
            (
              window.passageLab!.snapshot() as {
                plan: { beats: { handoff: { subjects: { id: string }[] } }[] };
              }
            ).plan.beats[1]!.handoff.subjects[0]!.id,
        ),
        "family",
      );
    } finally {
      await page.close();
    }
  }, 90_000);

  test("new handoff identities remain unique after a deletion", async () => {
    const page = await browser.newPage();
    try {
      await page.goto(base + "passage.html");
      await page.waitForFunction(() =>
        document.querySelector("#status")?.textContent?.includes("576 frames"),
      );
      await page.getByText("Beat handoff", { exact: true }).click();
      const add = page.getByRole("button", { name: "Add subject mapping" });
      await add.click();
      await page.getByRole("textbox", { name: "subject-1 identity" }).waitFor();
      await add.click();
      await page.getByRole("textbox", { name: "subject-2 identity" }).waitFor();
      await page.getByRole("button", { name: "Remove subject-1" }).click();
      await page.getByRole("textbox", { name: "subject-1 identity" }).waitFor({
        state: "detached",
      });
      await add.click();
      await page.waitForFunction(
        () =>
          (
            window.passageLab!.snapshot() as {
              plan: { beats: { handoff: { subjects: { id: string }[] } }[] };
            }
          ).plan.beats[0]!.handoff.subjects.length === 2,
      );
      const ids = await page.evaluate(() =>
        (
          window.passageLab!.snapshot() as {
            plan: { beats: { handoff: { subjects: { id: string }[] } }[] };
          }
        ).plan.beats[0]!.handoff.subjects.map((subject) => subject.id),
      );
      assert.deepEqual(ids, ["subject-2", "subject-1"]);
      assert.equal(await page.locator("#errors").textContent(), "");
    } finally {
      await page.close();
    }
  }, 60_000);
});
