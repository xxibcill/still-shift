# Research: Unequal Margins and Access Constraint

Researched 2026-09-26. Preparation for the [S01E01 story-motion roadmap](s01e01-story-motion-roadmap.md), not an implementation or creative approval. These names are Still Shift recipes, not established industry preset names.

## Evidence and recommendation

**Use stable illustrated anchors, explicitly authored events, and small moving annotation/restriction parts.** Both treatments can initially reuse the current Canvas renderer. Neither needs a new animation library, full character rig, general shape morphing, or a physics simulation.

Evidence inspected: official documentation and its embedded example code. No cited demo video was played, and none of the external examples establishes audience engagement for S01E01. The proposed staging and test criteria below are our adaptation; they must be proved in the short illustrated preview.

## 1. Unequal Margins

### How others implement analogous behavior

**Precedent A — Motion's shared layout transition.** Matching `layoutId` values connect old and new elements; simultaneous old/new instances crossfade. Motion also supports grouped layout updates and position-only transitions; its docs warn that scaling can distort children. The implementation pattern is identity → start/end layout → interpolated transform, with separate handling for entering/exiting content. Inspected the official API examples and explanation, not their linked videos. [Motion: layout animation](https://motion.dev/docs/react-layout-animations)

**Adaptation:** give the two household groups persistent IDs and fixed equal-scale placements across ST-013 and ST-014. Recompose annotations and the store around them. We do not need DOM measurement or Motion itself: the authored scene already knows both layouts. Household identity belongs in the manifest, not in an image similarity heuristic.

**Precedent B — original Manim's `UpdatersExample`.** The example constructs a brace from a square every frame, places its label relative to the brace, and obtains a displayed value from the square's width. It then changes the square while the dependent annotation follows. This is a concrete example of deriving several visible parts from one controlling geometry. Inspected the published source example. This is ManimGL/original Manim (`manimlib`), not the similarly named Manim Community API. [Manim: UpdatersExample](https://3b1b.github.io/manim/getting_started/example_scenes.html#updatersexample)

**Adaptation:** drive pressure bracket parts and their attached words from one qualitative condition event. Keep the household art unchanged. Do not copy the numeric width readout or scale a reserve bar: the episode has no measured household reserve data. For Still Shift, derive the geometry directly from frame and authored state, rather than accumulating updater mutations.

### Why this is a useful motion rather than another slide

The two cases share one world before they diverge. A single named strain acts on both during the same event window; its visible consequence differs. The viewer sees the comparison happen. The words confirm the result but are not the only moving element. This is a design hypothesis, not a claim that the cited examples prove retention.

### Proposed event flow

Use the existing study's fixed master boundaries; internal cues remain proposed until conformed to narration. [Local detailed beat plan](../prompt-packs/s01e01-motion-design.md#5-detailed-first-proof-same-season--unequal-access)

| Master frames, inclusive | Event                                                          | Geometry/state rule                                                                                                                         |
| ------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 4748–4847                | Establish two household silhouettes, common horizon and season | Equal visual scale; separate fixed anchors; no rich/poor labels                                                                             |
| 4848–4967                | Set up the comparison question                                 | One shared seasonal reference and short “room to absorb strain” label; no separate weather for each case                                    |
| 4968–5081                | Apply named strain and expose different margins                | Two bracket components respond in the same event window; labels resolve to “more room” / “less room”; house scale and position remain fixed |
| 5082 onward              | Preserve identity into access scene                            | Same anchor coordinates and household assets; fade/remove old annotations before adding the store relationship                              |

Use categorical end states such as `room` and `strained`, not a user-facing numeric ratio. An initial authoring treatment can move bracket arms inward or shift a pressure marker toward the household and leave the other case visibly less constrained. No ticks, graduated fill, value labels, width legends, or implied conversion from pixels to food. The displacement is expressive staging; if viewers read it as a measured ratio, revise the symbol rather than merely add a disclaimer.

For an event from frame `a` to `b`, derive `u = clamp((f-a)/(b-a), 0, 1)` and `s = u*u*(3-2*u)`. Interpolate only the bracket/marker transforms from authored start to end values. Holding geometry before and after the interval gives anticipation and a reading hold without a separate looping animation. The house groups can be reused exactly in the next recipe. These equations are the proposed Still Shift evaluator, consistent with its existing smoothstep tracks.

### Assets and geometry

- Two clean house cutouts, with contact shadows retained where needed, at matched visual scale on a common paper/ground field.
- Stable IDs such as `household-a` and `household-b`; bottom-center contact anchors and a shared baseline. Store anchors separately from image crop bounds.
- Two pressure brackets made from independently translated vector/path parts or prepared transparent artwork. Do not scale the entire household group to change the bracket.
- Editable condition labels and shared seasonal reference. Labels use constant type size and stay attached to their case; moving the bracket must not stretch text.

ST-013 is the first application. ST-008 can use the same paired anchors within its longer seasonal argument; ST-024 needs one concise return of the comparison; ST-026 can reuse the established motif. These are the local episode mappings, not claims made by the external examples. [28-still design and preparation instructions](../prompt-packs/s01e01-motion-design.md)

### Minimum code changes

Observed in [prepared.ts](../packages/scene-contract/src/prepared.ts): `comparison_build` binds two group panels and two variables, with numerical `remaining` values defaulting to `[0.38, 0.75]`. In [prepared-scene.ts](../packages/renderer-core/src/prepared-scene.ts), both panels start centered, separate, then the variables animate `scaleX` to those values. This creates the wrong quantitative semantics for this episode.

Add the `unequal_margins` recipe as an additive contract with paired household IDs, shared baseline/reference, pressure parts, qualitative condition states and explicit event frames. Compile to existing `x`, `y`, `opacity` and discrete `state` tracks. Keep old `comparison_build` behavior intact. Existing groups and path/image/rect nodes suffice for a first proof; no renderer change is necessary if bracket parts are separate nodes. A shared transform/event helper is preferable to a duplicate renderer.

### Failure cases and targeted checks

- Two unequal-scale houses or different baseline/weather imply a different cause: verify unchanged anchor and scale through the strain event.
- Labels move but the picture does not: inspect a short motion interval with labels temporarily hidden as an internal diagnostic.
- Bracket arms change as quantitative bars: inspect the endpoint at phone size and reject an apparent calibrated comparison.
- ST-013→014 resets the pair: compare the exact outgoing/incoming household transforms and crop registrations.
- Delayed seeks skip the result: compare a direct seek to the consequence frame with sequential evaluation at that frame, at 24 and 30 fps.
- Conflicting events, a missing condition asset or a pressure part bound to the house node: reject before export.

## 2. Access Constraint

### How others implement analogous behavior

**Precedent A — After Effects traveling mattes.** Adobe describes a fill layer whose visibility is controlled by a separate alpha/luma matte; animating the matte transform makes a traveling matte. Its example reveals a pattern through the matte shape, and its guidance suggests precomposing when matte and fill must transform together. Inspected documentation and its written example, not the linked video. [Adobe: Track Mattes and Traveling Mattes](https://helpx.adobe.com/after-effects/desktop/work-with-transparency-and-compositing/work-with-track-mattes-and-traveling-mattes/track-mattes-and-traveling-mattes.html)

**Adaptation:** separate the resource/connection from the restriction graphic. If masking is later necessary, clip only the authored corridor region; never mask the source store or delete the route's centerline. The first proof can use two visible restriction shapes moving around the route, which is simpler than adding alpha-matte infrastructure.

**Precedent B — After Effects animated mask paths and path controllers.** Adobe describes vertex correspondence across path keyframes and warns that reassigning the first vertex changes interpolation. Its path-expression examples distinguish layer-local and shape-group coordinates, and its Create Nulls From Paths workflow links geometry to controls. Inspected the documented path operations and coordinate rules. [Adobe: Managing and animating shape paths and masks](https://helpx.adobe.com/after-effects/desktop/animate-in-after-effects/animate-shape-paths-and-masks/animating-shape-paths-masks.html)

**Adaptation:** place restriction parts in one route-local group; derive their positions from one aperture control. A future curved corridor should use a fixed topology and point order. For M1, a straight restriction segment with rigid moving sides avoids path morphing and vertex correspondence problems entirely.

### Proposed event flow and geometry

The episode's claim is that available grain does not ensure equal access. The grain must stay present, both relationship lines must persist, and the restricted route must remain visibly open. [Local ST-013/014 plan](../prompt-packs/s01e01-motion-design.md#5-detailed-first-proof-same-season--unequal-access)

1. At master frames 5082–5183, preserve the household positions while introducing the store and open space for its connections. The study proposes 20–28 frames for the recomposition within this span.
2. During 5184–5279, reveal two equal-width relationship paths, then move two visible restriction sides inward around one route. Separate path-reveal and narrowing event windows within the span when conforming the narration; do not run every element at once.
3. During 5280–5393, hold the consequence: available store, two connections, one narrow but visibly open corridor. Add the short conclusion without restarting the mechanism.

Geometry proposal: choose a route segment away from a bend. Let `C` be its center, `T` its unit tangent and `N=(-T.y,T.x)` its normal. The inner edges of the two restriction shapes are `C ± N*w(f)/2`; extend each side along `T`. Interpolate the clear opening `w(f)` between two authored **visual** widths with clamped easing. The centerline itself retains its original stroke width and has no missing interval. Require `w(f) > lineWidth + 2*clearance` for every frame, plus a minimum opening readable at the actual delivery scale. This is proposed geometry, not a sourced historical measurement.

A fixed rigid group rotated to the segment direction gives this construction with existing position/rotation tracks. Parameterizing it at compile time is enough; avoid introducing a general runtime constraint solver. Reserve masks for a demonstrated art requirement. A transparent matte edge that hides only the line can accidentally imply a severed connection, so visible boundary shapes are a better first test.

### Assets and S01E01 mapping

ST-014 needs the reused two houses, a store cutout, fresh editable paths, separate restriction sides and clean background. Remove baked connectors and coins from a recomposed derivative so they do not duplicate new graphics. Preserve original source lineage; a new derivative is not an automatic amendment of any selected-image treatment. If preparation cannot produce a clean scene, the design already allows an explicit symbolic diagram after the source view. [Source preparation and fallback](../prompt-packs/s01e01-motion-design.md)

### Minimum code changes

Observed in [prepared.ts](../packages/scene-contract/src/prepared.ts): `access_pressure` requires `route`, `token`, `barrier` and `stopAt`. Validation insists the whole token stops before the restricted interval. Its compiler animates a real route gap and a traveling token. [prepared-scene.ts](../packages/renderer-core/src/prepared-scene.ts)

The existing [illustrated-renderer.ts](../packages/renderer-core/src/illustrated-renderer.ts) implements `gap` by omitting a stroke interval; that is a broken connection, not a narrowed corridor. It already supports rotated groups, image/rect/path children and transform tracks. Add a separate `access_constraint` recipe with available-source ID, two connection IDs, two restriction-side IDs, an authored open aperture and narration event frames. Compile the side motion using existing transforms; leave path `gap` at zero and require no follower/token. Retain existing `access_pressure` behavior for old scenes.

### Failure cases and targeted checks

- The opening closes at an easing overshoot or is swallowed by line thickness: validate the entire interpolated aperture range; inspect near the tightest frame at phone size.
- A curved-route bend produces a wrong normal: constrain M1 to a known straight local segment and reject ambiguous geometry.
- Parent scale/rotation moves the sides differently from the route: require the restriction construction and route to share a coordinate space, or transform both through the same authored parent.
- Store fades or grain level changes: assert source transform/state/opacity remains fixed through the restriction event.
- Old `gap`/token behavior leaks into the new recipe: verify continuous centerline and no follower entry; preserve old recipe regression fixture separately.
- Mask residue or old coins remain: inspect prepared layers at full resolution, then the final composition at delivery size.

## Shared preparation decision: exact frame timing

Remotion's official property-animation example derives values from `useCurrentFrame()`, clamps interpolation and warns that non-frame-driven animation such as CSS transitions can flicker in renders. This is the relevant model for deterministic output; it is not a recommendation to replace Still Shift's Canvas evaluator. [Remotion: Animating properties](https://www.remotion.dev/docs/animating-properties)

The current local compiler scales a fixed 7,000 ms schedule to clip duration. Its v1 contract also limits integer `durationMs` to 3,000–8,000 and requires a whole frame count. The full first proof is 646 frames at 24 fps: `646/24*1000 = 26916.666… ms`. Therefore simply increasing the maximum duration still cannot represent this exact span under integer-millisecond validation. Even separate ST-013 (334 frames) and ST-014 (312 frames) exceed the eight-second limit, and ST-013 does not have an integer-millisecond duration.

Recommendation: define the additive story contract in integer `frameCount` and integer event frames; compute display duration from `frameCount/fps`. Keep master-frame offsets distinct from clip-local frames and preserve old v1 input behavior. Export/result validation must use the same frame authority. An event evaluator must give the same result when frames are sampled in random order. Reject overlapping writes to the same property unless composition is explicit. This is a prerequisite to the long narrated proof, not an excuse to delay the 4–8-second fixture preview.

## Preparation deliverable before engine work

Create one clean paired-house kit and a short event storyboard with registered anchors, then lock proposed event windows against narration. The first visual proof should show common world → unequal response → open but narrowed access in a coherent illustrated language. Review motion intervals and the exact scene boundary; successful encoding and attractive endpoint images cannot establish that the moving explanation works.
