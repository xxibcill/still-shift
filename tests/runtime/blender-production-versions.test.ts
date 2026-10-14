import { readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BlenderProductionQueueSchema,
  BlenderProductionQueueProductSchema,
  MechanismProductionQueueSchema,
  MechanismProductionQueueProductSchema,
  MechanismProductionQueueVersionsSchema,
  MechanismProductionQueueCheckpointVersionsSchema,
  runMechanismProductionQueue,
  readMechanismProductionReports,
  retryMechanismProductionQueue,
  MechanismProductionReportBundleSchema,
  type MechanismProductionExecutor,
  type MechanismProductionQueueItemAny,
  type MechanismProductionExecutionContext,
} from "@still-shift/animation-engine";
import {
  fixture,
  product,
  executor,
  code,
  profile,
} from "../fixtures/mechanism-production-queue-support.ts";
import { mechanismPackHash } from "../../packages/animation-engine/src/mechanism/pack-support.ts";
import { productionQueueItemIdentity } from "../../packages/animation-engine/src/mechanism/production-queue-validation.ts";

async function blenderFixture() {
  const f = await fixture();
  const manifest = BlenderProductionQueueSchema.parse({
    ...f.manifest,
    schemaVersion: "mechanism-production-queue-2",
    items: f.manifest.items.map((item, index) => ({
      ...item,
      id: index ? "EU-005" : "EU-004",
      backend: "blender-native",
      family: index ? "keyhole-slot" : "zipper",
      question: index
        ? "How does a keyhole slot hold a screw?"
        : "How does a zipper join its teeth?",
    })),
  });
  await writeFile(f.path, JSON.stringify(manifest));
  return { ...f, manifest };
}
async function blenderProduct(
  item: MechanismProductionQueueItemAny,
  context: MechanismProductionExecutionContext,
) {
  if (!("backend" in item)) throw Error("Blender fixture requires its backend");
  // Reuse only the synthetic byte-artifact fixture, without any rendering claim.
  const legacy = await product({ ...item, family: "tape-hook" }, context);
  return BlenderProductionQueueProductSchema.parse({
    ...legacy,
    schemaVersion: "mechanism-production-queue-product-2",
    report: {
      ...legacy.report,
      schemaVersion: "mechanism-production-episode-report-2",
      backend: item.backend,
      family: item.family,
    },
  });
}
function blenderExecutor(
  execute: MechanismProductionExecutor["execute"] = blenderProduct,
): MechanismProductionExecutor {
  return {
    codeSha256: code,
    profileSha256: profile,
    execute,
    verify: async () => {},
  };
}
async function sealed(f: { output: string }, path: string) {
  return JSON.parse(await readFile(join(f.output, path), "utf8"));
}

describe("explicit Blender production versions", () => {
  it("preserves legacy admission, canonical identities and schema version instead of extending its family registry", async () => {
    const f = await fixture();
    try {
      expect(MechanismProductionQueueVersionsSchema.parse(f.manifest)).toEqual(
        f.manifest,
      );
      const item = f.manifest.items[0]!;
      expect(productionQueueItemIdentity(item)).toBe(
        mechanismPackHash({
          id: item.id,
          question: item.question,
          family: item.family,
          designVariant: item.designVariant,
        }),
      );
      const native = { ...item, backend: "blender-native" as const };
      expect(productionQueueItemIdentity(native)).not.toBe(
        productionQueueItemIdentity(item),
      );
      expect(
        MechanismProductionQueueSchema.safeParse({
          ...f.manifest,
          items: [native],
        }).success,
      ).toBe(false);
      expect(
        MechanismProductionQueueSchema.safeParse({
          ...f.manifest,
          items: [{ ...item, family: "zipper" }],
        }).success,
      ).toBe(false);
      const state = await runMechanismProductionQueue(
        f.path,
        f.output,
        executor(),
      );
      const body = await sealed(f, state.rows[0]!.product!.path);
      const { completion, ...payload } = body;
      expect(completion.status).toBe("passed");
      expect(MechanismProductionQueueProductSchema.parse(payload)).toEqual(
        payload,
      );
      expect(body.report.schemaVersion).toBe(
        "mechanism-production-episode-report-1",
      );
      expect(body.report).not.toHaveProperty("backend");
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

  it("requires the explicit backend and pinned source documents for every new object", async () => {
    const f = await blenderFixture();
    try {
      const item = f.manifest.items[0]!;
      for (const mutation of [
        { backend: undefined },
        { backend: "three-native" },
        { family: "bad/family" },
        { inputs: item.inputs.slice(0, 1) },
        { inputs: [...item.inputs, item.inputs[0]] },
      ])
        expect(
          BlenderProductionQueueSchema.safeParse({
            ...f.manifest,
            items: [{ ...item, ...mutation }],
          }).success,
        ).toBe(false);
      expect(
        MechanismProductionQueueVersionsSchema.safeParse({
          ...f.manifest,
          schemaVersion: "mechanism-production-queue-1",
        }).success,
      ).toBe(false);
      expect(
        BlenderProductionQueueSchema.safeParse({
          ...f.manifest,
          baseHash: code,
        }).success,
      ).toBe(false);
      expect(
        BlenderProductionQueueSchema.safeParse({
          ...f.manifest,
          items: [
            item,
            {
              ...item,
              id: "another",
              question: "  HOW DOES A ZIPPER JOIN ITS TEETH?  ",
            },
          ],
        }).success,
      ).toBe(false);
      expect(BlenderProductionQueueSchema.parse(f.manifest)).toEqual(
        f.manifest,
      );
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

  it("seals, reopens and reports native-backend artifacts while retaining unreviewed production QA", async () => {
    const f = await blenderFixture();
    let calls = 0;
    const worker = blenderExecutor(async (item, context) => {
      calls++;
      return blenderProduct(item, context);
    });
    try {
      const initial = await runMechanismProductionQueue(
        f.path,
        f.output,
        worker,
      );
      const resumed = await runMechanismProductionQueue(
        f.path,
        f.output,
        worker,
      );
      expect(calls).toBe(2);
      expect(resumed.rows).toEqual(initial.rows);
      const body = await sealed(f, resumed.rows[0]!.product!.path);
      expect(
        MechanismProductionQueueCheckpointVersionsSchema.parse(body),
      ).toEqual(body);
      expect(body.schemaVersion).toBe("mechanism-production-queue-product-2");
      expect(body.report.backend).toBe("blender-native");
      const report = await readMechanismProductionReports(
        f.path,
        f.output,
        worker,
      );
      expect(MechanismProductionReportBundleSchema.parse(report)).toEqual(
        report,
      );
      expect(
        report.episodes.every((e) => e.validation.status === "verified"),
      ).toBe(true);
      expect(report.cohort.reviewedReady).toBe(0);
      expect(report.cohort.authoring.savings).toBeNull();
      expect(
        report.episodes[0]!.report.qa.filter((q) => q.status === "unreviewed"),
      ).toHaveLength(5);
      expect(calls).toBe(2);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

  it("rejects downgraded products even for a family name admitted by both backends", async () => {
    const f = await blenderFixture();
    f.manifest.items = f.manifest.items.map((i) => ({
      ...i,
      family: "tape-hook",
    }));
    await writeFile(f.path, JSON.stringify(f.manifest));
    try {
      const state = await runMechanismProductionQueue(
        f.path,
        f.output,
        blenderExecutor(async (item, context) =>
          product({ ...item, family: "tape-hook" }, context),
        ),
      );
      expect(
        state.rows.every((r) => r.status === "failed" && r.product === null),
      ).toBe(true);
      expect(
        state.rows.every((r) =>
          r.attempts[0]!.diagnostic?.includes("differs from its queue request"),
        ),
      ).toBe(true);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

  it("retains backend identity in failed reports and targeted retry ancestry", async () => {
    const f = await blenderFixture();
    let broken = true,
      calls = 0;
    const worker = blenderExecutor(async (item, context) => {
      calls++;
      if (item.id === "EU-005" && broken)
        throw Error("seeded synthetic failure");
      return blenderProduct(item, context);
    });
    try {
      const first = await runMechanismProductionQueue(f.path, f.output, worker);
      const before = await readFile(join(f.output, "queue-state.json"));
      const report = await readMechanismProductionReports(
        f.path,
        f.output,
        worker,
      );
      expect(report.episodes[1]!.report).toMatchObject({
        schemaVersion: "mechanism-production-episode-report-2",
        backend: "blender-native",
        family: "keyhole-slot",
      });
      expect(report.episodes[1]!.report.binding.outputSha256).toBeNull();
      expect(
        report.episodes[1]!.report.qa.every((q) => q.status === "unreviewed"),
      ).toBe(true);
      expect(await readFile(join(f.output, "queue-state.json"))).toEqual(
        before,
      );
      const retry = join(f.root, "retry.json");
      await writeFile(
        retry,
        JSON.stringify({
          schemaVersion: "mechanism-production-retry-1",
          baseRevision: 0,
          baseHash: first.manifestHash,
          episodes: ["EU-005"],
        }),
      );
      await retryMechanismProductionQueue(f.path, f.output, retry);
      const revision = BlenderProductionQueueSchema.parse(
        JSON.parse(await readFile(f.path, "utf8")),
      );
      expect(revision.items).toEqual(f.manifest.items);
      expect(revision.baseHash).toBe(first.manifestHash);
      broken = false;
      const final = await runMechanismProductionQueue(f.path, f.output, worker);
      expect(calls).toBe(3);
      expect(final.rows[0]).toEqual(first.rows[0]);
      expect(
        final.rows[1]!.attempts.map((a) => [a.status, a.revision]),
      ).toEqual([
        ["failed", 0],
        ["passed", 1],
      ]);
      expect(final.rows[1]!.requestHash).toBe(first.rows[1]!.requestHash);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

  it("invalidates changed native artifacts and applies the same QA and completion constraints to version 2", async () => {
    const f = await blenderFixture();
    let calls = 0;
    const worker = blenderExecutor(async (item, context) => {
      calls++;
      return blenderProduct(item, context);
    });
    try {
      const first = await runMechanismProductionQueue(f.path, f.output, worker);
      const body = await sealed(f, first.rows[0]!.product!.path);
      expect(
        MechanismProductionQueueCheckpointVersionsSchema.safeParse({
          ...body,
          completion: { ...body.completion, requestHash: code },
        }).success,
      ).toBe(false);
      const { completion, ...payload } = body;
      expect(completion.status).toBe("passed");
      expect(
        BlenderProductionQueueProductSchema.safeParse({
          ...payload,
          report: {
            ...payload.report,
            authoring: { ...payload.report.authoring, routineTokens: 5 },
          },
        }).success,
      ).toBe(false);
      const qa = structuredClone(payload.report.qa);
      qa[0].evaluatedInterval.endExclusive = 3;
      expect(
        BlenderProductionQueueProductSchema.safeParse({
          ...payload,
          report: { ...payload.report, qa },
        }).success,
      ).toBe(false);
      await writeFile(join(f.output, body.artifacts[0].path), "changed");
      const report = await readMechanismProductionReports(
        f.path,
        f.output,
        worker,
      );
      expect(report.episodes.map((e) => e.validation.status)).toEqual([
        "stale",
        "verified",
      ]);
      expect(report.episodes[0]!.report.binding.outputSha256).toBeNull();
      const final = await runMechanismProductionQueue(f.path, f.output, worker);
      expect(calls).toBe(3);
      expect(final.rows[0]!.cacheFailures).toHaveLength(1);
      expect(final.rows[0]!.priorProducts).toHaveLength(1);
      expect(final.rows[1]).toEqual(first.rows[1]);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

  it("prevents reclassifying a completed legacy item as a native Blender item", async () => {
    const f = await fixture();
    try {
      const first = await runMechanismProductionQueue(
        f.path,
        f.output,
        executor(),
      );
      const changed = BlenderProductionQueueSchema.parse({
        ...f.manifest,
        schemaVersion: "mechanism-production-queue-2",
        revision: 1,
        baseHash: first.manifestHash,
        items: f.manifest.items.map((i) => ({
          ...i,
          backend: "blender-native",
        })),
      });
      await writeFile(f.path, JSON.stringify(changed));
      await expect(
        runMechanismProductionQueue(f.path, f.output, blenderExecutor()),
      ).rejects.toThrow(/preserve.*backend/);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
});
