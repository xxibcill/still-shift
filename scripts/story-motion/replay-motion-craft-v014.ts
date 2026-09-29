import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { PreparedAnimationEngine } from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import {
  evaluatePreparedNode,
  sampleTrack,
} from "../../packages/renderer-core/src/prepared-scene.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import {
  compareDecodedVideos,
  sha256File,
  verifyV014HistoricalIdentity,
} from "./historical-video.ts";

const { values } = parseArgs({
  options: {
    "historical-result": { type: "string" },
    "archived-assets": { type: "string" },
    "output-dir": { type: "string" },
  },
});
for (const key of [
  "historical-result",
  "archived-assets",
  "output-dir",
] as const)
  assert.ok(values[key], `Pass --${key} <path>`);
const projectRoot = resolve(".");
const output = resolve(values["output-dir"]!);
const assetRoot = resolve(values["archived-assets"]!);
await mkdir(output);

type ArchivedAsset = { id: string; path: string; sha256: string };

function assetPath(sourcePath: string, asset: ArchivedAsset) {
  const marker = `${sep}benchmarks${sep}fixtures${sep}`;
  const offset = sourcePath.lastIndexOf(marker);
  assert.ok(offset >= 0, "Archived source path is not a known fixture");
  const source = sourcePath.slice(offset + 1);
  const path = relative(
    projectRoot,
    resolve(projectRoot, dirname(source), asset.path),
  );
  assert.ok(path.startsWith(`assets${sep}story-motion${sep}`));
  return join(assetRoot, path);
}

async function archivalSource(resultPath: string) {
  const path = resolve(resultPath);
  assert.ok(path.endsWith(".mp4.result.json"));
  const video = path.slice(0, -".result.json".length);
  const result = JSON.parse(await readFile(path, "utf8"));
  const manifest = JSON.parse(await readFile(`${video}.scene.json`, "utf8"));
  await verifyV014HistoricalIdentity(video, result, manifest);
  const input = Object.fromEntries(
    Object.entries(manifest.scene).filter(([key]) =>
      Object.hasOwn(StorySceneSchema.shape, key),
    ),
  );
  const assets = [
    ...(input.assets as ArchivedAsset[]),
    ...((input.fonts ?? []) as ArchivedAsset[]),
  ];
  for (const asset of assets) {
    const restored = assetPath(manifest.sourcePath, asset);
    assert.equal(await sha256File(restored), asset.sha256, asset.id);
    asset.path = restored;
  }
  const camera = input.camera as { cover?: string[] };
  assert.deepEqual(camera.cover, ["paper"]);
  input.camera = { ...camera, cover: [] };
  const scene = StorySceneSchema.parse(input);
  assert.equal(scene.frameCount, 192);
  assert.equal(scene.recipe.preset, "unequal_margins");
  return { scene, video, assetsVerified: assets.length };
}

function signalRewrite(source: ReturnType<typeof StorySceneSchema.parse>) {
  const absolutePressureMoves = source.recipe.moves.filter(
    (move) =>
      move.node === "pressure-b" &&
      move.keys?.some((key) => key.x !== undefined),
  );
  assert.equal(absolutePressureMoves.length, 1);
  assert.equal(absolutePressureMoves[0]!.blend, undefined);
  const optedIn = StorySceneSchema.parse({
    ...source,
    motionModel: "curves-1",
    recipe: {
      ...source.recipe,
      moves: source.recipe.moves.map((move) =>
        move === absolutePressureMoves[0]
          ? { ...move, blend: "replace" }
          : move,
      ),
    },
  });
  const compiled = compileStoryScene(optedIn);
  const moveLayers = compiled.compiledMotion!.layers.filter((layer) =>
    layer.path.startsWith("/recipe/moves/"),
  );
  assert.equal(moveLayers.length, 5, "Expected five v014-g move properties");
  const pressureKeys = compiled.tracks["pressure-b"]?.x;
  assert.ok(pressureKeys);
  const pressureBaseX = sampleTrack(pressureKeys, 150, compiled.fps);
  for (let frame = 150; frame < compiled.frameCount; frame++)
    assert.equal(sampleTrack(pressureKeys, frame, compiled.fps), pressureBaseX);
  const signals = moveLayers.map((layer, index) => {
    assert.ok(layer.keys && !layer.spatial && !layer.periodic);
    const offset =
      layer.node === "pressure-b" && layer.property === "x" ? pressureBaseX : 0;
    return {
      id: `archived-move-${index}`,
      keys: layer.keys.map((key) => ({
        frame: key.time,
        value: key.value - offset,
        ...(key.easing ? { easing: key.easing } : {}),
        ...(key.interpolation ? { interpolation: key.interpolation } : {}),
      })),
    };
  });
  const drivers = moveLayers.map((layer, index) => ({
    target: `${layer.node}.${layer.property}`,
    signal: signals[index]!.id,
    layer: layer.layer,
    blend:
      layer.node === "pressure-b" && layer.property === "x"
        ? "add"
        : layer.blend,
    ...(layer.blend === "replace" &&
    layer.start > 0 &&
    layer.node !== "pressure-b"
      ? {
          weight: [
            { frame: 0, value: 0 },
            { frame: layer.start, value: 1, interpolation: "hold" },
          ],
        }
      : {}),
  }));
  const rewritten = StorySceneSchema.parse({
    ...optedIn,
    recipe: { ...optedIn.recipe, moves: [] },
    signals,
    drivers,
  });
  return { optedIn, rewritten, moveLayers: moveLayers.length, pressureBaseX };
}

function verifyNumericPoses(
  before: ReturnType<typeof StorySceneSchema.parse>,
  after: ReturnType<typeof StorySceneSchema.parse>,
) {
  const a = compileStoryScene(before);
  const b = compileStoryScene(after);
  assert.equal(a.frameCount, b.frameCount);
  for (let frame = 0; frame < a.frameCount; frame++)
    for (const node of a.nodes) {
      const counterpart = b.nodes.find((item) => item.id === node.id);
      assert.ok(counterpart, `Missing ${node.id}`);
      assert.deepEqual(
        evaluatePreparedNode(b, counterpart, frame),
        evaluatePreparedNode(a, node, frame),
        `${node.id} pose differs at frame ${frame}`,
      );
    }
}

async function render(
  scene: ReturnType<typeof StorySceneSchema.parse>,
  name: string,
) {
  const source = join(output, `${name}.json`);
  const video = join(output, `${name}.mp4`);
  await writeFile(source, JSON.stringify(scene, null, 2) + "\n", {
    flag: "wx",
  });
  await new PreparedAnimationEngine().animate({
    scenePath: source,
    outputPath: video,
  });
  return video;
}

const archived = await archivalSource(values["historical-result"]!);
const { optedIn, rewritten, moveLayers, pressureBaseX } = signalRewrite(
  archived.scene,
);
verifyNumericPoses(archived.scene, optedIn);
verifyNumericPoses(optedIn, rewritten);
const baselineVideo = await render(archived.scene, "legacy-current-engine");
const optedInVideo = await render(optedIn, "opted-in-current-engine");
const rewrittenVideo = await render(rewritten, "signal-rewrite-current-engine");
const dimensions = {
  width: archived.scene.width,
  height: archived.scene.height,
  frameCount: archived.scene.frameCount,
};
const [archiveDrift, legacyToOptedIn, optedInToRewrite] = await Promise.all([
  compareDecodedVideos(archived.video, baselineVideo, dimensions, 2),
  compareDecodedVideos(baselineVideo, optedInVideo, dimensions, 0),
  compareDecodedVideos(optedInVideo, rewrittenVideo, dimensions, 0),
]);
const comparison = (frames: typeof archiveDrift, tolerance: number) => ({
  perChannelTolerance: tolerance,
  matchingFrames: frames.filter((frame) => frame.channelsOverTolerance === 0)
    .length,
  firstMismatchFrame:
    frames.find((frame) => frame.channelsOverTolerance > 0)?.frame ?? null,
  frames,
});
const archiveComparison = comparison(archiveDrift, 2);
const legacyComparison = comparison(legacyToOptedIn, 0);
const rewriteComparison = comparison(optedInToRewrite, 0);
const report = {
  schemaVersion: "motion-craft-archival-replay-1",
  historicalVideo: archived.video,
  assetsVerified: archived.assetsVerified,
  compatibilityAdjustments: [
    {
      field: "camera.cover",
      archivedValue: ["paper"],
      replayValue: [],
      reason:
        "The archived transparent paper is rejected by current alpha coverage validation.",
    },
    {
      field: "recipe.moves[pressure-b].blend",
      archivedValue: "implicit legacy absolute x",
      optedInValue: "replace",
      reason:
        "The current-role default is additive in the opt-in motion model.",
    },
  ],
  source: {
    archivedMoveKeys: archived.scene.recipe.moves.reduce(
      (count, move) => count + (move.keys?.length ?? 0),
      0,
    ),
    rewrittenMoveKeys: rewritten.recipe.moves.reduce(
      (count, move) => count + (move.keys?.length ?? 0),
      0,
    ),
    signalCount: rewritten.signals?.length ?? 0,
    driverCount: rewritten.drivers?.length ?? 0,
    moveLayers,
    pressureBaseX,
    pressureRewrite:
      "additive offset from the stable legacy x track after frame 150",
  },
  currentEngineEquivalence: {
    rendererVersion: compileStoryScene(rewritten).rendererVersion,
    legacyToOptedIn: { numericPoseEqual: true, ...legacyComparison },
    optedInToRewrite: { numericPoseEqual: true, ...rewriteComparison },
  },
  archivedVideoDrift: archiveComparison,
};
await writeFile(
  join(output, "report.json"),
  JSON.stringify(report, null, 2) + "\n",
  {
    flag: "wx",
  },
);
console.log(
  `Current-engine legacy→opt-in: ${legacyComparison.matchingFrames}/${dimensions.frameCount}; opt-in→rewrite: ${rewriteComparison.matchingFrames}/${dimensions.frameCount} exact decoded frames. Archived replay: ${archiveComparison.matchingFrames}/${dimensions.frameCount} within ±2.`,
);
if (
  legacyComparison.matchingFrames !== dimensions.frameCount ||
  rewriteComparison.matchingFrames !== dimensions.frameCount
)
  process.exitCode = 1;
