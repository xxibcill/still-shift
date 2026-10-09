import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";

export type FfmpegProcessUsage = {
  scope: "posix-time-child-user-plus-system";
  userMs: number;
  systemMs: number;
  cpuMs: number;
  reportedResolutionMs: number;
};

/** POSIX time reports the complete command's child usage, after waiting for its exit. */
export function ffmpegProcessUsage(stderr: string): FfmpegProcessUsage {
  const values = ["user", "sys"].map((field) => {
    const matches = [
      ...stderr.matchAll(new RegExp("^" + field + " ([0-9]+\\.[0-9]+)$", "gm")),
    ];
    if (matches.length !== 1)
      throw Error(
        "Timed FFmpeg did not report unique complete-process CPU usage",
      );
    const text = matches[0]![1]!,
      value = Number(text) * 1000;
    if (!Number.isFinite(value) || value < 0)
      throw Error("Timed FFmpeg CPU usage is invalid");
    return { value, resolution: 1000 * 10 ** -text.split(".")[1]!.length };
  });
  return {
    scope: "posix-time-child-user-plus-system",
    userMs: values[0]!.value,
    systemMs: values[1]!.value,
    cpuMs: values[0]!.value + values[1]!.value,
    reportedResolutionMs: Math.max(
      ...values.map(({ resolution }) => resolution),
    ),
  };
}

/** The timed wrapper and its FFmpeg child share one export-owned process group. */
export function spawnFfmpeg(args: string[], wholeProcess: boolean) {
  const child = spawn(
    wholeProcess ? "/usr/bin/time" : "ffmpeg",
    wholeProcess ? ["-p", "ffmpeg", ...args] : args,
    {
      stdio: ["pipe", "ignore", "pipe"],
      detached: wholeProcess,
      ...(wholeProcess ? { env: { ...process.env, LC_ALL: "C" } } : {}),
    },
  );
  const closed = new Promise<void>((resolve) =>
    child.once("close", () => resolve()),
  );
  let killed = false;
  const kill = () => {
    if (killed || child.exitCode === 0) return;
    killed = true;
    if (!wholeProcess || child.pid === undefined) {
      child.kill("SIGKILL");
      return;
    }
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  };
  let reaping: Promise<void> | undefined;
  const reap = () =>
    (reaping ??= (async () => {
      await closed;
      if (!wholeProcess || child.pid === undefined) return;
      const deadline = performance.now() + 5000;
      for (;;) {
        try {
          process.kill(-child.pid, 0);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
          throw error;
        }
        if (performance.now() >= deadline)
          throw Error(
            "Timed FFmpeg process group did not exit after termination",
          );
        await setTimeout(25);
      }
    })());
  return { child, kill, reap };
}
