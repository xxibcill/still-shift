import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NoopAnimationEngine } from "@still-shift/animation-engine";
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
      durationMs: 5000,
      fps: 30,
      width: 1920,
      height: 1080,
      preset: "auto",
      intensity: "standard",
      seed: 1842,
    });
  });
});
