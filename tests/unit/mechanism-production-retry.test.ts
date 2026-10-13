import {
  readFile,
  writeFile,
  rm,
  symlink,
  mkdtemp,
  cp,
  mkdir,
} from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import {
  runMechanismProductionQueue,
  retryMechanismProductionQueue,
  MechanismProductionRetrySchema,
  MechanismProductionTransientError,
} from "@still-shift/animation-engine";
import { mechanismPackHash } from "../../packages/animation-engine/src/mechanism/pack-support.ts";
import {
  fixture,
  executor,
  product,
  hash,
} from "../fixtures/mechanism-production-queue-support.ts";
async function retryRequest(
  f: Awaited<ReturnType<typeof fixture>>,
  ids: string[],
  revision = 0,
  baseHash = mechanismPackHash(f.manifest),
) {
  const path = join(f.root, "retry.json");
  await writeFile(
    path,
    JSON.stringify({
      schemaVersion: "mechanism-production-retry-1",
      baseRevision: revision,
      baseHash,
      episodes: ids,
    }),
  );
  return path;
}
describe("bounded targeted production retries", () => {
  it("retains journal bytes and manifest ancestry, then repairs one permanent failure while reusing its completed neighbor", async () => {
    const f = await fixture();
    let broken = true,
      calls = 0;
    const parent = new CompositionNodeMemory(),
      foreign = parent.reserve(1024);
    const worker = executor(async (item, context) => {
      calls++;
      if (item.id === "E02" && broken) throw Error("seeded export failure");
      return product(item, context);
    });
    try {
      const first = await runMechanismProductionQueue(f.path, f.output, worker);
      await runMechanismProductionQueue(f.path, f.output, worker);
      expect(calls).toBe(2);
      const original = await readFile(join(f.output, "queue-state.json"));
      const request = await retryRequest(f, ["E02"]);
      const update = await retryMechanismProductionQueue(
        f.path,
        f.output,
        request,
        { nodeMemory: parent },
      );
      expect(await readFile(join(f.output, "queue-state.json"))).toEqual(
        original,
      );
      expect(update.revision).toBe(1);
      expect(update.episodes).toEqual(["E02"]);
      expect(update.archives).toHaveLength(2);
      const next = JSON.parse(await readFile(f.path, "utf8"));
      expect(next.items).toEqual(f.manifest.items);
      expect(next.baseHash).toBe(first.manifestHash);
      expect(next.retryFailedIds).toEqual(["E02"]);
      for (const archive of update.archives) {
        const bytes = await readFile(join(f.output, archive.path));
        expect(hash(bytes)).toBe(archive.sha256);
        expect(mechanismPackHash(JSON.parse(bytes.toString()))).toBe(
          archive.path.includes(first.manifestHash.slice(7))
            ? first.manifestHash
            : update.manifestHash,
        );
      }
      broken = false;
      const final = await runMechanismProductionQueue(f.path, f.output, worker);
      expect(calls).toBe(3);
      expect(final.rows.map((r) => r.status)).toEqual(["passed", "passed"]);
      expect(final.rows[0]).toEqual(first.rows[0]);
      expect(
        final.rows[1]!.attempts.map((a) => [a.status, a.revision]),
      ).toEqual([
        ["failed", 0],
        ["passed", 1],
      ]);
      expect(final.rows[1]!.requestHash).toBe(first.rows[1]!.requestHash);
      expect(foreign.active).toBe(true);
      expect(parent.statistics.current.metadata).toBe(1024);
    } finally {
      parent.dispose();
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("does not grant a new batch to unselected failures or repeat a consumed authorization", async () => {
    const f = await fixture();
    const calls: string[] = [];
    const worker = executor(async (item) => {
      calls.push(item.id);
      throw Error("permanent fixture failure");
    });
    try {
      await runMechanismProductionQueue(f.path, f.output, worker);
      const request = await retryRequest(f, ["E01"]);
      await retryMechanismProductionQueue(f.path, f.output, request);
      const state = await runMechanismProductionQueue(f.path, f.output, worker);
      expect(calls).toEqual(["E01", "E02", "E01"]);
      expect(state.rows[1]!.attempts).toHaveLength(1);
      await runMechanismProductionQueue(f.path, f.output, worker);
      expect(calls).toHaveLength(3);
      await expect(
        retryMechanismProductionQueue(f.path, f.output, request),
      ).rejects.toThrow(/exact current/);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("holds an unselected cancelled neighbor until its own explicit authorization", async () => {
    const f = await fixture(),
      controller = new AbortController();
    const calls: string[] = [];
    try {
      const initial = await runMechanismProductionQueue(
        f.path,
        f.output,
        executor(async (item, context) => {
          if (item.id === "E01") throw Error("fixture failure");
          controller.abort(Error("fixture cancel"));
          context.signal!.throwIfAborted();
          throw Error("unreachable");
        }),
        { signal: controller.signal },
      );
      expect(initial.rows.map((row) => row.status)).toEqual([
        "failed",
        "cancelled",
      ]);
      let request = await retryRequest(f, ["E01"]);
      await retryMechanismProductionQueue(f.path, f.output, request);
      const worker = executor(async (item, context) => {
        calls.push(item.id);
        return product(item, context);
      });
      const first = await runMechanismProductionQueue(f.path, f.output, worker);
      expect(calls).toEqual(["E01"]);
      expect(first.rows[1]).toEqual(initial.rows[1]);
      const current = JSON.parse(await readFile(f.path, "utf8"));
      request = await retryRequest(f, ["E02"], 1, mechanismPackHash(current));
      await retryMechanismProductionQueue(f.path, f.output, request);
      const final = await runMechanismProductionQueue(f.path, f.output, worker);
      expect(calls).toEqual(["E01", "E02"]);
      expect(final.rows.map((row) => row.status)).toEqual(["passed", "passed"]);
      expect(final.rows[0]).toEqual(first.rows[0]);
      expect(final.rows[1]!.attempts.map((a) => a.status)).toEqual([
        "cancelled",
        "passed",
      ]);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("requires corrupt dependencies to be restored to their pins before retry publication", async () => {
    const f = await fixture();
    try {
      await writeFile(join(f.root, "second.json"), "{}");
      f.manifest.items[1]!.cuePath = "second.json";
      f.manifest.items[1]!.inputs = [
        f.manifest.items[1]!.inputs[0]!,
        { path: "second.json", bytes: 2, sha256: hash("{}") },
      ];
      await writeFile(f.path, JSON.stringify(f.manifest));
      await writeFile(join(f.root, "second.json"), "broken");
      const first = await runMechanismProductionQueue(
        f.path,
        f.output,
        executor(),
      );
      expect(first.rows.map((r) => r.status)).toEqual(["passed", "failed"]);
      const request = await retryRequest(f, ["E02"]),
        before = await readFile(f.path),
        journal = await readFile(join(f.output, "queue-state.json"));
      await expect(
        retryMechanismProductionQueue(f.path, f.output, request),
      ).rejects.toThrow();
      expect(await readFile(f.path)).toEqual(before);
      expect(await readFile(join(f.output, "queue-state.json"))).toEqual(
        journal,
      );
      await writeFile(join(f.root, "second.json"), "{}");
      await retryMechanismProductionQueue(f.path, f.output, request);
      const repaired = await runMechanismProductionQueue(
        f.path,
        f.output,
        executor(),
      );
      expect(repaired.rows.every((r) => r.status === "passed")).toBe(true);
      expect(repaired.rows[0]).toEqual(first.rows[0]);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("admits only one concurrent CAS writer and rejects completed/unknown targets without mutation", async () => {
    const f = await fixture();
    try {
      await runMechanismProductionQueue(
        f.path,
        f.output,
        executor(async (item, context) => {
          if (item.id === "E02") throw Error("fixture failure");
          return product(item, context);
        }),
      );
      for (const id of ["E01", "missing"]) {
        const request = await retryRequest(f, [id]),
          before = await readFile(f.path);
        await expect(
          retryMechanismProductionQueue(f.path, f.output, request),
        ).rejects.toThrow(/eligible failed/);
        expect(await readFile(f.path)).toEqual(before);
      }
      const request = await retryRequest(f, ["E02"]);
      const results = await Promise.allSettled(
        [1, 2].map(() =>
          retryMechanismProductionQueue(f.path, f.output, request),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      expect(JSON.parse(await readFile(f.path, "utf8")).revision).toBe(1);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("serializes one manifest CAS across independent output journals", async () => {
    const f = await fixture(),
      other = await mkdtemp("/private/tmp/retry-second-output-");
    try {
      await runMechanismProductionQueue(
        f.path,
        f.output,
        executor(async () => {
          throw Error("fixture failure");
        }),
      );
      await cp(f.output, other, { recursive: true });
      const request = await retryRequest(f, ["E01"]);
      const updates = await Promise.allSettled([
        retryMechanismProductionQueue(f.path, f.output, request),
        retryMechanismProductionQueue(f.path, other, request),
      ]);
      expect(updates.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(updates.filter((x) => x.status === "rejected")).toHaveLength(1);
      expect(JSON.parse(await readFile(f.path, "utf8")).revision).toBe(1);
      expect(
        JSON.parse(await readFile(join(f.output, "queue-state.json"), "utf8"))
          .revision,
      ).toBe(0);
      expect(
        JSON.parse(await readFile(join(other, "queue-state.json"), "utf8"))
          .revision,
      ).toBe(0);
    } finally {
      await rm(f.root, { recursive: true, force: true });
      await rm(other, { recursive: true, force: true });
    }
  });
  it("rejects an active output owner without altering manifest or journal", async () => {
    const f = await fixture();
    let entered!: () => void, release!: () => void;
    const began = new Promise<void>((resolve) => {
        entered = resolve;
      }),
      hold = new Promise<void>((resolve) => {
        release = resolve;
      });
    let active: Promise<unknown> | undefined;
    try {
      await runMechanismProductionQueue(
        f.path,
        f.output,
        executor(async (item, context) => {
          if (item.id === "E02") throw Error("fixture failure");
          return product(item, context);
        }),
      );
      const request = await retryRequest(f, ["E02"]),
        before = await readFile(f.path);
      active = runMechanismProductionQueue(f.path, f.output, {
        ...executor(),
        verify: async () => {
          entered();
          await hold;
        },
      });
      await began;
      await expect(
        retryMechanismProductionQueue(f.path, f.output, request),
      ).rejects.toThrow(/already in use/);
      expect(await readFile(f.path)).toEqual(before);
    } finally {
      release();
      await active;
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("rejects corrupt retained manifest history before replacing the current declaration", async () => {
    const f = await fixture();
    try {
      await runMechanismProductionQueue(
        f.path,
        f.output,
        executor(async () => {
          throw Error("fixture failure");
        }),
      );
      const request = await retryRequest(f, ["E01"]),
        before = await readFile(f.path);
      await mkdir(join(f.output, "manifest-history"));
      await writeFile(
        join(
          f.output,
          "manifest-history",
          mechanismPackHash(f.manifest).slice(7) + ".json",
        ),
        JSON.stringify({ ...f.manifest, id: "forged" }),
      );
      await expect(
        retryMechanismProductionQueue(f.path, f.output, request),
      ).rejects.toThrow(/different binding/);
      expect(await readFile(f.path)).toEqual(before);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("exhausts the actual 32-revision/96-attempt fixture lifecycle without authorizing a 97th attempt", async () => {
    const f = await fixture();
    f.manifest.items = f.manifest.items.slice(0, 1);
    await writeFile(f.path, JSON.stringify(f.manifest));
    let calls = 0;
    const worker = executor(async () => {
      calls++;
      throw new MechanismProductionTransientError("transient fixture failure");
    });
    try {
      let state = await runMechanismProductionQueue(f.path, f.output, worker);
      for (let revision = 0; revision < 31; revision++) {
        const current = JSON.parse(await readFile(f.path, "utf8"));
        const request = await retryRequest(
          f,
          ["E01"],
          revision,
          mechanismPackHash(current),
        );
        await retryMechanismProductionQueue(f.path, f.output, request);
        state = await runMechanismProductionQueue(f.path, f.output, worker);
      }
      expect(calls).toBe(96);
      expect(state.rows[0]!.attempts).toHaveLength(96);
      await runMechanismProductionQueue(f.path, f.output, worker);
      expect(calls).toBe(96);
      const current = JSON.parse(await readFile(f.path, "utf8")),
        before = await readFile(f.path);
      const request = await retryRequest(
        f,
        ["E01"],
        31,
        mechanismPackHash(current),
      );
      await expect(
        retryMechanismProductionQueue(f.path, f.output, request),
      ).rejects.toThrow();
      expect(await readFile(f.path)).toEqual(before);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  }, 20000);
  it("rejects escaped manifest history, cancellation and exhausted request limits", async () => {
    const f = await fixture(),
      outside = await mkdtemp("/private/tmp/retry-history-escape-");
    try {
      await runMechanismProductionQueue(
        f.path,
        f.output,
        executor(async () => {
          throw Error("fixture failure");
        }),
      );
      const request = await retryRequest(f, ["E01"]),
        before = await readFile(f.path);
      await symlink(outside, join(f.output, "manifest-history"));
      await expect(
        retryMechanismProductionQueue(f.path, f.output, request),
      ).rejects.toThrow(/escapes/);
      expect(await readFile(f.path)).toEqual(before);
      const controller = new AbortController();
      controller.abort(Error("stop retry"));
      await expect(
        retryMechanismProductionQueue(f.path, f.output, request, {
          signal: controller.signal,
        }),
      ).rejects.toThrow(/stop retry/);
      expect(await readFile(f.path)).toEqual(before);
      expect(
        MechanismProductionRetrySchema.safeParse({
          schemaVersion: "mechanism-production-retry-1",
          baseRevision: 31,
          baseHash: hash("x"),
          episodes: ["E01"],
        }).success,
      ).toBe(false);
      expect(
        MechanismProductionRetrySchema.safeParse({
          schemaVersion: "mechanism-production-retry-1",
          baseRevision: 0,
          baseHash: hash("x"),
          episodes: Array(33).fill("E01"),
        }).success,
      ).toBe(false);
    } finally {
      await rm(f.root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});
