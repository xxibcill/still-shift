import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { format } from "prettier";
import type { Page } from "playwright";
import {
  loadComposition,
  renderComposition,
} from "@still-shift/animation-engine";
import {
  assertPinnedRenderEnvironment,
  probeRenderEnvironment,
} from "@still-shift/execution-runtime";
import { ffmpegArguments } from "@still-shift/execution-runtime/export";
import { createProgramPreview } from "../../tools/still-shift-cli/src/composition/preview.ts";
import {
  shapeReference,
  shapeAnimation,
} from "../../scripts/composition/shape-fixtures.ts";
import type { Composition, PreparedPath } from "@still-shift/scene-contract";
import type * as LegacyPath from "../../packages/renderer-core/src/prepared-path-renderer.ts";
import { shapeHardwarePreview } from "./shape-hardware.ts";
import type * as Render from "../../packages/renderer-core/src/index.ts";

const digest = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");

/** CE5 has its own new baseline; this never writes any frozen CE0 baseline. */
export async function runShapeAcceptance(
  page: Page,
  root: string,
  proof: string,
) {
  const environment = await probeRenderEnvironment(page);
  assertPinnedRenderEnvironment(environment);
  const baselineDirectory = join(root, "tests/visual/composition-shapes"),
    baselinePath = join(
      baselineDirectory,
      `${environment.platform}-${environment.arch}.json`,
    ),
    writing = process.argv.includes("--write-ce5-baseline");
  const fixtures = [
    ["reference-sheet", shapeReference()],
    ["animation", shapeAnimation()],
    [
      "core",
      JSON.parse(
        await readFile(
          join(root, "benchmarks/fixtures/composition/ce5/core.json"),
          "utf8",
        ),
      ) as Composition,
    ],
  ] as const;
  const items: Record<
    string,
    { source: string; canvas2d: string[]; webgl2: string[] }
  > = {};
  const reports: unknown[] = [];
  const directory = await mkdtemp(join(tmpdir(), "ce5-native-export-"));
  try {
    for (const [name, doc] of fixtures) {
      const sourcePath = join(
        root,
        `benchmarks/fixtures/composition/ce5/${name}.json`,
      );
      assert.deepEqual(
        JSON.parse(await readFile(sourcePath, "utf8")),
        doc,
        `${name}: fixture generation drift`,
      );
      const result = await page.evaluate(
        async ({ json, encode }: { json: string; encode: boolean }) => {
          const doc = JSON.parse(json) as Composition,
            url = "/packages/renderer-core/src/index.ts",
            m = (await import(url)) as typeof Render,
            canvases = [
              document.createElement("canvas"),
              document.createElement("canvas"),
            ],
            previews = canvases.map((canvas, i) =>
              m.createCompositionPreview(
                canvas,
                doc,
                { images: new Map(), fonts: new Map() },
                { backend: i ? "webgl2" : "canvas2d" },
              ),
            ),
            hashes: [string[], string[]] = [[], []],
            pngs: [string[], string[]] = [[], []],
            samples: Record<string, string> = {};
          let maxDelta = 0,
            minPsnr = 999;
          const hash = async (bytes: Uint8ClampedArray) =>
            Array.from(
              new Uint8Array(
                await crypto.subtle.digest("SHA-256", bytes.slice().buffer),
              ),
            )
              .map((byte) => byte.toString(16).padStart(2, "0"))
              .join("");
          try {
            for (const reverse of [false, true])
              for (let n = 0; n < doc.frameCount; n++) {
                const frame = reverse ? doc.frameCount - 1 - n : n;
                previews.forEach((preview) => preview.renderFrame(frame));
                const pixels = previews.map((preview) => preview.readPixels()),
                  metrics = m.compareFrames(
                    pixels[0]!,
                    pixels[1]!,
                    doc.width,
                    doc.height,
                  );
                if (!m.meetsTier(metrics, "near"))
                  throw Error(`${doc.id}/${frame}: ${JSON.stringify(metrics)}`);
                maxDelta = Math.max(maxDelta, metrics.maxChannelDelta);
                minPsnr = Math.min(
                  minPsnr,
                  Number.isFinite(metrics.psnr) ? metrics.psnr : 999,
                );
                for (const i of [0, 1]) {
                  const value = await hash(pixels[i]!);
                  if (reverse && hashes[i]![frame] !== value)
                    throw Error(`${doc.id}/${frame}: reverse ${i}`);
                  if (!reverse) {
                    hashes[i]!.push(value);
                    if (encode)
                      pngs[i]!.push(
                        canvases[i]!.toDataURL("image/png").split(",")[1]!,
                      );
                  }
                }
                if (
                  !reverse &&
                  [
                    0,
                    Math.floor(doc.frameCount / 2),
                    doc.frameCount - 1,
                  ].includes(frame)
                )
                  samples[String(frame)] = canvases[0]!
                    .toDataURL("image/png")
                    .split(",")[1]!;
              }
          } finally {
            previews.forEach((preview) => preview.dispose());
          }
          return { hashes, pngs, samples, maxDelta, minPsnr };
        },
        { json: JSON.stringify(doc), encode: name === "animation" },
      );
      items[name] = {
        source: digest(JSON.stringify(doc)),
        canvas2d: result.hashes[0],
        webgl2: result.hashes[1],
      };
      reports.push({
        fixture: name,
        frames: doc.frameCount,
        reverseFrames: doc.frameCount,
        maxDelta: result.maxDelta,
        minPsnr: result.minPsnr,
      });
      if (writing) {
        await mkdir(baselineDirectory, { recursive: true });
        for (const [frame, png] of Object.entries(result.samples))
          await writeFile(
            join(baselineDirectory, `${name}-${frame}.png`),
            Buffer.from(png, "base64"),
          );
      }
      if (name !== "animation") continue;
      for (const [index, backend] of (
        ["canvas2d", "webgl2"] as const
      ).entries()) {
        const output = join(directory, `${backend}.mp4`),
          exported = await renderComposition({
            compositionPath: sourcePath,
            outputPath: output,
            backend,
          }),
          raw = await renderComposition({
            compositionPath: sourcePath,
            outputPath: join(directory, `${backend}-raw.mp4`),
            backend,
            transport: "raw_rgba",
          }),
          loaded = await loadComposition(sourcePath, backend),
          previewOutput = join(directory, `${backend}-preview.mp4`);
        assert.equal(
          raw.checksums.output,
          exported.checksums.output,
          `${backend}: raw/PNG transport`,
        );
        await new Promise<void>((accept, reject) => {
          const encoder = spawn(
            "ffmpeg",
            ffmpegArguments(loaded.scene, previewOutput, "libx264", "png_pipe"),
            { stdio: ["pipe", "ignore", "pipe"] },
          );
          let errors = "";
          encoder.stderr.on("data", (chunk) => {
            errors += String(chunk);
          });
          encoder.on("error", reject);
          encoder.stdin.on("error", reject);
          encoder.on("close", (code) =>
            code === 0 ? accept() : reject(Error(`ffmpeg ${code}: ${errors}`)),
          );
          for (const png of result.pngs[index]!)
            encoder.stdin.write(Buffer.from(png, "base64"));
          encoder.stdin.end();
        });
        assert.equal(
          digest(await readFile(previewOutput)),
          digest(await readFile(output)),
          `${backend}: independently encoded preview/export`,
        );
        reports.push({
          backend,
          exportedFrames: exported.frameCount,
          independentMp4: "byte-identical",
          transport: "byte-identical",
        });
      }
    }
    if (writing)
      await writeFile(
        baselinePath,
        await format(
          JSON.stringify({
            version: "composition-shapes-baseline-1",
            environment,
            items,
          }),
          { parser: "json" },
        ),
      );
    else {
      const stored = JSON.parse(await readFile(baselinePath, "utf8"));
      assert.equal(
        stored.environment.rasterFingerprint,
        environment.rasterFingerprint,
        "Native baseline raster fingerprint",
      );
      assert.deepEqual(
        items,
        stored.items,
        "Native baseline full-frame hashes",
      );
    }
    const legacy = await compareLegacyConnectors(page);
    reports.push({ legacyConnectors: legacy });
    const hardware = await shapeHardwarePreview(root, fixtures);
    await writeFile(
      join(proof, "native-hardware-preview.json"),
      JSON.stringify(hardware, null, 2) + "\n",
    );
    reports.push({ hardwarePreview: hardware });
    const overflow: Composition = {
      ...shapeAnimation(),
      frameCount: 1,
      layers: [
        {
          id: "overflow",
          type: "shape",
          contents: [
            { id: "rect", type: "rect", size: [10, 10] },
            { id: "paint", type: "fill", color: "#ffffff" },
            { id: "repeat", type: "repeater", copies: 256 },
            { id: "repeat-again", type: "repeater", copies: 256 },
          ],
        },
      ],
    };
    const overflowPath = join(directory, "overflow.json");
    await writeFile(overflowPath, JSON.stringify(overflow));
    for (const backend of ["canvas2d", "webgl2"] as const) {
      const output = join(directory, `overflow-${backend}.mp4`);
      await assert.rejects(
        renderComposition({
          compositionPath: overflowPath,
          outputPath: output,
          backend,
        }),
        (error: unknown) => {
          assert.match(String(error), /comp-shape-work-limit/);
          assert.equal(
            (
              error as {
                context: { diagnostic: string; node: string; frame: number };
              }
            ).context.diagnostic,
            "comp-shape-work-limit",
          );
          assert.equal(
            (error as { context: { node: string } }).context.node,
            "overflow",
          );
          assert.equal(
            (error as { context: { frame: number } }).context.frame,
            0,
          );
          return true;
        },
      );
      await assert.rejects(readFile(output), { code: "ENOENT" });
    }
    reports.push({
      geometryOverflow:
        "both exports reject with comp-shape-work-limit; no output published",
    });
    await inspectNative(page, fixtures[2][1], directory);
    await writeFile(
      join(proof, "native-acceptance.json"),
      JSON.stringify(
        {
          environment,
          reports,
          inspector: "passed",
          baseline: writing ? "created new CE5 baseline" : "exact",
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      JSON.stringify({
        shapeAcceptance: reports,
        inspector: "passed",
        baseline: writing ? "created CE5" : "exact",
      }),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function compareLegacyConnectors(page: Page) {
  return page.evaluate(async () => {
    const url = "/packages/renderer-core/src/index.ts",
      legacyUrl = "/packages/renderer-core/src/prepared-path-renderer.ts",
      m = (await import(url)) as typeof Render,
      old = (await import(legacyUrl)) as typeof LegacyPath;
    const reports: { style: string; frames: number; maxDelta: number }[] = [];
    for (const style of ["plain", "ink", "brush"] as const) {
      const points: [number, number][] = [
          [20, 40],
          [80, 20],
          [140, 40],
        ],
        doc: Composition = {
          schemaVersion: "composition-1",
          id: "legacy-connector",
          width: 160,
          height: 80,
          fps: 24,
          frameCount: 48,
          background: "#25313b",
          assets: [],
          layers: [
            {
              id: "connector",
              type: "shape",
              contents: [
                {
                  id: "line",
                  type: "path",
                  path: { closed: false, vertices: points },
                },
                {
                  id: "paint",
                  type: "stroke",
                  style,
                  width: 8,
                  color: "#eec344",
                  cap: "round",
                  join: "round",
                },
                {
                  id: "trim",
                  type: "trim-paths",
                  end: {
                    keys: [
                      { frame: 0, value: 0 },
                      { frame: 47, value: 1 },
                    ],
                  },
                },
              ],
            },
          ],
        },
        canvas = document.createElement("canvas"),
        preview = m.createCompositionPreview(canvas, doc, {
          images: new Map(),
          fonts: new Map(),
        }),
        reference = document.createElement("canvas");
      reference.width = 160;
      reference.height = 80;
      const ctx = reference.getContext("2d", { alpha: false })!,
        node: PreparedPath = {
          id: "line",
          type: "path",
          points,
          stroke: "#eec344",
          lineWidth: 8,
          ...(style === "plain" ? {} : { lineStyle: style }),
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          opacity: 1,
          rotation: 0,
          origin: [0.5, 0.5],
          gapAt: 0.6,
          gapSize: 0.1,
        };
      let maxDelta = 0;
      try {
        for (let frame = 0; frame < 48; frame++) {
          preview.renderFrame(frame);
          ctx.fillStyle = "#25313b";
          ctx.fillRect(0, 0, 160, 80);
          old.drawPreparedPath(ctx, node, {
            reveal: m.evaluateProperty(
              doc,
              "connector.contents[trim].end",
              frame,
            ) as number,
            gap: 0,
            pinch: 0,
            pulse: 0,
          });
          const metrics = m.compareFrames(
            preview.readPixels(),
            ctx.getImageData(0, 0, 160, 80).data,
            160,
            80,
          );
          if (!m.meetsTier(metrics, "near"))
            throw Error(`Legacy ${style}/${frame}: ${JSON.stringify(metrics)}`);
          maxDelta = Math.max(maxDelta, metrics.maxChannelDelta);
        }
      } finally {
        preview.dispose();
      }
      reports.push({ style, frames: 48, maxDelta });
    }
    return reports;
  });
}

async function inspectNative(page: Page, doc: Composition, directory: string) {
  const source = join(directory, "inspector.json");
  await writeFile(source, JSON.stringify(doc));
  const app = await createProgramPreview(source, { watch: true });
  try {
    await page.goto(app.url);
    await page.waitForFunction(
      () => document.getElementById("status")?.dataset.revision === "1",
    );
    await page.locator('[data-layer="connector"] > button').first().click();
    assert.equal(await page.locator("#key-lanes .key-lane").count(), 1);
    await page.locator("#frame").fill("24");
    await page.locator("#frame").dispatchEvent("input");
    await page.locator("#overlay-paths").check();
    assert.equal(await page.locator('[data-overlay="shape-path"]').count(), 1);
    await page.getByLabel("out ease", { exact: true }).fill("0.85");
    await page.getByLabel("out speed", { exact: true }).fill("0");
    await page
      .getByRole("button", { name: "Apply out handle", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.getElementById("document-state")!.textContent ===
        "Unsaved motion edits",
    );
    await page.locator("#undo").click();
    await page.waitForFunction(
      () =>
        document.getElementById("document-state")!.textContent ===
        "Source unchanged",
    );
    await page.locator("#redo").click();
    await page.waitForFunction(
      () =>
        document.getElementById("document-state")!.textContent ===
        "Unsaved motion edits",
    );
    await page.locator("#save-document").click();
    await page.waitForFunction(
      () =>
        document.getElementById("status")!.textContent === "JSON source saved.",
    );
    const saved = JSON.parse(await readFile(source, "utf8"));
    assert(
      saved.layers[0].contents[2].end.keys[0].out,
      "Native handle saved inside contents array",
    );
  } finally {
    await app.close();
  }
}
