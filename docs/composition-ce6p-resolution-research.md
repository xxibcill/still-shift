# CE6-P resolution research

Research date: **2026-10-06**. Repository evidence: review head `633138b`,
runtime `7a797a9` / `composition-webgl2-0.40.0`. This is a research record and
proposal, not a new measurement or an implementation. No browser benchmark,
build, test, runtime change, backend-policy change, or acceptance change was
performed for this report. GitHub Actions remain prohibited.

## Finding

There is a credible route to resolving **some** timing failures by eliminating
repeated raster preparation, redundant uploads, and unnecessary pixel work.
There is no evidence yet that these changes can resolve **all 119** under the
current pinned software profile and synchronous, independently owned RGBA
output contract. The next step should be a costed plan for representative
failure groups, with rejection criteria written before implementation.

An API substitution for `readPixels` is a poor first choice. The recorded PBO
experiment was approximately 17× slower, the export-framebuffer experiment
was within variation, and scratch-buffer reuse produced mixed results. The
source research explains why an apparent readback bottleneck can actually be
unfinished raster/compositing work. It does not establish a new speedup.

The preserved [family audit](./composition-ce6p-family-audit.json) covers 195
cases / 40,783 forward frames; 119 exceed the unchanged composition/legacy
ratio of 1.25. All original 117 remain failures. The separate native 1080p 2×
target also remains open at sample count one. Four inherited echo pixel-tier
failures must remain visible independently of the timing work.

## What the existing evidence already rules out

The [CE6 research follow-up](./composition-ce6-performance-results.json) and
[CE4b feasibility record](./composition-ce4b-feasibility.md) are more relevant
than generic advice about making WebGL faster:

| Existing finding                                                                                                                                      | Consequence for the plan                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Story Instances warm pass: composition 1,066.7 ms, legacy 232.1 ms, allowed 290.1 ms                                                                  | It needs roughly 776.6 ms removed, or a 3.68× speedup. A small cache win is insufficient alone. This is the historical diagnostic, not the current family acceptance traversal.                      |
| That profile records 636.6 ms in `readPixels`, 189.9 ms in uploads including raster flush, 136.5 ms copying owned bytes, and 55.3 ms in program calls | These are attribution measurements; the `readPixels` value includes queued rendering. They are not independent pure GPU kernel times. Upload plus owned-byte copy already exceeds the allowed total. |
| Glow: 2,469.5 ms queue drain versus 108.3 ms subsequent read over 60 sampled software frames                                                          | Effect execution deserves investigation. Treating the entire readback-stage time as allocation would target the wrong work.                                                                          |
| Evaluation and graph building approximately 0.5–2 ms per 60 ordinary frames                                                                           | Another general evaluator rewrite has little demonstrated capacity to close the large gaps.                                                                                                          |
| Explicit RGBA8 export framebuffer: approximately 2.17–2.29 ms pass+read versus 2.30 ms default framebuffer                                            | Rejected as within variation. A new FBO proposal needs a different mechanism, such as eliminating intermediate copies, not merely changing the output attachment.                                    |
| PBO + `getBufferSubData`: 26.5–26.7 ms versus direct read 1.49–1.58 ms per 1080p frame                                                                | Do not repeat synchronous PBO readback under the same contract/profile. Yielding for a fence was also slower.                                                                                        |
| `copyTexSubImage2D` RGB8 about twice as slow as the current blit; RGBA8 copy from the alpha:false default buffer was incorrect                        | Retain the current copy mechanism unless a new candidate removes the copy itself.                                                                                                                    |
| Incremental scratch reuse: mixed improvements/regressions                                                                                             | Returning reused caller buffers would break ownership; merely reusing internal allocation already lacks a consistent result.                                                                         |
| Direct PNG sampling retained only for eligible mip downscales; unrestricted sampling hurt Alpha Matte and history-dependent eligibility broke seeks   | Broader GPU sampling needs a concrete precision proof and deterministic eligibility, not a general assumption that texture sampling is faster.                                                       |

These measurements are historical and machine/profile dependent. Use them to
exclude unsupported hypotheses, not as predictions of the exact current cost.

## Primary-source findings

### Readback is a synchronization boundary

Upstream ANGLE Vulkan's CPU read path creates a staging buffer, copies the image
into it, calls `finishImpl(QueueSubmitReason::GLReadPixels)`, invalidates the
staging allocation, and packs the result into the destination. Its PBO path can
take a different transfer/compute route. This supports separating queued
rendering from copying when interpreting existing measurements. It does not
prove which upstream code revision is embedded in our browser or guarantee
that PBOs help. [ANGLE `ImageHelper::readPixelsImpl`](https://raw.githubusercontent.com/google/angle/main/src/libANGLE/renderer/vulkan/vk_helpers.cpp).

WebGL 2 exposes `PACK_ROW_LENGTH`, `PACK_SKIP_ROWS`, `PACK_SKIP_PIXELS`, and a
destination offset for placing readback into a subregion of a typed array.
Those controls can avoid a separate packed-region scatter under a suitable
memory layout. They do not provide a negative row stride or caller ownership
for free. The API still has to produce the requested data consistently.
[WebGL 2 specification](https://registry.khronos.org/webgl/specs/latest/2.0/).

The current implementation already retains previous GPU-produced bytes and
updates conservative damage. It then copies the full retained array for caller
ownership. Therefore a proposal to “add dirty readback” repeats an existing
optimization. A meaningful follow-up must identify excess damaged area, an
avoidable intermediate copy, or a case where retaining the whole CPU snapshot
costs more than it saves. See
[`webgl-readback.ts`](../packages/renderer-core/src/composition/render/webgl-readback.ts)
and [`webgl-device.ts`](../packages/renderer-core/src/composition/render/webgl-device.ts).

### Exact primitive blending constrains batching and substitution

The current primitive operation is byte-valued
`s + floor(d * (256 - a) / 256)`. It differs from the ordinary normalized
source-over equation. OpenGL ES describes fixed-function blending using
floating-point computations and minimum precision requirements; it does not
promise this particular integer formula. Changing the blend function can
therefore change pixels even when the operation has the same visual name.
[OpenGL ES 3.0.6, sections 2.1.6 and 4.1.7](https://registry.khronos.org/OpenGL/specs/es/3.0/es_spec_3.0.pdf).

Our shader already performs ordered integer rounding, and `drawMany` already
batches up to 15 prepared paints with a backdrop. A further batch optimization
must reduce uncovered area, upload count, or backdrop copies while preserving
each primitive's original rounding and order. Flattening overlapping primitives
into a single transparent bitmap can change that rounding. See
[`webgl-paint.ts`](../packages/renderer-core/src/composition/render/webgl-paint.ts).

ANGLE's upstream blit implementation chooses a transfer command only under
format, channel, transform, and clipping constraints; fallback may involve a
shader and ending a render pass. This is causal support for counting actual
copies and affected pixels, rather than assuming every API named “copy” is
cheap. It is not evidence that our present blit takes its slow path.
[ANGLE `FramebufferVk::blit`](https://raw.githubusercontent.com/google/angle/main/src/libANGLE/renderer/vulkan/FramebufferVk.cpp).

### A conditional extension may remove backdrop copies, but is not a first bet

The `WEBGL_shader_pixel_local_storage` draft exposes per-pixel load/store.
Coherent operation preserves primitive order; otherwise the application must
insert barriers between passes that touch the same pixel. This provides a
possible mechanism for custom exact compositing without a copied backdrop.
Availability, accepted syntax/formats, coherence and cost must all be confirmed
on the unchanged pinned browser first. [Khronos draft, revision 6](https://registry.khronos.org/webgl/extensions/WEBGL_shader_pixel_local_storage/).

Chromium's implementation checks the underlying ANGLE extension and rejects
the default framebuffer for its PLS operation. Thus this would entail an
offscreen integration and final presentation/readback costs, not a drop-in
replacement for the screen paint method.
[Chromium PLS implementation](https://chromium.googlesource.com/chromium/src/third_party/+/refs/heads/main/blink/renderer/modules/webgl/webgl_shader_pixel_local_storage.cc).

There is negative primary evidence: an ANGLE PLS stress test deliberately
uses fewer boxes on SwiftShader/noncoherent paths because the larger case times
out. This is not a benchmark of our renderer, but it defeats a blanket claim
that PLS is fast on software Vulkan.
[ANGLE PLS test at `9be55a7`](https://chromium.googlesource.com/experimental/angle/angle/+/9be55a77889fa40b76e0d682338b2fa776e40514/src/tests/gl_tests/PixelLocalStorageTest.cpp).

## Ranked hypotheses and the evidence required before implementation

The ranking is an engineering judgment from the local source and recorded
measurements. It is not a ranking of measured candidate speedups.

| Rank | Candidate and causal mechanism                                                                                                                                                                                                                                                                                                                       | Required evidence / rejection rule                                                                                                                                                                                                                                                                                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **Remove stable raster-cache conflicts and repeated preparation.** `WebglImages` stores one entry per `content.sources`, but validates it with a key including placement, opacity and clipping. Distinct stable placements sharing one source object can evict each other's raster. A bounded cache of complete visual placements could retain both. | First trace actual source-object identities and repeated equal full keys in failing fixtures. This is a source-identified possible conflict, not observed thrashing. Reject for a group if animation changes every full key or there is no reuse. Include retained texture memory in the budget.                                                                                      |
| 2    | **Reduce the area and number of ordered primitive operations.** Existing `drawMany` shades the union of each batch. Spatially separated paints can create a large mostly empty union; current damage also merges changes into one rectangle. Classify wasted union area and redundant backdrop copies.                                               | Count submitted pixels/copy pixels versus actual changed coverage. Only consider order-preserving partitions or provably disjoint operations. Compare saved pixel work with extra submissions/read calls; reject a patch that only moves the same work between stages. Unknown effects retain conservative full coverage.                                                             |
| 3    | **Reuse exact device-grid rasters when only a provably equivalent placement changes.** Integer translations with unchanged fractional sampling phase may permit relocating a prepared raster instead of rerasterizing/uploading it.                                                                                                                  | Establish eligibility from present inputs, including clips, transforms, image sampling, opacity and edges. Prove translation invariance for each admitted provider; do not infer it from visual similarity. Arbitrary scale, rotation, subpixel motion and Canvas image filtering are excluded until proven. Prior PNG seek failures make history-dependent eligibility unacceptable. |
| 4    | **Narrow or fuse expensive effect work without changing rounding.** Use known coverage and exact support radii, or eliminate an intermediate operation while retaining its quantization in the fused shader.                                                                                                                                         | Select only an effect group with measured execution cost and enough removable work to matter. Existing box-blur and exposure optimizations already exist. Derive arithmetic and overflow bounds before code; preserve border sampling, intermediate byte rounding, premultiplication and exposure ordering. A different Gaussian approximation is not equivalent.                     |
| 5    | **Remove an intermediate readback copy under the same ownership contract.** Direct packed-region writes or a dense-frame path may reduce scatter/cache work.                                                                                                                                                                                         | The current screen read is bottom-up and public pixels are top-down. Account for row reversal, cache maintenance, later caller mutation and every read. Historical scratch reuse is negative evidence. Even eliminating the entire historical 136.5 ms owned-copy stage would leave Story Instances far above its 290.1 ms budget.                                                    |
| 6    | **PLS exact integer compositing**, only if naturally available on the pinned profile.                                                                                                                                                                                                                                                                | Capability snapshot before any implementation: extension object, coherency, formats, limits and unchanged launch flags. If unavailable, stop. If available, require byte proof and a bounded copy-removal cost model including barriers and offscreen presentation. The draft and SwiftShader test warning make this a research fallback, not the main execution plan.                |

Source locations for the first three candidates:
[`webgl-images.ts`](../packages/renderer-core/src/composition/render/webgl-images.ts),
[`webgl-vectors.ts`](../packages/renderer-core/src/composition/render/webgl-vectors.ts),
[`webgl-damage.ts`](../packages/renderer-core/src/composition/render/webgl-damage.ts),
[`webgl-visual-key.ts`](../packages/renderer-core/src/composition/render/webgl-visual-key.ts).
The existing isolate cache also retains one immutable result per layer and
accounts for nested users; proposals must preserve that lifetime behavior:
[`webgl-isolates.ts`](../packages/renderer-core/src/composition/render/webgl-isolates.ts).

**Static eligibility check:** the large `story-instances` failure is not evidence
of the proposed image-cache collision. Its two house images have separate
`states` arrays, which the adapter carries into `sources`. They share an asset
name, not necessarily the cache's object identity. The camera continuously
changes position and zoom, also invalidating device-space raster keys. Thus
multi-entry stable-placement caching is not an established solution for this
case. This source check rules out an unsupported first implementation before
another benchmark. See the [fixture](../benchmarks/fixtures/reusable-components/story-instances.json)
and [prepared adapter](../packages/renderer-core/src/composition/adapters/prepared.ts).

Two larger source seams deserve explicit cost models. First, `WebglVectors.draw`
currently prepares and composites overlapping operations individually. Separating
preparation from execution could let compatible adjacent layers share the
existing ordered paint recurrence and one backdrop snapshot. Preparation's
backdrop-dependent grouping, cache lifetimes and every effect/mask dependency
must remain equivalent. This extends scheduling across layers; existing
per-provider batching already exists. More sources over a larger union can also
increase shader cost, so fewer calls alone do not establish a win.

Second, internal isolated surfaces could distinguish logical coordinates from
smaller storage bounds. That can potentially remove raster/upload/effect work
across a whole isolated scope instead of only clipping its final composite.
Device-space sampling origins, blur support, inverted mattes, cache keys and
feedback rules make this a substantial compatibility proof. It is worthwhile
only where executed area, rather than merely allocation size, becomes smaller.
See [`backend.ts`](../packages/renderer-core/src/composition/render/backend.ts)
and [`webgl2.ts`](../packages/renderer-core/src/composition/render/webgl2.ts).

Prior disjoint-damage/GPU-flipped readback and multi-state vector-cache attempts
are also recorded in the [engine plan](./composition-engine-plan.md). A renamed
version of one of those experiments is not a new mechanism. In particular,
multi-state caching must benefit the original timed traversal, not only a warmed
repeat that changes the preserved method.

The [resolution plan](./composition-ce6p-resolution-plan.md) adds the count-one
feasibility gate, current per-case budgets, echo correctness decision and exact
execution/acceptance order to this research.

## Feasibility gate before another optimization campaign

For each representative group, write down `allowed = 1.25 × legacy`,
`required savings = current − allowed`, and the total cost the hypothesis can
actually remove. Use the family's preserved warm/cold method for acceptance;
diagnostic stage measurements answer attribution questions only.

If a candidate targets fraction `p` of total time, even eliminating that work
completely can improve total time by at most `1 / (1 − p)`. For a 5× ratio,
reaching 1.25× requires removing 75% of current time. A hypothesis addressing
10% cannot close that case. This bound is arithmetic, not a prediction that
any measured stage can actually be eliminated.

A candidate should reach implementation only after it has: named eligible
fixtures; a source-level explanation for unnecessary work; a conservative
savings bound; an exactness argument; memory/seek/ownership constraints; a
small targeted comparison; and a stop rule for inconclusive or regressive
results. The selected candidate then receives the unchanged full family
audit and local verification. Preserve failed attempts rather than rerunning
until one result passes.

If the estimated remaining floor still exceeds the budget, stop that branch
of the plan and report the gap. Do not declare all 119 solvable from a list of
optimizations whose savings have not been established.

## Alternatives that change the problem

Async export pipelining can overlap frame production and consumption only if
the caller accepts delayed frame delivery and resource lifetime changes.
Hardware-only timing, a Canvas/CPU fallback for simple cases, WebGPU/Wasm
replacement, reduced resolution, a borrowed output buffer, or changing the
1.25× limit would alter the current backend/profile/API/acceptance scope.
They may deserve separate proposals if the cost model blocks closure, but
they are not fixes to the present benchmark contract and are not authorized
by this research report.

The proposed asynchronous buffer-readback extension itself was rejected in
2018 in favor of optimizing the existing API; it should not be presented as an
available escape hatch.
[Khronos rejected extension record](https://registry.khronos.org/webgl/extensions/rejected/WEBGL_get_buffer_sub_data_async/).

## Source register and revision limitations

All external sources below were inspected **2026-10-06**. No secondary tutorial
is used to substantiate the implementation claims.

| Source                                                                                                                                                                | Revision / status inspected                                                | What it supports; limit                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [WebGL 2 specification](https://registry.khronos.org/webgl/specs/latest/2.0/)                                                                                         | Living `latest/2.0` specification                                          | Readback destination/packing semantics; no timing guarantee.                                                           |
| [OpenGL ES 3.0.6](https://registry.khronos.org/OpenGL/specs/es/3.0/es_spec_3.0.pdf)                                                                                   | November 1, 2019                                                           | Blend arithmetic/precision and normalized conversion; not Canvas's integer rounding contract.                          |
| [ANGLE Vulkan helper source](https://raw.githubusercontent.com/google/angle/main/src/libANGLE/renderer/vulkan/vk_helpers.cpp)                                         | Moving upstream `main`, `ImageHelper::readPixelsImpl`                      | Staging, synchronization, packing and separate PBO paths; **not established as the embedded Chromium revision**.       |
| [ANGLE framebuffer source](https://raw.githubusercontent.com/google/angle/main/src/libANGLE/renderer/vulkan/FramebufferVk.cpp)                                        | Moving upstream `main`, `FramebufferVk::blit`                              | Conditional copy/blit paths; does not identify the path taken by our running browser.                                  |
| [WebGL PLS draft](https://registry.khronos.org/webgl/extensions/WEBGL_shader_pixel_local_storage/)                                                                    | Revision 6, June 25, 2026, draft                                           | Capability and coherence semantics; no availability or speed guarantee.                                                |
| [Chromium PLS binding](https://chromium.googlesource.com/chromium/src/third_party/+/refs/heads/main/blink/renderer/modules/webgl/webgl_shader_pixel_local_storage.cc) | Inspected blob `db53493a6371a0e3b6cb57239287ead82f14bea1`, moving main URL | ANGLE dependency and offscreen framebuffer requirement; pin is a source blob identity, not our browser build identity. |
| [ANGLE PLS test](https://chromium.googlesource.com/experimental/angle/angle/+/9be55a77889fa40b76e0d682338b2fa776e40514/src/tests/gl_tests/PixelLocalStorageTest.cpp)  | Fixed revision `9be55a77889fa40b76e0d682338b2fa776e40514`                  | Explicit SwiftShader/noncoherent stress-test caution; not a measurement of this application.                           |
| [Rejected asynchronous readback proposal](https://registry.khronos.org/webgl/extensions/rejected/WEBGL_get_buffer_sub_data_async/)                                    | Revision 2, May 4, 2018, rejected                                          | Explains why this named API is not a supported solution.                                                               |

The stored benchmark browser is Chromium **151.0.7922.34** with a recorded
SwiftShader fingerprint. This research did not establish the exact ANGLE and
SwiftShader commits built into that binary. Attempts to retrieve its public
version-tagged DEPS did not yield usable source. Before attributing a specific
upstream path to that binary, obtain its build dependency revisions or capture
the relevant runtime behavior. Do not silently upgrade Chromium or alter
launch flags to make a researched feature available.

## Current failure budgets: all 119 cases

Derived from the retained strict audit, without executing any fixture. Commerce
uses the pass with the median ratio and its timed frame count, including cycles.
Story/components and typography use their recorded first-traversal totals.
`Allowed = 1.25 × legacy`; `reduction = 1 − 1.25 / ratio`. Values here are rounded;
the unrounded [audit](./composition-ce6p-family-audit.json) remains authoritative.
These are case budgets, not measurements of a particular suspected bottleneck.
All original 117 IDs remain; the two additional misses are marked.

### commerce: 75 timing failures

| Case                                                  | WebGL/legacy | WebGL ms/frame | Allowed ms/frame | Reduction needed |
| ----------------------------------------------------- | -----------: | -------------: | ---------------: | ---------------: |
| `commerce/atom-anchor`                                |       2.3811 |          5.667 |            2.975 |          47.504% |
| `commerce/atom-attachment`                            |       3.0227 |          3.987 |            1.649 |          58.647% |
| `commerce/atom-attachment/nested-crop-brush`          |       3.2312 |          7.856 |            3.039 |          61.315% |
| `commerce/atom-background-light`                      |       1.4869 |          6.147 |            5.168 |          15.932% |
| `commerce/atom-displacement`                          |       2.1027 |         12.126 |            7.209 |          40.552% |
| `commerce/atom-displacement/pixel-stack`              |       2.0642 |         67.735 |           41.018 |          39.444% |
| `commerce/atom-displacement/pixel-reversed`           |       2.1620 |         68.893 |           39.833 |          42.182% |
| `commerce/atom-drift`                                 |       2.3241 |          4.324 |            2.326 |          46.215% |
| `commerce/atom-echo/returning-matte`                  |       3.9378 |         15.535 |            4.931 |          68.256% |
| `commerce/atom-effects-studio`                        |       1.4401 |          6.727 |            5.839 |          13.203% |
| `commerce/atom-float`                                 |       2.7254 |          3.669 |            1.683 |          54.136% |
| `commerce/atom-focus-blur`                            |       1.2652 |         13.748 |           13.583 |           1.200% |
| `commerce/atom-focus-blur/active-opacity`             |       1.9128 |         11.055 |            7.224 |          34.652% |
| `commerce/atom-glow`                                  |       2.1255 |         31.186 |           18.341 |          41.189% |
| `commerce/atom-grain`                                 |       2.7219 |          6.245 |            2.868 |          54.077% |
| `commerce/atom-height-shadow`                         |       2.9776 |          4.123 |            1.731 |          58.020% |
| `commerce/atom-layout/transformed-annotation`         |       3.0911 |          3.866 |            1.564 |          59.561% |
| `commerce/atom-light-sweep`                           |       1.6085 |          7.169 |            5.571 |          22.287% |
| `commerce/atom-light-sweep/rotated-skew`              |       1.6955 |          9.982 |            7.359 |          26.274% |
| `commerce/atom-light-sweep/image-matte`               |       1.7667 |         13.372 |            9.461 |          29.246% |
| `commerce/atom-light-sweep/glow-first`                |       2.2955 |         46.426 |           25.281 |          45.546% |
| `commerce/atom-matte`                                 |       2.5091 |         11.918 |            5.937 |          50.182% |
| `commerce/atom-matte/inverted-overlap`                |       1.9852 |         14.748 |            9.286 |          37.034% |
| `commerce/atom-matte/shared-group-source`             |       1.6204 |         19.992 |           15.422 |          22.860% |
| `commerce/atom-matte/inverted-overlap/focus-matte`    |       2.0462 |         22.698 |           13.866 |          38.911% |
| `commerce/atom-matte/shared-group-source/focus-matte` |       1.7783 |         28.369 |           19.942 |          29.707% |
| `commerce/atom-panel/appearance-uniform`              |       2.4840 |          1.424 |            0.716 |          49.678% |
| `commerce/atom-parallax`                              |       5.0376 |          7.236 |            1.796 |          75.186% |
| `commerce/atom-particles`                             |       5.2849 |          7.265 |            1.718 |          76.348% |
| `commerce/atom-particles/environment-stack`           |       2.4882 |         10.325 |            5.187 |          49.763% |
| `commerce/atom-particles/environment-reversed`        |       2.1700 |          9.140 |            5.265 |          42.398% |
| `commerce/atom-path/spatial`                          |       4.6638 |          3.004 |            0.805 |          73.198% |
| `commerce/atom-path/morph`                            |       3.6728 |          3.790 |            1.290 |          65.966% |
| `commerce/atom-path/spatial-morph`                    |       3.4101 |          2.349 |            0.861 |          63.344% |
| `commerce/atom-path/appearance-uniform`               |       3.9961 |          2.153 |            0.673 |          68.720% |
| `commerce/atom-path/appearance-ink`                   |       2.9643 |          1.720 |            0.725 |          57.831% |
| `commerce/atom-path/appearance-brush`                 |       3.0295 |          2.763 |            1.140 |          58.740% |
| `commerce/atom-rotate` (additional miss)              |       1.5030 |          3.218 |            2.677 |          16.834% |
| `commerce/atom-scale`                                 |       1.9525 |          2.765 |            1.770 |          35.979% |
| `commerce/atom-sequence`                              |       3.0042 |          4.029 |            1.676 |          58.392% |
| `commerce/atom-studio`                                |       2.8590 |          3.790 |            1.657 |          56.279% |
| `commerce/atom-text/animated-states`                  |       4.3387 |          4.937 |            1.422 |          71.190% |
| `component/commerce-bracket`                          |       2.3984 |          2.465 |            1.285 |          47.881% |
| `component/commerce-detail-sequence`                  |       1.8200 |          6.020 |            4.135 |          31.320% |
| `component/commerce-instances`                        |       2.1005 |          2.207 |            1.313 |          40.489% |
| `component/commerce-layout`                           |       2.1029 |          2.154 |            1.281 |          40.557% |
| `component/commerce-leader`                           |       2.3258 |          2.291 |            1.232 |          46.255% |
| `component/commerce-leader/source-crop-ink`           |       2.5766 |          3.443 |            1.671 |          51.486% |
| `component/commerce-outline`                          |       2.6314 |          2.834 |            1.346 |          52.496% |
| `component/commerce-pin`                              |       1.4419 |          1.580 |            1.370 |          13.312% |
| `component/commerce-sequence`                         |       1.4195 |          1.469 |            1.293 |          11.939% |
| `component/commerce-stagger`                          |       3.0129 |          3.203 |            1.329 |          58.512% |
| `component/commerce-state`                            |       1.3213 |          1.429 |            1.352 |           5.396% |
| `component/commerce-supply-sequence`                  |       2.0789 |          6.834 |            4.109 |          39.872% |
| `component/commerce-supply`                           |       3.0173 |          3.899 |            1.615 |          58.573% |
| `component/commerce-text-fit`                         |       1.2767 |          1.327 |            1.299 |           2.091% |
| `component/commerce-text-fit/native-thai`             |       1.3070 |          1.369 |            1.309 |           4.360% |
| `component/commerce-tour`                             |       3.0042 |          3.872 |            1.611 |          58.391% |
| `component/commerce-transform`                        |       2.4429 |          3.070 |            1.571 |          48.832% |
| `component/commerce-travel`                           |       1.6239 |          1.812 |            1.395 |          23.026% |
| `component/commerce-underline`                        |       2.1879 |          2.274 |            1.299 |          42.869% |
| `component/commerce-value`                            |       2.6907 |          2.803 |            1.302 |          53.544% |
| `component/commerce-value/half-away-from-zero`        |       2.9552 |          3.055 |            1.292 |          57.701% |
| `component/commerce-value/truncate`                   |       2.9945 |          3.041 |            1.269 |          58.257% |
| `component/commerce-visibility`                       |       1.3845 |          1.380 |            1.246 |           9.714% |
| `component/isolated-bracket`                          |       2.2435 |          2.454 |            1.367 |          44.283% |
| `component/isolated-detail-sequence`                  |       1.6624 |          5.108 |            3.841 |          24.806% |
| `component/isolated-leader`                           |       1.8853 |          1.978 |            1.312 |          33.699% |
| `component/isolated-outline`                          |       2.1675 |          2.209 |            1.274 |          42.329% |
| `component/isolated-supply-sequence`                  |       1.9348 |          5.860 |            3.786 |          35.395% |
| `component/isolated-supply`                           |       2.9322 |          3.162 |            1.348 |          57.370% |
| `component/isolated-tour`                             |       2.9173 |          3.148 |            1.349 |          57.152% |
| `component/isolated-transform`                        |       2.1353 |          2.107 |            1.233 |          41.461% |
| `component/isolated-underline`                        |       1.6618 |          1.578 |            1.187 |          24.780% |
| `component/isolated-value`                            |       1.5991 |          1.196 |            0.935 |          21.831% |

### storyComponents: 40 timing failures

| Case                                          | WebGL/legacy | WebGL ms/frame | Allowed ms/frame | Reduction needed |
| --------------------------------------------- | -----------: | -------------: | ---------------: | ---------------: |
| `component/story-bracket`                     |       3.2201 |          3.963 |            1.538 |          61.181% |
| `component/story-detail-sequence`             |       2.9022 |         10.585 |            4.559 |          56.929% |
| `component/story-instances`                   |       5.0074 |          5.978 |            1.492 |          75.037% |
| `component/story-layout`                      |       5.1168 |          6.044 |            1.477 |          75.571% |
| `component/story-leader`                      |       2.7261 |          3.297 |            1.512 |          54.147% |
| `component/story-leader/flow`                 |       3.4071 |          4.172 |            1.531 |          63.311% |
| `component/story-leader/flow-target-matte`    |       2.7371 |         11.529 |            5.265 |          54.331% |
| `component/story-leader/flow-target-inverted` |       3.3811 |         11.163 |            4.127 |          63.030% |
| `component/story-leader/spatial`              |       4.6662 |          7.172 |            1.921 |          73.212% |
| `component/story-leader/morph`                |       4.2613 |          7.779 |            2.282 |          70.667% |
| `component/story-leader/spatial-morph`        |       3.2101 |         10.980 |            4.275 |          61.061% |
| `component/story-leader/appearance-uniform`   |       3.2053 |          3.993 |            1.557 |          61.002% |
| `component/story-mask`                        |       2.4608 |         10.483 |            5.325 |          49.204% |
| `component/story-outline`                     |       3.1566 |          3.622 |            1.434 |          60.400% |
| `component/story-pin`                         |       3.8547 |          5.057 |            1.640 |          67.572% |
| `component/story-sequence`                    |       3.5645 |          4.565 |            1.601 |          64.932% |
| `component/story-stagger`                     |       5.6010 |          6.616 |            1.477 |          77.682% |
| `component/story-state`                       |       4.2277 |          5.426 |            1.604 |          70.433% |
| `component/story-state/blended-container`     |       4.5884 |          7.019 |            1.912 |          72.757% |
| `component/story-state/appearance-uniform`    |       4.2599 |          5.951 |            1.746 |          70.656% |
| `component/story-state/effects-group-grain`   |       1.4197 |         12.574 |           11.071 |          11.953% |
| `component/story-supply-sequence`             |       2.8991 |         10.493 |            4.524 |          56.884% |
| `component/story-supply`                      |       4.3689 |          6.760 |            1.934 |          71.389% |
| `component/story-text-fit`                    |       3.8741 |          5.129 |            1.655 |          67.735% |
| `component/story-tour`                        |       4.4082 |          6.789 |            1.925 |          71.644% |
| `component/story-transform`                   |       4.0694 |          5.837 |            1.793 |          69.283% |
| `component/story-travel`                      |       4.3487 |          5.606 |            1.611 |          71.256% |
| `component/story-underline`                   |       2.8562 |          3.176 |            1.390 |          56.236% |
| `component/story-value`                       |       3.8877 |          4.528 |            1.456 |          67.848% |
| `component/story-visibility`                  |       2.9121 |          3.502 |            1.503 |          57.075% |
| `component/passage-components/instances`      |       5.0647 |          5.951 |            1.469 |          75.319% |
| `component/passage-components/leader`         |       2.7852 |          3.377 |            1.516 |          55.120% |
| `component/passage-components/value`          |       3.5031 |          4.468 |            1.594 |          64.317% |
| `component/passage-behaviors/transform`       |       4.0509 |          5.840 |            1.802 |          69.143% |
| `component/passage-behaviors/state`           |       4.2182 |          5.407 |            1.602 |          70.367% |
| `component/passage-behaviors/travel`          |       4.3656 |          5.591 |            1.601 |          71.367% |
| `component/passage-behaviors/supply`          |       4.4261 |          6.789 |            1.917 |          71.759% |
| `component/passage-timing/visibility`         |       3.0207 |          3.491 |            1.445 |          58.619% |
| `component/passage-timing/text-fit`           |       3.7862 |          5.127 |            1.693 |          66.985% |
| `component/passage-timing/supply-sequence`    |       2.8954 |         10.398 |            4.489 |          56.829% |

### typography: 4 timing failures

| Case                                             | WebGL/legacy | WebGL ms/frame | Allowed ms/frame | Reduction needed |
| ------------------------------------------------ | -----------: | -------------: | ---------------: | ---------------: |
| `typography/editorial/containers`                |       1.3705 |          7.975 |            7.274 |           8.796% |
| `typography/editorial/numeric` (additional miss) |       1.2516 |          6.399 |            6.391 |           0.124% |
| `typography/editorial/appearance-uniform`        |       1.5889 |          8.134 |            6.399 |          21.328% |
| `typography/variable-thai/numeric`               |       1.5133 |          1.921 |            1.587 |          17.399% |

## Conditional exact blur scheduling seam (2026-10-06)

This is a source-level follow-up, not a selected implementation, timing result,
or native count-one solution. The native owned-output cost gate remains the
first decision. Do not start a blur optimization campaign merely because the
full local gate is still running.

[`webgl-box-blur.ts`](../packages/renderer-core/src/composition/render/webgl-box-blur.ts)
currently materializes the final box-sum step into an RGBA32F surface on each
axis, then runs `DIVIDE` to sample that sum and write normalized RGBA8 bytes.
For kernels already eligible for this path (`divisor * 255 < 2^24`), the sum
terms are exact nonnegative integers in float32. A prospective fused final
step could evaluate the _same ordered terms_ at the coordinate that `DIVIDE`
would sample, convert that sum to unsigned integers, add the same half divisor,
and perform the existing integer reciprocal multiplication directly into the
RGBA8 destination. The intermediate RGBA8 rounding **between axes must remain**.
The first axis writes the scratch surface; the second writes the original
blur destination. Neither may sample its own active output attachment.

The removed operation would be one RGBA32F final-sum write and one RGBA32F
read per axis, plus two passes. Other sum fetches, earlier float surfaces,
preparation/upload, source thresholding, blend, queue completion and full owned
readback remain. Eliminated logical texels must be counted using the actual
axis extents and scissor regions; pooled allocation dimensions are not executed
area. This differs from the earlier unspecialized full convolution attempt:
it preserves the established specialized box plan and targets a specific
materialization boundary. That distinction establishes no elapsed saving.

Before selecting it, attribute the actual final-sum/divide work for the original
`commerce/atom-glow` payload and compare a conservative saving bound with its
unchanged whole-frame budget. The current warmed diagnostic shows 23.66 ms
WebGL versus 14.45 ms legacy (18.0625 ms at 1.25×), so a closure claim would need
at least 5.5975 ms total saving on those **diagnostic** observations. They do not
replace paired strict acceptance or isolate that stage's cost. A two-pass count
reduction alone cannot establish that saving.

Any later bounded proof must cover both axes' coordinate origins, padded support,
odd/even box lengths, fractional radii, clipped edges, sparse/full painted bounds,
transparent channels, chained filters and both GPU profiles. Compare unchanged
production bytes, reverse/random seeks and retained outputs. Keep all overflow,
size, memory and raster fallback gates. If the attributable removable cost cannot
bridge the budget, reject this as a closure mechanism before production edits.
