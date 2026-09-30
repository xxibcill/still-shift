import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  loadPreparedScene,
  PreparedAnimationEngine,
} from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import { exportScene } from "../../packages/execution-runtime/src/export-worker.ts";
import { RENDER_BROWSER_PROFILE } from "../../packages/execution-runtime/src/render-browser.ts";
import { writeExportScene } from "../fixtures/export-scene.ts";

let directory: string;
let scenePath: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "still-shift-export-renderer-"));
  scenePath = await writeExportScene(directory);
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("export render environment", () => {
  it("records the pinned software renderer in the result manifest", async () => {
    const outputPath = join(directory, "output.mp4");
    await new PreparedAnimationEngine().animate({ scenePath, outputPath });
    const result = JSON.parse(
      await readFile(`${outputPath}.result.json`, "utf8"),
    ) as { metrics: { renderEnvironment: Record<string, string> } };
    expect(result.metrics.renderEnvironment).toMatchObject({
      profile: RENDER_BROWSER_PROFILE,
      platform: process.platform,
      arch: process.arch,
    });
    expect(result.metrics.renderEnvironment.webglRenderer).toContain(
      "SwiftShader",
    );
    expect(result.metrics.renderEnvironment.rasterFingerprint).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
  }, 120_000);

  it("refuses to export on an unpinned renderer and publishes nothing", async () => {
    const prepared = await loadPreparedScene(scenePath);
    await expect(
      exportScene({
        scene: prepared.scene,
        sourcePath: scenePath,
        depthPath: null,
        assetPaths: prepared.assetPaths,
        outputPath: join(directory, "hardware.mp4"),
        browserProfile: "hardware",
      }),
    ).rejects.toMatchObject({
      code: "RENDER_FAILED",
      context: { diagnostic: "export-renderer-mismatch" },
    });
    expect((await readdir(directory)).sort()).toEqual([
      "scene.json",
      "source.svg",
    ]);
  }, 120_000);
});
