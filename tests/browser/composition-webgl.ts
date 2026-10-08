import type * as TextInputChecks from "../helpers/composition-text-input-reference.ts";
import type * as InputEchoChecks from "../helpers/composition-input-echo-reference.ts";
import type * as CapturedHistoryChecks from "../helpers/composition-captured-history-reference.ts";
import type * as LargeBlurChecks from "../helpers/composition-large-blur-reference.ts";
import type * as LinearChecks from "../helpers/composition-linear-reference.ts";
import type * as AdjustmentChecks from "../helpers/composition-adjustment-history-reference.ts";
import type * as GradientRankChecks from "../helpers/composition-gradient-rank-reference.ts";
import type * as MapQuotientChecks from "../helpers/composition-map-quotient-reference.ts";
import type * as MapChecks from "../helpers/composition-map-effect-reference.ts";
import type * as InputChecks from "../helpers/composition-effect-input-reference.ts";
import type * as ShadowChecks from "../helpers/composition-shadow-effect-reference.ts";
import type * as RadialChecks from "../helpers/composition-radial-distortion-reference.ts";
import type * as StylizeChecks from "../helpers/composition-stylize-effect-reference.ts";
import type * as QuotientChecks from "../helpers/composition-noise-quotient-reference.ts";
import type * as NoiseChecks from "../helpers/composition-noise-effect-reference.ts";
import type * as WarpChecks from "../helpers/composition-warp-effect-reference.ts";
import type * as SampledBlurChecks from "../helpers/composition-sampled-blur-reference.ts";
import type * as TransitionChecks from "../helpers/composition-transition-effect-reference.ts";
import type * as ColorChecks from "../helpers/composition-color-effect-reference.ts";
import type * as PluginChecks from "../helpers/composition-effect-plugin-reference.ts";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import type * as Exposure from "../helpers/composition-webgl-exposure.ts";
import type * as Rational from "../helpers/composition-webgl-float-sum.ts";
import type * as Checks from "../helpers/composition-webgl-reference.ts";
import type * as VectorPaints from "../helpers/composition-webgl-vector-paints.ts";
import type * as Sampling from "../helpers/composition-webgl-sampling.ts";
import type * as Png from "../helpers/composition-webgl-png.ts";
import type * as Blur from "../helpers/composition-webgl-blur.ts";
import type * as Performance from "../helpers/composition-webgl-performance.ts";
import type * as StoryImages from "../helpers/composition-webgl-story-images.ts";
import type * as DisjointPaints from "../helpers/composition-webgl-disjoint-paints.ts";
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
  const providerShadows = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-vector-paints.ts";
    return (
      (await import(url)) as typeof VectorPaints
    ).checkProviderShadowPaints();
  });
  console.log("WebGL provider shadow paints:", JSON.stringify(providerShadows));
  const sourceEcho = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-input-echo-reference.ts";
    return (
      (await import(url)) as typeof InputEchoChecks
    ).checkCapturedSourceEchoPixels();
  });
  console.log("WebGL hidden source echoes:", JSON.stringify(sourceEcho));
  const animatedInputs = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-text-input-reference.ts";
    return (
      (await import(url)) as typeof TextInputChecks
    ).checkAnimatedTextInputRendering();
  });
  console.log(
    "WebGL hidden animated text inputs:",
    JSON.stringify(animatedInputs),
  );
  const largeBlur = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-large-blur-reference.ts";
    return (
      (await import(url)) as typeof LargeBlurChecks
    ).checkClampedGaussianRendering();
  });
  console.log(
    "WebGL mapped Gaussian clamp/rescale parity:",
    JSON.stringify(largeBlur),
  );
  const capturedHistory = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-captured-history-reference.ts";
    return (
      (await import(url)) as typeof CapturedHistoryChecks
    ).checkCapturedHistoryPixels();
  });
  console.log(
    "WebGL captured backdrop histories:",
    JSON.stringify(capturedHistory),
  );
  const linear = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-linear-reference.ts";
    const checks = (await import(url)) as typeof LinearChecks;
    return {
      owners: await checks.checkLinearOwnerRendering(),
      blends: await checks.checkLinearBlendRendering(),
      pixels: await checks.checkLinearPixels(),
      bytes: checks.checkLinearByteRendering(),
      cacheSwitch: checks.checkLinearCacheSwitch(),
    };
  });
  console.log("WebGL linear-light composition:", JSON.stringify(linear));
  const adjustment = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-adjustment-history-reference.ts";
    const checks = (await import(url)) as typeof AdjustmentChecks;
    return {
      matrix: await checks.checkAdjustmentEffectRendering(),
      pixels: await checks.checkAdjustmentHistoryPixels(),
      offscreen: await checks.checkOffscreenPrecompBlur(),
      affine: await checks.checkOffscreenPrecompAffineBlur(),
    };
  });
  console.log("WebGL adjustment blur/history:", JSON.stringify(adjustment));
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
  const sampledBlur = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-sampled-blur-reference.ts";
    return (
      (await import(url)) as typeof SampledBlurChecks
    ).checkSampledBlurRendering();
  });
  console.log("WebGL sampled blur:", JSON.stringify(sampledBlur));
  const sampledBlurLimits = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-sampled-blur-reference.ts";
    return (
      (await import(url)) as typeof SampledBlurChecks
    ).checkSampledBlurLimits();
  });
  console.log("WebGL sampled blur limits:", JSON.stringify(sampledBlurLimits));
  const warps = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-warp-effect-reference.ts";
    return (
      (await import(url)) as typeof WarpChecks
    ).checkWarpEffectRendering();
  });
  console.log("WebGL native warps:", JSON.stringify(warps));
  const gradientRanks = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-gradient-rank-reference.ts";
    return (
      (await import(url)) as typeof GradientRankChecks
    ).checkGradientRankCodes();
  });
  console.log("WebGL gradient ranks:", JSON.stringify(gradientRanks));
  const mapQuotients = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-map-quotient-reference.ts";
    return (
      (await import(url)) as typeof MapQuotientChecks
    ).checkMapDisplacementCodes();
  });
  console.log("WebGL map quotients:", JSON.stringify(mapQuotients));
  const maps = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-map-effect-reference.ts";
    return await (
      (await import(url)) as typeof MapChecks
    ).checkMapEffectRendering();
  });
  console.log("WebGL map effects:", JSON.stringify(maps));
  const stagedMaps = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-map-effect-reference.ts";
    return await (
      (await import(url)) as typeof MapChecks
    ).checkStagedMapBytes();
  });
  console.log("WebGL staged map bytes:", JSON.stringify(stagedMaps));
  const mapOracles = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-map-effect-reference.ts";
    return ((await import(url)) as typeof MapChecks).checkMapPixelOracles();
  });
  console.log("WebGL independent map pixels:", JSON.stringify(mapOracles));
  const effectInputs = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-effect-input-reference.ts";
    return await (
      (await import(url)) as typeof InputChecks
    ).checkEffectInputRendering();
  });
  console.log("WebGL scoped effect inputs:", JSON.stringify(effectInputs));
  const shadows = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-shadow-effect-reference.ts";
    return (
      (await import(url)) as typeof ShadowChecks
    ).checkShadowEffectRendering();
  });
  console.log("WebGL native shadows:", JSON.stringify(shadows));
  const shadowLimits = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-shadow-effect-reference.ts";
    return (
      (await import(url)) as typeof ShadowChecks
    ).checkShadowEffectLimits();
  });
  console.log("WebGL shadow limits:", JSON.stringify(shadowLimits));
  const shadowOracles = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-shadow-effect-reference.ts";
    return (
      (await import(url)) as typeof ShadowChecks
    ).checkShadowPixelOracles();
  });
  console.log(
    "WebGL independent shadow oracles:",
    JSON.stringify(shadowOracles),
  );
  const radialDistortion = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-radial-distortion-reference.ts";
    return (
      (await import(url)) as typeof RadialChecks
    ).checkRadialDistortionRendering();
  });
  console.log("WebGL radial distortions:", JSON.stringify(radialDistortion));
  const radialRoots = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-radial-distortion-reference.ts";
    return ((await import(url)) as typeof RadialChecks).checkRadialRootCodes();
  });
  console.log("WebGL radial roots:", JSON.stringify(radialRoots));
  const radialSources = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-radial-distortion-reference.ts";
    return (
      (await import(url)) as typeof RadialChecks
    ).checkRadialSourceCodes();
  });
  console.log("WebGL radial sources:", JSON.stringify(radialSources));
  const stylize = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-stylize-effect-reference.ts";
    return (
      (await import(url)) as typeof StylizeChecks
    ).checkStylizeEffectRendering();
  });
  console.log("WebGL native stylize effects:", JSON.stringify(stylize));
  const stylizeOracles = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-stylize-effect-reference.ts";
    return (
      (await import(url)) as typeof StylizeChecks
    ).checkStylizePixelOracles();
  });
  console.log(
    "WebGL independent stylize oracles:",
    JSON.stringify(stylizeOracles),
  );
  const noise = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-noise-effect-reference.ts";
    return (
      (await import(url)) as typeof NoiseChecks
    ).checkNoiseEffectRendering();
  });
  console.log("WebGL native noise effects:", JSON.stringify(noise));
  const noiseCodes = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-noise-effect-reference.ts";
    return ((await import(url)) as typeof NoiseChecks).checkNoiseFieldCodes();
  });
  console.log("WebGL packed noise field:", JSON.stringify(noiseCodes));
  const noiseQuotients = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-noise-quotient-reference.ts";
    return (
      (await import(url)) as typeof QuotientChecks
    ).checkTurbulentQuotients();
  });
  console.log("WebGL turbulent quotient:", JSON.stringify(noiseQuotients));
  const disjoint = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-disjoint-paints.ts";
    return (
      (await import(url)) as typeof DisjointPaints
    ).checkWebglDisjointPaints();
  });
  console.log("WebGL disjoint paint exactness:", disjoint);
  const exposure = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-webgl-exposure.ts";
    const checks = (await import(url)) as typeof Exposure;
    return {
      fusion: checks.checkWebglExposureFusion(),
      bounded: checks.checkWebglBoundedExposure(),
      fractional: checks.checkWebglFractionalExposure(),
    };
  });
  console.log("WebGL final exposure sum/resolve exactness:", exposure);
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
