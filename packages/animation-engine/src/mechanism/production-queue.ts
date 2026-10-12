import { mkdir, realpath, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import {
  acquireArtifactLock,
  type ArtifactLockOptions,
} from "@still-shift/execution-runtime/locks";
import { compositionNodeJsonSize } from "../../../execution-runtime/src/composition-node-json.ts";
import {
  MechanismProductionQueueSchema,
  MechanismProductionQueueStateSchema,
  MechanismProductionQueueProductSchema,
  MechanismProductionQueueCheckpointSchema,
  MECHANISM_PRODUCTION_QUEUE_LIMITS as LIMIT,
  type MechanismProductionQueue,
  type MechanismProductionQueueItem,
  type MechanismProductionQueueState,
  type MechanismProductionQueueRow,
  type MechanismProductionQueueProduct,
  type MechanismProductionAttempt,
} from "./production-queue-contract.ts";
import {
  productionFailure,
  readProductionJSON,
  writeProductionJSON,
  productionFile,
  verifyProductionArtifacts,
} from "./production-queue-files.ts";
import { cuePlateFile } from "./cue-plate-files.ts";
import { freezeMechanismPack, mechanismPackHash } from "./pack-support.ts";
import { inspectMechanismProductionDisposition } from "./production-report.ts";

export class MechanismProductionTransientError extends Error {}
export type MechanismProductionExecutionContext = {
  manifestDirectory: string;
  outputRoot: string;
  attemptDirectory: string;
  requestHash: string;
  nodeMemory: CompositionNodeMemory;
  signal?: AbortSignal | undefined;
  progress(stage: string): Promise<void>;
};
export interface MechanismProductionExecutor {
  readonly codeSha256: string;
  readonly profileSha256: string;
  execute(
    item: MechanismProductionQueueItem,
    context: MechanismProductionExecutionContext,
  ): Promise<MechanismProductionQueueProduct>;
  verify(
    item: MechanismProductionQueueItem,
    product: MechanismProductionQueueProduct,
    context: MechanismProductionExecutionContext,
  ): Promise<void>;
}
export interface MechanismProductionQueueOptions extends ArtifactLockOptions {
  signal?: AbortSignal | undefined;
  nodeMemory?: CompositionNodeMemory;
}
const now = () => new Date().toISOString();
const identity = (item: MechanismProductionQueueItem) =>
  mechanismPackHash({
    id: item.id,
    question: item.question,
    family: item.family,
    designVariant: item.designVariant,
  });
const request = (
  item: MechanismProductionQueueItem,
  queue: MechanismProductionQueue,
) =>
  mechanismPackHash({
    item,
    codeSha256: queue.codeSha256,
    profileSha256: queue.profileSha256,
  });
const diagnostic = (error: unknown) => {
  try {
    return String(error).slice(0, 2048);
  } catch {
    return "Unprintable production failure";
  }
};
const missing = (error: unknown) =>
  (error as NodeJS.ErrnoException)?.code === "ENOENT";
function newRow(
  item: MechanismProductionQueueItem,
  queue: MechanismProductionQueue,
): MechanismProductionQueueRow {
  return {
    id: item.id,
    identityHash: identity(item),
    requestHash: request(item, queue),
    status: "pending",
    attempts: [],
    product: null,
    priorProducts: [],
    cacheFailures: [],
  };
}
function reconcile(
  queue: MechanismProductionQueue,
  hash: string,
  prior?: MechanismProductionQueueState,
): MechanismProductionQueueState {
  if (!prior)
    return {
      schemaVersion: "mechanism-production-queue-state-1",
      id: queue.id,
      revision: queue.revision,
      manifestHash: hash,
      codeSha256: queue.codeSha256,
      profileSha256: queue.profileSha256,
      updatedUtc: now(),
      rows: queue.items.map((i) => newRow(i, queue)),
    };
  if (prior.id !== queue.id)
    productionFailure(
      "production-queue-id",
      "Output directory belongs to a different queue",
      "id",
    );
  if (prior.manifestHash === hash) {
    if (
      prior.revision !== queue.revision ||
      prior.codeSha256 !== queue.codeSha256 ||
      prior.profileSha256 !== queue.profileSha256 ||
      prior.rows.length !== queue.items.length ||
      queue.items.some((item) => {
        const row = prior.rows.find((r) => r.id === item.id);
        return (
          !row ||
          row.identityHash !== identity(item) ||
          row.requestHash !== request(item, queue)
        );
      })
    )
      productionFailure(
        "production-journal-binding",
        "Stored journal differs from its queued manifest",
        "queue-state.json",
      );
    return prior;
  }
  if (
    queue.revision !== prior.revision + 1 ||
    queue.baseHash !== prior.manifestHash
  )
    productionFailure(
      "production-stale-revision",
      "Queue changed without its exact previous revision/hash",
      "revision/baseHash",
    );
  if (
    prior.rows.length !== queue.items.length ||
    queue.items.some((i) => !prior.rows.some((r) => r.id === i.id))
  )
    productionFailure(
      "production-cohort-change",
      "Queue revisions must preserve selected episode IDs",
      "items",
    );
  const rows = queue.items.map((item) => {
    const row = prior.rows.find((r) => r.id === item.id)!;
    if (row.identityHash !== identity(item))
      productionFailure(
        "production-question-change",
        "Queue revision must preserve its explanation, family and design variant",
        item.id,
      );
    const next = request(item, queue);
    if (row.requestHash === next) return row;
    const unfinished = row.attempts.at(-1);
    if (unfinished?.status === "running") {
      unfinished.status = "interrupted";
      unfinished.endedUtc = now();
      unfinished.seconds = null;
      unfinished.retryable = true;
      unfinished.diagnostic =
        "Previous owner stopped before the input revision changed";
    }
    if (row.priorProducts.length >= LIMIT.revisions)
      productionFailure(
        "production-revision-budget",
        "Item revision history budget is exhausted",
        item.id,
      );
    return {
      ...row,
      requestHash: next,
      status: "pending" as const,
      product: null,
      priorProducts: row.product
        ? [...row.priorProducts, row.product]
        : row.priorProducts,
    };
  });
  return {
    ...prior,
    revision: queue.revision,
    manifestHash: hash,
    codeSha256: queue.codeSha256,
    profileSha256: queue.profileSha256,
    rows,
    updatedUtc: now(),
  };
}
function assertProduct(
  queue: MechanismProductionQueue,
  item: MechanismProductionQueueItem,
  row: MechanismProductionQueueRow,
  value: unknown,
): MechanismProductionQueueProduct {
  const product = MechanismProductionQueueProductSchema.parse(value),
    report = product.report;
  if (
    product.requestHash !== row.requestHash ||
    report.binding.inputSha256 !== row.requestHash ||
    report.id !== item.id ||
    report.question !== item.question ||
    report.family !== item.family ||
    report.designVariant !== item.designVariant ||
    report.binding.codeSha256 !== queue.codeSha256 ||
    report.binding.profileSha256 !== queue.profileSha256 ||
    report.clock.outputFrames !== item.clock.outputFrames ||
    report.clock.sourceSamples !== item.clock.sourceSamples
  )
    productionFailure(
      "production-product-binding",
      "Worker product differs from its queue request",
      item.id,
    );
  if (
    inspectMechanismProductionDisposition(report).statuses.technical !==
    "passed"
  )
    productionFailure(
      "production-technical-incomplete",
      "Worker must complete current technical checks before publication",
      item.id,
    );
  return freezeMechanismPack(product);
}
function reportAttempts(attempts: MechanismProductionAttempt[]) {
  return attempts.map((a) => ({
    number: a.number,
    inputSha256: a.requestHash,
    status: a.status,
    stage: a.stage,
    seconds: a.seconds,
    diagnostic: a.diagnostic,
  }));
}
export async function runMechanismProductionQueue(
  manifestPath: string,
  outputDirectory: string,
  executor: MechanismProductionExecutor,
  options: MechanismProductionQueueOptions = {},
): Promise<MechanismProductionQueueState> {
  const owner = new CompositionNodeMemory(options.nodeMemory);
  let unlock: (() => Promise<void>) | undefined;
  let manifest:
    | Awaited<ReturnType<typeof readProductionJSON<MechanismProductionQueue>>>
    | undefined;
  let stored:
    | Awaited<
        ReturnType<typeof readProductionJSON<MechanismProductionQueueState>>
      >
    | undefined;
  try {
    options.signal?.throwIfAborted();
    await mkdir(outputDirectory, { recursive: true });
    const root = await realpath(outputDirectory),
      statePath = join(root, "queue-state.json");
    unlock = await acquireArtifactLock(
      join(root, ".production.lock"),
      root,
      options,
    );
    manifest = await readProductionJSON(
      manifestPath,
      MechanismProductionQueueSchema,
      owner,
      LIMIT.manifestBytes,
      options.signal,
    );
    const queue = freezeMechanismPack(manifest.value);
    if (
      queue.codeSha256 !== executor.codeSha256 ||
      queue.profileSha256 !== executor.profileSha256
    )
      productionFailure(
        "production-executor-identity",
        "Executor code/profile differs from the queued identity",
        "codeSha256/profileSha256",
      );
    const stateCapacity = owner.reserve(LIMIT.stateCapacityBytes);
    let transferredResult = false;
    try {
      try {
        stored = await readProductionJSON(
          statePath,
          MechanismProductionQueueStateSchema,
          owner,
          LIMIT.journalBytes,
        );
      } catch (error) {
        if (!missing(error)) throw error;
      }
      if (!stored) {
        if (queue.revision !== 0)
          productionFailure(
            "production-missing-history",
            "A revised queue requires its prior journal",
            "revision/baseHash",
          );
        const existing = await readdir(root);
        if (existing.includes("items") || existing.includes("products"))
          productionFailure(
            "production-orphan-history",
            "Item/product history exists without its queue journal",
            "queue-state.json",
          );
      }
      const state = reconcile(queue, mechanismPackHash(queue), stored?.value);
      stored?.release();
      stored = undefined;
      const save = async () => {
        state.updatedUtc = now();
        MechanismProductionQueueStateSchema.parse(state);
        await writeProductionJSON(statePath, state, owner, LIMIT.journalBytes);
      };
      const contextFor = (
        row: MechanismProductionQueueRow,
        attempt: MechanismProductionAttempt,
        memory = owner,
      ): MechanismProductionExecutionContext => ({
        manifestDirectory: dirname(resolve(manifestPath)),
        outputRoot: root,
        attemptDirectory: join(root, "items", row.id, String(attempt.number)),
        requestHash: row.requestHash,
        nodeMemory: memory,
        signal: options.signal,
        progress: async (stage) => {
          if (!stage || stage.length > 128)
            productionFailure(
              "production-stage",
              "Invalid execution phase",
              row.id,
            );
          if (attempt.status !== "running") return;
          attempt.stage = stage;
          await save();
        },
      });
      const validateInputs = async (
        item: MechanismProductionQueueItem,
        context: MechanismProductionExecutionContext,
      ) => {
        for (const input of item.inputs) {
          const actual = await cuePlateFile(
            resolve(context.manifestDirectory, input.path),
            owner,
            { signal: options.signal, sha256: input.sha256 },
          );
          if (actual.bytes !== input.bytes)
            productionFailure(
              "production-dependency-size",
              "Dependency size changed",
              input.path,
            );
        }
      };
      const productPathFor = (
        row: MechanismProductionQueueRow,
        attempt: MechanismProductionAttempt,
      ) =>
        join(
          "products",
          row.id +
            "-" +
            attempt.requestHash.slice(7, 23) +
            "-" +
            attempt.number +
            ".json",
        );
      const readCheckpoint = async (
        item: MechanismProductionQueueItem,
        row: MechanismProductionQueueRow,
        attempt: MechanismProductionAttempt,
        path: string,
      ) => {
        const loaded = await readProductionJSON(
          join(root, path),
          MechanismProductionQueueCheckpointSchema,
          owner,
          LIMIT.productBytes,
          options.signal,
        );
        const verificationOwner = new CompositionNodeMemory(owner);
        try {
          const { completion, ...payload } = loaded.value;
          const product = assertProduct(queue, item, row, payload);
          if (
            completion.number !== attempt.number ||
            completion.startedUtc !== attempt.startedUtc ||
            completion.revision !== attempt.revision
          )
            productionFailure(
              "production-completion-binding",
              "Completion differs from its persisted attempt",
              item.id,
            );
          const context = contextFor(row, attempt, verificationOwner);
          await validateInputs(item, context);
          await verifyProductionArtifacts(root, product, owner, options.signal);
          await executor.verify(item, product, context);
          await validateInputs(item, context);
          return { completion, sha256: loaded.sha256 };
        } finally {
          verificationOwner.dispose();
          loaded.release();
        }
      };
      for (const row of state.rows) {
        if (row.status === "running") {
          const attempt = row.attempts.at(-1)!,
            item = queue.items.find((i) => i.id === row.id)!;
          const productPath = productPathFor(row, attempt);
          let recovered = false;
          try {
            const sealed = await readCheckpoint(
              item,
              row,
              attempt,
              productPath,
            );
            Object.assign(attempt, sealed.completion);
            row.product = await productionFile(root, productPath, owner);
            row.status = "passed";
            recovered = true;
          } catch (error) {
            if (!missing(error))
              attempt.diagnostic =
                "Unusable interrupted completion: " +
                diagnostic(error).slice(0, 1900);
          }
          if (!recovered) {
            attempt.status = "interrupted";
            attempt.endedUtc = now();
            attempt.seconds = null;
            attempt.retryable = true;
            attempt.diagnostic ??=
              "Previous owner stopped before a sealed completion checkpoint";
            row.status = "pending";
          }
        }
      }
      await save();
      for (const item of queue.items) {
        const row = state.rows.find((r) => r.id === item.id)!;
        if (options.signal?.aborted) break;
        if (row.status === "passed" && row.product) {
          try {
            const actualSeal = await productionFile(
              root,
              row.product.path,
              owner,
            );
            if (
              actualSeal.bytes !== row.product.bytes ||
              actualSeal.sha256 !== row.product.sha256
            )
              productionFailure(
                "production-product-hash",
                "Sealed product bytes changed",
                row.product.path,
              );
            const sealed = await readCheckpoint(
              item,
              row,
              row.attempts.at(-1)!,
              row.product.path,
            );
            if (sealed.sha256 !== row.product.sha256)
              productionFailure(
                "production-product-hash",
                "Sealed product changed",
                row.product.path,
              );
            continue;
          } catch (error) {
            if (options.signal?.aborted) break;
            if (
              row.priorProducts.length >= LIMIT.revisions ||
              row.cacheFailures.length >= LIMIT.revisions
            )
              productionFailure(
                "production-history-budget",
                "Cache failure history budget is exhausted",
                item.id,
              );
            row.cacheFailures.push({
              requestHash: row.requestHash,
              atUtc: now(),
              diagnostic: diagnostic(error),
            });
            row.priorProducts.push(row.product);
            row.product = null;
            row.status = "pending";
            await save();
          }
        }
        if (row.status === "failed" && !row.attempts.at(-1)?.retryable)
          continue;
        const used = row.attempts.filter(
          (a) =>
            a.revision === queue.revision && a.requestHash === row.requestHash,
        ).length;
        for (let retry = used; retry < queue.maximumAttempts; retry++) {
          if (
            options.signal?.aborted ||
            row.attempts.length >= LIMIT.attemptsPerItem
          )
            break;
          const attempt: MechanismProductionAttempt = {
            number: row.attempts.length + 1,
            revision: queue.revision,
            requestHash: row.requestHash,
            status: "running",
            stage: "dependency-admission",
            startedUtc: now(),
            endedUtc: null,
            seconds: null,
            diagnostic: null,
            retryable: false,
          };
          row.attempts.push(attempt);
          row.status = "running";
          await save();
          const executionOwner = new CompositionNodeMemory(owner);
          const context = contextFor(row, attempt, executionOwner),
            began = performance.now();
          let again = false;
          try {
            await mkdir(context.attemptDirectory, { recursive: true });
            await validateInputs(item, context);
            options.signal?.throwIfAborted();
            attempt.stage = "execute";
            await save();
            const raw = await executor.execute(item, context);
            compositionNodeJsonSize(
              raw,
              0,
              "",
              Math.min(owner.availableBytes, LIMIT.productBytes * 3),
            );
            const product = assertProduct(queue, item, row, raw);
            await verifyProductionArtifacts(
              root,
              product,
              owner,
              options.signal,
            );
            await executor.verify(item, product, context);
            await validateInputs(item, context);
            options.signal?.throwIfAborted();
            attempt.status = "passed";
            attempt.endedUtc = now();
            attempt.seconds = (performance.now() - began) / 1000;

            const productPath = productPathFor(row, attempt);
            const checkpoint = MechanismProductionQueueCheckpointSchema.parse({
              ...product,
              report: {
                ...product.report,
                attempts: reportAttempts(row.attempts),
              },
              completion: { ...attempt },
            });
            await writeProductionJSON(
              join(root, productPath),
              checkpoint,
              owner,
              LIMIT.productBytes,
              true,
            );
            row.product = await productionFile(root, productPath, owner);
            row.status = "passed";
          } catch (error) {
            attempt.status = options.signal?.aborted ? "cancelled" : "failed";
            attempt.endedUtc = now();
            attempt.seconds = (performance.now() - began) / 1000;
            attempt.diagnostic = diagnostic(error);
            row.status = attempt.status;
            again =
              error instanceof MechanismProductionTransientError &&
              !options.signal?.aborted;
            attempt.retryable = again;
          } finally {
            executionOwner.dispose();
          }
          await save();
          if (row.status === "passed" || !again) break;
        }
        if (row.status === "pending") {
          row.status = "failed";
          await save();
        }
      }
      const result = MechanismProductionQueueStateSchema.parse(state);
      if (options.nodeMemory) {
        manifest.release();
        manifest = undefined;
        owner.transfer();
        transferredResult = true;
      }
      return result;
    } finally {
      if (!transferredResult) stateCapacity.release();
    }
  } finally {
    stored?.release();
    manifest?.release();
    try {
      await unlock?.();
    } finally {
      owner.dispose();
    }
  }
}
export * from "./production-queue-contract.ts";
