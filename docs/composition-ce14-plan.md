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

## Remaining acceptance

1. Extend mesh rendering coverage to the authored demo, transforms and CE15
   cache/dependency behavior.
2. Add the native arm/house demo, expression/constraint example and story-acting
   documentation; test the complete authored pin ranges for triangle flips.
3. Run focused solver, authoring, browser, export and baseline checks; review the
   complete implementation before the required final local gate.
4. Complete `pnpm check` on the final code checkpoint, record evidence and push.
