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

The intended outline triangulator is [Mapbox Earcut 3.0.2](https://github.com/mapbox/earcut/tree/v3.0.2),
under its ISC licence. Dependency installation, alpha-contour extraction, holes,
disjoint islands and bounded refinement remain implementation work. Pin positions
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

## Remaining acceptance

1. Add alpha-outline extraction, licensed triangulation and bounded refinement.
2. Implement starch, overlap and Canvas/WebGL textured mesh rendering with bounded
   allocations and cleanup; preserve CE15 cache/dependency behavior.
3. Add the native arm/house demo, expression/constraint example and story-acting
   documentation; test the complete authored pin ranges for triangle flips.
4. Run focused solver, authoring, browser, export and baseline checks; review the
   complete implementation before the required final local gate.
5. Complete `pnpm check` on the final code checkpoint, record evidence and push.
