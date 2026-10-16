import { fork, type ChildProcess } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runMechanismProductionQueue } from "../../packages/animation-engine/src/mechanism/production-queue.ts";
import {
  fixture,
  executor,
  product,
} from "../fixtures/mechanism-production-queue-support.ts";

function running(worker: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const failed = () => {
      clean();
      reject(Error("Queue worker exited before checkpoint"));
    };
    const message = (value: unknown) => {
      if (value !== "running") return;
      clean();
      resolve();
    };
    const clean = () => {
      worker.off("message", message);
      worker.off("exit", failed);
    };
    worker.on("message", message);
    worker.once("exit", failed);
  });
}
async function stop(worker: ChildProcess) {
  if (worker.exitCode !== null || worker.signalCode !== null) return;
  const ended = new Promise<void>((resolve) =>
    worker.once("exit", () => resolve()),
  );
  worker.kill("SIGKILL");
  await ended;
}
describe("production queue process interruption", () => {
  it("recovers an actual dead owner and retains interrupted files/attempts before completing other items", async () => {
    const f = await fixture();
    const worker = fork(
      new URL(
        "../fixtures/mechanism-production-queue-worker.mts",
        import.meta.url,
      ),
      [f.path, f.output],
      {
        execArgv: ["--import", "tsx"],
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      },
    );
    let stderr = "";
    worker.stderr?.on("data", (chunk) => {
      stderr = (stderr + String(chunk)).slice(-8192);
    });
    try {
      await running(worker);
      const active = JSON.parse(
        await readFile(join(f.output, "queue-state.json"), "utf8"),
      );
      expect(active.rows[0].status).toBe("running");
      expect(active.rows[0].attempts[0].stage).toBe("blocked-export-fixture");
      await stop(worker);
      let calls = 0;
      const resumed = await runMechanismProductionQueue(
        f.path,
        f.output,
        executor(async (i, c) => {
          calls++;
          return product(i, c);
        }),
      );
      expect(calls).toBe(2);
      expect(resumed.rows.map((r) => r.status)).toEqual(["passed", "passed"]);
      expect(resumed.rows[0]!.attempts.map((a) => a.status)).toEqual([
        "interrupted",
        "passed",
      ]);
      expect(resumed.rows[0]!.attempts[0]!.seconds).toBeNull();
      expect(resumed.rows[0]!.attempts[0]!.retryable).toBe(true);
      expect(
        await readFile(join(f.output, "items/E01/1/partial-frame.bin"), "utf8"),
      ).toBe("retained-interrupted-fixture");
      expect(stderr).toBe("");
    } finally {
      await stop(worker);
      await rm(f.root, { recursive: true, force: true });
    }
  }, 15000);
});
