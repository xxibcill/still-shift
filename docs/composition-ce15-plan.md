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

This integration retains existing independent surfaces. Public export scope capture
and worker parity/lifecycle are accepted below. Direct draws keep their original
boundaries; static direct layers over
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

## Accepted production worker checkpoint — 2026-10-07

Public `workers: 1..4` / CLI `--workers` and `cacheStatic` / `--cache-static` opt
into independent pinned browsers and one bounded absolute-order encoder pipe.
The private cache scope captures authored/verified sources, prepared native maps,
renderer environment, format, transport and alpha. Metrics record actual renderer
and GPU process IDs, frame indices, render/upload timings and independent cache
ownership. Process IDs are not GPU timing evidence.

The mandatory parallel browser check passes in 181.14 seconds: 111 successful
exports at 60 fps, 28 format/backend/transport combinations, all worker counts,
cached/uncached and implicit-worker options, legacy MP4 and real CLI. Complete
encoded bodies, all 888 decoded successful frames and complete audio match. Eight
native cases cover 12 fps video/sequences, reversing remap, blending, exposure cuts,
echo and repeated exports. Twenty-four live failures protect frame-zero aborts,
original/null reasons, worker diagnostics/browser exit, malformed uploads, source
mutation and a concurrent foreign destination. All browsers close and stages are
removed; the foreign file survives. Thirty-two focused tests, build/lint/boundaries
and the existing format/legacy export browser suites pass. The first source-mutation
assertion expected the wrong guard wording; production's original earlier rejection
is retained and the complete mandatory command passes on rerun.

Static independent precomps paint once globally. Complete direct/root/prefix and
built-in preparation counts, total allocation admission, per-layer timing, the
actual two-minute 3× proof and final full gate remain mandatory.
[Detailed production evidence](./composition-ce15-parallel-results.json).

## Accepted native preparation checkpoint — 2026-10-07

Pinned glyphs, prepared outline variants and coverage probes now paint once
globally through the actual export store. Consumers restore the original native
RGBA8 pixels before ordinary preview construction. Font-frame discovery uses
identical shaped bounds with unpainted raster headers; the paint audit exposed
and removed redundant glyph painting during construction retries (51 calls became
three).

Eight source cases cover both backends, both raster policies, and fixed/animated
outlines. All 416 source comparisons and 1,664 complete audit frame comparisons
pass exactly. Thirty-two actual production exports (uncached, one/four workers and
four-worker repeats) preserve complete PNG bodies and all 256 decoded frames.
Native preparation calls and actual global ownership counts agree: one coverage
paint, three glyph paints and two fixed/eight animated outline variants per export.
Eleven malformed/abort cases preserve original reasons, admit no invalid restores
and clear failed producer canvases. Build/lint/boundaries, 63 focused tests,
12 provider placement cases and all eight original typography fixtures pass.
Glyph performance is 1.2926× under the unchanged 1.5× policy.

Per-source durations and retained/payload bytes are measured. Direct/root/prefix
painting, runtime tinting, broader variable/correction coverage, complete aggregate
allocation, per-layer timing, two-minute speed acceptance and the final full gate
remain mandatory. The permanent parallel browser suite includes the 32 new exports;
its expanded whole command will run at final acceptance. Prior failed fixtures and
the redundant-paint finding remain in the [evidence](./composition-ce15-source-results.json).

## Accepted original-target root checkpoint — 2026-10-07

The cache now retains complete root pixels in their original native target policy.
Canvas restores exact native bytes; WebGL overwrites the target through an
unblended texel copy. Coverage has its own layer/alpha-target identity and keeps
all original validation at the unchanged threshold. Ordered operation identities
retain late visibility phases. Changing evaluated states use the original painter.

All 24 new static/coverage/late root cases pass across both backends, both alpha
contexts and raster policies. Native provider calls agree with once-global root
ownership; the 56-case audit passes 2,912 exact frame comparisons. Six exhaustive
RGBA8 transfers / 393,216 pixels and 256 float pixels pass exactly. Fourteen root
failure cases protect hashes, sizes, budgets, original reasons, paint/capture errors
and cancellation during asynchronous hashing. No invalid restoration occurs.

The expanded mandatory parallel command passes 207 successful production exports
and 1,656 decoded frames, including 64 new static/coverage/late native-glyph root
exports and 32 preparation exports. Complete media/PNG/audio bodies, all seven
formats, native remap/exposure/history and 24 protected live failures pass. Forty-five
graph/readback tests, 67 typography tests and original provider/typography browser
fixtures pass. The first expanded production run failed its no-fallback assertion:
constant outline endpoints still advanced a conservative clock. Held gate semantics
are repaired while weights, selectors, masks and moving intervals remain live;
the full command passes after focused native root verification.

Closed static prefixes, the remaining direct/tint and broader source audit,
complete allocation admission, per-layer statistics, actual two-minute speed
acceptance and the final full gate remain mandatory.
[Detailed evidence](./composition-ce15-root-results.json).

## Accepted closed-prefix checkpoint — 2026-10-07

Static direct content beneath moving image pixels can now reuse a complete prefix
in its original target. The shared executor partition keeps every maximal native
vector/solid batch intact. Restored prefix bytes overwrite the original target,
then the original suffix continues at that boundary. Full root preparation reuses
an already prepared prefix. Authored hints select candidates; complete evaluated
prepared-content and backdrop keys authorize each reuse. Fixed authored provider
params cannot hide changing actual visual keys.

The expanded audit passes 104 cases / 5,408 exact comparisons, including 48 prefix
cases / 2,496 frames across both backends, both alpha/raster policies, late visibility,
linear-sRGB, changing providers/backdrops and whole mixed batches. Actual static
native provider painting is once global at an existing closed boundary. Mixed
WebGL vector batches retain their original native grouping. All 53 focused batch,
graph, exposure, readback and key tests pass. Thirty-two real direct native-glyph
and rich-provider exports under moving images preserve all encoded PNG bodies and
256 decoded frames across uncached/one/four/repeated workers. The permanent
parallel suite includes these cases; its expanded whole command remains pending
until final acceptance.

Runtime tint and broader preparation coverage, complete allocation/metadata
admission, per-layer statistics, actual two-minute speed acceptance and the final
full gate remain mandatory. [Detailed evidence](./composition-ce15-prefix-results.json).

## Remaining implementation and acceptance

1. Establish aggregate pixel/worker memory limits and verify the full area matrix.
2. Retain static layer and precomp surfaces once per export globally. Include
   coverage preflight painting, late visibility, nested effects/mattes, actual
   ownership counters, bounded memory and cached/uncached pixel equality.
3. Keep accepted worker/format/native/boundary/lifecycle parity while completing
   the remaining global cache, allocation and statistics work.
4. Record actual per-layer submission/render timings, cache hits and owned bytes.
   Measure a real two-minute export end-to-end with one and four workers under the
   same profile and cache policy, without competing workloads. Require identical
   output and at least 3× speedup.
5. Review implementation, run affected checks, then run the complete pinned local
   `pnpm check` on an immutable final checkpoint. Create and attach the CE15 PR,
   then continue all CE14 work on a new branch.

GitHub Actions remain disabled. CE5-X/Q9, CE6-P and separate owner work remain
pending. No milestone or PR is merged by this mission.
