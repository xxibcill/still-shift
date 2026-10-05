import type * as TransitionChecks from "../helpers/composition-transition-effect-reference.ts";
import type * as ColorChecks from "../helpers/composition-color-effect-reference.ts";
import type * as PluginChecks from "../helpers/composition-effect-plugin-reference.ts";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import type * as Rational from "../helpers/composition-webgl-float-sum.ts";
import type * as Checks from "../helpers/composition-webgl-reference.ts";
import type * as VectorPaints from "../helpers/composition-webgl-vector-paints.ts";
import type * as Sampling from "../helpers/composition-webgl-sampling.ts";
import type * as Png from "../helpers/composition-webgl-png.ts";
import type * as Blur from "../helpers/composition-webgl-blur.ts";
import type * as Performance from "../helpers/composition-webgl-performance.ts";
import type * as StoryImages from "../helpers/composition-webgl-story-images.ts";
const server = await createServer({
  root: resolve(import.meta.dirname, "../.."),
  configFile: false,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
const browser = await launchRenderBrowser();
try {
  const page = await browser.newPage();
  await page.addInitScript("window.__name = (fn) => fn;");
  await page.goto(server.resolvedUrls!.local[0]!);
  const plugins = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-effect-plugin-reference.ts";
    return (
      (await import(url)) as typeof PluginChecks
    ).checkEffectPluginRendering();
  });
  console.log("WebGL effect plugin registry:", plugins);
  const colors = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-color-effect-reference.ts";
    return (
      (await import(url)) as typeof ColorChecks
    ).checkColorEffectRendering();
  });
  console.log("WebGL native color effects:", JSON.stringify(colors));
  const colorBytes = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-color-effect-reference.ts";
    return (
      (await import(url)) as typeof ColorChecks
    ).checkColorEffectByteRounding();
  });
  console.log("WebGL color-effect byte rounding:", JSON.stringify(colorBytes));
  const curveBytes = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-color-effect-reference.ts";
    return (
      (await import(url)) as typeof ColorChecks
    ).checkColorCurveByteRounding();
  });
  console.log("WebGL curve byte rounding:", JSON.stringify(curveBytes));
  const transitions = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-transition-effect-reference.ts";
    return (
      (await import(url)) as typeof TransitionChecks
    ).checkTransitionEffectRendering();
  });
  console.log("WebGL native transitions:", JSON.stringify(transitions));
  const blur = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-blur.ts";
    return ((await import(url)) as typeof Blur).checkWebglPrimitiveBlur();
  });
  console.log("WebGL primitive blur raster parity:", blur);
  const workReduction = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-performance.ts";
    const checks = (await import(url)) as typeof Performance;
    return {
      grainTile: checks.checkWebglGrainTile(),
      grainBlending: checks.checkWebglGrainBlending(),
      boxBlurSteps: (await checks.checkWebglBoxBlurSteps()).length,
      boundedParticles: await checks.checkWebglBoundedParticles(),
      boundedLightSweep: checks.checkWebglBoundedLightSweep(),
      boundedRadialLight: checks.checkWebglBoundedRadialLight(),
      boundedComposites: await checks.checkWebglBoundedComposites(
        [
          "ce6/light-sweep",
          "ce6/echo",
          "ce6/pixel-stack",
          "ce6/generators",
        ].map((path) => `/benchmarks/fixtures/composition/${path}.json`),
      ),
    };
  });
  console.log("WebGL exact effect work reduction:", workReduction);
  const sums = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-float-sum.ts";
    return ((await import(url)) as typeof Rational).checkWebglFloatSum();
  });
  console.log("WebGL exact Float32 accumulation:", sums);
  const sampling = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-sampling.ts";
    return ((await import(url)) as typeof Sampling).checkWebglEffectSampling();
  });
  console.log("WebGL translated effect sampling:", sampling);
  const png = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-png.ts";
    return ((await import(url)) as typeof Png).checkWebglPngImages();
  });
  console.log("WebGL PNG sprite sampling:", png);
  const storyImages = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-story-images.ts";
    return (
      (await import(url)) as typeof StoryImages
    ).checkWebglStoryImageRounding();
  });
  console.log("WebGL story image rounding:", storyImages);
  const reuse = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-reference.ts";
    return ((await import(url)) as typeof Checks).checkWebglFrameReuse();
  });
  console.log("WebGL frame reuse:", reuse);
  const providerReuse = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-reference.ts";
    return ((await import(url)) as typeof Checks).checkWebglProviderReuse();
  });
  console.log("WebGL provider reuse:", providerReuse);
  const damage = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-reference.ts";
    const { checkWebglDamageRecovery } = (await import(url)) as typeof Checks;
    return {
      direct: await checkWebglDamageRecovery(),
      masked: await checkWebglDamageRecovery("alpha"),
      inverted: await checkWebglDamageRecovery("alpha-inverted"),
    };
  });
  console.log("WebGL partial redraw and recovery:", damage);
  const rounding = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-reference.ts";
    return ((await import(url)) as typeof Checks).checkWebglPrimitiveRounding();
  });
  console.log("WebGL overlapping primitive rounding:", rounding);
  const replay = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-vector-paints.ts";
    return (
      (await import(url)) as typeof VectorPaints
    ).checkVectorPaintReplay();
  });
  console.log("WebGL provider paint replay:", replay);
  const deferred = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-vector-paints.ts";
    return ((await import(url)) as typeof VectorPaints).checkDeferredPaints();
  });
  console.log("WebGL deferred paint fallback:", deferred);
  const batches = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-vector-paints.ts";
    return (
      (await import(url)) as typeof VectorPaints
    ).checkProviderPaintBatches();
  });
  console.log("WebGL provider paint batches:", batches);
  const singleImage = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-vector-paints.ts";
    const { checkSingleImageProvider, checkBoundedProviderCanvas } =
      (await import(url)) as typeof VectorPaints;
    return {
      mutable: checkSingleImageProvider(),
      stable: checkSingleImageProvider(true),
      fullCanvas: checkBoundedProviderCanvas(false),
      boundedCanvas: checkBoundedProviderCanvas(true),
    };
  });
  console.log("WebGL single image provider:", singleImage);
  const feather = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-reference.ts";
    return ((await import(url)) as typeof Checks).checkWebglScaledFeather();
  });
  console.log("WebGL scaled feather parity:", feather);
  const results = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-reference.ts";
    const { checkWebglFrames } = (await import(url)) as typeof Checks;
    return checkWebglFrames();
  });
  for (const result of results)
    console.log("WebGL composition:", JSON.stringify(result));
  const failures: string[] = [];
  for (const result of [...results, ...feather]) {
    if (result.maxDelta > 2 || result.psnr < 50 || result.passes <= 0)
      failures.push(
        `${result.id} delta ${result.maxDelta} PSNR ${result.psnr} passes ${result.passes}`,
      );
  }
  for (const path of [
    "ce6/gaussian",
    "ce6/pixel-stack",
    "ce6/generators",
    "ce6/light-sweep",
    "ce6/echo",
    "ce6/primitive-blur",
    "ce7/exposure",
    "ce7/indexed",
    "ce4b/text-states",
    "ce4b/typography",
    "ce4a/providers",
  ]) {
    const results = await page.evaluate(async (path) => {
      const url = "/tests/helpers/composition-webgl-reference.ts";
      const { checkCompositionBackends } = (await import(url)) as typeof Checks;
      return checkCompositionBackends([
        `/benchmarks/fixtures/composition/${path}.json`,
      ]);
    }, path);
    for (const result of results) {
      console.log("WebGL native fixture:", JSON.stringify(result));
      if (result.maxDelta > 2 || result.psnr < 50)
        failures.push(
          `${result.id} delta ${result.maxDelta} PSNR ${result.psnr}`,
        );
    }
  }
  assert.deepEqual(failures, []);
} finally {
  await browser.close();
  await server.close();
}
