import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  ffmpegArguments,
  type ExportableScene,
} from "@still-shift/execution-runtime/export";

/** Stream one PNG at a time from the real preview; finish before any timing bracket. */
export function cinematicPreviewEncoder(scene: ExportableScene, path: string) {
  const encoder = spawn(
    "ffmpeg",
    ffmpegArguments(scene, path, "libx264", "png_pipe"),
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  let errors = "",
    ended = false;
  const completion = new Promise<void>((resolve, reject) => {
    encoder.on("error", reject);
    encoder.stdin.on("error", reject);
    encoder.stderr.on("data", (chunk) => {
      errors += String(chunk);
    });
    encoder.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(Error(`Independent preview encoder ${code}: ${errors}`)),
    );
  });
  void completion.catch(() => {});
  return {
    write: (png: string) =>
      new Promise<void>((resolve, reject) =>
        encoder.stdin.write(Buffer.from(png, "base64"), (error) =>
          error ? reject(error) : resolve(),
        ),
      ),
    async finish() {
      ended = true;
      encoder.stdin.end();
      await completion;
      return createHash("sha256")
        .update(await readFile(path))
        .digest("hex");
    },
    async close() {
      if (!ended) encoder.kill("SIGTERM");
      await completion.catch(() => {});
    },
  };
}
