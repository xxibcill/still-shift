import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import {
  ffmpegProcessUsage,
  spawnFfmpeg,
} from "../../packages/execution-runtime/src/ffmpeg-process.ts";

const groups = (id: number) =>
  execFileSync("ps", ["-axo", "pid=,pgid="], { encoding: "utf8" })
    .split("\n")
    .flatMap((line) => {
      const values = line.trim().split(/\s+/).map(Number);
      return values[1] === id ? [values[0]!] : [];
    });
const monitor = (job: ReturnType<typeof spawnFfmpeg>) => {
  let stderr = "";
  job.child.stdin?.on("error", () => {});
  job.child.stderr?.on("data", (bytes: Buffer) => {
    stderr += bytes.toString();
  });
  const closed = new Promise<number | null>((resolve, reject) => {
    job.child.once("error", reject);
    job.child.once("close", resolve);
  });
  return { closed, stderr: () => stderr };
};
const args = [
  "-v",
  "info",
  "-benchmark",
  "-f",
  "rawvideo",
  "-pix_fmt",
  "rgba",
  "-s",
  "32x24",
  "-r",
  "60",
  "-i",
  "pipe:0",
  "-threads",
  "1",
  "-f",
  "framemd5",
];

describe("complete FFmpeg command usage", () => {
  it("distinguishes complete child usage from the transcode benchmark and reports precision", () => {
    expect(
      ffmpegProcessUsage(
        "bench: utime=0.003s stime=0.004s rtime=0.005s\nreal 1.25\nuser 0.12\nsys 0.03\n",
      ),
    ).toEqual({
      scope: "posix-time-child-user-plus-system",
      userMs: 120,
      systemMs: 30,
      cpuMs: 150,
      reportedResolutionMs: 10,
    });
  });
  it.each([
    "bench: utime=0.12s stime=0.03s rtime=1.0s",
    "user 0.12\nsys -0.03\n",
    "user 0.12\nuser 0.13\nsys 0.03\n",
  ])("rejects missing, invalid or duplicate complete usage: %s", (text) => {
    expect(() => ffmpegProcessUsage(text)).toThrow(
      "complete-process CPU usage",
    );
  });
  it("preserves actual decoded frame hashes and waits for the timer and encoder child", async () => {
    const directory = await mkdtemp(join(tmpdir(), "timed-ffmpeg-runtime-"));
    const jobs: ReturnType<typeof spawnFfmpeg>[] = [];
    try {
      const frame = Buffer.alloc(32 * 24 * 4);
      for (let i = 0; i < frame.length; i++) frame[i] = (i * 17) % 256;
      const outputs = [];
      for (const timed of [false, true]) {
        const path = join(directory, String(timed) + ".txt");
        const job = spawnFfmpeg([...args, "-y", path], timed);
        jobs.push(job);
        const observed = monitor(job);
        job.child.stdin!.end(Buffer.concat([frame, frame]));
        expect(await observed.closed).toBe(0);
        await job.reap();
        if (timed) {
          expect(groups(job.child.pid!)).toEqual([]);
          expect(
            ffmpegProcessUsage(observed.stderr()).cpuMs,
          ).toBeGreaterThanOrEqual(0);
        }
        outputs.push(await readFile(path));
      }
      expect(outputs[0]!.equals(outputs[1]!)).toBe(true);
    } finally {
      for (const job of jobs) {
        job.kill();
        await job.reap();
      }
      await rm(directory, { recursive: true, force: true });
    }
  });
  it.each([false, true])(
    "reaps the actual process group when its wrapper was separately killed: %s",
    async (wrapperFirst) => {
      const job = spawnFfmpeg([...args, "pipe:1"], true),
        observed = monitor(job);
      try {
        for (
          let check = 0;
          check < 100 && groups(job.child.pid!).length < 2;
          check++
        )
          await setTimeout(10);
        expect(groups(job.child.pid!).length).toBeGreaterThanOrEqual(2);
        if (wrapperFirst) {
          job.child.kill("SIGKILL");
          await setTimeout(25);
        }
        job.kill();
        job.kill();
        await observed.closed;
        await job.reap();
        expect(groups(job.child.pid!)).toEqual([]);
      } finally {
        job.kill();
        await job.reap();
      }
    },
  );
  it("retains the real FFmpeg option failure code and reaps its child", async () => {
    const job = spawnFfmpeg(["-ce15-invalid-option"], true),
      observed = monitor(job);
    try {
      job.child.stdin!.end();
      expect(await observed.closed).not.toBe(0);
      await job.reap();
      expect(groups(job.child.pid!)).toEqual([]);
      expect(observed.stderr()).toContain("ffmpeg");
    } finally {
      job.kill();
      await job.reap();
    }
  });
});
