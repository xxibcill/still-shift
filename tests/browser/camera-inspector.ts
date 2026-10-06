import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser } from "playwright";
import type { Composition } from "@still-shift/scene-contract";
import { createProgramPreview } from "../../tools/still-shift-cli/src/composition/preview.ts";

/** Exercise the real preview/editor/save path with native xyz and POI curves. */
export async function cameraInspectorAcceptance(browser: Browser) {
  const directory = await mkdtemp(join(tmpdir(), "ce8-camera-inspector-")),
    input = join(directory, "camera.json"),
    doc: Composition = {
      schemaVersion: "composition-1",
      id: "camera-inspector",
      width: 128,
      height: 96,
      fps: 24,
      frameCount: 32,
      assets: [],
      layers: [
        {
          id: "camera",
          type: "camera",
          model: "two-node",
          pointOfInterest: {
            keys: [
              { frame: 0, value: [64, 48, 0] },
              { frame: 31, value: [76, 45, 18], interpolation: "linear" },
            ],
          },
          focusDistance: 128,
        },
        {
          id: "plane",
          type: "solid",
          size: [48, 40],
          color: "#ffffff",
          threeD: true,
          transform: {
            position: {
              keys: [
                { frame: 0, value: [40, 40, 0] },
                { frame: 31, value: [75, 48, 30], interpolation: "linear" },
              ],
            },
          },
        },
      ],
    };
  let app: Awaited<ReturnType<typeof createProgramPreview>> | undefined;
  const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    }),
    errors: string[] = [];
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
    await page.locator('[data-layer="camera"] > button').first().click();
    assert.equal(
      await page.locator('[data-overlay="camera-frustum"]').count(),
      2,
    );
    const initial = await page
      .locator('[data-overlay="camera-frustum"][data-plane="focus"]')
      .getAttribute("data-world-corners");
    assert.deepEqual(JSON.parse(initial!), [
      [0, 0, 0],
      [128, 0, 0],
      [128, 96, 0],
      [0, 96, 0],
    ]);
    await page
      .locator("#key-lanes button")
      .filter({ hasText: "pointOfInterest" })
      .first()
      .click();
    assert.equal(
      await page.getByLabel("spatialOut", { exact: true }).inputValue(),
      "0,0,0",
    );
    await page.getByLabel("spatialOut", { exact: true }).fill("10,3,8");
    await page
      .getByRole("button", { name: "Apply spatialOut", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.getElementById("document-state")?.textContent ===
        "Unsaved motion edits",
    );
    await page.locator("#frame").fill("16");
    await page.locator("#frame").dispatchEvent("input");
    assert.notEqual(
      await page
        .locator('[data-overlay="camera-frustum"][data-plane="focus"]')
        .getAttribute("data-world-corners"),
      initial,
    );
    await page.locator("#undo").click();
    await page.locator("#redo").click();
    await page.locator("#save-document").click();
    await page.waitForFunction(
      () =>
        document.getElementById("status")?.textContent === "JSON source saved.",
    );
    const saved = JSON.parse(await readFile(input, "utf8"));
    assert.deepEqual(
      saved.layers[0].pointOfInterest.keys[0].spatialOut,
      [10, 3, 8],
    );
    assert.deepEqual(saved.layers[1], doc.layers[1]);
    await page.locator('[data-layer="plane"] > button').first().click();
    await page
      .locator("#key-lanes button")
      .filter({ hasText: "transform.position" })
      .first()
      .click();
    assert.equal(
      await page.getByLabel("spatialOut", { exact: true }).inputValue(),
      "0,0,0",
    );
    assert((await page.locator('[data-overlay="anchor"]').count()) > 0);
    assert.deepEqual(errors, []);
    return {
      status: "passed",
      checks: [
        "native xyz track",
        "POI tangent edit",
        "actual world frustum",
        "scoped camera at selected frame",
        "undo/redo",
        "lossless native source save",
      ],
    };
  } finally {
    await page.close();
    await app?.close();
    await rm(directory, { recursive: true, force: true });
  }
}
