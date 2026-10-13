import { z } from "zod";
import { realpath, mkdir } from "node:fs/promises";
import { dirname, join, resolve, relative } from "node:path";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import { acquireArtifactLock } from "@still-shift/execution-runtime/locks";
import { MechanismHashSchema } from "@still-shift/scene-contract";
import { MECHANISM_RESPONSE_LIMITS } from "./protocol.ts";
import {
  MechanismProductionQueueVersionsSchema as MechanismProductionQueueSchema,
  MechanismProductionQueueStateSchema,
  MechanismProductionQueueItemSchema,
  MECHANISM_PRODUCTION_QUEUE_LIMITS as LIMIT,
  type MechanismProductionQueueAny as MechanismProductionQueue,
} from "./production-queue-contract.ts";
import { assertProductionJournal } from "./production-queue-validation.ts";
import { mechanismPackHash } from "./pack-support.ts";
import {
  readProductionJSON,
  writeProductionJSON,
  productionFailure,
  productionOwnedPath,
  productionFile,
} from "./production-queue-files.ts";
import { cuePlateFile } from "./cue-plate-files.ts";
import type { MechanismProductionQueueOptions } from "./production-queue.ts";
export const MechanismProductionRetrySchema = z
  .object({
    schemaVersion: z.literal("mechanism-production-retry-1"),
    baseRevision: z
      .number()
      .int()
      .min(0)
      .max(LIMIT.revisions - 2),
    baseHash: MechanismHashSchema,
    episodes: z
      .array(MechanismProductionQueueItemSchema.shape.id)
      .min(1)
      .max(LIMIT.retryItems),
  })
  .strict()
  .superRefine((request, context) => {
    if (new Set(request.episodes).size !== request.episodes.length)
      context.addIssue({
        code: "custom",
        message: "Retry requires distinct episode IDs",
      });
  });
async function archiveManifest(
  queue: MechanismProductionQueue,
  root: string,
  owner: CompositionNodeMemory,
) {
  await mkdir(join(root, "manifest-history"), { recursive: true });
  const directory = await productionOwnedPath(root, "manifest-history"),
    hash = mechanismPackHash(queue),
    path = join(directory, hash.slice(7) + ".json");
  try {
    await writeProductionJSON(path, queue, owner, LIMIT.manifestBytes, true);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "EEXIST") throw error;
    const existing = await readProductionJSON(
      await productionOwnedPath(root, relative(root, path)),
      MechanismProductionQueueSchema,
      owner,
      LIMIT.manifestBytes,
    );
    try {
      if (mechanismPackHash(existing.value) !== hash)
        productionFailure(
          "production-manifest-history",
          "Existing manifest history has a different binding",
          path,
        );
    } finally {
      existing.release();
    }
  }
  return productionFile(root, relative(root, path), owner);
}
/** Retry authorizes only selected terminal items, through a fresh exact-CAS revision. */
export async function retryMechanismProductionQueue(
  manifestPath: string,
  outputDirectory: string,
  requestPath: string,
  options: MechanismProductionQueueOptions = {},
) {
  const owner = new CompositionNodeMemory(options.nodeMemory),
    loaded: { release(): void }[] = [];
  let unlock: (() => Promise<void>) | undefined;
  let unlockManifest: (() => Promise<void>) | undefined;
  try {
    options.signal?.throwIfAborted();
    const root = await realpath(outputDirectory),
      manifest = resolve(manifestPath);
    unlock = await acquireArtifactLock(
      join(root, ".production.lock"),
      root,
      options,
    );
    unlockManifest = await acquireArtifactLock(
      manifest + ".mutation.lock",
      dirname(manifest),
      options,
    );
    options.signal?.throwIfAborted();
    const request = await readProductionJSON(
      requestPath,
      MechanismProductionRetrySchema,
      owner,
      MECHANISM_RESPONSE_LIMITS.patchBytes,
      options.signal,
    );
    loaded.push(request);
    const current = await readProductionJSON(
      manifest,
      MechanismProductionQueueSchema,
      owner,
      LIMIT.manifestBytes,
      options.signal,
    );
    loaded.push(current);
    const queue = current.value,
      hash = mechanismPackHash(queue);
    if (
      request.value.baseRevision !== queue.revision ||
      request.value.baseHash !== hash
    )
      productionFailure(
        "production-stale-retry",
        "Retry requires the exact current manifest revision/hash",
        requestPath,
      );
    const journal = await readProductionJSON(
      join(root, "queue-state.json"),
      MechanismProductionQueueStateSchema,
      owner,
      LIMIT.journalBytes,
      options.signal,
    );
    loaded.push(journal);
    assertProductionJournal(queue, hash, journal.value);
    if (journal.value.rows.some((row) => row.status === "running"))
      productionFailure(
        "production-running-retry",
        "Resume the current queue before retrying an interrupted row",
        manifest,
      );
    for (const id of request.value.episodes) {
      const row = journal.value.rows.find((row) => row.id === id),
        item = queue.items.find((item) => item.id === id);
      if (
        !row ||
        !item ||
        !["failed", "cancelled"].includes(row.status) ||
        !row.attempts.length ||
        row.attempts.length >= LIMIT.attemptsPerItem
      )
        productionFailure(
          "production-retry-target",
          "Retry requires an eligible failed/cancelled item within its retained attempt budget",
          id,
        );
      for (const input of item.inputs) {
        const actual = await cuePlateFile(
          resolve(dirname(manifest), input.path),
          owner,
          { signal: options.signal, sha256: input.sha256 },
        );
        if (actual.bytes !== input.bytes)
          productionFailure(
            "production-unrepaired-input",
            "Repair the dependency to its pinned bytes or revise its declared input",
            input.path,
          );
      }
    }
    const next = MechanismProductionQueueSchema.parse({
      ...queue,
      revision: queue.revision + 1,
      baseHash: hash,
      retryFailedIds: request.value.episodes,
    });
    const previousArchive = await archiveManifest(queue, root, owner),
      nextArchive = await archiveManifest(next, root, owner);
    await cuePlateFile(manifest, owner, { sha256: current.sha256 });
    options.signal?.throwIfAborted();
    await writeProductionJSON(manifest, next, owner, LIMIT.manifestBytes);
    return {
      schemaVersion: "mechanism-production-retry-result-1" as const,
      queueId: queue.id,
      previousRevision: queue.revision,
      revision: next.revision,
      baseHash: hash,
      manifestHash: mechanismPackHash(next),
      episodes: request.value.episodes,
      archives: [previousArchive, nextArchive],
      qualification:
        "Selected retry authorization only. Attempts/products/reviews remain in the unchanged journal until run; no execution or acceptance is inferred.",
    };
  } finally {
    try {
      for (const value of loaded.reverse()) value.release();
      if (unlockManifest) await unlockManifest();
    } finally {
      try {
        if (unlock) await unlock();
      } finally {
        owner.dispose();
      }
    }
  }
}
