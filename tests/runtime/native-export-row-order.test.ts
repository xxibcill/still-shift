import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ffmpegArguments,
  type ExportableScene,
} from "../../packages/execution-runtime/src/export-worker.ts";
import { runProcess } from "../../packages/execution-runtime/src/subprocess.ts";

const width = 64,
  height = 48;
const scene = {
  canvas: { width, height },
  timeline: { fps: 30, frameCount: 2, durationMs: 2000 / 30 },
} as ExportableScene;

async function encode(path: string, pixels: Buffer, topFirst: boolean) {
  const child = spawn(
    "ffmpeg",
    ffmpegArguments(
      scene,
      path,
      "libx264",
      "raw_rgba",
      undefined,
      ...(topFirst ? (["top-first"] as const) : []),
    ),
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (data: Buffer) => {
    stderr = (stderr + data.toString()).slice(-65536);
  });
  child.stdin.on("error", () => {});
  const done = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 ? resolve() : reject(Error(`Encoder ${code}: ${stderr}`)),
    );
  });
  child.stdin.end(Buffer.concat([pixels, pixels]));
  await done;
}

describe("native canonical raw export row order", () => {
  it("preserves top-first native pixels and legacy bottom-first pixels through actual MP4 encoding", async () => {
    const directory = await mkdtemp("/private/tmp/native-row-order-");
    const topFirst = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        topFirst.set(
          y < height / 2 ? [255, 0, 0, 255] : [0, 0, 255, 255],
          offset,
        );
      }
    const bottomFirst = Buffer.alloc(topFirst.length);
    for (let y = 0; y < height; y++)
      topFirst.copy(
        bottomFirst,
        (height - y - 1) * width * 4,
        y * width * 4,
        (y + 1) * width * 4,
      );
    const decoded = [];
    for (const [name, pixels, canonical] of [
      ["native", topFirst, true],
      ["legacy", bottomFirst, false],
    ] as const) {
      const movie = join(directory, `${name}.mp4`),
        raw = join(directory, `${name}.rgba`);
      await encode(movie, pixels, canonical);
      await runProcess("ffmpeg", [
        "-v",
        "error",
        "-i",
        movie,
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        raw,
      ]);
      decoded.push(await readFile(raw));
    }
    expect(decoded[0]).toEqual(decoded[1]);
    const top = (8 * width + 32) * 4,
      bottom = (40 * width + 32) * 4;
    expect(decoded[0]![top]).toBeGreaterThan(240);
    expect(decoded[0]![top + 2]).toBeLessThan(15);
    expect(decoded[0]![bottom]).toBeLessThan(15);
    expect(decoded[0]![bottom + 2]).toBeGreaterThan(240);
  });
});
