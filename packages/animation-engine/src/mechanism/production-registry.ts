import { BlenderProductionEvidenceSchema } from "./blender-production-review-contract.ts";
import {
  BlenderProductionRenderedVisualSchema,
  BLENDER_PRODUCTION_VISUAL_LIMITS,
} from "./blender-production-visual.ts";
import {
  BlenderCaptureJobSchema,
  BLENDER_CAPTURE_LIMITS,
} from "./blender-capture-contract.ts";
import {
  BlenderEpisodeSourceSchema,
  BlenderEpisodePlanSchema,
  BLENDER_EPISODE_LIMITS,
} from "./blender-episode-contract.ts";
import {
  BlenderProductionQAPlanSchema,
  BlenderProductionQAFactsSchema,
  BLENDER_PRODUCTION_QA_LIMITS,
} from "./blender-production-qa-contract.ts";
import { BlenderEpisodePlatesSchema } from "./blender-episode-plates.ts";
import { MECHANISM_STATIC_MOMENT_LIMITS } from "@still-shift/scene-contract";
import { MechanismProductionRetrySchema } from "./production-retry.ts";
import { MechanismProductionProjectsSchema } from "./production-projects.ts";
import {
  MechanismProductionEvidenceSchema,
  MECHANISM_PRODUCTION_EVIDENCE_LIMITS,
} from "./production-evidence-contract.ts";
import {
  MechanismProductionHandoffVersionsSchema,
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
  BlenderProductionQueueSchema,
  BlenderProductionQueueProductSchema,
  MechanismProductionQueueStateSchema,
  MECHANISM_PRODUCTION_QUEUE_LIMITS,
} from "./production-queue-contract.ts";
import {
  MechanismProductionEpisodeReportSchema,
  BlenderProductionEpisodeReportSchema,
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
  "blender-native-capture-job": BlenderCaptureJobSchema,
  "blender-episode-source": BlenderEpisodeSourceSchema,
  "blender-episode-plan": BlenderEpisodePlanSchema,
  "blender-episode-plates": BlenderEpisodePlatesSchema,
  "blender-production-rendered-visual": BlenderProductionRenderedVisualSchema,
  "blender-production-qa-plan": BlenderProductionQAPlanSchema,
  "blender-production-qa-facts": BlenderProductionQAFactsSchema,
  "blender-production-queue": BlenderProductionQueueSchema,
  "blender-production-product": BlenderProductionQueueProductSchema,
  "blender-production-episode-report": BlenderProductionEpisodeReportSchema,
  "blender-production-evidence": BlenderProductionEvidenceSchema,
  "production-retry": MechanismProductionRetrySchema,
  "production-projects": MechanismProductionProjectsSchema,
  "production-qa-plan": MechanismProductionQAPlanSchema,
  "production-qa-program": MechanismProductionQAProgramSchema,
  "production-qa-facts": MechanismProductionQAFactsSchema,
  "production-evidence": MechanismProductionEvidenceSchema,
  "production-handoff": MechanismProductionHandoffVersionsSchema,
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
    handoff: {
      ...MECHANISM_PRODUCTION_HANDOFF_LIMITS,
      versions: [
        "mechanism-production-handoff-1",
        "mechanism-production-handoff-2",
      ],
      backends: ["three-native", "blender-native"],
      audio: "unmodified-final-decoded-PCM",
    },
    response: MECHANISM_RESPONSE_LIMITS,
    semantics: MECHANISM_SEMANTIC_LIMITS,
    operationalQA: MECHANISM_PRODUCTION_QA_LIMITS,
    staticMoment: {
      limits: MECHANISM_STATIC_MOMENT_LIMITS,
      selector: "static-moment-balance",
      method: "ideal-static-single-axis-moment-balance-1",
      quantities: [
        { quantity: "required-force-newtons", unit: "N" },
        { quantity: "signed-arm-meters", unit: "meter" },
        { quantity: "balance-residual-newton-meters", unit: "N*m" },
      ],
      evidence:
        "original-native-anchors-reference-matrices-and-scene-calibration",
      resistance: "prescribed-signed-N*m-or-N*mm",
      missingMeasurement: "absent-position-or-inadmissible-balance",
      assumption: "fixed-axis-rigid-arm-prescribed-resistance-1",
    },
    backendSelection: {
      creationDefault: "three-native",
      execution: "pinned-manifest-schema-version",
      explicitFlag: "--backend",
      values: ["three-native", "blender-native"],
      blenderExecutableFlag: "--blender-executable",
      blenderExecutable: "explicit-required-host-executable-no-auto-install",
      mismatches: "reject-before-producer-construction",
      retry: "manifest-version-preserved-no-producer-execution",
    },
    nativeBlenderExecutor: {
      status: "candidate",
      manifestSchema: "mechanism-production-queue-2",
      commands: ["queue", "run", "retry", "report"],
      resourcePolicy: "embedded-only",
      source: "saved-native-collection-controls-cameras-and-material-graphs",
      receiver: "verified-sequence-native-text-and-whole-audio",
      meshDriverShaderTransfer: "not-provided",
      captureLimits: BLENDER_CAPTURE_LIMITS,
      episodeLimits: BLENDER_EPISODE_LIMITS,
      cache:
        "per-state-producer-profile-and-native-source-key-with-original-pins",
      nativeCounterEvidence:
        "sealed-original-Blender-capture-submission-receipts",
      annotations: {
        highlights:
          "bounded-temporary-per-part-materials-original-slots-restored",
        anchorKinds: ["saved-object-origin", "evaluated-part-bounds-center"],
        labels: "native-editable-text-and-same-state-captured-leaders",
        labelEdits:
          "reuse-native-states-when-queries-highlights-and-poses-match",
        sourceStates: "declared-control-range-checks-and-current-render-flags",
        physicalVisibility: "not-inferred-from-projection-or-flags",
      },
      technicalChecks:
        "canonical-input-pins-current-capture-controls-cameras-full-RGBA-PCM-decode",
      qa: {
        limits: BLENDER_PRODUCTION_QA_LIMITS,
        plan: "optional-pinned-qaPath",
        evidence: "authenticated-retained-Bpy-observations",
        methods: [
          "registered-numeric-ranges",
          "consecutive-failure-runs-and-grouped-peaks",
        ],
        surfaceContact: "not-inferred-from-AABB",
        wholeAcceptance: "separate-review",
      },
      renderedQA: {
        limits: BLENDER_PRODUCTION_VISUAL_LIMITS,
        default: "all-native-products",
        measurement: "all-output-frame-cached-preview-pixels-and-glyphs",
        badFrames: "exact-RGBA-from-bound-encoded-output",
        wholeEncodedGlyphApproval: "separate-review",
      },
      reviewEvidence: {
        schemaVersion: "mechanism-production-evidence-2",
        limits: MECHANISM_PRODUCTION_EVIDENCE_LIMITS,
        sampling: "shot-entry-mid-exit-control-callout-speech-events-and-cuts",
        crops: ["shared-caption-rectangle", "actual-active-native-projections"],
        verification:
          "current-source-fingerprint-encoded-pixel-transforms-final-PCM",
        nativeSubmissions: "none-for-review-generation-or-verification",
        missingProjection: "located-crop-exception",
        wholeAcceptance: "separate-review",
      },
      pending: ["whole-encoded-glyph-review", "whole-pilot-review"],
    },
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
| State-lint layer-frames / raw warning rows | ${c.operationalQA.qualityLayerFrames} / ${c.operationalQA.warningRows} |\n| Ideal moment models / minimum arm meters / maximum force newtons | ${c.staticMoment.limits.models} / ${c.staticMoment.limits.minimumArmMeters} / ${c.staticMoment.limits.maximumForceNewtons} |\n| Semantic registrations / rules / samples / comparisons | ${c.semantics.registrations} / ${c.semantics.rules} / ${c.semantics.samples} / ${c.semantics.comparisons} |\n\nQueue creation consumes a strict \`production-projects\` declaration, capped at
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

Queue creation defaults to \`three-native\`. Select \`--backend blender-native\`
with \`--blender-executable /absolute/host/Blender\` for native source/plan documents.
Run and report choose the backend from the pinned manifest version; an optional
\`--backend\` must agree. Blender version2 manifests require the same explicit host
executable/profile. Retry keeps either manifest version and executes no producer.
The Blender source policy is ${c.nativeBlenderExecutor.resourcePolicy}; its receiver
uses verified sequences, native editable text and whole original audio. Source/control
tracks remain in Blender. Capture limits are ${c.nativeBlenderExecutor.captureLimits.frames}
frames, ${c.nativeBlenderExecutor.captureLimits.controls} controls and
${c.nativeBlenderExecutor.captureLimits.pixels} pixels. Episode plans allow
${c.nativeBlenderExecutor.episodeLimits.shots} shots and
${c.nativeBlenderExecutor.episodeLimits.speechCues} speech cues in
${c.nativeBlenderExecutor.episodeLimits.documentBytes} bytes, at up to
${c.nativeBlenderExecutor.episodeLimits.maxFps} FPS through the receiving composition. These are candidate
technical lifecycle limits. Native annotations allow
${c.nativeBlenderExecutor.episodeLimits.callouts} labels,
${c.nativeBlenderExecutor.episodeLimits.calloutSamples} active label samples,
${c.nativeBlenderExecutor.episodeLimits.simultaneousCallouts} simultaneous labels and
${c.nativeBlenderExecutor.captureLimits.highlights} highlight colors per native job.
Labels follow saved object origins or actual evaluated part bounds centers;
projection/render flags do not approve visible surface contact. Text/placement
edits reuse matching native states. Optional native \`qaPath\` declarations pin bounded
observation selectors and registered interval programs. Native QA limits are
${c.nativeBlenderExecutor.qa.limits.planBytes} plan bytes,
${c.nativeBlenderExecutor.qa.limits.factsBytes} facts bytes,
${c.nativeBlenderExecutor.qa.limits.observationBytes} bytes per observation,
${c.nativeBlenderExecutor.qa.limits.programs} programs,
${c.nativeBlenderExecutor.qa.limits.measurements} measurements,
${c.nativeBlenderExecutor.qa.limits.comparisons} aggregate comparisons and
${c.nativeBlenderExecutor.qa.limits.warningRows} consecutive failure runs.
Actual retained Bpy observations supply numeric rules; reports bind raw findings,
grouped peaks and images to the current export. Bounds separation does not prove
surface contact/collision, and passed samples leave whole mechanical review open.
Default native rendered QA evaluates every frame with actual cached preview pixels
and measured glyphs. It allows ${c.nativeBlenderExecutor.renderedQA.limits.layerFrames}
layer-frames, ${c.nativeBlenderExecutor.renderedQA.limits.reportBytes} report bytes and
${c.nativeBlenderExecutor.renderedQA.limits.badFrames} exact encoded bad-frame PNGs.
Bad-frame image hashes are checked against the bound video on fresh replay.
Native review evidence uses version2 with up to ${c.nativeBlenderExecutor.reviewEvidence.limits.samples}
unique final-file samples and ${c.nativeBlenderExecutor.reviewEvidence.limits.images} images.
Admission checks the prospective sample/image budgets before capture or export.
Shot entry/mid/exit, source/control keys, speech/callout events and cut boundaries
retain separate origins when names or frames coincide. Each shot receives an exact
${c.nativeBlenderExecutor.reviewEvidence.limits.phoneWidth}×${c.nativeBlenderExecutor.reviewEvidence.limits.phoneHeight}
phone transform and shared-caption crop. Active retained native projections supply
anchor crops; missing projections produce located exceptions. Review generation and
fresh pixel verification do not submit new native renders. Source identity ignores
receiving-machine file locations while retaining authored content and dependency pins.
The handoff command supports both production backends. Native version-2 packets
retain bounded source/compilation metadata, current artifact references and exact
final decoded PCM. Receiving refreshes resume paths from the current manifest;
generation snapshots preserve unfinished review states. All-frame encoded-glyph
review and whole pilot acceptance remain pending.

The three-family native production profile is ${c.nativeExecutor.profile.backend} with\n${c.nativeExecutor.profile.transport} transport. The three pack families remain\ncandidates. Operational QA replays original output-frame scalars and current cue timeline checks,
retains raw warnings and exact grouped peaks, and links immutable facts in reports and
handoffs. A custom QA plan is a pinned declarative dependency. State-lint admission is
2 MiB plus 4 KiB per generated layer-frame, capped by the published capacity and shared
Node allowance. Individual successful sampled rules do not grant whole mechanical
acceptance; current failures remain visible.

General imports and preview/export formats use existing episode\ndiscovery. Review declarations, missing token data and pilot admission remain\nseparate from technical completion.\n`;
}
