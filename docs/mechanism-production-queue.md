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
reviews separate. Permanent failures currently require changed dependency input
through a CAS revision; an explicit bounded retry workflow remains pending.
