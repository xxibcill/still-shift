import {
  writeFile,
  mkdtemp,
  rm,
  realpath,
  stat,
  copyFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import { readProductionJSON } from "./production-queue-files.ts";
import { cuePlateFile } from "./cue-plate-files.ts";
import { parseBlenderCaptureJob } from "./blender-capture-contract.ts";
const worker = fileURLToPath(
  new URL("../blender-capture-worker.py", import.meta.url),
);
const summary = z
  .object({
    schemaVersion: z.literal("blender-native-capture-result-1"),
    status: z.literal("captured"),
    id: z.string(),
    sourceAssetSha256: z.string(),
    frameCount: z.number().int().positive(),
    blenderRenders: z.number().int().positive(),
    manifestPath: z.string(),
    scope: z.string(),
  })
  .strict();
/** Shared data-only native producer; asset/source controls remain in Blender. */
export async function captureBlenderAsset(
  input: unknown,
  options: {
    blenderExecutable: string;
    signal?: AbortSignal | undefined;
    nodeMemory?: CompositionNodeMemory;
  },
) {
  options.signal?.throwIfAborted();
  const owner = new CompositionNodeMemory(options.nodeMemory);
  let scratch: string | undefined;
  try {
    owner.reserve(16 * 1024 * 1024);
    const parsed = parseBlenderCaptureJob(input),
      assetPath = await realpath(resolve(parsed.assetPath)),
      outputDirectory = resolve(parsed.outputDirectory);
    const info = await stat(assetPath);
    if (!info.isFile() || info.size > 512 * 1024 * 1024)
      throw Error("Capture needs a bounded regular native Blender asset");
    // Content, worker and host runtime have distinct identities in the retained manifest.
    scratch = await mkdtemp(join(tmpdir(), "blender-capture-job-"));
    const jobPath = join(scratch, "job.json"),
      frozenWorker = join(scratch, "worker.py");
    await copyFile(worker, frozenWorker);
    await writeFile(
      jobPath,
      JSON.stringify({ ...parsed, assetPath, outputDirectory }) + "\n",
    );
    const result = await runProcess(
      options.blenderExecutable,
      [
        "--background",
        "--threads",
        "2",
        "--disable-autoexec",
        "--python-exit-code",
        "1",
        "--python",
        frozenWorker,
        "--",
        jobPath,
      ],
      { signal: options.signal, maxBuffer: 16 * 1024 * 1024 },
    );
    const receiptPath = join(outputDirectory, "capture.json");
    const owned = z
      .object({
        path: z.string(),
        bytes: z.number().int().nonnegative(),
        sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      })
      .strict();
    const loaded = await readProductionJSON(
      receiptPath,
      z
        .object({
          summary,
          frames: z
            .array(
              z
                .object({
                  frame: z.number().int().nonnegative(),
                  sourceFrame: z.number().finite(),
                  image: owned,
                  observation: owned,
                })
                .strict(),
            )
            .min(1)
            .max(2000),
        })
        .passthrough(),
      owner,
      8 * 1024 * 1024,
      options.signal,
    );
    const receipt = loaded.value;
    try {
      const completed = summary.parse(receipt.summary);
      if (
        completed.id !== parsed.id ||
        completed.sourceAssetSha256 !== parsed.assetSha256 ||
        completed.frameCount !== parsed.frames.length ||
        completed.blenderRenders !== parsed.frames.length ||
        completed.manifestPath !== receiptPath
      )
        throw Error(
          "Capture receipt differs from its requested source/clock/output",
        );
      if (receipt.frames.length !== parsed.frames.length)
        throw Error("Capture frame records differ from the requested clock");
      for (const [index, frame] of receipt.frames.entries()) {
        if (
          frame.frame !== index ||
          frame.sourceFrame !== parsed.frames[index]!.sourceFrame
        )
          throw Error("Captured frame order/source pose changed");
        for (const [kind, extension] of [
          ["image", "png"],
          ["observation", "json"],
        ] as const) {
          const file = frame[kind],
            expected =
              "frames/frame-" +
              String(index).padStart(6, "0") +
              "." +
              extension;
          if (file.path !== expected)
            throw Error("Capture file is outside its owned frame path");
          const actual = await cuePlateFile(
            join(outputDirectory, file.path),
            owner,
            {
              sha256: file.sha256,
              maximumBytes:
                kind === "image" ? 128 * 1024 * 1024 : 8 * 1024 * 1024,
              signal: options.signal,
            },
          );
          if (actual.bytes !== file.bytes)
            throw Error("Captured frame byte count changed");
        }
      }
      return {
        summary: completed,
        receipt: {
          path: receiptPath,
          bytes: (await stat(receiptPath)).size,
          sha256: loaded.sha256,
        },
        process: { stdout: result.stdout, stderr: result.stderr },
      };
    } finally {
      loaded.release();
    }
  } finally {
    try {
      if (scratch) await rm(scratch, { recursive: true, force: true });
    } finally {
      owner.dispose();
    }
  }
}
