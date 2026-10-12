import { mkdtemp, readFile, rm, writeFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import {
  runMechanismProductionQueue,
  MechanismProductionTransientError,
  MechanismProductionQueueSchema,
  MechanismProductionQueueStateSchema,
} from "../../packages/animation-engine/src/mechanism/production-queue.ts";
import { summarizeMechanismProductionCohort } from "../../packages/animation-engine/src/mechanism/production-report.ts";
import { mechanismPackHash } from "../../packages/animation-engine/src/mechanism/pack-support.ts";
import {
  fixture,
  product,
  executor,
  hash,
} from "../fixtures/mechanism-production-queue-support.ts";
describe("durable production queue", () => {
  it("seals each item and revalidates existing dependency/output bytes before reuse", async () => {
    const f = await fixture();
    let calls = 0;
    try {
      const worker = executor(async (i, c) => {
        calls++;
        return product(i, c);
      });
      const first = await runMechanismProductionQueue(f.path, f.output, worker);
      const again = await runMechanismProductionQueue(f.path, f.output, worker);
      expect(calls).toBe(2);
      expect(again.rows.map((r) => r.status)).toEqual(["passed", "passed"]);
      expect(first.rows.every((r) => r.attempts.length === 1)).toBe(true);
      expect(
        MechanismProductionQueueStateSchema.parse(
          JSON.parse(
            await readFile(join(f.output, "queue-state.json"), "utf8"),
          ),
        ),
      ).toEqual(again);
      const body = JSON.parse(
        await readFile(join(f.output, again.rows[0]!.product!.path), "utf8"),
      );
      expect(
        body.report.qa.filter(
          (q: { status: string }) => q.status === "unreviewed",
        ),
      ).toHaveLength(5);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("bounds transient retries and preserves independent permanent failures", async () => {
    const f = await fixture();
    const counts = new Map<string, number>();
    try {
      const worker = executor(async (i, c) => {
        const n = (counts.get(i.id) ?? 0) + 1;
        counts.set(i.id, n);
        if (i.id === "E01") throw new Error("permanent fixture failure");
        if (n < 3)
          throw new MechanismProductionTransientError(
            "temporary worker interruption",
          );
        return product(i, c);
      });
      const state = await runMechanismProductionQueue(f.path, f.output, worker);
      expect(state.rows.map((r) => r.status)).toEqual(["failed", "passed"]);
      expect(state.rows[1]!.attempts.map((a) => a.status)).toEqual([
        "failed",
        "failed",
        "passed",
      ]);
      await runMechanismProductionQueue(f.path, f.output, worker);
      expect([...counts.values()]).toEqual([1, 3]);
      const body = JSON.parse(
        await readFile(join(f.output, state.rows[1]!.product!.path), "utf8"),
      );
      expect(
        summarizeMechanismProductionCohort([body.report]).firstPassTechnical
          .rate,
      ).toBe(0);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("stops exhausted transient attempts and retains all failure diagnostics", async () => {
    const f = await fixture();
    let calls = 0;
    try {
      const state = await runMechanismProductionQueue(
        f.path,
        f.output,
        executor(async () => {
          calls++;
          throw new MechanismProductionTransientError("worker stopped");
        }),
      );
      expect(calls).toBe(6);
      expect(state.rows.every((r) => r.attempts.length === 3)).toBe(true);
      expect(
        state.rows.every((r) =>
          r.attempts.every((a) => a.diagnostic?.includes("worker stopped")),
        ),
      ).toBe(true);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("locates changed dependency bytes without suppressing other item execution", async () => {
    const f = await fixture();
    let calls = 0;
    try {
      f.manifest.items[0]!.inputs[0]!.sha256 = hash("wrong");
      // Detach the second item's pins from the intentionally shared fixture array.
      f.manifest.items[1]!.inputs = [
        { path: "family.json", bytes: 2, sha256: hash("{}") },
        { path: "cues.json", bytes: 2, sha256: hash("{}") },
      ];
      await writeFile(f.path, JSON.stringify(f.manifest));
      const state = await runMechanismProductionQueue(
        f.path,
        f.output,
        executor(async (i, c) => {
          calls++;
          return product(i, c);
        }),
      );
      expect(calls).toBe(1);
      expect(state.rows.map((r) => r.status)).toEqual(["failed", "passed"]);
      expect(state.rows[0]!.attempts[0]!.stage).toBe("dependency-admission");
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("retires tampered cached products, retains their rejection and rerenders only affected items", async () => {
    const f = await fixture();
    let calls = 0;
    try {
      const worker = executor(async (i, c) => {
        calls++;
        return product(i, c);
      });
      const old = await runMechanismProductionQueue(f.path, f.output, worker);
      const body = JSON.parse(
        await readFile(join(f.output, old.rows[0]!.product!.path), "utf8"),
      );
      await writeFile(join(f.output, body.artifacts[0].path), "tampered");
      const state = await runMechanismProductionQueue(f.path, f.output, worker);
      expect(calls).toBe(3);
      expect(state.rows[0]!.priorProducts).toHaveLength(1);
      expect(state.rows[0]!.cacheFailures).toHaveLength(1);
      expect(state.rows[0]!.attempts).toHaveLength(2);
      expect(state.rows[1]!.attempts).toHaveLength(1);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("requires exact revision/hash and prevents repurposing a selected question", async () => {
    const f = await fixture();
    try {
      await runMechanismProductionQueue(f.path, f.output, executor());
      const oldHash = mechanismPackHash(f.manifest);
      f.manifest.revision = 1;
      f.manifest.baseHash = hash("stale");
      await writeFile(f.path, JSON.stringify(f.manifest));
      await expect(
        runMechanismProductionQueue(f.path, f.output, executor()),
      ).rejects.toThrow(/previous revision/);
      f.manifest.baseHash = oldHash;
      f.manifest.items[0]!.question = "A different explanation";
      await writeFile(f.path, JSON.stringify(f.manifest));
      await expect(
        runMechanismProductionQueue(f.path, f.output, executor()),
      ).rejects.toThrow(/preserve its explanation/);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("invalidates changed inputs through a fresh revision while preserving prior products/attempts", async () => {
    const f = await fixture();
    let calls = 0;
    try {
      const worker = executor(async (i, c) => {
        calls++;
        return product(i, c);
      });
      await runMechanismProductionQueue(f.path, f.output, worker);
      const oldHash = mechanismPackHash(f.manifest);
      await writeFile(join(f.root, "cues2.json"), "{}");
      f.manifest.items[0]!.cuePath = "cues2.json";
      f.manifest.items[0]!.inputs = [
        { path: "family.json", bytes: 2, sha256: hash("{}") },
        { path: "cues2.json", bytes: 2, sha256: hash("{}") },
      ];
      f.manifest.revision = 1;
      f.manifest.baseHash = oldHash;
      await writeFile(f.path, JSON.stringify(f.manifest));
      const state = await runMechanismProductionQueue(f.path, f.output, worker);
      expect(calls).toBe(3);
      expect(state.rows[0]!.priorProducts).toHaveLength(1);
      expect(state.rows[0]!.attempts.map((a) => a.revision)).toEqual([0, 1]);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("persists cancellation and resumes untouched pending items later", async () => {
    const f = await fixture(),
      controller = new AbortController();
    try {
      const cancelled = await runMechanismProductionQueue(
        f.path,
        f.output,
        executor(async (_i, c) => {
          await c.progress("render");
          controller.abort(Error("stop queue"));
          c.signal!.throwIfAborted();
          throw Error("unreachable");
        }),
        { signal: controller.signal },
      );
      expect(cancelled.rows.map((r) => r.status)).toEqual([
        "cancelled",
        "pending",
      ]);
      const resumed = await runMechanismProductionQueue(
        f.path,
        f.output,
        executor(),
      );
      expect(resumed.rows.map((r) => r.status)).toEqual(["passed", "passed"]);
      expect(resumed.rows[0]!.attempts.map((a) => a.status)).toEqual([
        "cancelled",
        "passed",
      ]);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("adopts a sealed finished attempt after a lost final checkpoint without rerender", async () => {
    const f = await fixture();
    let calls = 0;
    try {
      const worker = executor(async (i, c) => {
        calls++;
        return product(i, c);
      });
      const old = await runMechanismProductionQueue(f.path, f.output, worker);
      old.rows[0]!.status = "running";
      old.rows[0]!.product = null;
      Object.assign(old.rows[0]!.attempts[0]!, {
        status: "running",
        endedUtc: null,
        seconds: null,
      });
      await writeFile(join(f.output, "queue-state.json"), JSON.stringify(old));
      const resumed = await runMechanismProductionQueue(
        f.path,
        f.output,
        worker,
      );
      expect(calls).toBe(2);
      expect(resumed.rows[0]!.attempts).toHaveLength(1);
      expect(resumed.rows[0]!.status).toBe("passed");
      expect(resumed.rows[0]!.attempts[0]!.seconds).not.toBeNull();
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("relocates relative dependency and owned-artifact locators without changing the request", async () => {
    const f = await fixture();
    let calls = 0;
    const relocated = await mkdtemp(
      join(tmpdir(), "still-shift-queue-relocated-"),
    );
    try {
      const worker = executor(async (i, c) => {
        calls++;
        return product(i, c);
      });
      const first = await runMechanismProductionQueue(f.path, f.output, worker);
      await cp(f.root, relocated, { recursive: true });
      const next = await runMechanismProductionQueue(
        join(relocated, "queue.json"),
        join(relocated, "output"),
        worker,
      );
      expect(calls).toBe(2);
      expect(next.manifestHash).toBe(first.manifestHash);
    } finally {
      await rm(f.root, { recursive: true, force: true });
      await rm(relocated, { recursive: true, force: true });
    }
  });
  it("rejects wrong executor identities and malformed manifests before execution", async () => {
    const f = await fixture();
    let calls = 0;
    try {
      await expect(
        runMechanismProductionQueue(f.path, f.output, {
          ...executor(),
          codeSha256: hash("other"),
        }),
      ).rejects.toThrow(/Executor code/);
      const bad = {
        ...f.manifest,
        items: [f.manifest.items[0], f.manifest.items[0]],
      };
      expect(MechanismProductionQueueSchema.safeParse(bad).success).toBe(false);
      await writeFile(f.path, '{"schemaVersion":');
      await expect(
        runMechanismProductionQueue(
          f.path,
          f.output,
          executor(async (i, c) => {
            calls++;
            return product(i, c);
          }),
        ),
      ).rejects.toThrow();
      expect(calls).toBe(0);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("transfers retained result capacity to a supplied parent and preserves foreign leases", async () => {
    const f = await fixture(),
      parent = new CompositionNodeMemory(),
      foreign = parent.reserve(1024);
    try {
      await runMechanismProductionQueue(
        f.path,
        f.output,
        executor(async (i, c) => {
          c.nodeMemory.reserve(4096);
          return product(i, c);
        }),
        { nodeMemory: parent },
      );
      expect(foreign.active).toBe(true);
      expect(parent.statistics.current.metadata).toBe(64 * 1024 * 1024 + 1024);
      parent.dispose();
      expect(parent.statistics.reservations).toBe(0);
    } finally {
      parent.dispose();
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("rejects journal/request substitutions and refuses missing audit history", async () => {
    const f = await fixture();
    try {
      const state = await runMechanismProductionQueue(
        f.path,
        f.output,
        executor(),
      );
      state.rows[0]!.requestHash = hash("forged");
      await writeFile(
        join(f.output, "queue-state.json"),
        JSON.stringify(state),
      );
      await expect(
        runMechanismProductionQueue(f.path, f.output, executor()),
      ).rejects.toThrow(/Stored journal/);
      await rm(join(f.output, "queue-state.json"));
      await expect(
        runMechanismProductionQueue(f.path, f.output, executor()),
      ).rejects.toThrow(/history exists/);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("does not publish a worker product after an input changes during execution", async () => {
    const f = await fixture();
    try {
      const state = await runMechanismProductionQueue(
        f.path,
        f.output,
        executor(async (i, c) => {
          const result = await product(i, c);
          await writeFile(join(f.root, "cues.json"), "changed");
          return result;
        }),
      );
      expect(state.rows[0]!.status).toBe("failed");
      expect(state.rows[0]!.product).toBeNull();
      expect(state.rows[0]!.attempts[0]!.diagnostic).toBeTruthy();
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("rejects a worker report from a different input/code/output identity", async () => {
    const f = await fixture();
    try {
      const state = await runMechanismProductionQueue(
        f.path,
        f.output,
        executor(async (i, c) => {
          const result = await product(i, c);
          result.report.binding.inputSha256 = hash("other");
          return result;
        }),
      );
      expect(state.rows.every((r) => r.status === "failed")).toBe(true);
      expect(
        state.rows.every((r) =>
          r.attempts[0]!.diagnostic?.includes("queue request"),
        ),
      ).toBe(true);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
});
