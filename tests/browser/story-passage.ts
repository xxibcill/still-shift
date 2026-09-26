import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { createServer } from "vite";

const { values } = parseArgs({
  options: { renders: { type: "string" } },
  strict: true,
});
if (!values.renders)
  throw new Error("Pass --renders <story:passage output directory>");
const directory = resolve(values.renders);
const manifest = JSON.parse(
  await readFile(join(directory, "passage.json"), "utf8"),
) as {
  fps: number;
  inputs: { plan: { sha256: string } };
  beats: {
    start: number;
    end: number;
    takeaway: string;
    cues: { localFrame: number }[];
  }[];
};
const captures = await mkdtemp(join(tmpdir(), "still-shift-passage-browser-"));
const server = await createServer({
  configFile: resolve("apps/lab/vite.config.ts"),
  server: { port: 0, strictPort: false },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    server.resolvedUrls!.local[0] + "@fs" + directory + "/index.html",
  );
  await page.locator("#preview").evaluate(async (video: HTMLVideoElement) => {
    if (video.readyState < 1)
      await new Promise<void>((resolve) =>
        video.addEventListener("loadedmetadata", () => resolve(), {
          once: true,
        }),
      );
  });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: join(captures, "desktop.png"),
    fullPage: true,
  });
  for (const [index, beat] of manifest.beats.entries()) {
    await page.locator(".segment").nth(index).click();
    await page.waitForFunction(
      ({ frame, fps }) => {
        const video = document.querySelector<HTMLVideoElement>("#preview")!;
        return (
          !video.seeking && Math.abs(video.currentTime - frame / fps) < 0.001
        );
      },
      { frame: beat.start, fps: manifest.fps },
    );
    assert.equal(
      await page.locator("#current-idea").textContent(),
      beat.takeaway,
    );
    assert.equal(
      await page.locator(".segment").nth(index).getAttribute("aria-current"),
      "true",
    );
  }
  await page.locator(".segment").first().click();
  await page.locator("details").first().locator("summary").click();
  await page.locator(".cues button").first().click();
  const cueFrame = manifest.beats[0]!.cues[0]!.localFrame;
  await page.waitForFunction(
    ({ frame, fps }) =>
      Math.abs(
        document.querySelector<HTMLVideoElement>("#preview")!.currentTime -
          frame / fps,
      ) < 0.001,
    { frame: cueFrame, fps: manifest.fps },
  );
  await page
    .locator("#preview")
    .evaluate((video: HTMLVideoElement) => video.play());
  await page.waitForFunction(
    ({ frame, fps }) =>
      document.querySelector<HTMLVideoElement>("#preview")!.currentTime >
      (frame + 24) / fps,
    { frame: cueFrame, fps: manifest.fps },
  );
  await page
    .locator("#preview")
    .evaluate((video: HTMLVideoElement) => video.pause());
  await page.locator("details").first().locator("summary").click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "Phone layout must not overflow",
  );
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: join(captures, "phone.png"), fullPage: true });
  await page.getByLabel("Clarity", { exact: true }).selectOption("4");
  await page
    .getByLabel("What needs attention?")
    .fill("Browser fixture review only; not creative acceptance.");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download review" }).click();
  const download = await downloading;
  const path = join(captures, "review.json");
  await download.saveAs(path);
  const review = JSON.parse(await readFile(path, "utf8"));
  assert.equal(review.planSha256, manifest.inputs.plan.sha256);
  assert.equal(review.clarity, 4);
  assert.equal(review.readability, null);
  assert.equal(review.preparationMinutes, null);
  assert.deepEqual(errors, []);
  const report = {
    assertions:
      "beat boundary seeking, backward seeking, narration-cue seeking, playback, 390px layout, review download",
    captures,
    errors,
  };
  await writeFile(
    join(captures, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await server.close();
}
