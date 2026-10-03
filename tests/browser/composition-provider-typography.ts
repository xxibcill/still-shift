import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createServer } from "vite";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
} from "@still-shift/execution-runtime";
import {
  StorySceneSchema,
  type Composition,
} from "@still-shift/scene-contract";
import { compileStoryComposition } from "@still-shift/animation-engine";
import { compareFrames, meetsTier } from "@still-shift/renderer-core";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import { numericTypographyVariants } from "../helpers/composition-typography.ts";
import { appearanceVariants } from "../helpers/composition-appearance.ts";

const root = resolve(import.meta.dirname, "../..");
const fixture = resolve(root, "benchmarks/fixtures/typography/editorial.json");
const source = StorySceneSchema.parse(
  JSON.parse(await readFile(fixture, "utf8")),
);
const profile = process.argv.includes("--hardware") ? "hardware" : "pinned";
const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
const referenceBrowser = await launchRenderBrowser();
const actualBrowser = await launchRenderBrowser({ profile });
try {
  const reference = await referenceBrowser.newPage(),
    actual = await actualBrowser.newPage();
  for (const page of [reference, actual]) {
    await page.addInitScript("window.__name = (fn) => fn;");
    await page.goto(server.resolvedUrls!.local[0]!);
  }
  if (profile === "hardware") {
    const environment = await probeRenderEnvironment(actual, profile);
    assert.doesNotMatch(
      environment.webglRenderer ?? "",
      /swiftshader|software/i,
    );
    console.log("Provider typography hardware:", environment);
  }
  for (const kind of ["numeric", "rich"] as const) {
    const scene =
      kind === "numeric"
        ? numericTypographyVariants(source)[0]!.scene
        : appearanceVariants("typography/editorial", source)[0]!.scene;
    const comp = await compileStoryComposition(
      StorySceneSchema.parse(scene),
      dirname(fixture),
    );
    const layer = comp.layers.find(
      (layer) => layer.id === (kind === "numeric" ? "rag" : "headline"),
    )!;
    assert.equal(layer.type, "provider");
    comp.layers = [layer];
    delete comp.textAnimators;
    comp.width = kind === "numeric" ? 370 : 1500;
    comp.height = kind === "numeric" ? 140 : 350;
    layer.transform = { position: [30, 20] };
    const urls = Object.fromEntries(
      comp.assets.map((asset) => [
        asset.id,
        `/@fs${resolve(dirname(fixture), asset.path)}`,
      ]),
    );
    for (const placement of ["layer", "group", "precomp"] as const) {
      const composition = structuredClone(comp);
      const effects = [
        {
          id: "blur",
          effect: "blur.primitive" as const,
          params: { radius: 0.5 },
        },
      ];
      if (placement === "layer") composition.layers[0]!.effects = effects;
      else if (placement === "group") {
        composition.layers[0]!.parent = "group";
        composition.layers.push({
          id: "group",
          type: "group",
          size: [comp.width, comp.height],
          effects,
        });
      } else {
        composition.precomps = [
          {
            id: "nested",
            width: comp.width,
            height: comp.height,
            frameCount: comp.frameCount,
            layers: composition.layers,
          },
        ];
        composition.layers = [
          { id: "host", type: "precomp", comp: "nested", effects },
        ];
      }
      for (const backend of ["canvas2d", "webgl2"] as const) {
        const read = async (
          page: typeof actual,
          backend: "canvas2d" | "webgl2",
        ) =>
          page.evaluate(
            async ({ compositionJson, urls, backend }) => {
              const composition = JSON.parse(compositionJson) as Composition;
              const url = "/packages/renderer-core/src/index.ts";
              const m = (await import(url)) as typeof Render;
              const resources = await m.loadCompositionResources(
                composition as Composition,
                (id) => urls[id]!,
              );
              const preview = m.createCompositionPreview(
                document.createElement("canvas"),
                composition as Composition,
                resources,
                { backend },
              );
              try {
                return [0, 40, 120, 40, 0].map((frame) => {
                  const report = preview.renderFrame(frame);
                  if (report.diagnostics.some((d) => d.severity === "error"))
                    throw new Error(JSON.stringify(report.diagnostics));
                  const bytes = preview.readPixels();
                  let binary = "";
                  for (let at = 0; at < bytes.length; at += 0x8000)
                    binary += String.fromCharCode(
                      ...bytes.subarray(at, at + 0x8000),
                    );
                  return btoa(binary);
                });
              } finally {
                preview.dispose();
              }
            },
            { compositionJson: JSON.stringify(composition), urls, backend },
          );
        const expected = await read(reference, "canvas2d"),
          rendered = await read(actual, backend);
        for (let index = 0; index < expected.length; index++) {
          const metrics = compareFrames(
            new Uint8Array(Buffer.from(expected[index]!, "base64")),
            new Uint8Array(Buffer.from(rendered[index]!, "base64")),
            composition.width,
            composition.height,
          );
          assert.ok(
            meetsTier(metrics, profile === "hardware" ? "perceptual" : "near"),
            `${kind}/${placement}/${backend}/${index}: ${JSON.stringify(metrics)}`,
          );
        }
        console.log(
          `Provider typography ${kind}/${placement}/${backend}: 5 frames pass`,
        );
      }
    }
  }
} finally {
  await actualBrowser.close();
  await referenceBrowser.close();
  await server.close();
}
