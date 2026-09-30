import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { parseArgs } from "node:util";
import {
  compareDecodedVideos,
  sha256File,
  verifyV014HistoricalIdentity,
} from "./historical-video.ts";
import {
  archivalCanvasPatch,
  createIsolatedArchivalEngine,
} from "./archival-engine.ts";

const run = promisify(execFile);
const engineCommit = "50b5dca0bea23d86fd2cb35ad68e63b6813794b3";
const { values } = parseArgs({
  options: {
    "historical-result": { type: "string" },
    "replay-dir": { type: "string" },
    "output-dir": { type: "string" },
  },
});
for (const key of ["historical-result", "replay-dir", "output-dir"] as const)
  assert.ok(values[key], `Pass --${key} <path>`);
const projectRoot = resolve(".");
const replayDir = resolve(values["replay-dir"]!);
const outputDir = resolve(values["output-dir"]!);
await mkdir(outputDir, { recursive: true });

async function checkArchivalFocal(
  checkout: string,
  scenePath: string,
  reportPath: string,
) {
  const focalDir = join(checkout, "archival-focal");
  const assetDir = join(focalDir, "assets");
  await mkdir(assetDir, { recursive: true });
  const source = JSON.parse(await readFile(scenePath, "utf8"));
  for (const asset of [...source.assets, ...(source.fonts ?? [])]) {
    const destination = join(assetDir, `${asset.id}${extname(asset.path)}`);
    await copyFile(asset.path, destination);
    assert.equal(await sha256File(destination), asset.sha256, asset.id);
    asset.path = destination;
  }
  await writeFile(
    join(focalDir, "opted-in-current-engine.json"),
    JSON.stringify(source),
  );
  for (const file of [
    "check-motion-craft-v014-focal.ts",
    "historical-video.ts",
  ])
    await copyFile(
      join(projectRoot, "scripts/story-motion", file),
      join(checkout, "scripts/story-motion", file),
    );
  await run(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/story-motion/check-motion-craft-v014-focal.ts",
      "--replay-dir",
      focalDir,
      "--output-report",
      reportPath,
      "--engine-label",
      "isolated archival Canvas transform with pinned v014-g composition and art",
    ],
    { cwd: checkout, maxBuffer: 8 * 1024 * 1024 },
  );
}

const historicalResult = resolve(values["historical-result"]!);
assert.ok(historicalResult.endsWith(".mp4.result.json"));
const historicalVideo = historicalResult.slice(0, -".result.json".length);
const historicalSidecar = JSON.parse(await readFile(historicalResult, "utf8"));
const historicalManifest = JSON.parse(
  await readFile(`${historicalVideo}.scene.json`, "utf8"),
);
const historicalHash = await verifyV014HistoricalIdentity(
  historicalVideo,
  historicalSidecar,
  historicalManifest,
);
const prior = JSON.parse(
  await readFile(join(replayDir, "report.json"), "utf8"),
);
assert.equal(prior.schemaVersion, "motion-craft-archival-replay-1");
assert.equal(resolve(prior.historicalVideo), historicalVideo);
assert.equal(prior.assetsVerified, 20);
for (const comparison of [
  prior.currentEngineEquivalence.legacyToOptedIn,
  prior.currentEngineEquivalence.optedInToRewrite,
]) {
  assert.equal(comparison.numericPoseEqual, true);
  assert.equal(comparison.matchingFrames, historicalSidecar.frameCount);
}

const sceneNames = ["opted-in-current-engine", "signal-rewrite-current-engine"];
const sourcePaths = sceneNames.map((name) => join(replayDir, `${name}.json`));
for (const path of sourcePaths) assert.ok((await readFile(path)).length > 0);
const checkout = await createIsolatedArchivalEngine({
  projectRoot,
  commit: engineCommit,
  tempPrefix: "motion-craft-v014-engine-",
  rendererPatch: archivalCanvasPatch,
});
try {
  for (const [index, name] of sceneNames.entries())
    await writeFile(
      join(checkout, `${name}.json`),
      await readFile(sourcePaths[index]!),
    );
  const renderCode = `const { PreparedAnimationEngine } = await import('./packages/animation-engine/src/prepared-animation-engine.ts');
for (const name of ['opted-in-current-engine', 'signal-rewrite-current-engine']) {
  await new PreparedAnimationEngine().animate({ scenePath: './' + name + '.json', outputPath: ${JSON.stringify(outputDir)} + '/' + name + '-archival-transform.mp4' });
}`;
  await run(process.execPath, ["--import", "tsx", "--eval", renderCode], {
    cwd: checkout,
    maxBuffer: 8 * 1024 * 1024,
  });
  await checkArchivalFocal(
    checkout,
    sourcePaths[0]!,
    join(outputDir, "focal-report.json"),
  );
} finally {
  await rm(checkout, { recursive: true, force: true });
}

const comparisons = [];
for (const name of sceneNames) {
  const video = join(outputDir, `${name}-archival-transform.mp4`);
  const frames = await compareDecodedVideos(
    historicalVideo,
    video,
    {
      width: historicalSidecar.metrics.width,
      height: historicalSidecar.metrics.height,
      frameCount: historicalSidecar.frameCount,
    },
    2,
  );
  const hash = await sha256File(video);
  comparisons.push({
    scene: name,
    video,
    sourceSha256: await sha256File(join(replayDir, `${name}.json`)),
    outputSha256: hash,
    encodedBytesEqual: hash === historicalHash,
    decodedFramesWithinTolerance: frames.filter(
      (frame) => frame.channelsOverTolerance === 0,
    ).length,
    firstMismatchFrame:
      frames.find((frame) => frame.channelsOverTolerance > 0)?.frame ?? null,
  });
}
const report = {
  schemaVersion: "motion-craft-archival-transform-replay-1",
  historicalVideo,
  historicalSha256: historicalHash,
  engineCommit,
  rendererCompatibilityPatch: {
    path: archivalCanvasPatch.path,
    before: archivalCanvasPatch.before,
    after: archivalCanvasPatch.after,
    scope: "isolated temporary Git checkout only",
  },
  focalReport: join(outputDir, "focal-report.json"),
  focalCheckerSha256: await sha256File(
    join(projectRoot, "scripts/story-motion/check-motion-craft-v014-focal.ts"),
  ),
  comparison: comparisons,
};
await writeFile(
  join(outputDir, "report.json"),
  JSON.stringify(report, null, 2) + "\n",
  {
    flag: "wx",
  },
);
for (const comparison of comparisons)
  console.log(
    `${comparison.scene}: ${comparison.decodedFramesWithinTolerance}/${historicalSidecar.frameCount} decoded frames within ±2; encoded bytes ${comparison.encodedBytesEqual ? "equal" : "differ"}`,
  );
assert.ok(
  comparisons.every(
    (comparison) =>
      comparison.encodedBytesEqual &&
      comparison.decodedFramesWithinTolerance === historicalSidecar.frameCount,
  ),
  "v014-g archival-transform acceptance failed",
);
