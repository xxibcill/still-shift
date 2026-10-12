import assert from "node:assert/strict";
import { spawn } from "node:child_process";
/** One-frame decoder storage; retain the same encoded RGB28/min3 world-ink admission. */
export async function encodedWorldInkProof(
  path: string,
  width: number,
  height: number,
  frameCount: number,
  ink: readonly number[],
) {
  const frameBytes = width * height * 4;
  assert.ok(
    Number.isSafeInteger(frameBytes) &&
      frameBytes > 0 &&
      frameBytes <= 32 * 1024 * 1024,
  );
  assert.equal(ink.length, 3);
  const child = spawn(
    "ffmpeg",
    [
      "-v",
      "error",
      "-threads",
      "1",
      "-i",
      path,
      "-map",
      "0:v:0",
      "-an",
      "-threads",
      "1",
      "-pix_fmt",
      "rgba",
      "-f",
      "rawvideo",
      "pipe:1",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const frame = Buffer.alloc(frameBytes),
    counts: number[] = [];
  let filled = 0,
    problem: Error | undefined,
    stderr = "";
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      problem = new Error("Encoded ink decoder exceeded60 seconds");
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
        let offset = 0;
        while (offset < chunk.length) {
          assert.ok(
            counts.length < frameCount,
            "Decoded frames exceed declared ink proof",
          );
          const size = Math.min(frameBytes - filled, chunk.length - offset);
          chunk.copy(frame, filled, offset, offset + size);
          filled += size;
          offset += size;
          if (filled !== frameBytes) continue;
          let count = 0;
          for (let i = 0; i < frameBytes; i += 4)
            if (ink.every((v, c) => Math.abs(frame[i + c]! - v) <= 28)) count++;
          assert.ok(
            count >= 3,
            "Encoded world/surface ink below unchangedRGB28/min3 at frame" +
              counts.length +
              ":" +
              count,
          );
          counts.push(count);
          filled = 0;
        }
      } catch (error) {
        problem = error instanceof Error ? error : new Error(String(error));
        child.kill("SIGKILL");
      }
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (problem) reject(problem);
      else if (code !== 0)
        reject(new Error("Encoded ink decoder failed:" + stderr));
      else if (filled || counts.length !== frameCount)
        reject(new Error("Encoded ink decoded clock differs"));
      else resolve();
    });
  });
  return {
    frameCounts: counts,
    minimumPixels: Math.min(...counts),
    fixedRgbTolerance: 28,
    fixedMinimumPixels: 3,
  };
}
