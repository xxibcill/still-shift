import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WorkerResultSchema } from "../../apps/lab/lab-contract.ts";
import {
  DEPTH_WORKER_PROTOCOL_VERSION,
  DepthNormalizedResponseSchema,
  DepthPreparedResponseSchema,
  DepthWorkerFailureSchema,
  DepthWorkerResponseSchema,
  parseDepthPreparationResponse,
  parseDepthWorkerResponse,
} from "../../packages/scene-contract/src/depth-worker.ts";

const run = promisify(execFile);
const python = resolve(".venv/bin/python");
let directory: string;
let source: string;

async function worker(...args: string[]) {
  const invocation = ["-m", "still_shift_depth.cli", ...args];
  try {
    const { stdout } = await run(python, invocation);
    return { exitCode: 0, value: JSON.parse(stdout) as unknown };
  } catch (error) {
    const failure = error as { code: number; stdout: string };
    if (typeof failure.stdout !== "string" || !failure.stdout) throw error;
    return {
      exitCode: failure.code,
      value: JSON.parse(failure.stdout) as unknown,
    };
  }
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "still-shift-depth-protocol-"));
  source = join(directory, "source.png");
  await run(python, [
    "-c",
    'import sys; from PIL import Image; Image.new("RGB", (12, 9), "green").save(sys.argv[1])',
    source,
  ]);
});

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("Python depth worker response contract", () => {
  it("shares fake preparation and cache-hit results with both consumers", async () => {
    const args = [
      "prepare",
      "--input",
      source,
      "--adapter",
      "fake",
      "--cache-dir",
      join(directory, "prepared"),
    ];
    const first = await worker(...args);
    const second = await worker(...args);
    expect([first.exitCode, second.exitCode]).toEqual([0, 0]);
    const prepared = DepthPreparedResponseSchema.parse(first.value);
    const cached = DepthPreparedResponseSchema.parse(second.value);
    expect(prepared).toMatchObject({
      protocolVersion: DEPTH_WORKER_PROTOCOL_VERSION,
      status: "prepared",
      cacheStatus: "miss",
      dimensions: { normalized: { width: 12, height: 9 } },
    });
    expect(cached.cacheStatus).toBe("hit");
    expect(cached.checksums).toEqual(prepared.checksums);
    expect(cached.cacheKey).toBe(prepared.cacheKey);
    for (const { value } of [first, second]) {
      expect(WorkerResultSchema.parse(value)).toEqual(
        DepthWorkerResponseSchema.parse(value),
      );
    }
    const malformed = {
      ...prepared,
      metrics: { ...prepared.metrics, inferenceMs: "bad" },
    };
    expect(WorkerResultSchema.safeParse(malformed).success).toBe(false);
    expect(parseDepthPreparationResponse(malformed)).toEqual(
      parseDepthWorkerResponse(malformed),
    );
    expect(parseDepthWorkerResponse(malformed)).toMatchObject({
      status: "failed",
      error: { code: "PREPARATION_FAILED" },
    });
  });

  it("validates normalization without depth and its cache hit", async () => {
    const args = [
      "normalize",
      "--input",
      source,
      "--cache-dir",
      join(directory, "normalized"),
    ];
    const first = await worker(...args);
    const second = await worker(...args);
    expect([first.exitCode, second.exitCode]).toEqual([0, 0]);
    const normalized = DepthNormalizedResponseSchema.parse(first.value);
    const cached = DepthNormalizedResponseSchema.parse(second.value);
    expect(normalized.cacheStatus).toBe("miss");
    expect(cached.cacheStatus).toBe("hit");
    expect(cached.checksum).toEqual(normalized.checksum);
    expect(DepthWorkerResponseSchema.parse(first.value)).toEqual(normalized);
    expect(WorkerResultSchema.safeParse(first.value).success).toBe(false);
    expect(parseDepthPreparationResponse(first.value)).toMatchObject({
      status: "failed",
      error: { code: "PREPARATION_FAILED" },
    });
  });

  it.each(["prepare", "normalize"])(
    "preserves input failure codes for %s",
    async (command) => {
      const result = await worker(
        command,
        "--input",
        join(directory, "missing.png"),
        ...(command === "prepare" ? ["--adapter", "fake"] : []),
      );
      expect(result.exitCode).toBe(2);
      const failure = DepthWorkerFailureSchema.parse(result.value);
      expect(failure.error.code).toBe("INPUT_UNREADABLE");
      expect(WorkerResultSchema.parse(result.value)).toEqual(failure);
      expect(parseDepthWorkerResponse(result.value)).toEqual(failure);
    },
  );

  it("preserves decode and configuration errors", async () => {
    const invalidSource = join(directory, "invalid.png");
    await writeFile(invalidSource, "not an image");
    const invalidImage = await worker(
      "prepare",
      "--input",
      invalidSource,
      "--adapter",
      "fake",
    );
    const invalidConfiguration = await worker(
      "prepare",
      "--input",
      source,
      "--adapter",
      "fake",
      "--lower-percentile",
      "99",
    );
    expect([invalidImage.exitCode, invalidConfiguration.exitCode]).toEqual([
      2, 2,
    ]);
    expect(DepthWorkerFailureSchema.parse(invalidImage.value).error.code).toBe(
      "INPUT_DECODE_FAILED",
    );
    expect(
      DepthWorkerFailureSchema.parse(invalidConfiguration.value).error.code,
    ).toBe("CONFIGURATION_INVALID");
  });
});
