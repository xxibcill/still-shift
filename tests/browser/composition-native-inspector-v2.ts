import {
  MechanismCameraSchema,
  MechanismTransformSchema,
} from "@still-shift/scene-contract";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderComposition } from "@still-shift/animation-engine";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import { createProgramPreview } from "../../tools/still-shift-cli/src/composition/preview.ts";
import { createNativeCompositionV2ProofFixture } from "./native3d-composition-v2.ts";
const hash = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const { directory, loaded } = await createNativeCompositionV2ProofFixture(
  "/private/tmp/still-shift-ms2-lab2-",
);
const input = join(directory, "composition.json"),
  expected = structuredClone(loaded.composition);
const sourceBytes = await readFile(join(directory, "mechanism.json")),
  legacyBytes = await readFile(join(directory, "solid.json"));
let app: Awaited<ReturnType<typeof createProgramPreview>> | undefined,
  browser: Awaited<ReturnType<typeof launchRenderBrowser>> | undefined;
const records: unknown[] = [],
  errors: string[] = [];
try {
  app = await createProgramPreview(input, { watch: false });
  browser = await launchRenderBrowser();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(
    Number(process.env.STILL_SHIFT_LAB2_TIMEOUT_MS ?? 120000),
  );
  await page.addInitScript("window.__name=(fn)=>fn;");
  page.on("pageerror", (error) => errors.push(error.message));
  const ready = async () => {
    await page.waitForFunction(
      () =>
        document.getElementById("status")?.dataset.backend === "webgl2" &&
        document.getElementById("status")?.dataset.ready &&
        document.getElementById("status")?.dataset.ready !== "error" &&
        !document.querySelector("#inspector-edit")?.hasAttribute("disabled") &&
        !document.getElementById("error")?.textContent,
    );
    assert.deepEqual(errors, []);
    assert.equal(
      await page.locator("#renderer").getAttribute("data-kind"),
      "software",
    );
  };
  const inspect = async () =>
    JSON.parse((await page.locator("#native-inspection").textContent())!);
  const pixels = async (name: string) => {
    const png = Buffer.from(
      await page
        .locator("#preview")
        .evaluate(
          (canvas) =>
            (canvas as HTMLCanvasElement).toDataURL("image/png").split(",")[1]!,
        ),
      "base64",
    );
    assert(png.length > 1000);
    await writeFile(join(directory, name + ".png"), png, { flag: "wx" });
    return hash(png);
  };
  const seek = async (frame: number) => {
    await page.locator("#frame").fill(String(frame));
    await page.locator("#frame").dispatchEvent("input");
    await page.waitForFunction(
      (frame) =>
        document
          .getElementById("time")
          ?.textContent?.includes(`${frame + 1} / 6`),
      frame,
    );
    assert.equal(await page.locator("#error").textContent(), "");
  };
  await page.goto(app.url);
  await ready();
  assert.equal(
    app.snapshot()!.preparedNative3D?.version,
    "composition-prepared-native3d-2",
  );
  await page.locator('[data-layer="world2"] > button').first().click();
  await page.getByLabel("Native part", { exact: true }).selectOption("root");
  await page
    .getByLabel("Native material", { exact: true })
    .selectOption("paint");
  const initial = await inspect();
  assert.equal(initial.sourceVersion, "mechanism-scene-2");
  assert.equal(initial.evaluatedFrames[0].version, "native3d-frame-2");
  assert.equal(initial.sourceSha256, hash(sourceBytes));
  assert.equal(initial.evaluatedFrames[0].sourceFrame, 0.25);
  records.push({
    id: "accepted-source2",
    inspection: initial,
    pixelSha256: await pixels("initial"),
  });
  const seeks = new Map<number, string>();
  let index = 0;
  for (const frame of [0, 1, 2, 3, 5, 4, 3, 2, 1, 0, 2, 0, 3]) {
    await seek(frame);
    const sha256 = await pixels(`seek-${index++}`);
    if (seeks.has(frame))
      assert.equal(
        sha256,
        seeks.get(frame),
        "Random/reverse seeks must reproduce exact actual canvas PNGs",
      );
    else seeks.set(frame, sha256);
    if (frame < 4)
      assert.equal(
        (await inspect()).evaluatedFrames[0].sourceFrame,
        frame + 0.25,
      );
    records.push({ id: "seek", frame, pixelSha256: sha256 });
  }
  await page.evaluate(() => {
    const range = document.getElementById("frame") as HTMLInputElement;
    for (const frame of [0, 3, 1, 2]) {
      range.value = String(frame);
      range.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await page.waitForFunction(() =>
    document.getElementById("time")?.textContent?.includes("3 / 6"),
  );
  assert.equal(await pixels("rapid-latest"), seeks.get(2));
  records.push({
    id: "rapid-seeks-latest",
    frame: 2,
    pixelSha256: seeks.get(2),
  });
  await page.locator('[data-layer="world1"] > button').first().click();
  assert.equal((await inspect()).sourceVersion, "solid-scene-1");
  await page.locator('[data-layer="world2"] > button').first().click();
  await page.getByLabel("Native part", { exact: true }).selectOption("root");
  await page
    .getByLabel("Native material", { exact: true })
    .selectOption("paint");
  const apply = async (name: string) => {
    const prepared = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/composition/program-prepare",
    );
    await page.getByRole("button", { name, exact: true }).click();
    const response = await prepared;
    assert.equal(response.status(), 200);
    const payload = await response.json();
    assert.equal(
      payload.preparedNative3D.version,
      "composition-prepared-native3d-2",
    );
    await ready();
    return payload;
  };
  await page
    .getByLabel("Native camera sample", { exact: true })
    .selectOption({ index: 0 });
  await page.getByLabel("Native camera FOV", { exact: true }).fill("60");
  const camera = await apply("Apply native camera FOV");
  const controller = expected.layers[0]!;
  if (controller.type !== "native3d") throw Error("Fixture controller");
  controller.camera = MechanismCameraSchema.parse({
    ...loaded.native3D!.mechanism!.source.camera,
    fovDegrees: 60,
  });
  const cameraPixels = await pixels("camera");
  assert.notEqual(cameraPixels, seeks.get(2));
  assert.equal((await inspect()).camera.fovDegrees, 60);
  records.push({
    id: "camera-edit",
    pixelSha256: cameraPixels,
    nativeTransport: camera.preparedNative3D.version,
  });
  await page.getByLabel("Native part x", { exact: true }).fill("0.2");
  await apply("Apply native part translation");
  const originalRoot = loaded.native3D!.mechanism!.source.parts.find(
    (part) => part.id === "root",
  )!;
  controller.partOverrides = {
    root: {
      transform: MechanismTransformSchema.parse({
        ...originalRoot.transform,
        position: [0.2, 0, 0],
      }),
    },
  };
  const moved = await inspect(),
    movedPixels = await pixels("part");
  assert.deepEqual(moved.part.transform.position, [0.2, 0, 0]);
  assert.notEqual(moved.sourceKey, initial.sourceKey);
  assert.equal(moved.sourceSha256, initial.sourceSha256);
  assert.notEqual(movedPixels, cameraPixels);
  records.push({
    id: "part-edit",
    inspection: moved,
    pixelSha256: movedPixels,
  });
  await page
    .getByLabel("Native material metalness", { exact: true })
    .fill("0.6");
  await page
    .getByLabel("Native material roughness", { exact: true })
    .fill("0.4");
  const material = await apply("Apply native material");
  controller.materialOverrides = { paint: { metalness: 0.6, roughness: 0.4 } };
  const materialPixels = await pixels("material"),
    materialInspection = await inspect();
  assert.equal(materialInspection.material.metalness, 0.6);
  assert.equal(materialInspection.material.roughness, 0.4);
  assert.notEqual(materialPixels, movedPixels);
  assert.equal(
    material.preparedNative3D.assets.mechanism.sourceSha256,
    hash(sourceBytes),
  );
  records.push({
    id: "material-edit",
    inspection: materialInspection,
    pixelSha256: materialPixels,
  });
  const save = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/composition/program-save",
  );
  await page.locator("#save-document").click();
  const saved = await save,
    payload = await saved.json();
  assert.equal(saved.status(), 200, JSON.stringify(payload));
  assert.equal(
    payload.snapshot.preparedNative3D.version,
    "composition-prepared-native3d-2",
  );
  await page.waitForFunction(
    (revision) =>
      Number(document.getElementById("status")?.dataset.revision) >= revision &&
      document.getElementById("document-state")?.textContent ===
        "Source unchanged",
    payload.snapshot.revision,
  );
  await ready();
  assert.deepEqual(JSON.parse(await readFile(input, "utf8")), expected);
  assert.equal(await pixels("saved"), materialPixels);
  await page.locator("#reload-source").click();
  await ready();
  await page.locator('[data-layer="world2"] > button').first().click();
  assert.equal(await pixels("reloaded"), materialPixels);
  records.push({
    id: "save-and-reload",
    revision: payload.snapshot.revision,
    sourceSha256: hash(await readFile(input)),
    pixelSha256: materialPixels,
  });
  await page.locator("#lint").click();
  await page.waitForFunction(() =>
    document
      .getElementById("status")
      ?.textContent?.startsWith("Motion checks complete:"),
  );
  assert(
    String(await page.locator("#lint-summary").textContent()).includes(
      "pixels and state checked",
    ),
  );
  records.push({
    id: "all-frame-rendered-qa",
    frames: 6,
    summary: await page.locator("#lint-summary").textContent(),
  });
  await seek(0);
  await page.locator("#play").click();
  await page.waitForFunction(
    () =>
      document.getElementById("time")?.textContent?.includes("6 / 6") &&
      document.getElementById("play")?.textContent === "Play",
  );
  assert.deepEqual(errors, []);
  const result = await renderComposition({
    compositionPath: input,
    outputPath: join(directory, "saved2.mp4"),
    backend: "webgl2",
    transport: "raw_rgba",
  });
  assert.equal(
    result.metrics.nativeObservations?.version,
    "native-observation-closure-2",
  );
  assert.equal(result.metrics.nativeObservations?.outputFrames, 6);
  assert.equal(result.metrics.nativeObservations?.passCount, 36);
  assert.equal(
    hash(await readFile(result.outputPath)),
    result.checksums.output,
  );
  assert.deepEqual(
    await readFile(join(directory, "mechanism.json")),
    sourceBytes,
  );
  assert.deepEqual(await readFile(join(directory, "solid.json")), legacyBytes);
  await page.screenshot({
    path: join(directory, "final-ui.png"),
    fullPage: true,
  });
  await writeFile(
    join(directory, "run.json"),
    JSON.stringify(
      {
        status: "passed",
        scope:
          "actual-lab2-mixed-generic-fixture-ui-save-reload-playback-rendered-qa-and-final-export",
        records,
        result,
        errors,
        supportedPacks: 0,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  process.stdout.write(
    JSON.stringify({ directory, status: "passed", records: records.length }) +
      "\n",
  );
} catch (error) {
  await writeFile(
    join(directory, "failure.json"),
    JSON.stringify(
      {
        status: "failed",
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
        records,
        errors,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  process.stderr.write(
    JSON.stringify({ directory, status: "failed", records: records.length }) +
      "\n",
  );
  throw error;
} finally {
  await browser?.close();
  await app?.close();
}
