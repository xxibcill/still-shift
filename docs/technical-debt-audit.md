# Technical debt audit and completed cleanup

Reviewed 2026-09-27 against baseline commit `02bdb55`. The initial targeted fixes
and all six follow-up implementation items are included in this working tree.

The project already had strict TypeScript, schema validation, deterministic
fixtures, and substantial behavioral coverage. The main problems were ownership
of I/O and lifecycle work across the engine, CLI, workers, and Lab. This work
consolidates those responsibilities while preserving scene formats and rendering
algorithms. It is not an exhaustive security or dependency-vulnerability audit.

## Initial fixes

- [Shared bounded JSON parsing](../apps/lab/json-body.ts) preserves UTF-8 characters
  split across upload chunks and measures bytes. Passage imports now enforce
  2,000,000 bytes; Commerce retains 64,000,000 bytes.
- [Depth-cache validation](../services/depth-worker/src/still_shift_depth/preparation.py)
  rejects malformed manifest objects, provenance, checksum mappings, and metrics.
  Nineteen reproduced corruption cases rebuild successfully and then become cache
  hits. Valid caches keep their identities and checksums.
- [The shared export client](../apps/lab/src/commerce-export.ts) handles Commerce
  and Story uploads, replacing duplicate serialization in the reusable gallery.
- Full CLI verification exposed an existing [manifest-contract mismatch](../packages/scene-contract/src/contracts.ts):
  intentional flat-2D presets were rejected as an unknown mode and incorrectly
  required depth-analysis quality. The schema now accepts all four implemented flat
  presets while preserving quality agreement and depth-analysis requirements. The
  real CLI test and focused contract regressions cover this path.

## Six-item implementation record

### 1. Complete export transactions

**Baseline risk:** Prepared export published MP4 and scene metadata before
validating/writing result JSON. A later failure left output that prevented retry.
The WebGL path validated after publication and implemented separate rollback.
Commerce cleanup could permanently retain its busy flag if temporary removal failed.

**Implemented:** [The execution runtime](../packages/execution-runtime/src/export-worker.ts)
validates caller results and stages all metadata before publication. Engines return
that already-validated result, with no second validation after publication.
[Artifact publication](../packages/execution-runtime/src/artifact-publication.ts)
uses exclusive links and tracks ownership for rollback; pre-existing or competing
outputs are preserved. The MP4 is published after its metadata. Passage publication
also includes delivery outputs, the report, and job completion within its transaction;
resume preserves the previous output through rollback backups.

[Commerce cleanup](../apps/lab/commerce-api.ts) logs removal errors and always releases
its busy flag. Boundary tests inject result validation/write errors, competing
result files, and cleanup failure; they verify output cleanup and successful retry.

This is transactional handling of errors and cancellation, not an atomic filesystem
operation spanning several paths or a power-loss durability guarantee. If rollback
cannot restore a replaced destination, it reports the failure and retains the backup
rather than deleting recoverable data.

### 2. Cancellation through media validation

**Baseline risk:** FFprobe and full FFmpeg validation ignored the caller's signal,
including passage delivery verification. A cancelled cache verification could still
publish reusable work.

**Implemented:** [The subprocess boundary](../packages/execution-runtime/src/subprocess.ts)
propagates cancellation, escalates a child that ignores termination, and waits for
it to exit before settling. Export verification, hashes, narration probing, passage
runtime identity, and delivery verification receive the signal. The encoder is
reaped before temporary files are removed. Cancellation is checked during cache
and output publication, and cleanup preserves the original cancellation reason.

Tests cancel during frame upload, probe, decode, cache verification, and publication.
Stubborn real child processes must be gone when cancellation settles; failed work
must leave no reusable partial output and must permit retry.

### 3. Shared execution ownership and package boundaries

**Baseline risk:** The engine imported CLI lock recovery and tool-owned rendering
implementations. Undeclared runtime dependencies and a hardcoded `.venv` path hid
repository-layout assumptions.

**Implemented:** [Execution runtime](../packages/execution-runtime/README.md) now owns
artifact locking, process execution, browser assets, exports, and publication. Engine,
CLI, and tests use its public entry points. Package manifests and the lockfile declare
actual dependencies. The lock helper uses configurable `pythonCommand` / `STILL_SHIFT_PYTHON`
with `python3` as its default; the browser composition root is configurable.

[The dependency gate](../scripts/check-package-boundaries.ts) rejects shared-package
imports of application implementations, a runtime-to-engine dependency, private runtime
imports, and undeclared source dependencies. Existing live-owner, stale-owner contention,
killed-owner, interrupted-job, and cache-reuse tests were retained.

### 4. One depth-worker response contract

**Baseline risk:** Lab and engine used different validators, with the engine accepting
malformed metrics that failed later in result construction.

**Implemented:** [Scene-contract owns the worker protocol](../packages/scene-contract/src/depth-worker.ts).
Python success, normalization, and failure responses include `protocolVersion:
"depth-worker-1"`; both consumers use the shared schemas and parsers. Missing or unknown
versions and malformed payloads produce stable `PREPARATION_FAILED` errors.

This adds a wire-protocol field without changing cache identities or public animation
result formats. [Protocol documentation](../services/depth-worker/README.md) records the
compatibility behavior. Tests exercise actual Python fake-adapter misses/hits,
normalization, configuration/input failures, and invalid metric/version payloads.

### 5. Shared Lab session lifecycle

**Baseline risk:** Three pages independently managed asynchronous loading, dirty state,
playback, downloads, and export state; two discarded a valid renderer before its
replacement succeeded.

**Implemented:** [The preview session](../apps/lab/src/preview-session.ts) owns candidate
resources, initial-frame validation, stale-result rejection, active-preview replacement,
playback, dirty controls, export snapshots, and failure recovery. Commerce, Commerce
Components, and Reusable Components all use it. Page-specific controls and scene
building remain local. Failed asset loading can be retried.

[Browser lifecycle tests](../tests/browser/lab-session.ts) cover delayed/stale loads,
invalid edits preserving pixels, export snapshots, status ordering, failed-export retry,
control recovery, and playback across all three pages. The old preview controller and
duplicated state machines were removed.

### 6. Explicit verification tiers and CI configuration

**Baseline risk:** The unit group mixed pure behavior with OS processes and FFmpeg;
there was no tracked CI workflow, and launching all groups together caused contention.

**Implemented:** [Verification tiers](./verification.md) separate fast checks, runtime
process/cache tests, integration tests, representative browser exports, and the full
release gate. Process-dependent unit files moved to `tests/runtime` with their assertions
intact. Worker concurrency is bounded and aggregate runtime groups run sequentially.
Python formatting/lint now includes the shared lock helper.
Benchmark discovery is restricted to `benchmarks/`, excluding copies in local
worktrees and package stores. Each benchmark iteration uses a fresh output path,
and benchmark errors are thrown instead of silently ending an output-collision run.

[The CI workflow](../.github/workflows/verify.yml) runs the fast gate on pushes and PRs.
Manual runtime/release jobs use a provisioned trusted media runner and verify the pinned
toolchain. Repository configuration is supplied; runner registration, hosted CI execution,
and branch-protection settings have not been performed in this local task.

## Verification

Validated with the pinned local toolchain on 2026-09-27:

- `pnpm check` passed: toolchain, generated schema, dependency boundaries,
  formatting, lint, TypeScript, 369 unit tests, 42 runtime tests, 52 integration
  tests, 14 Python tests, and all 22 browser/render groups.
- The full matrix includes 30 golden comparisons, 126 Commerce frame comparisons,
  all 63 reusable-gallery combinations, and exact relocated-package matches for
  576, 768, and 576 frames. Real passage tests verified cache reuse, isolated edits,
  range export, cancellation/resume, and narration reuse.
- `pnpm test:browser:smoke` passed all three Lab lifecycle workflows, 21 timing
  combinations at 24/30 fps, and real Commerce and Story MP4 downloads.
- `pnpm benchmark` passed after correcting discovery and output reuse: one local
  benchmark with 644 measured samples. This is a local smoke measurement, not a
  performance guarantee for production media.
- The corpus readiness check remains nonzero: the reviewed real-image set,
  category coverage, human sign-off, and freeze metadata are not supplied.

The benchmark-only corrections were verified separately after the full render gate;
they do not change application code. Final formatting, lint, type, boundary, schema,
unit, and diff-whitespace checks include those corrections and this report.

The full release-readiness gate still requires the reviewed real-media corpus. That
input dependency is intentionally retained; deterministic fixture tests do not establish
real-corpus visual or editorial acceptance.
