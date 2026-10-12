import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { ExportMetrics } from "@still-shift/execution-runtime/export";

async function decodedChunks(
  path: string,
  args: string[],
  consume: (chunk: Buffer) => void,
) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "ffmpeg",
      ["-v", "error", "-threads", "1", "-i", path, ...args, "pipe:1"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let problem: Error | undefined;
    let stderr = "";
    const timeout = setTimeout(() => {
      problem = new Error("Streaming proof decoder exceeded 60 seconds");
      child.kill("SIGKILL");
    }, 60000);
    child.once("error", (error) => {
      problem = error;
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-65536);
    });
    child.stdout.on("data", (chunk: Buffer) => {
      if (problem) return;
      try {
        consume(chunk);
      } catch (error) {
        problem = error instanceof Error ? error : new Error(String(error));
        child.kill("SIGKILL");
      }
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (problem) reject(problem);
      else if (code !== 0)
        reject(new Error("Streaming proof decoder failed: " + stderr));
      else resolve();
    });
  });
}

/** Complete H264 body/video/audio hashes; decoded pixels never accumulate as a clip-sized store. */
export async function streamingCompositionOutputProof(
  path: string,
  metrics: ExportMetrics,
) {
  assert.ok(
    !metrics.output || metrics.output.format === "h264",
    "Streaming proof supports one H264 output",
  );
  assert.ok(!metrics.output?.sequence);
  const frameBytes = metrics.width * metrics.height * 4;
  assert.ok(Number.isSafeInteger(frameBytes) && frameBytes > 0);
  assert.ok(Number.isSafeInteger(metrics.frameCount) && metrics.frameCount > 0);
  const encodedHash = createHash("sha256");
  for await (const chunk of createReadStream(path)) encodedHash.update(chunk);
  const encoded = "sha256:" + encodedHash.digest("hex");
  assert.equal(encoded, metrics.outputChecksum);
  const decodedFrames: string[] = [];
  let frameHash = createHash("sha256"),
    filled = 0;
  await decodedChunks(
    path,
    [
      "-map",
      "0:v:0",
      "-an",
      "-threads",
      "1",
      "-pix_fmt",
      "rgba",
      "-f",
      "rawvideo",
    ],
    (chunk) => {
      let offset = 0;
      while (offset < chunk.length) {
        assert.ok(
          decodedFrames.length < metrics.frameCount,
          "Decoded video exceeds declared frame count",
        );
        const count = Math.min(frameBytes - filled, chunk.length - offset);
        frameHash.update(chunk.subarray(offset, offset + count));
        filled += count;
        offset += count;
        if (filled === frameBytes) {
          decodedFrames.push("sha256:" + frameHash.digest("hex"));
          frameHash = createHash("sha256");
          filled = 0;
        }
      }
    },
  );
  assert.equal(filled, 0, "Decoded video ends in a partial declared frame");
  assert.equal(decodedFrames.length, metrics.frameCount);
  let decodedAudio: string | undefined,
    decodedAudioBytes = 0;
  if (metrics.audio) {
    const audio = metrics.audio;
    assert.equal(audio.codec, "aac", "H264 diagnostic proof expects AAC");
    assert.ok(
      Number.isSafeInteger(audio.sampleCount) && audio.sampleCount >= 0,
    );
    const audioHash = createHash("sha256");
    // Bound AAC decoder padding without claiming lossy output sample equality.
    const limit = audio.sampleCount * audio.channels * 4 + 65536;
    assert.ok(Number.isSafeInteger(limit));
    await decodedChunks(
      path,
      ["-map", "0:a:0", "-vn", "-c:a", "pcm_f32le", "-f", "f32le"],
      (chunk) => {
        decodedAudioBytes += chunk.length;
        assert.ok(
          decodedAudioBytes <= limit,
          "Decoded audio exceeds bounded AAC padding",
        );
        audioHash.update(chunk);
      },
    );
    assert.equal(decodedAudioBytes % (audio.channels * 4), 0);
    decodedAudio = "sha256:" + audioHash.digest("hex");
  }
  return {
    encoded: [encoded],
    decodedFrames,
    ...(decodedAudio ? { decodedAudio, decodedAudioBytes } : {}),
  };
}
