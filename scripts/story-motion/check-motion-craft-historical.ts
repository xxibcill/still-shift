import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs, promisify } from "node:util";
import { compareDecodedVideos, sha256File } from "./historical-video.ts";

type Asset = { id: string; path: string; sha256: string };
type Scene = {
  fps: number;
  width: number;
  height: number;
  frameCount: number;
  rendererVersion?: string;
  assets: Asset[];
  fonts?: Asset[];
  nodes: { id: string }[];
  camera?: unknown;
  recipe?: { moves?: { keys?: unknown[] }[] };
  signals?: unknown[];
  drivers?: unknown[];
  constraints?: unknown[];
};
type Manifest = {
  sourcePath: string;
  sourceChecksum: string;
  scene: Scene;
};
type Result = {
  checksums: { source: string; output: string };
  frameCount: number;
};

const run = promisify(execFile);
const projectRoot = resolve(".");
const historicalAssetRef = "e3990bc855176984c38261a2c4c0f15c63217d24";

const { values } = parseArgs({
  options: {
    "historical-result": { type: "string" },
    "candidate-result": { type: "string" },
    "candidate-scene": { type: "string" },
    "output-dir": { type: "string" },
    "asset-ref": { type: "string", default: historicalAssetRef },
    tolerance: { type: "string", default: "2" },
    "report-only": { type: "boolean", default: false },
  },
});
for (const key of [
  "historical-result",
  "candidate-result",
  "candidate-scene",
  "output-dir",
] as const)
  assert.ok(values[key], `Pass --${key} <path>`);
const tolerance = Number(values.tolerance);
assert.ok(Number.isInteger(tolerance) && tolerance >= 0 && tolerance <= 255);
const output = resolve(values["output-dir"]!);
await mkdir(output);

async function loadRender(resultPath: string) {
  const path = resolve(resultPath);
  assert.ok(
    path.endsWith(".mp4.result.json"),
    "Expected an MP4 result sidecar",
  );
  const videoPath = path.slice(0, -".result.json".length);
  const manifestPath = `${videoPath}.scene.json`;
  const result = JSON.parse(await readFile(path, "utf8")) as Result;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  const videoChecksum = await sha256File(videoPath);
  assert.equal(
    videoChecksum,
    result.checksums.output,
    `Video checksum: ${videoPath}`,
  );
  assert.equal(manifest.sourceChecksum, result.checksums.source);
  assert.equal(manifest.scene.frameCount, result.frameCount);
  return { path, videoPath, manifestPath, manifest, videoChecksum };
}

function sourcePathInRepository(sourcePath: string): string {
  const marker = `${sep}benchmarks${sep}fixtures${sep}`;
  const offset = sourcePath.lastIndexOf(marker);
  assert.ok(offset >= 0, `Unrecognized historical source path: ${sourcePath}`);
  return sourcePath.slice(offset + 1);
}

function assetPathInRepository(manifest: Manifest, asset: Asset): string {
  const source = sourcePathInRepository(manifest.sourcePath);
  const file = resolve(projectRoot, dirname(source), asset.path);
  const path = relative(projectRoot, file);
  assert.ok(
    path.startsWith(`assets${sep}story-motion${sep}`),
    `Historical asset leaves story-motion: ${asset.path}`,
  );
  return path;
}

async function recoverArchivedAssets(manifest: Manifest, gitRef: string) {
  const recovered = [];
  for (const asset of [
    ...manifest.scene.assets,
    ...(manifest.scene.fonts ?? []),
  ]) {
    const path = assetPathInRepository(manifest, asset);
    const { stdout } = await run("git", ["show", `${gitRef}:${path}`], {
      cwd: projectRoot,
      encoding: "buffer",
      maxBuffer: 20 * 1024 * 1024,
    });
    const bytes = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
    const archiveChecksum = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    assert.equal(
      archiveChecksum,
      asset.sha256,
      `Pinned asset checksum: ${path}`,
    );
    const target = join(output, "archived-assets", path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: "wx" });
    const currentChecksum = await sha256File(join(projectRoot, path));
    recovered.push({
      id: asset.id,
      path,
      sha256: archiveChecksum,
      currentMatchesArchive: currentChecksum === archiveChecksum,
    });
  }
  return recovered;
}

async function probeVideo(path: string) {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-count_frames",
    "-show_entries",
    "stream=width,height,avg_frame_rate,nb_read_frames",
    "-of",
    "json",
    path,
  ]);
  const stream = JSON.parse(stdout).streams?.[0];
  assert.ok(stream, `No video stream: ${path}`);
  const dimensions = {
    width: Number(stream.width),
    height: Number(stream.height),
    frameCount: Number(stream.nb_read_frames),
    fps: String(stream.avg_frame_rate),
  };
  assert.ok(Object.values(dimensions).every((value) => value !== ""));
  assert.ok(
    [dimensions.width, dimensions.height, dimensions.frameCount].every(
      (value) => Number.isInteger(value) && value > 0,
    ),
    `Invalid video dimensions: ${path}`,
  );
  return dimensions;
}

function bakedKeys(scene: Scene): number {
  return (scene.recipe?.moves ?? []).reduce(
    (count, move) => count + (move.keys?.length ?? 0),
    0,
  );
}

function sceneDifferences(historical: Scene, candidate: Scene) {
  const before = new Map(historical.nodes.map((node) => [node.id, node]));
  const after = new Map(candidate.nodes.map((node) => [node.id, node]));
  const removedNodes = [...before.keys()].filter((id) => !after.has(id));
  const addedNodes = [...after.keys()].filter((id) => !before.has(id));
  const changedNodes = [...before.keys()].filter(
    (id) =>
      after.has(id) &&
      JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id)),
  );
  const priorAssets = new Map(
    historical.assets.map((asset) => [asset.id, asset.sha256]),
  );
  const changedAssets = candidate.assets
    .filter(
      (asset) =>
        priorAssets.has(asset.id) && priorAssets.get(asset.id) !== asset.sha256,
    )
    .map((asset) => asset.id);
  return {
    cameraChanged:
      JSON.stringify(historical.camera) !== JSON.stringify(candidate.camera),
    removedNodes,
    addedNodes,
    changedNodes,
    changedAssets,
    historicalBakedKeys: bakedKeys(historical),
    candidateBakedKeys: bakedKeys(candidate),
    candidateSignals: candidate.signals?.length ?? 0,
    candidateDrivers: candidate.drivers?.length ?? 0,
    candidateConstraints: candidate.constraints?.length ?? 0,
  };
}

const historical = await loadRender(values["historical-result"]!);
const candidate = await loadRender(values["candidate-result"]!);
const candidateSourceChecksum = await sha256File(
  resolve(values["candidate-scene"]!),
);
assert.equal(candidateSourceChecksum, candidate.manifest.sourceChecksum);
const assets = await recoverArchivedAssets(
  historical.manifest,
  values["asset-ref"]!,
);
const [priorVideo, nextVideo] = await Promise.all([
  probeVideo(historical.videoPath),
  probeVideo(candidate.videoPath),
]);
assert.deepEqual(
  nextVideo,
  priorVideo,
  "Video dimensions, FPS or frame count differ",
);
assert.equal(priorVideo.frameCount, historical.manifest.scene.frameCount);
assert.equal(nextVideo.frameCount, candidate.manifest.scene.frameCount);
assert.equal(priorVideo.width, historical.manifest.scene.width);
assert.equal(priorVideo.height, historical.manifest.scene.height);
assert.equal(nextVideo.width, candidate.manifest.scene.width);
assert.equal(nextVideo.height, candidate.manifest.scene.height);
const differences = await compareDecodedVideos(
  historical.videoPath,
  candidate.videoPath,
  priorVideo,
  tolerance,
);
const matchingFrames = differences.filter(
  (frame) => frame.channelsOverTolerance === 0,
).length;
const sources = sceneDifferences(
  historical.manifest.scene,
  candidate.manifest.scene,
);
const report = {
  schemaVersion: "motion-craft-historical-audit-1",
  historical: {
    result: historical.path,
    videoSha256: historical.videoChecksum,
    rendererVersion: historical.manifest.scene.rendererVersion,
    assetRef: values["asset-ref"],
    assets,
  },
  candidate: {
    result: candidate.path,
    source: resolve(values["candidate-scene"]!),
    sourceSha256: candidateSourceChecksum,
    videoSha256: candidate.videoChecksum,
    rendererVersion: candidate.manifest.scene.rendererVersion,
  },
  sourceDifferences: sources,
  decodedComparison: {
    dimensions: priorVideo,
    perChannelTolerance: tolerance,
    matchingFrames,
    firstMismatchFrame:
      differences.find((frame) => frame.channelsOverTolerance > 0)?.frame ??
      null,
    frames: differences,
  },
  mc3HistoricalVideoAccepted:
    matchingFrames === priorVideo.frameCount &&
    sources.candidateBakedKeys === 0 &&
    sources.candidateSignals > 0 &&
    sources.candidateDrivers > 0 &&
    sources.candidateConstraints > 0,
};
await writeFile(
  join(output, "report.json"),
  JSON.stringify(report, null, 2) + "\n",
  {
    flag: "wx",
  },
);
console.log(
  `Compared ${priorVideo.frameCount} decoded frames: ${matchingFrames} within ±${tolerance} per channel. Report: ${join(output, "report.json")}`,
);
if (!report.mc3HistoricalVideoAccepted && !values["report-only"])
  process.exitCode = 1;
