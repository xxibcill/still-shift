# Story Motion implementation — v0.13

**Updated:** 2026-09-26. All seven reusable recipes are implemented, with rendered fixtures, lab controls and CLI export. S01E01-specific asset preparation, narration conformance and episode integration remain in progress under the [episode roadmap](s01e01-story-motion-roadmap.md).

## Try the results

The [seven-preview gallery](../benchmarks/results/story-motion-v008/index.html) contains eight-second 1080p/24 fps MP4s, sampled motion sheets and entry/exit handoffs. All seven use the shared original vector kit, pinned Source Serif 4/IBM Plex fonts and distinct compositions. The latest [brush-line pass](story-motion-brush-lines.md) adds expressive pigment edges and split-nib texture to narrative connections. These are symbolic graphics, not authentic evidence or a completed episode.

Run `pnpm lab`, open `/illustrated.html?collection=story`, and choose a recipe from **Story Motion**. Playback, exact-frame scrubbing and **Narration timing** use the same compiler as export. The timing controls validate edits before updating the preview; **Download scene** saves the prepared JSON. Downloaded files retain relative asset paths, so place them in the fixture directory or update those paths before export.

```sh
pnpm story:prepare
pnpm still-shift animate-scene \
  --scene benchmarks/fixtures/story-motion/access-constraint.json \
  --output /tmp/access-constraint.mp4
pnpm story:render --output-dir benchmarks/results/story-motion-next
pnpm test:browser:story --renders benchmarks/results/story-motion-next
```

Use a new output filename/directory for each render. Existing output artifacts are protected from overwrite. Re-preparation changes fixture bytes; render again before checking source-checksum parity.

## Implemented recipes

| Recipe               | Actual behavior                                                                                                                      | Fixture                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `unequal_margins`    | Fixed matched households and shared reference; independently translated qualitative pressure markers; consequence labels.            | [Unequal Margins](../benchmarks/fixtures/story-motion/unequal-margins.json)       |
| `access_constraint`  | Two continuous routes; rotated restriction sides move around one straight route, with validated positive clearance. No gap or token. | [Access Constraint](../benchmarks/fixtures/story-motion/access-constraint.json)   |
| `relationship_build` | Narration-window path reveals and destination entrances; successive emphasis and regrouping; connectors stay attached.               | [Relationship Build](../benchmarks/fixtures/story-motion/relationship-build.json) |
| `evidence_boundary`  | Supported groups assemble, shift to make space for explicit unknowns, then introduce a separate composite reference.                 | [Evidence Boundary](../benchmarks/fixtures/story-motion/evidence-boundary.json)   |
| `dated_system_break` | Readable context precedes ordered gaps; optional exact-frame cut replaces the whole dated system with a separately authored context. | [Dated System Break](../benchmarks/fixtures/story-motion/dated-system-break.json) |
| `category_swap`      | One image switches between authored states on an exact frame; surrounding anchors and qualifier remain fixed.                        | [Category Swap](../benchmarks/fixtures/story-motion/category-swap.json)           |
| `motif_resolve`      | Declared motifs move between authored poses, then attention narrows to an outgoing relationship.                                     | [Motif Resolve](../benchmarks/fixtures/story-motion/motif-resolve.json)           |

No animation dependency was added. Existing illustrated v1 and cinematic v2 inputs retain their original behavior and limits.

## Authoring contract

The [story schema](../packages/scene-contract/src/story.ts) adds `schemaVersion: "story-scene-1"`. Supply `frameCount`, `fps`, assets, nodes and one recipe. The node/asset vocabulary is shared with prepared illustrations. `episodeStartFrame` is optional metadata; it never shifts clip-local evaluation.

Frames are zero-indexed. Windows have integer `start` and `end` keys, with `end > start`. At `start`, the previous value still holds; at `end`, the destination is reached and held. Both keys must be rendered frames (`0..frameCount-1`). A `cue` string labels the window for narration authoring; it does not perform speech alignment. Optional `easing` selects `linear`, `smoothstep`, `out-cubic`, `out-quint`, `in-cubic` or `in-out-quint`. Omission preserves the original smoothstep. The lab exposes the same easing choices beside each event window. Changing fps preserves frame numbers and therefore changes elapsed seconds. Conform event frames explicitly when changing delivery rate.

```json
{
  "frameCount": 646,
  "fps": 24,
  "episodeStartFrame": 4748
}
```

This timing fragment represents exactly 26,916.666… ms. The compiler derives duration from the frame count. Story results use `story-result-1`, allow fractional milliseconds, and validate the exact frame authority; legacy result schemas stay unchanged. Encoded MP4 frame counts are verified by the existing export worker.

`moves` on relationship/evidence/resolve recipes specify a node, window and absolute parent-local target `x`/`y`, optionally uniform `scale` and `rotation`. `emphasis` provides readable opacity targets. Multiple events accumulate into one track; overlapping writes to the same property are rejected. All evaluation is a function of the requested frame, so seeking never needs prior playback or callbacks.

For independently moving endpoints, declare `connectors: [{path, from: {node, point}, to: {node, point}}]`. Anchor points are in the referenced object's local coordinates; the renderer evaluates every ancestor transform. Bound paths use root coordinates, with no separate transform or parent. Optional `bend` authors a gentle quadratic bow in pixels; it is capped at 22% of the current endpoint distance. Both ends remain attached through object movement. This is authored routing, not automatic layout. Access Constraint retains its own fixed straight local route and cannot use these bindings.

Paths can opt into `lineStyle: "ink"` for a smooth tapered stroke, or `lineStyle: "brush"` for expressive pressure, translucent edges and dry split-nib streaks. Both stay inside their declared `lineWidth`; brush texture is fixed in path coordinates and seeded by node ID, with no frame-random noise. `endArrow` is reserved in the supplied scenes for the explicit land-to-claims direction; restricted access routes reject it. Brush arrows use the same stroke treatment. Relationship branches may provide a separate `arrival` window; comparison recipes may supply two `labelWindows`. This separates drawing, arrival and consequence timing without callback chains.

Category states use the existing image-state array. Optional `stateLabels` identify text nodes with authored `states`; their captions switch on the same exact frame as the image. Register crops, baseline and visual center during preparation; matching canvas dimensions alone cannot prove registration. The recipe uses a discrete switch, with no intermediate raster morph.

Restriction sides accept rectangles or clipped illustration groups with positive bounds. Group clipping keeps the entire artwork inside the envelope used by clearance validation.

An optional `fonts` manifest provides `{id, path, sha256, weight}` entries. Text nodes select one with `fontAsset`; the loader verifies bytes and awaits decoding before drawing in preview or export. IDs must be unique across fonts and images. Missing files, changed hashes and undecodable faces fail preparation. Omitted fonts preserve legacy behavior.

Dated System Break can omit `reset` when the episode assembly owns the next shot. When present, `reset` names a distinct group/context and a later frame; the previous system disappears on the same frame that the later group appears. There is no recovery tween.

The [line and timing refinement](story-motion-line-timing-refinement.md) records motion choreography. The subsequent [brush-line refinement](story-motion-brush-lines.md) records the latest graphic treatment and comparison.

## Implementation and verification

- [Shared compiler](../packages/renderer-core/src/story-scene.ts): validated event accumulation, clamped smoothstep tracks and discrete changes.
- [Geometry](../packages/renderer-core/src/story-geometry.ts): anchor projection through parent transforms.
- [Bindings](../packages/scene-contract/src/story-validation.ts): required roles, timeline bounds, asset graph, stable qualifiers, open aperture, category references and date-before-break ordering.
- [Lab controls](../apps/lab/src/story-controls.ts): cue edits, exact-frame jumps and prepared JSON download.
- [Unit checks](../tests/unit/story-scenes.test.ts) and [browser/export checks](../tests/browser/story.ts).

Initial engine verification on 2026-09-26 (before the subsequent art pass; see the [updated 153-test and 70-comparison evidence](story-motion-visual-implementation.md)):

- TypeScript build and ESLint on changed code passed.
- 148 unit/integration tests passed, including nine new story tests. The initial sandbox run failed on denied process/IPC operations in existing tests; the unrestricted local rerun passed.
- All seven 192-frame clips exported: **1,344 frames / 56 seconds** total. Each render took approximately 2.0–2.4 seconds on this machine; this is fixture-specific throughput, not a production benchmark.
- [Story parity report](../benchmarks/results/story-motion-v002/parity-report.json): **63 preview/export comparisons**, seven pixel-identical backward seeks, valid/invalid timing edits, phone layout, a real **646-frame / 24 fps** export and **192-frame / 30 fps CLI** export passed.
- Legacy illustrated checks passed: **42 preview/export comparisons**, six alternate scenes, both frame rates and asset integrity.
- Cinematic compatibility checks passed: **31 frame comparisons**, two compositions, 24/30 fps, repeat determinism and coverage rejection.
- Pinned toolchain verification passed with Node 22.23.1. Initial story runs used the host's Node 24.16.0; the implementation is also type-checked under the pinned toolchain.

Visual inspection used sixteen sampled temporal frames per clip, plus exact event-boundary comparisons; no claim of real-time narrated playback review is made. It caught and corrected the access-label/restriction overlap and the conclusion-label overlap. Browser QA also found and fixed timing-control overflow at phone width.

## Remaining episode work

The recipes are executable. The complete S01E01 sequences are not yet assembled. Prepare the protected-shot derivatives through the episode workflow, conform internal cues to the corrected narration, preserve registered motifs across shot boundaries, and inspect narrated playback. Keep the locked 11,297-frame episode, its existing opening/hero assets and historical qualifications.

The original 646-frame timing test has now been supplemented by the [narrated ST-013/014 graphic candidate](../benchmarks/results/story-motion-s01e01-proof-v007/index.html). It uses the existing narration and unchanged household poses across the cut. It remains a local candidate outside the selected episode timeline. The gallery handoffs describe fixture poses and checksums; the proof handoff adds master-frame boundaries and narration identity. Remaining episode handoffs must verify selected-source lineage and context at each edit.
