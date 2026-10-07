import assert from "node:assert/strict";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "vite";
import type { Browser } from "playwright";
import type { Composition } from "@still-shift/scene-contract";
import { renderComposition } from "@still-shift/animation-engine";
import { createProgramPreview } from "../../tools/still-shift-cli/src/composition/preview.ts";
import { compositionApi } from "../../apps/lab/composition-api.ts";

const checksum = (bytes: Uint8Array) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");

/** Real native inspector edits must prepare newly referenced originals and export the draft. */
export async function verifyNativeMediaAuthoring(
  browser: Browser,
  root: string,
  directory: string,
  source: Composition,
) {
  const composition = structuredClone(source);
  const layer = composition.layers[0]!;
  if (layer.type !== "sequence") throw Error("Expected sequence fixture");
  layer.timeRemap = {
    keys: [
      { frame: 0, value: 0, interpolation: "hold" },
      { frame: 5, value: 0.2, interpolation: "hold" },
    ],
  };
  const input = join(directory, "authoring.json");
  await writeFile(input, JSON.stringify(composition));
  const app = await createProgramPreview(input, { watch: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const picture = () =>
    page
      .locator("#preview")
      .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
  const ready = () =>
    page.waitForFunction(
      () =>
        document.getElementById("status")?.dataset.ready === "program" &&
        !document.getElementById("inspector-edit")?.hasAttribute("disabled"),
    );
  const seek = async (frame: number) => {
    await page.locator("#frame").fill(String(frame));
    await page.locator("#frame").dispatchEvent("input");
    await page.waitForFunction(
      (frame) =>
        document
          .getElementById("time")
          ?.textContent?.includes(` ${frame + 1} / 6`),
      frame,
    );
  };
  let fixtureDirectory: string | undefined;
  let fixtureServer: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    await page.goto(app.url);
    await ready();
    assert.deepEqual(
      app.snapshot()!.preparedMedia!.frames.map((frame) => frame.ordinal),
      [0, 2],
    );
    await seek(1);
    const before = await picture();
    await page.locator('[data-layer="picture"] > button').first().click();
    await page
      .locator("#key-lanes")
      .getByRole("button", { name: /timeRemap/ })
      .click();
    await page
      .getByLabel("Media key value", { exact: true })
      .fill(String(1 / 12));
    await page
      .getByRole("button", { name: "Apply media key value", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.getElementById("document-state")?.textContent ===
          "Unsaved motion edits" &&
        !document.getElementById("inspector-edit")?.hasAttribute("disabled"),
    );
    const edited = await picture();
    assert.notEqual(edited, before);
    await page.locator("#undo").click();
    await page.waitForFunction(
      () =>
        document.getElementById("document-state")?.textContent ===
          "Source unchanged" &&
        !document.getElementById("inspector-edit")?.hasAttribute("disabled"),
    );
    assert.equal(await picture(), before);
    await page.locator("#redo").click();
    await page.waitForFunction(
      () =>
        document.getElementById("document-state")?.textContent ===
          "Unsaved motion edits" &&
        !document.getElementById("inspector-edit")?.hasAttribute("disabled"),
    );
    assert.equal(await picture(), edited);
    const expected = structuredClone(composition);
    const expectedLayer = expected.layers[0]!;
    if (expectedLayer.type !== "sequence") throw Error("Expected sequence");
    expectedLayer.timeRemap = {
      keys: [
        { frame: 0, value: 1 / 12, interpolation: "hold" },
        { frame: 5, value: 0.2, interpolation: "hold" },
      ],
    };
    const expectedPath = join(directory, "authoring-expected.json");
    await writeFile(expectedPath, JSON.stringify(expected));
    const rendered = await renderComposition({
      compositionPath: expectedPath,
      outputPath: join(directory, "authoring-expected.mp4"),
      cacheDirectory: join(directory, "authoring-cache"),
    });
    const downloading = page.waitForEvent("download");
    await page.locator("#export-composition").click();
    const downloadPath = join(directory, "authoring-draft.mp4");
    await (await downloading).saveAs(downloadPath);
    assert.equal(
      checksum(await readFile(downloadPath)),
      rendered.checksums.output,
    );
    await page.locator("#save-document").click();
    await page.waitForFunction(
      () =>
        Number(document.getElementById("status")?.dataset.revision) === 2 &&
        document.getElementById("document-state")?.textContent ===
          "Source unchanged" &&
        !document.getElementById("inspector-edit")?.hasAttribute("disabled"),
    );
    assert.deepEqual(JSON.parse(await readFile(input, "utf8")), expected);
    assert.equal(await picture(), edited);
    await page.locator("#backend").selectOption("webgl2");
    await page.waitForFunction(
      () =>
        document.getElementById("status")?.dataset.backend === "webgl2" &&
        !document.getElementById("inspector-edit")?.hasAttribute("disabled"),
    );
    assert.equal(await picture(), edited);
    await seek(5);
    const last = await picture();
    await page.locator("#play").click();
    await page.waitForFunction(
      () =>
        document.getElementById("play")?.textContent === "Play" &&
        document.getElementById("time")?.textContent?.includes(" 6 / 6"),
    );
    assert.equal(await picture(), last);
    const altered = structuredClone(expected);
    altered.assets[0]!.path = "/unregistered-source.mkv";
    const rejected = await page.request.post(
      new URL("/composition/program-prepare", app.url).href,
      {
        headers: { "x-still-shift-composition": "1" },
        data: { revision: 2, document: altered },
      },
    );
    assert.equal(rejected.status(), 422);
    const raw = await page.request.get(
      new URL("/composition/program-asset?revision=2&id=clip", app.url).href,
    );
    assert.equal(raw.status(), 404);
    const originalPath = join(directory, "frame_1.png");
    const original = await readFile(originalPath);
    await writeFile(originalPath, Buffer.concat([original, Buffer.from([0])]));
    await page.waitForFunction(() =>
      document
        .getElementById("error")
        ?.textContent?.includes("Original sequence frame differs"),
    );
    assert.equal(await picture(), last);
    await writeFile(originalPath, original);
    await page.waitForFunction(
      () =>
        Number(document.getElementById("status")?.dataset.revision) >= 3 &&
        document.getElementById("error")?.textContent === "",
    );
    assert.equal(await picture(), last);
    // Exercise the repository fixture API separately, using files inside its registered root.
    const fixtureRoot = join(root, "benchmarks/fixtures/composition");
    await mkdir(fixtureRoot, { recursive: true });
    fixtureDirectory = await mkdtemp(join(fixtureRoot, "ce13-authoring-"));
    for (const file of [
      "frame_0.png",
      "frame_1.png",
      "frame_2.png",
      "manifest.json",
    ])
      await copyFile(join(directory, file), join(fixtureDirectory, file));
    const fixture = structuredClone(expected);
    const asset = fixture.assets[0]!;
    if (asset.type !== "sequence") throw Error("Expected sequence");
    asset.path = "frame_%01d.png";
    asset.manifestPath = "manifest.json";
    await writeFile(
      join(fixtureDirectory, "source.json"),
      JSON.stringify(fixture),
    );
    fixtureServer = await createServer({
      root: join(root, "apps/lab"),
      configFile: false,
      cacheDir: join(directory, "fixture-vite"),
      logLevel: "error",
      plugins: [compositionApi()],
      server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
    });
    await fixtureServer.listen();
    const fixturePath = relative(
      fixtureRoot,
      join(fixtureDirectory, "source.json"),
    );
    await page.goto(
      fixtureServer.resolvedUrls!.local[0]! +
        "composition.html?scene=" +
        encodeURIComponent(fixturePath),
    );
    await page.waitForFunction(
      (path) => document.getElementById("status")?.dataset.ready === path,
      fixturePath,
    );
    await seek(1);
    assert.equal(await picture(), edited);
    assert.deepEqual(errors, []);
    return {
      newlyReferencedOriginal: 1,
      inspectorUndoRedo: "exact",
      savedReload: "exact",
      backendSwitch: "exact",
      draftExport: "byte-identical",
      playback: "last frame exact",
      fixturePreview: "exact",
      changedBindingsRejected: true,
      originalMediaNotServed: true,
      sequenceOriginalWatch: "changed bytes rejected; restored pixels exact",
    };
  } finally {
    await page.close();
    await app.close();
    await fixtureServer?.close();
    if (fixtureDirectory)
      await rm(fixtureDirectory, { recursive: true, force: true });
  }
}
