import { failureDiagnostic } from "@still-shift/scene-contract";
import type { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import {
  createMechanismProductionNativeExecutor,
  createMechanismProductionQueueFile,
  runMechanismProductionQueue,
  retryMechanismProductionQueue,
} from "@still-shift/animation-engine";
import { requireArgument } from "./named-options.ts";
import type { MechanismReceiptRow } from "../../../packages/animation-engine/src/mechanism/protocol.ts";

/** Own process cancellation only while the native queue is active. */
async function runQueue(
  manifest: string,
  output: string,
  owner: CompositionNodeMemory,
) {
  const controller = new AbortController();
  const interrupt = () =>
    controller.abort(new Error("Production queue interrupted by SIGINT"));
  const terminate = () =>
    controller.abort(new Error("Production queue interrupted by SIGTERM"));
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  try {
    const executor = await createMechanismProductionNativeExecutor();
    const state = await runMechanismProductionQueue(
      manifest,
      output,
      executor,
      { nodeMemory: owner, signal: controller.signal },
    );
    return { state, cancelled: controller.signal.aborted, diagnostic: null };
  } catch (error) {
    if (!controller.signal.aborted) throw error;
    return {
      state: null,
      cancelled: true,
      diagnostic: failureDiagnostic(error),
    };
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}
export async function executeProductionCommand(
  command: "queue" | "run" | "retry",
  flags: Map<string, string>,
  owner: CompositionNodeMemory,
) {
  if (command === "retry") {
    const complete = await retryMechanismProductionQueue(
      requireArgument(flags, "manifest"),
      requireArgument(flags, "output-dir"),
      requireArgument(flags, "request"),
      { nodeMemory: owner },
    );
    return {
      complete,
      status: "passed" as const,
      receiptCommand: "patch" as const,
      summary: {
        scope: "mechanism-production",
        queueId: complete.queueId,
        revision: complete.revision,
        retries: complete.episodes.length,
        execution: "not-started",
        pilotAdmission: "not-established",
      },
      items: complete.episodes.map((id) => ({
        kind: "retry-authorized",
        id,
      })) as MechanismReceiptRow[],
      nextAction:
        "Run the exact revised manifest. Prior attempts/products/reviews remain retained; unchanged completed neighbors are verified on resume.",
    };
  }
  if (command === "queue") {
    const complete = await createMechanismProductionQueueFile(
      requireArgument(flags, "projects"),
      requireArgument(flags, "manifest"),
      await createMechanismProductionNativeExecutor(),
      { nodeMemory: owner },
    );
    return {
      complete,
      status: "passed" as const,
      receiptCommand: "save" as const,
      summary: {
        scope: "mechanism-production",
        queueId: complete.queueId,
        selected: complete.selected,
        execution: "not-started",
        pilotAdmission: "not-established",
      },
      items: [
        {
          kind: "queue-manifest",
          path: complete.manifest.path,
          sha256: complete.manifest.sha256,
          bytes: complete.manifest.bytes,
        },
      ] as MechanismReceiptRow[],
      nextAction:
        "Run this pinned manifest with production run; technical execution and artifact-specific reviews remain separate.",
    };
  }
  const {
    state: complete,
    cancelled,
    diagnostic,
  } = await runQueue(
    requireArgument(flags, "manifest"),
    requireArgument(flags, "output-dir"),
    owner,
  );
  if (complete === null)
    return {
      complete: {
        schemaVersion: "mechanism-production-run-interruption-1",
        manifestPath: requireArgument(flags, "manifest"),
        outputDirectory: requireArgument(flags, "output-dir"),
        diagnostic,
        qualification:
          "No new queue result was returned; any existing journal remains authoritative.",
      },
      status: "cancelled" as const,
      receiptCommand: "render" as const,
      summary: {
        scope: "mechanism-production",
        queueResult: "unavailable",
        pilotAdmission: "not-established",
      },
      items: [] as MechanismReceiptRow[],
      nextAction:
        "Inspect the retained journal and resume the pinned manifest. No missing terminal row state is inferred.",
    };
  const counts = Object.fromEntries(
    ["passed", "failed", "cancelled", "pending", "running"].map((status) => [
      status,
      complete.rows.filter((row) => row.status === status).length,
    ]),
  );
  const status =
    counts.cancelled || (cancelled && counts.pending)
      ? ("cancelled" as const)
      : counts.passed === complete.rows.length
        ? ("passed" as const)
        : ("failed" as const);
  return {
    complete,
    status,
    receiptCommand: "render" as const,
    summary: {
      scope: "mechanism-production",
      queueId: complete.id,
      revision: complete.revision,
      selected: complete.rows.length,
      ...counts,
      pilotAdmission: "not-established",
    },
    items: complete.rows.map((row) => ({
      kind: "episode",
      id: row.id,
      status: row.status,
      attempts: row.attempts.length,
      latestStage: row.attempts.at(-1)?.stage ?? null,
      diagnostic: row.attempts.at(-1)?.diagnostic ?? null,
      productPath: row.product?.path ?? null,
      productSha256: row.product?.sha256 ?? null,
    })) as MechanismReceiptRow[],
    nextAction:
      "Inspect retained attempts and current production report. Unchanged completed products are verified on resume; reviews and pilot admission remain separate.",
  };
}
