import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { inflateSync } from "node:zlib";
import type { Browser, Page } from "playwright";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import {
  CompositionSchema,
  type CompositionPreparedNative3D,
} from "@still-shift/scene-contract";
import { canonicalMechanismJson } from "../../packages/renderer-core/src/mechanism/canonical.ts";
import { createProgramPreview } from "../../tools/still-shift-cli/src/composition/preview.ts";
import { nativeSolidFixture } from "../helpers/native3d-fixture.ts";

const execute = promisify(execFile);
const checksum = (bytes: Uint8Array | string) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");
type Inspection = {
  method: string;
  controller: string;
  asset: string;
  sourceKey: string;
  sourceSha256: string;
  part: {
    id: string;
    transform: {
      position: [number, number, number];
      rotation: [number, number, number];
      scale: [number, number, number];
      pivot: [number, number, number];
    };
  };
  material: { id: string; metalness: number; roughness: number };
  anchor: { id: string; part: string };
  cameraKeys: { frame: number; fovDegrees?: number }[];
  label?: { id: string; text: string; states?: string[] };
  evaluatedFrames: {
    scope: string;
    sourceFrame: number;
    sourceKey: string;
    camera: { fovDegrees: number };
    part: { localMatrix: number[] };
    anchor: { visibility: string };
  }[];
  textSamples: {
    scope: string;
    state?: number;
    stateFrom?: number;
    stateMix?: number;
    visible: boolean;
  }[];
};

/** Reconstruct browser PNG scanlines independently of GL and the renderer. */
function pngPixels(png: Buffer, width: number, height: number) {
  assert(
    png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  );
  let header: Buffer | undefined,
    ended = false,
    position = 8,
    count = 0;
  const idat: Buffer[] = [];
  while (position < png.length) {
    assert(++count < 4096 && position + 12 <= png.length);
    const length = png.readUInt32BE(position),
      end = position + length + 12;
    assert(end <= png.length);
    const kind = png.toString("ascii", position + 4, position + 8),
      data = png.subarray(position + 8, end - 4);
    let crc = 0xffffffff;
    for (const value of png.subarray(position + 4, end - 4)) {
      crc ^= value;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    assert.equal((crc ^ 0xffffffff) >>> 0, png.readUInt32BE(end - 4));
    if (kind === "IHDR") {
      assert(!header && length === 13);
      header = data;
    }
    if (kind === "IDAT") idat.push(data);
    position = end;
    if (kind === "IEND") {
      assert.equal(position, png.length);
      ended = true;
      break;
    }
  }
  assert(header && ended && idat.length);
  assert.deepEqual(
    [header.readUInt32BE(0), header.readUInt32BE(4)],
    [width, height],
  );
  assert(
    header[8] === 8 &&
      [2, 6].includes(header[9]!) &&
      header[10] === 0 &&
      header[11] === 0 &&
      header[12] === 0,
  );
  const channels = header[9] === 6 ? 4 : 3,
    stride = width * channels,
    rows = inflateSync(Buffer.concat(idat), {
      maxOutputLength: (stride + 1) * height,
    }),
    pixels = Buffer.alloc(width * height * 4);
  assert.equal(rows.length, (stride + 1) * height);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = rows[y * (stride + 1)]!,
      row = Buffer.alloc(stride);
    assert(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? row[x - channels]! : 0,
        b = previous[x]!,
        c = x >= channels ? previous[x - channels]! : 0,
        p = a + b - c,
        pa = Math.abs(p - a),
        pb = Math.abs(p - b),
        pc = Math.abs(p - c),
        predictor = [
          0,
          a,
          b,
          Math.floor((a + b) / 2),
          pa <= pb && pa <= pc ? a : pb <= pc ? b : c,
        ][filter]!;
      row[x] = (rows[y * (stride + 1) + x + 1]! + predictor) & 255;
    }
    for (let x = 0; x < width; x++) {
      const from = x * channels;
      pixels.set(
        [
          row[from]!,
          row[from + 1]!,
          row[from + 2]!,
          channels === 4 ? row[from + 3]! : 255,
        ],
        (y * width + x) * 4,
      );
    }
    previous = row;
  }
  return pixels;
}

/** Actual native controls and UI Save/reload; eight small frames, no E01 or readability substitution. */
export async function verifyNativeCompositionInspector(
  options: { directory?: string; timeoutMs?: number } = {},
) {
  const root = resolve(import.meta.dirname, "../.."),
    directory = options.directory
      ? resolve(options.directory)
      : await mkdtemp("/private/tmp/composition-native-inspector-"),
    timeout = options.timeoutMs ?? 120000;
  assert(Number.isInteger(timeout) && timeout >= 1000 && timeout <= 300000);
  if (options.directory) await mkdir(directory, { recursive: false });
  const helperBytes = await readFile(import.meta.filename),
    checkpoint = (
      await execute("git", ["rev-parse", "HEAD"], {
        cwd: root,
        maxBuffer: 65536,
      })
    ).stdout.trim();
  await writeFile(join(directory, "executed-helper.ts"), helperBytes, {
    flag: "wx",
  });
  const input = join(directory, "source.json"),
    scenePath = join(directory, "solid.json"),
    fontPath = join(root, "assets/story-motion/fonts/plex-sans-semibold.ttf"),
    source = nativeSolidFixture();
  const sceneBytes = Buffer.from(JSON.stringify(source, null, 2) + "\n"),
    sceneSha256 = checksum(sceneBytes),
    fontSha256 = checksum(await readFile(fontPath));
  await writeFile(scenePath, sceneBytes, { flag: "wx" });
  const recipe = CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "native-inspector",
    name: "Native physical inspector",
    width: 256,
    height: 192,
    fps: 30,
    frameCount: 8,
    background: "#182030",
    assets: [
      {
        id: "solid",
        type: "native3d",
        format: "solid-scene-1",
        path: scenePath,
        sha256: sceneSha256,
      },
      {
        id: "font",
        type: "font",
        path: fontPath,
        sha256: fontSha256,
        weight: "600",
        style: "normal",
      },
    ],
    layers: [
      {
        id: "world",
        type: "native3d",
        asset: "solid",
        transform: {
          anchor: [0, 0],
          position: [0, 0],
          scale: [1, 1],
          rotation: 0,
          opacity: 1,
        },
        sourceStartFrame: 0,
        sourceFps: 30,
        cameraKeys: [
          {
            frame: 0,
            position: [0, 0, 10],
            target: [0, 0, 0],
            fovDegrees: 60,
            easing: "linear",
          },
          { frame: 7, position: [0, 0, 10], target: [0, 0, 0], easing: "hold" },
        ],
      },
      {
        id: "annotation",
        type: "group",
        size: [150, 35],
        // This visibility-only group retains ordinary placement. Its explicit
        // origin keeps child coordinates in owning-scope output pixels.
        transform: { anchor: [0, 0], position: [0, 0] },
        overlayAfter: "world",
        native3D: {
          role: "screen-anchor",
          sceneLayer: "world",
          anchor: "face",
          visibilityPolicy: "hide-occluded",
          target: { kind: "visibility" },
        },
      },
      {
        id: "label",
        type: "text",
        parent: "annotation",
        text: "BASE COPY",
        states: [" ", "PULL"],
        state: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 2, value: 1 },
          ],
        },
        fontAsset: "font",
        fontSize: 22,
        color: "#ffffff",
        align: "left",
        transform: { anchor: [0, 0], position: [12, 140] },
      },
      {
        id: "leader",
        type: "shape",
        parent: "annotation",
        native3D: {
          role: "screen-anchor",
          sceneLayer: "world",
          anchor: "face",
          visibilityPolicy: "hide-occluded",
          target: {
            kind: "path-endpoint",
            contentId: "line",
            endpoint: "last",
          },
        },
        contents: [
          {
            id: "line",
            type: "path",
            path: {
              closed: false,
              vertices: [
                [78, 147],
                [78, 147],
              ],
            },
          },
          { id: "stroke", type: "stroke", color: "#ffffff", width: 1 },
        ],
      },
    ],
  });
  await writeFile(input, JSON.stringify(recipe, null, 2) + "\n", {
    flag: "wx",
  });
  let app: Awaited<ReturnType<typeof createProgramPreview>> | undefined,
    browser: Browser | undefined,
    page: Page | undefined;
  const records: unknown[] = [],
    envelopes: unknown[] = [],
    errors: string[] = [],
    tasks = new Set<Promise<void>>();
  let responseError: unknown,
    envelopeBytes = 0,
    pixelBytes = 0;
  const evidence: Record<string, unknown> = {
    version: "native-composition-inspector-proof-1",
    status: "running",
    directory,
    startedAt: new Date().toISOString(),
    implementationSource: {
      checkpoint,
      helper: "tests/browser/composition-native-inspector.ts",
      helperSha256: checksum(helperBytes),
      executedHelperPath: join(directory, "executed-helper.ts"),
    },
    fixture: {
      width: 256,
      height: 192,
      fps: 30,
      frames: 8,
      sourceSha256: sceneSha256,
      geometrySha256: source.geometrySha256,
      meshDataSha256: checksum(
        canonicalMechanismJson({ meshes: source.geometry.meshes }),
      ),
      fontSha256,
    },
    bounds: {
      capturedFrames: 7,
      simultaneouslyCapturedEnvelopes: 2,
      envelopeCount: 24,
      envelopeBytes: 16777216,
      pixelBytes: 4194304,
    },
    assertions:
      "Actual UI controls, current prepared transport, sampled evaluator context, real PNG/readback, revision-aware UI Save and UI reload",
    gpuObservation:
      "unassessed-in-Lab; inspector states are explicitly pure evaluator samples",
    overallReadability: "unassessed",
    humanVisualListeningAcceptance: "pending",
    fullE01Acceptance: "separate",
    records,
    envelopes,
    errors,
  };
  const retain = async () => {
    await writeFile(
      join(directory, "evidence.json"),
      JSON.stringify(evidence, null, 2) + "\n",
    );
  };
  const inspect = async () =>
    JSON.parse(
      (await page!.locator("#native-inspection").textContent()) ?? "null",
    ) as Inspection;
  const ready = () =>
    page!.waitForFunction(
      () =>
        document.getElementById("status")?.dataset.backend === "webgl2" &&
        document.getElementById("status")?.dataset.ready &&
        document.getElementById("status")?.dataset.ready !== "error" &&
        !document.querySelector("#inspector-edit")?.hasAttribute("disabled") &&
        !document.getElementById("error")?.textContent,
    );
  const assertReady = async () => {
    await ready();
    assert.equal(
      await page!.locator("#renderer").getAttribute("data-kind"),
      "software",
    );
    assert(
      !String(await page!.locator("#lint-summary").textContent()).includes(
        "unavailable",
      ),
    );
    assert.deepEqual(errors, []);
    if (responseError) throw responseError;
  };
  const capture = async (name: string, previous?: string) => {
    const value = await page!.evaluate(() => {
      const canvas = document.getElementById("preview") as HTMLCanvasElement,
        gl = canvas.getContext("webgl2");
      if (!gl) throw Error("Actual native WebGL2 canvas unavailable");
      const framebuffer = gl.getParameter(
          gl.READ_FRAMEBUFFER_BINDING,
        ) as WebGLFramebuffer | null,
        readBuffer = gl.getParameter(gl.READ_BUFFER) as number,
        buffer = gl.getParameter(
          gl.PIXEL_PACK_BUFFER_BINDING,
        ) as WebGLBuffer | null,
        alignment = gl.getParameter(gl.PACK_ALIGNMENT) as number,
        rowLength = gl.getParameter(gl.PACK_ROW_LENGTH) as number,
        skipRows = gl.getParameter(gl.PACK_SKIP_ROWS) as number,
        skipPixels = gl.getParameter(gl.PACK_SKIP_PIXELS) as number,
        pixels = new Uint8Array(canvas.width * canvas.height * 4);
      try {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.readBuffer(gl.BACK);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
        gl.pixelStorei(gl.PACK_ROW_LENGTH, 0);
        gl.pixelStorei(gl.PACK_SKIP_ROWS, 0);
        gl.pixelStorei(gl.PACK_SKIP_PIXELS, 0);
        gl.finish();
        gl.readPixels(
          0,
          0,
          canvas.width,
          canvas.height,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixels,
        );
        if (gl.getError() !== gl.NO_ERROR)
          throw Error("Actual native canvas readback failed");
      } finally {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
        gl.readBuffer(readBuffer);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
        gl.pixelStorei(gl.PACK_ALIGNMENT, alignment);
        gl.pixelStorei(gl.PACK_ROW_LENGTH, rowLength);
        gl.pixelStorei(gl.PACK_SKIP_ROWS, skipRows);
        gl.pixelStorei(gl.PACK_SKIP_PIXELS, skipPixels);
      }
      let binary = "";
      for (let at = 0; at < pixels.length; at += 0x8000)
        binary += String.fromCharCode(...pixels.subarray(at, at + 0x8000));
      return {
        width: canvas.width,
        height: canvas.height,
        rawBottomFirst: btoa(binary),
        png: canvas.toDataURL("image/png").split(",")[1]!,
        time: document.getElementById("time")!.textContent,
        revision: document.getElementById("status")!.dataset.revision,
        inspection: document.getElementById("native-inspection")!.textContent!,
        lint: document.getElementById("lint-summary")!.textContent,
      };
    });
    assert.deepEqual([value.width, value.height], [256, 192]);
    assert(value.time?.includes("4 / 8"));
    const raw = Buffer.from(value.rawBottomFirst, "base64"),
      rgba = Buffer.alloc(raw.length),
      stride = value.width * 4,
      png = Buffer.from(value.png, "base64");
    assert.equal(raw.length, value.width * value.height * 4);
    for (let y = 0; y < value.height; y++)
      raw.copy(
        rgba,
        y * stride,
        (value.height - y - 1) * stride,
        (value.height - y) * stride,
      );
    // Preserve the actual bytes before any pixel acceptance assertion. A failed
    // edit must retain its own frame rather than only the preceding good state.
    await writeFile(join(directory, name + ".png"), png, { flag: "wx" });
    await writeFile(join(directory, name + ".rgba"), rgba, { flag: "wx" });
    const pngDecodedExactly = pngPixels(png, value.width, value.height).equals(
      rgba,
    );
    pixelBytes += rgba.length + png.length;
    assert(pixelBytes <= 4194304);
    const sha256 = checksum(rgba),
      labelRegion = { left: 12, top: 140, right: 110, bottom: 170 },
      labelPixels: number[] = [];
    let labelInkPixels = 0;
    for (let y = labelRegion.top; y < labelRegion.bottom; y++)
      for (let x = labelRegion.left; x < labelRegion.right; x++) {
        const at = (y * value.width + x) * 4;
        labelPixels.push(...rgba.subarray(at, at + 4));
        if (
          rgba[at]! >= 230 &&
          rgba[at + 1]! >= 230 &&
          rgba[at + 2]! >= 230 &&
          rgba[at + 3]! >= 230
        )
          labelInkPixels++;
      }
    const record = {
      name,
      pixelSha256: sha256,
      pngSha256: checksum(png),
      bytes: rgba.length,
      pngDecodedExactly,
      labelRegion,
      labelRegionSha256: checksum(Uint8Array.from(labelPixels)),
      labelInkPixels,
      pixelEncoding: "rgba8-straight-top-first",
      time: value.time,
      revision: value.revision,
      currentEvaluation: JSON.parse(value.inspection) as Inspection,
      lint: value.lint,
    };
    records.push(record);
    await retain();
    assert(
      pngDecodedExactly,
      "Independent PNG scanline reconstruction equals actual GL output after explicit row order conversion",
    );
    // This small region contains the declared white label. The one-pixel leader
    // alone cannot satisfy the ink bound; a culled label cannot pass silently.
    assert(labelInkPixels >= 64, `${name} must retain visible label ink`);
    if (previous)
      assert.notEqual(sha256, previous, `${name} must alter actual Lab pixels`);
    process.stdout.write(
      JSON.stringify({
        event: "native-Lab-state",
        name,
        pixelSha256: sha256,
        directory,
      }) + "\n",
    );
    return record;
  };
  await retain();
  try {
    const builderPath = join(directory, "program.ts"),
      builtPath = join(directory, "builder.json"),
      cliCommands = [
        ["comp", "export-json", "--input", builderPath, "--output", builtPath],
        ["comp", "validate", "--input", builtPath],
      ];
    await writeFile(
      builderPath,
      `import { comp, layer } from "@still-shift/motion";\nconst recipe = ${JSON.stringify(recipe)};\nconst { schemaVersion, frameCount, assets, layers, ...options } = recipe;\nexport default comp({ ...options, frames: frameCount }, (c) => { for (const asset of assets) c.asset(asset); for (const value of layers) c.add(layer(value)); });\n`,
      { flag: "wx" },
    );
    for (const [index, command] of cliCommands.entries()) {
      try {
        const result = await execute(
          "pnpm",
          ["--silent", "still-shift", ...command],
          { cwd: root, timeout, maxBuffer: 1048576 },
        );
        await writeFile(join(directory, `cli-${index}.stdout`), result.stdout);
        await writeFile(join(directory, `cli-${index}.stderr`), result.stderr);
      } catch (error) {
        const result = error as Error & { stdout?: string; stderr?: string };
        await writeFile(
          join(directory, `cli-${index}.stdout`),
          result.stdout ?? "",
        );
        await writeFile(
          join(directory, `cli-${index}.stderr`),
          result.stderr ?? "",
        );
        throw error;
      }
    }
    const built = CompositionSchema.parse(
      JSON.parse(await readFile(builtPath, "utf8")),
    );
    assert.deepEqual(
      built.layers.filter((layer) => layer.type === "native3d"),
      recipe.layers.filter((layer) => layer.type === "native3d"),
    );
    evidence.builderCli = {
      commands: cliCommands,
      compiledSha256: checksum(await readFile(builtPath)),
      nativeControllerCount: 1,
    };
    app = await createProgramPreview(input, { watch: false });
    const expected = structuredClone(app.snapshot()!.document!);
    browser = await launchRenderBrowser();
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);
    await page.addInitScript("window.__name=(fn)=>fn;");
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });
    page.on("response", (response) => {
      const path = new URL(response.url()).pathname;
      if (
        ![
          "/composition/program",
          "/composition/program-prepare",
          "/composition/program-save",
        ].includes(path)
      )
        return;
      if (tasks.size >= 2) {
        responseError = Error("More than two pending native response bodies");
        return;
      }
      const task = (async () => {
        assert(envelopes.length < 24);
        const index = envelopes.length,
          row: Record<string, unknown> = {
            index,
            path,
            status: response.status(),
          };
        envelopes.push(row);
        const body = await response.body();
        envelopeBytes += body.length;
        assert(body.length < 1048576 && envelopeBytes <= 16777216);
        const payload = JSON.parse(body.toString("utf8")) as {
            snapshot?: {
              preparedNative3D?: CompositionPreparedNative3D;
              nativeAppearanceCodeSha256?: string;
            };
            preparedNative3D?: CompositionPreparedNative3D;
            nativeAppearanceCodeSha256?: string;
          },
          snapshot = payload.snapshot ?? payload;
        await writeFile(join(directory, `envelope-${index}.json`), body, {
          flag: "wx",
        });
        if (response.ok() && snapshot.preparedNative3D) {
          const actual = snapshot.preparedNative3D.assets.solid!;
          assert.equal(actual.sourceSha256, sceneSha256);
          assert.equal(actual.source.geometrySha256, source.geometrySha256);
          assert.equal(
            checksum(
              canonicalMechanismJson({ meshes: actual.source.geometry.meshes }),
            ),
            checksum(
              canonicalMechanismJson({ meshes: source.geometry.meshes }),
            ),
          );
        }
        Object.assign(row, {
          bodySha256: checksum(body),
          bytes: body.length,
          nativeTransport: snapshot.preparedNative3D?.version ?? null,
          appearanceCodeSha256: snapshot.nativeAppearanceCodeSha256 ?? null,
        });
      })()
        .catch((error: unknown) => {
          responseError = error;
        })
        .finally(() => tasks.delete(task));
      tasks.add(task);
    });
    await page.goto(app.url);
    await assertReady();
    await page.locator("#frame").fill("3");
    await page.locator("#frame").dispatchEvent("input");
    await page.waitForFunction(() =>
      document.getElementById("time")?.textContent?.includes("4 / 8"),
    );
    await page.locator('[data-layer="world"] > button').first().click();
    await page.getByLabel("Native part", { exact: true }).selectOption("root");
    await page
      .getByLabel("Native material", { exact: true })
      .selectOption("paint");
    await page
      .getByLabel("Native anchor", { exact: true })
      .selectOption("face");
    const baselineContext = await inspect();
    assert.equal(
      baselineContext.method,
      "pure-native-evaluator-current-ready-catalogue",
    );
    assert.equal(baselineContext.sourceSha256, sceneSha256);
    assert.equal(baselineContext.part.id, "root");
    assert.equal(baselineContext.material.id, "paint");
    assert.equal(baselineContext.anchor.id, "face");
    assert.equal(baselineContext.evaluatedFrames.length, 1);
    assert.equal(baselineContext.evaluatedFrames[0]!.sourceFrame, 3);
    assert.equal(
      baselineContext.evaluatedFrames[0]!.anchor.visibility,
      "visible",
    );
    await page.locator("#overlay-paths").check();
    await page.locator("#overlay-safe").check();
    await page.locator("#overlay-safe").uncheck();
    await page.locator("#overlay-paths").uncheck();
    assert.deepEqual(errors, []);
    let previous = await capture("baseline");
    await page
      .getByLabel("Native camera sample", { exact: true })
      .selectOption({ index: 1 });
    await page.getByLabel("Native camera FOV", { exact: true }).fill("50");
    await page
      .getByRole("button", { name: "Apply native camera FOV", exact: true })
      .click();
    await assertReady();
    const controller = expected.layers[0]!;
    if (controller.type !== "native3d") throw Error("native controller");
    controller.cameraKeys![0]!.fovDegrees = 50;
    assert.equal((await inspect()).cameraKeys[0]!.fovDegrees, 50);
    previous = await capture("camera", previous.pixelSha256);
    const partBefore = (await inspect()).part;
    await page.getByLabel("Native part z", { exact: true }).fill("0.4");
    await page
      .getByRole("button", {
        name: "Apply native part translation",
        exact: true,
      })
      .click();
    await assertReady();
    controller.partOverrides = {
      root: { transform: { ...partBefore.transform, position: [0, 0, 0.4] } },
    };
    assert.deepEqual((await inspect()).part.transform.position, [0, 0, 0.4]);
    previous = await capture("part", previous.pixelSha256);
    await page
      .getByLabel("Native material metalness", { exact: true })
      .fill("0.8");
    await page
      .getByLabel("Native material roughness", { exact: true })
      .fill("0.15");
    await page
      .getByRole("button", { name: "Apply native material", exact: true })
      .click();
    await assertReady();
    controller.materialOverrides = {
      paint: { metalness: 0.8, roughness: 0.15 },
    };
    const material = (await inspect()).material;
    assert.equal(material.metalness, 0.8);
    assert.equal(material.roughness, 0.15);
    previous = await capture("material", previous.pixelSha256);
    const materialLabelRegionSha256 = previous.labelRegionSha256;
    await page.locator('[data-layer="label"] > button').first().click();
    const copy = await inspect();
    assert.equal(copy.textSamples[0]!.state, 1);
    assert.equal(copy.textSamples[0]!.visible, true);
    assert.equal(
      await page.getByLabel("Native label copy", { exact: true }).inputValue(),
      "state 1",
    );
    await page.getByLabel("Native label text", { exact: true }).fill("PULL!");
    await page
      .getByRole("button", { name: "Apply native label text", exact: true })
      .click();
    await assertReady();
    const label = expected.layers[2]!;
    if (label.type !== "text") throw Error("native label");
    label.states![1] = "PULL!";
    assert.deepEqual((await inspect()).label!.states, [" ", "PULL!"]);
    assert.equal((await inspect()).label!.text, "BASE COPY");
    previous = await capture("label", previous.pixelSha256);
    assert.notEqual(
      previous.labelRegionSha256,
      materialLabelRegionSha256,
      "The selected visible text-state edit must change actual label-region pixels",
    );
    const saveResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/composition/program-save",
    );
    await page.locator("#save-document").click();
    const saved = await saveResponse,
      savedPayload = (await saved.json()) as {
        snapshot: {
          revision: number;
          preparedNative3D?: CompositionPreparedNative3D;
        };
        diagnostics: unknown[];
      };
    await writeFile(
      join(directory, "save-response.json"),
      JSON.stringify(savedPayload, null, 2),
    );
    assert.equal(saved.status(), 200, JSON.stringify(savedPayload));
    assert(savedPayload.snapshot.preparedNative3D);
    await page.waitForFunction(
      (revision) =>
        Number(document.getElementById("status")?.dataset.revision) >=
          revision &&
        document.getElementById("document-state")?.textContent ===
          "Source unchanged" &&
        !document.querySelector("#inspector-edit")?.hasAttribute("disabled"),
      savedPayload.snapshot.revision,
    );
    await assertReady();
    assert.deepEqual(JSON.parse(await readFile(input, "utf8")), expected);
    const afterSave = await capture("saved");
    assert.equal(afterSave.pixelSha256, previous.pixelSha256);
    await page.locator("#reload-source").click();
    await assertReady();
    await page.locator('[data-layer="label"] > button').first().click();
    const afterReload = await capture("reloaded");
    assert.equal(afterReload.pixelSha256, previous.pixelSha256);
    assert.deepEqual((await inspect()).label!.states, [" ", "PULL!"]);
    await Promise.all(tasks);
    if (responseError) throw responseError;
    assert(
      envelopes.some(
        (value) =>
          (value as { path: string; nativeTransport: string }).path ===
            "/composition/program-save" &&
          (value as { nativeTransport: string }).nativeTransport ===
            "composition-prepared-native3d-1",
      ),
    );
    assert.equal(checksum(await readFile(scenePath)), sceneSha256);
    assert.equal(checksum(await readFile(fontPath)), fontSha256);
    assert.deepEqual(errors, []);
    evidence.status = "passed";
    evidence.savedRecipeSha256 = checksum(await readFile(input));
    process.stdout.write(
      JSON.stringify({
        event: "native-Lab-proof-passed",
        directory,
        actualCanvasStates: records.length,
      }) + "\n",
    );
  } catch (error) {
    evidence.status = "failed";
    evidence.failure = {
      message: String(error instanceof Error ? error.message : error),
      stack: error instanceof Error ? error.stack : undefined,
    };
    throw error;
  } finally {
    if (page) {
      try {
        await page.screenshot({
          path: join(directory, "final-ui.png"),
          fullPage: true,
          timeout: 15000,
        });
      } catch (error) {
        evidence.screenshotFailure = String(error);
      }
    }
    const cleanupErrors: string[] = [];
    try {
      await browser?.close();
    } catch (error) {
      cleanupErrors.push(String(error));
    }
    try {
      await app?.close();
    } catch (error) {
      cleanupErrors.push(String(error));
    }
    await Promise.allSettled(tasks);
    if (responseError) evidence.responseFailure = String(responseError);
    if (cleanupErrors.length) evidence.cleanupErrors = cleanupErrors;
    evidence.finishedAt = new Date().toISOString();
    await retain();
  }
  return {
    directory,
    evidencePath: join(directory, "evidence.json"),
    actualCanvasStates: records.length,
  };
}
