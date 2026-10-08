import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { ExportMetrics } from "@still-shift/execution-runtime/export";
import { compositionOutputProfile } from "../../packages/execution-runtime/src/composition-output.ts";

export const parallelChecksum = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

function decode(path: string, metrics: ExportMetrics, audio: boolean) {
  const profile =
    metrics.output && compositionOutputProfile(metrics.output.format);
  const result = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-threads",
      "1",
      ...(!audio && profile?.format === "vp9alpha"
        ? ["-c:v", "libvpx-vp9"]
        : []),
      ...(!audio && profile?.container === "image2"
        ? [
            "-framerate",
            String((metrics.frameCount * 1000) / metrics.durationMs),
            "-start_number",
            "0",
          ]
        : []),
      "-i",
      path,
      ...(audio
        ? ["-map", "0:a:0", "-vn", "-c:a", "pcm_f32le", "-f", "f32le"]
        : [
            "-map",
            "0:v:0",
            "-an",
            "-threads",
            "1",
            "-pix_fmt",
            "rgba",
            "-f",
            "rawvideo",
          ]),
      "pipe:1",
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout;
}

/** Compare complete encoded bodies, every decoded frame, and complete decoded audio. */
export async function parallelOutputProof(
  path: string,
  metrics: ExportMetrics,
) {
  const sequence = metrics.output?.sequence;
  const bodies = sequence
    ? sequence.frames.map((_, frame) =>
        path.replace("%06d", String(frame).padStart(6, "0")),
      )
    : [path];
  const encoded = await Promise.all(
    bodies.map(async (body) => parallelChecksum(await readFile(body))),
  );
  if (sequence) {
    assert.deepEqual(encoded, sequence.frames);
    assert.equal(encoded.length, metrics.frameCount);
  } else assert.equal(encoded[0], metrics.outputChecksum);
  const pixels = decode(path, metrics, false);
  const frameBytes = metrics.width * metrics.height * 4;
  assert.equal(pixels.length, frameBytes * metrics.frameCount);
  const decodedFrames = Array.from({ length: metrics.frameCount }, (_, frame) =>
    parallelChecksum(
      pixels.subarray(frame * frameBytes, (frame + 1) * frameBytes),
    ),
  );
  const audioPath = sequence?.audioPath ?? path;
  const pcm = metrics.audio ? decode(audioPath, metrics, true) : undefined;
  if (metrics.audio && metrics.audio.codec !== "aac")
    assert.equal(pcm!.length, metrics.audio.sampleCount * 8);
  return {
    encoded,
    decodedFrames,
    ...(pcm
      ? { decodedAudio: parallelChecksum(pcm), decodedAudioBytes: pcm.length }
      : {}),
    ...(sequence?.audioPath
      ? { audioBody: parallelChecksum(await readFile(sequence.audioPath)) }
      : {}),
  };
}

export function verifyParallelMetrics(
  metrics: ExportMetrics,
  workers: number,
  cacheStatic: boolean,
  expectedPaints?: number,
) {
  assert.equal(metrics.ffmpegCpuScope, "ffmpeg-transcode-user-plus-system");
  const processUsage = metrics.ffmpegProcessUsage;
  assert.ok(processUsage);
  assert.equal(processUsage.scope, "posix-time-child-user-plus-system");
  assert.ok(
    Number.isInteger(processUsage.timingProcessId) &&
      processUsage.timingProcessId > 0,
  );
  assert.equal(processUsage.processGroupReaped, true);
  assert.equal(processUsage.cpuMs, processUsage.userMs + processUsage.systemMs);
  assert.ok(Number.isFinite(processUsage.cpuMs) && processUsage.cpuMs >= 0);
  assert.ok(processUsage.reportedResolutionMs > 0);
  const work = metrics.work;
  assert.ok(work);
  assert.equal(work.version, "composition-render-work-1");
  assert.equal(work.workers, workers);
  const memory = metrics.compositionMemory;
  assert.ok(memory);
  assert.equal(memory.workers.length, workers);
  assert.ok(
    memory.sumOfWorkerPeakBytes + memory.reservedNodeBudgetBytes <=
      memory.applicationLimitBytes,
  );
  for (const worker of memory.workers) {
    assert.deepEqual(worker.afterAcknowledgement?.current, {
      pixels: 0,
      metadata: 0,
    });
    assert.equal(worker.afterAcknowledgement?.reservations, 0);
  }
  assert.equal(work.cacheStatic, cacheStatic);
  assert.equal(work.chunkFrames, 1);
  assert.equal(work.orderedFrames.deliveredFrames, metrics.frameCount);
  assert.equal(work.orderedFrames.pendingFrames, 0);
  assert.ok(work.orderedFrames.peakPendingFrames <= workers);
  const processes = work.workersDetail.flatMap(
    (worker) => worker.rendererProcessIds,
  );
  assert.equal(new Set(processes).size, processes.length);
  assert.ok(processes.length >= workers);
  for (const worker of work.workersDetail) {
    assert.equal(worker.result.worker, worker.worker);
    assert.deepEqual(worker.environment, metrics.renderEnvironment);
    assert.deepEqual(
      worker.result.frames.map((frame) => frame.index),
      Array.from(
        { length: Math.ceil((metrics.frameCount - worker.worker) / workers) },
        (_, index) => worker.worker + index * workers,
      ),
    );
    for (const frame of worker.result.frames) {
      assert.ok(Number.isFinite(frame.renderMs) && frame.renderMs >= 0);
      assert.ok(Number.isFinite(frame.uploadMs) && frame.uploadMs >= 0);
    }
  }
  const submission = work.submissionStatistics;
  assert.ok(metrics.compositionStatistics);
  assert.deepEqual(
    metrics.compositionStatistics.byLayerType,
    submission.byLayerType,
  );
  assert.equal(metrics.compositionStatistics.cacheEnabled, cacheStatic);
  assert.equal(metrics.compositionStatistics.frameCount, metrics.frameCount);
  assert.equal(submission.scope, "synchronous-submission-wall-time");
  assert.ok(submission.byLayerType.length > 0);
  for (const row of submission.byLayerType) {
    assert.ok(
      Number.isFinite(row.submissionWallMs) && row.submissionWallMs >= 0,
    );
    assert.equal(
      row.submissionWallMsPerOutputFrame,
      row.submissionWallMs / metrics.frameCount,
    );
    const measured: {
      phase: string;
      type: string;
      calls: number;
      submissionWallMs: number;
    }[] = work.workersDetail
      .flatMap((worker) => worker.result.renderStatistics!.byLayerType)
      .filter((item) => item.phase === row.phase && item.type === row.type);
    assert.equal(
      row.submissionWallMs,
      measured.reduce((sum, item) => sum + item.submissionWallMs, 0),
    );
    assert.equal(
      row.calls,
      measured.reduce((sum, item) => sum + item.calls, 0),
    );
  }
  assert.equal(
    submission.totalSubmissionWallMs,
    submission.byLayerType.reduce((sum, row) => sum + row.submissionWallMs, 0),
  );
  const frames = work.workersDetail.flatMap((worker) => worker.result.frames);
  assert.equal(frames.length, metrics.frameCount);
  for (const [field, average, p95] of [
    ["renderMs", metrics.frameRenderAverageMs, metrics.frameRenderP95Ms],
    ["uploadMs", metrics.frameUploadAverageMs, metrics.frameUploadP95Ms],
  ] as const) {
    const values = frames.map((frame) => frame[field]).sort((a, b) => a - b);
    assert.equal(average, values.reduce((a, b) => a + b, 0) / values.length);
    assert.equal(p95, values[Math.ceil(values.length * 0.95) - 1]);
  }
  if (cacheStatic) {
    assert.ok(work.surfaceStore);
    if (expectedPaints !== undefined) {
      assert.equal(
        work.workersDetail.reduce(
          (sum, worker) =>
            sum +
            (worker.result.cacheStatistics?.independentSurfacePaints ?? 0),
          0,
        ),
        expectedPaints,
      );
    }
    assert.equal(
      work.surfaceStore.publishedSurfaces,
      work.workersDetail.reduce(
        (sum, worker) =>
          sum +
          (worker.result.cacheStatistics?.independentSurfacePaints ?? 0) +
          (worker.result.sourceStatistics?.sources.reduce(
            (sum, source) => sum + source.paints,
            0,
          ) ?? 0) +
          (worker.result.rootStatistics?.roots.reduce(
            (sum, root) => sum + root.paints,
            0,
          ) ?? 0),
        0,
      ),
    );
  } else {
    assert.equal(work.surfaceStore, undefined);
    assert.ok(
      work.workersDetail.every(
        (worker) => worker.result.cacheStatistics === undefined,
      ),
    );
  }
}
