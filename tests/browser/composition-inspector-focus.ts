import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import type { Composition } from "../../packages/scene-contract/src/index.ts";
import { createProgramPreview } from "../../tools/still-shift-cli/src/composition/preview.ts";

export async function verifyCompositionInspectorFocus() {
  const root = await mkdtemp(join(tmpdir(), "composition-inspector-focus-")),
    input = join(root, "source.json"),
    art = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="red"/></svg>',
    );
  const source: Composition = {
    schemaVersion: "composition-1",
    id: "focus",
    width: 64,
    height: 64,
    fps: 24,
    frameCount: 8,
    assets: [
      {
        id: "art",
        type: "image",
        path: "art.svg",
        width: 4,
        height: 4,
        sha256: `sha256:${createHash("sha256").update(art).digest("hex")}`,
      },
    ],
    layers: [
      {
        id: "box",
        type: "image",
        size: [16, 16],
        sources: [{ asset: "art" }],
        transform: {
          position: {
            keys: [
              { frame: 0, value: [10, 20] },
              { frame: 7, value: [44, 20] },
            ],
          },
          rotation: {
            keys: [
              { frame: 0, value: 0 },
              { frame: 7, value: 90 },
            ],
          },
        },
      },
    ],
  };
  await writeFile(join(root, "art.svg"), art);
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
    const ready = () =>
      page.waitForFunction(
        () =>
          !document.querySelector<HTMLFieldSetElement>("#inspector-edit")!
            .disabled,
      );
    const apply = async (name: string, input: string, value: string) => {
      const control = page.getByRole("button", { name, exact: true });
      await page.getByLabel(input, { exact: true }).fill(value);
      await control.focus();
      await control.press("Enter");
      await ready();
      assert.equal(await page.locator("#error").textContent(), "");
      assert.equal(
        await control.evaluate((node) => document.activeElement === node),
        true,
        `${name} must preserve keyboard focus`,
      );
    };
    await page
      .getByRole("button", {
        name: "root / box · transform.rotation",
        exact: true,
      })
      .click();
    for (const value of ["0.7", "0.4"])
      await apply("Apply out handle", "out ease", value);
    await page.getByLabel("Key to edit", { exact: true }).selectOption("1");
    await apply("Apply in handle", "in ease", "0.6");
    await apply(
      "Apply Bézier",
      "Segment Bézier x1,y1,x2,y2",
      "0.2,0.1,0.8,0.9",
    );
    await page
      .getByRole("button", {
        name: "root / box · transform.position",
        exact: true,
      })
      .click();
    await page.getByLabel("Key to edit", { exact: true }).selectOption("0");
    await apply("Apply spatialOut", "spatialOut", "10,20");
    await page.getByLabel("Key to edit", { exact: true }).selectOption("1");
    await apply("Apply spatialIn", "spatialIn", "-10,-20");
    const spatial = page.getByRole("button", {
      name: "Apply spatialIn",
      exact: true,
    });
    await page.route("**/composition/program-asset?*", (route) =>
      route.fulfill({ status: 503, body: "Unavailable" }),
    );
    await page.getByLabel("spatialIn", { exact: true }).fill("-15,-20");
    await spatial.focus();
    await spatial.press("Enter");
    await page.waitForFunction(() =>
      document
        .getElementById("error")!
        .textContent!.includes("Asset unavailable"),
    );
    await ready();
    assert.equal(
      await spatial.evaluate((node) => document.activeElement === node),
      true,
      "Rejected numeric edits must preserve focus",
    );
    await page.unroute("**/composition/program-asset?*");
    let resumeAsset!: () => void;
    const pausedAsset = new Promise<void>((resolve) => {
      resumeAsset = resolve;
    });
    await page.route("**/composition/program-asset?*", async (route) => {
      await pausedAsset;
      await route.continue();
    });
    await spatial.press("Enter");
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLFieldSetElement>("#inspector-edit")!
          .disabled,
    );
    await page.locator("#overlay-safe").focus();
    resumeAsset();
    await ready();
    assert.equal(
      await page
        .locator("#overlay-safe")
        .evaluate((node) => document.activeElement === node),
      true,
      "Numeric acceptance must respect moved focus",
    );
    await page.unroute("**/composition/program-asset?*");
    const handle = page.getByRole("button", {
      name: "Bézier start handle; arrow keys move x, Shift arrow keys move y",
      exact: true,
    });
    await handle.focus();
    for (const x of ["0.34", "0.35"]) {
      await handle.press("ArrowRight");
      await ready();
      assert.equal(
        await handle.evaluate((node) => document.activeElement === node),
        true,
        "Repeated Bezier keyboard edits must preserve focus",
      );
      assert.equal(
        (
          await page
            .getByLabel("Segment Bézier x1,y1,x2,y2", { exact: true })
            .inputValue()
        ).split(",")[0],
        x,
      );
    }
    let resumeBezier!: () => void;
    const pausedBezier = new Promise<void>((resolve) => {
      resumeBezier = resolve;
    });
    await page.route("**/composition/program-asset?*", async (route) => {
      await pausedBezier;
      await route.continue();
    });
    await handle.press("ArrowRight");
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLFieldSetElement>("#inspector-edit")!
          .disabled,
    );
    await page.locator("#overlay-safe").focus();
    resumeBezier();
    await ready();
    assert.equal(
      await page
        .locator("#overlay-safe")
        .evaluate((node) => document.activeElement === node),
      true,
      "Bezier acceptance must respect moved focus",
    );
    await page.unroute("**/composition/program-asset?*");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
}
