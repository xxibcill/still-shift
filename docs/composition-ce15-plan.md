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

## Accepted submission-statistics checkpoint — 2026-10-07

Opted workers now record actual synchronous submission wall-time spans for graph,
operation, original native batch/content and cache-copy calls. Nested exclusive
time avoids double counting; each span retains exact layer/type membership.
Shared mixed-batch overhead has its own row. Per-phase/type manifest totals combine
actual worker values and divide by output frame count. Preparation and coverage
remain separate from ordinary frame submission. These spans measure API/recording
wall time; GPU completion and process CPU are not inferred from them.

All 57 focused tests and 104 browser cases / 5,408 exact comparisons pass. The 48
prefix cases check actual phases, membership and exclusive aggregation. Thirty-two
prefix exports retain complete PNG bodies and 256 decoded frames. Ten additional
exports verify required coverage, nested blur, original/cached one/four-worker
paths, complete PNG bodies / 80 decoded frames and exact manifest aggregation.
The first audit assertion wrongly required preparation painting in each consumer;
actual consumer pixels are restored. The corrected whole audit passes.

`ffmpegCpuScope` now states the existing transcode user+system measurement. Pinned
[FFmpeg 8.0.1 source](https://github.com/FFmpeg/FFmpeg/blob/n8.0.1/fftools/ffmpeg.c#L853-L946)
confirms that this excludes startup/file opening and final cleanup. A verified
whole-process measurement, complete allocation/metadata admission, remaining
preparation coverage, actual two-minute speed proof and final gates remain pending.
[Detailed evidence](./composition-ce15-statistics-results.json).

## Accepted complete FFmpeg CPU checkpoint — 2026-10-07

Opted worker exports now measure the complete FFmpeg command with POSIX child
user/system CPU, including its startup, file opening and cleanup. Metrics retain
explicit scope and the reference Mac's actual 10 ms reporting resolution. The
existing transcode-only measurement remains separate. The timer and FFmpeg child
share an export-owned process group; cancellation terminates both and waits for
actual group disappearance before returning. Default exports keep direct FFmpeg.

Eight real parser/process cases, 23 focused tests and all 20 CLI tests pass.
Fifty-six exports across seven formats, both backends/transports and one/four
workers retain the prior accepted complete encoded, decoded-frame and audio
bodies (448 frames). Twenty-four live failures observe actual timer/FFmpeg IDs
and prove both exited, browsers closed, private stages removed and foreign files
preserved. The first prototype's already-exited-group ESRCH and the initial CLI
runner/sandbox errors are retained. Complete CE15 acceptance, memory admission,
remaining preparation coverage and actual two-minute speed proof are pending.
[Detailed evidence](./composition-ce15-cpu-results.json).

## Accepted runtime tint and broader source checkpoint — 2026-10-07

Evaluated text and provider colours now request the original source-in glyph/tint
kernel before any parent surface/root/prefix lease. Exact native source identity
includes layout/fonts/axes, colour and outline key. Native/provider crossfade states
prepare both inputs. Nested surfaces, masks, effect inputs and echo histories are
visited before drawing; constructor and runtime source failures retain their
original reasons. Local sixteen-colour eviction cannot cause native repainting of
an already published source.

The complete 120-case audit passes 6,496 exact comparisons. Sixteen new cases add
1,088 frames across both backends/raster policies: more than sixteen animated
colours, real Thai width/weight variants, correction glyphs and state crossfades.
Actual native counts equal once-global source ownership: 44 colour tints, 27 axis
glyphs/15 tints, four correction glyphs/ten tints, and four state-mix glyphs/14 tints.
Sixty-four public original/one/four/repeated exports preserve complete PNG bodies
and all 768 decoded frames. All 100 focused tests, 67 typography units, twelve
provider placements and eight original typography fixtures pass; glyph timing is
1.394895× under the unchanged 1.5× policy. The new recursive fixture and original
null errors are protected. Draft fixture/catalog mistakes and repairs are retained.

Aggregate allocation/metadata admission, maximum-area/worker verification, actual
120-second 3× speed proof and the immutable complete CE15 gate remain pending.
The permanent parallel command now includes 303 successful exports / 2,680 decoded
frames plus 24 live failures; its expanded whole run is reserved for final acceptance.
[Detailed evidence](./composition-ce15-tint-results.json).

## Accepted managed allocation foundation — 2026-10-07

Explicit pixel and metadata leases admit declared application-owned bytes before
allocation. Typed views share backing-store ownership; sequential scratch phases,
retention, constructor commit and final disposal define release. Cleanup visits
every owner even when a destructor throws and preserves the original reason.
A pinned export page can own one asynchronous allocator scope. Canvas uses
per-instance backing accessors and original native setters/context policy.

Nine unit tests pass. The native browser proves 1,024 exact channel comparisons,
over-quota rejection before the native setter, real scratch/final Canvas destruction,
retained backing aliases and overlap rejection. This primitive joins the mandatory
surface audit; all 120 existing cases / 6,496 exact frames still pass. Build, lint
and boundaries pass. Production rendering has not yet adopted these primitives.
The 8,192 control-entry cap is not complete metadata-byte admission, and declared
storage is distinct from physical RSS. Aggregate allocation coverage, full area/
worker matrix, actual 120-second speed proof and final gate remain pending.
[Detailed evidence](./composition-ce15-memory-foundation-results.json).

## Accepted Canvas allocation and bounded receive checkpoint — 2026-10-08

Canvas factories/backing changes and native reads now reserve declared storage in
an allocator scope. Pooled/raster owners, source canvases, root captures and exposure
accumulators retain their admission across frames. Dropped/evicted native canvases
are destroyed; pixel buffers detach with native `ArrayBuffer.transfer(0)`. Explicit
strong owners and transfer-aware teardown remove dependence on finalizers or weak
collection. Failed construction drops scratch before source rendezvous; coverage
paint/restore targets allocate after their small policy header is discarded.

Exact cache-body destinations and at most 64 KiB BYOB blocks are admitted before
native receive. Actual 180 KB body bytes match; short/long/quota/null failures release
all storage and preserve original errors. Native pool eviction/reuse and exposure
average pass 256 exact channels, alongside the 1,024 original admission channels.
Eleven managed source failures release every reservation before final disposal.

All 132 audit cases pass 7,248 exact frames. Twelve managed Canvas cases add 752
comparisons across four pinned pages, both raster policies, animated colours, axes,
corrections and crossfades; all actual global paint counts remain strict and all
reservations release. Build/lint/boundaries, 37 admission/cache/exposure, 90 effect/
pool and 67 typography tests pass. Twelve provider placements and eight original
fixtures pass; glyph timing is 1.291824× under unchanged 1.5×. Sixty-four public
exports preserve all 768 complete PNG bodies and decoded frames, also compared to
the prior accepted tint checkpoint.

The production allocator scope is not enabled yet. GPU, asset/font, capture/upload,
Node and complete metadata admission remain pending, followed by the full area/
worker matrix, authentic 120-second speed proof and immutable complete CE15 gate.
Audit oracle/loaded assets are outside this Canvas scope; declared per-page peaks
are distinct from actual process RSS and simultaneous aggregate memory.
[Detailed evidence](./composition-ce15-canvas-memory-results.json).

## Accepted GPU storage ownership checkpoint — 2026-10-08

Native texture, geometry-buffer and four-sample RGBA8 storage now reserve declared
bytes before handle creation and storage commands. RGBA8/32F, immutable source/depth
textures, MSAA, resolve and pooled surfaces keep admission through actual native
ownership. Texture swaps preserve the same owners; eviction/disposal issues native
deletes and releases the corresponding lease. CPU native byte/float readbacks,
row scratch, shader/upload tables and partial meshes reserve before allocation.
Incremental full reads and PNG coordinate tables survive frame scratch; completed
copies/uploads and replaced data detach at their actual boundary.

All 144 audit cases pass 8,000 exact frames. Twenty-four managed Canvas/GPU cases
cover 1,504 comparisons across four pinned pages, both raster policies, animated
colours, axes, corrections and crossfades with strict once-global native counts.
Native proof checks 256 byte channels, 64 signed float channels through swapped
textures, denial before native storage, real pool reuse/eviction and original null
initialization errors. Depth mesh/MSAA resizing preserves 2,656 channels and deletes
actual buffers/textures/renderbuffers; PNG coordinate reuse preserves 98,304 channels
through four frames after scratch teardown. Every managed reservation releases.

Build/lint/boundaries, 54 admission/cache/exposure/depth and 119 effect/pool/GPU/depth
units pass. The complete original WebGL command passes unchanged assertions; all
17 actual-default depth timelines / 1,530 frames have zero delta. Sixty-four public
exports preserve all 768 complete PNG bodies and decoded frames against the prior
accepted Canvas checkpoint. Failed strict typing and review repairs are retained in
[the evidence](./composition-ce15-gpu-memory-results.json).

Asset/font inputs/decodes, capture/upload, Node and complete metadata admission
remain pending before enabling the production allocator. Native driver/codec memory
and physical RSS remain distinct from declared storage; these per-page proofs are
not the full aggregate/area matrix, two-minute speed acceptance or complete gate.

## Accepted asset/font/media ownership checkpoint — 2026-10-08

Verified HTTP bodies, receive blocks, temporary Blob copies, RGBA8 native image and
bitmap capacities and owned FontFace input copies now reserve before native work.
Successful preparation commits retained inputs/decoders; failed phases wait for
started nested loads and release all owned storage while preserving original errors.
Managed loads remain sequential. Existing fonts remain borrowed; new native faces
are deleted from the registry on release, including late completion after disposal.
Native bitmaps survive frame scratch, and LRU eviction/disposal closes their actual
handles. Temporary typography, axis, layout and coverage probes release after use.

All 144 audit cases / 8,000 exact frames pass. The 24 managed Canvas/GPU cases /
1,504 comparisons now load assets and fonts inside their allocator scope, preserving
all once-global native preparation/tint/axis/correction/crossfade counts. Native
proof preserves 61,440 image and 1,024 bitmap channels, exact font metrics, actual
borrowed registrations and 15 protected image/font/media failures. Build, lint,
boundaries, 64 admission and 86 affected tests pass. Original 67 typography tests,
12 provider cases / 60 comparisons and eight typography fixtures pass; glyph ratio
1.383989× meets the unchanged 1.5× policy. Complete original native media, illustrated
(42 comparisons) and story (98 comparisons, 14 reverse seeks, 646-frame delivery)
commands pass. All 64 public exports preserve 768 complete PNG bodies and decoded
frames against the previous accepted GPU checkpoint.

Four discarded 1×1 typography canvases found by exact native accounting and the new
helper's strict typing/diagnostic assertion repairs are retained in
[the evidence](./composition-ce15-resource-memory-results.json). Private decoder,
font, driver, codec and VM bytes remain distinct from declared storage and physical
RSS. Production admission is still disabled pending capture/upload, Node and
complete metadata integration, then aggregate/area/worker checks, the authentic
120-second speed proof and immutable complete gate.

## Accepted native capture/upload ownership checkpoint — 2026-10-08

Native raw readbacks now admit their original RGBA8 destination before allocation;
Canvas temporary ImageData detaches after the original row reversal. PNG/JPEG
reserve a conservative encoded capacity before the original native toBlob call,
then shrink to the completed body size. Frame scratch spans original preparation,
render, capture and the complete upload acknowledgement. Raw storage detaches and
encoded ownership releases at acknowledgement; failures preserve original reasons,
including null. Late native completion cannot return an expired allocator owner.

Build, lint, boundaries and 70 admission/frame-lifetime tests pass. All 144 audit
cases / 8,000 frame comparisons pass, including 24 managed asset/font/Canvas/GPU
cases / 1,504 frames and all prior native resource checks. Six actual Canvas/WebGL
raw/PNG/JPEG captures match direct original native complete-body size/SHA256 oracles;
actual HTTP uploads retain ownership through acknowledgement. Twelve native failure
cases cover quota before producer invocation, native zero-size encode, original
null acknowledgement and late completion. Complete original native media and WebGL
export commands pass. All 64 public exports preserve 768 PNG bodies and decoded
frames against the previous accepted resource checkpoint.

Strict native-observer typing and captured-allocator validation repairs are kept in
[the evidence](./composition-ce15-capture-memory-results.json). Logical Blob ownership
and declared capture capacity remain distinct from codec/network/driver/VM private
memory and physical RSS. Production scope stays disabled until Node and complete
metadata integration, then aggregate/area/worker checks, authentic 120-second speed
acceptance and the immutable complete local gate.

## Accepted metadata serialization foundation — 2026-10-08

Native JSON output now has an explicit owned text record. Worst-case UTF16 output
is admitted before each original native value emission; completion shrinks to the
actual text size. Original omission, holes, escapes, numeric spelling, toJSON,
replacer calls/receivers and boxed primitive coercion are preserved. Temporary
canonical-sort tuples/arrays/objects are admitted before their original copies.
Retained output crosses scratch boundaries explicitly; original null/errors and
quota failures release started ownership. Nested serialization restores its parent.

Build, lint, boundaries and 78 focused tests, including eight new metadata tests,
pass. Sparse-fixture lint, native cycle-fixture semantics and boxed primitive sizing
repairs are retained in [the evidence](./composition-ce15-metadata-foundation-results.json).
Capacity discovery assumes ordinary enumerable records; arbitrary Proxy trap
semantics are not covered. Borrowed callback-produced data and private VM builder
storage remain separate from declared output/shallow-copy capacity.

This foundation is not yet wired to caches or Node. Retained key/row/member/snapshot,
graph/font, transport/stream/result and actual production admission remain pending,
along with aggregate/area/worker checks, authentic two-minute speed acceptance,
the complete immutable gate and CE15 PR before CE14.

## Accepted retained submission metadata checkpoint — 2026-10-08

Statistics admit original lookup strings, row/member copies, Map growth, nesting
and independent snapshots before their allocation. Retained rows keep explicit
text owners; repeated lookup strings release immediately. Failed row construction
rolls back Map capacity. Preview-construction rollback and completed preview
disposal release rows/keys, while returned snapshots keep their independent owner.

Build, lint, boundaries and 90 focused tests pass. All 144 audit cases / 8,000
exact comparisons pass, including all 24 managed cases / 1,504 frames. New real
Canvas/WebGL checks preserve 22 original-native frames and hold actual snapshot
ownership through page RPC until the caller acknowledges completion. Disposal
then clears page snapshot copies; Node's deserialized counters remain intact.
Original WebGL export checks, 67 typography tests, 12 provider cases / 60 frames
and eight original typography fixtures pass. Glyph ratio 1.439058× meets the unchanged
1.5 maximum. All 64 public exports preserve 768 complete PNG bodies and decoded
frames against the prior accepted capture checkpoint.

The native proof found and repaired an unreleased WebGL 300x150 measurement
Canvas. It now releases after original coverage/text preparation, including failure;
post-preview native pixel admission is zero on both backends. Typing/lint/IPC and
native failure evidence is retained in [the record](./composition-ce15-statistics-memory-results.json).

Selected statistics capacities are declared logical container/text storage. Ledger
control, remaining cache/provider/graph/font metadata, Node protocol/results and
actual production admission remain pending. RPC lifetime coverage here does not
claim complete production transport admission, aggregate memory, speed or full-gate
acceptance. CE15 completion/PR and all CE14 remain in the approved mission.

## Accepted retained source metadata checkpoint — 2026-10-08

Source-cache canonical key strings and original prepared-state shallow copies now
reserve metadata before emission/copy. Pending miss keys survive failed preview
scratch rollback; completed entries retain those owners and duplicate hit keys
release immediately. Native UTF8/SHA256 inputs, digest backing and original hex
construction reserve before their producers and detach actual temporary backing.
Original state Maps/Sets, pending requests, entry/counter rows and independent
snapshot copies grow or allocate only after their declared capacity is admitted.

Build, lint, boundaries and 99 focused tests pass, including original null errors,
quota-before-producer, multiple misses, late native completion and disposal during
preparation. Review repaired a scratch-phase cleanup gap after disposed state.
All 144 audit cases / 8,000 exact comparisons pass with original native count and
protected failure checks. The 24 managed source groups / 1,504 comparisons retain
complete source statistics across 96 actual page RPC returns, then release all
owned bytes on acknowledgement while Node copies remain intact. Original WebGL,
69 affected typography tests, 12 provider cases / 60 frames and eight typography
fixtures pass; glyph 1.467095× meets unchanged 1.5 maximum. All 64 public exports
preserve 768 complete PNG bodies and decoded frames against pushed `741e976`.

Selected logical source metadata is admitted. Root/Surface/provider keys, graph/
font structures, pixel checksum metadata, ledger control, Node protocol/results
and production/aggregate admission remain pending. No speed or full-gate acceptance
is claimed. [Evidence](./composition-ce15-source-metadata-results.json).

## Accepted retained root metadata checkpoint — 2026-10-08

Root role/path/full-state keys use admitted original canonical serialization and
native hashes. Retained counter rows own role/path strings; retained entries own
signature/pixel-envelope records. Duplicate lookup identities release immediately.
Original operation tuples, Map growth and counter/entry/snapshot copies reserve
before their factories. Disposal restores backend hooks and releases retained
owners. Snapshots account for independent row/operation/string capacity.

Build, lint, boundaries and 110 focused tests pass. All 144 audit cases / 8,000
exact comparisons retain original native counts and protected failures. All 96
managed source/root page RPC returns prove actual root snapshot ownership before
acknowledgement and dropped page references afterward; Node copies retain complete
original counters. Original WebGL, 69 affected typography tests, 12 provider cases /
60 frames and eight typography fixtures pass. Glyph 1.393665× meets unchanged 1.5
maximum. All 64 exports preserve 768 complete bodies/frames against `e121eef`.

Surface/provider keys, graph/font/checksum/ledger/Node metadata, actual production/
aggregate admission, speed and the full gate remain pending. No milestone acceptance
is claimed. [Evidence](./composition-ce15-root-metadata-results.json).

## Accepted retained independent-surface metadata checkpoint — 2026-10-08

Independent-surface path/full-state keys and original hashes now have explicit
owners. Entries retain those keys across native per-frame scratch cleanup;
duplicate and uncached keys release immediately. Original Map growth, counter/
entry records and restoration envelopes reserve before native producers. Seeding
controls and original graph/op/content/matrix/array containers reserve before
target production. Active/visited Sets, candidates and effect-input arrays admit
capacity before allocation/mutation and release after success, failure or cycles.

Build, lint, boundaries and 114 focused tests pass, including exact canonical
hashes, repeated uncached cleanup, null errors, dependency cycles and quota denial
before restoration. All 144 audit cases / 8,000 exact comparisons preserve original
native count and protected-failure checks. All 96 managed source/root/surface RPC
returns keep actual surface snapshots owned until acknowledgement, then drop page
references with zero owned bytes; complete Node counters stay intact. Original
WebGL, 69 typography tests, 12 provider cases / 60 frames and eight fixtures pass.
Glyph 1.343124× meets unchanged 1.5 maximum. All 64 exports preserve 768 complete
bodies and frames against pushed `c37f797`.

Provider/WebGL keys, evaluated graph/font/checksum/ledger/Node metadata, actual
production/aggregate admission, speed and full-gate acceptance remain pending.
[Evidence](./composition-ce15-surface-metadata-results.json).

## Accepted cache pixel checksum metadata checkpoint — 2026-10-08

Source/root/independent-surface checksums now reserve actual native digest backing,
original hex-building capacity and final SHA256 text before native hashing. Pixel
inputs keep their existing owners and require no new input allocation. Digest
backing detaches after native completion; result text remains admitted through
comparison or complete publish acknowledgement, then releases. Dimension guards,
native digest/hex operators, abort points and original failure reasons stay intact.
Review expanded the temporary arena to 4 KiB, explicitly covering both arrays and
all conservative intermediate string controls. The first native audit exposed
unused owned snapshots accumulating in a protected-failure fixture; immediate
release after its numeric read fixes that leak while retaining its 8 KiB quota,
original reasons/counts and a new before-disposal zero-unused-metadata assertion.

Build, lint, boundaries and 118 focused tests pass. Native SHA256 output matches
an independent Node oracle; borrowed input backing survives quota/null/duplicate-
adoption failures. All 144 audit cases / 8,000 exact comparisons, original protected
checksum/abort cases and 96 managed source/root/surface RPC snapshots pass. Original
WebGL, 69 typography tests, 12 provider cases / 60 frames and eight fixtures pass.
Glyph 1.389886× meets unchanged 1.5 maximum. All 64 exports preserve 768 complete
bodies and frames against pushed `9d7cea9`.

Other checksum text, provider/WebGL/graph/font/ledger/Node metadata, actual production/
aggregate admission, speed and full-gate acceptance remain pending.
[Evidence](./composition-ce15-checksum-metadata-results.json).

## Accepted WebGL definition/isolate metadata checkpoint — 2026-10-08

Original definition identities admit WeakMap/state/entry capacity before creation
or sequence mutation. Isolate IDs, signature arrays/output, Map growth and entry
controls reserve before original draw. Retained entries own their ID/signature
across frame cleanup; duplicate/fallback keys release. Original LRU tuple arrays
remain admitted through actual eviction consumption, then drop their references.
Original reusable between-frame dispose/flush semantics are preserved; separate
final close releases control owners and preserves first discard errors, including
null, while visiting all entries.

Build, lint, boundaries and 130 focused tests pass, including six meaningful
metadata regressions for exact identities, sequence quota, retention/reusable flush,
producer denial, null cleanup and actual LRU consumer lifetime. All 144 audit cases /
8,000 exact comparisons, original protected failures, 96 managed RPC snapshots and
22 native moving/blurred submission frames pass. Original WebGL, 69 typography
tests, 12 provider cases / 60 frames and eight fixtures pass; glyph 1.429766× meets
unchanged 1.5 maximum. All 64 exports preserve 768 complete bodies/frames against
pushed `32c8edb`. Initial typing/lint and intermediate-browser evidence is retained.

Other frame/damage/vector/provider keys, graph/font/checksum/ledger/Node metadata,
actual production/aggregate admission, speed and full-gate acceptance remain pending.
[Evidence](./composition-ce15-webgl-key-metadata-results.json).

## Accepted retained frame-key metadata checkpoint — 2026-10-08

Original WebGL visual keys now have explicit owned output through the exposure
consumer. Comparison keys release immediately after comparison. A successful
stationary frame retains only its first key across scratch cleanup; replacement,
moving exposure, failed draw and preview disposal release the old key. The cache
control reserves 192 declared bytes before construction and clears its references
on disposal. Legacy string keys and structural comparisons retain original behavior.

Build, lint, boundaries and 137 focused tests pass, including seven frame ownership
regressions. The complete 144-case / 8,000-comparison audit, 96 real RPC snapshots,
22 native moving/blurred frames and ten additional stationary native frames pass.
WebGL retains one draw / four exact reuses; both backends have constant admitted
metadata across frames and zero storage/reservations after actual preview disposal.
Original WebGL, 69 typography tests, 12 provider cases / 60 frames and eight fixtures
pass; glyph 1.483363× meets unchanged 1.5 maximum. All 64 exports preserve 768 complete
bodies/frames against pushed `22654d6`. Initial fixture typing and unchanged glyph-timing failures are retained; only the failed timing command was rerun in isolation.

Damage/vector/provider keys, retained graphs, font/checksum/ledger/Node metadata,
actual production/aggregate admission, speed and full-gate acceptance remain pending.
[Evidence](./composition-ce15-frame-key-metadata-results.json).

## Accepted WebGL damage metadata checkpoint — 2026-10-08

The actual damage tracker admits original bounds/map/corner/coordinate/union/header/
layer structures before production using concrete graph-operation counts. Original
native bounds callbacks and operators remain unchanged. Current header/layer keys
retain explicit output owners across frame cleanup; the prior frame stays owned
through comparison and then releases. Changed-bounds pairs and original dirty
copies reserve before creation. The dirty owner stays live through actual drawing;
`endFrame` clears the device clip before releasing it. Reusable reset and final
close clear retained keys/controls, including original null/partial-key failures.
Borrowed geometry retains its original caller ownership.

Build, lint, boundaries and 152 focused tests pass, including original nine damage
cases and six metadata regressions. The complete 144-case / 8,000-comparison audit,
96 actual RPC snapshots, 22 moving/blurred and ten stationary native frames pass.
Original WebGL, 69 typography tests, 12 provider cases / 60 frames and eight fixtures
pass; glyph 1.417335× meets unchanged 1.5 maximum. All 64 exports preserve 768 complete
bodies/frames against pushed `e2659ca`. Both initial test failures are retained.

Vector/provider keys, retained graphs, font/checksum/ledger/Node metadata, actual
production/aggregate admission, speed and full-gate acceptance remain pending.
[Evidence](./composition-ce15-damage-metadata-results.json).

## Accepted vector-cache key/control metadata checkpoint — 2026-10-08

Original native ID/layer-map and signature inputs admit before construction;
complete native output keys have explicit owners. Map capacity grows before
insertion and original Raster/owner controls admit before the native paint
producer. Retained entries own canonical ID/signature text across scratch cleanup;
hits release duplicates and reinsert the actual retained ID owner. Failed paint,
original oversized policy and complete final teardown release temporary/retained
key/control owners. Completed retained rasters survive original drawing failures.
Native painting/order/overlap and original 128MiB RGBA cache policy remain unchanged.

Build, lint, boundaries and 161 focused tests pass, including six vector metadata
regressions and three original region cases. The complete 144-case / 8,000-comparison
audit, 96 actual RPC snapshots, 22 moving/blurred and ten stationary native frames
pass. Original WebGL, 69 typography tests, 12 provider cases / 60 frames and eight
fixtures pass; glyph 1.405493× meets unchanged 1.5 maximum. All 64 exports preserve
768 complete bodies/frames against pushed `5e5f115`. Initial fixture typing and
byte-counter admission review evidence is retained.

Vector geometry/RasterPart/recording metadata, provider keys, retained graphs,
font/checksum/ledger/Node metadata, actual production/aggregate admission, speed
and full-gate acceptance remain pending.
[Evidence](./composition-ce15-vector-key-metadata-results.json).

## Accepted raster-part and paint-call metadata checkpoint — 2026-10-08

The actual RasterPart array reserves before construction (32-byte header), then
grows by 168 per part before original GPU production, part records and independent
bounds copies. Retained entries own this actual array through frame cleanup;
teardown releases native surfaces and clears part references. Original six-slot
call arrays reserve 80 bytes before creation and clear after consumption. Active
recording's original shallow pixel-surface copy admits each own field before
spread, borrows the original pixels/contexts, and drops its own references after
painting/group rendering/upload. Computed geometry, dimensions, source offsets,
native pixel/shader operators, grouping and original draw order remain unchanged.

Build, lint, boundaries and 165 focused tests pass, including four actual part/call
producer regressions for retention/independent geometry, scratch cleanup after
container denial, pre-GPU record denial and original null upload failure. The
complete 144-case / 8,000-comparison audit, 96 actual RPC snapshots, 22 moving/blurred
and ten stationary native frames pass. Original WebGL, 69 typography tests,
12 provider cases / 60 frames and eight fixtures pass; glyph 1.421648× meets unchanged
1.5 maximum. All 64 exports preserve 768 complete bodies/frames against pushed
`03184b5`. First focused/native attempts pass; no new failure is discarded.

Vector extent/region/recording and other WebGL bounds/device/pool/shader/paint
controls, provider keys, retained graphs, font/checksum/ledger/Node metadata, actual
production/aggregate admission, speed and full-gate acceptance remain pending. [Evidence](./composition-ce15-vector-parts-metadata-results.json).

## Accepted vector geometry metadata checkpoint — 2026-10-08

Original root maps, extent matrices/points/corners/coordinate arrays and bounds,
region/union/merge/index/splice/slice/batching structures reserve before creation.
Actual operation/transform counts supply concrete per-producer bounds, including
worst-case merged index copies and overlap slices; original math/native callbacks/
grouping/draw order remain unchanged. The actual backend consumes final bounds
synchronously, makes its original framebuffer-bounds copy, then clears temporary
geometry. Unconsumed results remain frame-scratch-owned; retained RasterPart bounds
stay independent. Quota denial precedes native producers and null consumer failure
releases temporary geometry while preserving completed original cache entries.

Build, lint, boundaries and 169 focused tests pass, including four new geometry
quota/consumer/scratch/null regressions and three original region cases. All 144
audit cases / 8,000 comparisons, 96 actual RPC snapshots, 22 moving/blurred and ten
stationary native frames pass. Original WebGL, 69 typography tests, 12 provider
cases / 60 frames and eight fixtures pass; glyph 1.443902× meets unchanged 1.5 maximum.
All 64 exports preserve 768 complete bodies/frames against pushed `90b1339`.

Recording/replay and other WebGL bounds/device/pool/shader/paint controls, provider
keys, retained graphs, font/checksum/ledger/Node metadata, actual production/
aggregate admission, speed and full-gate acceptance remain pending.
[Evidence](./composition-ce15-vector-geometry-metadata-results.json).

## Accepted framebuffer bounds metadata checkpoint — 2026-10-08

Original weak-map/state/cleanup controls reserve before creation (512 base + 80
per weak-map/cleanup slot pair). Bounds entries/rectangles reserve 160 before
original production, retain across scratch and release after replacement/surface
release/final disposal. Cleanup tracks values without adding strong surface keys;
declarations for vanished weak keys remain conservative until explicit cleanup.
Original inline bounds records, color arrays/temporary views (512), transform
arrays/records (896) and temporary fill/row views (128) admit before creation and
remain owned through original consumers. Original native color/transform/union/
clamping/readback operators and placement remain unchanged.

Build, lint, boundaries and 175 focused tests pass, including six framebuffer
metadata regressions. All 144 audit cases / 8,000 comparisons, 96 actual RPC
snapshots, 22 moving/blurred and ten stationary native frames pass. Original WebGL,
69 typography tests, 12 provider cases / 60 frames and eight fixtures pass; glyph
1.421648× meets unchanged 1.5 maximum. All 64 exports preserve 768 complete bodies/
frames against pushed `3f27971`. First focused/native attempts pass.

Recording/replay, remaining device/pool/shader/paint controls, provider keys,
retained graphs, font/checksum/pixel-view/ledger/Node metadata, actual production/
aggregate admission, speed and full-gate acceptance remain pending.
[Evidence](./composition-ce15-webgl-bounds-metadata-results.json).

## Accepted readback metadata checkpoint — 2026-10-08

Actual state (192), original clamped bounds (64), retained pending holder/union
(128) and temporary borrowed row views (128) reserve before original producers.
Pending rectangles survive scratch until original region/row consumption,
replacement or unknown update. Captured allocator cleanup detaches retained
framebuffer storage after active scope exit and allocator-first disposal.
Original native row order, full-update precedence, 64MiB cache policy, independent
returned slices and pixel ownership remain unchanged. Two existing pixel-quota
fixtures retain their pixel limits and receive 512 bytes for actual metadata;
six new regressions independently verify metadata quotas and actual cleanup.

Build, lint, boundaries and 181 focused tests pass. The 144-case / 8,000-comparison
audit, 96 actual RPC snapshots, 22 moving/blurred and ten stationary native frames,
original WebGL, 69 typography tests, 12 provider cases / 60 frames and eight
fixtures pass. Glyph 1.455446× meets unchanged 1.5 maximum. All 64 public exports
preserve 768 complete encoded bodies/decoded frames against pushed `7ab58ce`.
Remaining class/helper/ledger and returned pixel-view controls, recording/device/
pool/shader/paint/provider/graph/font/Node metadata, complete production/aggregate
admission, speed and full-gate acceptance remain pending.
[Evidence](./composition-ce15-readback-metadata-results.json).

## Accepted path metadata checkpoint — 2026-10-08

Actual state/current bounds reserve 256 before state creation. Original coordinate
tuples and native matrix reserve 320 + 80 per original point (1..4) before original
argument getters/math/matrix factories. Original input/native point/point box/union
reserve 384 before native transformPoint; admission remains through union
consumption, then temporary arrays/native references clear. Original native call
counts, transform/math/partial update order, conservative arcs/ellipses and unknown
arcTo/nonfinite behavior stay unchanged. Recording setup now releases path and
existing raster scratch on admission/native failure; teardown releases path even
if native restore fails. Remaining recording/Proxy/mark/group/replay/paintBounds
and shared runtime controls remain pending.

Build/lint/boundaries and 188 focused tests pass, including seven path/recording
metadata regressions. All 144 audit cases / 8,000 comparisons, 96 actual RPC
snapshots, 22 moving/blurred and ten stationary native frames pass. Original WebGL,
69 typography tests, 12 provider cases / 60 frames and eight fixtures pass; glyph
1.417476× meets unchanged 1.5. All 64 exports preserve 768 complete encoded bodies/
decoded frames against pushed `970ab69`. First compile's closure narrowing and
missing fixture transforms were repaired; the failed attempt remains recorded.
Production/aggregate admission, authentic speed and complete gate remain pending.
[Evidence](./composition-ce15-path-metadata-results.json).

## Accepted paint-bound and replay metadata checkpoint — 2026-10-08

Selected cleanup controls (256 + 40 per result) and original output rectangle (64)
admit before creation. Original geometry arena (2048) covers local box/metrics/
matrix/corner/input/native point/coordinate-map producers before native calls;
filter match/capture data grows before native regex execution (2176 + 4*filter
length). Actual rectangles survive mark/group/replay consumption until recording
disposal; borrowed fallback retains its original reference. Explicit cleanup
clears the selected Set in managed and unmanaged use. Temporary replay controls
(256 + 8*selected.size) and original conditional native matrix (320) admit before
creation and remain through native setTransform. Native getters/callbacks, exact
text/stroke/filter/shadow/clip geometry and replay state stay unchanged.

Build/lint/boundaries and 196 focused tests pass, including eight new paint-bound/
replay metadata regressions. All 144 audit cases / 8,000 comparisons, 96 actual RPC
snapshots, 22 moving/blurred and ten stationary native frames, original WebGL,
69 typography tests, 12 providers / 60 frames and eight fixtures pass; glyph
1.486755× meets unchanged 1.5 maximum. All 64 exports preserve 768 complete bodies/
frames against pushed `13482c9`. Initial checks passed; final affected checks were
rerun after explicit unmanaged Set cleanup. Remaining recording/Proxy/command/mark/
group/snapshot/prepared clone/argument controls and shared runtime/Node/production
admission, aggregate memory, authentic speed and full gate remain pending.
[Evidence](./composition-ce15-paint-bounds-metadata-results.json).

## Accepted recording-group metadata checkpoint — 2026-10-08

Actual group-result cleanup Set reserves 128 + 40 per result slot before creation.
Original working/output arrays, rows/marks/unions, selected Sets/maps, shadow copies
and iterator/spread controls reserve 512 + 1536 per actual recorded mark before
group factories. This derives from original producers (up to 1000 per mark plus
512 root/control), with existing 64-mark policy unchanged. Working arrays clear
after flatMap; retained capacity becomes 256 + 136 per output group + 128 per
unique selected Set + 40 per selected command + 64 per fresh union bounds. Shared
shadow Set/bounds and borrowed fallback/owned paint rectangles retain one body.
Every actual result array/selected Set survives replay/raster upload and clears
at recording or allocator disposal. Original grouping/clip/shadow/native order,
empty/unsupported behavior and null failures remain unchanged.

Build/lint/boundaries and 202 focused tests pass, including six group admission/
consumer/cleanup regressions. All 144 audit cases / 8,000 comparisons, 96 actual
RPC snapshots, 22 moving/blurred and ten stationary native frames pass. Original
WebGL, 69 typography tests, 12 providers / 60 frames and eight fixtures pass;
glyph 1.495784× meets unchanged 1.5. All 64 exports preserve 768 complete bodies/
frames against pushed `ce72950`. First lint found unused copied fixture type/
counter; removed before final checks. Recording command/mark/argument/clone/Proxy/
snapshot and shared runtime/Node/production admission, aggregate memory, authentic
speed and complete gate remain pending.
[Evidence](./composition-ce15-groups-metadata-results.json).

## Accepted recording command/mark/snapshot checkpoint — 2026-10-08

Actual recording state/command/mark/snapshot arrays/painted Set reserve 512 before
construction. Original marks (104), painted integer entries (40), snapshot slots
(8), property rows (104 + 2*key length) and method/arg/clone rows (136 + 8*args +
2*method length + 192 per native Path2D/matrix clone + 32 + 8*length per array copy)
reserve before original producers. Original snapshot argument copies reserve
96 + 16\*args before slice/spread and remain through consumption. Original native
clone/map/Reflect.apply, callback/property/mark/deferred/group order stays. Actual
owned arrays/Sets/snapshot references clear at disposal, preserving borrowed
inputs. Captured native snapshot release works after scope exit or allocator-first
cleanup; partial native/metadata failure restores capacity and preserves null.

Build/lint/boundaries and 210 focused tests pass, including eight recording
regressions. Real Canvas probe preserves all 3,072 original/replayed RGBA bytes
through source mutation, releases two actual snapshots after scope/allocator exit
and preserves prior owners under one native pixel-quota failure. Complete audit
144/8,000, 96 RPC snapshots, 22 moving/blurred and ten stationary native frames,
original WebGL, 69 typography tests, 12 providers / 60 frames and eight fixtures
pass; glyph 1.416804× meets unchanged 1.5 maximum. All 64 exports preserve 768
complete bodies/frames against pushed `082e38a`. First focused run found an
updated result-quota fixture that permitted production; repaired to the intended
one-byte denial before final focused/native checks. Proxy/rest-call arguments/
method wrappers/controller/common helper and remaining runtime/Node/production/
aggregate/speed/full-gate admission remain pending.
[Evidence](./composition-ce15-recording-metadata-results.json).

## Accepted method call-input checkpoint — 2026-10-08

Original pre-body rest arrays now use borrowed VM call arguments and an explicit
owned dense array. Reserve 128 + 8*argument count + 2*method-name length before
Array.from and String(property), retain the actual copy through original path/
clone/mark/native consumption, then clear and release it in finally. Detached
native target binding, zero function length, nonconstructibility and original
native/query/deferred/partial failure order remain. Five regressions cover quota
before Array.from, detached native calls, producer/native null failures, native
query identity and allocator-first cleanup. Existing selected producer quotas add
the live call arena. A documented local lint exception prevents rest parameters
from restoring pre-admission allocation; global lint remains unchanged.

Build/lint/boundaries and 215 focused tests pass. Complete audit 144/8,000, 96 RPC
snapshots, 22 moving/blurred and ten stationary native frames, two real Canvas
snapshots / 3,072 exact bytes / one protected failure, original WebGL, 69 typography
tests, 12 providers / 60 frames and eight fixtures pass; glyph 1.413681× meets
unchanged 1.5 maximum. All 64 exports retain 768 complete bodies/frames against
pushed `3158c32`. Two lint failures are retained before passing compile3. Method
wrappers, Proxy/handler/controller/common helpers and variable query results,
remaining runtime/Node/production/aggregate admission, speed and full gate are
pending. [Evidence](./composition-ce15-call-arguments-metadata-results.json).

## Accepted recording controller/wrapper checkpoint — 2026-10-08

Initial recording ownership is 2,432: prior state 512, eleven closures 1,408,
shared scope 256, Proxy/handler 64 each and returned controller 128. Reserve before
these original factories. Each original fresh method lookup grows actual owner
256 before wrapper construction (function 128, bindings 64, temporary method
object 40, margin 24); retain this capacity through recording disposal even for
early-GC wrappers. Original Reflect.get runs once; nonfunctions do not charge.
Fresh identity, zero function length, nonconstructibility, detached native binding
and original render/callback/property/deferred/clone/native order remain. Late
Proxy/controller failure releases native save and prior actual owners, preserving
the original error over cleanup failure. Six regressions cover these boundaries.

Build/lint/boundaries and 221 focused tests pass. First native audit found the
snapshot fixture's baseline omitted the new failed-call wrapper; final fixture
creates that actual wrapper before baseline and invokes it under the identical
native pixel quota. Failed evidence is retained. Final complete audit 144/8,000,
96 RPC snapshots, 22 moving/blurred and ten stationary native frames, two real
snapshots / 3,072 exact bytes / one protected failure, original WebGL, 69 typography
tests and provider fixtures pass. Glyph 1.424679× meets unchanged 1.5 maximum;
64 exports preserve 768 complete bodies/frames against pushed `3d94d35`. Variable
query-result/helper and remaining runtime/Node/production/aggregate admission,
speed and full gate remain pending.
[Evidence](./composition-ce15-recording-controls-metadata-results.json).

## Accepted device state/native surface checkpoint — 2026-10-08

Actual device state/Map/Set/context-options/VAO controls reserve 1,024 before their
original producers. Actual native Surface/texture/framebuffer/Surface construction
reserves metadata control arena 1,024 and original Set slot 40 before production;
original pixel backing admission and all native parameters/clear/operators remain.
Original pool reuse keeps the same charged native Surface. Captured actual owners
release texture/framebuffer/controls after scope exit or allocator-first cleanup;
Set slot history stays conservatively charged until device disposal. Final cleanup
visits all actual handles and clears pooled arrays/maps/sets even when native
cleanup throws null. Incomplete native construction completes framebuffer cleanup
even if texture destruction fails, preserving the original null.

Build/lint/boundaries and 232 focused tests pass, including eleven device regressions.
First 230-test pass was followed by review repair and tenth failure regression,
then compile2. First native audit caught premature texture deletion at scratch cleanup;
retain actual device/Surface controls and add eleventh regression, then final
compile3 and native attempt2. Failed native attempt1 is retained. Complete audit 144/8,000, 96 RPC snapshots, 22 moving/blurred
and ten stationary native frames, actual snapshots, original WebGL, 69 typography
tests and provider fixtures pass. Glyph 1.384365× meets unchanged 1.5 maximum;
64 exports preserve 768 complete bodies/frames against pushed `0b73555`. Dynamic
pool/shader/uniform/dirty/solid/clip/pass/read/swap metadata, helper/remaining runtime/
Node/production/aggregate admission, speed and full gate remain pending.
[Evidence](./composition-ce15-device-metadata-results.json).

## Accepted GPU pool key/array checkpoint — 2026-10-08

Reserve 512 before the original width/height/flags key template and optional empty
pool array. Actual typed numeric/boolean inputs bound generated UTF16 output.
Retain the actual key holder through original lookup/native creation/clear. First
original insertion keeps that same canonical holder/key/array: resident 256 +
2*key length + 8*maximum actual live slots, plus Map slot 40 before insertion.
Grow before push; preserve original pop/push order, sixteen-surface and 128MiB
pixel-byte policies. Canonical key/array capacity remains stable on reuse and
retained across scratch; final disposal deletes Map references and clears actual
owned key/array data. Failed lookup/slot quota preserves prior owners and null,
frees attempted temporary storage, and permits original retry.

Build/lint/boundaries and 238 focused tests pass, including six pool regressions.
Existing selected Surface quota includes the live lookup arena so the same native
producer remains exactly one byte short; frozen/pixel/timing limits stay unchanged.
Complete audit 144/8,000, 96 RPC snapshots, 22 moving/blurred and ten stationary
native frames, native snapshots, original WebGL, 69 typography tests and provider
fixtures pass. Glyph 1.427885× meets unchanged 1.5 maximum. All 64 exports preserve
768 complete bodies/frames against pushed `6ccd94c`. Shader/program/uniform/dirty/
solid/clip/pass/read/swap metadata, helper/remaining runtime/Node/production/aggregate
admission, speed and full gate remain pending.
[Evidence](./composition-ce15-pool-metadata-results.json).

## Accepted GPU pass temporary checkpoint — 2026-10-08

After unchanged shader/program/feedback checks, reserve 512 + 256*actual input
count + 64*actual own enumerable uniform-field count before original Set/sampler/
Object.entries producers. Original plain-key enumeration does not read values;
original uniform getters run once. Hold actual Set, tuples and outer array through
screen resolution, native textures/samplers, scalar/vector/matrix uploads and GPU
draw/scissor consumers, then clear actual owned references in finally. Preserve
original order, sampler keys, borrowed vector/matrix identity, native null failures
and completion counter. Five regressions cover denial, exact native inputs/getters,
actual live/cleared containers, original null getter/retry and draw/scissor failure.

Build/lint/boundaries and 243 focused tests pass. Complete audit 144/8,000, 96 RPC
snapshots, 22 moving/blurred and ten stationary native frames, native snapshots,
original WebGL, 69 typography tests and provider fixtures pass; glyph 1.384375×
meets unchanged 1.5 maximum. All 64 exports preserve 768 complete bodies/frames
against pushed `6edb907`. Shader/program/compile/diagnostic/uniform-map/dirty/solid/
clip/read/swap metadata, helper/remaining runtime/Node/production/aggregate
admission, speed and full gate remain pending.
[Evidence](./composition-ce15-pass-metadata-results.json).

## Accepted GPU row-view/swap checkpoint — 2026-10-08

Reserve 128 before each original readback subarray view. Hold actual alias through
original row.set, then clear/release before unchanged copyWithin/second row.set;
borrow its existing parent backing without duplicate pixel charge. Original native
read count, row order, top-down byte sequence and pixel peak remain. After original
swap validation, reserve 256 before both original two-element native handle tuple
arrays, retain through unchanged destructuring assignments, then clear actual
references. Original handle identity/native cleanup/failure order stays. Six
regressions cover before-producer denial, native bytes/peak, null failures/retry,
before-getter swap denial and exact identity/native disposal.

Build/lint/boundaries and 249 focused tests pass. Complete audit 144/8,000, 96 RPC
snapshots, 22 moving/blurred and ten stationary native frames, native snapshots,
original WebGL, 69 typography tests and provider fixtures pass; glyph 1.424242×
meets unchanged 1.5 maximum. All 64 exports preserve 768 complete bodies/frames
against pushed `c648f28`. Primary returned view, shader/program/uniform/dirty/solid/
clip and helper/remaining runtime/Node/production/aggregate admission, speed and
full gate remain pending.
[Evidence](./composition-ce15-device-views-metadata-results.json).

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
