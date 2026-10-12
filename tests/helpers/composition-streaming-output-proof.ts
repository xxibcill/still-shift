import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { parallelChecksum } from "./composition-parallel-proof.ts";

/** MP4 video/PCM proof with one retained decoded frame and bounded stderr. */
export async function streamingOutputProof(
  path: string,
  width: number,
  height: number,
  frameCount: number,
) {
  const frameBytes = width * height * 4;
  assert.ok(
    Number.isSafeInteger(frameBytes) &&
      frameBytes > 0 &&
      frameBytes <= 32 * 1024 * 1024,
  );
  assert.ok(
    Number.isSafeInteger(frameCount) && frameCount > 0 && frameCount <= 108000,
  );
  const encodedHash = createHash("sha256");
  let encodedBytes = 0;
  for await (const chunk of createReadStream(path, { highWaterMark: 65536 })) {
    encodedHash.update(chunk);
    encodedBytes += chunk.length;
  }
  const decodedFrames: string[] = [],
    frame = Buffer.alloc(frameBytes);
  let filled = 0;
  await decode(false, (chunk) => {
    let offset = 0;
    while (offset < chunk.length) {
      assert.ok(
        decodedFrames.length < frameCount,
        "Decoded video exceeds the supplied frame clock",
      );
      const size = Math.min(frameBytes - filled, chunk.length - offset);
      chunk.copy(frame, filled, offset, offset + size);
      filled += size;
      offset += size;
      if (filled !== frameBytes) continue;
      decodedFrames.push(parallelChecksum(frame));
      filled = 0;
    }
  });
  assert.equal(filled, 0, "Decoder ended inside a frame");
  assert.equal(
    decodedFrames.length,
    frameCount,
    "Decoder lost a supplied output frame",
  );
  const pcmHash = createHash("sha256");
  let decodedAudioBytes = 0;
  await decode(true, (chunk) => {
    pcmHash.update(chunk);
    decodedAudioBytes += chunk.length;
  });
  assert.ok(
    decodedAudioBytes > 0 && decodedAudioBytes % 8 === 0,
    "Decoded stereo Float32 PCM is incomplete",
  );
  return {
    encoded: "sha256:" + encodedHash.digest("hex"),
    encodedBytes,
    decodedFrames,
    decodedAudio: "sha256:" + pcmHash.digest("hex"),
    decodedAudioBytes,
    retainedDecodedFrameBytes: frameBytes,
    decoderTimeoutMs: 60000,
    stderrTailCodeUnits: 65536,
  };

  async function decode(audio: boolean, accept: (chunk: Buffer) => void) {
    const child = spawn(
      "ffmpeg",
      [
        "-v",
        "error",
        "-threads",
        "1",
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
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    await new Promise<void>((resolve, reject) => {
      let problem: Error | undefined,
        stderr = "";
      const timeout = setTimeout(() => {
        problem = new Error("Output decoder exceeded60 seconds");
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
          accept(chunk);
        } catch (error) {
          problem = error instanceof Error ? error : new Error(String(error));
          child.kill("SIGKILL");
        }
      });
      child.once("close", (code) => {
        clearTimeout(timeout);
        if (problem) reject(problem);
        else if (code !== 0)
          reject(new Error("Output decoder failed:" + stderr));
        else resolve();
      });
    });
  }
}
