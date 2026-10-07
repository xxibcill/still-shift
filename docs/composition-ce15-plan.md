# CE15 delivery plan

Codex is working on `codex/composition-ce15` from completed CE13 `aedfc9e`.
CE13 PR #48 is open and attached. CE15 remains in progress; its first focused
renderer checkpoint and all seven explicit delivery profiles pass focused acceptance.

## Accepted renderer checkpoint — 2026-10-07

`preserveAlpha: true` carries omitted, null and authored partial backgrounds
through Canvas and WebGL roots. The opaque default retains its original path.
Transparent screen full reads and incremental damage reads use the same in-place
conversion. Existing offscreen rounding remains unchanged.

The pinned browser's PNG conversion uses normalized float32 arithmetic followed
by clamped nearest-even bytes. An exhaustive actual GPU-to-PNG-to-FFmpeg test
verifies all 32,895 valid channel/alpha pairs and 256 zero-alpha pairs. Mathematical
nearest-up differed in 291 pairs; nearest-even without normalized float32 differed
in 139. The selected conversion matches every valid pair. This is actual output
proof, not an assertion about an unverified Chromium source revision.

All 38 authored alpha cases pass exact PNG/raw equality, fresh/incremental reads
and repeated forward/reverse frames across both backends. Build, schema,
boundaries, changed-file lint, 19 readback/exposure units and the complete original
WebGL regression suite pass. Earlier failed diagnostics remain in the
[results](./composition-ce15-results.json). No full gate has run for CE15 yet.

## Accepted format checkpoint — 2026-10-07

Explicit `format` / CLI `--format` selects ProRes4444, PNG8, PNG16, H264,
HEVC10, ProRes422HQ or VP9 alpha. Omission retains the legacy MP4 path.
All profiles perform actual sRGB-to-BT709 RGB conversion, preserve linear alpha
where supported and verify actual metadata, frame counts and complete decoding.
PNG sequences use `%06d.png`, a final hash manifest and the exact captured PCM WAV
companion. MOV carries exact PCM; MP4 uses the exact 48 kHz AAC edit-list clock; WebM
verifies the actual decoded Opus sample count. Renderer source precision remains 8-bit;
the manifest distinguishes codec input depth from verified output depth.

The mandatory format test passes 28 backend/transport exports, 14 independent
preview encodes, 2 real CLI exports, 18 dimension cases and 16 protected failures.
There are 44 successful production exports; all repeat and independent media bytes
match. Every authored alpha value is checked on every actual frame, including
native PNG16/ProRes12/VP9 alpha decoding and complete PNG sequence reimport.
Actual 17 × 19 exports pass where supported; both maximum 8192-pixel axes pass PNG on
both backends. H264/HEVC reject odd dimensions. Full large-area/worker limits remain
pending. Six native sequence transaction tests verify completion order, original
abort reasons, cleanup and concurrent foreign-file retention. This is a per-file
transaction, not a crash-atomic bundle.

Build, lint, 39 focused unit/runtime tests, 65 affected media/CLI tests, schema,
boundaries and both existing composition WebGL-export/native-media browser suites
pass. H264 CRF18 exceeded the unchanged four-level gray check; the explicit
profile now uses CRF16 while legacy encoding retains 18. Direct precision conversion
and simple tag rewriting were rejected because they changed alpha or RGB samples.
[Detailed evidence](./composition-ce15-format-results.json) retains the attempts,
checksums, scoped code fingerprint and actual reports. No CE15 full gate has run.

## Accepted cache store foundation — 2026-10-07

The export-owned immutable surface store passes build, lint, boundaries and 10
runtime cases: producer/consumer leases, exact byte/float32 storage, foreign and
duplicate publishers, changed state identity, aggregate reservations, bounded
chunks, cancellation, original errors and foreign-file retention. Its counters
measure actual leases, hits, waits and disk bytes. It has no renderer integration
yet; these counters are not paint counts.

Actual Canvas read/restore is exact across 65,536 source channel/alpha combinations
and 15 transformed composites. New direct-draw isolation fails nine cases by up
to two levels and is rejected. Synchronous binary document XHR throws in actual
Chromium and is rejected. An asynchronous preparation/rendezvous prototype has
four distinct actual renderer processes, overlapping native Canvas workloads,
one canonical surface paint and three byte-identical consumers. This establishes
a small protocol candidate, not composition/parallel acceptance or speedup.
[Evidence](./composition-ce15-cache-results.json) retains both rejected paths.
Full static layer/precomp coverage and integration remain mandatory below.

## Accepted independent surface integration — 2026-10-07

The opt-in preview cache and real authenticated disk-backed exchange pass 24
Canvas/WebGL cases and 1,248 exact cached/uncached frame comparisons across four
pages. Existing independent isolates and precomps paint once globally, including
late visibility, required-coverage preflight, nested mattes, effect inputs, history
and exposure. Changing evaluated states use the original drawing path. Native
storage tests cover all 65,536 channel/alpha pixels on each backend and exact
float32 producer/consumer transfer. Twelve preparation failures protect hashes,
body/lease sizes, memory admission and original cancellation reasons. Build,
lint, boundaries, 32 key/exposure units and existing alpha/exposure/WebGL-export
browser regressions pass. The new browser check joins the mandatory local gate.

This is partial integration. Public export scope capture and worker wiring remain
pending. Direct draws keep their original boundaries; static direct layers over
changing backdrops still need an exact strategy. One custom-provider source paints
once, but provider preparation occurs in each page; built-in source preparation
needs a complete paint audit. Aggregate allocations, native/spatial coverage,
parallel production delivery, the two-minute speed proof and full gate remain
mandatory. [Detailed evidence](./composition-ce15-surface-results.json).

## Accepted ordered-pipe foundation — 2026-10-07

The one-frame chunk receiver passes 12 runtime cases, build, lint and boundaries.
Four independent producers feed exactly one consumer in absolute frame order,
with one pending body per worker. Ownership, gaps, duplicates, early consumer
return and missing final frames fail closed. Original Error and non-Error abort
reasons reach active and queued workers. The first implementation passed its
assertions but emitted two uncaught deferred stream errors; retaining the error
listener through the actual close event fixes the race. This is a pipe foundation,
not production parallel acceptance. [Evidence](./composition-ce15-parallel-results.json).

## Remaining implementation and acceptance

1. Establish aggregate pixel/worker memory limits and verify the full area matrix.
2. Retain static layer and precomp surfaces once per export globally. Include
   coverage preflight painting, late visibility, nested effects/mattes, actual
   ownership counters, bounded memory and cached/uncached pixel equality.
3. Add bounded independent browser workers feeding one ordered encoder. Preserve
   absolute source time, cancellation and transactional publication. Verify
   boundary frames, repeat bytes, concurrent errors and foreign-file retention.
4. Record actual per-layer submission/render timings, cache hits and owned bytes.
   Measure a real two-minute export end-to-end with one and four workers under the
   same profile and cache policy, without competing workloads. Require identical
   output and at least 3× speedup.
5. Review implementation, run affected checks, then run the complete pinned local
   `pnpm check` on an immutable final checkpoint. Create and attach the CE15 PR,
   then continue all CE14 work on a new branch.

GitHub Actions remain disabled. CE5-X/Q9, CE6-P and separate owner work remain
pending. No milestone or PR is merged by this mission.
