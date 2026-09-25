import { fork, spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  acquireBatchLock,
  prepareBatchItem,
} from "../../tools/still-shift-cli/src/batch-recovery.ts";

const nextWorkerMessage = (worker: ChildProcess): Promise<string> =>
  new Promise((resolve, reject) => {
    const onMessage = (message: unknown) => {
      cleanup();
      if (typeof message === "string") resolve(message);
      else reject(new Error("Unexpected batch lock worker message"));
    };
    const onExit = (code: number | null) => {
      cleanup();
      reject(new Error(`Batch lock worker exited with code ${code}`));
    };
    const cleanup = () => {
      worker.off("message", onMessage);
      worker.off("exit", onExit);
    };
    worker.once("message", onMessage);
    worker.once("exit", onExit);
  });

describe("batch interruption recovery", () => {
  it("keeps a live owner from losing the output-directory lock", async () => {
    const directory = await mkdtemp(join(tmpdir(), "still-shift-lock-"));
    try {
      const lockPath = join(directory, ".batch.lock");
      const release = await acquireBatchLock(lockPath, directory);
      await expect(acquireBatchLock(lockPath, directory)).rejects.toThrow(
        "already in use",
      );
      await release();
      const nextRelease = await acquireBatchLock(lockPath, directory);
      await nextRelease();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("recovers a stale lock when its PID belongs to another process", async () => {
    const directory = await mkdtemp(join(tmpdir(), "still-shift-reused-pid-"));
    try {
      const lockPath = join(directory, ".batch.lock");
      await writeFile(
        lockPath,
        JSON.stringify({
          pid: process.pid,
          token: "dead-owner",
          processStartedAt: "earlier process start",
        }),
      );
      const release = await acquireBatchLock(lockPath, directory);
      try {
        expect(JSON.parse(await readFile(lockPath, "utf8"))).toMatchObject({
          pid: process.pid,
          processStartedAt: expect.any(String),
        });
      } finally {
        await release();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("allows only one process to recover a stale lock", async () => {
    const directory = await mkdtemp(join(tmpdir(), "still-shift-lock-race-"));
    const lockPath = join(directory, ".batch.lock");
    const workers: ChildProcess[] = [];
    try {
      await writeFile(
        lockPath,
        JSON.stringify({ pid: 99999999, token: "dead" }),
      );
      const ready = Array.from({ length: 12 }, () => {
        const worker = fork(
          new URL("../fixtures/batch-lock-worker.mts", import.meta.url),
          [lockPath, directory],
          { execArgv: ["--import", "tsx"] },
        );
        workers.push(worker);
        return nextWorkerMessage(worker);
      });
      expect(await Promise.all(ready)).toEqual(Array(12).fill("ready"));

      const results = workers.map((worker) => nextWorkerMessage(worker));
      workers.forEach((worker) => worker.send("acquire"));
      const outcomes = await Promise.all(results);
      expect(outcomes.filter((outcome) => outcome === "acquired")).toHaveLength(
        1,
      );
      expect(outcomes.filter((outcome) => outcome === "rejected")).toHaveLength(
        11,
      );
      expect(JSON.parse(await readFile(lockPath, "utf8"))).toMatchObject({
        pid: workers[outcomes.indexOf("acquired")]!.pid,
      });
    } finally {
      workers.forEach((worker) => worker.kill());
      await rm(directory, { recursive: true, force: true });
    }
  }, 15_000);

  it("recovers after a process holding the recovery guard is killed", async () => {
    const directory = await mkdtemp(join(tmpdir(), "still-shift-dead-guard-"));
    const lockPath = join(directory, ".batch.lock");
    const script = [
      "import fcntl, sys",
      "with open(sys.argv[1], 'a+b') as guard:",
      "    fcntl.flock(guard, fcntl.LOCK_EX)",
      "    print('locked', flush=True)",
      "    sys.stdin.read()",
    ].join("\n");
    const python = fileURLToPath(
      new URL("../../.venv/bin/python", import.meta.url),
    );
    const guard = spawn(python, ["-c", script, `${lockPath}.recovery`], {
      stdio: ["pipe", "pipe", "inherit"],
    });
    try {
      await writeFile(
        lockPath,
        JSON.stringify({ pid: 99999999, token: "dead" }),
      );
      const ready = new Promise<string>((resolve, reject) => {
        guard.stdout.once("data", (chunk: Buffer) =>
          resolve(chunk.toString().trim()),
        );
        guard.once("error", reject);
      });
      expect(await ready).toBe("locked");
      await expect(acquireBatchLock(lockPath, directory)).rejects.toThrow(
        "already in use",
      );
      const exited = new Promise<void>((resolve) =>
        guard.once("exit", () => resolve()),
      );
      guard.kill("SIGKILL");
      await exited;

      const release = await acquireBatchLock(lockPath, directory);
      try {
        expect(JSON.parse(await readFile(lockPath, "utf8"))).toMatchObject({
          pid: process.pid,
        });
      } finally {
        await release();
      }
    } finally {
      guard.kill();
      await rm(directory, { recursive: true, force: true });
    }
  }, 10_000);

  it("keeps the recovery guard empty across repeated recoveries", async () => {
    const directory = await mkdtemp(join(tmpdir(), "still-shift-guard-size-"));
    const lockPath = join(directory, ".batch.lock");
    try {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await writeFile(
          lockPath,
          JSON.stringify({ pid: 99999999, token: `dead-${attempt}` }),
        );
        const release = await acquireBatchLock(lockPath, directory);
        await release();
      }
      expect((await stat(`${lockPath}.recovery`)).size).toBe(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not replace outputs when the progress marker is absent or mismatched", async () => {
    const directory = await mkdtemp(join(tmpdir(), "still-shift-progress-"));
    try {
      const outputPath = join(directory, "clip.mp4");
      const markerPath = join(directory, "clip.in-progress.json");
      const progress = {
        requestHash: "request",
        sourceHash: "source",
        outputPath,
        sceneManifestPath: `${outputPath}.scene.json`,
      };
      await writeFile(outputPath, "existing clip");
      await expect(prepareBatchItem(markerPath, progress)).rejects.toThrow(
        "without a checkpoint or progress marker",
      );
      await writeFile(
        markerPath,
        JSON.stringify({ ...progress, sourceHash: "previous source" }),
      );
      await expect(prepareBatchItem(markerPath, progress)).rejects.toThrow(
        "changed after an interrupted render",
      );
      expect(await readFile(outputPath, "utf8")).toBe("existing clip");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("removes only temporary exports from the interrupted item", async () => {
    const directory = await mkdtemp(join(tmpdir(), "still-shift-orphan-"));
    try {
      const outputPath = join(directory, "clip.mp4");
      const markerPath = join(directory, "clip.in-progress.json");
      const progress = {
        requestHash: "request",
        sourceHash: "source",
        outputPath,
        sceneManifestPath: `${outputPath}.scene.json`,
      };
      const uuid = "12345678-1234-1234-1234-123456789abc";
      const orphanVideo = join(directory, `.clip.mp4.${uuid}.tmp.mp4`);
      const orphanScene = join(directory, `.clip.mp4.${uuid}.scene.tmp.json`);
      const otherVideo = join(directory, `.other.mp4.${uuid}.tmp.mp4`);
      await writeFile(markerPath, JSON.stringify(progress));
      await writeFile(orphanVideo, "partial video");
      await writeFile(orphanScene, "partial scene");
      await writeFile(otherVideo, "other item");

      await prepareBatchItem(markerPath, progress);

      await expect(readFile(orphanVideo)).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(readFile(orphanScene)).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(await readFile(otherVideo, "utf8")).toBe("other item");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
