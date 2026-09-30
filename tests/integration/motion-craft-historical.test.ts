import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { evaluatePreparedNode } from "../../packages/renderer-core/src/prepared-scene.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import {
  V014_ARCHIVED_MP4_SHA256,
  V014_ARCHIVED_SOURCE_SHA256,
  compareDecodedVideos,
  measureRgbDifference,
  sha256File,
  verifyV014HistoricalIdentity,
} from "../../scripts/story-motion/historical-video.ts";

const run = promisify(execFile);

it("rejects a replacement historical video even when its sidecar is updated", async () => {
  const directory = await mkdtemp(join(tmpdir(), "still-shift-v014-identity-"));
  try {
    const video = join(directory, "unequal-margins.mp4");
    const resultPath = `${video}.result.json`;
    const manifestPath = `${video}.scene.json`;
    await writeFile(video, "replacement video bytes");
    const replacementHash = await sha256File(video);
    expect(replacementHash).not.toBe(V014_ARCHIVED_MP4_SHA256);
    await writeFile(
      resultPath,
      JSON.stringify({
        checksums: {
          source: V014_ARCHIVED_SOURCE_SHA256,
          output: replacementHash,
        },
      }),
    );
    await writeFile(
      manifestPath,
      JSON.stringify({ sourceChecksum: V014_ARCHIVED_SOURCE_SHA256 }),
    );
    const result = JSON.parse(await readFile(resultPath, "utf8"));
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    await expect(
      verifyV014HistoricalIdentity(video, result, manifest),
    ).rejects.toThrow(/pinned video/);

    const replacementSource = `sha256:${"0".repeat(64)}`;
    result.checksums.source = replacementSource;
    manifest.sourceChecksum = replacementSource;
    await expect(
      verifyV014HistoricalIdentity(video, result, manifest),
    ).rejects.toThrow(/pinned source/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("measures the exact RGB channel and pixel of the first violation", () => {
  const result = measureRgbDifference(
    Uint8Array.from([10, 20, 30, 40, 50, 60]),
    Uint8Array.from([10, 22, 30, 40, 50, 68]),
    2,
    2,
    7,
  );
  expect(result).toEqual({
    frame: 7,
    maxChannelDelta: 8,
    meanAbsoluteDelta: 10 / 6,
    channelsOverTolerance: 1,
    firstDifference: { x: 1, y: 0, channel: "b" },
  });
});

it("compares every decoded frame, including the last frame", async () => {
  const directory = await mkdtemp(join(tmpdir(), "still-shift-historical-"));
  try {
    const red = join(directory, "red.mkv");
    const blue = join(directory, "blue.mkv");
    for (const [color, path] of [
      ["red", red],
      ["blue", blue],
    ] as const)
      await run("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        `color=c=${color}:s=4x4:r=2`,
        "-frames:v",
        "2",
        "-c:v",
        "ffv1",
        "-pix_fmt",
        "yuv444p",
        path,
      ]);
    const dimensions = { width: 4, height: 4, frameCount: 2 };
    const exact = await compareDecodedVideos(red, red, dimensions, 0);
    const changed = await compareDecodedVideos(red, blue, dimensions, 2);
    expect(exact).toHaveLength(2);
    expect(exact.every((frame) => frame.channelsOverTolerance === 0)).toBe(
      true,
    );
    expect(changed).toHaveLength(2);
    expect(changed.every((frame) => frame.channelsOverTolerance > 0)).toBe(
      true,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("preserves absolute current-role x keys through replace and offset-driver migration", () => {
  const source = JSON.parse(
    readFileSync(
      "benchmarks/fixtures/story-motion-v2/unequal-margins.json",
      "utf8",
    ),
  );
  const legacy = compileStoryScene(StorySceneSchema.parse(source));
  const implicit = compileStoryScene(
    StorySceneSchema.parse({ ...source, motionModel: "curves-1" }),
  );
  const currentMove = source.recipe.moves.at(-1);
  expect(currentMove.node).toBe("pressure-b");
  const optedIn = compileStoryScene(
    StorySceneSchema.parse({
      ...source,
      motionModel: "curves-1",
      recipe: {
        ...source.recipe,
        moves: [
          ...source.recipe.moves.slice(0, -1),
          { ...currentMove, blend: "replace" },
        ],
      },
    }),
  );
  const rewritten = compileStoryScene(
    StorySceneSchema.parse({
      ...source,
      motionModel: "curves-1",
      recipe: { ...source.recipe, moves: source.recipe.moves.slice(0, -1) },
      signals: [
        {
          id: "current-offset",
          keys: [
            { frame: 150, value: 0 },
            { frame: 162, value: -2, easing: "in-out-sine" },
            { frame: 174, value: 0, easing: "in-out-sine" },
            { frame: 186, value: -2, easing: "in-out-sine" },
            { frame: 191, value: -1.5, easing: "linear" },
          ],
        },
      ],
      drivers: [
        {
          target: "pressure-b.x",
          signal: "current-offset",
          layer: "current",
          blend: "add",
        },
      ],
    }),
  );
  const x = (scene: typeof legacy, frame: number) =>
    evaluatePreparedNode(
      scene,
      scene.nodes.find((node) => node.id === "pressure-b")!,
      frame,
    ).x;
  expect(x(implicit, 0)).not.toBe(x(legacy, 0));
  for (let frame = 0; frame < 192; frame++) {
    expect(x(optedIn, frame), `opt-in frame ${frame}`).toBe(x(legacy, frame));
    expect(x(rewritten, frame), `rewrite frame ${frame}`).toBe(
      x(legacy, frame),
    );
  }
});
