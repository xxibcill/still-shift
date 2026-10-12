import { spawn } from "node:child_process";
import { gltfFail, RigidGltfImportError } from "./gltf-document.ts";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
export const GLTF_RGBA_DECODER_PROFILE = Object.freeze({
  version: "gltf-rgba-decoder-1",
  ffmpegVersion: "8.0.1",
  pixels: "rgba8-straight-top-left-1",
});
export async function assertGltfRgbaDecoder(signal?: AbortSignal) {
  const bounded = AbortSignal.timeout(10000);
  try {
    const { stdout } = await runProcess("ffmpeg", ["-version"], {
      signal: signal ? AbortSignal.any([signal, bounded]) : bounded,
      maxBuffer: 65536,
    });
    const version = /^ffmpeg version ([^ ]+)/.exec(stdout)?.[1];
    if (version !== GLTF_RGBA_DECODER_PROFILE.ffmpegVersion)
      gltfFail("image", "RGBA decoder differs from pinned FFmpeg8.0.1", [
        "images",
      ]);
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof RigidGltfImportError) throw error;
    gltfFail("image", "Pinned RGBA decoder is unavailable", ["images"]);
  }
}
export function decodeGltfRgba(
  bytes: Uint8Array,
  expectedBytes: number,
  path: (string | number)[],
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (
    !Number.isSafeInteger(expectedBytes) ||
    expectedBytes < 4 ||
    expectedBytes > 32 * 1024 ** 2
  )
    gltfFail("budget", "Declared RGBA allocation exceeds bounds", path);
  const failure = (message: string) =>
    new RigidGltfImportError("gltf-import-image", message, path);
  return new Promise<Uint8Array>((accept, reject) => {
    const child = spawn(
      "ffmpeg",
      [
        "-v",
        "error",
        "-nostdin",
        "-threads",
        "1",
        "-noautorotate",
        "-err_detect",
        "explode",
        "-f",
        "image2pipe",
        "-i",
        "pipe:0",
        "-map",
        "0:v:0",
        "-frames:v",
        "1",
        "-pix_fmt",
        "rgba",
        "-threads",
        "1",
        "-f",
        "rawvideo",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const output = new Uint8Array(expectedBytes);
    let length = 0,
      stderrBytes = 0,
      reason: unknown,
      forceKill: ReturnType<typeof setTimeout> | undefined;
    const stop = (error: unknown) => {
      if (reason !== undefined) return;
      reason = error;
      child.kill("SIGTERM");
      forceKill = setTimeout(() => child.kill("SIGKILL"), 250);
      forceKill.unref();
    };
    const abort = () => stop(signal?.reason ?? new Error("Aborted"));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const timeout = setTimeout(
      () => stop(failure("PNG/JPEG decode exceeded30 seconds")),
      30000,
    );
    timeout.unref();
    child.once("error", () => stop(failure("RGBA decoder could not start")));
    child.stdin.on("error", () => stop(failure("RGBA decoder input failed")));
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > 65536)
        stop(failure("Decoder diagnostic budget exceeded"));
    });
    child.stdout.on("data", (chunk: Buffer) => {
      if (length + chunk.length > expectedBytes) {
        stop(failure("Decoder exceeded declared pixel bounds"));
        return;
      }
      output.set(chunk, length);
      length += chunk.length;
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      clearTimeout(forceKill);
      signal?.removeEventListener("abort", abort);
      if (reason !== undefined) {
        reject(reason);
        return;
      }
      if (code !== 0 || length !== expectedBytes) {
        try {
          gltfFail(
            "image",
            "Decoder failed or returned incomplete RGBA pixels",
            path,
          );
        } catch (error) {
          reject(error);
        }
        return;
      }
      accept(output);
    });
    child.stdin.end(bytes);
  });
}
