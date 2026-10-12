import { readFile, writeFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import {
  readMechanismProductionReports,
  runMechanismProductionQueue,
  MechanismProductionTransientError,
  MechanismProductionCohortReportSchema,
  inspectMechanismProductionCapabilities,
} from "@still-shift/animation-engine";
import {
  fixture,
  executor,
  product,
  hash,
} from "../fixtures/mechanism-production-queue-support.ts";
import { createMechanismCommandReceipt } from "../../packages/animation-engine/src/mechanism/protocol.ts";
const run = async () => {
  const f = await fixture();
  const e = executor();
  const state = await runMechanismProductionQueue(f.path, f.output, e);
  return { ...f, e, state };
};
describe("durable production episode and cohort reports", () => {
  it("retains actual failed/retried/permanent attempts, incomplete reviews and null measurements without executing another job", async () => {
    const f = await fixture();
    let calls = 0,
      first = true,
      verifications = 0;
    const e = executor(async (item, context) => {
      calls++;
      if (item.id === "E02") throw Error("permanent seeded output failure");
      if (first) {
        first = false;
        throw new MechanismProductionTransientError("temporary seeded failure");
      }
      return product(item, context);
    });
    await runMechanismProductionQueue(f.path, f.output, e);
    expect(calls).toBe(3);
    const before = await readFile(join(f.output, "queue-state.json"));
    const result = await readMechanismProductionReports(f.path, f.output, {
      ...e,
      verify: async () => {
        verifications++;
      },
    });
    expect(calls).toBe(3);
    expect(verifications).toBe(1);
    expect(await readFile(join(f.output, "queue-state.json"))).toEqual(before);
    expect(
      result.episodes.map((r) => [r.queueStatus, r.validation.status]),
    ).toEqual([
      ["passed", "verified"],
      ["failed", "unavailable"],
    ]);
    expect(result.cohort).toMatchObject({
      selected: 2,
      attempted: 2,
      firstPassTechnical: { completed: 2, passed: 0, rate: 0 },
      failures: { failedAttempts: 2, repeatedFailureEpisodes: 0 },
      reviewedReady: 0,
      reviewCounts: { technical: { passed: 1, failed: 0, unreviewed: 1 } },
      authoring: { savings: null, targetSatisfied: null },
      durations: { routineSeconds: { available: 0, p50: null, p95: null } },
    });
    expect(MechanismProductionCohortReportSchema.parse(result.cohort)).toEqual(
      result.cohort,
    );
    await expect(access(join(f.output, ".production.lock"))).rejects.toThrow();
  });
  it("invalidates readiness for current runtime mismatch while retaining original artifact review records and durations", async () => {
    const f = await run();
    let verifyCalls = 0;
    const result = await readMechanismProductionReports(f.path, f.output, {
      ...f.e,
      codeSha256: hash("changed-code"),
      verify: async () => {
        verifyCalls++;
      },
    });
    expect(verifyCalls).toBe(0);
    expect(
      result.episodes.every(
        (r) => r.validation.status === "stale" && !r.disposition.reviewedReady,
      ),
    ).toBe(true);
    expect(result.episodes[0]?.retainedQA[0]?.status).toBe("passed");
    expect(
      result.episodes[0]?.report.qa.every((q) => q.status === "unreviewed"),
    ).toBe(true);
    expect(result.cohort.reviewCounts.technical).toEqual({
      passed: 0,
      failed: 0,
      unreviewed: 2,
    });
  });
  it("reports altered output independently while still verifying the other selected episode", async () => {
    const f = await run();
    const sealed = JSON.parse(
      await readFile(join(f.output, f.state.rows[0]!.product!.path), "utf8"),
    );
    await writeFile(join(f.output, sealed.artifacts[0].path), "corrupt bytes");
    const result = await readMechanismProductionReports(f.path, f.output, f.e);
    expect(result.episodes.map((r) => r.validation.status)).toEqual([
      "stale",
      "verified",
    ]);
    expect(result.episodes[0]?.report.binding.outputSha256).toBeNull();
    expect(result.episodes[0]?.retainedQA[0]?.status).toBe("passed");
    expect(result.episodes[0]?.validation.issue?.path).toContain(
      "artifact.txt",
    );
  });
  it("rejects changed dependencies and missing sealed products without losing attempts or prior references", async () => {
    const f = await run();
    await writeFile(join(f.root, "cues.json"), "changed source");
    const result = await readMechanismProductionReports(f.path, f.output, f.e);
    expect(
      result.episodes.every(
        (e) =>
          e.validation.status === "stale" &&
          e.report.attempts.length === 1 &&
          e.product !== null,
      ),
    ).toBe(true);
    await writeFile(join(f.root, "cues.json"), "{}");
    await rm(join(f.output, f.state.rows[0]!.product!.path));
    const missing = await readMechanismProductionReports(f.path, f.output, f.e);
    expect(missing.episodes.map((r) => r.validation.status)).toEqual([
      "stale",
      "verified",
    ]);
  });
  it("detects source/output changes during verifier work and rejects a changed journal at completion", async () => {
    const f = await run();
    let mutated = false;
    const result = await readMechanismProductionReports(f.path, f.output, {
      ...f.e,
      verify: async () => {
        if (!mutated) {
          mutated = true;
          await writeFile(
            join(f.root, "cues.json"),
            "changed during verification",
          );
        }
      },
    });
    expect(result.episodes.every((e) => e.validation.status === "stale")).toBe(
      true,
    );
    await writeFile(join(f.root, "cues.json"), "{}");
    await expect(
      readMechanismProductionReports(f.path, f.output, {
        ...f.e,
        verify: async () => {
          await writeFile(join(f.output, "queue-state.json"), "{}");
        },
      }),
    ).rejects.toThrow(/hash changed/);
  });
  it("rejects mismatched journal binding and verifies missing review evidence before queue publication", async () => {
    const f = await run();
    const path = join(f.output, "queue-state.json"),
      state = JSON.parse(await readFile(path, "utf8"));
    state.rows[0].requestHash = hash("tampered-request");
    await writeFile(path, JSON.stringify(state));
    await expect(
      readMechanismProductionReports(f.path, f.output, f.e),
    ).rejects.toThrow(/journal differs/);
    const fresh = await fixture();
    const e = executor(async (item, context) => {
      const result = await product(item, context);
      result.report.qa[0]!.evidence = [
        { path: "missing-evidence.json", sha256: hash("missing") },
      ];
      return result;
    });
    const rejected = await runMechanismProductionQueue(
      fresh.path,
      fresh.output,
      e,
    );
    expect(rejected.rows.every((r) => r.status === "failed")).toBe(true);
    expect(rejected.rows[0]?.attempts[0]?.diagnostic).toContain(
      "verified owned product artifact",
    );
  });
  it("retires per-call storage, transfers admitted result capacity and preserves a supplied parent's foreign lease", async () => {
    const f = await run();
    const parent = new CompositionNodeMemory(),
      foreign = parent.reserve(1024);
    await readMechanismProductionReports(f.path, f.output, f.e, {
      nodeMemory: parent,
    });
    expect(parent.statistics.current.metadata).toBe(64 * 1024 * 1024 + 1024);
    expect(foreign.active).toBe(true);
    const controller = new AbortController();
    controller.abort(Error("pre-abort"));
    await expect(
      readMechanismProductionReports(f.path, f.output, f.e, {
        nodeMemory: parent,
        signal: controller.signal,
      }),
    ).rejects.toThrow("pre-abort");
    expect(parent.statistics.current.metadata).toBe(64 * 1024 * 1024 + 1024);
    parent.dispose();
    expect(parent.statistics.current.metadata).toBe(0);
  });
  it("uses actual publication limits and one already-published full report under receipt pagination", async () => {
    const f = await run();
    const full = join(f.root, "published.json");
    await writeFile(full, "retained complete report");
    const bytes = await readFile(full);
    const receipt = await createMechanismCommandReceipt(
      {
        command: "summary",
        summary: { scope: "mechanism-production" },
        items: Array.from({ length: 300 }, (_, i) => ({ id: "E" + i })),
        artifacts: [],
      },
      {
        limit: 2,
        retainedFullReport: {
          kind: "full-report",
          path: full,
          sha256: hash(bytes),
        },
      },
    );
    expect(receipt.pagination).toMatchObject({
      returned: 2,
      total: 300,
      nextOffset: 2,
    });
    expect(receipt.artifacts).toHaveLength(1);
    expect(await readFile(full)).toEqual(bytes);
    expect(inspectMechanismProductionCapabilities().queue.items).toBe(300);
  });
});
