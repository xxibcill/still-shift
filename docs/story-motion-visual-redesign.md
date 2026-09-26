# Story Motion — visual critique and redesign plan

**Date:** 2026-09-26
**Scope:** the seven v0.13 motion graphics for History Offstage S01E01.
**Status:** the following critique/plan is retained as the baseline. The user subsequently authorized implementation of all seven on 2026-09-26; see [delivered visuals and inspection evidence](story-motion-visual-implementation.md). V1–V5 are implemented. V6 has a local narrated ST-013/014 candidate; wider episode integration remains pending.

The owner finds the motion useful and wants the graphics to be more beautiful. The current fixtures explain mechanisms, but the visual treatment reads as a demonstration deck: textured object cutouts, geometric houses, floating connectors and the same heading on every scene. The largest opportunity is a coherent illustration language and stronger staging.

The recommendation is to realize the channel's existing **Layered Chronicle Animation** identity: expressive drawn forms, shallow layered space, controlled print texture and contemporary editorial typography. This is an application of the approved identity, with proposed scene compositions below. It is not a new channel rebrand. The user’s subsequent implementation request authorized this pass within the existing identity. Final creative/release acceptance is separate.

## Review basis

- All seven full-resolution posters in [story-motion-v002](../benchmarks/results/story-motion-v002/index.html), with sampled motion sheets for temporal context. The crisis/reset sheet was re-inspected during this critique. This is a frame/sample review, not a new real-time playback or audience study.
- The actual fixture builder, prepared-node contract and Canvas renderer, rather than a hypothetical implementation.
- The channel's canonical [Layered Chronicle Animation Style Bible v1.1](</Users/jjae/Documents/obsidian/ai-business/history-offstage/02 Operations/Layered Chronicle Animation Style Bible.md>), [Channel Brief](</Users/jjae/Documents/obsidian/ai-business/history-offstage/01 Strategy/Channel Brief.md>), [S01E01 design study](../prompt-packs/s01e01-motion-design.md) and [motion implementation record](story-motion-implementation.md).

The local rendered gallery is ignored by Git and must be regenerated on another checkout. The lab UI is outside this critique.

## Design verdict

**Visual authorship: needs a substantial art pass.** The familiar generic-interface problems—neon gradients, glass panels, excessive rounded cards—are absent. The relevant template symptoms are repeated page furniture, interchangeable object tokens, inconsistent drawing styles and empty space left between diagram nodes. These are visible design problems; appearance alone does not establish how an image was produced.

Three things are worth building on: the restrained earthy palette fits the subject; the store has a strong recognizable silhouette; and the staged relationships provide a useful structure for directing attention. The existing separation of crisis and later local context is also a sound editorial foundation.

### Highest-impact findings

| Priority | Finding and evidence                                                                                                                                                                                                                        | Design response                                                                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | **Two incompatible illustration languages.** The Access Constraint store has dense drawn texture and volume; the houses use smooth rectangles and roof chevrons. They feel assembled from separate libraries.                               | Rebuild the household/store/token family to the same silhouette, line, detail and perspective rules. Simplify the store as well as enriching the houses. `/normalize`, `/extract`.                |
| P1       | **Every motion inherits a slide layout.** A series masthead, serif title, subtitle and production footer occupy the same positions. Small actors sit in the remaining space. The diagram changes, but the visual experience barely changes. | Put production metadata in the gallery shell. Give each scene its own focal scale, ground and composition; retain on-screen historical context. `/arrange`, `/distill`.                           |
| P1       | **Text hierarchy is wrong for video.** Subtitles are 28 px; many labels are 28–35 px; the footer is 21 px. At a 390 px display width, 28 px becomes about 5.7 px. The style bible requires at least 42 px at 1080p.                         | Use the actual channel fonts, shorter sentence-case labels, the approved type scale and explicit reading holds. Enlarge essential content instead of shrinking it to fit. `/typeset`, `/clarify`. |
| P1       | **Pictures sometimes imply the wrong idea.** A pouch means access in one fixture; a bowl means access in the crisis fixture; a wheat bundle stands for rent/service in the ending. Access restriction bars resemble an equals sign.         | Define a stable visual meaning for each motif. Use an abstract labeled relation when no literal object is justified. Make the narrowing visibly belong to the route. `/clarify`, `/extract`.      |
| P2       | **Relationships lack visual finish.** Long floating lines, dense object detail, uniformly pale fields and faded-out label groups weaken focus. In Motif Resolve, opacity 0.45 makes both object and caption recede together.                | Attach paths to designed ports; reserve space around labels; keep label contrast when de-emphasizing art; concentrate texture and accent on the active beat. `/arrange`, `/colorize`, `/polish`.  |

No P0 defect is asserted from this visual review. P1 denotes a major obstacle to the intended episode appearance, not an engine failure.

Representative evidence: [Access Constraint](../benchmarks/results/story-motion-v002/access-constraint.png), [Evidence Boundary](../benchmarks/results/story-motion-v002/evidence-boundary.png), [Motif Resolve](../benchmarks/results/story-motion-v002/motif-resolve.png).

## Recommended visual system

**Desired impression: an illustrated historical essay with a strong human scale.** Broad ink shapes establish the scene; selective hatching gives it tactility; an object or relationship carries the idea; typography supplies only the context the picture cannot. Each held frame should work as an intentional illustration.

### Illustration and materials

- Use expressive but controlled contours, shallow perspective and two or three value groups. Restore the approved 6 px outer / 3 px internal line language at 1080p, allowing roughly ±20% drawn variation. Keep connectors near the 5 px path token and evidence rules at 2 px.
- Replace the roof-chevron household with a bounded, researched house/threshold silhouette. Keep paired households equal in scale and on shared ground. Do not use conspicuously different house sizes, grime or decorative wealth cues to invent the comparison.
- Reduce the grain store's tiny grain-by-grain and timber detail. Match its contour and tonal density to the household. A common kit should look related even with texture switched off.
- Add grounding through a broad terrain or floor shape, overlap and restrained cast marks. Background context must help explain the relationship; unrelated scenery and invented weather add noise.
- Use one dominant texture: sparse form-following hatching or halftone. Apply fine neutral paper texture at the bible's 6–12% range only after checking compression. Any texture is fixed across frames; no random per-frame shimmer.
- Preserve the channel's exclusions: faux parchment, fake archival writing, faux woodcut imitation, glossy 3D, heavy drop shadows and children's paper-craft depth.

### Color and type

Use the canonical tokens rather than the fixture's near-matching substitutes:

| Color  | Value     | Role                                                              |
| ------ | --------- | ----------------------------------------------------------------- |
| Bone   | `#E8DFC9` | Main field and quiet space                                        |
| Ink    | `#211F1B` | Silhouettes, readable text and structural contrast                |
| Field  | `#59664D` | Land and ordinary systems; never a generic “good” signal          |
| Grain  | `#B47A2A` | Food/resources and selective attention                            |
| Red    | `#8B3F36` | Obligation or pressure; normally no more than 10–15% of the frame |
| Crisis | `#4B5F70` | Explicitly labeled crisis/comparison contexts                     |

Bone and ink do most of the work. Give the current beat one dominant accent. Describe unknown local conditions in ink with explicit wording and spatial separation; do not make uncertainty look like a red failure or an empty stock count. Keep color meaning reinforced by labels and geometry.

Use **Source Serif 4 Semibold** for brief display statements, **IBM Plex Sans Medium/Semibold** for labels and dates, and **IBM Plex Mono Medium** only for source identifiers. These are already the channel's specified families. Font files and licenses should come from the official [Adobe Source Serif](https://github.com/adobe-fonts/source-serif) and [IBM Plex](https://github.com/IBM/plex) projects and be pinned locally for rendering.

At 1920 × 1080: 112 px hero phrase, 82 px scene heading, 62 px panel heading, 48 px label/date, 42 px source context. A key label may use the larger tier. Use sentence case, with capitals limited to short state markers. Required qualifiers receive real space and at least the source tier; production metadata belongs outside the video. A scene need not have a headline when its picture and narration already carry the idea.

### Composition and visual rhythm

Use the canonical 12-column grid, 32 px gutters, 96 px horizontal / 72 px vertical safe area and 8 px spacing unit. Aim for 20–35% intentional quiet space where text or sources need it. Large subjects and useful negative space must coexist.

Alternate three established composition families:

1. **Lived scene:** household/threshold on a grounded field, with a relationship integrated into the space.
2. **Mechanism scene:** a dominant store or category, with a small number of directly attached supporting relations.
3. **Evidence/contrast scene:** a deliberate division between what is supported, what remains unknown, or which dated context is being discussed.

Composition should follow the narrated idea. Use symmetry for the controlled household comparison; use asymmetry for most other scenes. Change scale, staging and emphasis across the sequence. Avoid repeating a radial object board, a header-plus-diagram page, or a single permanent evidence panel for an entire passage.

## Art direction for each motion

| Motion                 | New composition and graphic treatment                                                                                                                                                                                                                                                                              | Motion/meaning to preserve                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unequal Margins**    | Two larger illustrated households share one continuous ground band and season context. Pressure brackets become open, drawn contours positioned close to each household, with concise consequence labels. Use paired negative spaces to make different room to absorb strain visible.                              | Matched house scale and common conditions. Pressure is qualitative: no bars, measured reserves, fabricated ratios or class caricatures.                                                                                           |
| **Access Constraint**  | A large store anchors the left; matched households form a paired destination on the right. Shorten the connecting span. Give the moving restriction sides visible depth as abstract ink-edged bands, so they belong to the route rather than reading as an equals sign. The narrowed aperture is the focal detail. | Source remains available; both routes remain connected and open. Restriction is explanatory geometry, not a claim that a physical gate existed. No traveling grain units.                                                         |
| **Relationship Build** | Stage a dominant store against a shallow ground shape. Introduce dependencies in two or three offset clusters with labels beside their anchors. Develop the composition into the household comparison, rather than leaving every object orbiting a hub.                                                            | Narration-timed reveals and emphasis, stable object identity, token-free relationships. No measured drain or implied causal weights.                                                                                              |
| **Evidence Boundary**  | Create an editorial explanation with three spatial roles: supported categories, an explicitly unknown field, and a separate composite household. Use plain dividers, typographic hierarchy and a visible limitation; remove the giant question mark and generic card feel.                                         | Introduce Lene's date/status first in the episode version. Generated category illustrations must not use the authentic-evidence card grammar. No fake inventory page, recovered pantry, zero value or invented itemized holdings. |
| **Dated System Break** | Start with a large, readable 1315–17 context and the familiar system arranged as a compact composition. Activate the crisis-blue field/accents and restrained red fractures. Hard-cut to a newly staged, bone-and-ink Walsham 1327–29 frame with clear unknown local conditions.                                   | Date before fracture; ordered breaks remain authored explanatory beats. The famine network never heals into Walsham. The reset must change the composition as well as the caption.                                                |
| **Category Swap**      | Make the authored category state the central subject. Register both states to the same baseline and visual center, with equal optical prominence. Integrate its label into the state package; retain the comparison qualifier and surrounding anchors.                                                             | Exact-frame substitution, not organic transformation or an eating sequence. Use the qualified Hinderclay comparison; no invented species, amounts or Walsham meal.                                                                |
| **Motif Resolve**      | Reassemble the same household, resource and access motifs into one calm, grounded scene. Keep supporting labels readable while emphasis moves to the outgoing land → rent/service relation. Reserve a deliberate quiet end-screen area.                                                                            | Familiar forms return; no new factual claim. Represent rent/service with labeled abstract relations unless a researched object is warranted—remove the generic wheat-bundle substitution. No eviction or punishment event.        |

### Shared kit to prepare

Build a small reusable family, not seven independently generated scenes:

| Master asset/component           | Derivatives and use                                                             |
| -------------------------------- | ------------------------------------------------------------------------------- |
| Household + threshold            | Matched comparison pair; composite reference; closing scene                     |
| Grain store                      | Resource anchor, access source and crisis system; fixed stock silhouette        |
| Ground/field shapes              | Scene grounding and land motif; no invented settlement geometry                 |
| Access corridor + pressure sides | Stable open/narrow states; the same access meaning wherever it returns          |
| Obligation relation              | Explicit label and drawn path; distinct from food imagery                       |
| Category states                  | Only the source-supported or explicitly symbolic states required by the passage |
| Editorial annotation components  | Date/place, limitation, reconstruction mark, source identifier, route labels    |

Separate silhouette, restrained texture, shadow/contact mark and editable typography where useful. Maintain consistent asset IDs, anchors, source lineage and historical-specificity levels. HS-0 symbols remain visibly explanatory; a more beautiful drawing is not permission to increase historical specificity.

## Implementation roadmap

These are internal production steps within v0.13, not seven new creator approval gates. All seven motions are included in the visual pass.

| Step                               | Concrete work                                                                                                                                                                                                              | Reviewable output / exit                                                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **V1 — Compose before polishing**  | Board start/change/hold states for all seven. Finish three representative style frames: Access Constraint, Evidence Boundary and the crisis/reset pair. Establish subject scale, labels, safe areas and symbol meanings.   | One contact sheet shows the whole family, plus full-size representative frames. Different scene purposes are recognizable without reading preset names. |
| **V2 — Build the common art kit**  | Prepare the household/store/ground masters, category states and drawn relation components. Normalize contours, perspective, value and texture; preserve selected episode originals.                                        | Reusable layered kit with IDs, anchors and a source/derivative manifest. No mixed clip-art styles remain.                                               |
| **V3 — Support the visual system** | Add pinned font assets and deterministic loading; extract shared theme/type roles; separate gallery metadata from shot text. Author path ports and text keep-out areas in scene layouts.                                   | One Access Constraint preview rendered through both lab and CLI, with the intended fonts and a clear aperture at phone size.                            |
| **V4 — Apply to all seven**        | Replace the fixture art/layouts using the common system. Update artwork and caption grouping without changing recipe meaning. Complete entry/change/hold compositions, then render a new versioned seven-preview gallery.  | Seven coherent but compositionally distinct clips, including a visible crisis/reset contrast and registered category switch.                            |
| **V5 — Inspect and refine**        | Review real-time playback, event-boundary frames, full-resolution holds, 390 px views and 320 px silhouettes. Check grayscale, text contrast, route attachment, label collisions and texture shimmer. Fix the weak frames. | Recorded inspection method and resolved defects; deterministic seeking and preview/export parity still pass.                                            |
| **V6 — Conform to S01E01**         | First prove ST-013/014 against its existing 646-frame narration, then apply the kit across the mapped episode passages. Preserve context/qualifiers and shot continuity.                                                   | Narration-conformed episode derivatives and handoff metadata under the existing episode roadmap. A fixture gallery alone does not finish this step.     |

V1's representative frames are an internal calibration step before repeating decisions across the kit. The expected first visible deliverable is the contact sheet/style frames, not another engine-only milestone. Estimate the remaining asset work after that pass; no unsupported calendar promise or generation-cost estimate is made here.

### Bounded code work

- **Fixture authoring:** `scripts/create-story-demos.ts` currently contains the hardcoded palette, repeated `heading()`, procedural `house()` and reused `factor()` sprites. Extract the History Offstage visual theme and asset mappings; author distinct layouts with shared components. Keep preset IDs and cue contracts stable.
- **Fonts:** `PreparedNodeSchema` currently accepts generic `serif`/`sans-serif` and normal/bold only. Design additive font references and required weights with pinned file hashes. Make the shared lab/export asset preparation wait for fonts before measuring or drawing; report missing fonts rather than silently exporting a substitute. Preserve legacy input compatibility.
- **Text and emphasis:** prepare deliberate line breaks and separate label nodes from de-emphasized art groups. No automatic text shrink below 42 px. Layout checks should use loaded font metrics.
- **Connectors:** solve the initial layouts with explicit perimeter anchors and label keep-out space. The current bound geometry supports straight paths only; avoid promising automatic curved routing. Add a small authored waypoint option only if an actual moving composition cannot be solved with existing grouping/anchors. Access Constraint retains its validated straight route and clearance logic.
- **Validation:** keep existing event/role/frame tests. Add focused font-loading/failure and renderer parity coverage if that capability changes; inspect composition visually. Do not build an unrelated timeline editor, shader system or general layout engine for this pass.

## Acceptance criteria

The internal checks below are complete for the delivered library and local proof. The [execution report](story-motion-visual-implementation.md) records inspection methods and limits; these checks do not imply human creative/release acceptance.

- [x] Pausing at a designed hold reveals a finished composition: one clear focal idea, one supporting relationship and deliberate quiet space.
- [x] All seven use one illustration family, but adjacent scenes differ meaningfully in arrangement, scale or context.
- [x] The generic series masthead, motion-study subtitle and production footer are outside episode footage. Required dates, evidence limits and reconstruction labels remain inside it.
- [x] Essential text is at least 42 px at 1080p, fits its authored area and survives the intended phone-width preview. Source captions hold for at least three seconds or a longer ordinary reading interval; exact-frame episode timing remains authoritative.
- [x] Every asset has a stable meaning. Access does not switch arbitrarily between pouch and bowl; wheat does not silently stand for all rent/service.
- [x] Texture, line weights and perspective agree across houses, objects, paths and panels; no compression shimmer or mismatched halos are visible.
- [x] Connectors meet meaningful anchors throughout motion and avoid labels. Category states share an optical center and baseline.
- [x] Known, unknown and composite remain distinguishable without color. Unknown never reads as zero, and generated art never reads as an authentic source image.
- [x] Comparison scale, open access, date-before-break, hard context reset and qualified substitution remain correct.
- [x] Actual playback and sampled checks are separately recorded. Phone review is performed, not inferred from a font-size calculation.
- [x] Seven revised fixture clips and the narrated ST-013/014 proof are tracked separately. Neither is described as a completed episode.

## Review notes for future comparison

**Director's subjective scores, 0–4:** illustration consistency **1**, composition/scale **1**, typography **1**, semantic symbol clarity **2**, palette discipline **2**, sequence variety **1**. Total **8/24** for these visual dimensions; this is a critique baseline, not a measured viewer rating. Target each dimension at 3 or better after the visual pass, supported by the actual frames.

The critique skill's interactive Nielsen score is not applied to video frames: navigation, undo, error recovery and interface efficiency are outside this request. No `/40` usability score or accessibility certification is implied.

Adapted cognitive-load checklist: single focus **fail** (page furniture competes); chunking **pass** (few main motifs); grouping **pass** (roles are generally spatially associated); hierarchy **fail** (titles outweigh the event); one beat at a time **provisional pass** from samples; minimal choices **N/A**; recognition across scenes **fail** (symbol meanings change); progressive disclosure **provisional pass** from samples. **Three failures: moderate concern** under this heuristic. Playback with narration still needs checking.

Hypothetical viewer walkthroughs, not recruited user tests:

- **New history viewer:** sees a pouch or bowl labeled access and must translate the object into an abstract mechanism. Fix the access motif and keep its meaning stable.
- **Phone / low-vision viewer:** loses the 28 px qualifiers and faded closing labels when the frame is reduced. Enlarge meaningful text, maintain ink contrast and simplify the composition.
- **Returning series viewer:** recognizes objects but sees the same presentation frame and encounters a wheat bundle newly meaning rent/service. Keep illustration identity while varying staging and preserving symbol meaning.

Suggested execution skills, in order: `/arrange` for the seven compositions; `/normalize` and `/extract` for the shared art kit; `/typeset` for real font roles and scale; `/clarify` for symbols and qualifiers; `/colorize` for semantic accent discipline; `/polish` for final frames. These are implementation aids, not separate required user commands or approvals.
