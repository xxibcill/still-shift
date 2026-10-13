import { MechanismProductionRetrySchema } from "./production-retry.ts";
import { MechanismProductionProjectsSchema } from "./production-projects.ts";
import {
  MechanismProductionEvidenceSchema,
  MECHANISM_PRODUCTION_EVIDENCE_LIMITS,
} from "./production-evidence-contract.ts";
import {
  MechanismProductionHandoffSchema,
  MECHANISM_PRODUCTION_HANDOFF_LIMITS,
} from "./production-handoff.ts";
import {
  MechanismProductionQAPlanSchema,
  MechanismProductionQAProgramSchema,
  MechanismProductionQAFactsSchema,
  MECHANISM_PRODUCTION_QA_LIMITS,
} from "./production-qa-contract.ts";
import { z } from "zod";
import {
  MechanismProductionQueueSchema,
  MechanismProductionQueueStateSchema,
  MECHANISM_PRODUCTION_QUEUE_LIMITS,
} from "./production-queue-contract.ts";
import {
  MechanismProductionEpisodeReportSchema,
  MechanismProductionCohortReportSchema,
  MechanismProductionQASchema,
} from "./production-report.ts";
import {
  MechanismSemanticRegistrationSchema,
  MECHANISM_SEMANTIC_LIMITS,
} from "./production-semantic.ts";
import {
  MECHANISM_PRODUCTION_REPORT_LIMITS,
  MechanismProductionReportBundleSchema,
} from "./production-report-io.ts";
import { MECHANISM_RESPONSE_LIMITS } from "./protocol.ts";
import { freezeMechanismPack } from "./pack-support.ts";
export const mechanismProductionSchemas = {
  "production-retry": MechanismProductionRetrySchema,
  "production-projects": MechanismProductionProjectsSchema,
  "production-qa-plan": MechanismProductionQAPlanSchema,
  "production-qa-program": MechanismProductionQAProgramSchema,
  "production-qa-facts": MechanismProductionQAFactsSchema,
  "production-evidence": MechanismProductionEvidenceSchema,
  "production-handoff": MechanismProductionHandoffSchema,
  "production-report-bundle": MechanismProductionReportBundleSchema,
  "production-queue": MechanismProductionQueueSchema,
  "production-queue-state": MechanismProductionQueueStateSchema,
  "production-episode-report": MechanismProductionEpisodeReportSchema,
  "production-cohort-report": MechanismProductionCohortReportSchema,
  "production-qa": MechanismProductionQASchema,
  "semantic-registration": MechanismSemanticRegistrationSchema,
} as const;
export const MechanismProductionSchemaSelectionSchema = z.enum(
  Object.keys(mechanismProductionSchemas) as [
    keyof typeof mechanismProductionSchemas,
    ...(keyof typeof mechanismProductionSchemas)[],
  ],
);
export function inspectMechanismProductionCapabilities() {
  return freezeMechanismPack({
    schemaVersion: "mechanism-production-capabilities-1",
    commands: [
      "discover",
      "schema",
      "queue",
      "run",
      "retry",
      "report",
      "handoff",
    ],
    schemas: Object.keys(mechanismProductionSchemas),
    queue: MECHANISM_PRODUCTION_QUEUE_LIMITS,
    projects: {
      items: MECHANISM_PRODUCTION_QUEUE_LIMITS.items,
      bytes: MECHANISM_PRODUCTION_QUEUE_LIMITS.manifestBytes,
      pathBase: "projects-file-directory",
      publication: "new-immutable-manifest",
      execution: "not-started",
    },
    retry: {
      items: MECHANISM_PRODUCTION_QUEUE_LIMITS.retryItems,
      bytes: MECHANISM_RESPONSE_LIMITS.patchBytes,
      authorization: "exact-current-manifest-CAS-and-repaired-pins",
      scope: "selected-terminal-items-new-batch-within-retained-attempt-limits",
      history: "immutable-original-next-manifests-and-unchanged-journal",
    },
    execution: {
      statusExitCodes: { passed: 0, failed: 1, invalid: 2, cancelled: 130 },
      signals: ["SIGINT", "SIGTERM"],
      receiptScope:
        "queue-technical-execution-no-whole-review-or-pilot-admission",
    },
    reports: MECHANISM_PRODUCTION_REPORT_LIMITS,
    evidence: MECHANISM_PRODUCTION_EVIDENCE_LIMITS,
    handoff: MECHANISM_PRODUCTION_HANDOFF_LIMITS,
    response: MECHANISM_RESPONSE_LIMITS,
    semantics: MECHANISM_SEMANTIC_LIMITS,
    operationalQA: MECHANISM_PRODUCTION_QA_LIMITS,
    nativeExecutor: {
      families: ["tape-hook", "cable-tie", "clothespeg"],
      packDisposition: "candidate",
      profile: { backend: "webgl2", transport: "raw_rgba", workers: 1 },
      codeProfileIdentity:
        "actual-runtime-and-native-appearance-lock-toolchain-Node-FFmpeg",
      cache: "verified-native-picture-content-addressed",
      reportChecks:
        "current-dependencies-sealed-products-artifacts-original-native-replay-full-RGBA-PCM-decode",
    },
    review: {
      dimensions: [
        "technical",
        "mechanical",
        "sampled-visual",
        "continuous-motion",
        "listening",
        "factual",
      ],
      automatedAcceptanceExcluded: [
        "continuous-motion",
        "listening",
        "factual",
      ],
      pilotAdmission: "separate-frozen-question-and-extension-evidence",
      missingTokens: "null",
    },
    qualification:
      "Implemented production queue/execution/reporting subset. General asset imports and preview/export format limits remain in the existing episode/family registries; no supported-pack or pilot admission is granted here.",
  });
}
export function mechanismProductionCapabilityMarkdown() {
  const c = inspectMechanismProductionCapabilities();
  return `# Production command capabilities\n\nGenerated by the production registry. Run \`pnpm schema:generate\` to refresh.\n\n\`still-shift production discover|schema|queue|run|retry|report|handoff\` uses the same implemented limits\nas machine discovery. Report emits episode rows and a cohort summary together,\nwith complete report access.\n\n| Limit | Value |\n| --- | --- |\n| Queue items | ${c.queue.items} |\n| Pins per item | ${c.queue.inputs} |\n| Attempts per revision / total | ${c.queue.attemptsPerRevision} / ${c.queue.attemptsPerItem} |\n| Revisions | ${c.queue.revisions} |\n| Manifest / journal / product bytes | ${c.queue.manifestBytes} / ${c.queue.journalBytes} / ${c.queue.productBytes} |\n| Complete report bytes | ${c.reports.completeBytes} |\n| Compact response bytes / items | ${c.response.bytes} / ${c.response.items} |\n| Native production workers | ${c.nativeExecutor.profile.workers} |
| Evidence sampled frames / images | ${c.evidence.samples} / ${c.evidence.images} |
| Evidence manifest bytes / retained capacity | ${c.evidence.manifestBytes} / ${c.evidence.retainedCapacityBytes} |
| Phone overview pixels | ${c.evidence.phoneWidth} × ${c.evidence.phoneHeight} |
| Review PCM bytes | ${c.evidence.audioBytes} |
| Compact handoff bytes | ${c.handoff.bytes} |
| QA plan / facts bytes | ${c.operationalQA.planBytes} / ${c.operationalQA.factsBytes} |
| QA retained capacity / state-lint maximum capacity | ${c.operationalQA.retainedCapacityBytes} / ${c.operationalQA.qualityCapacityBytes} |
| State-lint layer-frames / raw warning rows | ${c.operationalQA.qualityLayerFrames} / ${c.operationalQA.warningRows} |\n| Semantic registrations / rules / samples / comparisons | ${c.semantics.registrations} / ${c.semantics.rules} / ${c.semantics.samples} / ${c.semantics.comparisons} |\n\nQueue creation consumes a strict \`production-projects\` declaration, capped at
${c.projects.items} projects and ${c.projects.bytes} bytes. Family/cue/QA paths resolve
from its file directory. It publishes one new immutable manifest and performs no
native capture. Run executes or resumes that pinned manifest through the existing
native queue, with bounded state/attempt rows and a linked complete state snapshot.
SIGINT/SIGTERM request durable cancellation. Exit codes are 0 for passed execution,
1 for terminal item failure, 2 for invalid input/command, and 130 for cancellation.
These are technical execution statuses; use report for artifact-specific QA.
Retry consumes an exact-CAS request capped at ${c.retry.items} selected terminal
items and ${c.retry.bytes} bytes. Dependency pins must already be repaired. It
archives original/next manifests and grants one new batch on the selected items;
unchanged completed neighbors keep their products. The three-attempt/revision,
96-attempt/item and 32-revision bounds remain fixed. Retry performs no execution;
run consumes its authorization, retaining original failed attempts and reviews.

The native production profile is ${c.nativeExecutor.profile.backend} with\n${c.nativeExecutor.profile.transport} transport. The three pack families remain\ncandidates. Operational QA replays original output-frame scalars and current cue timeline checks,
retains raw warnings and exact grouped peaks, and links immutable facts in reports and
handoffs. A custom QA plan is a pinned declarative dependency. State-lint admission is
2 MiB plus 4 KiB per generated layer-frame, capped by the published capacity and shared
Node allowance. Individual successful sampled rules do not grant whole mechanical
acceptance; current failures remain visible.

General imports and preview/export formats use existing episode\ndiscovery. Review declarations, missing token data and pilot admission remain\nseparate from technical completion.\n`;
}
