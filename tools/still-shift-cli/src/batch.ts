import { createHash, randomUUID } from "node:crypto";
import { readFile, mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import {
  resolveFrameTransport,
  WebGLAnimationEngine,
} from "@still-shift/animation-engine";
import {
  AnimationEngineError,
  AnimationResultSchema,
  ENGINE_VERSION,
  parseAnimationRequest,
  V0_1_REQUEST_CONSTRAINTS,
  V0_1_REQUEST_DEFAULTS,
  type AnimationFailure,
  type AnimationRequest,
  type AnimationResult,
} from "@still-shift/scene-contract";

type BatchItem = {
  id: string;
  inputPath: string;
  durationMs?: number;
  preset?: string;
  intensity?: string;
  seed?: number;
};

type BatchRecord = {
  line: number;
  id: string;
  inputPath: string | null;
  requestHash: string | null;
  reused: boolean;
} & (
  | { status: AnimationResult["status"]; result: AnimationResult }
  | AnimationFailure
);

type Checkpoint = {
  requestHash: string;
  result: AnimationResult;
};

const sha256 = (bytes: string | Uint8Array): string =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const atomicJson = async (path: string, value: unknown): Promise<void> => {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      flag: "wx",
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
};

const atomicJsonl = async (path: string, records: BatchRecord[]) => {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(
      temporary,
      `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
      { flag: "wx" },
    );
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
};

const fileHash = async (path: string): Promise<string> =>
  sha256(await readFile(path));

const parseItem = (line: string, lineNumber: number): BatchItem => {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new AnimationEngineError("SCENE_INVALID", "Invalid JSONL item", {
      line: lineNumber,
    });
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new AnimationEngineError(
      "SCENE_INVALID",
      "Batch item must be an object",
      {
        line: lineNumber,
      },
    );
  const item = value as Partial<BatchItem>;
  if (
    typeof item.id !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(item.id)
  )
    throw new AnimationEngineError(
      "SCENE_INVALID",
      "Batch item id must use 1–80 safe characters",
      {
        line: lineNumber,
      },
    );
  if (typeof item.inputPath !== "string" || !item.inputPath.trim())
    throw new AnimationEngineError(
      "SCENE_INVALID",
      "Batch item inputPath is required",
      {
        line: lineNumber,
      },
    );
  return item as BatchItem;
};

const requestForItem = (
  item: BatchItem,
  manifestPath: string,
  outputDir: string,
): AnimationRequest =>
  parseAnimationRequest({
    inputPath: resolve(dirname(manifestPath), item.inputPath),
    outputPath: join(outputDir, `${item.id}.mp4`),
    durationMs: item.durationMs ?? V0_1_REQUEST_DEFAULTS.durationMs,
    fps: V0_1_REQUEST_CONSTRAINTS.fps,
    width: V0_1_REQUEST_CONSTRAINTS.width,
    height: V0_1_REQUEST_CONSTRAINTS.height,
    preset: item.preset ?? V0_1_REQUEST_DEFAULTS.preset,
    intensity: item.intensity ?? V0_1_REQUEST_DEFAULTS.intensity,
    seed: item.seed ?? V0_1_REQUEST_DEFAULTS.seed,
  });

const checkpointResult = async (
  path: string,
  requestHash: string,
  request: AnimationRequest,
): Promise<AnimationResult | null> => {
  let checkpoint: Checkpoint;
  try {
    checkpoint = JSON.parse(await readFile(path, "utf8")) as Checkpoint;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new AnimationEngineError(
      "RENDER_FAILED",
      "Batch checkpoint is unreadable",
      { path },
    );
  }
  if (checkpoint.requestHash !== requestHash)
    throw new AnimationEngineError(
      "SCENE_INVALID",
      "Batch item changed since its checkpoint",
      {
        id: request.outputPath,
      },
    );
  let result: AnimationResult;
  try {
    result = AnimationResultSchema.parse(checkpoint.result);
  } catch {
    throw new AnimationEngineError(
      "RENDER_FAILED",
      "Batch checkpoint result is invalid",
      { path },
    );
  }
  let hashesMatch = false;
  try {
    hashesMatch =
      result.checksums.source === (await fileHash(request.inputPath)) &&
      result.checksums.scene === (await fileHash(result.sceneManifestPath)) &&
      result.checksums.output === (await fileHash(result.outputPath));
  } catch {
    hashesMatch = false;
  }
  if (
    result.outputPath !== request.outputPath ||
    result.sceneManifestPath !== `${request.outputPath}.scene.json` ||
    !hashesMatch
  )
    throw new AnimationEngineError(
      "OUTPUT_VALIDATION_FAILED",
      "Batch checkpoint artifacts changed",
      {
        path,
      },
    );
  return result;
};

const failureRecord = (
  line: number,
  id: string,
  inputPath: string | null,
  requestHash: string | null,
  error: unknown,
): BatchRecord => ({
  line,
  id,
  inputPath,
  requestHash,
  reused: false,
  ...(error instanceof AnimationEngineError
    ? error.toFailure()
    : {
        status: "failed" as const,
        error: {
          code: "RENDER_FAILED" as const,
          message: "Unexpected batch item failure",
        },
      }),
});

const runItem = async (
  item: BatchItem,
  line: number,
  manifestPath: string,
  outputDir: string,
): Promise<BatchRecord> => {
  let requestHash: string | null = null;
  try {
    const request = requestForItem(item, manifestPath, outputDir);
    const frameTransport = resolveFrameTransport();
    requestHash = sha256(
      JSON.stringify({
        engineVersion: ENGINE_VERSION,
        ...(frameTransport === "png_pipe" ? {} : { frameTransport }),
        request,
      }),
    );
    const checkpointPath = join(
      outputDir,
      ".batch-checkpoints",
      `${item.id}.json`,
    );
    const previous = await checkpointResult(
      checkpointPath,
      requestHash,
      request,
    );
    if (previous)
      return {
        line,
        id: item.id,
        inputPath: request.inputPath,
        requestHash,
        reused: true,
        status: previous.status,
        result: previous,
      };
    const result = await new WebGLAnimationEngine().animate(request);
    await atomicJson(checkpointPath, {
      requestHash,
      result,
    } satisfies Checkpoint);
    return {
      line,
      id: item.id,
      inputPath: request.inputPath,
      requestHash,
      reused: false,
      status: result.status,
      result,
    };
  } catch (error) {
    return failureRecord(line, item.id, item.inputPath, requestHash, error);
  }
};

export const runBatch = async (options: {
  manifestPath: string;
  outputDir: string;
  concurrency: number;
}): Promise<{ summary: Record<string, unknown>; exitCode: number }> => {
  if (
    !Number.isInteger(options.concurrency) ||
    options.concurrency < 1 ||
    options.concurrency > 2
  )
    throw new AnimationEngineError(
      "SCENE_INVALID",
      "Batch concurrency must be 1 or 2",
    );
  const manifestPath = resolve(options.manifestPath);
  const outputDir = resolve(options.outputDir);
  let contents: string;
  try {
    contents = await readFile(manifestPath, "utf8");
  } catch {
    throw new AnimationEngineError(
      "INPUT_UNREADABLE",
      "Batch manifest is unreadable",
      {
        manifestPath,
      },
    );
  }
  const lines = contents.split(/\r?\n/);
  const jobs: Array<{ position: number; lineNumber: number; item: BatchItem }> =
    [];
  const records: Array<BatchRecord | undefined> = [];
  const ids = new Set<string>();
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    const lineNumber = index + 1;
    const position = records.length;
    records.push(undefined);
    try {
      const item = parseItem(line, lineNumber);
      if (ids.has(item.id))
        throw new AnimationEngineError(
          "SCENE_INVALID",
          "Duplicate batch item id",
          {
            id: item.id,
            line: lineNumber,
          },
        );
      ids.add(item.id);
      jobs.push({ position, lineNumber, item });
    } catch (error) {
      records[position] = failureRecord(
        lineNumber,
        `line-${lineNumber}`,
        null,
        null,
        error,
      );
    }
  }
  if (records.length === 0)
    throw new AnimationEngineError(
      "SCENE_INVALID",
      "Batch manifest has no items",
    );
  await mkdir(join(outputDir, ".batch-checkpoints"), { recursive: true });
  const lockPath = join(outputDir, ".batch.lock");
  let lock;
  try {
    lock = await open(lockPath, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    throw new AnimationEngineError(
      "RENDER_FAILED",
      "Batch output directory is already in use",
      {
        outputDir,
      },
    );
  }
  const started = performance.now();
  try {
    let cursor = 0;
    const worker = async () => {
      while (cursor < jobs.length) {
        const { position, lineNumber, item } = jobs[cursor++]!;
        records[position] = await runItem(
          item,
          lineNumber,
          manifestPath,
          outputDir,
        );
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(options.concurrency, jobs.length) },
        worker,
      ),
    );
    const completed = records as BatchRecord[];
    const successful = completed.filter(
      (record) => record.status !== "failed",
    ).length;
    const failed = completed.length - successful;
    const summary = {
      manifestPath,
      outputDir,
      resultsPath: join(outputDir, "batch-results.jsonl"),
      itemCount: completed.length,
      concurrency: options.concurrency,
      successful,
      failed,
      reused: completed.filter((record) => record.reused).length,
      rendered: completed.filter((record) => record.status === "rendered")
        .length,
      renderedWithWarnings: completed.filter(
        (record) => record.status === "rendered_with_warnings",
      ).length,
      fallback2d: completed.filter((record) => record.status === "fallback_2d")
        .length,
      successRate: successful / completed.length,
      totalWallMs: performance.now() - started,
      engineVersion: ENGINE_VERSION,
    };
    await atomicJsonl(summary.resultsPath, completed);
    await atomicJson(join(outputDir, "batch-summary.json"), summary);
    const historyPath = join(outputDir, "batch-runs.jsonl");
    let earlier = "";
    try {
      earlier = await readFile(historyPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const historyTemporary = `${historyPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(
        historyTemporary,
        `${earlier}${JSON.stringify(summary)}\n`,
        {
          flag: "wx",
        },
      );
      await rename(historyTemporary, historyPath);
    } finally {
      await rm(historyTemporary, { force: true });
    }
    return { summary, exitCode: failed ? 1 : 0 };
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
};
