import type * as Quality from "../../packages/renderer-core/src/story-quality.ts";
import type * as CompositionEvaluator from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import type * as NodeTransform from "../../packages/renderer-core/src/node-transform.ts";
import type * as CommerceGeometry from "../../packages/renderer-core/src/commerce-geometry.ts";
import type * as ComponentAnnotations from "../../packages/renderer-core/src/component-annotations.ts";
import type * as CommerceRenderer from "../../packages/renderer-core/src/commerce-scene.ts";
import type * as CompositionRender from "../../packages/renderer-core/src/composition/render/index.ts";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import {
  CommerceSceneSchema,
  type CommerceScene,
  type Composition,
} from "@still-shift/scene-contract";
import { commerceToComposition } from "../../packages/renderer-core/src/composition/adapters/commerce.ts";
import { mechanismPortraitProof } from "../helpers/mechanism-portrait-proof.ts";

const root = resolve(import.meta.dirname, "../..");
const output = resolve(
  process.env.MECHANISM_PORTRAIT_PROOF_OUTPUT ??
    "/tmp/still-shift-ms1-portrait-proof",
);
const sourcePath = resolve(
  root,
  "benchmarks/fixtures/ecommerce-motion/atoms/attachment.json",
);
const source = CommerceSceneSchema.parse(
  JSON.parse(await readFile(sourcePath, "utf8")),
);
const inputs = [
  { id: "lost-label-leader", source: mechanismPortraitProof(source, false) },
  { id: "corrected", source: mechanismPortraitProof(source, true) },
].map((input) => ({
  ...input,
  composition: commerceToComposition(input.source),
}));
for (const input of inputs)
  for (const asset of input.composition.assets)
    asset.path = resolve(dirname(sourcePath), asset.path);
await mkdir(output, { recursive: true });
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
  const results = await page.evaluate(
    async ({ root, inputsJson }) => {
      const inputs = JSON.parse(inputsJson) as {
        id: string;
        source: CommerceScene;
        composition: Composition;
      }[];
      const { createCompositionPreview, loadCompositionResources } =
        (await import(
          `/@fs/${root}/packages/renderer-core/src/composition/render/index.ts`
        )) as typeof CompositionRender;
      const { compileCommerceScene } = (await import(
        `/@fs/${root}/packages/renderer-core/src/commerce-scene.ts`
      )) as typeof CommerceRenderer;
      const { evaluateComponentAnnotation } = (await import(
        `/@fs/${root}/packages/renderer-core/src/component-annotations.ts`
      )) as typeof ComponentAnnotations;
      const { worldMatrix } = (await import(
        `/@fs/${root}/packages/renderer-core/src/commerce-geometry.ts`
      )) as typeof CommerceGeometry;
      const { transformPoint } = (await import(
        `/@fs/${root}/packages/renderer-core/src/node-transform.ts`
      )) as typeof NodeTransform;
      const { evaluateComp } = (await import(
        `/@fs/${root}/packages/renderer-core/src/composition/evaluate/index.ts`
      )) as typeof CompositionEvaluator;
      const { analyzeCompositionQuality } = (await import(
        `/@fs/${root}/packages/renderer-core/src/story-quality.ts`
      )) as typeof Quality;
      const distance = (p: number[], a: number[], b: number[]) => {
        const dx = b[0]! - a[0]!,
          dy = b[1]! - a[1]!;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((p[0]! - a[0]!) * dx + (p[1]! - a[1]!) * dy) / (dx * dx + dy * dy),
          ),
        );
        return Math.hypot(p[0]! - a[0]! - t * dx, p[1]! - a[1]! - t * dy);
      };
      const results = [];
      const pixelHash = async (bytes: Uint8Array | Uint8ClampedArray) =>
        Array.from(
          new Uint8Array(
            await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
          ),
        )
          .map((value) => value.toString(16).padStart(2, "0"))
          .join("");
      for (const input of inputs) {
        const canvas = document.createElement("canvas");
        const preview = createCompositionPreview(
          canvas,
          input.composition,
          await loadCompositionResources(
            input.composition,
            (id: string) =>
              "/@fs/" +
              input.composition.assets.find((asset) => asset.id === id)!.path,
          ),
          { backend: "canvas2d" },
        );
        const scene = compileCommerceScene(input.source);
        const path = scene.nodes.find((node) => node.id === "attached-line")!;
        const image = scene.nodes.find((node) => node.id === "product-art")!;
        if (path.type !== "path" || image.type !== "image")
          throw new Error("proof fixture");
        const geometry = input.source.geometry![0]!;
        const cap = geometry.anchors.cap!;
        const scale = Math.min(image.width / 850, image.height / 1250);
        const local = (point: number[]) =>
          [
            (image.width - 850 * scale) / 2 + (point[0]! - 200) * scale,
            (image.height - 1250 * scale) / 2 + point[1]! * scale,
          ] as [number, number];
        const frames = [];
        for (let frame = 0; frame < 61; frame++) {
          preview.renderFrame(frame);
          const annotation = evaluateComponentAnnotation(scene, path, frame);
          const originalPoints = annotation.points.map((point) =>
            transformPoint(worldMatrix(scene, path, frame), point),
          );
          const expected = transformPoint(
            worldMatrix(scene, image, frame),
            local(cap),
          );

          const evaluated = evaluateComp(input.composition, frame, {
            textBounds: preview.textBounds,
          });
          const nativePath = evaluated.layers.find(
            (layer) => layer.id === path.id,
          )!;
          if (nativePath.layer.type !== "provider")
            throw new Error("Expected baked native annotation");
          const geometrySamples = nativePath.layer.params
            .geometry as unknown as { points: [number, number][][] };
          const points = geometrySamples.points[
            Math.floor(nativePath.time)
          ]!.map((point) => transformPoint(nativePath.screenMatrix, point));
          const endpoint = points.at(-1)!;
          const error = Math.hypot(
            endpoint[0] - expected[0],
            endpoint[1] - expected[1],
          );
          if (
            Math.hypot(
              endpoint[0] - originalPoints.at(-1)![0],
              endpoint[1] - originalPoints.at(-1)![1],
            ) > 1e-8
          )
            throw new Error("Native baked path lost its semantic target");
          const label = evaluated.layers.find(
            (layer) => layer.id === "feature",
          )!;
          const box = label.bounds!;
          const [x, y, w, h] = geometry.protectedRegions[0]!;
          const polygon = [
            [x, y],
            [x + w, y],
            [x + w, y + h],
            [x, y + h],
          ].map((point) =>
            transformPoint(worldMatrix(scene, image, frame), local(point)),
          );
          let clearance = Infinity;
          for (let i = 0; i < points.length - 1; i++)
            for (let j = 0; j < polygon.length; j++) {
              const a = points[i]!,
                b = points[i + 1]!,
                c = polygon[j]!,
                d = polygon[(j + 1) % polygon.length]!;
              clearance = Math.min(
                clearance,
                distance(a, c, d),
                distance(b, c, d),
                distance(c, a, b),
                distance(d, a, b),
              );
            }
          frames.push({
            frame,
            semanticTarget: {
              node: image.id,
              anchor: "cap",
              sourcePoint: cap,
              assetSha256: geometry.sha256,
            },
            projectedEndpoint: endpoint,
            expectedEndpoint: expected,
            endpointErrorPixels: error,
            labelBounds: box,
            labelOnscreen:
              box.left >= 0 &&
              box.top >= 0 &&
              box.right <= input.source.width &&
              box.bottom <= input.source.height,
            leaderStart: points[0],
            labelLeaderClearancePixels: points[0]![0] - box.right,
            protectedRegionClearancePixels: clearance,
            pixelSha256: await pixelHash(preview.readPixels()),
            png: [0, 15, 30, 45, 60].includes(frame)
              ? canvas.toDataURL()
              : null,
          });
        }
        let reverseStable = true;
        for (const sample of [...frames]
          .reverse()
          .concat([frames[30]!, frames[0]!, frames[45]!])) {
          preview.renderFrame(sample.frame);
          reverseStable &&=
            (await pixelHash(preview.readPixels())) === sample.pixelSha256;
        }
        const quality = analyzeCompositionQuality(input.composition, {
          evaluation: { textBounds: preview.textBounds },
        });
        const textBounds = preview.textBounds;
        preview.dispose();
        results.push({
          id: input.id,
          frames,
          reverseStable,
          textBounds,
          quality,
        });
      }
      return results;
    },
    { root, inputsJson: JSON.stringify(inputs) },
  );
  const negative = results[0]!,
    corrected = results[1]!;
  assert.ok(
    negative.frames.every(
      (frame) => !frame.labelOnscreen && frame.leaderStart![0] < 0,
    ),
  );
  assert.ok(
    corrected.frames.every(
      (frame) =>
        frame.labelOnscreen &&
        frame.endpointErrorPixels < 1e-8 &&
        frame.labelLeaderClearancePixels >= 16 &&
        frame.protectedRegionClearancePixels >= 16,
    ),
  );
  assert.ok(results.every((result) => result.reverseStable));
  assert.ok(
    negative.quality.diagnostics.some(
      (finding) => finding.code === "off-canvas" && finding.node === "feature",
    ),
  );
  assert.ok(
    !corrected.quality.diagnostics.some(
      (finding) => finding.code === "off-canvas" && finding.node === "feature",
    ),
  );
  for (const [index, result] of results.entries()) {
    const directory = resolve(output, result.id);
    await mkdir(directory, { recursive: true });
    await writeFile(
      resolve(directory, "source.json"),
      JSON.stringify(inputs[index]!.source, null, 2),
    );
    await writeFile(
      resolve(directory, "composition.json"),
      JSON.stringify(inputs[index]!.composition, null, 2),
    );
    for (const frame of result.frames)
      if (frame.png)
        await writeFile(
          resolve(
            directory,
            `frame-${String(frame.frame).padStart(6, "0")}.png`,
          ),
          Buffer.from(frame.png.split(",")[1]!, "base64"),
        );
  }
  await writeFile(
    resolve(output, "portrait-report.json"),
    JSON.stringify(
      {
        version: "mechanism-portrait-proof-1",
        results: results.map((result) => ({
          ...result,
          frames: result.frames.map(({ png: _png, ...frame }) => frame),
        })),
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      output,
      results: results.map((result) => ({
        id: result.id,
        frames: result.frames.length,
        reverseStable: result.reverseStable,
        allLabelsOnscreen: result.frames.every((frame) => frame.labelOnscreen),
        maxEndpointError: Math.max(
          ...result.frames.map((frame) => frame.endpointErrorPixels),
        ),
        minimumLabelClearance: Math.min(
          ...result.frames.map((frame) => frame.labelLeaderClearancePixels),
        ),
        minimumProtectedClearance: Math.min(
          ...result.frames.map((frame) => frame.protectedRegionClearancePixels),
        ),
      })),
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
