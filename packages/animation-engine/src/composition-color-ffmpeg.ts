/** Internal CGA helper: run FFmpeg and collect its binary stdout. */
import { spawn } from "node:child_process";

/**
 * Binary FFmpeg stdout, bounded by `maxBytes`. stderr is drained (an unread
 * pipe would block FFmpeg on a noisy stream) and its tail is kept for the
 * failure message, which starts with `failure`.
 */
export async function ffmpegBytes(
  args: string[],
  maxBytes: number,
  failure: string,
  signal?: AbortSignal,
): Promise<Buffer> {
  signal?.throwIfAborted();
  return new Promise((accept, reject) => {
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    let size = 0,
      errors = "";
    const abort = () => child.kill("SIGKILL");
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) child.kill("SIGKILL");
      else chunks.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      errors = (errors + String(chunk)).slice(-2000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) return reject(signal.reason);
      if (code !== 0 || size > maxBytes)
        return reject(Error(`${failure} (${code}): ${errors}`));
      accept(Buffer.concat(chunks));
    });
  });
}
