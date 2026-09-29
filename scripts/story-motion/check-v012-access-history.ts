import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import { chromium } from "playwright";
import { createServer } from "vite";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { PreparedAnimationEngine } from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import { runtimeBrowserUrl } from "@still-shift/execution-runtime/browser";
import {
  compilePreparedScene,
  evaluatePreparedNodeAtTime,
} from "../../packages/renderer-core/src/prepared-scene.ts";
import { evaluateStoryPath } from "../../packages/renderer-core/src/story-geometry.ts";
import { measureMotionEnergy } from "./motion-energy.ts";
import { sha256File } from "./historical-video.ts";

const run = promisify(execFile);
const projectRoot = resolve(".");
const pinnedEngine = "21b1602d2e45326d292e88836d34fd8dde5cc362";
const pinnedVideo =
  "sha256:5511c3c9660be5075c3872cdd563686c299155bf96c4c95869bcac9347bb6e27";
const pinnedSource =
  "sha256:84fefa2a18ed061e1fc585d3af6957492c1b089eff8587479275b37dcf10b856";
const rendererPath = "packages/renderer-core/src/illustrated-renderer.ts";
const currentTransform = "    ctx.transform(...nodeMatrix(node, state));";
const archivalTransform = `    const ox = node.width * node.origin[0];
    const oy = node.height * node.origin[1];
    ctx.translate(state.x + ox, state.y + oy);
    ctx.rotate((state.rotation * Math.PI) / 180);
    ctx.scale(state.scaleX, state.scaleY);
    ctx.translate(-ox, -oy);`;

const { values } = parseArgs({
  options: {
    "historical-result": { type: "string" },
    "output-dir": { type: "string" },
  },
});
assert.ok(values["historical-result"], "Pass --historical-result <path>");
assert.ok(values["output-dir"], "Pass --output-dir <new-directory>");
const resultPath = resolve(values["historical-result"]);
assert.ok(resultPath.endsWith(".mp4.result.json"));
const historicalVideo = resultPath.slice(0, -".result.json".length);
const outputDir = resolve(values["output-dir"]);
await mkdir(outputDir);

const historicalResult = JSON.parse(await readFile(resultPath, "utf8"));
const manifest = JSON.parse(
  await readFile(`${historicalVideo}.scene.json`, "utf8"),
);
assert.equal(await sha256File(historicalVideo), pinnedVideo);
assert.equal(historicalResult.checksums.output, pinnedVideo);
assert.equal(historicalResult.checksums.source, pinnedSource);
assert.equal(manifest.sourceChecksum, pinnedSource);
assert.equal(manifest.scene.recipe.preset, "access_constraint");
assert.equal(manifest.scene.frameCount, 192);

const input = Object.fromEntries(
  Object.entries(manifest.scene).filter(([key]) =>
    Object.hasOwn(StorySceneSchema.shape, key),
  ),
);
const scene = StorySceneSchema.parse(input);
for (const asset of [...scene.assets, ...(scene.fonts ?? [])]) {
  const path = resolve(
    projectRoot,
    "benchmarks/fixtures/story-motion",
    asset.path,
  );
  assert.equal(await sha256File(path), asset.sha256, asset.id);
  asset.path = path;
}
const compiled = compilePreparedScene(scene);
assert.deepEqual(
  compiled.tracks,
  manifest.scene.tracks,
  "Current and archived Access tracks differ",
);
const evaluatedPose = (frame: number) =>
  JSON.stringify(
    compiled.nodes.map((node) => [
      node.id,
      evaluatePreparedNodeAtTime(compiled, node, frame),
      node.type === "path" ? evaluateStoryPath(compiled, node, frame) : null,
    ]),
  );
const settledPose = evaluatedPose(114);
for (let frame = 115; frame < 192; frame += 1)
  assert.equal(evaluatedPose(frame), settledPose, `Frame ${frame} is not held`);

async function rawCanvasHold() {
  const assetPaths = Object.fromEntries(
    [...scene.assets, ...(scene.fonts ?? [])].map((asset) => [
      asset.id,
      asset.path,
    ]),
  );
  const server = await createServer({
    root: projectRoot,
    configFile: false,
    logLevel: "silent",
    server: {
      host: "127.0.0.1",
      port: 0,
      fs: { allow: [projectRoot] },
    },
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript("window.__name = (fn) => fn;");
    await page.goto(
      runtimeBrowserUrl(server.resolvedUrls!.local[0]!, "export"),
    );
    return await page.evaluate(
      async ({ root, compiled, paths }) => {
        const { createIllustratedPreview, loadIllustratedImages } =
          await import(
            `/@fs/${root}/packages/renderer-core/src/illustrated-renderer.ts`
          );
        const images = await loadIllustratedImages(
          compiled,
          (id: string) => `/@fs${paths[id]}`,
        );
        const canvas = document.createElement("canvas");
        canvas.width = compiled.width;
        canvas.height = compiled.height;
        const preview = createIllustratedPreview(canvas, compiled, images);
        const sampled = [114, 115, 116, 117, 118, 119, 120, 121, 122, 191, 114];
        let previous: Uint8ClampedArray | undefined;
        const changedChannels: number[] = [];
        for (const frame of sampled) {
          preview.renderFrame(frame);
          const pixels = canvas
            .getContext("2d")!
            .getImageData(0, 0, canvas.width, canvas.height).data;
          if (previous) {
            let changed = 0;
            for (let i = 0; i < pixels.length; i += 1)
              if (pixels[i] !== previous[i]) changed += 1;
            changedChannels.push(changed);
          }
          previous = new Uint8ClampedArray(pixels);
        }
        preview.dispose();
        return { sampled, changedChannels };
      },
      { root: projectRoot, compiled, paths: assetPaths },
    );
  } finally {
    await browser.close();
    await server.close();
  }
}
const rawHold = await rawCanvasHold();
assert.ok(rawHold.changedChannels.every((count) => count === 0));

const scenePath = join(outputDir, "access-constraint.json");
await writeFile(scenePath, JSON.stringify(scene, null, 2) + "\n");
const currentVideo = join(outputDir, "current-transform.mp4");
await new PreparedAnimationEngine().animate({
  scenePath,
  outputPath: currentVideo,
});

async function isolatedEngine() {
  const checkout = await mkdtemp(
    join(await realpath(tmpdir()), "story-v012-access-engine-"),
  );
  try {
    const archive = join(checkout, "source.tar");
    await run("git", ["archive", pinnedEngine, "-o", archive], {
      cwd: projectRoot,
    });
    await run("tar", ["-xf", archive, "-C", checkout]);
    await rm(archive);
    const modules = join(checkout, "node_modules");
    await mkdir(modules);
    for (const entry of await readdir(join(projectRoot, "node_modules"), {
      withFileTypes: true,
    })) {
      if (
        entry.name.startsWith(".") ||
        entry.name === "@still-shift" ||
        entry.name === "three"
      )
        continue;
      await symlink(
        await realpath(join(projectRoot, "node_modules", entry.name)),
        join(modules, entry.name),
      );
    }
    await symlink(
      await realpath(
        join(projectRoot, "packages/renderer-core/node_modules/three"),
      ),
      join(modules, "three"),
    );
    const workspaceModules = join(modules, "@still-shift");
    await mkdir(workspaceModules);
    for (const name of [
      "execution-runtime",
      "renderer-core",
      "scene-contract",
      "animation-engine",
    ])
      await symlink(
        join(checkout, "packages", name),
        join(workspaceModules, name),
      );
    const file = join(checkout, rendererPath);
    const source = await readFile(file, "utf8");
    assert.equal(source.split(currentTransform).length, 2);
    await writeFile(file, source.replace(currentTransform, archivalTransform));
    return checkout;
  } catch (error) {
    await rm(checkout, { recursive: true, force: true });
    throw error;
  }
}

const archivalVideo = join(outputDir, "archival-transform.mp4");
const checkout = await isolatedEngine();
try {
  const code = `const { PreparedAnimationEngine } = await import('./packages/animation-engine/src/prepared-animation-engine.ts');
await new PreparedAnimationEngine().animate({ scenePath: ${JSON.stringify(scenePath)}, outputPath: ${JSON.stringify(archivalVideo)} });`;
  await run(process.execPath, ["--import", "tsx", "--eval", code], {
    cwd: checkout,
    maxBuffer: 8 * 1024 * 1024,
  });
} finally {
  await rm(checkout, { recursive: true, force: true });
}

const frameHashes = async (file: string) => {
  const { stdout } = await run(
    "ffmpeg",
    ["-v", "error", "-i", file, "-map", "0:v:0", "-f", "framemd5", "-"],
    { maxBuffer: 1024 * 1024 },
  );
  return stdout.split("\n").filter((line) => line && !line.startsWith("#"));
};
const [historicalFrames, currentFrames, archivalFrames] = await Promise.all([
  frameHashes(historicalVideo),
  frameHashes(currentVideo),
  frameHashes(archivalVideo),
]);
assert.equal(historicalFrames.length, 192);
const matchingFrames = (frames: string[]) =>
  frames.filter((hash, index) => hash === historicalFrames[index]).length;
const currentMatching = matchingFrames(currentFrames);
const archivalMatching = matchingFrames(archivalFrames);
const energy = await measureMotionEnergy(historicalVideo, {
  width: 480,
  height: 270,
  fps: 24,
  pixelThreshold: 6,
  minimumChangedPixels: 7,
});
const holdPattern = energy.changedPixels.slice(117, 125);
const report = {
  schemaVersion: "story-v012-access-history-1",
  historicalVideo,
  historicalSha256: pinnedVideo,
  sourceSha256: pinnedSource,
  pinnedEngine,
  currentTransform: {
    video: currentVideo,
    matchingFrames: currentMatching,
    firstMismatch: currentFrames.findIndex(
      (hash, index) => hash !== historicalFrames[index],
    ),
  },
  archivalTransform: {
    video: archivalVideo,
    matchingFrames: archivalMatching,
    encodedBytesEqual: (await sha256File(archivalVideo)) === pinnedVideo,
  },
  heldPoseFrames: [114, 191],
  rawCanvasHold: rawHold,
  heldDecodedPattern: holdPattern,
  movingPixelMinimum: 7,
};
await writeFile(
  join(outputDir, "report.json"),
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
assert.equal(archivalMatching, 192);
assert.equal(report.archivalTransform.encodedBytesEqual, true);
assert.deepEqual(holdPattern, [3, 3, 0, 0, 3, 3, 0, 0]);
console.log(JSON.stringify(report, null, 2));
