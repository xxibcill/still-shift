import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Browser } from "playwright";
import type { Composition } from "@still-shift/scene-contract";
import { createProgramPreview } from "../../tools/still-shift-cli/src/composition/preview.ts";
export async function lightingInspectorAcceptance(browser: Browser) {
  const directory = await mkdtemp(join(tmpdir(), "ce8l-inspector-")),
    input = join(directory, "lighting.json"),
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } }),
    errors: string[] = [];
  const doc: Composition = {
    schemaVersion: "composition-1",
    id: "lighting-inspector",
    width: 128,
    height: 96,
    fps: 24,
    frameCount: 32,
    assets: [],
    layers: [
      {
        id: "light",
        type: "light",
        lightType: "spot",
        range: 300,
        innerCone: {
          keys: [
            { frame: 0, value: 20 },
            { frame: 31, value: 35 },
          ],
        },
        outerCone: 60,
        intensity: {
          keys: [
            { frame: 0, value: 0.5 },
            { frame: 31, value: 1.5 },
          ],
        },
        color: {
          keys: [
            { frame: 0, value: "#ffc080" },
            { frame: 31, value: "#80c0ff" },
          ],
        },
        transform: {
          position: {
            keys: [
              { frame: 0, value: [30, 48, -100] },
              { frame: 31, value: [90, 48, -100], interpolation: "linear" },
            ],
          },
        },
      },
      {
        id: "plane",
        type: "solid",
        size: [100, 70],
        color: "#a0a0a0",
        threeD: true,
        transform: { position: [64, 48, 0] },
      },
    ],
  };
  let app: Awaited<ReturnType<typeof createProgramPreview>> | undefined;
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await writeFile(input, JSON.stringify(doc, null, 2) + "\n");
    app = await createProgramPreview(input, { watch: false });
    await page.goto(app.url);
    await page.waitForFunction(
      () => document.getElementById("status")?.dataset.revision === "1",
    );
    await page.locator("#backend").selectOption("webgl2");
    await page.waitForFunction(
      () => document.getElementById("status")?.dataset.backend === "webgl2",
    );
    await page
      .locator('[data-layer="plane"] [data-control="receives-light"]')
      .click();
    await page.waitForFunction(
      () =>
        document.getElementById("document-state")?.textContent ===
        "Unsaved motion edits",
    );
    assert.equal(
      await page
        .locator('[data-layer="plane"] [data-control="receives-light"]')
        .getAttribute("aria-pressed"),
      "true",
    );
    await page.locator('[data-layer="light"] > button').first().click();
    const labels = await page.locator("#key-lanes button").allTextContents();
    assert(labels.some((x) => x.includes("color")));
    assert(labels.some((x) => x.includes("innerCone")));
    assert(labels.some((x) => x.includes("intensity")));
    await page
      .locator("#key-lanes button")
      .filter({ hasText: "intensity" })
      .first()
      .click();
    await page.getByLabel("Light key value", { exact: true }).fill("0.75");
    await page
      .getByRole("button", { name: "Apply light key value", exact: true })
      .click();
    await page.waitForFunction(
      () => document.getElementById("status")?.dataset.revision === "3",
    );
    await page.locator("#undo").click();
    await page.locator("#redo").click();
    await page.locator("#save-document").click();
    await page.waitForFunction(
      () =>
        document.getElementById("status")?.textContent === "JSON source saved.",
    );
    const saved: Composition = JSON.parse(await readFile(input, "utf8"));
    assert.equal(saved.layers[1]!.receivesLight, true);
    const light = saved.layers[0]!;
    assert(light.type === "light");
    assert(typeof light.intensity === "object");
    assert.equal(light.intensity.keys[0]!.value, 0.75);
    assert.deepEqual(
      light.transform!.position,
      doc.layers[0]!.transform!.position,
    );
    assert.deepEqual(errors, []);
    return {
      receiverToggle: "source/undo/redo/save",
      lightTracks: ["XYZ", "color", "intensity", "innerCone"],
      intensityEdit: 0.75,
      errors,
    };
  } finally {
    await page.close();
    await app?.close();
    await rm(directory, { recursive: true, force: true });
  }
}
