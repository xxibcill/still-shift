import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import {
  readMechanismProductionReports,
  createMechanismProductionNativeExecutor,
  inspectMechanismProductionCapabilities,
  MechanismProductionSchemaSelectionSchema,
  mechanismProductionSchemas,
} from "@still-shift/animation-engine";
import {
  createMechanismCommandReceipt,
  type MechanismReceiptRow,
} from "../../../packages/animation-engine/src/mechanism/protocol.ts";
import { cuePlateFile } from "../../../packages/animation-engine/src/mechanism/cue-plate-files.ts";
import { writeProductionJSON } from "../../../packages/animation-engine/src/mechanism/production-queue-files.ts";
import { parseNamedArguments, requireArgument } from "./named-options.ts";
import { failureDiagnostic } from "@still-shift/scene-contract";

export async function runProductionCli(
  args: string[],
  io: { stdout(text: string): void; stderr(text: string): void },
): Promise<number> {
  const owner = new CompositionNodeMemory();
  try {
    const command = args[0];
    if (!["discover", "schema", "report"].includes(command ?? ""))
      throw Error("Production command must be discover, schema or report");
    const flags = parseNamedArguments(
      args.slice(1),
      command === "schema"
        ? ["kind", "output", "report"]
        : command === "discover"
          ? ["report"]
          : ["manifest", "output-dir", "report", "offset", "limit"],
    );
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
    if (command === "report") {
      requireArgument(flags, "manifest");
      requireArgument(flags, "output-dir");
    }
    const report =
      flags.get("report") ??
      flags.get("output") ??
      join(
        await mkdtemp(join(tmpdir(), "still-shift-production-report-")),
        "report.json",
      );
    if (report.length > 2048)
      throw Error("Production report path exceeds2048 characters");
    const path = resolve(report);
    let complete: unknown,
      summary: MechanismReceiptRow,
      items: MechanismReceiptRow[] = [];
    if (command === "discover") {
      const caps = inspectMechanismProductionCapabilities();
      complete = caps;
      summary = {
        scope: "mechanism-production",
        queueItems: caps.queue.items,
        responseBytes: caps.response.bytes,
        responseItems: caps.response.items,
        packDisposition: caps.nativeExecutor.packDisposition,
      };
      items = caps.schemas.map((kind) => ({ kind: "schema", name: kind }));
    } else if (command === "schema") {
      const kind = MechanismProductionSchemaSelectionSchema.parse(
        flags.get("kind"),
      );
      complete = z.toJSONSchema(mechanismProductionSchemas[kind], {
        unrepresentable: "any",
      });
      summary = { scope: "mechanism-production", kind };
    } else {
      const executor = await createMechanismProductionNativeExecutor();
      const bundle = await readMechanismProductionReports(
        requireArgument(flags, "manifest"),
        requireArgument(flags, "output-dir"),
        executor,
        { nodeMemory: owner },
      );
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
        { kind: "cohort", category: "failures", ...c.failures },
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
          failedAttempts: e.report.attempts.filter((a) => a.status === "failed")
            .length,
          setupSeconds: e.report.durations.setupSeconds,
          routineSeconds: e.report.durations.routineSeconds,
          renderSeconds: e.report.durations.renderSeconds,
          ...e.disposition.statuses,
        })),
      ];
    }
    await writeProductionJSON(path, complete, owner, 8 * 1024 * 1024, true);
    const retained = await cuePlateFile(path, owner);
    const receipt = await createMechanismCommandReceipt(
      {
        command:
          command === "report"
            ? "summary"
            : command === "schema"
              ? "schema"
              : "discover",
        status: "passed",
        summary,
        items,
        nextAction:
          command === "report"
            ? "Inspect validation exceptions and unreviewed dimensions in the complete report. Resume the queue or review this exact artifact; pilot admission stays separate."
            : "Use the published production schemas and report command.",
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
    return 0;
  } catch (error) {
    const diagnostic = failureDiagnostic(error);
    io.stderr(
      JSON.stringify({
        schemaVersion: "mechanism-production-command-failure-1",
        status: "failed",
        diagnostic,
      }) + "\n",
    );
    return 2;
  } finally {
    owner.dispose();
  }
}
