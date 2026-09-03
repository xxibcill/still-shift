import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  AnimationResultSchema,
  SceneManifestSchema,
  V0_1_REQUEST_CONSTRAINTS,
  V0_1_REQUEST_DEFAULTS,
} from "@still-shift/scene-contract";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

const explicitAnimationOptions = [
  "--duration",
  "5",
  "--preset",
  "auto",
  "--intensity",
  "standard",
  "--seed",
  "1842",
];

const runNoopCli = async (
  outputPath: string,
  animationOptions = explicitAnimationOptions,
) => {
  const { stdout, stderr } = await execFileAsync(
    join(process.cwd(), "node_modules/.bin/tsx"),
    [
      "tools/still-shift-cli/src/cli.ts",
      "animate",
      "--input",
      "tests/fixtures/source-placeholder.txt",
      "--output",
      outputPath,
      ...animationOptions,
    ],
  );

  expect(stderr).toBe("");
  return AnimationResultSchema.parse(JSON.parse(stdout));
};

describe("no-op CLI", () => {
  it("completes the animation-engine path deterministically", async () => {
    const directory = await mkdtemp(join(tmpdir(), "still-shift-test-"));
    temporaryDirectories.push(directory);

    const firstResult = await runNoopCli(join(directory, "first.noop.json"));
    const secondResult = await runNoopCli(join(directory, "second.noop.json"));
    const firstScene = SceneManifestSchema.parse(
      JSON.parse(await readFile(firstResult.sceneManifestPath, "utf8")),
    );
    const secondScene = SceneManifestSchema.parse(
      JSON.parse(await readFile(secondResult.sceneManifestPath, "utf8")),
    );

    expect(firstResult.apiVersion).toBe("0.1");
    expect(firstResult.frameCount).toBe(150);
    expect(firstResult.selectedPreset).toBe("slow_push");
    expect(firstResult.checksums).toEqual(secondResult.checksums);
    expect(firstScene).toEqual(secondScene);
    expect(firstScene.execution).toEqual({
      adapter: "noop",
      producesVideo: false,
    });
  });

  it("returns a stable machine-readable input error", async () => {
    const directory = await mkdtemp(join(tmpdir(), "still-shift-test-"));
    temporaryDirectories.push(directory);

    await expect(
      execFileAsync(join(process.cwd(), "node_modules/.bin/tsx"), [
        "tools/still-shift-cli/src/cli.ts",
        "animate",
        "--input",
        join(directory, "missing.png"),
        "--output",
        join(directory, "output.noop.json"),
      ]),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('"code":"INPUT_UNREADABLE"'),
    });
  });

  it("uses the shared v0.1 request defaults", async () => {
    const directory = await mkdtemp(join(tmpdir(), "still-shift-test-"));
    temporaryDirectories.push(directory);

    const result = await runNoopCli(join(directory, "default.noop.json"), []);
    const scene = SceneManifestSchema.parse(
      JSON.parse(await readFile(result.sceneManifestPath, "utf8")),
    );

    expect(scene.timeline).toEqual({
      durationMs: V0_1_REQUEST_DEFAULTS.durationMs,
      fps: V0_1_REQUEST_CONSTRAINTS.fps,
      frameCount:
        (V0_1_REQUEST_DEFAULTS.durationMs * V0_1_REQUEST_CONSTRAINTS.fps) /
        1000,
    });
    expect(scene.canvas).toEqual({
      width: V0_1_REQUEST_CONSTRAINTS.width,
      height: V0_1_REQUEST_CONSTRAINTS.height,
    });
    expect(scene.motion).toMatchObject({
      intensity: V0_1_REQUEST_DEFAULTS.intensity,
      seed: V0_1_REQUEST_DEFAULTS.seed,
    });
  });
});
