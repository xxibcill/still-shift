# Deterministic crowded cue labels

The supplied-cue compiler now plans screen-pinned annotation placement for the
complete visible cue interval. Every annotation keeps one position throughout that
interval. Text, backing and leader start move together; native anchor binding still
controls the moving leader endpoint and actual hidden/occluded behavior.

Existing authored positions are locked by default. Opt into reflow with an annotation
`layout` object; its preferred position is tried first, followed by at most eight
ordered alternatives. Explicit locks ignore alternatives. Higher priority wins
preference, with stable annotation IDs breaking ties. Locks are resolved before
movable labels. The solver backtracks when an early preference prevents a complete
placement, so a feasible arrangement is not rejected by a greedy choice.

```json
{
  "id": "hook-face",
  "text": "Face",
  "anchor": "hook.outerFace",
  "position": [18, 18],
  "layout": {
    "locked": false,
    "priority": 10,
    "candidates": [[140, 18]]
  }
}
```

The cue's optional `layout` config supplies `safeInsetPixels` (default 8),
`gapPixels` (default 4), and up to eight `protectedAnchors`, each with a declared
`radiusPixels`. Safe area, caption backing, other label backings and protected
contact boxes are exclusions. Protection evaluates the actual family pose and
compiled camera/rig tracks at every integer output frame of the visible cue;
projected in-frame contact regions are conservatively excluded even when occluded.
The solver streams those frames and retains candidate flags, not all scene poses.
Fractional-time contact crossings and continuous motion require separate QA.

The fixed annotation backing encloses the authored text box. Compilation uses this
conservative envelope; actual font measurement and encoded glyph readability remain
render checks. The `labelLayout` receipt identifies each cue, placements, candidate
indices, lock/priority, envelope, checked frames and projected-frame count. No valid
arrangement produces `mechanism-cue-layout-conflict` with cue/frame, conflicting IDs
and blocked region evidence. Search is capped at 65,536 candidate visits per cue;
`mechanism-cue-layout-budget` identifies exhaustion separately from a proved conflict.
Unknown or duplicate protected anchors are rejected. This is not unrestricted packing,
a temporal hysteresis solver, or complete process memory accounting.

Saved annotation replacement can change copy, preferred placement and candidates
through the existing revision/hash CAS patch. Camera edits trigger the same full
recompile and contact prepass. Native source geometry and narration samples remain
pinned; the lifecycle conservatively rerenders the whole cycle. The cable-tie pack
adds `strap.outerSurface`, a parameter-derived point on its actual exterior flat
surface, so labels can use an exposed target rather than an internal landmark.
That changes the source/metadata identity; it does not change mesh geometry.

The crowded browser proof checks actual font bounds and requires both labels to be
fully painted with complete copy and GPU-observed visible anchors on every frame.
It compares all forward/reverse/shuffled preview pixels, then repeated final encoded
video, all decoded frames and decoded audio, with independent final native replay.
The initial hidden-label fixture was rejected as inadequate evidence after sampled
image inspection. Synthetic PCM and small diagnostic frames remain engineering
fixtures; full encoded readability, broader labels/world/surface routes, continuous
contact, production narration and human acceptance remain separate gates.
See [evidence](./mechanism-shorts-ms2-cue-layout-results.json) and
[the current cue lifecycle](./mechanism-cue-lifecycle.md).
