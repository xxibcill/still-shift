import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser } from "playwright";
import type { Composition } from "@still-shift/scene-contract";
import { createProgramPreview } from "../../tools/still-shift-cli/src/composition/preview.ts";

/** Exercise native framing and Gaussian controls through the real editor and JSON reload. */
export async function cinematicInspectorAcceptance(browser: Browser) {
  const directory = await mkdtemp(join(tmpdir(), "ce4c-inspector-"));
  const input = join(directory, "camera.json");
  const doc: Composition = {
    schemaVersion: "composition-1",
    id: "cinematic-inspector",
    width: 128,
    height: 96,
    fps: 24,
    frameCount: 32,
    assets: [],
    layers: [
      {
        id: "camera",
        type: "camera",
        model: "one-node",
        viewOffset: {
          keys: [
            { frame: 0, value: [0, 0] },
            { frame: 31, value: [16, 4], interpolation: "linear" },
          ],
        },
        depthOfField: true,
        focusDistance: 128,
        aperture: 2,
        blurModel: "gaussian",
        maxBlur: 4,
      },
      {
        id: "plane",
        type: "solid",
        threeD: true,
        size: [48, 40],
        color: "#ffffff",
        focusDepth: 120,
        transform: { position: [40, 40, 0] },
      },
    ],
  };
  let app: Awaited<ReturnType<typeof createProgramPreview>> | undefined;
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await writeFile(input, JSON.stringify(doc, null, 2) + "\n");
    app = await createProgramPreview(input, { watch: false });
    await page.goto(app.url);
    await page.waitForFunction(() =>
      Boolean(document.getElementById("status")?.dataset.revision),
    );
    await page.locator('[data-layer="camera"] > button').first().click();
    await page.locator("#frame").fill("16");
    await page.locator("#frame").dispatchEvent("input");
    const pixels = () =>
      page
        .locator("#preview")
        .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
    const original = await pixels();
    const corners = () =>
      page
        .locator('[data-overlay="camera-frustum"][data-plane="focus"]')
        .getAttribute("data-world-corners");
    const initial = await corners();
    await page
      .locator("#key-lanes button")
      .filter({ hasText: "viewOffset" })
      .first()
      .click();
    await page.getByLabel("out ease", { exact: true }).fill("0.8");
    await page.getByLabel("out speed", { exact: true }).fill("0,0");
    await page
      .getByRole("button", { name: "Apply out handle", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.getElementById("document-state")?.textContent ===
        "Unsaved motion edits",
    );
    const edited = await pixels();
    assert.notEqual(edited, original);
    assert.notEqual(await corners(), initial);
    await page.locator("#undo").click();
    assert.equal(await pixels(), original);
    await page.locator("#redo").click();
    assert.equal(await pixels(), edited);
    await page.locator("#save-document").click();
    await page.waitForFunction(
      () =>
        document.getElementById("status")?.textContent === "JSON source saved.",
    );
    const saved = JSON.parse(await readFile(input, "utf8"));
    assert.deepEqual(saved.layers[0].viewOffset.keys[0].out, {
      ease: 0.8,
      speed: [0, 0],
    });
    assert.equal(saved.layers[0].blurModel, "gaussian");
    assert.equal(saved.layers[0].maxBlur, 4);
    assert.deepEqual(saved.layers[1], doc.layers[1]);
    await page.reload();
    await page.waitForFunction(() =>
      Boolean(document.getElementById("status")?.dataset.revision),
    );
    await page.locator("#frame").fill("16");
    await page.locator("#frame").dispatchEvent("input");
    assert.equal(await pixels(), edited);
    await page.locator("#backend").selectOption("webgl2");
    await page.waitForFunction(
      () => document.getElementById("status")?.dataset.backend === "webgl2",
    );
    assert.equal(await page.locator("#frame").inputValue(), "16");
    await page.locator("#backend").selectOption("canvas2d");
    await page.waitForFunction(
      () => document.getElementById("status")?.dataset.backend === "canvas2d",
    );
    assert.equal(await pixels(), edited);
    assert.deepEqual(errors, []);
    return {
      status: "passed",
      checks: [
        "xy framing temporal-handle edit",
        "actual camera frustum",
        "undo/redo pixels",
        "native Gaussian controls preserved",
        "JSON save/reload pixels",
        "both backends",
      ],
    };
  } finally {
    await page.close();
    await app?.close();
    await rm(directory, { recursive: true, force: true });
  }
}
