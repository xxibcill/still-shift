# Cinematic illustrated templates — next build plan

**Date:** 2026-09-25

**Status:** First milestone implemented: shared plane camera and CI-09 Layered Parallax, with two verified compositions. [Implementation and review clip](./cinematic-parallax-implementation.md). The other eight templates remain planned.

**Owner direction:** Commit the current work and plan additional templates that feel more cinematic, including parallax.

**Starting point:** `8dd9934` — six prepared illustrated presets, original assets, shared preview/export, and CLI support. Creative acceptance of that reel and the Phase 0 gates remain separate.

## 1. Creative direction

Make the next review feel like a sequence of illustrated film shots. Each template should establish a place, guide attention through space, and finish on a deliberate composition. Use full-frame environments, strong foreground framing, an expressive focal subject, controlled negative space, and coherent near/middle/far movement.

The current reel centers isolated props on a paper field, uses large instructional headings, and explains relationships with paths and panels. Those choices suit its diagram templates. The next family will use immersive scene compositions, camera choreography, natural occlusion, and a quieter presentation. Preset names and controls belong outside the video. The review reel will have no demo headings, labels, arrows, progress bars, or explanatory cards inside the shots.

Keep the History Offstage visual foundation: expressive charcoal contours, warm bone, field green, ochre, restrained red, flat controlled color, shallow designed depth, and fixed print texture. Cinematic intent comes from staging and the movement of attention. The images remain illustrated. Avoid using a prompt's word “cinematic” as a substitute for specifying viewpoint, framing, light, and spatial relationships.

### Assumptions

- This is another Still Shift demonstration family using original prepared art. No selected episode image or retired corpus entry is a generation/edit input.
- Delivery stays 16:9, 1920×1080, 24 fps; nine seven-second proofs produce a **63-second reel**. Preserve support and regression checks for 30 fps.
- Subjects hold their authored poses. Walking, turning a head, cloth simulation, or revealing an unseen side requires separate authored content.
- Four coherent scene kits will support nine templates. The user reviews the reel; AI performs layer preparation and technical QA.
- There is no supplied script or dated episode scene for this study. The examples establish mood and spatial relationships without introducing historical claims.

### Relationship to the channel bible

The [Layered Chronicle bible](</Users/jjae/Documents/obsidian/ai-business/history-offstage/02 Operations/Layered Chronicle Animation Style Bible.md>) supplies the linework, palette, three depth bands, fixed texture, and usual 2–4% parallax travel. Its current production grammar favors short purposeful moves and excludes shallow depth of field. The owner's new request establishes a cinematic exploration within Still Shift. Longer camera moves and the optional focus-softening test below are recorded as study variations; they do not silently revise the channel bible or approve an episode treatment.

**2026-09-25 motion revision:** The owner found CI-09 too slow and requested heavier parallax plus research. The [research report](./parallax-motion-research.md) informed an implemented Dramatic strength: fivefold horizontal travel, earlier acceleration, longer deceleration, and a shorter opening/ending hold. The original numeric CI-09 bounds below describe Standard. Dramatic allows near travel 10–20% W, far travel up to 5% W, and vertical travel up to 2% H, subject to painted coverage, attached cut edges, and the same subject/scale/resolution checks. The delivered primary moves 300/50 px near/far. These are study authoring limits, not universal parallax rules.

## 2. Nine templates

The bounds below are **initial design limits**, measured in the final 1920×1080 frame. They must shrink if the asset's valid painted area or protected subject needs it. Camera direction is authored for the scene's opening; random left/right alternation is not a design rule.

| ID / proposed preset                                | What happens on screen                                                                                                                                       | Best scene / feeling                                                         | Planned movement and assets                                                                                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CI-01 Threshold Push** · `threshold_push`         | The camera eases toward a subject seen between near doorway edges. The near edges spread faster than the room behind them.                                   | Interior entrance; anticipation, intimacy.                                   | Layered axial push; subject grows 3–5%, near framing up to 8%, distant background 0–2%. Two near cutouts, grounded subject layer, continuous room.                                                          |
| **CI-02 Lateral Track** · `lateral_track`           | A foreground wall moves across the view while a middle-distance figure remains the compositional anchor and the far courtyard changes slowly.                | Traversing a place; observation, unease.                                     | Horizontal differential movement: near 3–4% W, middle 1–2% W, far ≤0.5% W. Three complete planes and a shared camera target.                                                                                |
| **CI-03 Foreground Reveal** · `foreground_reveal`   | The camera clears a nearby doorpost or large object, revealing the focal subject that was partially obscured.                                                | Discovery; curiosity followed by recognition.                                | One deliberate lateral reveal; foreground travel ≤4% W. Initial occlusion covers only 15–25% of the subject. Reveal finishes around 3.2 s, then holds.                                                      |
| **CI-04 Rising Vista** · `rising_vista`             | A near ridge drops through the lower frame as the view rises to expose a path and a distant building.                                                        | Establishing landscape; scale, release.                                      | Vertical parallax: near ≤4% H, middle ≤2% H, far ≤0.5% H. No horizon roll. Complete landscape behind the ridge.                                                                                             |
| **CI-05 Detail to World** · `detail_to_world`       | A tighter view of the building and its approaching path eases outward to reveal the surrounding field and ridge.                                             | Context after a detail; solitude, consequence.                               | Pullback within 1.20→1.00 framing scale, subject to actual source resolution. Near elements separate from the setting at different rates. The source master contains the entire final wide view.            |
| **CI-06 Focus Handoff** · `focus_handoff`           | Attention passes from a near object to a farther subject, supported by a very small lateral change.                                                          | A relationship discovered through attention; doubt, recognition.             | Layer-local focus transfer and ≤1% W camera travel. Focus-softening study capped at 4 px blur at 1080p, with no face deformation. Clean plate and isolated near/far subjects.                               |
| **CI-07 Curved Approach** · `curved_approach`       | The camera follows a short curved screen path around foreground framing and settles on the subject.                                                          | Entering a space; intent, apprehension.                                      | A bounded quadratic camera path, lateral excursion ≤2.5% W and subject growth ≤3%. Front-facing image planes retain their visible sides.                                                                    |
| **CI-08 Dolly-Zoom Tension** · `dolly_zoom_tension` | The subject stays nearly the same size while the distance relationships behind it change.                                                                    | A short moment of realization or pressure.                                   | Camera distance and focal scale counter-animate. Subject size variation ≤1%; distant scale change 3–6%; near displacement ≤3% W. Explicit depth planes and protected subject anchor. Highest-risk proof.    |
| **CI-09 Layered Parallax** · `layered_parallax`     | A composed subject stays nearly fixed while a nearby framing object slides past and the distant setting shifts more slowly, creating a clear sense of depth. | Portrait in a place, still-life, or environment; presence and spatial depth. | At least three authored planes; near travel 2–4% W, subject drift ≤0.5% W, far travel 0.3–1% W. A short diagonal camera move, constant focal scale, subject anchor, and fully painted concealed background. |

CI-01 and CI-05 reverse direction for different editorial purposes: entry versus context reveal. CI-02 sustains travel; CI-03 completes an occlusion event and holds. CI-07 changes the camera path, not the geometry of the subject. CI-08 must preserve the subject size while changing its surroundings or it fails its named purpose. CI-09 is the dedicated parallax template: the framing settles on a subject while depth planes move around it. Its primary event is the relative motion between planes.

### Dedicated parallax controls

Expose `layered_parallax` by name in the Cinematic collection. Require foreground, subject/middle, and background roles with distinct plane depths. Author a common camera direction and a subject anchor; provide restrained, standard, and dramatic strengths bounded by the painted plate. Foreground travel must visibly exceed background travel. With subject anchoring, near and far planes may move in opposite screen directions; their projection still comes from the same camera. Keep subject scale change ≤1%, no roll, and no automatic return loop. A single flattened pan is a labelled 2D fallback.

CI-06 and CI-08 are later experiments in the build order. If focus softening destroys print texture, test an all-sharp attention handoff using authored light/value emphasis and report the result under a separate name. If the dolly-zoom cannot meet its bounds, keep it experimental and use the proven Threshold Push as an explicitly identified substitute. Never present a renamed fallback as a successful new template.

## 3. Shot and asset design

Use the companion [source prompt pack](../prompt-packs/cinematic-illustrated-still-animation-prompt-pack.md). Each kit starts from a complete environment master so its individual assets share perspective, light, scale, and linework.

| Scene kit             | Composition                                                                                | Primary proofs      | Assets to prepare                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------ |
| **A — The threshold** | Near door framing, a middle-distance storage vessel, a wall and open passage behind it.    | CI-01, CI-03        | Master, left/right foreground cutouts, vessel with contact shadow, continuous clean room plate.        |
| **B — The courtyard** | Near masonry at an edge, a stationary anonymous figure, receding walls and passage.        | CI-02, CI-07, CI-09 | Master, solid foreground cutout, figure with grounded shadow, middle architecture, complete far plate. |
| **C — The hillside**  | Broad near ridge, a middle field and path, distant low building and skyline.               | CI-04, CI-05        | Wide master, near ridge, middle terrain, continuous distant plate; no thin foreground foliage.         |
| **D — The room**      | A large near bowl, a quiet figure across the room, a shallow architectural opening behind. | CI-06, CI-08        | All-sharp master, foreground bowl, figure and contact shadow, middle room, continuous rear plate.      |

These kits are compositions, not sprite grids. Retain expressive irregular shapes and a believable ground plane. Contact shadows travel with the corresponding grounded subject unless a separately authored receiver requires a different transform. Fixed texture stays attached to its surface.

### Overscan and disocclusion

- Aim for a 2400×1350 composition or larger when the image tool supports it. The centered 1920×1080 framing leaves 240 px per horizontal side and 135 px per vertical side at 1:1 mapping. Requested dimensions are a target; record the actual returned size and calculate the mapping.
- If a generated source is smaller, scaling changes the pixel budget and sharpness. Validate the actual source and planned crop; do not claim nonexistent overscan.
- Keep critical faces, hands, props, and architecture inside the inner 80% of the delivery view over the entire shot. Foreground framing is intentionally allowed to cross the edges.
- Every lateral, vertical, or curved move requires a painted continuous plate behind each region it uncovers. Subject transparency identifies its silhouette; it does not supply the concealed background.
- Derive cutouts and plates from the same original master using reference-led edits. Inspect them together before animation. Save generation calls, rejected takes, repair time, and lineage.
- Prepare only the masks and layers the template consumes. Automatic semantic segmentation of arbitrary images remains a separate product question.

## 4. Reusable camera and parallax support

### Baseline before this milestone

`illustrated-scene-1` already supplies alpha layers, groups, atlas crops, anchors, typed recipes, absolute-time tracks, and 24/30 fps export. Its current recipes animate layer properties directly. It has no shared camera, explicit layer depth, focus track, camera travel bounds, or painted-area validation.

The original WebGL route supplies depth-map camera motion for one image. Use it as a baseline and possible future continuous-surface adapter. It cannot substitute for prepared hidden background where a lateral view reveals new pixels.

### Proposed extension

Add a versioned `illustrated-scene-2` contract alongside v1, with a `cinematic` recipe family:

1. **Camera:** absolute-time position, focal scale, projection center, and optional focus target. Interpolate from explicit frame-indexed keys; endpoints correspond to frame 0 and `frameCount - 1`.
2. **Layer depth:** authored positive plane distance, stable back-to-front ordering, rest transform, subject target, and near-plane margin. Depth is a staging parameter, not a historical measurement.
3. **Geometry bounds:** painted source coverage, allowed foreground cutoffs, protected subject polygons, maximum displacement, minimum source sampling resolution, and reconstruction provenance.
4. **Optional layer treatment:** bounded focus softening on isolated offscreen layers. Expand intermediate surfaces for filter support so blur does not clip against a sprite rectangle.
5. **Resolution result:** requested template, actual treatment, adjusted camera envelope, explicit fallback reason, source hashes, renderer version, and actual frame rate. An invalid prepared scene is an error; a valid reduced/fallback treatment must be identified in the output and gallery.

Project front-facing planes using one camera model. Near planes should respond more strongly than distant planes, with a common direction and target. Avoid independent arbitrary sine waves, random float, or unrelated easing per layer. Preserve deterministic drawing order; no animation-clock state may leak into export.

Canvas 2D can draw the resulting projected plane rectangles through the existing renderer/export path. Start there, with offscreen compositing for optional focus. Introduce a WebGL adapter only if actual performance or image-quality measurements require it. Maintain a single camera/track evaluator for all rendering adapters.

For CI-08, the proposed subject-distance compensation is `f(t) = f(0) × d_subject(t) / d_subject(0)`, keeping `f(t) / d_subject(t)` constant. Test against projected subject bounds and background landmarks; do not claim it reconstructs a rotatable 3D scene.

### Compatibility rules

- Existing v1 scenes and exported manifests remain readable and reproduce their framing.
- New recipes are additive and remain separate from `animate --input` automatic depth presets.
- Continue using `animate-scene --scene ... --output ...`; document v2 examples only once the parser exists.
- Add a **Cinematic** collection in the lab, with template, source scene, restrained/standard intensity, and playback. Display compatibility and preparation needs before export.
- Crop coverage checks are asset-aware. A foreground silhouette may move out of frame; a hole in the final painted background may not.
- If a required plate or layer is missing, return a named preparation error before rendering. Never turn it into a static “successful animation.”

## 5. Camera timing

Default seven-second beat: establish for 0.5–0.8 s, perform one camera idea, settle into 1–1.5 s of final reading time. Use smooth ease-in/out or a gentle plateau in velocity; no spring overshoot or unattended perpetual drift.

| Template | Establish             | Main event                                          | Finish                            |
| -------- | --------------------- | --------------------------------------------------- | --------------------------------- |
| CI-01    | 0–0.7 s               | Approach 0.7–5.5 s                                  | 5.5–7 s settled subject           |
| CI-02    | 0–0.5 s               | Traverse 0.5–5.8 s                                  | 5.8–7 s destination framing       |
| CI-03    | 0–0.8 s               | Clear occluder 0.8–3.2 s                            | 3.2–7 s newly visible subject     |
| CI-04    | 0–0.7 s               | Rise 0.7–5.2 s                                      | 5.2–7 s open vista                |
| CI-05    | 0–0.8 s               | Release into context 0.8–5.5 s                      | 5.5–7 s wide view                 |
| CI-06    | 0–1.5 s near emphasis | Transfer focus 1.5–3.5 s; tiny travel ends at 4.5 s | 4.5–7 s far emphasis              |
| CI-07    | 0–0.5 s               | Curved approach 0.5–5.4 s                           | 5.4–7 s subject framed            |
| CI-08    | 0–1 s                 | Compensation move 1–4.8 s                           | 4.8–7 s tense held composition    |
| CI-09    | 0–0.7 s               | Subject-anchored parallax sweep 0.7–5.5 s           | 5.5–7 s settled depth composition |

No shot needs moving fog, particles, light leaks, or vignettes to qualify. Sound may support a later episode edit, but the proof's visual change must read silently.

## 6. Build order

1. **Prepared camera foundation:** v2 contract, shared camera evaluation, plane projection, target anchoring, painted-area and protected-subject checks. Preserve v1 and legacy depth golden tests.
2. **Primary proofs:** Build CI-09 Layered Parallax first using kit B, then CI-01 Threshold Push, CI-02 Lateral Track, and CI-03 Foreground Reveal with kits A and B. Inspect full-size motion, occlusion boundaries, and linework before expanding the family.
3. **Context and path variation:** CI-04 Rising Vista, CI-05 Detail to World, CI-07 Curved Approach. Reuse kit C and courtyard assets; prove second compatible scene bindings.
4. **Attention and tension:** CI-06 Focus Handoff and CI-08 Dolly-Zoom Tension using kit D. Treat blur quality, subject registration, and background compression as explicit pass/fail risks.
5. **Integration and QA:** real CLI exports, same lab preview, deterministic retries, source/asset hashes, fallback provenance, measured preparation and rendering costs.
6. **One review:** a 63-second silent reel, nine clean full-frame shots, optional individual replay and external template labels. Add a small first/middle/last reference strip outside the video. Keep extra technical variations in the QA report.

The dedicated Layered Parallax prototype and its original kit B art are now implemented. Threshold Push, Lateral Track, and Foreground Reveal are the next template work; see the [milestone report](./cinematic-parallax-implementation.md) for the exact supported scope.

## 7. Acceptance and measurement

### Creative checks

- Each shot has a readable place, focal subject, and compositional destination with no explanatory overlay.
- The change in depth/occlusion is visible during a normal-speed viewing and at 320×180. A full-frame scale change with identical movement on every layer does not count as a parallax proof.
- First, middle, and final frames retain deliberate framing. Camera travel never detaches feet, props, or their shadows from the setting.
- There are no exposed background holes, duplicated subjects, alpha rectangles, dark blur fringes, texture shimmer, stretched faces, or newly invented sides of an object.
- CI-03 actually uncovers its subject; CI-06 transfers attention while preserving usable linework; CI-08 holds subject size while changing the surroundings.
- The nine clips show distinct framing/motion purposes. Variation cannot be achieved solely through different speeds or reversed travel.

### Technical checks

- Seven seconds yields exactly 168 frames at 24 fps and 210 at 30 fps. Verify the joined 63-second reel and decode it completely.
- Compare preview and export at each template's motion start, midpoint, event boundary, and final frame. Include focus-filter edges in image comparisons rather than only comparing camera parameters.
- Check every emitted frame against background coverage and protected subject bounds. Fail or reduce the envelope with a reported reason.
- Verify near/middle/far landmark motion against the shared camera model, target lock for CI-08, and fixed horizon for CI-04.
- For CI-09, measure distinct plane displacement, subject drift and scale limits, and complete background coverage. Near travel must exceed far travel by at least 2× at standard strength, and the difference must read at 320×180. A reduced move that loses that visible separation fails the parallax proof and must be reported as a fallback.
- Render at least two distinct compatible compositions per template for internal QA. Change layer geometry and depth staging meaningfully; a duplicate scene with a small global offset is insufficient.
- Repeat representative renders and seek out of order; timing and scene identity must remain stable. Run existing illustrated and depth parity suites.

### Economics and evidence

Record asset-generation attempts, billed provider cost when available, preparation/repair minutes, asset reuse count, export wall time, output size, and rejection/fallback reasons separately. Unknown cost remains unknown. The previous 17.47-second render measurement excludes asset preparation and is not a production-cost baseline for these new templates.

Creative approval of this family will still be followed by selecting a representative corpus and testing actual episode coverage. Phase 0 acceptance is unchanged by either a code commit or a cinematic demo reel.
