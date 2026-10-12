# Durable production queue controller

runMechanismProductionQueue(manifestPath, outputDirectory, executor, options) is
public from the engine. Its real renderer adapter and CLI remain in development.
An injected executor currently proves scheduling mechanics with real file/lock/
checkpoint I/O; this supplies no video, fact, human review or pilot acceptance.

A versioned manifest names ID/revision/base hash, code/profile identities and one
to300 distinct questions. Each item declares family/cue paths, design, clocks and
at most128 file pins. The real adapter must construct the complete source/media
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
