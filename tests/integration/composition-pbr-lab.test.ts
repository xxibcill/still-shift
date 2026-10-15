import { createHash } from "node:crypto";
import { writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import { createProgramPreview } from "../../tools/still-shift-cli/src/composition/preview.ts";
import { createNativePbrCompositionFixture } from "../helpers/native-pbr-composition-fixture.ts";
import { nativePbrSceneFixture } from "../helpers/native-pbr-scene-fixture.ts";

const sessions: Awaited<ReturnType<typeof createProgramPreview>>[] = [];
const browsers: Awaited<ReturnType<typeof launchRenderBrowser>>[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(browsers.splice(0).map((browser) => browser.close()));
  await Promise.all(sessions.splice(0).map((session) => session.close()));
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});
const hash = (bytes: string) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");

it.each(["textured", "untextured"] as const)(
  "renders and seeks a %s source3-only Lab preview before and after a material edit",
  async (kind) => {
    const { directory, composition } =
      await createNativePbrCompositionFixture();
    directories.push(directory);
    const input = join(directory, "composition.json");
    if (kind === "untextured") {
      const source = JSON.stringify(nativePbrSceneFixture());
      await writeFile(join(directory, "source3.json"), source);
      composition.assets[0]!.sha256 = hash(source);
      await writeFile(input, JSON.stringify(composition));
    }
    const session = await createProgramPreview(input, { watch: false });
    sessions.push(session);
    expect(session.snapshot()?.preparedNative3D?.version).toBe(
      "composition-prepared-native3d-3",
    );
    const browser = await launchRenderBrowser();
    browsers.push(browser);
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    page.setDefaultTimeout(20000);
    await page.addInitScript("window.__name=(fn)=>fn;");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const ready = async () => {
      await page.waitForFunction(() => {
        const status = document.getElementById("status");
        return (
          Boolean(document.getElementById("error")?.textContent) ||
          (status?.dataset.backend === "webgl2" &&
            status.dataset.ready &&
            !document
              .querySelector("#inspector-edit")
              ?.hasAttribute("disabled"))
        );
      });
      expect(await page.locator("#error").textContent()).toBe("");
      expect(errors).toEqual([]);
    };
    const pixels = async () =>
      page
        .locator("#preview")
        .evaluate((element) =>
          (element as HTMLCanvasElement).toDataURL("image/png"),
        );
    const seek = async (frame: number) => {
      await page.locator("#frame").fill(String(frame));
      await page.locator("#frame").dispatchEvent("input");
      await page.waitForFunction(
        (frame) =>
          document
            .getElementById("time")
            ?.textContent?.includes(`${frame + 1} / 11`),
        frame,
      );
      expect(await page.locator("#error").textContent()).toBe("");
      return pixels();
    };
    await page.goto(session.url);
    await ready();
    const initial = await pixels();
    const middle = await seek(5);
    const end = await seek(10);
    expect(middle).not.toBe(initial);
    expect(end).not.toBe(middle);
    expect(await seek(0)).toBe(initial);
    expect(await seek(5)).toBe(middle);
    await page.evaluate(() => {
      const frame = document.getElementById("frame") as HTMLInputElement;
      for (const value of [0, 10, 5]) {
        frame.value = String(value);
        frame.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await page.waitForFunction(() =>
      document.getElementById("time")?.textContent?.includes("6 / 11"),
    );
    expect(await pixels()).toBe(middle);
    await page.locator('[data-layer="lever-world"] > button').first().click();
    await page
      .getByLabel("Native material roughness", { exact: true })
      .fill("0.37");
    const pending = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/composition/program-prepare",
    );
    await page
      .getByRole("button", { name: "Apply native material", exact: true })
      .click();
    const response = await pending;
    expect(response.status()).toBe(200);
    expect((await response.json()).preparedNative3D.version).toBe(
      "composition-prepared-native3d-3",
    );
    await ready();
    const edited = await seek(5);
    expect(await seek(0)).toBeTruthy();
    expect(await seek(5)).toBe(edited);
  },
  60000,
);
