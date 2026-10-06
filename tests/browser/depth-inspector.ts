import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser } from "playwright";
import type { Composition } from "@still-shift/scene-contract";
import { evaluateComp } from "@still-shift/renderer-core";
import { createProgramPreview } from "../../tools/still-shift-cli/src/composition/preview.ts";

/** Actual native depth key editing, bounded validation, history, source save and reload. */
export async function depthInspectorAcceptance(
  browser: Browser,
  directory: string,
  doc: Composition,
) {
  const input = join(directory, "depth-inspector.json");
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  let app: Awaited<ReturnType<typeof createProgramPreview>> | undefined;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await writeFile(input, JSON.stringify(doc, null, 2) + "\n");
    app = await createProgramPreview(input, { watch: false });
    await page.goto(`${app.url}&backend=webgl2`);
    await page.waitForFunction(
      () => document.getElementById("status")?.dataset.revision === "1",
    );
    await page.locator("#backend").selectOption("webgl2");
    await page.waitForFunction(
      () => document.getElementById("status")?.dataset.backend === "webgl2",
    );
    const photo = doc.layers.find((layer) => layer.type === "depth-image")!;
    await page.locator(`[data-layer="${photo.id}"] > button`).first().click();
    await page
      .locator("#key-lanes button")
      .filter({ hasText: "motion.strength" })
      .first()
      .click();
    const originalKeys = await page.locator("#edited-keys").inputValue();
    await page.getByLabel("Depth key value", { exact: true }).fill("0.05");
    await page
      .getByRole("button", { name: "Apply depth key value", exact: true })
      .click();
    await page.waitForFunction(() =>
      Boolean(document.getElementById("edit-message")?.textContent),
    );
    assert.equal(await page.locator("#edited-keys").inputValue(), originalKeys);
    await page.getByLabel("Depth key value", { exact: true }).fill("0.01");
    await page
      .getByRole("button", { name: "Apply depth key value", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.getElementById("document-state")?.textContent ===
        "Unsaved motion edits",
    );
    await page.locator("#frame").fill("0");
    await page.locator("#frame").dispatchEvent("input");
    await page.locator("#undo").click();
    await page.waitForFunction(
      (expected) =>
        document.querySelector<HTMLInputElement>(
          'input[aria-label="Depth key value"]',
        )?.value === expected,
      String(
        evaluateComp(doc, 0).layers.find((layer) => layer.id === photo.id)!
          .depthMotion!.strength,
      ),
    );
    assert.equal(
      await page.getByLabel("Depth key value", { exact: true }).inputValue(),
      String(
        evaluateComp(doc, 0).layers.find((layer) => layer.id === photo.id)!
          .depthMotion!.strength,
      ),
    );
    await page.locator("#redo").click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLInputElement>(
          'input[aria-label="Depth key value"]',
        )?.value === "0.01",
    );
    assert.equal(
      await page.getByLabel("Depth key value", { exact: true }).inputValue(),
      "0.01",
    );
    await page.locator("#save-document").click();
    await page.waitForFunction(
      () =>
        document.getElementById("status")?.textContent === "JSON source saved.",
    );
    const saved = JSON.parse(await readFile(input, "utf8")) as Composition;
    assert.equal(
      evaluateComp(saved, 0).layers.find((layer) => layer.id === photo.id)!
        .depthMotion!.strength,
      0.01,
    );
    assert.deepEqual(saved.assets, doc.assets);
    await page.reload();
    await page.waitForFunction(
      () => document.getElementById("status")?.dataset.revision === "1",
    );
    await page.locator("#backend").selectOption("webgl2");
    await page.waitForFunction(
      () => document.getElementById("status")?.dataset.backend === "webgl2",
    );
    await page.locator(`[data-layer="${photo.id}"] > button`).first().click();
    await page
      .locator("#key-lanes button")
      .filter({ hasText: "motion.strength" })
      .first()
      .click();
    assert.equal(
      await page.getByLabel("Depth key value", { exact: true }).inputValue(),
      "0.01",
    );
    assert.deepEqual(errors, []);
    return {
      backend: "webgl2",
      realKeyEdit: "pass",
      boundedValueRejection: "pass",
      evaluatedStrength: 0.01,
      undoRedo: "pass",
      sourceSaveReload: "pass",
      assetsUnchanged: "pass",
    };
  } finally {
    try {
      await page.close();
    } finally {
      await app?.close();
    }
  }
}
