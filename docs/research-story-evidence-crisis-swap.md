# Research: Evidence Boundary, Dated System Break, Category Swap

Researched 2026-09-26. Preparation for [the S01E01 story-motion roadmap](s01e01-story-motion-roadmap.md). These names are Still Shift proposals, not established presets supplied by the cited tools. This note studies documented implementation examples and APIs; it does not claim to have watched reference videos or verified S01E01's historical sources again. No engine implementation is included.

## Recommendation and existing foundation

Use three distinct visual grammars: **disclose and separate evidence**, **break selected relationships then cut context**, and **replace a category in a stable slot**. Reuse the Canvas renderer and absolute-frame evaluator. Import the techniques, not additional animation runtimes.

Local observations from [the prepared contract](../packages/scene-contract/src/prepared.ts), [the compiler/evaluator](../packages/renderer-core/src/prepared-scene.ts), and [the renderer](../packages/renderer-core/src/illustrated-renderer.ts):

- Image nodes already have authored `states`; `pose_prop_change` uses stepped state changes. Drawing selects one state rather than blending two images.
- Group nodes support rectangular clipping. They do not provide a general animated arbitrary matte. The first evidence proof can move a supported group within a fixed clip; animated clip geometry should be added only if the proof requires it.
- Paths already expose `gapAt`/`gapSize`; drawing omits an interval around that location. `crisis_fracture` staggers gaps and pulses, so no destruction simulation is needed.
- Legacy recipes scale built-in millisecond schedules against a seven-second reference. The v1 prepared contract permits 3–8 seconds. Narration-aligned events and the long episode passages therefore need the roadmap's additive timing/compatibility work; simply lengthening the current recipe would stretch every beat.
- `sampleTrack` implements a discrete jump when the destination key has `step`. That differs in representation from Adobe's outgoing hold key but can produce the same observable hold-then-jump behavior.

All proposed fields and schedules below are design recommendations, not existing schema. Prototype ranges use half-open frame intervals: `[start, end)`. Episode boundaries come from the existing roadmap/design ledger; internal narration cue timings still require conformance.

## Evidence Boundary

### How other systems implement related effects

**Observed precedent A — Adobe track mattes.** A fill layer's transparency can come from a separate alpha or luminance matte. The matte may be an image, graphic, text or shape; transforming it creates a traveling reveal. Multiple layers may reference one matte. This supplies a production mechanism for disclosing only an authored region; Adobe does not attach historical-evidence meaning to that region. [Adobe: Track Mattes and Traveling Mattes](https://helpx.adobe.com/after-effects/desktop/work-with-transparency-and-compositing/work-with-track-mattes-and-traveling-mattes/track-mattes-and-traveling-mattes.html).

**Observed precedent B — Motion Canvas flow composition.** `chain` finishes tasks in order; `all` runs tasks together; `sequence(delay, ...)` starts successive tasks after a fixed delay even when earlier tasks are still running. Its official examples expose the implementation distinction between separate stages and overlapping entrances. [Motion Canvas: Animation flow](https://motioncanvas.io/docs/flow/).

**Observed precedent C — cue-based explanatory animation.** Motion Canvas's `waitUntil` names a timing event that can be positioned against narration; `useDuration` can determine an animation's duration from a time event. This is an explicit alternative to scattering hard-coded waits through scene code. [Motion Canvas: Time Events](https://motion-canvas.io/docs/time-events/).

**Our inference:** combine a spatial boundary with staged group disclosure, and time changes to the spoken limits of the evidence. A mask is only a visibility mechanism. The recipe must separately author the meaning of supported, unknown and composite; no graphics library can infer it from a PNG.

### S01E01 direction and assets

ST-017/018 spans master frames 6229–7578 inclusive, 56.250 seconds at 24 fps. Introduce Lene's date and exceptional wealth before the supported category composition. Then develop three views: supported categories; unavailable exact information; the limit on applying this to the composite household. ST-018's 34.125 seconds cannot be filled by repeating entrances.

Prepare category groups with clean alpha edges, an editorial record frame, editable exact context/qualifier text, an explicit unknown field, and the familiar composite-household anchor. Keep category imagery illustrative; do not invent itemized entries, quantities, values or document quotations. Unknown must remain visible as a labeled condition, never an empty inventory interpreted as zero possessions. These are episode constraints from [the local motion study](../prompt-packs/s01e01-motion-design.md).

### Proposed event design

Eight-second / 192-frame mechanism proof, not a shortened replacement for the narration:

| Frames at 24 fps | Visible development                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 0–35             | Context and qualifier already readable; establish the bounded record area.                                               |
| 36–83            | Two supported category groups enter in distinct short beats and settle inside it.                                        |
| 84–107           | Hold the supported composition.                                                                                          |
| 108–143          | Move the supported group aside within the page; expose a separately labeled unknown region.                              |
| 144–167          | Introduce the composite-household anchor outside the evidence area; a comparison bracket stops at the authored boundary. |
| 168–191          | Hold the incomplete relation with both qualifier and unknown label visible.                                              |

The attention change is from inspecting contents to understanding the limit on an inference. Avoid a theatrical redaction wipe, which could suggest known information was deliberately hidden.

Minimal recipe additions: `supportedGroups`, `unknownGroup`, `qualifier`, `boundary`, `compositeAnchor`, and cue-referenced event windows. Author the evidence classification on groups; keep it independent of opacity. Reuse group transforms, text, rectangles and paths. If a moving clip edge is needed, add a narrowly scoped rectangle-reveal property rather than a general mask editor. Require the unknown group to reach an explicit visible end state and the qualifier to remain visible during the comparison.

### Tests and failure modes

- Validate disjoint supported/unknown bindings, existing group IDs, ordered windows, and a qualifier interval covering every inferential beat.
- Compare direct seeks with sequential playback at frames immediately before, at and after each event boundary; unknown status must not depend on having played earlier frames.
- Inspect the boundary passage at full size and phone size. Unknown and zero must remain distinguishable in grayscale as well as color.
- Review source cutouts for duplicated baked labels/connectors and accidental certification of detailed animals/tools. Do not enlarge pseudo-document writing into apparent evidence.
- The proof succeeds only if the visual relationship changes; captions alone do not satisfy it. The full ST-017/018 passage must then sustain three readable compositions without excessive rearrangement.

## Dated System Break

### How other systems implement related effects

**Observed precedent A — narration events.** The Motion Canvas timing model above separates the cue location from the animated action, allowing phrase-aligned events. Our application is an authored list of stressed connections; it is not an automatic history simulation. [Motion Canvas: Time Events](https://motion-canvas.io/docs/time-events/).

**Observed precedent B — explicit scene lifetimes.** Remotion `Sequence` positions children at `from`, gives them a local timeline, and unmounts them outside `durationInFrames`. This is a concrete way to put two context scenes on adjacent, non-overlapping frame ranges. [Remotion: Sequence](https://www.remotion.dev/docs/sequence).

**Observed precedent C — transition overlap accounting.** Remotion documents that a transition renders neighboring scenes concurrently and subtracts the overlap from combined duration; its 40 + 60 frame example with a 30-frame transition totals 70 frames. This is a reason to avoid casually inserting dissolves into a locked narration timeline. [Remotion: TransitionSeries](https://www.remotion.dev/docs/transitions/transitionseries).

**Our inference:** show the historical context first, animate existing editable path gaps at named cues, then use a clean adjacent-scene cut. Do not inherit the broken graph into the later period and animate it back to health. Neither source prescribes the famine semantics; those come from the episode brief.

### S01E01 direction and assets

ST-021/022 spans master frames 8514–9572 inclusive, 44.125 seconds. The first context is **Great Famine · 1315–17 · comparison**; the later context is **Walsham · 1327–29**, with local conditions unknown. Prepare intact editable connections, stable node cutouts, date/context labels, and an independently authored neutral later scene. ST-021 already contains raster cracks, so an intact opening needs prepared layers, not a moving overlay on the cracked full still.

Break order follows narration emphasis and must not imply an empirically measured causal cascade. Keep line weight and node size independent of claimed severity. Existing panel tilts and pulses are optional; gaps and the overall composition should carry the explanation.

### Proposed event design

Eight-second / 192-frame technical proof:

| Frames at 24 fps | Visible development                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| 0–35             | Crisis date and comparison qualifier are legible above the intact system.                                 |
| 36–47            | First selected path develops an authored gap.                                                             |
| 48–71            | Hold the consequence.                                                                                     |
| 72–83            | Second selected path breaks; node anchors remain fixed.                                                   |
| 84–107           | Hold, then broaden attention to the system.                                                               |
| 108–143          | Read the combined broken state with its original date intact.                                             |
| 144–191          | Hard cut to the separate later-context composition, with new date and unknown status immediately legible. |

For the actual sequence, keep the exact ST-021/022 cut and conform each internal break to the spoken cue; do not reuse these demo offsets as episode timings.

Minimal additions: `contextGroup`, `contextReadyFrame`, ordered `breaks: [{path, startFrame, endFrame}]`, and an export/handoff `contextId`. Require the first break after a positive context-reading interval. Keep reset as two explicit scene records with distinct entry states in the episode assembly; do not grow Still Shift into an episode sequencer. Existing `gap` tracks supply geometry; the old `crisis_fracture` schedule remains unchanged for legacy scenes.

### Tests and failure modes

- Reject a break before context readiness, overlapping contradictory events on the same path, or out-of-range windows.
- Assert that path/node identity and endpoints remain stable while gaps change. Test a short path and a long path so round caps do not visually bridge the intended gap at phone size.
- Inspect the last crisis frame and first later-context frame together: the former retains 1315–17, the latter shows 1327–29 and unknown status; no famine fractures carry through as a healing transition.
- Compare final encoded frame counts against the manifest. A transition's implicit overlap must never shorten the locked episode.
- Playback must distinguish separate stresses without flicker, shaking camera or rhythmic repeated cracks. A technically valid graph can still falsely imply chronology; review it with the narration.

## Category Swap

### How other systems implement related effects

**Observed precedent A — Adobe Hold interpolation.** A property holds its prior value until the next keyframe, then changes immediately; there are no intermediate values. Adobe also documents that automatic spatial interpolation can introduce unwanted movement between equal-position keys. [Adobe: Keyframe interpolation](https://helpx.adobe.com/after-effects/desktop/animate-in-after-effects/animation-keyframes/keyframe-interpolation.html).

**Observed precedent B — Manim matching parts.** `TransformMatchingShapes` matches subobjects by normalized shape coordinates; the documentation demonstrates letters being reorganized into another phrase. It is a useful precedent for distinguishing retained components from replacements, but geometric similarity is not semantic identity. [Manim: TransformMatchingShapes](https://docs.manim.community/en/stable/reference/manim.animation.transform_matching_parts.TransformMatchingShapes.html).

**Observed comparison — Manim replacement ownership.** `ReplacementTransform` explicitly morphs a source into a target and removes the replaced object; its example contrasts that with ordinary `Transform`, where objects can remain. The ownership principle is relevant, but its morphing behavior is unsuitable for S01E01's conceptual grain substitution. [Manim: ReplacementTransform](https://docs.manim.community/en/stable/reference/manim.animation.transform.ReplacementTransform.html).

**Our inference:** preserve a registered slot and its surrounding relation while replacing exactly one authored category state. Prefer a crisp cut, or a short exit followed by a distinct entrance; avoid image crossfade and shape morph. Keep conceptual identity in authored IDs, never in raster resemblance.

### S01E01 direction and assets

ST-015 runs 3:44.750–4:03.875; selected ST-009 beats may reuse this mechanism for obligations. Establish the qualified **Hinderclay comparison** before the exchange. Prepare registered category-state illustrations or editable broad labels, a fixed container/slot, fixed surrounding relationships, and persistent qualification. Use matching canvas size, baseline and visual center across variants. Do not invent grain species, serving sizes, a local Walsham meal, or an exchange ratio. If source detail cannot be supported, use broad category labels.

### Proposed event design

Six-second / 144-frame proof:

| Frames at 24 fps | Visible development                                                             |
| ---------------- | ------------------------------------------------------------------------------- |
| 0–35             | Establish qualified context, category A and the fixed surrounding relationship. |
| 36–47            | Brief emphasis on the category slot; preserve its baseline.                     |
| 48               | Replace A with B using one discrete state event.                                |
| 49–83            | Hold B long enough to perceive the substitution.                                |
| 84–107           | Emphasize the still-present surrounding relationship; show the inference limit. |
| 108–143          | Hold the qualified result.                                                      |

If the one-frame switch feels abrupt, evaluate a 6-frame exit and 6-frame entrance under the same slot, with an explicit neutral interval. Do not interpolate through an invented hybrid category or use a quantity change to decorate the swap.

Minimal additions: `subject`, registered state names mapped to existing image-state indices, `swapFrame`, `fromState`, `toState`, `qualifier`, and surrounding `stableAnchors`. State changes must compile to step keys; optional slot emphasis uses ordinary transforms. Validate named state references and retain only one visible category after the swap. Use paired editable text nodes with step visibility when broad labels are more appropriate than image variants.

### Tests and failure modes

- At `swapFrame - 1`, only A is selected; at `swapFrame`, only B; both remain true under backward seeks. No fractional state index or two-state blend is allowed.
- Compare alpha bounds and ground contact for every registered state. Identical image dimensions alone do not establish registration.
- Assert all surrounding anchors/path endpoints are unchanged through the replacement and that the qualifier covers both states.
- Inspect a label-only alternative and a differently shaped replacement to ensure the recipe depends on registration metadata, not equal silhouettes.
- Check for two misleading readings: physical transformation of one grain into another, or an assertion that the two categories were exchanged in equal quantities. Fix staging/labels rather than adding more motion.

## Implementation preparation decision

These findings support the roadmap order. M0 should establish authored cue windows, stable IDs and boundary validation once. M3 primarily composes existing group/path primitives; M4 parameterizes existing gap behavior and specifies the separate episode reset; M5 exposes discrete registered state replacement. No cited evidence requires a new renderer, physics system, morphing library or general timeline UI.

Before implementing each treatment, create its 4–8-second fixture with the required assets, then review temporal playback and narration fit. Research establishes viable techniques; it does not establish that any proposed S01E01 motion is already engaging, historically approved or production-ready.
