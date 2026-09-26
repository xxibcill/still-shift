import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { createServer } from "vite";

const { values } = parseArgs({
  options: {
    directory: {
      type: "string",
      default: "benchmarks/results/story-motion-v013-proto",
    },
  },
});
const root = resolve("."),
  directory = resolve(values.directory!);
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
  await page.waitForFunction(() =>
    [...document.querySelectorAll("video")].every((v) => v.readyState >= 2),
  );
  assert.ok(
    await page
      .locator("video")
      .evaluateAll((videos) =>
        videos.every((v) => (v as HTMLVideoElement).paused),
      ),
  );
  await page.locator("#frame").fill("90");
  await page.locator("#frame").dispatchEvent("input");
  await page.waitForFunction(() =>
    [...document.querySelectorAll("video")].every((v) => !v.seeking),
  );
  const scrubbed = await page
    .locator("video")
    .evaluateAll((videos) =>
      videos.map((v) => (v as HTMLVideoElement).currentTime),
    );
  assert.ok(scrubbed.every((time) => Math.abs(time - 90 / 24) < 0.001));
  await page.locator("#play").click();
  await page.waitForFunction(
    () => [...document.querySelectorAll("video")].every((v) => v.ended),
    undefined,
    { timeout: 15000 },
  );
  await page.screenshot({
    path: join(directory, "comparison-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: join(directory, "comparison-phone-390.png"),
    fullPage: true,
  });
  const phoneOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  assert.equal(phoneOverflow, false);
  assert.deepEqual(errors, []);
  const report = {
    viewport: { width: 390, height: 844 },
    phoneOverflow,
    pairedPlaybackReachedEnd: true,
    reducedMotionStartsPaused: true,
    scrubbedFrame: 90,
    scrubbedTimes: scrubbed,
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
