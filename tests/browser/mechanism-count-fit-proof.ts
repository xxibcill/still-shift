import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import {
  StorySceneSchema,
  ComponentDataSchema,
  type StoryScene,
  type Composition,
} from "@still-shift/scene-contract";
import type * as Renderer from "@still-shift/renderer-core";
import type * as Fits from "../../packages/renderer-core/src/component-text-fit.ts";
import type * as Fonts from "../../packages/renderer-core/src/prepared-fonts.ts";
import type * as Type from "../../packages/renderer-core/src/typography-renderer.ts";
import type * as Values from "../../packages/renderer-core/src/typography-text-values.ts";
import type * as Shaping from "../../packages/renderer-core/src/shaped-text.ts";
import { compileStoryComposition } from "../../packages/animation-engine/src/composition-compile.ts";
import { renderComposition } from "../../packages/animation-engine/src/composition-render.ts";
import { MECHANISM_SEMANTIC_FONTS } from "../helpers/mechanism-semantic-typography-proof.ts";

const root = resolve(import.meta.dirname, "../.."),
  output = await mkdtemp(join(tmpdir(), "still-shift-ms2-count47-")),
  probeOnly = process.argv.includes("--probe");
const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const font = MECHANISM_SEMANTIC_FONTS.semibold,
  fontPath = resolve(root, font.path),
  fontBytes = await readFile(fontPath);
assert.equal(`sha256:${hash(fontBytes)}`, font.sha256);
const art = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
  artPath = join(output, "unused.svg");
await writeFile(artPath, art);
const fixture = (id: string): StoryScene =>
  StorySceneSchema.parse({
    schemaVersion: "story-scene-1",
    title: "Generated decimal count fit",
    width: 1920,
    height: 1080,
    fps: 30,
    frameCount: 61,
    background: "#ffffff",
    motionModel: "curves-1",
    authoringVersion: "1",
    typography: "type-1",
    assets: [
      {
        id: "unused",
        path: artPath,
        sha256: `sha256:${hash(art)}`,
        width: 1,
        height: 1,
      },
    ],
    fonts: [
      { id: "font", path: fontPath, sha256: font.sha256, weight: font.weight },
    ],
    textStyles: { number: { fontAsset: "font", figures: "tabular" } },
    nodes: [
      {
        id: "counter",
        type: "text",
        text: "1",
        states: ["1", "2"],
        style: "number",
        textRole: "label",
        fontSize: id === "no-fit" ? 16 : 96,
        color: "#202020",
        x: 200,
        y: 250,
        origin: [0, 0],
        anchor: "cap",
        align: "left",
        width: id === "wide" ? 640 : 80,
        height: 200,
        textLayout: {
          width: id === "wide" ? 640 : 80,
          height: 200,
          lineHeight: 1.2,
          overflow: "error",
        },
        transition: {
          kind: "count",
          fromState: 0,
          toState: 1,
          decimals: 2,
          window: { start: 0, end: 60 },
          easing: "linear",
        },
      },
    ],
    recipe: { preset: "generic" },
  });
const evidence: Record<string, unknown> = {
  version: "mechanism-count-fit-reproduction-1",
  status: "running",
  output,
  mode: probeOnly ? "source-risk-reproduction" : "verified-count-fit",
  font: { ...font, actualSha256: hash(fontBytes) },
  cases: [],
};
console.log(JSON.stringify({ status: "started", output }));
const write = () =>
  writeFile(join(output, "run.json"), JSON.stringify(evidence, null, 2) + "\n");
await write();
const server = await createServer({
  root,
  cacheDir: join(output, "vite-cache"),
  configFile: false,
  logLevel: "silent",
  server: { host: "127.0.0.1", port: 0, fs: { allow: [root, output] } },
});
await server.listen();
const browser = await launchRenderBrowser();
try {
  const negative = fixture("narrow");
  negative.componentData = ComponentDataSchema.parse({
    schemaVersion: "scene-components-3",
    values: [
      {
        id: "amount",
        range: [1, 2],
        from: 1,
        to: 2,
        window: { start: 0, end: 60, easing: "linear" },
      },
    ],
    bindings: [
      {
        kind: "text",
        target: "counter",
        value: "amount",
        format: { decimals: 2 },
      },
    ],
    textFits: [{ target: "counter", minSize: 16, maxSize: 96 }],
  });
  assert.throws(
    () => StorySceneSchema.parse(negative),
    /Text fit conflicts with numeric text/,
  );
  evidence.numericBindingFit = "rejected-existing-contract";
  await writeFile(
    join(output, "numeric-binding-fit-rejected.json"),
    JSON.stringify(negative, null, 2) + "\n",
  );
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript("window.__name = fn => fn;");
  await page.goto(server.resolvedUrls!.local[0]!);
  await page.addScriptTag({
    type: "module",
    content: `import * as renderer from ${JSON.stringify(`/@fs/${root}/packages/renderer-core/src/index.ts`)};import * as fits from ${JSON.stringify(`/@fs/${root}/packages/renderer-core/src/component-text-fit.ts`)};import * as fonts from ${JSON.stringify(`/@fs/${root}/packages/renderer-core/src/prepared-fonts.ts`)};import * as type from ${JSON.stringify(`/@fs/${root}/packages/renderer-core/src/typography-renderer.ts`)};import * as values from ${JSON.stringify(`/@fs/${root}/packages/renderer-core/src/typography-text-values.ts`)};import * as shaping from ${JSON.stringify(`/@fs/${root}/packages/renderer-core/src/shaped-text.ts`)};globalThis.__countProof={renderer,fits,fonts,type,values,shaping};`,
  });
  await page.waitForFunction(() => "__countProof" in globalThis);
  for (const id of ["narrow", "wide", "no-fit"]) {
    const source = fixture(id),
      directory = join(output, id);
    await mkdir(directory);
    await writeFile(
      join(directory, "source.json"),
      JSON.stringify(source, null, 2) + "\n",
    );
    const result = await page.evaluate(
      async ({ json, fit }) => {
        const source = JSON.parse(json) as StoryScene;
        const { renderer, fits, fonts, type, values, shaping } = (
          globalThis as typeof globalThis & {
            __countProof: {
              renderer: typeof Renderer;
              fits: typeof Fits;
              fonts: typeof Fonts;
              type: typeof Type;
              values: typeof Values;
              shaping: typeof Shaping;
            };
          }
        ).__countProof;
        const scene = renderer.compileStoryScene(source),
          original = JSON.stringify(scene),
          loaded = await fonts.loadPreparedFonts(
            scene,
            (id) => `/@fs/${scene.fonts!.find((f) => f.id === id)!.path}`,
            { profile: "strict" },
          );
        const ctx = document.createElement("canvas").getContext("2d")!;
        const fitted = fit
          ? fits.prepareTextFits(
              scene,
              [{ target: "counter", minSize: 16, maxSize: 96 }],
              ctx,
              loaded,
            )
          : scene;
        if (JSON.stringify(scene) !== original)
          throw Error("fitter mutated input scene");
        const node = fitted.nodes.find((node) => node.id === "counter")!;
        if (node.type !== "text") throw Error("missing counter");
        const strings = [...values.typographyTextValues(fitted, node)],
          measurements = strings.map((text) => {
            try {
              const l = shaping.shapeText(
                ctx,
                node,
                text,
                loaded,
                fitted.textStyles,
              );
              return {
                text,
                width: l.width,
                height: l.height,
                overflow: false,
              };
            } catch (error) {
              return { text, overflow: true, error: String(error) };
            }
          });
        let rasterPrepared = false,
          rasterError: string | null = null;
        try {
          const prepared = type.prepareTypography(fitted, loaded);
          rasterPrepared = true;
          type.disposeTypography(prepared);
        } catch (error) {
          rasterError = String(error);
        }
        return {
          fitted,
          chosenSize: node.fontSize,
          strings,
          measurements,
          rasterPrepared,
          rasterError,
        };
      },
      { json: JSON.stringify(source), fit: id !== "no-fit" },
    );
    const overflow = result.measurements.filter((m) => m.overflow),
      record: Record<string, unknown> = {
        id,
        ...result,
        overflowCount: overflow.length,
      };
    (evidence.cases as unknown[]).push(record);
    await write();
    await writeFile(
      join(directory, "fitted.json"),
      JSON.stringify(result.fitted, null, 2) + "\n",
    );
    if (probeOnly && id === "narrow") {
      assert.ok(overflow.length > 0);
      assert.equal(result.rasterPrepared, false);
      record.reproduced = "fitter-success-generated-raster-overflow";
      console.log(
        JSON.stringify({
          id,
          chosenSize: result.chosenSize,
          overflowCount: overflow.length,
          rasterError: result.rasterError,
        }),
      );
      await write();
      continue;
    }
    assert.equal(overflow.length, 0, JSON.stringify(overflow));
    assert.equal(result.rasterPrepared, true, result.rasterError ?? "");
    assert.ok(
      result.strings.includes("1.00") && result.strings.includes("2.00"),
    );
    if (!probeOnly) {
      const fittedSource = structuredClone(source);
      fittedSource.textStyles = result.fitted.textStyles;
      fittedSource.nodes = fittedSource.nodes.map((node) => {
        if (node.type !== "text") return node;
        const fitted = result.fitted.nodes.find((n) => n.id === node.id);
        if (fitted?.type !== "text") throw Error("missing fitted target");
        return { ...node, fontSize: fitted.fontSize, style: fitted.style };
      });
      const admitted = StorySceneSchema.parse(fittedSource);
      await writeFile(
        join(directory, "fitted-source.json"),
        JSON.stringify(admitted, null, 2) + "\n",
      );
      const composition = await compileStoryComposition(admitted, root);
      for (const a of composition.assets) a.path = resolve(root, a.path);
      const path = join(directory, "composition.json");
      await writeFile(path, JSON.stringify(composition, null, 2) + "\n");
      const preview = await page.evaluate(
        async ({ json }) => {
          const composition = JSON.parse(json) as Composition;
          const { renderer } = (
            globalThis as typeof globalThis & {
              __countProof: { renderer: typeof Renderer };
            }
          ).__countProof;
          const resources = await renderer.loadCompositionResources(
            composition,
            (id) => `/@fs/${composition.assets.find((a) => a.id === id)!.path}`,
          );
          const canvas = document.createElement("canvas"),
            view = renderer.createCompositionPreview(
              canvas,
              composition,
              resources,
              { backend: "webgl2" },
            );
          const digest = async () =>
            Array.from(
              new Uint8Array(
                await crypto.subtle.digest(
                  "SHA-256",
                  new Uint8Array(view.readPixels()).buffer,
                ),
              ),
            )
              .map((n) => n.toString(16).padStart(2, "0"))
              .join("");
          const hashes: string[] = [],
            bounds: unknown[] = [],
            samples: { frame: number; png: string }[] = [];
          try {
            for (let frame = 0; frame < composition.frameCount; frame++) {
              view.renderFrame(frame);
              hashes.push(await digest());
              const tree = renderer.evaluateComp(composition, frame, {
                textBounds: view.textBounds,
              });
              const layer = tree.layers.find((l) => l.id === "counter");
              if (!layer) throw Error("missing native counter");
              bounds.push(layer.bounds);
              if ([0, 15, 30, 45, 60].includes(frame))
                samples.push({ frame, png: canvas.toDataURL() });
            }
            for (const frame of [...hashes.keys()].reverse()) {
              view.renderFrame(frame);
              if ((await digest()) !== hashes[frame])
                throw Error("backward count seek mismatch");
            }
            for (let i = 0; i < hashes.length; i++) {
              const frame = (i * 17) % hashes.length;
              view.renderFrame(frame);
              if ((await digest()) !== hashes[frame])
                throw Error("shuffled count seek mismatch");
            }
            return { hashes, bounds, samples };
          } finally {
            view.dispose();
          }
        },
        { json: JSON.stringify(composition) },
      );
      assert.ok(
        preview.bounds.every(
          (b) => JSON.stringify(b) === JSON.stringify(preview.bounds[0]),
        ),
        "count changed its reserved bounds/anchor",
      );
      assert.notEqual(
        preview.hashes[0],
        preview.hashes[60],
        "count must paint different endpoints",
      );
      for (const sample of preview.samples)
        await writeFile(
          join(directory, `preview-${sample.frame}.png`),
          Buffer.from(sample.png.split(",")[1]!, "base64"),
        );
      record.preview = {
        hashes: preview.hashes,
        bounds: preview.bounds,
        draws: 183,
      };
      const first = await renderComposition({
        compositionPath: path,
        outputPath: join(directory, "first.mp4"),
        backend: "webgl2",
        workers: 1,
        cacheStatic: false,
      });
      const repeat = await renderComposition({
        compositionPath: path,
        outputPath: join(directory, "repeat.mp4"),
        backend: "webgl2",
        workers: 1,
        cacheStatic: false,
      });
      assert.equal(first.frameCount, 61);
      assert.equal(repeat.frameCount, 61);
      assert.equal(first.checksums.output, repeat.checksums.output);
      record.exports = [first, repeat];
    }
    console.log(
      JSON.stringify({
        id,
        status: "passed",
        chosenSize: result.chosenSize,
        strings: result.strings.length,
      }),
    );
    await write();
  }
  assert.equal(errors.length, 0, errors.join("\n"));
  evidence.browserErrors = errors;
  evidence.status = "passed";
} catch (error) {
  evidence.status = "failed";
  evidence.error = String(error);
  throw error;
} finally {
  await browser.close();
  await server.close();
  await write();
  console.log(JSON.stringify({ status: evidence.status, output }));
}
