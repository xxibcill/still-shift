import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import type {
  Composition,
  CompositionLayer,
} from "../../packages/scene-contract/src/index.ts";
import { validateComposition } from "../../packages/scene-contract/src/index.ts";
import { createProgramPreview } from "../../tools/still-shift-cli/src/composition/preview.ts";

export async function verifyCompositionInspectorScopes() {
  const root = await mkdtemp(join(tmpdir(), "composition-inspector-scopes-")),
    input = join(root, "source.json");
  const box = (start: number, end: number): CompositionLayer => ({
    id: "box",
    type: "solid",
    size: [8, 8],
    color: "#ffffff",
    transform: {
      position: [8, 8],
      rotation: {
        keys: [
          { frame: 0, value: start },
          { frame: 7, value: end },
        ],
      },
    },
  });
  const source: Composition = {
    schemaVersion: "composition-1",
    id: "scope",
    width: 64,
    height: 64,
    fps: 24,
    frameCount: 8,
    assets: [],
    markers: [{ id: "root-cue", frame: 2 }],
    layers: [
      box(0, 10),
      {
        id: "nested-a",
        type: "precomp",
        comp: "root",
        transform: { position: [10, 0] },
      },
      {
        id: "nested-b",
        type: "precomp",
        comp: "root",
        transform: { position: [20, 0] },
      },
    ],
    precomps: [
      {
        id: "root",
        width: 64,
        height: 64,
        fps: 50,
        frameCount: 8,
        markers: [{ id: "nested-cue", frame: 4 }],
        layers: [box(100, 200)],
      },
    ],
  };
  const validation = validateComposition(source);
  assert.equal(validation.ok, true, JSON.stringify(validation.diagnostics));
  await writeFile(input, JSON.stringify(source));
  const app = await createProgramPreview(input),
    browser = await launchRenderBrowser();
  try {
    const page = await browser.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(app.url);
    await page.waitForFunction(
      () => Number(document.getElementById("status")?.dataset.revision) > 0,
    );
    const rows = page.locator('[data-layer="box"]');
    await rows.last().locator("button").first().click();
    const snippet = (await page.locator("#edited-keys").inputValue()).split(
        ".keys(",
      )[1]!,
      keys = JSON.parse(snippet.slice(0, snippet.lastIndexOf("]") + 1));
    assert.equal(
      keys[0].value,
      100,
      "Selecting the root-named precomp must inspect its own keys",
    );
    assert.equal(
      await rows.last().locator("button").first().getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(
      await rows.first().locator("button").first().getAttribute("aria-pressed"),
      "false",
    );
    assert.equal(await page.locator("#key-lanes .key-lane").count(), 1);
    assert.equal(
      await page
        .getByRole("button", { name: "Marker nested-cue · 4", exact: true })
        .count(),
      1,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Marker root-cue · 2", exact: true })
        .count(),
      0,
    );
    assert.deepEqual(
      await page
        .getByLabel("Resolved property instance", { exact: true })
        .locator("option")
        .evaluateAll((options) =>
          options.map((option) => (option as HTMLOptionElement).value),
        ),
      ["nested-a/box.transform.rotation", "nested-b/box.transform.rotation"],
    );
    assert.match(
      (await page.locator("#curve-clock").textContent()) ?? "",
      /50 fps/,
    );
    await page.locator("#overlay-bounds").check();
    assert.deepEqual(
      await page
        .locator('[data-overlay="anchor"]')
        .evaluateAll((anchors) =>
          anchors.map((anchor) => anchor.getAttribute("data-layer")),
        ),
      ["root/nested-a/box", "root/nested-b/box"],
    );
    await page.getByLabel("out ease", { exact: true }).fill("0.8");
    await page
      .getByRole("button", { name: "Apply out handle", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        !document.querySelector<HTMLFieldSetElement>("#inspector-edit")!
          .disabled,
    );
    await page.locator("#save-document").click();
    await page.waitForFunction(
      () =>
        document.getElementById("status")!.textContent === "JSON source saved.",
    );
    const saved = JSON.parse(await readFile(input, "utf8")) as Composition;
    assert.deepEqual(
      saved.layers[0],
      source.layers[0],
      "A nested edit must preserve the top-level layer",
    );
    assert.deepEqual(
      (
        saved.precomps![0]!.layers[0]!.transform!.rotation as {
          keys: { out?: { ease: number } }[];
        }
      ).keys[0]!.out,
      { ease: 0.8 },
    );
    await rows.first().locator("button").first().click();
    assert.deepEqual(
      await page
        .getByLabel("Resolved property instance", { exact: true })
        .locator("option")
        .evaluateAll((options) =>
          options.map((option) => (option as HTMLOptionElement).value),
        ),
      ["box.transform.rotation"],
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Marker root-cue · 2", exact: true })
        .count(),
      1,
    );
    assert.deepEqual(
      await page
        .locator('[data-overlay="anchor"]')
        .evaluateAll((anchors) =>
          anchors.map((anchor) => anchor.getAttribute("data-layer")),
        ),
      ["root/box"],
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
}
