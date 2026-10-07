import type * as ExposureTests from "../helpers/composition-exposure-reference.ts";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { renderComposition } from "@still-shift/animation-engine";
import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { createServer } from "vite";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
} from "@still-shift/execution-runtime";
import { runTimeControlAcceptance } from "./time-control-acceptance.ts";

const root = resolve(import.meta.dirname, "../..");
const cache = await mkdtemp(join(tmpdir(), "ce7-exposure-vite-"));
const server = await createServer({
  root,
  cacheDir: cache,
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
  const results = await page.evaluate(async () => {
    const url = "/tests/helpers/composition-exposure-reference.ts";
    const {
      checkExposureFrames,
      checkSampleClockFrames,
      checkReversedContentCutFrames,
      checkPosterizedStateCutFrames,
    } = (await import(url)) as typeof ExposureTests;
    return [
      ...checkExposureFrames(),
      ...checkSampleClockFrames(),
      ...checkReversedContentCutFrames(),
      ...checkPosterizedStateCutFrames(),
    ];
  });
  for (const result of results)
    console.log("Native motion blur:", JSON.stringify(result));
  for (const result of results) assert.equal(result.maxDelta, 0, result.id);
  await runTimeControlAcceptance(
    page,
    root,
    join(root, "benchmarks/results/composition-ce7-verification"),
  );
  if (process.argv.includes("--profile")) {
    const timings = await page.evaluate(async () => {
      const url = "/tests/helpers/composition-exposure-reference.ts";
      const { measureExposureFrames } = (await import(
        url
      )) as typeof ExposureTests;
      return measureExposureFrames();
    });
    for (const timing of timings)
      console.log("Native exposure cost:", JSON.stringify(timing));
    await writeFile(
      join(
        root,
        "benchmarks/results/composition-ce7-verification/sample-cost.json",
      ),
      JSON.stringify(
        { environment: await probeRenderEnvironment(page), timings },
        null,
        2,
      ) + "\n",
    );
  }
} finally {
  await browser.close();
  await server.close();
  await rm(cache, { recursive: true, force: true });
}

const output = await mkdtemp(join(tmpdir(), "still-shift-exposure-"));
try {
  for (const fixture of ["exposure", "indexed"]) {
    const compositionPath = resolve(
      `benchmarks/fixtures/composition/ce7/${fixture}.json`,
    );
    const first = await renderComposition({
      compositionPath,
      outputPath: join(output, `${fixture}-first.mp4`),
    });
    const second = await renderComposition({
      compositionPath,
      outputPath: join(output, `${fixture}-second.mp4`),
    });
    assert.equal(first.checksums.output, second.checksums.output);
    assert.deepEqual(first.systemFontLayers, []);
    console.log(
      `Native ${fixture} export: ${first.frameCount} frames, two byte-identical MP4s`,
    );
  }
} finally {
  await rm(output, { recursive: true, force: true });
}
