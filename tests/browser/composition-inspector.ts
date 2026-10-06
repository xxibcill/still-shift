import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import { createProgramPreview } from "../../tools/still-shift-cli/src/composition/preview.ts";
import type { Composition } from "../../packages/scene-contract/src/index.ts";
const run = promisify(execFile),
  root = await mkdtemp(join(tmpdir(), "composition-inspector-")),
  input = join(root, "source.json");
const source: Composition = {
  schemaVersion: "composition-1",
  id: "inspector",
  name: "Inspector acceptance",
  width: 64,
  height: 64,
  fps: 24,
  frameCount: 8,
  background: "#333333",
  assets: [],
  markers: [{ id: "cue", frame: 3 }],
  metadata: { owner: { keys: [{ frame: 9, value: "opaque" }] } },
  layers: [
    {
      id: "box",
      type: "solid",
      size: [8, 8],
      color: "#dddddd",
      transform: {
        position: {
          keys: [
            { frame: 0, value: [4, 20] },
            { frame: 7, value: [44, 20] },
          ],
        },
      },
    },
  ],
};
let app: Awaited<ReturnType<typeof createProgramPreview>> | undefined,
  browser: Awaited<ReturnType<typeof launchRenderBrowser>> | undefined;
try {
  const art = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="#cccccc"/></svg>',
  );
  await writeFile(join(root, "art.svg"), art);
  source.assets.push({
    id: "art",
    type: "image",
    path: "art.svg",
    width: 4,
    height: 4,
    sha256: `sha256:${createHash("sha256").update(art).digest("hex")}`,
  });
  source.layers.push({
    id: "stamp",
    type: "image",
    size: [4, 4],
    sources: [{ asset: "art" }],
    transform: { position: [52, 4] },
  });
  await writeFile(input, "\n" + JSON.stringify(source) + "\n");
  app = await createProgramPreview(input, { watch: true });
  browser = await launchRenderBrowser();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await page.goto(app.url);
  await page.waitForFunction(
    () => document.getElementById("status")?.dataset.revision === "1",
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const pixels = () =>
    page
      .locator("#preview")
      .evaluate((canvas) =>
        Array.from(
          (canvas as HTMLCanvasElement)
            .getContext("2d")!
            .getImageData(0, 0, 64, 64).data,
        ),
      );
  await page.locator("#frame").fill("4");
  await page.locator("#frame").dispatchEvent("input");
  const original = await pixels();
  await page.locator('[data-layer="box"] > button').first().click();
  assert.equal(await page.locator("#key-lanes .key-lane").count(), 1);
  const keySelector = page.getByLabel("Key to edit", { exact: true });
  await keySelector.focus();
  for (const value of ["1", "0"]) {
    await keySelector.selectOption(value);
    assert.equal(
      await keySelector.evaluate((select) => document.activeElement === select),
      true,
      "Changing the selected key must preserve keyboard focus",
    );
  }
  await page.getByLabel("out ease", { exact: true }).fill("0.85");
  await page.getByLabel("out speed", { exact: true }).fill("0,0");
  await page
    .getByRole("button", { name: "Apply out handle", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.getElementById("document-state")!.textContent ===
      "Unsaved motion edits",
  );
  const edited = await pixels();
  assert.notDeepEqual(edited, original);
  assert.equal(await page.locator("#frame").inputValue(), "4");
  await page.locator("#undo").click();
  await page.waitForFunction(
    () =>
      document.getElementById("document-state")!.textContent ===
      "Source unchanged",
  );
  assert.deepEqual(await pixels(), original);
  await page.locator("#redo").click();
  await page.waitForFunction(
    () =>
      document.getElementById("document-state")!.textContent ===
      "Unsaved motion edits",
  );
  assert.deepEqual(await pixels(), edited);
  await page.getByLabel("out ease", { exact: true }).fill("2");
  await page
    .getByRole("button", { name: "Apply out handle", exact: true })
    .click();
  await page.waitForFunction(() =>
    document
      .getElementById("edit-message")!
      .textContent!.includes("comp-schema-range"),
  );
  assert.deepEqual(await pixels(), edited);
  await page
    .locator('[data-layer="box"]')
    .getByRole("button", { name: "Hide", exact: true })
    .click();
  await page.waitForFunction(() =>
    document.getElementById("edit-message")!.textContent!.includes("view-only"),
  );
  assert.notDeepEqual(await pixels(), edited);
  const hidden = await pixels();
  await page.getByLabel("out ease", { exact: true }).fill("0.6");
  await page
    .getByRole("button", { name: "Apply out handle", exact: true })
    .click();
  await page.waitForFunction(() =>
    document
      .getElementById("edit-message")!
      .textContent!.includes("box out handle"),
  );
  assert.deepEqual(await pixels(), hidden);
  for (const direction of ["undo", "redo", "undo"]) {
    await page.locator(`#${direction}`).click();
    await page.waitForFunction(
      () =>
        !document.getElementById("inspector-edit")!.hasAttribute("disabled"),
    );
    assert.deepEqual(await pixels(), hidden);
    assert.equal(
      await page
        .locator('[data-layer="box"]')
        .getByRole("button", { name: "Show", exact: true })
        .count(),
      1,
    );
  }
  await page.locator("#reset-visibility").click();
  await page.waitForFunction(
    () => !document.getElementById("inspector-edit")!.hasAttribute("disabled"),
  );
  assert.deepEqual(await pixels(), edited);
  await page.locator("#overlay-paths").check();
  await page.locator("#overlay-safe").check();
  assert.equal(await page.locator('[data-overlay="motion-path"]').count(), 1);
  assert.equal(await page.locator('[data-overlay="safe-area"]').count(), 1);
  await page.locator("#edit-key").selectOption("1");
  await page
    .getByRole("button", {
      name: "Bézier start handle; arrow keys move x, Shift arrow keys move y",
      exact: true,
    })
    .press("ArrowRight");
  await page.waitForFunction(() =>
    document
      .getElementById("edit-message")!
      .textContent!.includes("Drag segment Bézier"),
  );
  const focusedHandle = () =>
    page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  const startHandleLabel =
    "Bézier start handle; arrow keys move x, Shift arrow keys move y";
  assert.equal(await focusedHandle(), startHandleLabel);
  for (const key of ["ArrowRight", "Shift+ArrowUp"]) {
    const before = await page.locator("#edited-keys").inputValue();
    await page.keyboard.press(key);
    await page.waitForFunction(
      (previous) =>
        (document.getElementById("edited-keys") as HTMLTextAreaElement)
          .value !== previous,
      before,
    );
    assert.equal(await focusedHandle(), startHandleLabel);
  }
  assert.match(await page.locator("#edited-keys").inputValue(), /"bezier"/);
  assert.doesNotMatch(await page.locator("#edited-keys").inputValue(), /"out"/);
  for (let i = 0; i < 3; i++) {
    await page.locator("#undo").click();
    await page.waitForFunction(
      () =>
        !document.getElementById("inspector-edit")!.hasAttribute("disabled"),
    );
  }
  assert.match(await page.locator("#edited-keys").inputValue(), /"out"/);
  assert.deepEqual(await pixels(), edited);
  await page.locator("#save-document").click();
  await page.waitForFunction(
    () =>
      document.getElementById("document-state")!.textContent ===
      "Source unchanged",
  );
  const saved = JSON.parse(await readFile(input, "utf8")) as Composition;
  assert.deepEqual(saved.metadata, source.metadata);
  assert.deepEqual(saved.assets, source.assets);
  assert.equal(saved.layers[0]!.enabled, undefined);
  assert.deepEqual(
    (saved.layers[0]!.transform!.position as { keys: unknown[] }).keys[0],
    { frame: 0, value: [4, 20], out: { ease: 0.85, speed: [0, 0] } },
  );
  await page.locator("#backend").selectOption("webgl2");
  await page.waitForFunction(
    () => document.getElementById("status")!.dataset.backend === "webgl2",
  );
  assert.equal(await page.locator("#frame").inputValue(), "4");
  await page.locator("#backend").selectOption("canvas2d");
  await page.waitForFunction(
    () => document.getElementById("status")!.dataset.backend === "canvas2d",
  );
  assert.deepEqual(await pixels(), edited);
  const download = page.waitForEvent("download");
  await page.locator("#export-composition").click();
  await (await download).saveAs(join(root, "edited.mp4"));
  const native = join(root, "native.mp4");
  await run(
    process.execPath,
    [
      "--import",
      "tsx",
      resolve("tools/still-shift-cli/src/cli.ts"),
      "comp",
      "render",
      "--input",
      input,
      "--output",
      native,
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  assert.deepEqual(
    await readFile(join(root, "edited.mp4")),
    await readFile(native),
  );
  const decode = join(root, "frame.rgb");
  await run("ffmpeg", [
    "-v",
    "error",
    "-i",
    native,
    "-vf",
    "select=eq(n\\,4)",
    "-frames:v",
    "1",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    decode,
  ]);
  const rgb = await readFile(decode);
  let difference = 0;
  for (let i = 0; i < rgb.length; i++)
    difference += Math.abs(rgb[i]! - edited[Math.floor(i / 3) * 4 + (i % 3)]!);
  assert.ok(
    difference / rgb.length < 3,
    `Decoded preview mean difference ${difference / rgb.length}`,
  );
  await page.locator("#undo").click();
  await page.waitForFunction(
    () =>
      document.getElementById("document-state")!.textContent ===
      "Unsaved motion edits",
  );
  await writeFile(input, JSON.stringify({ ...saved, name: "External change" }));
  await page.waitForFunction(() =>
    document
      .getElementById("edit-message")!
      .textContent!.includes("externally"),
  );
  const draft = await pixels();
  await page.locator("#save-document").click();
  await page.waitForFunction(() =>
    document
      .getElementById("error")!
      .textContent!.includes("comp-edit-conflict"),
  );
  assert.deepEqual(await pixels(), draft);
  await page.locator("#reload-source").click();
  await page.waitForFunction(() =>
    document.getElementById("status")!.textContent!.includes("External change"),
  );
  assert.deepEqual(await pixels(), edited);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.equal(await page.locator("#save-document").isVisible(), true);
  await page.screenshot({ path: join(root, "phone.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: join(root, "desktop.png"), fullPage: true });
  await page
    .locator('[data-layer="box"]')
    .getByRole("button", { name: "Hide", exact: true })
    .click();
  await page.waitForFunction(() =>
    document.getElementById("edit-message")!.textContent!.includes("view-only"),
  );
  await page.locator("#save-document").click();
  await page.waitForFunction(
    () =>
      document.getElementById("status")!.textContent === "JSON source saved.",
  );
  assert.equal(
    JSON.parse(await readFile(input, "utf8")).layers[0].enabled,
    false,
  );
  await app.close();
  const builderInput = join(root, "builder.ts"),
    builderText = `export default ${JSON.stringify(saved)};`;
  await writeFile(builderInput, builderText);
  app = await createProgramPreview(builderInput, { watch: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(app.url);
  await page.waitForFunction(
    () => document.documentElement.dataset.readonly === "true",
  );
  assert.equal(await page.locator("#save-document").isDisabled(), true);
  await page.getByLabel("out ease", { exact: true }).fill("0.2");
  await page.getByLabel("out speed", { exact: true }).fill("0,0");
  await page
    .getByRole("button", { name: "Apply out handle", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.getElementById("document-state")!.textContent ===
      "Unsaved motion edits",
  );
  assert.equal(await readFile(builderInput, "utf8"), builderText);
  assert.match(
    await page.locator("#edited-keys").inputValue(),
    /c\.timeline\(layer\.property/,
  );
  assert.match(await page.locator("#edited-keys").inputValue(), /"ease": 0.2/);
  await writeFile(
    builderInput,
    `export default ${JSON.stringify({ ...saved, name: "Builder changed" })};`,
  );
  await page.waitForFunction(() =>
    document.getElementById("status")!.textContent!.includes("Builder changed"),
  );
  assert.equal(
    await page.locator("#document-state").textContent(),
    "Source unchanged",
  );
  assert.equal(await page.locator("#save-document").isDisabled(), true);
  const pathSource = structuredClone(saved);
  pathSource.name = "Path copy selection";
  pathSource.layers[0]!.masks = [
    {
      id: "cutout",
      mode: "add",
      path: {
        keys: [
          {
            frame: 0,
            value: {
              closed: true,
              vertices: [
                [0, 0],
                [8, 0],
                [8, 8],
                [0, 8],
              ],
            },
          },
          {
            frame: 7,
            value: {
              closed: true,
              vertices: [
                [0, 0],
                [8, 0],
                [8, 8],
                [0, 8],
              ],
            },
          },
        ],
      },
    },
  ];
  await writeFile(
    builderInput,
    `export default ${JSON.stringify(pathSource)};`,
  );
  await page.waitForFunction(() =>
    document
      .getElementById("status")!
      .textContent!.includes("Path copy selection"),
  );
  await page
    .getByRole("button", {
      name: "root / box · masks[cutout].path",
      exact: true,
    })
    .click();
  const copiedPath = await page.locator("#edited-keys").inputValue();
  assert.match(copiedPath, /masks\[cutout\].path/);
  assert.doesNotMatch(copiedPath, /transform.position/);
  assert.equal(await page.locator("#copy-keys").isDisabled(), false);
  const referenceSource = structuredClone(pathSource);
  referenceSource.name = "Separated reference lanes";
  referenceSource.layers[0]!.constraintReference = {
    x: {
      keys: [
        { frame: 0, value: 0 },
        { frame: 7, value: 7 },
      ],
    },
    y: 0,
  };
  await writeFile(
    builderInput,
    `export default ${JSON.stringify(referenceSource)};`,
  );
  await page.waitForFunction(() =>
    document
      .getElementById("status")!
      .textContent!.includes("Separated reference lanes"),
  );
  await page
    .getByRole("button", {
      name: "root / box · constraintReference.x",
      exact: true,
    })
    .click();
  assert.match(
    await page.locator("#edited-keys").inputValue(),
    /constraintReference.x/,
  );
  await page.locator("#edit-key").selectOption("0");
  await page.getByLabel("out ease", { exact: true }).fill("0.6");
  await page.getByLabel("out speed", { exact: true }).fill("2");
  await page
    .getByRole("button", { name: "Apply out handle", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.getElementById("document-state")!.textContent ===
      "Unsaved motion edits",
  );
  assert.match(await page.locator("#edited-keys").inputValue(), /"ease": 0.6/);
  const unkeyed = structuredClone(saved);
  unkeyed.name = "Unkeyed copy reset";
  unkeyed.layers[0]!.transform!.position = [4, 20];
  await writeFile(builderInput, `export default ${JSON.stringify(unkeyed)};`);
  await page.waitForFunction(() =>
    document
      .getElementById("status")!
      .textContent!.includes("Unkeyed copy reset"),
  );
  assert.equal(await page.locator("#edited-keys").inputValue(), "");
  assert.equal(await page.locator("#copy-keys").isDisabled(), true);
  const instanced = structuredClone(source);
  instanced.name = "Resolved instance focus";
  instanced.precomps = [
    {
      id: "shared",
      width: 64,
      height: 64,
      frameCount: 8,
      layers: [structuredClone(source.layers[0]!)],
    },
  ];
  instanced.layers = [
    { id: "first", type: "precomp", comp: "shared" },
    { id: "second", type: "precomp", comp: "shared", startFrame: 2 },
  ];
  await writeFile(builderInput, `export default ${JSON.stringify(instanced)};`);
  await page.waitForFunction(() =>
    document
      .getElementById("status")!
      .textContent!.includes("Resolved instance focus"),
  );
  await page.locator('[data-layer="box"] > button').first().click();
  const instanceSelector = page.getByLabel("Resolved property instance", {
    exact: true,
  });
  await page
    .getByText("Resolved motion in root frames", { exact: true })
    .click();
  await instanceSelector.focus();
  for (const value of [
    "second/box.transform.position",
    "first/box.transform.position",
  ]) {
    await instanceSelector.selectOption(value);
    assert.equal(await instanceSelector.inputValue(), value);
    assert.equal(
      await instanceSelector.evaluate(
        (select) => document.activeElement === select,
      ),
      true,
      "Changing the resolved instance must preserve keyboard focus",
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      status: "passed",
      checks: [
        "desktop edit",
        "undo/redo",
        "invalid-edit rollback",
        "transient visibility",
        "visibility retained across curve edits and undo/redo",
        "overlays",
        "keyboard Bezier graph handles",
        "key and resolved-instance selector focus",
        "lossless source save",
        "backend draft/frame retention",
        "MP4 native byte identity",
        "decoded preview parity",
        "external conflict/reload",
        "phone layout",
        "save applies view visibility",
        "builder edited-key copy/read-only source/hot reload",
      ],
      root,
    }),
  );
} finally {
  await browser?.close();
  await app?.close();
  if (process.env.KEEP_CE11_ARTIFACTS !== "1")
    await rm(root, { recursive: true, force: true });
}
