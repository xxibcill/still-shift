import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Browser } from "playwright";
import type { Composition } from "@still-shift/scene-contract";
import { createProgramPreview } from "../../tools/still-shift-cli/src/composition/preview.ts";

/** Rebuilding receiving controls retains keyboard focus without overriding a moved focus. */
export async function lightingReceivingFocusAcceptance(browser: Browser) {
  const directory = await mkdtemp(join(tmpdir(), "lighting-focus-")),
    input = join(directory, "source.json"),
    art = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="red"/></svg>',
    ),
    doc: Composition = {
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
          threeD: true,
          sources: [{ asset: "art" }],
          transform: { position: [32, 32, 0] },
        },
      ],
    },
    page = await browser.newPage(),
    errors: string[] = [];
  let app: Awaited<ReturnType<typeof createProgramPreview>> | undefined,
    resumeAsset: (() => void) | undefined;
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await writeFile(join(directory, "art.svg"), art);
    await writeFile(input, JSON.stringify(doc));
    app = await createProgramPreview(input, { watch: false });
    await page.goto(app.url);
    await page.waitForFunction(
      () => Number(document.getElementById("status")?.dataset.revision) > 0,
    );
    const ready = () =>
        page.waitForFunction(
          () =>
            !document.querySelector<HTMLFieldSetElement>("#inspector-edit")!
              .disabled,
        ),
      receiving = page.locator(
        '[data-layer="box"] [data-control="receives-light"]',
      );
    await receiving.focus();
    for (const key of ["Space", "Enter"])
      for (const pressed of ["true", "false"]) {
        await page.keyboard.press(key);
        await page.waitForFunction(
          (pressed) =>
            document
              .querySelector('[data-control="receives-light"]')
              ?.getAttribute("aria-pressed") === pressed,
          pressed,
        );
        await ready();
        assert.equal(
          await receiving.evaluate((node) => document.activeElement === node),
          true,
          "Receive light must retain focus for repeated keyboard activation",
        );
      }
    await page.route("**/composition/program-asset?*", (route) =>
      route.fulfill({ status: 503, body: "Unavailable" }),
    );
    await page.keyboard.press("Space");
    await page.waitForFunction(() =>
      document
        .getElementById("error")!
        .textContent!.includes("Asset unavailable"),
    );
    await ready();
    assert.equal(await receiving.getAttribute("aria-pressed"), "false");
    assert.equal(
      await receiving.evaluate((node) => document.activeElement === node),
      true,
      "A rejected receiving edit must retain focus",
    );
    await page.unroute("**/composition/program-asset?*");
    const paused = new Promise<void>((resolve) => {
      resumeAsset = resolve;
    });
    await page.route("**/composition/program-asset?*", async (route) => {
      await paused;
      await route.continue();
    });
    const requested = page.waitForRequest(/composition\/program-asset\?/);
    await page.keyboard.press("Space");
    await requested;
    const otherControl = page.locator("#overlay-safe");
    await otherControl.focus();
    resumeAsset!();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-control="receives-light"]')
          ?.getAttribute("aria-pressed") === "true",
    );
    await ready();
    assert.equal(
      await otherControl.evaluate((node) => document.activeElement === node),
      true,
      "Completing a receiving edit must not steal deliberately moved focus",
    );
    assert.deepEqual(errors, []);
    return {
      acceptedToggles: 4,
      rejectedToggle: "focus retained",
      movedFocus: "not stolen",
      errors,
    };
  } finally {
    resumeAsset?.();
    await page.close();
    await app?.close();
    await rm(directory, { recursive: true, force: true });
  }
}
