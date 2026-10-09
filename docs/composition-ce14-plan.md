# CE14 — Mesh warp and puppet pins

Completed on 2026-10-09 on `codex/composition-ce14`, based on completed CE15
`efa42f42`. The owner requested full implementation, verification, documentation,
and frequent meaningful commits and pushes. No merge or scheduling is requested.
The owner's separate checkout remains untouched; GitHub Actions are prohibited.

## Scope and decisions

Implement the [CE14 requirements](./composition-engine-plan.md#ce14--mesh-warp-and-puppet-pins):
2×2 through 8×8 Bezier controls, an alpha-outline puppet mesh, animated pins,
starch regions, stable overlap order, constraint/expression authoring and both
Canvas and WebGL rendering. The acceptance demo must bend an arm and squash a
house using pins only, preserve repeated exports and stay free of triangle flips.

Use deterministic rigid moving least squares: the closed-form 2D rigid fit uses
weighted centroids and normalized dot/cross covariance in a fixed serial order.
There is no iterative convergence criterion or parallel reduction. See
[Schaefer, McPhail and Warren, section 2.3](https://people.engr.tamu.edu/schaefer/research/mls.pdf).
Record degenerate-fit behavior, topology limits and flip diagnostics with the
solver implementation and verify exact pin targets and rigid-motion preservation.

The pinned outline triangulator is [Mapbox Earcut 3.0.2](https://github.com/mapbox/earcut/tree/v3.0.2),
under its [bundled ISC licence](./licenses/earcut-3.0.2.txt). Alpha-contour extraction,
holes, disjoint islands, pin insertion and bounded refinement are implemented. Pin positions
and mesh controls use a bounded `points` effect descriptor, retaining existing
per-point property paths, keyframes, expressions, baking and timeline editing.

## Checkpoints

### 2026-10-09 — Animated geometric point controls

The shared effect contract accepts 0–64 points within each descriptor's declared
coordinate and count bounds. Whole-list keys retain topology; individual points
support vector and separated-axis keys. Paths through `p63` resolve to vectors
and components. Whole collections cannot be expression operands/targets; their
individual points can. The evaluator clamps final coordinates to the descriptor,
and the builder, expression baker and Lab key tracks preserve indexed controls.
Existing color-curve limits remain unchanged.

Focused acceptance: 177 tests across point collections, color curves, effect
contracts, warp mappings, key tracks, expressions and baking pass. Initial tests
failed because the descriptor was missing; a later test incorrectly mutated an
already evaluated document and was corrected to use a fresh immutable document.
TypeScript, changed-file lint, generated schema freshness and package boundaries
also pass.
No solver, renderer, demo or full milestone gate is claimed yet.

### 2026-10-09 — Mesh contracts and deterministic geometry

`distort.mesh-warp` declares row-major normalized controls, a layer-local origin
and size, 2–8 rows/columns and bounded tessellation. `distort.puppet` declares up to
32 rest/target pins and eight starch/overlap regions. Cross-parameter validation
runs after expressions: dimensions/counts must agree, rest pins are distinct,
region radii are positive and starch strength lies between zero and one.

The rigid MLS solver preserves rigid motions and exact pin targets. Zero pins
are identity; one pin translates. A collapsed covariance produces a diagnostic
rather than a nonfinite transform. Reductions always use authored pin order.
Starch applies one local rigid fit throughout a region's inner half-radius and
smoothly falls off at its edge; later regions blend after earlier ones and exact
pin constraints win. Overlap uses source-triangle centroids, the last matching
region's depth and original triangle index as a stable tie-breaker. Flip detection
compares each triangle to its original winding and rejects collapsed areas.

All 58 focused geometry/contract/plugin/point/curve tests pass. TypeScript,
changed-file lint, generated schema/reference freshness and boundaries pass.
This is a geometry checkpoint: native rendering and alpha topology are not yet
implemented, so no visual or milestone acceptance is claimed.

### 2026-10-09 — Alpha topology and triangulation

Exact thresholded pixel-cell boundaries retain transparent holes and disconnected
islands, including diagonal contacts and opaque islands nested inside holes.
Collinear boundary segments are removed without changing coverage. Earcut 3.0.2
triangulates each outer contour with its owned holes; an area-deviation check
rejects invalid output. Source pin positions must lie on/in the alpha silhouette;
shared-edge insertion splits every incident face. Zero to three fixed midpoint
refinement passes retain shared vertices and pin coordinates.

Limits are explicit: 65,536 boundary edges, 8,192 simplified outline vertices,
32,768 mesh vertices and 65,536 triangles. Exceeding a limit produces a diagnostic;
the engine does not truncate the silhouette. Highly fragmented masks are covered
by a budget-failure regression. The renderer integration must admit temporary
geometry capacity and pixel buffers before invoking these routines.

All 29 focused topology, solver and native-contract tests pass, including every
one of the 512 binary 3×3 masks checked against independent pixel coverage and
area. TypeScript, changed-file lint and package boundaries pass. Pixel rendering,
production export and complete milestone acceptance remain pending.

### 2026-10-09 — Canvas and WebGL textured meshes

Both backends now consume the same bounded geometry and ordered triangles. WebGL2
fetches packed vertices from an admitted floating-point texture; the Canvas
reference performs triangle-by-triangle affine, bilinear premultiplied texture
sampling with half-open edges and ordered source-over compositing. Geometry,
control textures, readbacks and raster buffers participate in managed ownership.

The pinned Chromium software renderer reports four subpixel bits. An initial
unsnapped reference differed at triangle edges (raw channel differences up to
136); both backends now receive destination vertices rounded to the same 1/16
pixel grid (at most 1/32 pixel per axis). Flip detection runs after this delivery
quantization. Solver pin targets remain exact. Pixel tolerances were not relaxed:
Bezier matches exactly; puppet differs by at most one raw/alpha byte and zero
premultiplied bytes. Reverse seeks match exactly. Six real success, metadata-denial
and injected-draw-failure cases leave zero managed pixel/metadata owners.

44 focused units, TypeScript, changed-file lint, schema freshness and package
boundaries pass. The existing native effects browser regression also passes,
including six repeated, byte-identical 60-frame production exports. The new mesh
browser check is in the required local test chain. This remains focused evidence;
the authored demo, production mesh export and full milestone gate are pending.

### 2026-10-09 — Pin-only acting and production export

Original static SVG artwork and two native compositions demonstrate an arm bend,
house squash and a hand following a prop. The acceptance composition animates
only pins; the second example uses an attach-constrained null helper, scalar
drivers reading its solved position, and an elbow expression. Expressions cannot
read post-constraint values; the driver bridge is tested over all 48 frames and
expression baking retains every pin value. Story-acting documents the distinction.

The first demo probe exposed skinny Earcut triangles that flipped under tiny
movements. Keeping continuous geometry only did not fix the actual mesh flip and
also failed the strict cross-backend pixel test; that experiment was rejected.
Eight fixed, serial quality-improving edge passes after pin insertion and each
refinement repair triangulation quality without moving any vertex, changing the
boundary, or relaxing flip/pixel checks. Workspace admission includes the edge
map and touched-face set. Independent regressions preserve area and boundaries,
reject concave swaps, retain equal-quality diagonals and prove deterministic output.

Every frame of both 48-frame demos passes both renderers' delivered-geometry flip
guard; reverse seeks match and 47 frames are distinct. The rendered gesture was
visually inspected. Eight production exports (repeat, one/four workers, cache on/off,
each backend) have identical encoded bodies and all 48 decoded frames within each
backend. Art checksums are pinned. 14 focused topology/quality/demo units, TypeScript
and changed-file lint pass. Renderer identities advance to Canvas 1.47.1 and WebGL
0.68.1 for the topology change; final acceptance will reverify these identities.

### 2026-10-09 — Review repairs and final focused acceptance

The two-axis implementation review found an offscreen-silhouette defect and its
coordinate/visibility interactions. Bounded captures now retain the complete
transformed input plus the viewport. Inherited clips apply after restoring the
original coordinates; invisible, out-of-range, matte-only and zero-opacity group
descendants do not enlarge captures. Scope effects retain an explicit original
viewport window, including referenced inputs; native region replacement preserves
transparent output. Offscreen pixels remain untreated by scope effects until a
later mesh moves them into view. This compatibility rule is documented in the
story-acting guide. Layer-space effects receive translated placement normally.

The final focused browser check covers sixteen cross-backend pixel frames:
2×2 and animated 8×8 controls, reflection, quarter-turn puppet placement, starch,
and both visible overlap orders. Raw RGBA difference is at most two bytes, alpha
and premultiplied difference at most one; the overlap cases match exactly.
Independent offscreen oracles compare deformation against ordinary image motion,
including fully offscreen source recovery, opacity, inherited collapsed-precomp
clips, hidden descendants, viewport vignette/grain/wipes, referenced inputs and
transparent region replacement. Twelve real managed success/denial/draw-failure
cases leave zero pixel/metadata owners and preserve the original failure.
Both 48-frame demos, reverse seeks and all eight production export permutations
pass again on Canvas 1.47.2 / WebGL 0.68.2. Spec review has no further concrete
finding; Standards' final zero-opacity finding is fixed and covered by the oracle.

`pnpm check:fast` passes all 3,597 units in 338 files plus schema, boundaries,
formatting, lint and TypeScript. The first run exposed the intentional renderer
identity change and missing new built-in catalogue cases; the identity expectation
was recomputed from the pinned request and a separate mesh catalogue was added.
The native-effects catalogue initially stopped only because the new case had no
baseline; all original frame hashes matched. A separate CE14 hash record preserves
every original CE6/frozen baseline. The final retry passes all seven catalogues,
existing native-effect pixels/seeks and repeated exports. The toolchain, browser,
Python imports and isolated optimizer/config caches pass preflight.

## Completion record — 2026-10-09

CE14 is complete. The complete local `pnpm check` passed on clean final code
`f78a9e267b0a0d3a1ad1fb5bf213439f12cc0eb3` in **14,375.23 seconds** (3h 59m 35s),
from 07:49:40 to 11:49:16 +07:00. All 82 package commands completed with exit 0:
3,597 unit tests / 338 files, 83 runtime tests / 13 files, 314 integration tests /
54 files, Python/depth checks and every required browser/export/default suite.
All **176 frozen items / 36,061 frames** match in 346.96 seconds. Original frozen
references and pixel thresholds are unchanged; the separately recorded CE14 mesh
catalogue also passes. Existing owner-deferred CE6-P WebGL timing remains deferred.

The full gate reverified both complete 48-frame demos without triangle flips,
all mesh pixel/offscreen/ownership oracles and eight production export permutations.
Encoded bodies and all decoded frames match within each backend across repeated
runs, one/four workers and cache on/off. No production repair or gate restart was
needed after the final checkpoint. Only completion documentation follows it.

Gate log SHA-256: `d66ada96369773a5dc604fe9e270c119a517434e617f11b2183c51b09caa09c7`.
Exact commands, timings, artifact paths and hashes are retained in
[CE14 results](./composition-ce14-results.json). CE15 remains complete in
[PR #49](https://github.com/xxibcill/still-shift/pull/49); CE14 is delivered on its
separate branch. No merge or scheduled work was performed. No CE14 acceptance work,
blocker or owner decision remains.

## PR #50 review repair — 2026-10-09

The posted P2 finding showed that a group capture measured each descendant before
its first mesh effect. Moving a child offscreen with a mesh therefore discarded
its output before the parent puppet could bring it back; the equivalent ordinary
translation worked. Capture bounds now retain descendant output and intermediate
extents through nested group effect stacks. Bezier control hulls bound patches;
rigid MLS and starch use conservative centroid/radius enclosures, with exact bounds
for uniform translations. Only group ancestors process descendant pixels; ordinary
transform parents' effects are excluded. Existing capture and memory caps remain.

The original failure and an implementation-review transform-parent failure were
reproduced before their repairs. All 32 new cross-backend full-frame oracles pass,
covering both mesh types, both directions, direct/nested groups and unrelated
transform parents. 84 focused unit/graph tests, types, lint and boundaries pass.
The complete mesh browser suite passes its pixel, ownership, forward/reverse demo
and eight production export checks. All seven native-effects catalogues and
repeated exports pass; details are recorded in the
[review results](./pr-50-review-fix-results.json).

Renderer identities advance to Canvas 1.47.3 and WebGL2 0.68.3. This is a focused
review repair, not another complete repository gate. The original milestone gate
above remains evidence for its named checkpoint; no frozen baseline or pixel
threshold is changed. One finding is delivered in one commit and one final push.

## PR #50 completeness review repairs — 2026-10-09

The independent completeness review posted two P2 findings on `958e623a`:
[raster degeneracy](https://github.com/xxibcill/still-shift/pull/50#discussion_r4226871398)
and [structured diagnostics](https://github.com/xxibcill/still-shift/pull/50#discussion_r4226871400).
The prior descendant-capture repair remains included.

The raster repair checks continuous deformation before Float32/1⁄16-pixel delivery,
then compacts raster-only degenerate faces in original draw order. Genuine folds
and collapses still reject. Identity source coordinates follow delivered vertices
so small grids and edge pins sample exact original pixel centers. No solver,
triangulation, pixel threshold or existing baseline is relaxed. Canvas 1.47.4 /
WebGL 0.68.4 invalidate render caches. The pinned request digest changes only
with these renderer identities.

Two newly added regressions fail on the prior code; all 44 affected unit tests
now pass. Eighteen independent ordinary-image comparisons (small animated scales,
near-edge pins and 1°/2°/12° rotations) are byte exact on both backends, with exact
reverse seeks. Pinned toolchain, TypeScript, changed-file lint and boundaries pass.
The first pixel probe exposed seven-byte identity sampling drift; matching identity
source coordinates fixed it, without changing the oracle.

The diagnostic repair converts mesh-origin failures to structured `PassageError`
records. Both renderer backends attach the full instance node, root frame and
authored parameter path, including nested precomp definitions and the invalid
rest-pin index. Symbol metadata carries location through effect stacks without
changing visual cache keys. Unrelated native/ownership failures remain unchanged.

All 112 focused units, TypeScript, changed-file lint and boundaries pass. The
complete mesh browser command passes its pixels, 46 offscreen comparisons, 18
exact identity comparisons, twelve preview diagnostic cases, twelve ownership
cases and both 48-frame demos with exact reverse seeks. Eight valid production
exports match encoded bodies and all decoded frames across repeats, one/four
workers and cache modes. Eight invalid exports preserve structured pin/fold
diagnostics and leave no video or sidecars. All seven native-effects catalogues
match frozen references; 42 hardware comparisons retain the existing policy and
six native fixtures have byte-identical repeated 60-frame exports.

Three initial combined runs stopped in the new diagnostic fixture: four workers
were requested for three frames, so option validation correctly rejected it.
A four-frame fixture exercises the intended mesh failure; no export-worker repair
was required. The final combined command passes. Existing thresholds and baselines
remain unchanged. These are scoped follow-up checks, not a repeated full milestone
gate. Both posted findings have one dedicated commit, followed by one final push.
Detailed evidence: [completeness-review repairs](./pr-50-ce14-review-repairs-results.json).

## PR #50 collapsed owner repair — 2026-10-09

The [posted P2 finding](https://github.com/xxibcill/still-shift/pull/50#discussion_r4227184424)
reproduced twelve valid identity-mesh failures on `3002f0d1`: owner scale `[0,0]`,
`[0,1]` or `[1,0]` aborted both mesh types/backends while ordinary artwork rendered
transparent. Mesh evaluation and descendant bounds now preserve exact collapse
from the original transform factors, returning empty before inversion or fold
validation. This also handles a zero-scaled parent rotated 37° with a child rotated
29°, whose multiplied matrix can acquire a tiny nonzero determinant from rounding.
No epsilon classification is introduced.

Owner collapse and coordinate-reference collapse remain separate. Earlier scope
generators can supply visible input in a valid external space; later effects still
run. Nonzero recovery restores deformation/pin checks. Small nonzero scales,
reflections and genuine authored fold rejection retain the existing rules.
Renderer identities advance to Canvas 1.47.5 / WebGL2 0.68.5 to invalidate caches.

Final focused checks pass: 126 units in sixteen files, TypeScript, package
boundaries and changed-file lint. The complete mesh browser command includes
76 new cases / 88 byte-exact ordinary-render frame comparisons and twenty exact
reverse/random seeks. It preserves all previous pixel, raster, offscreen,
diagnostic, ownership and 48-frame demo checks. Sixteen direct-collapse and eight
rotated-parent production exports match independent ordinary-layer outputs for
all four decoded frames, including empty frames and visible recovery. Repeats,
one/four workers and cache variants retain identical encoded/frame proofs within
each backend and mesh kind. The existing eight 48-frame export proofs also match
the previous accepted repair exactly; eight invalid exports preserve diagnostics
and cleanup.

All seven native-effects catalogues, 42 hardware comparisons under the unchanged
policy and six repeated 60-frame native export fixtures pass. All 216 tracked
visual-reference files are byte-identical to the reviewed head. No existing
threshold, frozen reference, acceptance command or GitHub Actions policy changes.
This is focused repair verification; no complete repository gate is rerun or
claimed. The historical milestone gate retains its named checkpoint above.

The initial regression run failed three tests as expected. An intermediate
external-space test incorrectly demanded empty geometry instead of empty raster
output, and the new helper initially used the wrong erased typed-array annotation;
both are corrected. Independent review caught the rounded-product provenance
case before delivery, and final checks rerun after that production change.
One finding is delivered in one commit followed by one final normal push. Detailed
logs, artifacts and source fingerprints: [collapsed-mesh repair evidence](./pr-50-collapsed-mesh-fix-results.json).
