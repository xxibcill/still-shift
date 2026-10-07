# CE6-P independently owned sparse output research

Date: **2026-10-06**. Examined runtime: `composition-webgl2-0.42.0` and
the retained [native cost evidence](./composition-ce6p-cost-results.json).
This report proposes a bounded diagnostic. It does not implement production
code or establish a speedup. No benchmark, build, or test was run for it.

## Decision

**Go for one isolated diagnostic of fresh known-background output, paired with
known-clear backdrop paint. No-go for claiming the output change alone can
close native 2×.** The source identifies work that can be removed without
borrowing caller memory: reading the complete retained CPU image merely to
copy it into a new output. A constant fill can replace that source read when
every pixel outside current painted bounds is exactly known. Whether the
replacement is faster depends on allocation, initialization, fill, region
read, row copying, and garbage collection in the pinned browser.

The mechanism is sufficiently different from the rejected readback experiments
to investigate once. It is not a general solution to all 119 timing misses.
The original 195-case audit and native 2× requirement remain unchanged.

## Current path and proposed difference

At 1920×1080, one RGBA output contains **8,294,400 bytes**. The native diagnostic
has a nominal 400×300 moving solid, or 480,000 bytes before conservative bounds
padding. Its background is the exact byte color `#26313b`.

[`WebglReadback.read`](../packages/renderer-core/src/composition/render/webgl-readback.ts)
currently reads changed regions, patches a full retained CPU image, and returns
`this.pixels.slice()` on every call. A repeated read without drawing performs
only the final owned copy. Initial/full reads can already use
[`WebglBounds.read`](../packages/renderer-core/src/composition/render/webgl-bounds.ts):
it allocates a complete result, fills the background, reads the painted bounds,
and scatters those pixels. The readback cache then retains that result and
copies it again for the caller.

The candidate would use equivalent sparse reconstruction **as the final owned
output** whenever its stricter eligibility proof holds. It would allocate a
fresh result, fill it with exact clear bytes, read current painted coverage,
copy those rows directly into the result, and return it. The final output is
never retained as mutable renderer state. Any old internal snapshot must be
invalidated or correctly maintained before a later fallback uses it.

This replaces a full-image source read plus destination write with a
constant-value destination fill; both paths still allocate and write a full
output. It also removes the persistent full snapshot for this path. It does
**not** eliminate full-frame ownership allocation, deliver a zero-copy frame,
or make fill cost zero. Reading current coverage can cost more than reading
only damage when a large portion of the scene is static.

## What JavaScript and browser sources establish

ECMAScript defines typed-array `fill` as setting elements and same-type `slice`
as creating a result and preserving the source's byte encoding. A fresh ordinary
array buffer has zero-initialized contents. These are observable semantics,
not mandates for a particular number of physical memory passes or a relative
performance guarantee. The new output can satisfy independent ownership by
construction. [Typed-array operations](https://tc39.es/ecma262/2024/multipage/indexed-collections.html#sec-%typedarray%.prototype.slice),
[byte-data-block initialization](https://tc39.es/ecma262/2024/multipage/ecmascript-data-types-and-values.html#sec-createbytedatablock).

Upstream V8's compatible ordinary-array `slice` fast path calls native
`memmove`; it is already a bulk operation, not a JavaScript byte loop.
Another copying spelling does not establish an advantage by itself; the
copy-constructor appendix below identifies a distinct initialization request
and the allocator evidence that limits its expected benefit.
[V8 `typed-array-slice.tq`](https://raw.githubusercontent.com/v8/v8/main/src/builtins/typed-array-slice.tq).

V8's typed-array fill dispatch converts the scalar and delegates to the
elements accessor. That accessor uses `memset` for zero/all-one integral
values and `std::fill` otherwise. Our opaque `#26313b` word is not a zero or
all-one pattern, so the general fill branch is the relevant hypothesis.
Its compiler may optimize the stores; the inspected source does not establish
SIMD width, bandwidth, or an advantage over `memmove`.
[Fill dispatch](https://raw.githubusercontent.com/v8/v8/main/src/builtins/builtins-typed-array.cc),
[typed-array `FillImpl`](https://raw.githubusercontent.com/v8/v8/main/src/objects/elements.cc).

In the inspected V8 creation code, constructing by length requests initialized
storage. The ordinary species-by-length route used by `slice` also reaches that
constructor. Thus allocation/initialization must be included in both measured
controls; neither should be modeled as an uninitialized allocation available
to application JavaScript. OS zero pages and allocator reuse can affect the
physical cost. [V8 typed-array creation](https://raw.githubusercontent.com/v8/v8/main/src/builtins/typed-array-createtypedarray.tq).

WebGL `readPixels` returns the selected framebuffer rectangle as of prior
drawing commands. Existing `preserveDrawingBuffer:true` allows reading current
painted coverage after a repeated read or partial repaint. This does not remove
the synchronization required by a changed region; the candidate still reads
GPU-produced foreground bytes. [WebGL read operations and drawing-buffer
semantics](https://registry.khronos.org/webgl/specs/latest/1.0/#5.14.12).

The V8 URLs are moving upstream `main`, inspected on the date above. They
explain plausible mechanisms, **not the verified V8 revision embedded in
Chromium 151.0.7922.34**. The existing pinned browser/fingerprint and launch
flags must be retained for the diagnostic.

## This is not a repeat of the rejected experiments

| Earlier experiment                                        | Difference in this proposal                                                                                                                                                |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reusing incremental temporary read buffers; mixed results | Temporary allocation was changed but the full cached-image copy remained. This candidate changes how the final owned image is produced.                                    |
| Disjoint-damage reads; slower                             | This proposal does not split reads into many rectangles. It starts with one current painted-bounds rectangle and changes CPU reconstruction.                               |
| GPU-flipped readback; slower                              | No new framebuffer, blit, or GPU flip is required. Native bottom-up rows can be copied once into the final top-down result, as the existing incremental code already does. |
| Explicit export FBO; within variation                     | The output framebuffer and read API stay the same.                                                                                                                         |
| PBO/fence + `getBufferSubData`; approximately 17× slower  | This uses ordinary synchronous `readPixels`, with the same public completion contract.                                                                                     |

Historical evidence is in the [CE6 research follow-up](./composition-ce6-performance-results.json),
[CE4b feasibility](./composition-ce4b-feasibility.md), and
[CE4b incremental readback record](./composition-engine-plan.md#ce4b-single-pass-incremental-readback-2026-10-03).
The novelty is limited: sparse background reconstruction already exists. The
new question is whether applying it directly to each owned result beats
retaining and copying a full snapshot for this specific workload.

## Costed feasibility

These values summarize existing observations, not new measurements:

| Native observation, ms/frame               | Pinned | Hardware |
| ------------------------------------------ | -----: | -------: |
| Uninstrumented Canvas total                |   1.23 |     0.92 |
| Uninstrumented WebGL total                 |   1.61 |     1.62 |
| Required half-Canvas budget                |  0.615 |    0.460 |
| Synchronized instrumented read stage       |   0.72 |     0.78 |
| Median slice cost within synchronized runs |   0.53 |     0.50 |
| Separate repeated cached-owned-read median |   0.50 |     0.70 |

Slice medians above were calculated from the six already-recorded synchronized
runs, dividing each nested slice counter by its five calls. The hardware
0.70-ms cached-owned control is a separate measurement with allocation/GC and
call overhead; it is **not** a 0.70-ms independently removable slice inside the
0.78-ms read stage. Hook times are inclusive and must not be summed.

Let `F` be fresh allocation plus background fill, `Q` the current-coverage GPU
read plus direct row scatter, and `P` the remaining rendering/queue cost after
the optional known-clear paint improvement. The combined mechanism must satisfy
`P + Q + F <= half-Canvas budget` in the uninstrumented public measurement.
For output-only break-even, its `F + Q` must beat the old snapshot-update plus
slice cost; that comparison includes any difference between painted area and
damaged area.

Removing the entire observed slice cost for free would still leave roughly
**1.08 ms pinned / 1.12 ms hardware** from the uninstrumented totals, above
the respective native targets. These mixed instrumentation estimates are
directional, not exact subtractions. They rule out a convincing output-only
closure argument from the current evidence.

An aggressively optimistic screen of the synchronized stages leaves about
`0.72 − 0.53 = 0.19 ms` pinned and `0.78 − 0.50 = 0.28 ms` hardware for
non-slice read work. If that work stayed unchanged, the budgets for **all new
allocation/fill and remaining paint/queue work together** would be approximately
**0.425 ms pinned / 0.180 ms hardware**. These are proposal screening numbers,
not measured floors: stage instrumentation, region changes, synchronization
and allocator interactions can change them. The hardware margin is especially
tight. A plan relying on zero fill/allocation cost is a no-go.

## Coupling with known-clear backdrop paint

[`WebglDevice.solidColor`](../packages/renderer-core/src/composition/render/webgl-device.ts)
already records exact byte colors only over the freshly cleared screen region;
ordinary screen passes invalidate that information. A primitive paint whose
active bounds are completely inside that proven region could use those bytes
as the shader's backdrop instead of `copyRegion`, preserving the existing
integer recurrence. The existing disjoint-particle/effect uses of this metadata
do not automatically optimize the native one-solid paint.

The output proof and paint proof are different. “Outside current painted
bounds is clear” permits sparse output reconstruction. “Every pixel of this
paint's backdrop is freshly known clear” permits removing its backdrop copy.
An exact root clear color by itself does not prove the latter after another
layer has drawn. Capture eligibility before the paint invalidates the solid
metadata. Unknown, overlapping, effect-dependent or partial-clear backdrops
retain the original copy path.

This paired change has a causal route to reducing both memory work and queued
GPU work. No evidence assigns the entire 0.70/0.59-ms barrier to the backdrop
copy, so its elimination must not be credited with that whole amount.

## Correctness obligations for the diagnostic

1. Require the opaque root and **exact** clear bytes, using the stricter
   `exactClearColor` eligibility rather than the rounded `clearColor` value.
   Keep the background unchanged in the initial prototype. Fractional,
   untrusted, changed or unavailable clear metadata uses the original path.
2. Read bounds describing **all current non-background coverage**, including
   unchanged content, not merely frame damage. Verify metadata remains complete
   when root painting is clipped or skipped. Unknown coverage, effects and
   exposure accumulation must conservatively fall back until proven.
3. Assemble native bottom-up rows directly into the final top-down array once.
   Pack the fill word through byte and `Uint32Array` views consistently; do not
   hard-code a host-endian integer. Preserve opaque alpha 255.
4. Return a different buffer on every call. Mutating any old returned array,
   or reading twice without rendering, must never change later output or
   renderer state. Reverse/random seeks and repeated exports retain exact bytes.
5. A later fallback must not consult an obsolete retained snapshot. Invalidate
   it when bypassed, or prove its pending-damage ledger covers every intervening
   mutation. Interrupted rendering, resizing and disposal must invalidate the
   fast-path proof appropriately.
6. Empty, boundary-touching, dense and offscreen coverage are explicit controls.
   Initially exclude dense coverage; a static large scene with tiny damage can
   favor the current cache. Do not use history-dependent color/sampling guesses.

## One bounded diagnostic, with an explicit stop

Wait until the running full gate has ended and an uncontended timing interval
exists. Keep production unchanged; use immutable source overlays for four
modes: baseline, owned reconstruction only, known-clear paint only, and both.
This small factorial comparison identifies the two effects and their
interaction, rather than crediting all savings to one change.

First establish byte/ownership correctness on the existing native payload,
including old-buffer mutation, repeated reads, forward/reverse/random frames,
and the fallback boundaries above. Measure allocation+fill versus allocation+
slice separately using the actual background and output size; consume the
outputs and retain outliers/GC effects. That control is attribution, not
acceptance. Do not omit output allocation from either side.

Then use the same native diagnostic sequence: frame 20 setup, 21–23 warm,
24–28 measured, alternating traversal order. Include uninstrumented complete
`renderFrame + readPixels` results and one separate instrumented attribution
pass. The small sequence decides whether a larger test is warranted; it cannot
close native acceptance. Retain baseline/candidate bookends and every failed
or contended attempt. Do not time this concurrently with another workload.

**Stop** if byte/ownership proof fails, eligibility excludes the target,
reconstruction does not beat the original output path beyond observed drift,
or the measured combined remaining cost still has no credible route to the
unchanged half-Canvas budget. A reproducible narrower improvement can be
reported as such; it must not be called native closure. Only a justified
candidate advances to the preserved full native method and subsequent full
family/local verification. Do not widen the experiment into another readback
API search if this mechanism fails.

## Appendix: conditional direct-solid hypothesis (2026-10-06)

**Source-backed CPU hypothesis; not a selected optimization or a speed claim.**
Consider this only if the combined reconstruction/known-clear diagnostic misses
and its remaining cost still gives Canvas preparation/upload enough significance
to justify another candidate. Direct GPU generation of the prepared solid's
bytes could remove Canvas preparation and the source upload. It retains GPU
drawing, synchronous foreground readback and full owned-output allocation/fill.
The earlier paint-only cost rejection still applies to the original output path.

### Source identity and execution route

The official [Chromium 151.0.7922.34 DEPS](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/DEPS)
identifies Skia `0208108c7aed5f4e0faa525cbba52c238005a1ef`, V8
`f479186c16abdb6fa05539fe957bb84deee830df`, ANGLE
`6dab7c7e742b528fd52233d3cc926e61b1e7d70d`, and SwiftShader
`5b0479bd2d15058aaa9eb490e364f920ff824a8c`. This narrows the earlier revision
uncertainty. Initial web-tool retrieval of Skia files at that revision failed.
The table below records the initial upstream `main` reading on **2026-10-06**;
the later **pinned Skia route** appendix records successful exact-revision source
retrieval and strengthens the route analysis. Source inspection still does not
replace a prepared-byte comparison against the browser binary.

The repository's [`render-browser.ts`](../packages/execution-runtime/src/render-browser.ts)
explicitly preserves CPU Canvas with `--disable-gpu` in the pinned profile;
WebGL remains SwiftShader. Forcing Canvas through a different raster backend
would change the reference and is outside this proposal. On hardware,
[`webgl-vectors.ts`](../packages/renderer-core/src/composition/render/webgl-vectors.ts)
does not force ordinary solids into software preparation. Hardware equivalence
therefore needs separate proof. Existing hardware bytes must remain unchanged;
the prior echo exception authorizes no solid-output differences.

| Primary implementation source                                                                                                                                                                                                                                                                          | What it establishes; limit                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Blink `CanvasStyle::ApplyColorToFlags`](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/modules/canvas/canvas2d/canvas_style.h)                                                                                                                                   | Solid style alpha is multiplied by floating global alpha before becoming paint color. Do not borrow the separate image-alpha conversion rule.                |
| [Skia `Draw::drawRect`](https://raw.githubusercontent.com/google/skia/main/src/core/SkDraw.cpp)                                                                                                                                                                                                        | Rect-preserving fill transforms without path/mask effects can reach CPU `AntiFillRect`; other geometry can become a path.                                    |
| [Skia `SkScan.h`](https://raw.githubusercontent.com/google/skia/main/src/core/SkScan.h), [`SkFixed.h`](https://raw.githubusercontent.com/google/skia/main/include/private/SkFixed.h)                                                                                                                   | Device float edges become 16.16 fixed coordinates before rectangle coverage generation. Float conversion and transform order matter.                         |
| [Skia `SkScan_Antihair.cpp`](https://raw.githubusercontent.com/google/skia/main/src/core/SkScan_Antihair.cpp)                                                                                                                                                                                          | `AntiFillRect` has a concrete 24.8 rectangle coverage rule, distinct from the file's hairline rules.                                                         |
| [Skia blitter selection](https://raw.githubusercontent.com/google/skia/main/src/core/SkBlitter.cpp)                                                                                                                                                                                                    | Legacy byte blitting depends on target type/color space, paint, clip and build configuration. CPU Canvas alone does not prove this exact subpath.            |
| [Skia ARGB32 blitter](https://raw.githubusercontent.com/google/skia/main/src/core/SkBlitter_ARGB32.cpp), [color arithmetic](https://raw.githubusercontent.com/google/skia/main/src/core/SkColorPriv.h), [rounding helper](https://raw.githubusercontent.com/google/skia/main/include/private/SkMath.h) | Premultiplication and coverage use separate integer rounding steps.                                                                                          |
| [Ganesh `FillRectOp`](https://raw.githubusercontent.com/google/skia/main/src/gpu/ganesh/ops/FillRectOp.cpp), [`QuadPerEdgeAA`](https://raw.githubusercontent.com/google/skia/main/src/gpu/ganesh/ops/QuadPerEdgeAA.cpp)                                                                                | GPU rectangles can use coverage-AA geometry with half-pixel inset/outset ramps. This is not evidence that CPU fixed-grid arithmetic matches hardware Canvas. |

### Narrow arithmetic worth proving

For a CPU AA rectangle with **integer top/bottom, width greater than one pixel,
positive in-range device coordinates and no clipping edge**, the inspected
scan converter derives each horizontal fixed edge as
`q = (SkScalarToFixed(edge) + 128) >> 8`. `SkScalarToFixed` multiplies the actual
device float by 65536 and converts to integer; preserve those conversion steps
instead of rounding the original JavaScript double directly. Interior coverage
is 255; fractional left coverage is `256 - (qLeft & 255)`, and fractional right
coverage is `qRight & 255`. Exactly integral boundaries contribute no outside
edge column. These statements derive from `AntiFillRect`/`antifilldot8` above.
Subpixel-width rectangles and fractional top/bottom have additional branches,
including one-pixel biases and corner products; initially exclude them.

For the **legacy ARGB32 route**, let `P` be the premultiplied byte color obtained
from `paint.getColor()`. Each RGB channel uses rounded multiplication by its
quantized alpha: with `t = channel * alpha + 128`, the helper returns
`(t + (t >> 8)) >> 8`. The vertical-edge blitter skips zero coverage; otherwise
its source is `S = floor(P * (coverage + 1) / 256)` per channel. Full coverage
keeps `P`. Compositing then uses the existing primitive recurrence
`S + floor(D * (256 - S.alpha) / 256)`. Combining opacity and coverage into one
floating multiply changes the prescribed intermediate rounding.

Under that route, the native opaque `#d87047` at opacity `0.6` predicts interior
premultiplied source `[130, 67, 43, 153]`. This is a **derived prediction**, not a
new observed pixel result. Compare against the prepared texture bytes as well
as final output: Canvas `getImageData` exposes unpremultiplied bytes and can
introduce a round trip that is not the upload's source representation.
[Canvas pixel manipulation and premultiplied-alpha semantics](https://html.spec.whatwg.org/multipage/canvas.html#pixel-manipulation).

The native 400×300 rectangle has integer y/height but moving fractional x
(`100 + 1300 * frame / 59` in the payload). Integer-position-only eligibility
would therefore miss most target frames. Restrict a prospective first proof
to a single solid, ordinary source-over, no filters/masks/mattes/AA clips,
an exact known backdrop, and the native translation geometry. Preserve the
existing transform sequence; the repository has already observed differences
when replacing Canvas concatenation with one combined matrix. Do not silently
extend this derivation to overlapping batches or floating accumulation targets.

### Relationship to rejected work and the next decision

The [earlier image sampler experiments](./composition-engine-plan.md) failed
at rare 1/16 sampling boundaries. That is negative evidence against guessed
image arithmetic, not a proof that CPU rectangle coverage cannot be reproduced.
This proposal avoids image sampling. It also retains explicit integer
compositing, so it does not repeat the rejected fixed-function primitive blend.
It removes a different operation from scratch reuse, disjoint damage or GPU
readback flipping. None of those distinctions establishes a measured gain.

**Go only for a bounded correctness derivation if the combined timing result
justifies it; no-go for production or another timing loop from these sources
alone.** First reconcile the pinned Skia implementation/build selection and
compare source-derived predictions across native fractional phases, near-grid
boundaries, opacity rounding and fallback cases. Both profiles must preserve
their current output. A proven pinned-only route could leave hardware on its
existing preparation path, but would not close the hardware native gate.
Do not change browser flags to manufacture agreement.

If correctness succeeds, cost the incremental removal against the **new combined
path**, not the old 1.61/1.62 ms totals. Nominal source content is only 120,000
pixels (480,000 RGBA bytes), before preparation/bounds overhead; it is not
another 8,294,400-byte output copy. Attribute actual preparation/upload and
queued GPU work rather than assigning the whole synchronization barrier to
the upload. Stop if unchanged output/readback already exceeds half-Canvas, or
if the removable stages cannot cover the remaining gap with credible margin.
The strict 195-case audit and complete native 2× acceptance remain required.

## Appendix: same-type copy construction and initialization (2026-10-06)

**A real V8 allocation-path distinction, but no-go for assuming it removes an
8.294 MB initialization pass.** The tagged V8 constructor source was retrievable
on this follow-up. Chromium's upstream allocator supplies contrary evidence
to that physical-cost assumption. This is research, not an implemented or
timed candidate; the armed diagnostic and production paths remain untouched.

### Primary evidence and revision limits

| Source inspected on 2026-10-06                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Established behavior                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [V8 creation at `f479186c16abdb6fa05539fe957bb84deee830df`](https://raw.githubusercontent.com/v8/v8/f479186c16abdb6fa05539fe957bb84deee830df/src/builtins/typed-array-createtypedarray.tq)                                                                                                                                                                                                                                                                                                                                | Typed-source construction reaches `ConstructByArrayLike`, requests `initialize = false`, and copies ordinary same-kind elements using `CallCMemcpy`. Numeric-length construction requests `initialize = true`; the default species-by-length path invokes it.             |
| [V8 backing store at the same revision](https://raw.githubusercontent.com/v8/v8/f479186c16abdb6fa05539fe957bb84deee830df/src/objects/backing-store.cc)                                                                                                                                                                                                                                                                                                                                                                    | External backing-store allocation forwards the initialization choice to the embedder's `AllocateUninitialized` or `Allocate`. V8 does not thereby promise physically uncleared pages.                                                                                     |
| [V8 slice, upstream `main`](https://raw.githubusercontent.com/v8/v8/main/src/builtins/typed-array-slice.tq), [ArrayBuffer builtins, upstream `main`](https://raw.githubusercontent.com/v8/v8/main/src/builtins/builtins-arraybuffer.cc)                                                                                                                                                                                                                                                                                   | Slice requests a species result by length and uses native `memmove` for its ordinary compatible fast path. The internal no-initialization constructor requires every byte to be initialized before exposure. These two files were not retrievable at the pinned revision. |
| [Blink V8 allocator, upstream `main`](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/bindings/core/v8/v8_initializer.cc), [ArrayBufferContents](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/typed_arrays/array_buffer/array_buffer_contents.cc)                                                                                                                                                                                         | Blink installs its ArrayBuffer allocator and forwards initialized/uninitialized allocation to PartitionAlloc with/without `kZeroFill`.                                                                                                                                    |
| [PartitionAlloc bucket cutoff, upstream `main`](https://raw.githubusercontent.com/chromium/chromium/main/base/allocator/partition_allocator/src/partition_alloc/bucket_lookup.h), [direct mapping](https://raw.githubusercontent.com/chromium/chromium/main/base/allocator/partition_allocator/src/partition_alloc/partition_bucket.cc), [final initialization guard](https://raw.githubusercontent.com/chromium/chromium/main/base/allocator/partition_allocator/src/partition_alloc/internal/partition_root_internal.h) | Maximum bucket size is 983,040 bytes. Direct-mapped allocation marks its pages already zeroed. The ordinary zero-fill branch calls `memset` only when that flag is false.                                                                                                 |

The pinned V8 identity comes from Chromium's DEPS cited in the preceding
appendix. It verifies the constructor and backing-store mechanism at that
revision. The Blink/PartitionAlloc chain above is **upstream evidence**, not a
verified build trace of Chromium 151.0.7922.34; tagged allocator retrieval
failed. Its concrete implication is conditional: with this allocator route,
an 8,294,400-byte allocation exceeds the bucket cutoff, receives already-zeroed
pages, and avoids a separate allocator `memset` even when zero-fill was
requested. Therefore removing the request need not remove any full-frame
write. Page allocation, first writes, copying and reclamation still cost work.
This narrows the hypothesis without proving identical elapsed performance.

### Ownership and two possible uses

For an ordinary attached, fixed-length, non-shared `Uint8ClampedArray` source,
`new Uint8ClampedArray(source)` creates independent storage and copies its
bytes. The same-element-type specification path uses `CloneArrayBuffer`.
Passing `source.buffer` instead creates another view of existing storage and
does **not** meet ownership requirements. Restrict any control to the internal
ordinary source and standard constructor; a different typed-array element
kind is outside the identified native same-kind copy path.
[ECMAScript typed-source and buffer-source initialization](https://tc39.es/ecma262/2024/multipage/indexed-collections.html#sec-initializetypedarrayfromtypedarray).

Two applications are semantically plausible, with different memory traffic:

- **Cached snapshot:** copy-construct the complete retained image. This changes
  its allocation request while retaining one full source read and one full
  destination write. It does not remove the existing snapshot or region update.
- **Private exact-clear template:** copy-construct a private, never-mutated
  full background image, then scatter GPU-read current foreground rows into
  the new result. This retains the earlier clear-background proof and invalidation
  rules, but substitutes a full template read plus copy for constant fill.
  It adds an 8,294,400-byte persistent template per native surface/configuration
  and requires budget/lifecycle accounting. Rebuild it when size or clear bytes
  change. Immutability here is enforced by renderer ownership, not caller trust.

Neither use loans the caller renderer storage. Neither makes the full owned
output allocation disappear. The template must not be patched after copying;
only the newly created result receives foreground pixels. This differs from
rejected scratch-read-buffer reuse in what it targets, but that distinction
is not evidence of speed. A native `memcpy` versus `memmove` call alone also
does not establish a bandwidth advantage.

### Cost screen and decision

The existing synchronized nested slice medians are **0.53 ms pinned / 0.50 ms
hardware**, including allocation and copying. Any avoided initialization is
an unknown subset of that work and may be zero under the allocator chain
above. Even granting the entire slice for free leaves the earlier directional
**1.08 / 1.12 ms** totals, above **0.615 / 0.460 ms** native budgets. Thus
copy-constructor substitution alone has no credible closure argument from
these observations. These are the prior measurements, not new results, and
must not be subtracted from an unmeasured combined candidate as exact stages.

**No-go for selecting another timing experiment on an asserted extra zeroing
pass.** If a later combined result leaves a small, measured ownership gap,
same-type construction could be an isolated control with byte/ownership proof
and allocation-inclusive comparison. First establish why its allocator path
could differ materially from the one above; otherwise it is merely an
unmeasured copy alternative. A template copy needs a separate justification
because it restores a full source read that constant fill removed. Preserve
the synchronous API, exact bytes, both profile baselines, strict 195-case audit
and full native 2× acceptance throughout.

## Appendix: pinned Skia route for the native solid (2026-10-06)

**The exact source now supports a narrow legacy ARGB32 route prediction. It
does not prove that the running binary took that route or that direct GPU
solids preserve its bytes.** Read-only source retrieval succeeded at Skia
`0208108c7aed5f4e0faa525cbba52c238005a1ef` and Chromium `151.0.7922.34` after
the web tool's cache failures. No build, browser run, timing, or runtime edit
was used. This resolves the earlier source-version gap for the files below.

### Surface, paint and selector evidence

The preparation canvas in the repository requests only `willReadFrequently`;
it does not request a different color space or pixel format. Chromium's pinned
[context defaults](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/third_party/blink/renderer/core/html/canvas/canvas_context_creation_attributes_core.h)
are sRGB, Uint8 and alpha enabled.
[Canvas2DColorParams](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/third_party/blink/renderer/platform/graphics/canvas_2d_color_params.cc)
maps Uint8 to `GetN32FormatForCanvas`, whose
[definition](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/third_party/blink/renderer/platform/graphics/skia/skia_utils.h)
returns `SharedImageFormat::N32Format()`. Its
[alpha policy](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/third_party/blink/renderer/platform/graphics/canvas_2d_color_params.h)
is premultiplied when alpha is enabled. Thus the default preparation format
satisfies the selector's N32/premultiplied conditions; sRGB is not itself a
reason to select the raster pipeline.

When GPU compositing is disabled, pinned
[CanvasRenderingContext2D](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/third_party/blink/renderer/modules/canvas/canvas2d/canvas_rendering_context_2d.cc)
chooses a software-compositor shared-image provider, falling back to a bitmap
provider if necessary. Both relevant CPU
[surface factories](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/third_party/blink/renderer/platform/graphics/canvas_resource_provider.cc)
call `SkSurfaces::Raster` with the selected format/color space. Pinned
[SkSurface_Raster](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/src/image/SkSurface_Raster.cpp)
creates a canvas backed by `SkBitmapDevice`. This is a concrete source chain
for the pinned profile's CPU Canvas, beyond merely observing `--disable-gpu`.

Pinned [Canvas state](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/third_party/blink/renderer/modules/canvas/canvas2d/canvas_rendering_context_2d_state.cc)
enables antialiasing for fill paint. The
[solid-style path](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/third_party/blink/renderer/modules/canvas/canvas2d/canvas_style.h)
clears the shader and multiplies color alpha by floating global alpha;
[PaintFlags](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/cc/paint/paint_flags.cc)
defaults to source-over with dithering off and transfers the floating color
to SkPaint. The separate image-alpha byte quantization does not apply to this
`fillRect` paint.

Pinned [SkBlitter::UseLegacyBlitter/Choose](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/src/core/SkBlitter.cpp)
accepts a no-shader sRGB solid on N32 when the color fits its allowed range,
the alpha type is not unpremultiplied, blending is source-over, and dithering,
3D mask filtering and clip shaders do not force a different route. The native
nonopaque color then selects `SkARGB32_Blitter`. Crucially,
[`fitsInBytes()`](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/include/core/SkColor.h)
only tests RGB in `[0,1]`; it does **not** demand an exact byte-grid value.
Fractional opacity alone therefore does not select the raster pipeline.

There are still explicit overrides: the global `gSkForceRasterPipelineBlitter`
defaults false, but either that override or `SK_FORCE_RASTER_PIPELINE_BLITTER`
rejects legacy. Pinned [SkTypes.h](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/include/core/SkTypes.h)
also makes `SK_ENABLE_OPTIMIZE_SIZE` imply the force flag. Neither appears in
the inspected Chromium [Skia build configuration](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/skia/BUILD.gn)
or [SkUserConfig.h](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/skia/config/SkUserConfig.h).
That is evidence for the normal source configuration, not a recovered set of
the shipped binary's compiler arguments or runtime global values.

### Quantization reconciled at the pinned revision

The pinned chain preserves the earlier **separate** color and coverage steps:

1. Legacy `paint.getColor()` converts floating unpremultiplied RGBA to bytes.
   [`SkColor4f::toSkColor`](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/src/core/SkColor.cpp)
   uses [`Sk4f_toL32`](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/src/core/SkSwizzlePriv.h):
   multiply each actual float by 255, add 0.5, clamp to `[0,255]`, then cast.
2. [`SkARGB32_Blitter`](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/src/core/SkBlitter_ARGB32.cpp)
   premultiplies this byte color through
   [`SkPremultiplyARGBInline`](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/src/core/SkColorPriv.h)
   and [`SkMulDiv255Round`](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/include/private/SkMath.h).
   This supports the conditional interior prediction `[130,67,43,153]` for
   `#d87047` at opacity `0.6`; it is not a newly observed texture sample.
3. Pinned [`SkBitmapDevice::drawRect`](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/src/core/SkBitmapDevice.cpp)
   calls [`skcpu::Draw::drawRect`](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/src/core/SkDraw.cpp).
   Rect-preserving fill geometry without path/mask effects reaches `AntiFillRect`.
   The pinned [scan converter](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/src/core/SkScan_Antihair.cpp),
   [float-to-fixed conversion](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/include/private/SkFixed.h)
   and [rectangle conversion](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/src/core/SkScan.h)
   confirm the earlier 16.16-to-24.8 edge derivation. For the scoped integer-y,
   wider-than-one-pixel rectangle, vertical edge coverage is applied to already
   premultiplied bytes with `floor(P * (coverage + 1) / 256)`; zero coverage skips
   painting. The background recurrence follows afterward.

The actual device floats and transform concatenation still matter. Chromium's
pinned [`fillRect`](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/third_party/blink/renderer/modules/canvas/canvas2d/canvas_2d_recorder_context.cc)
clamps local rectangle arguments to float and records `drawRect`; Skia maps
them through its CTM before scan conversion. Substituting a JavaScript-double
area formula or folding opacity/coverage into one multiply is not this path.

**Decision:** source eligibility is now strong enough to specify a bounded
prepared-byte correctness proof if the combined cost gate warrants it. It is
not sufficient to retain an optimization. Compare interior and fractional-edge
prepared bytes against the actual pinned browser, including near-grid phases
and fallback transitions; preserve unrelated outputs. A mismatch must reopen
the route/quantization assumption before timing. Hardware Canvas can choose a
different raster backend and still needs separate equality proof. No flag or
hardware policy change follows from this research, and none of these sources
establishes a performance gain or closes either acceptance gate.

## Appendix: hardware Canvas route and backend evidence (2026-10-06)

**Finding:** the pinned hardware profile cannot be treated as a Ganesh version
of the CPU rectangle formula. Its recorded ANGLE Metal renderer identifies
WebGL; it does not identify Canvas's Skia renderer. This appendix uses exact
Chromium `151.0.7922.34` and Skia
`0208108c7aed5f4e0faa525cbba52c238005a1ef` sources. It records conditional
arithmetic, not observed prepared bytes, a selected optimization or a timing
result. The armed V1 diagnostic remains unchanged.

### Canvas can reach Graphite/Dawn/Metal

At this Chromium tag, [Skia Graphite defaults on for Apple](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/gpu/config/gpu_finch_features.cc).
The normal Apple eligibility path also requires the passthrough command
decoder and ANGLE Metal selection. Actual activation still depends on build
support, feature configuration, blocklisting and successful initialization;
the [feature-status selector](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/gpu/config/gpu_util.cc)
checks those conditions. [Dawn's default backend selector](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/gpu/command_buffer/service/dawn_context_provider.cc)
chooses Metal on Apple unless an override or SwiftShader applies. These sources
make Graphite/Dawn/Metal a credible hardware route, not proof that the existing
probe used it.

The native preparation canvas explicitly requests `willReadFrequently: false`.
Chromium's [per-canvas policy](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/third_party/blink/renderer/core/html/canvas/html_canvas_element.cc)
prefers GPU rendering when acceleration is available and this hint is not true;
provider creation can still fall back to CPU. The accelerated
[shared-image provider](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/third_party/blink/renderer/platform/graphics/canvas_resource_provider.cc)
submits `BeginRasterCHROMIUM`/`RasterCHROMIUM`, requesting dynamic MSAA when its
capabilities permit. The [raster decoder](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/gpu/command_buffer/service/raster_decoder.cc)
obtains a Skia surface through the shared context and supports both Ganesh and
Graphite. Thus neither the WebGL renderer string nor a presumed single-sample
Canvas surface establishes the actual rectangle renderer.

### Hardware color and coverage differ from the CPU derivation

For Graphite, [Device::drawRect and renderer selection](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/src/gpu/graphite/Device.cpp)
route a simple fractional filled rectangle to `analyticRRect`; pixel-aligned
rectangles can use `nonAABounds`. The
[analytic render step](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/src/gpu/graphite/render/AnalyticRRectRenderStep.cpp)
and its [vertex shader](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/src/sksl/sksl_graphite_vert.sksl)
construct device-space edge distances. The filled-rectangle
[fragment coverage](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/src/sksl/sksl_graphite_frag.sksl)
is `saturate(scale * (c + coverage_bias(scale)))`, with
[`coverage_bias(scale) = 1 - 0.5 * scale`](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/src/sksl/sksl_gpu.sksl).
For the native affine, integer-y, 400-by-300 rectangle, the ideal edge ramp has
scale 1 and bias 0.5. This is floating distance coverage, not the CPU scan
converter's 24.8 coverage followed by an integer byte multiply. Device floats,
interpolation, clipping and final target conversion still determine exact
bytes; the ideal ramp is not an equality proof.

Graphite's [solid-paint handling](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/src/gpu/graphite/PaintParams.cpp)
color-converts and premultiplies floating paint color before emitting the solid
shader. The [shader dictionary](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/src/gpu/graphite/ShaderCodeDictionary.cpp)
uses a `float4` uniform with a `half4` expression; [shader output generation](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/src/gpu/graphite/ShaderInfo.cpp)
applies coverage and hardware blending. It does not reproduce legacy CPU
quantization before premultiplication. Moreover, `half` in SkSL does not prove
physical 16-bit arithmetic here: Chromium's
[`SkiaGraphiteF16` feature defaults off](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/gpu/command_buffer/service/dawn_context_provider.cc),
and [DawnCaps](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/src/gpu/graphite/dawn/DawnCaps.cpp)
enables half precision according to the features of the created device. Adapter
support alone is insufficient evidence that it was enabled.

Ganesh is a separate conditional branch. Its [solid-paint conversion](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/src/gpu/ganesh/SkGr.cpp)
also premultiplies floats first. The normal `FillRectOp` can pack this color into
byte vertices through [BufferWriter](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/src/gpu/BufferWriter.h);
its [QuadPerEdgeAA](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/src/gpu/ganesh/ops/QuadPerEdgeAA.cpp)
uses a half-pixel coverage ramp. However, [SurfaceDrawContext](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/src/gpu/ganesh/SurfaceDrawContext.cpp)
can first choose `FillRRectOp` under dynamic MSAA or reduced-shader conditions;
that [operation](https://raw.githubusercontent.com/google/skia/0208108c7aed5f4e0faa525cbba52c238005a1ef/src/gpu/ganesh/ops/FillRRectOp.cpp)
has its own analytic coverage and MSAA handling. Even if this exact native
color produces the same predicted interior `[130,67,43,153]`, that coincidence
does not establish fractional-edge equality or a common CPU/GPU formula.

### What a later unchanged-profile chrome://gpu read can establish

The exact public labels come from [gpu_internals_ui.cc](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/content/browser/gpu/gpu_internals_ui.cc)
and [info_view.ts](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/content/browser/resources/gpu/info_view.ts).
A read after the active diagnostic and local gate finish can capture:

| Public field                                                                            | Useful evidence                                                                   | Limit                                                                                                   |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Skia Backend**                                                                        | Actual initialized global backend, for example `GraphiteDawnMetal` or `GaneshGL`. | Does not say whether this individual Canvas used a CPU fallback, or which rectangle operation it chose. |
| **Canvas** and **Skia Graphite** under Graphics Feature Status                          | Availability/status of accelerated 2D Canvas and Graphite.                        | Global capability, not a per-canvas execution trace.                                                    |
| **Rasterization**                                                                       | GPU tile-rasterization status.                                                    | Does not establish this Canvas's backend.                                                               |
| **Passthrough Command Decoder**, **GL implementation parts**, **GL_RENDERER**           | Decoder and ANGLE/GL environment needed to interpret the source selectors.        | Cannot substitute for Skia Backend.                                                                     |
| Version Information: browser version, command line, graphics backend and ANGLE revision | Establishes the unchanged profile and compiled Skia/ANGLE revision.               | Source configuration and device capabilities still do not prove exact prepared bytes.                   |

`Skia Backend` is stronger than compositor-only status: the
[GPUInfo definition](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/gpu/config/gpu_info.h)
explicitly covers rendering and compositing, while
[`GpuInit::SetSkiaBackendType`](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/gpu/ipc/service/gpu_init.cc)
runs after successful initialization and maps the selected context and actual
Dawn backend. The feature rows instead map the
[global Canvas, tile-rasterization and Graphite feature enums](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/content/browser/gpu/compositor_util.cc).
Capture the active basic/feature information: the page can additionally expose
`basicInfoForHardwareGpu` and `featureStatusForHardwareGpu` from hardware before
a software fallback; those are not the active backend.

**Decision:** useful source narrowing, but no hardware direct-solid mechanism
is selected. If V1's combined cost gate misses and the remaining preparation
cost warrants another mechanism, first record the unchanged profile's active
backend; then prove prepared-byte equality on that route, including fractional
phases, integer-edge transitions and preserved fallbacks. The GPU derivations
do not justify substituting the CPU formula, changing hardware policy or
altering either acceptance gate. No browser session, workload or timing was
run for this appendix.
