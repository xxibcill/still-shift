import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { beforeAll, afterAll, expect, it } from "vitest";
import type { PassagePlan } from "../../packages/scene-contract/src/story-authoring.ts";
import type { StoryScene } from "../../packages/scene-contract/src/story.ts";

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
type Snapshot = {
  plan: Extract<PassagePlan, { schemaVersion: "story-passage-2" }>;
  beats: { scene: StoryScene; events: { id: string; start: number }[] }[];
  audio?: { sounds: { start: number }[] };
};

it("authors reusable actions and prop releases, retimes sound, and preserves atomic undo/save", async () => {
  const page = await browser.newPage({ acceptDownloads: true });
  page.setDefaultTimeout(8000);
  try {
    await page.goto(
      base +
        "passage.html?plan=benchmarks/fixtures/parcel-story/actions/parcel-story.json",
    );
    await page.waitForFunction(() => Boolean(window.passageLab?.snapshot()));
    const snapshot = () =>
      page.evaluate(() => window.passageLab!.snapshot() as Snapshot);
    await page.locator("#beat").selectOption("1");
    await page.getByText("Character actions", { exact: true }).click();
    await page
      .getByLabel("gentle-knock action offset", { exact: true })
      .fill("3");
    await page
      .getByLabel("gentle-knock action offset", { exact: true })
      .press("Tab");
    await page.waitForFunction(
      () =>
        (window.passageLab!.snapshot() as Snapshot).audio!.sounds[0]!.start ===
        246,
    );
    expect(
      (await snapshot()).beats[1]!.events.find(
        (e) => e.id === "gentle-knock-pose-1",
      )!.start,
    ).toBe(42);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page.waitForFunction(
      () =>
        (window.passageLab!.snapshot() as Snapshot).audio!.sounds[0]!.start ===
        243,
    );
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await page.waitForFunction(
      () =>
        (window.passageLab!.snapshot() as Snapshot).audio!.sounds[0]!.start ===
        246,
    );

    await page
      .getByLabel("New action character", { exact: true })
      .selectOption("neighbor");
    await page
      .getByLabel("New action cue", { exact: true })
      .selectOption("carry");
    await page
      .getByLabel("New action pose", { exact: true })
      .selectOption("idle");
    await page.getByLabel("New action duration", { exact: true }).fill("0");
    const before = (await snapshot()).plan;
    await page
      .getByRole("button", { name: "Add character action", exact: true })
      .click();
    await page.waitForFunction(() =>
      Boolean(document.getElementById("errors")!.textContent),
    );
    expect((await snapshot()).plan).toEqual(before);
    await page.getByLabel("New action duration", { exact: true }).fill("12");
    await page
      .getByRole("button", { name: "Add character action", exact: true })
      .click();
    await page.waitForFunction(() =>
      (window.passageLab!.snapshot() as Snapshot).beats[1]!.events.some(
        (e) => e.id === "neighbor-react-1",
      ),
    );
    await page
      .getByRole("button", {
        name: "Remove action neighbor-react-1",
        exact: true,
      })
      .click();
    await page.waitForFunction(
      () =>
        !(window.passageLab!.snapshot() as Snapshot).beats[1]!.events.some(
          (e) => e.id === "neighbor-react-1",
        ),
    );

    await page.getByText("Held props", { exact: true }).click();
    await page
      .getByLabel("New parcel prop cue", { exact: true })
      .selectOption("neighbor");
    await page.getByLabel("New parcel prop offset", { exact: true }).fill("50");
    await page
      .getByRole("button", { name: "Add prop change for parcel", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        (window.passageLab!.snapshot() as Snapshot).beats[1]!.scene
          .propAttachments![0]!.changes[0]?.frame === 211,
    );
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save plan", exact: true }).click();
    const saved = JSON.parse(
      await readFile((await (await download).path())!, "utf8"),
    );
    expect(saved.beats[1].actions[0].offset).toBe(3);
    expect(saved.beats[1].propTracks.parcel.changes[0]).toMatchObject({
      hold: null,
      offset: 50,
    });
    await page
      .getByRole("button", {
        name: "Remove prop change parcel-hold-1",
        exact: true,
      })
      .click();
    await page.waitForFunction(
      () =>
        (window.passageLab!.snapshot() as Snapshot).beats[1]!.scene
          .propAttachments![0]!.changes.length === 0,
    );
    expect(await page.locator("#errors").innerText()).toBe("");
  } finally {
    await page.close();
  }
}, 60_000);

it("edits containers and cue-linked poses in the Lab, then undoes, saves and exports the generation brief", async () => {
  const page = await browser.newPage({ acceptDownloads: true });
  page.setDefaultTimeout(8000);
  try {
    await page.goto(
      base +
        "passage.html?plan=benchmarks/fixtures/parcel-story/acting/parcel-story.json",
    );
    await page.waitForFunction(() => Boolean(window.passageLab?.snapshot()));
    const snapshot = () =>
      page.evaluate(() => window.passageLab!.snapshot() as Snapshot);
    expect(await page.locator("#errors").innerText()).toBe("");
    await page.getByText("Text containers", { exact: true }).click();
    await page
      .getByLabel("caption container", { exact: true })
      .selectOption("speech");
    await page.waitForFunction(
      () =>
        (window.passageLab!.snapshot() as Snapshot).plan.beats[0]!
          .textContainers?.caption?.kind === "speech",
    );
    await page.getByText("Character poses", { exact: true }).click();
    await page.getByLabel("nora-inspects offset", { exact: true }).fill("3");
    await page.getByLabel("nora-inspects offset", { exact: true }).press("Tab");
    await page.waitForFunction(
      () =>
        (window.passageLab!.snapshot() as Snapshot).beats[0]!.events.find(
          (e) => e.id === "nora-inspects",
        )?.start === 77,
    );
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page.waitForFunction(
      () =>
        (window.passageLab!.snapshot() as Snapshot).beats[0]!.events.find(
          (e) => e.id === "nora-inspects",
        )?.start === 74,
    );
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await page.waitForFunction(
      () =>
        (window.passageLab!.snapshot() as Snapshot).beats[0]!.events.find(
          (e) => e.id === "nora-inspects",
        )?.start === 77,
    );
    await page.getByLabel("inspect frame", { exact: true }).fill("80");
    await page.getByLabel("inspect frame", { exact: true }).press("Tab");
    await page.waitForFunction(
      () =>
        (window.passageLab!.snapshot() as Snapshot).beats[0]!.events.find(
          (e) => e.id === "nora-inspects",
        )?.start === 83,
    );
    expect(
      (await snapshot()).beats[0]!.scene.nodes.find((n) => n.id === "caption"),
    ).toHaveProperty("container.kind", "speech");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save plan", exact: true }).click();
    const saved = JSON.parse(
      await readFile((await (await download).path())!, "utf8"),
    );
    expect(saved.beats[0].poseTracks.nora.changes[0].offset).toBe(3);
    expect(saved.beats[0].textContainers.caption.kind).toBe("speech");
    await page
      .getByLabel("New nora pose", { exact: true })
      .selectOption("idle");
    await page.getByLabel("New nora offset", { exact: true }).fill("15");
    await page
      .getByRole("button", { name: "Add nora pose change", exact: true })
      .click();
    await page.waitForFunction(() =>
      (window.passageLab!.snapshot() as Snapshot).beats[0]!.events.some(
        (e) => e.id === "nora-pose-1" && e.start === 95,
      ),
    );
    await page
      .getByRole("button", { name: "Remove nora-pose-1", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        !(window.passageLab!.snapshot() as Snapshot).beats[0]!.events.some(
          (e) => e.id === "nora-pose-1",
        ),
    );
    const briefDownload = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: "nora · Download pose generation brief",
        exact: true,
      })
      .click();
    const brief = await readFile((await (await briefDownload).path())!, "utf8");
    expect(brief).toContain("step-a");
    expect(brief).toContain("transparent");
    expect(await page.locator("#errors").innerText()).toBe("");
  } finally {
    await page.close();
  }
}, 60_000);
