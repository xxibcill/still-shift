import assert from "node:assert/strict";
import { runMechanismSemanticTypographyProof } from "./mechanism-semantic-typography-proof.ts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { renderComposition } from "../../packages/animation-engine/src/composition-render.ts";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type * as CompositionRender from "../../packages/renderer-core/src/composition/render/index.ts";
import type { Composition } from "@still-shift/scene-contract";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";

const root = resolve(import.meta.dirname, "../..");
const output = resolve(
  process.env.MECHANISM_TYPOGRAPHY_PROOF_OUTPUT ??
    "/tmp/still-shift-ms1-typography-proof",
);
await mkdir(output, { recursive: true });
const fonts = await Promise.all(
  [
    ["plex", "assets/story-motion/fonts/plex-sans-semibold.ttf", "600"],
    ["noto", "assets/ecommerce-motion/fonts/noto-sans-thai.ttf", "400"],
  ].map(async ([id, path, weight]) => ({
    id: id!,
    path: resolve(root, path!),
    weight: weight!,
    sha256:
      "sha256:" +
      createHash("sha256")
        .update(await readFile(resolve(root, path!)))
        .digest("hex"),
  })),
);
const cases = [
  { id: "latin", font: "plex", text: "Agyp pqy", inlineEnd: 4 },
  { id: "thai", font: "noto", text: "น้ำ ผู้รู้ จุฬา", inlineEnd: 3 },
];
const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
});
await server.listen();
const browser = await launchRenderBrowser();
try {
  const page = await browser.newPage();
  await page.addInitScript("window.__name = fn => fn;");
  await page.goto(server.resolvedUrls!.local[0]!);
  const report = await page.evaluate(
    async ({ root, fonts, cases }) => {
      const { createCompositionPreview, loadCompositionResources } =
        (await import(
          `/@fs/${root}/packages/renderer-core/src/composition/render/index.ts`
        )) as typeof CompositionRender;
      const results = [];
      for (const item of cases) {
        const asset = fonts.find((font) => font.id === item.font)!;
        for (const unit of ["line", "word"] as const) {
          const base: Composition = {
            schemaVersion: "composition-1",
            id: `${item.id}-${unit}`,
            width: 720,
            height: 300,
            fps: 30,
            frameCount: 61,
            background: "#0b1020",
            assets: [{ ...asset, type: "font" }],
            textStyles: { inline: { fontAsset: asset.id, size: 96 } },
            layers: [
              {
                id: "phrase",
                type: "text",
                text: item.text,
                fontAsset: asset.id,
                fontSize: 36,
                color: "#ffffff",
                anchor: "baseline",
                feather: 0,
                spans: [
                  { id: "big", start: 0, end: item.inlineEnd, style: "inline" },
                ],
                transform: { position: [80, 160] },
              },
            ],
          };
          const render = async (mask: "none" | "line" | "word") => {
            const comp: Composition = {
              ...base,
              textAnimators: [
                {
                  node: "phrase",
                  unit,
                  start: 0,
                  end: 60,
                  stagger: 0,
                  selector: { start: 0, end: 1 },
                  from: { offset: [0, 0] },
                  to: { offset: [0, 0] },
                  feather: 0,
                  mask,
                },
              ],
            };
            const canvas = document.createElement("canvas");
            const resources = await loadCompositionResources(
              comp,
              (id: string) =>
                "/@fs/" + fonts.find((font) => font.id === id)!.path,
            );
            const preview = createCompositionPreview(canvas, comp, resources, {
              backend: "canvas2d",
            });
            const samples = [];
            for (const frame of [0, 15, 30, 45, 60]) {
              preview.renderFrame(frame);
              samples.push({
                frame,
                png: canvas.toDataURL(),
                pixels: Array.from(preview.readPixels()),
              });
            }
            const reverseStable = [...samples]
              .reverse()
              .concat([samples[2]!, samples[0]!, samples[3]!, samples[1]!])
              .every((sample) => {
                preview.renderFrame(sample.frame);
                return canvas.toDataURL() === sample.png;
              });
            const bounds = preview.textBounds;
            preview.dispose();
            return { samples, reverseStable, bounds, composition: comp };
          };
          const reference = await render("none"),
            masked = await render(unit);
          const comparisons = masked.samples.map((sample, index) => {
            const other = reference.samples[index]!;
            let changedPixels = 0,
              lostInkPixels = 0,
              maxChannelDelta = 0;
            const rows = new Set<number>();
            for (let i = 0; i < sample.pixels.length; i += 4) {
              let changed = false;
              for (let channel = 0; channel < 3; channel++) {
                const delta = Math.abs(
                  sample.pixels[i + channel]! - other.pixels[i + channel]!,
                );
                maxChannelDelta = Math.max(maxChannelDelta, delta);
                changed ||= delta > 4;
              }
              if (changed) {
                changedPixels++;
                rows.add(Math.floor(i / 4 / 720));
                if (other.pixels[i]! > sample.pixels[i]! + 4) lostInkPixels++;
              }
            }
            return {
              frame: sample.frame,
              changedPixels,
              lostInkPixels,
              maxChannelDelta,
              changedRows: [...rows],
            };
          });
          results.push({
            id: `${item.id}-${unit}`,
            font: asset.sha256,
            text: item.text,
            unit,
            mask: unit,
            baseSize: 36,
            inlineSize: 96,
            control: "mask-none-identical-zero-offset-poses",
            reverseStable: reference.reverseStable && masked.reverseStable,
            bounds: masked.bounds,
            comparisons,
            compositions: {
              masked: masked.composition,
              control: reference.composition,
            },
            images: masked.samples.map((sample, index) => ({
              frame: sample.frame,
              masked: sample.png,
              control: reference.samples[index]!.png,
            })),
          });
        }
      }
      return { browser: navigator.userAgent, backend: "canvas2d", results };
    },
    { root, fonts, cases },
  );
  for (const result of report.results) {
    assert.ok(
      result.comparisons.every((comparison) => comparison.lostInkPixels === 0),
      "Mixed-size mask must preserve the unmasked coverage when feather and pose displacement are zero",
    );
    assert.ok(
      result.reverseStable,
      "Mask probe must retain deterministic reverse seeks",
    );
    const directory = resolve(output, result.id);
    await mkdir(directory, { recursive: true });
    for (const sample of result.images) {
      for (const variant of ["masked", "control"] as const)
        await writeFile(
          resolve(
            directory,
            `${variant}-${String(sample.frame).padStart(6, "0")}.png`,
          ),
          Buffer.from(sample[variant].split(",")[1]!, "base64"),
        );
    }
    for (const [variant, composition] of Object.entries(result.compositions))
      await writeFile(
        resolve(directory, `${variant}-composition.json`),
        JSON.stringify(composition, null, 2),
      );
    await writeFile(
      resolve(directory, "fixture.json"),
      JSON.stringify(
        {
          font: result.font,
          text: result.text,
          unit: result.unit,
          mask: result.mask,
          baseSize: result.baseSize,
          inlineSize: result.inlineSize,
          control: result.control,
        },
        null,
        2,
      ),
    );
  }
  const exports = [];
  if (process.argv.includes("--export")) {
    const run = promisify(execFile);
    for (const result of report.results) {
      const directory = resolve(output, result.id);
      const rendered = await renderComposition({
        compositionPath: resolve(directory, "masked-composition.json"),
        outputPath: resolve(directory, "masked.mp4"),
        backend: "canvas2d",
        workers: 1,
        cacheStatic: false,
      });
      assert.equal(rendered.frameCount, 61);
      const repeat = await renderComposition({
        compositionPath: resolve(directory, "masked-composition.json"),
        outputPath: resolve(directory, "repeat.mp4"),
        backend: "canvas2d",
        workers: 1,
        cacheStatic: false,
      });
      assert.equal(
        rendered.checksums.output,
        repeat.checksums.output,
        "Repeated native mask exports must match",
      );
      const raw = await run(
        "ffmpeg",
        [
          "-v",
          "error",
          "-i",
          resolve(directory, "masked.mp4"),
          "-f",
          "rawvideo",
          "-pix_fmt",
          "rgba",
          "-",
        ],
        { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
      );
      const comparisons = [];
      for (const frame of [0, 15, 30, 45, 60]) {
        const reference = await run(
          "ffmpeg",
          [
            "-v",
            "error",
            "-i",
            resolve(directory, `control-${String(frame).padStart(6, "0")}.png`),
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgba",
            "-",
          ],
          { encoding: "buffer", maxBuffer: 4 * 1024 * 1024 },
        );
        const actual = raw.stdout.subarray(
          frame * 720 * 300 * 4,
          (frame + 1) * 720 * 300 * 4,
        );
        let squared = 0,
          maxDelta = 0;
        for (let i = 0; i < actual.length; i++)
          if (i % 4 !== 3) {
            const delta = Math.abs(actual[i]! - reference.stdout[i]!);
            maxDelta = Math.max(maxDelta, delta);
            squared += delta * delta;
          }
        const psnr = squared
          ? 10 * Math.log10(255 ** 2 / (squared / (720 * 300 * 3)))
          : null;
        assert.ok(
          psnr === null || psnr > 35,
          "Native encoded mask must retain matched control coverage",
        );
        comparisons.push({ frame, psnr, maxChannelDelta: maxDelta });
      }
      exports.push({
        id: result.id,
        frameCount: 61,
        outputSha256: rendered.checksums.output,
        repeatedSha256: repeat.checksums.output,
        decodedComparisons: comparisons,
      });
    }
  }
  await writeFile(
    resolve(output, "mask-report.json"),
    JSON.stringify(
      {
        version: "mechanism-mask-reproduction-1",
        date: new Date().toISOString(),
        exports,
        ...report,
        results: report.results.map(
          ({ images: _images, compositions: _compositions, ...result }) =>
            result,
        ),
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      output,
      results: report.results.map((result) => ({
        id: result.id,
        reverseStable: result.reverseStable,
        comparisons: result.comparisons,
      })),
    }),
  );
} finally {
  await browser.close();
  await server.close();
}

await runMechanismSemanticTypographyProof();
