import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NoopAnimationEngine } from "@still-shift/animation-engine";
import {
  V0_1_REQUEST_CONSTRAINTS,
  V0_1_REQUEST_DEFAULTS,
} from "@still-shift/scene-contract";
import { afterAll, beforeAll, bench, describe } from "vitest";

let outputDirectory: string;

beforeAll(async () => {
  outputDirectory = await mkdtemp(join(tmpdir(), "still-shift-bench-"));
});

afterAll(async () => {
  await rm(outputDirectory, { recursive: true });
});

describe("v0.1 no-op engine", () => {
  bench("deterministic end-to-end request", async () => {
    await new NoopAnimationEngine().animate({
      inputPath: "tests/fixtures/source-placeholder.txt",
      outputPath: join(outputDirectory, "benchmark.noop.json"),
      durationMs: V0_1_REQUEST_DEFAULTS.durationMs,
      fps: V0_1_REQUEST_CONSTRAINTS.fps,
      width: V0_1_REQUEST_CONSTRAINTS.width,
      height: V0_1_REQUEST_CONSTRAINTS.height,
      preset: V0_1_REQUEST_DEFAULTS.preset,
      intensity: V0_1_REQUEST_DEFAULTS.intensity,
      seed: V0_1_REQUEST_DEFAULTS.seed,
    });
  });
});
