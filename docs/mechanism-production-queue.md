# Durable production queue controller

runMechanismProductionQueue(manifestPath, outputDirectory, executor, options) is
public from the engine. `createMechanismProductionNativeExecutor()` builds a
real shared renderer adapter; its `createQueue(id, projects, manifestDirectory)`
snapshots every current source/media dependency and actual code/profile identity.
The [report CLI](./mechanism-production-report-command.md) is verified; queue
execution uses the public API. Generic fixtures prove scheduling mechanics;
[the native proof](./mechanism-shorts-ms3-native-executor-results.json) separately
retains actual three-family capture, cache reuse, caption revision and full decode.
These engineering inputs supply no fact, human review or pilot acceptance.

A versioned manifest names ID/revision/base hash, code/profile identities and one
to300 distinct questions. Each item declares family/cue paths, design, clocks and
at most128 file pins. The native adapter constructs the complete source/media
set; the controller verifies every declared pin. Revisions require the previous
hash and preserve selected IDs/questions/families/designs. Missing or orphan
history rejects rather than resetting the audit trail.

One CE15 PID/start-aware lock owns a fsynced atomic-rename journal. Attempts are
persisted before execution and retained through cancellation, interruption and
permanent/transient failures. Retries are capped at three per revision,96 total
attempts and32 revisions. Permanent failures require input repair; other items
continue. Interrupted duration remainsnull. Cancelled runs retain pending items.

A failed attempt may also retain a bounded structured `finding` from a trusted
mechanism invariant error. It preserves the original code/path/frame, available
rig/parts/relationship/interval and pack reference through typed error wrappers.
The journal, fresh episode report and restart keep that finding alongside the
legacy diagnostic string. Old attempts without the optional field remain valid.
[Located failure proof](./mechanism-shorts-ms3-located-failure-results.json)
separates expected-state admission errors from rendered-frame observations.

Produced paths remain inside the owned output directory. Dependencies, artifact
bytes and report/input/output/code/profile/clock identities are rechecked. Sealed
completions can be adopted after a lost final journal update; unfinished dead
owners retain partial files and resume with another attempt. Cache rejection
reasons and prior product references remain visible. Changed inputs retire old
current products and review readiness.

Manifest/journal/product caps are1/8/4MiB. The existing512MiB Node owner is shared
through per-attempt and verification children. Mutable/returned state reserves
64MiB; a supplied parent receives that result admission until its own disposal.
Foreign leases survive and attempt storage retires. Standalone return data is
caller-owned. No physical RSS or disk power-loss guarantee is claimed.

Relative generic locator relocation passes; real native receipt relocation and
invalidation remain for adapter proof. The actual SIGKILL fixture kills a queue
owner blocked in filesystem execution, not a native encoder.
[Evidence](./mechanism-shorts-ms3-queue-results.json) retains methods/failures;
[MS3 acceptance](./mechanism-shorts-ms3-acceptance.md) preserves all original
workstreams and the ten questions/five assets/two behaviors.

The native adapter measures original worker/aggregate submission counters, verifies
retained original captures, renders cached overlays/audio and fully decodes RGBA
and float32 PCM through bounded streams. Technical QA binds the actual output,
inputs, runtime code/profile and clocks; the other five dimensions stay unreviewed.
Caption-only revision reuses plates with zero new native submissions. Native
receipt locators currently reject relocation; supporting relocation is still open.

## Declarative queue and command execution

Create a `mechanism-production-projects-1` JSON file with an `id` and distinct
`projects`. Each project declares `id`, `question`, `familyPath`, `cuePath` and
optional `qaPath`. Relative paths resolve from this declaration's directory.
The native adapter inspects every current family, cue and source/media pin.

```json
{
  "schemaVersion": "mechanism-production-projects-1",
  "id": "production-pilot",
  "projects": [
    {
      "id": "E01",
      "question": "How does the floating hook establish zero?",
      "familyPath": "E01/family.json",
      "cuePath": "E01/cues.json"
    }
  ]
}
```

```sh
pnpm still-shift production queue --projects projects.json --manifest queue.json
pnpm still-shift production run --manifest queue.json --output-dir output
pnpm still-shift production report --manifest queue.json --output-dir output
```

`queue` accepts up to 300 projects in a 1 MiB declaration and creates an immutable
manifest. An existing destination is preserved. Creation performs no native capture.
`run` uses the existing serial native executor, verifies completed products on
resume, retains failures and emits bounded episode rows with a complete state link.
It returns 0 when all items pass technical execution, 1 for terminal item failure,
2 for invalid input/command and 130 for cancellation. SIGINT/SIGTERM request durable
cancellation; a cancellation before a new result is available preserves the existing
journal's authority without inventing terminal row statuses.

`run --report new-state.json` retains its full state at an explicit new destination;
otherwise the complete state snapshot is saved to a temporary directory. `--offset`
and `--limit` page its compact receipt within the existing response limits. Technical
execution leaves whole mechanical, visual, continuous-motion, factual and listening
reviews separate. Changed inputs require a source revision; restored permanent
failures can use the bounded targeted retry workflow below.

## Targeted retry after input repair

A retry request declares the exact current canonical manifest hash and revision,
plus at most 32 distinct failed or cancelled episode IDs. Obtain the revision/hash
from the complete current production report. Requests are capped at 16 KiB.

```json
{
  "schemaVersion": "mechanism-production-retry-1",
  "baseRevision": 0,
  "baseHash": "sha256:<current canonical manifest hash>",
  "episodes": ["E02"]
}
```

```sh
pnpm still-shift production retry --manifest queue.json --output-dir output --request retry.json
pnpm still-shift production run --manifest queue.json --output-dir output
```

Repair the selected dependencies to their pinned bytes before retrying. The command
checks those pins and the exact current journal, locks both output and manifest,
archives the original and proposed manifests, and atomically advances the current
manifest by one CAS revision. It preserves journal bytes, attempts, products and
reviews. Retry grants one new attempt batch only to selected terminal items; it
performs no execution. `run` then verifies completed neighbors, retains original
failed attempts, and consumes that authorization within the unchanged bounds of
three attempts per revision, 96 per item and 32 revisions. Repeated runs of a consumed
authorization grant no extra attempts. Stale requests, active owners, completed or
unknown targets, corrupt history and exhausted budgets reject before replacement.
An interrupted running row must first be resumed so the runner can recover its
sealed completion or retain its interruption receipt.

Current [rendered visual QA evidence](./mechanism-shorts-ms3-visual-qa-results.json)
adds authenticated cached-preview pixels/glyphs, exact speech-cue metadata and
zero-new-native submission counters to bound production artifacts. Its five
engineering products/300 frames and retained fault controls keep whole reviews
unreviewed; existing genuine pilot products retain their historical bindings.

## Native Blender queue routing

For saved native Blender sources, create the version2 queue with
`--backend blender-native --blender-executable /absolute/host/Blender`.
Run/report inspect the pinned manifest version; version2 requires that explicit
host executable and verifies its actual profile. A supplied `--backend` must
match the manifest before either producer is constructed. Version1 creation and
execution retain their original Three.js default. Retry preserves either version
and starts no producer. Source/project locators and the requested destination
folder are canonicalized before binding and immutable publication.

The [native episode guide](./mechanism-blender-episode.md) documents source/plan
fields and the CLI commands. The shared [generated capability reference](./mechanism-production-capabilities.md)
and `production discover/schema` expose the same implemented limits and candidate
qualification. Native QA-plan/grouped-warning/evidence/handoff work remains open.

## First-pass provenance

First-pass technical completion means the original submitted job finished without
repair, retry or recovery. Every new attempt records a bounded provenance kind and
reason in the retained journal and episode report. Changed submissions without a
recorded reason stay `unknown`; historical passed attempts without provenance keep
the cohort rate and target unverified. A failed original attempt remains a known
first-pass failure even when its origin was not classified.

A revised manifest may declare `revisionChanges` for selected IDs:

```json
{
  "revisionChanges": [
    {
      "id": "EU-002",
      "kind": "repair",
      "reason": "Correct the camera cut during tongue return"
    }
  ]
}
```

The manifest hash authenticates the declared reason. Use `planned-edit` for new
editorial work, `repair` for correcting the submitted job, or `manual-recovery`
when manual intervention was needed. A planned edit starts separate work for this
metric; later failures/retries in that edit remain visible in the failure totals.
The runner records same-request retries and invalid-product `recovery` itself.
It also retains bounded `interventions` in chronological attempt order, so a
same-request manual recovery or exhausted cache recovery affects first-pass
classification even when no new execution runs.
These declarations describe provenance, and require an accurate author assessment;
they do not establish visual or mechanical approval.

`firstPassTechnical.unverified` and each cohort row's `firstPass` expose gaps.
An unknown original completion leaves the aggregate rate/target null. Failed
attempts retain transient/authored/unknown origin totals. Explicit transient and
`MechanismProductionAuthoredError` adapter errors get their respective tags;
unclassified errors remain unknown. Terminal attempt states and prior products
are retained, including failures followed by successful repairs.
