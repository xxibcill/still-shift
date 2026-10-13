import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ native: vi.fn() }));
vi.mock("@still-shift/animation-engine", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createMechanismProductionNativeExecutor: mocks.native,
}));
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import {
  fixture,
  executor,
  product,
} from "../fixtures/mechanism-production-queue-support.ts";
import { MechanismCommandReceiptSchema } from "../../packages/animation-engine/src/mechanism/protocol.ts";
async function run(args: string[]) {
  let stdout = "",
    stderr = "";
  const code = await runCli(["production", ...args], {
    stdout: (v) => {
      stdout += v;
    },
    stderr: (v) => {
      stderr += v;
    },
  });
  return { code, stdout, stderr };
}
describe("production run CLI with declared fixture adapter", () => {
  it("returns bounded terminal rows and verifies completed products without another execution", async () => {
    const f = await fixture();
    let calls = 0;
    const signalListeners = process.listeners("SIGTERM");
    try {
      mocks.native.mockResolvedValue(
        executor(async (item, context) => {
          calls++;
          return product(item, context);
        }),
      );
      const first = await run([
        "run",
        "--manifest",
        f.path,
        "--output-dir",
        f.output,
        "--report",
        join(f.root, "first.json"),
        "--limit",
        "1",
      ]);
      expect(first.code).toBe(0);
      expect(first.stderr).toBe("");
      const receipt = MechanismCommandReceiptSchema.parse(
        JSON.parse(first.stdout),
      );
      expect(receipt.status).toBe("passed");
      expect(receipt.truncated).toBe(true);
      expect(receipt.items).toHaveLength(1);
      expect(receipt.summary).toMatchObject({
        selected: 2,
        passed: 2,
        failed: 0,
        pilotAdmission: "not-established",
      });
      const before = JSON.parse(
        await readFile(join(f.output, "queue-state.json"), "utf8"),
      );
      const second = await run([
        "run",
        "--manifest",
        f.path,
        "--output-dir",
        f.output,
        "--report",
        join(f.root, "second.json"),
      ]);
      expect(second.code).toBe(0);
      expect(calls).toBe(2);
      expect(
        JSON.parse(await readFile(join(f.output, "queue-state.json"), "utf8"))
          .rows,
      ).toEqual(before.rows);
      expect(process.listeners("SIGTERM")).toEqual(signalListeners);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("retains a permanent item failure and emits failed receipt/exit1 while its neighbor completes", async () => {
    const f = await fixture();
    try {
      mocks.native.mockResolvedValue(
        executor(async (item, context) => {
          if (item.id === "E02") throw Error("declared fixture failure");
          return product(item, context);
        }),
      );
      const result = await run([
        "run",
        "--manifest",
        f.path,
        "--output-dir",
        f.output,
        "--report",
        join(f.root, "failed.json"),
      ]);
      expect(result.code).toBe(1);
      const receipt = MechanismCommandReceiptSchema.parse(
        JSON.parse(result.stdout),
      );
      expect(receipt.status).toBe("failed");
      expect(receipt.summary).toMatchObject({ passed: 1, failed: 1 });
      expect(receipt.items[1]!.diagnostic).toContain(
        "declared fixture failure",
      );
      const state = JSON.parse(
        await readFile(join(f.output, "queue-state.json"), "utf8"),
      );
      expect(state.rows.map((r: { status: string }) => r.status)).toEqual([
        "passed",
        "failed",
      ]);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("runs only its own signal callback, persists cancellation and retires listeners", async () => {
    const f = await fixture();
    const prior = process.listeners("SIGTERM");
    try {
      mocks.native.mockResolvedValue(
        executor(async (_item, context) => {
          await context.progress("fixture-signal-cancel");
          const handler = process
            .listeners("SIGTERM")
            .find((fn) => !prior.includes(fn));
          expect(handler).toBeDefined();
          handler!("SIGTERM");
          context.signal!.throwIfAborted();
          throw Error("unreachable");
        }),
      );
      const result = await run([
        "run",
        "--manifest",
        f.path,
        "--output-dir",
        f.output,
        "--report",
        join(f.root, "cancelled.json"),
      ]);
      expect(result.code).toBe(130);
      expect(
        MechanismCommandReceiptSchema.parse(JSON.parse(result.stdout)).status,
      ).toBe("cancelled");
      const state = JSON.parse(
        await readFile(join(f.output, "queue-state.json"), "utf8"),
      );
      expect(state.rows.map((r: { status: string }) => r.status)).toEqual([
        "cancelled",
        "pending",
      ]);
      expect(process.listeners("SIGTERM")).toEqual(prior);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("reports cancellation before a queue result without inventing journal row statuses", async () => {
    const f = await fixture();
    const prior = process.listeners("SIGTERM");
    try {
      mocks.native.mockImplementationOnce(async () => {
        const handler = process
          .listeners("SIGTERM")
          .find((fn) => !prior.includes(fn));
        handler!("SIGTERM");
        return executor();
      });
      const result = await run([
        "run",
        "--manifest",
        f.path,
        "--output-dir",
        f.output,
        "--report",
        join(f.root, "early.json"),
      ]);
      expect(result.code).toBe(130);
      expect(
        MechanismCommandReceiptSchema.parse(JSON.parse(result.stdout)).summary
          .queueResult,
      ).toBe("unavailable");
      expect(process.listeners("SIGTERM")).toEqual(prior);
      const complete = JSON.parse(
        await readFile(join(f.root, "early.json"), "utf8"),
      );
      expect(complete).not.toHaveProperty("rows");
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
});
