import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { createServer } from "vite";
import { loadPreparedScene } from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import { analyzeMotionCraft } from "../../packages/renderer-core/src/story-continuous-quality.ts";
import { measureSceneLayerEnergy } from "./motion-craft-energy.ts";

const { values } = parseArgs({
  options: { directory: { type: "string" } },
});
if (!values.directory)
  throw new Error("Pass --directory <P3 render directory>");

const root = resolve(".");
const directory = resolve(values.directory);
const motifPath = resolve(
  "benchmarks/fixtures/story-motion-continuous/motif-resolve.json",
);
const { scene: motif } = await loadPreparedScene(motifPath);
assert.equal(motif.schemaVersion, "story-scene-1");
if (motif.schemaVersion !== "story-scene-1") throw new Error("Story expected");
assert.deepEqual(motif.review?.focalEvents, [
  { node: "outgoing", property: "reveal", cue: "land-to-claims" },
]);
const motifPixels = await measureSceneLayerEnergy(motifPath);
assert.ok(motifPixels.focal);
const focalWarnings = analyzeMotionCraft(motif, motifPixels).filter(
  (diagnostic) => diagnostic.code === "peak-not-story",
);
assert.deepEqual(focalWarnings, []);
const focalPeak = motifPixels.total.indexOf(Math.max(...motifPixels.total));
const motifFocal = {
  peakFrame: focalPeak,
  rgbDifferenceSum: motifPixels.total[focalPeak],
  outgoingDifference: motifPixels.focal?.contribution[focalPeak],
  remainingDifference: motifPixels.focal?.remainder[focalPeak],
  peakNotStoryWarnings: focalWarnings,
};
const datedEnergy = JSON.parse(
  await readFile(
    join(directory, "dated-system-break.motion-energy.json"),
    "utf8",
  ),
) as { changedPixels: number[]; peakFrame: number };
const datedPreResetPeak = datedEnergy.changedPixels
  .slice(1, 120)
  .reduce(
    (peak, pixels, index) =>
      pixels > datedEnergy.changedPixels[peak]! ? index + 1 : peak,
    1,
  );
const datedPreReset = {
  peakFrame: datedPreResetPeak,
  changedPixels: datedEnergy.changedPixels[datedPreResetPeak],
  largestEarlierArrival: Math.max(...datedEnergy.changedPixels.slice(1, 74)),
  globalPeakFrame: datedEnergy.peakFrame,
};
assert.ok(datedPreResetPeak >= 74 && datedPreResetPeak <= 84);
assert.ok(datedPreReset.changedPixels! > datedPreReset.largestEarlierArrival);
assert.equal(datedPreReset.globalPeakFrame, 120);
const server = await createServer({
  root,
  configFile: false,
  logLevel: "silent",
  server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    `${server.resolvedUrls!.local[0]}${relative(root, directory)}/comparison.html`,
  );
  const studies = page.locator("[data-study]");
  assert.equal(await studies.count(), 7);
  assert.equal(await page.locator("video").count(), 14);
  assert.equal(await page.locator("img[src*='-cut-']").count(), 4);

  const playback = [];
  let pairedPauseResynced = false;
  let pairedStallResynced = false;
  for (let index = 0; index < 7; index++) {
    const study = studies.nth(index);
    await study.locator("video").evaluateAll(async (videos) => {
      await Promise.all(
        videos.map(
          (video) =>
            new Promise<void>((resolve, reject) => {
              const element = video as HTMLVideoElement;
              if (element.readyState >= 2) return resolve();
              element.addEventListener("loadeddata", () => resolve(), {
                once: true,
              });
              element.addEventListener("error", () => reject(element.error), {
                once: true,
              });
              element.load();
            }),
        ),
      );
    });
    const initiallyPaused = await study
      .locator("video")
      .evaluateAll((videos) =>
        videos.every((video) => (video as HTMLVideoElement).paused),
      );
    assert.equal(initiallyPaused, true);
    await study.locator("input[type=range]").fill("90");
    await study.locator("input[type=range]").dispatchEvent("input");
    await page.waitForFunction((studyIndex) => {
      const element = document.querySelectorAll("[data-study]")[studyIndex];
      if (!element) return false;
      return [...element.querySelectorAll<HTMLVideoElement>("video")].every(
        (video) => !video.seeking,
      );
    }, index);
    const scrubTimes = await study
      .locator("video")
      .evaluateAll((videos) =>
        videos.map((video) => (video as HTMLVideoElement).currentTime),
      );
    assert.ok(scrubTimes.every((time) => Math.abs(time - 90 / 24) < 0.001));
    await study.locator("input[type=range]").fill("0");
    await study.locator("input[type=range]").dispatchEvent("input");
    await study.locator("button.play").click();
    if (index === 0) {
      await page.waitForFunction(() => {
        const videos =
          document.querySelectorAll<HTMLVideoElement>("[data-study] video");
        return videos[0] && videos[1] && videos[1].currentTime > 0.8;
      });
      await study
        .locator("video")
        .first()
        .evaluate((video) => (video as HTMLVideoElement).pause());
      await page.waitForFunction(() =>
        [...document.querySelectorAll<HTMLVideoElement>("[data-study] video")]
          .slice(0, 2)
          .every((video) => video.paused),
      );
      const pauseTimes = await study
        .locator("video")
        .evaluateAll((videos) =>
          videos.map((video) => (video as HTMLVideoElement).currentTime),
        );
      assert.ok(Math.abs(pauseTimes[0]! - pauseTimes[1]!) < 0.05);
      pairedPauseResynced = true;
      await study.locator("button.play").click();
      await page.waitForFunction(() => {
        const video =
          document.querySelectorAll<HTMLVideoElement>("[data-study] video")[1];
        return video && video.currentTime > 1.6;
      });
      await study
        .locator("video")
        .last()
        .evaluate((video) => video.dispatchEvent(new Event("waiting")));
      await page.waitForFunction(() =>
        [...document.querySelectorAll<HTMLVideoElement>("[data-study] video")]
          .slice(0, 2)
          .every((video) => video.paused),
      );
      const stallTimes = await study
        .locator("video")
        .evaluateAll((videos) =>
          videos.map((video) => (video as HTMLVideoElement).currentTime),
        );
      assert.ok(Math.abs(stallTimes[0]! - stallTimes[1]!) < 0.05);
      pairedStallResynced = true;
      await study.locator("button.play").click();
    }
    await page.waitForFunction(
      (studyIndex) => {
        const element = document.querySelectorAll("[data-study]")[studyIndex];
        if (!element) return false;
        return [...element.querySelectorAll<HTMLVideoElement>("video")].every(
          (video) => video.ended,
        );
      },
      index,
      { timeout: 15000 },
    );
    const result = await study.locator("video").evaluateAll((videos) => ({
      durations: videos.map((video) => (video as HTMLVideoElement).duration),
      errors: videos.map(
        (video) => (video as HTMLVideoElement).error?.message ?? null,
      ),
    }));
    assert.ok(
      result.durations.every((duration) => Math.abs(duration - 8) < 0.1),
    );
    assert.deepEqual(result.errors, [null, null]);
    playback.push({
      id: await study.getAttribute("data-study"),
      scrubTimes,
      ...result,
      pairedPlaybackReachedEnd: true,
    });
  }

  await page.screenshot({ path: join(directory, "comparison-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(directory, "comparison-phone-390.png") });
  const phoneOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  assert.equal(phoneOverflow, false);
  assert.deepEqual(errors, []);
  const report = {
    motifFocal,
    datedPreReset,
    playback,
    pairedPauseResynced,
    pairedStallResynced,
    reducedMotionStartsPaused: true,
    phoneOverflow,
    pageErrors: errors,
  };
  await writeFile(
    join(directory, "gallery-checks.json"),
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  await server.close();
}
