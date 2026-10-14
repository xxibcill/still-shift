import {
  inspectMediaCapabilities,
  mediaCapabilityRows,
} from "./media-capabilities.ts";
import {
  createProductionCliExecutor,
  validateProductionBackendFlags,
} from "./production-backend.ts";
import { executeProductionCommand } from "./production-execution.ts";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import {
  mechanismProductionFailureFinding,
  readMechanismProductionReports,
  inspectMechanismProductionCapabilities,
  MechanismProductionSchemaSelectionSchema,
  mechanismProductionSchemas,
  MechanismProductionHandoffVersionsSchema,
  mechanismProductionBindingMatches,
  MechanismProductionQueueVersionsSchema,
  MechanismProductionQueueCheckpointVersionsSchema,
} from "@still-shift/animation-engine";
import {
  createMechanismCommandReceipt,
  type MechanismReceiptRow,
} from "../../../packages/animation-engine/src/mechanism/protocol.ts";
import { cuePlateFile } from "../../../packages/animation-engine/src/mechanism/cue-plate-files.ts";
import {
  writeProductionJSON,
  readProductionJSON,
  productionOwnedPath,
} from "../../../packages/animation-engine/src/mechanism/production-queue-files.ts";
import { parseNamedArguments, requireArgument } from "./named-options.ts";
import { failureDiagnostic } from "@still-shift/scene-contract";

export async function runProductionCli(
  args: string[],
  io: { stdout(text: string): void; stderr(text: string): void },
): Promise<number> {
  const owner = new CompositionNodeMemory();
  try {
    const command = args[0];
    if (
      ![
        "discover",
        "schema",
        "queue",
        "run",
        "retry",
        "report",
        "handoff",
      ].includes(command ?? "")
    )
      throw Error(
        "Production command must be discover, schema, queue, run, retry, report or handoff",
      );
    const flags = parseNamedArguments(
      args.slice(1),
      command === "queue"
        ? ["projects", "manifest", "backend", "blender-executable"]
        : command === "retry"
          ? ["manifest", "output-dir", "request", "report"]
          : command === "schema"
            ? ["kind", "output", "report"]
            : command === "discover"
              ? ["report"]
              : command === "handoff"
                ? [
                    "manifest",
                    "output-dir",
                    "episode",
                    "report",
                    "backend",
                    "blender-executable",
                  ]
                : [
                    "manifest",
                    "output-dir",
                    "report",
                    "offset",
                    "limit",
                    "backend",
                    "blender-executable",
                  ],
    );
    validateProductionBackendFlags(flags);
    const offset = Number(flags.get("offset") ?? 0),
      limit = Number(flags.get("limit") ?? 100);
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw Error("Production pagination requires offset>=0 and limit1..100");
    if (command === "schema")
      MechanismProductionSchemaSelectionSchema.parse(
        requireArgument(flags, "kind"),
      );
    if (
      ["queue", "run", "retry", "report", "handoff"].includes(command ?? "")
    ) {
      requireArgument(flags, "manifest");
      if (command !== "queue") requireArgument(flags, "output-dir");
      else requireArgument(flags, "projects");
      if (command === "handoff") requireArgument(flags, "episode");
      if (command === "retry") requireArgument(flags, "request");
    }
    const report =
      (command === "queue" ? requireArgument(flags, "manifest") : undefined) ??
      flags.get("report") ??
      flags.get("output") ??
      join(
        await mkdtemp(join(tmpdir(), "still-shift-production-report-")),
        "report.json",
      );
    if (report.length > 2048)
      throw Error("Production report path exceeds2048 characters");
    const path = resolve(report);
    if (path.length > 2048)
      throw Error("Resolved production report path exceeds2048 characters");
    let complete: unknown,
      summary: MechanismReceiptRow,
      items: MechanismReceiptRow[] = [];
    let status: "passed" | "failed" | "cancelled" = "passed";
    let executionCommand: "save" | "render" | "patch" | undefined;
    let executionNextAction: string | undefined;
    if (command === "queue" || command === "run" || command === "retry") {
      const execution = await executeProductionCommand(command, flags, owner);
      complete = execution.complete;
      summary = execution.summary;
      items = execution.items;
      status = execution.status;
      executionCommand = execution.receiptCommand;
      executionNextAction = execution.nextAction;
    } else if (command === "discover") {
      const caps = {
        ...inspectMechanismProductionCapabilities(),
        media: inspectMediaCapabilities(),
      };
      complete = caps;
      summary = {
        scope: "mechanism-production",
        queueItems: caps.queue.items,
        responseBytes: caps.response.bytes,
        responseItems: caps.response.items,
        packDisposition: caps.nativeExecutor.packDisposition,
      };
      items = [
        ...caps.schemas.map((kind) => ({ kind: "schema", name: kind })),
        ...mediaCapabilityRows(),
      ];
    } else if (command === "schema") {
      const kind = MechanismProductionSchemaSelectionSchema.parse(
        flags.get("kind"),
      );
      complete = z.toJSONSchema(mechanismProductionSchemas[kind], {
        unrepresentable: "any",
      });
      summary = { scope: "mechanism-production", kind };
    } else {
      const executor = await createProductionCliExecutor(flags, owner, true);
      const bundle = await readMechanismProductionReports(
        requireArgument(flags, "manifest"),
        requireArgument(flags, "output-dir"),
        executor,
        { nodeMemory: owner },
      );
      if (command === "handoff") {
        const episode = bundle.episodes.find(
          (e) => e.report.id === requireArgument(flags, "episode"),
        );
        if (
          !episode ||
          episode.validation.status !== "verified" ||
          !episode.product
        )
          throw Error(
            "Handoff requires a selected episode with current verified artifacts; inspect production report exceptions and resume the queue.",
          );
        const root = await realpath(
          resolve(requireArgument(flags, "output-dir")),
        );
        const product = await readProductionJSON(
          await productionOwnedPath(root, episode.product.path),
          MechanismProductionQueueCheckpointVersionsSchema,
          owner,
          4 * 1024 * 1024,
        );
        try {
          if (product.sha256 !== episode.product.sha256)
            throw Error("Product changed after the current report audit");
          const reference = product.value.artifacts.find((file) =>
            file.path.endsWith("/review/handoff.json"),
          );
          if (!reference)
            throw Error("Episode lacks its compact handoff artifact");
          const snapshot = await readProductionJSON(
            await productionOwnedPath(root, reference.path),
            MechanismProductionHandoffVersionsSchema,
            owner,
            32768,
          );
          try {
            if (snapshot.sha256 !== reference.sha256)
              throw Error(
                "Handoff snapshot bytes changed after the current report audit",
              );
            if (
              !mechanismProductionBindingMatches(
                snapshot.value.binding,
                episode.report.binding,
              )
            )
              throw Error(
                "Handoff binding differs from the current verified episode",
              );
            let resume = snapshot.value.resume;
            if (
              snapshot.value.schemaVersion === "mechanism-production-handoff-2"
            ) {
              const manifestPath = resolve(requireArgument(flags, "manifest"));
              const current = await readProductionJSON(
                manifestPath,
                MechanismProductionQueueVersionsSchema,
                owner,
                1024 * 1024,
              );
              try {
                if (current.sha256 !== bundle.source.manifestFileSha256)
                  throw Error(
                    "Manifest changed after the current handoff audit",
                  );
                const item = current.value.items.find(
                  (item) => item.id === episode.report.id,
                );
                if (!item || !("backend" in item))
                  throw Error(
                    "Native handoff requires the current native episode source",
                  );
                resume = {
                  manifestPath,
                  outputDirectory: root,
                  familyPath: resolve(dirname(manifestPath), item.familyPath),
                  cuePath: resolve(dirname(manifestPath), item.cuePath),
                  ...(item.qaPath
                    ? { qaPath: resolve(dirname(manifestPath), item.qaPath) }
                    : {}),
                };
              } finally {
                current.release();
              }
            }
            complete = MechanismProductionHandoffVersionsSchema.parse({
              ...snapshot.value,
              sourceStatus: "current-verified",
              resume,
              qa: episode.disposition.statuses,
              reviewedReady: episode.disposition.reviewedReady,
            });
            summary = {
              scope: "mechanism-production",
              episode: episode.report.id,
              sourceStatus: "current-verified",
              reviewedReady: episode.disposition.reviewedReady,
              images: snapshot.value.summary.images,
              cropExceptions: snapshot.value.summary.cropExceptions,
            };
            items = Object.entries(snapshot.value.assets).flatMap(
              ([kind, file]) =>
                file
                  ? [
                      {
                        kind,
                        path: file.path,
                        sha256: file.sha256,
                        bytes: file.bytes,
                      },
                    ]
                  : [],
            );
          } finally {
            snapshot.release();
          }
        } finally {
          product.release();
        }
      } else {
        complete = bundle;
        const c = bundle.cohort;
        summary = {
          scope: "mechanism-production",
          selected: c.selected,
          attempted: c.attempted,
          reviewedReady: c.reviewedReady,
          validationExceptions: bundle.episodes.filter(
            (e) => e.validation.status === "stale",
          ).length,
          percentileMethod: c.percentileMethod,
          pilotAdmission: "not-established",
        };
        items = [
          {
            kind: "cohort",
            category: "first-pass-technical",
            ...c.firstPassTechnical,
          },
          {
            kind: "cohort",
            category: "failures",
            failedAttempts: c.failures.failedAttempts,
            repeatedFailureEpisodes: c.failures.repeatedFailureEpisodes,
            cancelled: c.failures.cancelled,
            interrupted: c.failures.interrupted,
          },
          {
            kind: "cohort",
            category: "failure-origins",
            ...c.failures.origins,
          },
          { kind: "cohort", category: "authoring", ...c.authoring },
          ...Object.entries(c.durations).map(([category, values]) => ({
            kind: "cohort",
            category,
            ...values,
          })),
          ...Object.entries(c.reviewCounts).map(([dimension, counts]) => ({
            kind: "cohort",
            category: "reviews",
            dimension,
            ...counts,
          })),
          ...bundle.episodes.map((e) => ({
            kind: "episode",
            id: e.report.id,
            question: e.report.question,
            family: e.report.family,
            queueStatus: e.queueStatus,
            validation: e.validation.status,
            reviewedReady: e.disposition.reviewedReady,
            attempts: e.report.attempts.length,
            failedAttempts: e.report.attempts.filter(
              (a) => a.status === "failed",
            ).length,
            setupSeconds: e.report.durations.setupSeconds,
            routineSeconds: e.report.durations.routineSeconds,
            renderSeconds: e.report.durations.renderSeconds,
            qualityEvidencePath: e.qualityEvidence?.path ?? null,
            qualityEvidenceSha256: e.qualityEvidence?.sha256 ?? null,
            ...e.disposition.statuses,
          })),
        ];
      }
    }
    if (command !== "queue")
      await writeProductionJSON(
        path,
        complete,
        owner,
        command === "handoff" ? 32768 : 8 * 1024 * 1024,
        true,
      );
    const retained = await cuePlateFile(path, owner);
    const receipt = await createMechanismCommandReceipt(
      {
        command:
          executionCommand ??
          (command === "report" || command === "handoff"
            ? "summary"
            : command === "schema"
              ? "schema"
              : "discover"),
        status,
        summary,
        items,
        nextAction:
          executionNextAction ??
          (command === "report"
            ? "Inspect validation exceptions and unreviewed dimensions in the complete report. Resume the queue or review this exact artifact; pilot admission stays separate."
            : "Use the published production schemas and report command."),
      },
      {
        offset,
        limit,
        retainedFullReport: {
          kind: "full-report",
          path,
          sha256: retained.sha256,
        },
      },
    );
    io.stdout(JSON.stringify(receipt) + "\n");
    return status === "cancelled" ? 130 : status === "failed" ? 1 : 0;
  } catch (error) {
    const diagnostic = failureDiagnostic(error);
    const finding = mechanismProductionFailureFinding(error);
    io.stderr(
      JSON.stringify({
        schemaVersion: "mechanism-production-command-failure-1",
        status: "failed",
        diagnostic,
        ...(finding ? { finding } : {}),
      }) + "\n",
    );
    return 2;
  } finally {
    owner.dispose();
  }
}
