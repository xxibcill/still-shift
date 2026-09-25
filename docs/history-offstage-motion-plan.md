# History Offstage motion presets — analysis and build plan

**Date:** 2026-09-25

**Status:** Owner approved the full plan. All six presets are implemented; [implementation, review reel, and evidence](./history-offstage-motion-implementation.md). Creative acceptance is pending.

**Trigger:** The owner found the first trial too basic and correctly identified `locked_hold` as having no animation.

## 1. What needs to change

`locked_hold` exports a still frame for a chosen duration. It is useful as a timing utility or a static comparison baseline, but it should not count toward an animation library's variety. `story_settle` adds a small whole-image push; `panel_reveal` and `comparison_step` expose parts of a flattened image. These prove export mechanics, but the owner has not accepted them as a sufficient History Offstage animation treatment.

The next trial must demonstrate changes inside an illustrated composition: an object goes somewhere, a connection develops, access becomes restricted, a comparison changes, or an authored pose switches. Each preset needs an explicit story purpose and a visible result.

The earlier geometric fixtures are useful technical tests. Their circles and boxes do not demonstrate the linework, irregular silhouettes, halftones, composition, or emotional register of History Offstage. Creative review needs finished illustrations at representative complexity.

## 2. What I inspected

| Reference                                                                                                                                                                     | Finding that affects the design                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Master style bible, especially sections 3–4 and 7.3](</Users/jjae/Documents/obsidian/ai-business/history-offstage/02 Operations/Layered Chronicle Animation Style Bible.md>) | Motion explains a change. The vocabulary includes paths, object substitutions, panel rearrangement, stepped poses, shallow parallax, and crisis fractures. Objects, texture, copy, and sources belong on separate layers.                                                                 |
| [Current AI production profile](</Users/jjae/Documents/obsidian/ai-business/history-offstage/02 Operations/Layered Chronicle AI Production Profile.md>)                       | Meaningful information or pose changes occur roughly every 4–8 seconds where narration supports them. Whole-board zooms and crossfades do not complete the animation pass.                                                                                                                |
| [S01E01 hybrid plan](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/Hybrid Video Production Plan.md>)                        | Resources divide; obligations connect; access opens or narrows. Deterministic animation carries most of the film, with very limited generated hero action.                                                                                                                                |
| [S01E01 composition plan](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/03E 10-Minute Composition Plan.md>)                 | Reuse one scene package through establish → reveal → transform → ground → resolve. Its historical timecodes and prices are not current production targets.                                                                                                                                |
| [S01E01 storyboard](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/03I Storyboard Index.md>)                                 | Specific examples include resource paths in S04-01-B, unequal reserve margins in S05-02, obligation networks in S06, and system failure in sequence 9.                                                                                                                                    |
| [S01E02 storyboard](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E02 - Rent Day/03I Storyboard Index.md>)                                      | A payment token stops short of an anchor, obligations enter in groups, and unresolved paths remain unresolved. The engine must support incomplete outcomes.                                                                                                                               |
| S01E01 existing 28-board contact sheet and four full selected sources: ST-005, ST-006, ST-013, ST-021                                                                         | Viewed as references only. ST-005 has overlapping foreground containers and figures; ST-006 has irregular drawn paths already baked into the image; ST-013 contains a shared two-panel landscape; ST-021 combines intact and fractured networks. A generic wipe ignores those structures. |
| [Current Still Shift scope](../Phase_0_Implementation_Plan.md), contracts, renderer, and [product direction](./product-positioning.md)                                        | The implemented scene is one image plane plus optional depth. It has no semantic layers, paths, or alternate poses; requests/results assume 30 fps. The original Phase 0 explicitly excludes masks and inpainting.                                                                        |
| [History Offstage Remotion scenes](/Users/jjae/Documents/obsidian/ai-business/history-offstage/remotion/src/HybridScenes.tsx)                                                 | Existing episode-side components already express resource paths, access comparison, and dated contrasts. They are useful behavior references; their presence is not evidence that Still Shift supports these operations.                                                                  |

These are visual and implementation findings, not a new historical claim audit. Selected images are references, not newly selected benchmark entries or approved transformation inputs. The retired 43-image set stays retired.

## 3. Design rules for the next set

- Animate the element that carries the narrated change. Keep at most three focal elements moving together.
- Every preset must reach at least two meaningfully different readable states. A whole-frame translation, zoom, opacity fade, or static hold alone does not meet this trial's creative bar.
- Hold before and after a short event so the change is legible. The style's substantial use of held frames is compatible with animation occurring between authored states.
- Use restrained, decisive timing: enters 8–14 frames, paths 10–18, reveals 12–20, composition shifts 16–28, crisis breaks 6–16, measured at 24 fps. These are starting values from the style bible, not a requirement to fill every shot with events.
- Keep shallow parallax within the available prepared pixels; the normal style range is 2–4% of frame size. Never infer that a mask supplies hidden background pixels.
- Use drawn silhouettes, charcoal contours, warm bone, field green, ochre, restrained red, and fixed print texture. Avoid soft photo-like depth distortion, springy UI motion, and animated texture noise.
- Keep text, sources, and dates editable and stable. Preserve 96 px horizontal and 72 px vertical safe areas at 1080p. Check readability at 320 px wide.
- Bind causal directions, quantities, dates, and outcomes to the supplied shot plan. A preset animates the supplied relationship; it does not invent it.

## 4. Six proposed presets

Each proof clip will be seven seconds. The beats below are illustrative timing, to be retimed to narration in an episode. All six require more preparation than passing an arbitrary flat image to a camera shader.

| Preset                                        | What the viewer sees                                                                                                                                                                               | History Offstage use                                                                                    | Required scene ingredients                                                                                                           |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Layered reveal** (`chronicle_reveal`)       | A foreground object briefly shifts to uncover a meaningful middle-ground relationship; foreground, action, and distant setting move by different small amounts, then settle into a composed frame. | Establish a household/resource relationship, or hand off from a field to a system view.                 | 2–3 RGBA layers, intact background behind moving objects, authored reveal target and allowed movement bounds.                        |
| **Resource flow** (`resource_flow`)           | One branch draws from a resource node; a token follows it and arrives. A second destination activates on the next beat while the first remains visible.                                            | Food, seed, sale, and obligations as competing uses; grouped rent obligations.                          | Isolated resource/destination tokens, 2–4 authored paths with anchors, a clean base, editable labels, ordered events.                |
| **Access pressure** (`access_pressure`)       | A connection is established, then narrows or breaks at a defined point. A token visibly stops short. An alternate path appears only when the narration supports one.                               | “Available” versus “accessible”; an unmet obligation; a weakened support route.                         | Path segments, token, stop/block anchors, normal and restricted states, a qualifier.                                                 |
| **Comparison builds** (`comparison_build`)    | A shared scene reorganizes into aligned panels. One selected variable changes differently in each panel while the common baseline stays fixed.                                                     | Unequal reserves under the same season; contrasting holdings with distinct obligations.                 | Complete panel assets, shared alignment anchors, separate reserve/state layers, explicit qualitative or sourced quantitative values. |
| **Pose and prop change** (`pose_prop_change`) | A character or prop switches between two or three deliberately drawn states at an action beat. A short object translation or occlusion supports the switch, while the setting stays stable.        | A tool contact, token placement, carrying/resting state, or object substitution used in an explanation. | Registered pose/state A and B, optional contact state, common pivots, clean base and occlusion mask. A single pose is insufficient.  |
| **Crisis fracture** (`crisis_fracture`)       | After a date/context card is readable, selected connections fracture in sequence and panels separate slightly. A short registration pulse emphasizes the break on illustration only.               | A clearly dated system contrast such as the separate famine section.                                    | Intact and broken path states, movable nodes/panels, fixed date/source layers, explicit affected connections.                        |

### Seven-second proof beats

| Preset               | Establish                                    | Change                                                                                                            | Resolve                                                                                      |
| -------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Layered reveal       | 0–1.2 s: composition and foreground pressure | 1.2–2.1 s: bounded layer separation; 3.8–4.4 s: one linked object/state reveals                                   | Hold the newly readable relationship through 7 s.                                            |
| Resource flow        | 0–1 s: source and first destination          | 1–1.6 s: first path; 1.6–2.3 s: token arrives; 3.7–4.8 s: second branch and destination                           | Both relationships remain readable. Equal token sizes do not imply equal historical amounts. |
| Access pressure      | 0–1 s: readable endpoints                    | 1–1.7 s: path establishes; 3–3.5 s: restriction enters; 3.5–4.3 s: token approaches and stops                     | A gap remains clearly visible. No implied delivery.                                          |
| Comparison builds    | 0–1.2 s: shared condition                    | 1.2–2 s: panels align; 3.3–4.2 s: authored reserve states change at different extents                             | Both panels and their common baseline remain visible together.                               |
| Pose and prop change | 0–1.5 s: complete pose A                     | At 1.5 s: first authored state switch; at 3.7 s: contact/final state; any translation finishes within 8–14 frames | Hold the readable consequence. No optical-flow interpolation or anatomy morph.               |
| Crisis fracture      | 0–1.5 s: context and intact system           | 1.5–2.1 s: first break; 3.2–3.9 s: second break and small panel separation                                        | Hold the altered system with context legible.                                                |

`Resource flow`, `Access pressure`, and `Crisis fracture` share path machinery but tell distinct stories. They must have distinct state sequences, not merely different speeds or directions. `Pose and prop change` changes drawings; it does not synthesize an unseen action.

## 5. Smallest useful implementation

**Planning assumption:** Allow AI to prepare reusable layers and states. This plan recommends prepared assets; a strict single-flat-image requirement would materially reduce the feasible motion set. This is a design assumption, not an approval record for altering selected episode sources.

Introduce an experimental **prepared illustrated scene** input alongside the existing image input. It contains:

1. Local hashed asset references, with source lineage and bounds.
2. Ordered image layers, alpha masks where needed, pivots, fixed background, and protected regions.
3. Authored vector paths with source, destination, intermediate, and stop anchors.
4. Registered alternate object/pose states and editable text layers.
5. Explicit timed events: enter, translate, draw path, change state, restrict path, and fracture.
6. A fixed frame rate, duration, preset version, and the exact permitted movement envelope.

A preset fills event timing and motion defaults for a compatible scene. It must report missing required assets before export. A static output cannot silently stand in for an unavailable animation and be counted as success.

Use the existing deterministic renderer/export pipeline, extending it with layered planes and path rendering behind its engine interface. Evaluate each event from absolute frame time so seeks, retries, preview, and export agree. Avoid a separate demo-only renderer that cannot run through the real CLI.

Add a versioned prepared-scene contract with explicit 24/30 fps metadata. Render the illustrated proofs at 24 fps, matching the channel; preserve the existing 30 fps request contract and regression fixtures. Frame-count validation must read the scene's actual rate. An experimental scene-file CLI input and a compatible-preset lab selector are sufficient; a general timeline editor is unnecessary for this proof.

The History Offstage Remotion project remains the episode assembly consumer. Keep narration and final sequence editing there. This task proposes reusable short-shot behavior in Still Shift.

### Asset preparation and cost

AI will stage and inspect the demo assets. The user should not be handed a mask-drawing exercise. Prefer original illustrations authored as reusable components, with derived clean plates or masks only where necessary. The companion [asset prompt pack](../prompt-packs/history-offstage-still-animation-prompt-pack.md) defines the six scene packages.

A proof using prepared assets measures whether the motion is useful. It does not prove that arbitrary existing images can be segmented automatically. Record preparation time, any generation cost, repairs, and reuse count alongside render time. If each seven-second clip needs extensive repair, that is a failed economics assumption even if export is fast.

For arbitrary flat input, offer only treatments its actual assets support. Do not infer paths, unseen anatomy, or hidden backgrounds from preset names. Automatic segmentation/inpainting as a general service remains a later decision based on this proof.

## 6. Build order and review burden

1. **Record this analysis and plan before implementation.** Reclassify the first four-treatment trial as creatively insufficient for the requested use. Move `locked_hold` into a timing/baseline category in the next UI revision.
2. **Build the common scene support.** Add prepared layers, path/anchor events, alternate states, deterministic timing, and 24 fps validation for the new scene input. Keep original depth fixtures passing.
3. **Prove three distinct mechanisms first:** Layered reveal, Resource flow, and Pose and prop change. Use finished illustrations with irregular contours and print texture. If any fails, repair the shared mechanism before multiplying variants.
4. **Finish the other three:** Access pressure, Comparison builds, and Crisis fracture using the same scene support.
5. **AI QA before user review:** inspect the actual MP4 motion intervals, layer edges, first/last states, timeline boundaries, labels, and interpretation. Technical test success is not creative acceptance.
6. **Present one 42-second reel:** six seven-second clips, with optional individual replay. Summarize any unresolved issue. Do not ask the user to review every source through every preset.
7. **Choose and freeze the later evaluation corpus separately.** Assign compatible presets to shots. A representative full episode and Phase 0 release gates are still required after a successful proof reel.

## 7. Acceptance criteria

For each proof clip:

- Its named object, path, panel, or pose visibly changes; the viewer can describe what changed after one normal-speed viewing.
- The animation preserves the illustration's contours and fixed print texture. No ghost objects, moving rectangular background patches, missing fill, halos, torn paths, rubbery figures, or unintended crop.
- Paths start and end on the specified anchors. Blocked motion stops before the gap; a pulse does not masquerade as a completed transfer.
- The beginning, end, and intended reading holds each form a complete composition at full size and at 320 px width.
- Dates, sources, and comparison variables stay legible and retain their supplied meaning. Qualitative graphics cannot imply fabricated measurements.
- Preview and encoded output agree at event boundaries and representative intermediate frames; repeat renders preserve timing and framing.
- Seven seconds at 24 fps produces exactly 168 frames, with no duplicated timing caused by 30 fps assumptions. Legacy 30 fps checks remain valid.
- A second compatible prepared scene works with the same preset, so the result is reusable behavior rather than one hard-coded animation. AI checks these additional technical cases; the default user review remains the six-clip reel.

For the reel: six visibly distinct treatments; no static hold presented as an animation demo; no repeated camera move filling the gaps; no generic dashboard appearance used as the creative proof.

## 8. Scope and execution record

This is an owner-authorized extension to the original Phase 0 experiment: supplied layers, paths, and state sequences were outside its initial depth-only scope. It is reported separately so a successful layered proof does not imply that arbitrary single-image animation has passed.

The initial planning pass produced this plan and its asset brief before implementation. Following the owner's “let's do this all,” execution added all six presets, a versioned prepared-scene contract, CLI and lab support, three original reusable raster assets, and the six-clip reel. Canvas 2D inside renderer-core handles the illustration layer/path compositor, sharing the existing deterministic export pipeline. This is the implementation refinement to the layered-plane proposal above. Alpha assets and rectangular clips supply the current masking behavior; arbitrary mask authoring and automatic reconstruction remain outside this proof.

The [execution report](./history-offstage-motion-implementation.md) records tests, provenance, asset-preparation measurement limits, and remaining decisions. No protected selected episode treatment was performed. The new six-preset reel has no creative approval yet.
