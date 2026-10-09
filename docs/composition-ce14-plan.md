# CE14 — Mesh warp and puppet pins

Active implementation on `codex/composition-ce14`, based on completed CE15
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

## Remaining acceptance

Run the required full local `pnpm check` on the final committed code checkpoint,
including the frozen baselines; record final evidence and push. Focused evidence
above is not a complete repository gate. Expected cost is approximately four
hours, based on CE15's 13,928-second full gate. No code changes are planned during
that run unless a failing check demonstrates a necessary repair.
