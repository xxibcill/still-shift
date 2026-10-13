# Hinged load-stop cable-tie candidate

Create it with `createCableTiePack({variant: "hinged-pawl-frame-stop"})`, or select
`load-stop` in family discovery. Existing standard and releasable tie identities
remain fixed. This candidate models additional loading after normal locking.

The rigid pawl has a primary tooth, protected second tooth and semicylindrical
stop. A cutaway frame provides the stop ledge, guide and web root. The compound
`load` control uses `loadNewtons` with the [declared illustrative law](./mechanism-load-seat.md).
Primary contact remains constrained; the secondary-tooth and stop gaps decrease
to zero as seating completes. Additional prescribed load holds the poses.
Dimensions and SI force/compliance values are authored choices, not measured
material properties or product ratings. The physical profiles simplify the
patent drawing; no measured friction or manufacturing fidelity is claimed.

`seated-flexible-web-1` attaches a closed rectangular strip to two rigid `seat`
anchors. Its two complete end rings are `seat-a` and `seat-b`. The planar cubic
centerline follows both posed endpoints and local terminal tangents; vertex,
index and UV topology stays fixed while positions and normals change. Source
and native observation declarations seal this generator and exact landmark
inventory. Width axis, span limits, thickness and longitudinal segments are
bounded. Nonplanar, out-of-span, backward-facing and excessive sampled curvature
inputs reject with located errors. This is illustrative deformation rather than
a stress/strain calculation or a general flexible-body solver.

Owning checks sample 101 forces, 41 surface states and 123 triangle-overlap states, including primary contact,
monotonic second-tooth/stop gaps, sampled tooth/stop-plane nonpenetration, independent pawl/ledge triangle clipping, attached
web ends, hard-stop saturation, admitted dimensions and uniform mounts. Those
checks establish the declared geometric model. Native used-stream evidence,
continuous collision, source/design fidelity and whole episode reviews have
separate gates in the [results record](./mechanism-shorts-ms3-load-asset-results.json).

Patent [3,872,547](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/3872547),
Figures10/11 and printed column8 support the qualitative normal-lock to ultimate-
load topology: the first tooth already engages; the second tooth and frame stop
join under further loading while hinge deformation permits bounded shifting.
The original frozen E06 question remains unchanged.

The earlier `ae70d735` candidate retains its 126-frame native evidence in the
[historical asset record](./mechanism-shorts-ms3-load-asset-results.json). It exposed
an upper-left hinge-placement mismatch. The current repair attaches the web to
the rear pawl underside and the stop-bearing frame ledge; both end tangents follow
their seats. It checks shortening through seating and web clearance against the
pawl/adjacent frame solids across the admitted pitches. The repaired source now has126 native/decoded frames and captured shortening/
attachment proof. A first audit rejected tiny packed-coordinate contact at the
intended attachment; the corrected audit verifies terminal-only Float32 normal/
lateral envelopes and keeps the strict overlap gate elsewhere. Current tiers and
the remaining episode reviews are tracked in the
[alignment record](./mechanism-shorts-ms3-load-alignment-results.json).
