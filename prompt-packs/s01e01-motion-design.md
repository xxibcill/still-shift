# S01E01 — motion design from the selected stills

**Date:** 2026-09-26 · **Status:** design proposal, not an episode edit
**Creative objective:** Make the viewer anticipate and understand a changing relationship. Let illustrations become a sequence of events, with a distinct beginning, consequence and resolution.

## 1. Recommendation

Build the first proof from **ST-013 → ST-014, 3:17.833–3:44.750**: two households face the same season, their room to absorb strain differs, then the composition opens into a market-access explanation. This approximately 27-second passage can demonstrate comparison, spatial reorganization, a meaningful restriction and a held conclusion in one continuous sequence.

The next proofs should be **ST-006 → ST-008** (resources and finite buffers) and **ST-021 → ST-022** (a dated crisis and an explicit return to uncertainty). These test three different kinds of storytelling. Adding more generic camera presets is lower priority for this particular episode.

An engaging result is a design hypothesis until the timed sequence is watched. More moving pixels or more cues cannot certify that the film is interesting.

## 2. What I studied

- All 28 current protected stills, using the exact paths in the episode's `production.json`, inspected in four contact sheets. ST-006, ST-013, ST-014 and ST-021 were also opened individually at larger size.
- The corrected **1,022-word** narration, `generated/workflow-adoption-v3/narration-revision-v002.txt`, rather than the older clean draft.
- The existing 28-shot timing/treatment JSON, current production record, Hybrid Video Production Plan, and the saved v007 patch source for `S01E01Hybrid.tsx` and `HybridScenes.tsx`.
- The Layered Chronicle style bible, AI production profile, current v3 standard and standing brief, and the original composition plan as a design reference.
- Still Shift's implemented illustrated recipes and their documented limitations.

This is visual source inspection and an implementation/document review. It is **not a playback review of v007**, a new historical fact-check, or approval of a finished edit. Historical statements below stay within the corrected narration. The diagnosis also incorporates the recorded Creator rejection of v007's slideshow feel.

**Current timing:** 11,297 frames at 24 fps = **7:50.7083**. Ranges below are end-exclusive. Word-level starts must be conformed against the existing audio; inherited cue times are editorial markers, not guaranteed exact word alignment.

**Current opening:** six five-second opening takes have already been generated; the separate opening preview covers frames 0–747, including its 28-frame final hold. H01 and H02 also exist and were accepted with notes. This design creates no additional generation requirement and preserves the opening scope. Their exact later integration remains separate from this design.

## 3. Why the present design can feel static

1. **The picture often gives away the whole explanation.** ST-006 already shows all resource connections. ST-014 already contains the access restriction. ST-021 already shows the fractured result. A moving camera cannot restore the missing reveal.
2. **The repeated page layout dominates.** The saved implementation repeatedly places the art in a 1,240 × 720 region of a 1,920 × 1,080 frame, with a large heading, right-hand explanation column and source strip. The nominal art region occupies about 43% of the canvas. Viewers repeatedly encounter an illustrated lecture page.
3. **Text changes more often than the situation.** Many events introduce a label or a path but leave the central relationship in its final arrangement. The eye has little reason to revisit the art.
4. **Each board starts over.** The prior approved treatment requires a three-second intact opening per still. That was useful for source review, but repeated resets interrupt continuity between related shots. A new sequence treatment should explicitly propose a replacement for that rule where necessary.
5. **Several long passages need internal direction.** ST-008 lasts 30.792 seconds; ST-018 lasts 34.125 seconds. Neither should be one composition with successive caption changes.

These are design risks supported by the sources and code, not a claim that every interval of the encoded cut was watched.

## 4. Motion language for this episode

### Give every move a verb

Use **connect, restrict, separate, compare, expose, return, resolve**. The moving object should carry that verb. Camera movement supports orientation and atmosphere; it should not be the main event of an explanatory shot.

Keep the existing charcoal contours, warm paper, ochre resources, field green and restrained red. Texture stays fixed to its surface. Preserve the hand-drawn character; avoid glossy interfaces, floating dashboard cards and a constant explanatory sidebar.

### Three composition modes

| Mode              | Picture treatment                                                                                                 | Where it earns its place               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Human/place       | Large illustrated composition, one directed move or existing hero action, a quiet qualification outside the image | ST-004/005, ST-011, ST-019/020, ST-028 |
| Mechanism         | One large object or relationship develops into the next state; labels sit next to what they identify              | ST-006–010, ST-014–016, ST-023–027     |
| Evidence boundary | Explicit source/date status; supported categories and unknowns occupy different spaces                            | ST-017/018, ST-021/022                 |

Change mode when the narration changes its kind of claim. Do not rotate modes mechanically.

### Rhythm

- Introduce the question or object, allow anticipation, make one consequential change, then let the result read.
- Aim for a meaningful development around every 4–8 seconds where the narration permits it. Brief transitions may take 8–28 frames; the viewer then needs time to understand the new state.
- Mix a slow spatial reveal, a brisk comparison, a held evidence limit and a sudden dated fracture. Do not use identical easing and duration on every cut.
- Keep at most three focal elements moving independently. Finish one important move before starting another.
- Use matched positions across adjacent shots so the household or store persists while the surrounding explanation changes.
- Use short, purposeful 2–4% parallax only on properly separated environmental layers. Do not import the fivefold Dramatic study settings into the episode by default.
- Retain purposeful silence. Optional cleared material sound should punctuate a real panel/object event; narration-only is a complete design fallback.

### Preserve what the pictures actually mean

The resource diagram is not a measured food allocation. No flowing grain counters, proportional shares, calibrated reserve bars or animated draining bins. ST-013's two painted landscapes differ in vegetation and figures; use a common neutral ground for the comparison so those differences do not accidentally become its explanation. Access should narrow without implying everyone was excluded. A famine graphic must establish **1315–17** before damage appears, and must not heal into **Walsham 1327–29**.

## 5. Detailed first proof: same season → unequal access

**Sources:** ST-013 and ST-014. **Master span:** frames 4748–5393; 646 frames / 26.917 seconds. Preserve current narration and overall boundaries. The following internal events are proposed timing targets.

| Frames / time             | What the viewer sees                                                                                           | Motion and new information                                                                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4748–4847 / 3:17.833–3:22 | A paired composition on a common field, with two house silhouettes held at equal visual scale                  | An establishing view. “Same season” spans both; neither is labelled rich/poor. Retain the prior full-source opening if no amendment has been adopted.                                                          |
| 4848–4967 / 3:22–3:27     | The shared seasonal reference settles above the pair; both houses remain anchored                              | Reveal “room to absorb strain” as the comparison question. Keep weather, baseline and house scale common.                                                                                                      |
| 4968–5081 / 3:27–3:31.750 | A named strain reaches both cases; one has “more room,” one “less room”                                        | Use a small abstract pressure bracket on each side. Difference is semantic and qualitative: no distances, areas or token counts presented as measured reserves. Finish on the contrast.                        |
| 5082–5183 / 3:31.750–3:36 | The pair stays in position as a store/market relationship appears above it                                     | A 20–28-frame recomposition joins ST-013 to ST-014. Mask preparation removes ST-014's baked paths and coins. This replaces the current reset only under the proposed amended treatment.                        |
| 5184–5279 / 3:36–3:40     | A connection draws from available grain toward each household; the second corridor becomes visibly constrained | Paths are equal-width, unmeasured relationships. Move the restriction around the path, rather than merely fading in a label. Keep a visible opening. No travelling food units or literal deliveries.           |
| 5280–5393 / 3:40–3:44.750 | The store remains available while one access corridor is narrower                                              | Hold the changed picture. Short conclusion: “Available ≠ equally accessible.” A new consequence has appeared without changing the grain supply. Cut cleanly to the separately qualified Hinderclay comparison. |

**Preparation:** two house cutouts, one store cutout, one threshold cutout if useful, fixed paper/ground, editable paths, independently controlled abstract restriction shapes, short labels. Remove baked connector/coin residue in the recomposed derivative; do not use a pale rectangular patch over the original scene. Keep source art and shadows together where they establish contact.

**Fallback:** keep the complete selected still intact in its own region and perform the causal graphic in a separate region; accept the reduced immersion explicitly. If cutouts are poor, use a deliberately symbolic diagram after the source view, with text-only household identifiers and geometric relations. Neither fallback needs AI video.

**Success test:** with the explanation muted, the relationship becomes visibly harder for one case while the resource remains available. With narration restored, it does not imply a precise quantity, a universal outcome or a documented transaction.

## 6. Two additional anchor sequences

### ST-006 → ST-008 — move from grain to a household's margin

**Timing:** 1:20.833–2:23.625. Use three internal scenes, not one 63-second radial diagram.

1. **ST-006, 1:20.833–1:37.833:** start with the central store as the visual anchor. As narration moves beyond grain, reveal the relevant relationship groups. Show at most three prominent surrounding groups at a time; retain earlier connections with lower visual emphasis. End wider, with the household dependent on a system. Do not animate the depicted balance as if it supplies a price or move grain toward the credit hands.
2. **ST-007, 1:37.833–1:52.833:** match the store motif into the large grain illustration. Introduce possible loss as a separate qualitative condition, then return attention to “this household / this year.” Keep grain level constant. The loss event is a change in the explanation, not an invented depletion rate. A brief close-to-wide change can expose the household context after an approved crop treatment.
3. **ST-008, 1:52.833–2:23.625:** use establish → stored-food bridge → two-case comparison → shared-calendar rejection. Keep the two houses in a common seasonal world; a single non-calibrated seasonal reference provides orientation. Reveal different room to absorb pressure using words and bracket states. Remove a putative universal deadline as the narration rejects it. Finish on unequal vulnerability, not a race between animated progress bars.

**Why it can hold attention:** the viewer's question changes from “is there grain?” to “what else matters?” to “why does the same season affect households differently?” Each scene leaves a visual element that the next scene uses.

**Safe preparation:** source-grounded icon cutouts and editable connections; a fixed store interior; a common background for the two houses. Keep the people and livestock as held drawings. **Fallback:** full source plus an adjacent causal graphic; no continuous depth deformation of the flat diagram.

### ST-021 → ST-022 — system crisis, then an honest reset

**Timing:** 5:54.750–6:38.875.

1. Let the narration distinguish seasonal pressure from famine. Establish **Great Famine · 1315–17 · comparison** before any fracture.
2. Build an initially connected abstract system from the existing node language, then sever distinct relationships as the narration names repeated harvest shocks, pressure on access and wider disruption. Use one break per emphasized phrase, 6–16 frames for the break followed by a reading interval. Do not assign the timing or break order as a measured historical cascade.
3. Pull the broken relationships into one final system-wide view. The change in scale supplies the escalation; flashing, simulated starvation or storm footage are unnecessary.
4. At ST-022, hard cut/reset into **Walsham · 1327–29**. Maintain the preceding crisis date until the new period is clear. Show a neutral unresolved relationship and “local conditions unknown.” Never reconnect the broken famine system to imply recovery or good local years.

**Preparation:** individual nodes, complete editable connectors and fractured variants, two exact date labels, neutral unknown state. ST-021's existing cracks are in the raster and cannot be undone by animating the image itself. Build intact paths independently rather than painting across them with guessed texture. **Fallback:** two separately dated held panels with one clear cut; keep the uncertainty explicit.

## 7. Complete still-by-still direction

Every row is a treatment proposal tied to the existing still. Time ranges come from the current treatment manifest; descriptions specify what should change, not a claim that new footage exists.

| Still                                                                                                                                                       | Master time       | Treatment                   | Directed event                                                                                                                                                                                   | Guardrail                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| [ST-001](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-001/source-selected-v001.png>) | 0:00.000–0:10.458 | HERO / existing opening     | Keep O01–O06 as the opening; ST-001 is source/design lineage, not an extra animated board.                                                                                                       | Existing approved opening; no duplicate category montage.                              |
| [ST-002](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-002/source-selected-v001.png>) | 0:10.458–0:31.167 | HERO / existing opening     | Continue the generated opening, its qualifications and final hold through frame 747.                                                                                                             | Do not loop or extend takes to create more coverage.                                   |
| [ST-003](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-003/source-selected-v001.png>) | 0:31.167–0:40.750 | 2D / question               | Hold the full source; let the modern question enter its separate space, then carry its branching idea into scope.                                                                                | No invented universal hunger calendar.                                                 |
| [ST-004](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-004/source-selected-v001.png>) | 0:40.750–1:00.792 | 2D / place                  | Large intact landscape; place/date then question qualifiers occupy outside space. One transition into the composite.                                                                             | Do not infer exact Walsham geography from this landscape.                              |
| [ST-005](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-005/source-selected-v001.png>) | 1:00.792–1:20.833 | 2D / composite + H01 option | Keep the full people-and-containers scene; three evidence sources assemble into an incomplete composite alongside it. H01 can supply a bounded human beat under its exact integration treatment. | No invented family biography or simulated walking from the still.                      |
| [ST-006](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-006/source-cleaned-v001.png>)  | 1:20.833–1:37.833 | 2D prepared / system        | Central store → grouped resource relationships → a system that exceeds grain alone. P1.                                                                                                          | No quantified allocation or balance/price animation.                                   |
| [ST-007](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-007/source-selected-v001.png>) | 1:37.833–1:52.833 | 2D prepared / condition     | Match into the store; possible loss appears as a separate condition; resolve to household and year. P1.                                                                                          | Keep grain level fixed; no measured spoilage implied.                                  |
| [ST-008](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-008/source-selected-v001.png>) | 1:52.833–2:23.625 | 2D prepared / comparison    | Stored-food bridge → common seasonal field → different margins → remove a universal deadline. P2.                                                                                                | 30.792 seconds requires multiple compositions; no reserve bars.                        |
| [ST-009](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-009/source-selected-v001.png>) | 2:23.625–2:32.083 | 2D prepared / obligation    | Gate remains the anchor while different obligation combinations replace one another. P1.                                                                                                         | Different holding packages, not every due collected from everyone.                     |
| [ST-010](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-010/source-selected-v001.png>) | 2:32.083–2:47.625 | 2D prepared / relation      | An explicit service-day relation connects to food, then the frame exposes the limits of that inference. P1.                                                                                      | No exact ration, calendar or fulfilled transaction.                                    |
| [ST-011](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-011/source-selected-v001.png>) | 2:47.625–3:00.875 | 2D / literary tableau       | Enter the distinct literary frame, reveal the provisions as groups, direct attention toward the coming crop. P4.                                                                                 | Literary/date status precedes the visual inference; KEEP source intact unless amended. |
| [ST-012](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-012/source-selected-v001.png>) | 3:00.875–3:17.833 | 2D prepared / literary link | Continue the literary frame; an abstract crop-to-market relation resolves, then return to the book motif. P4.                                                                                    | No Langland-to-Walsham eyewitness or route implication.                                |
| [ST-013](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-013/source-selected-v001.png>) | 3:17.833–3:31.750 | 2D prepared / paired case   | One common season; equal-scale houses; one named strain reveals more/less room to absorb it. P2.                                                                                                 | Shared neutral field; the painted scenery is not the controlled variable.              |
| [ST-014](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-014/source-selected-v001.png>) | 3:31.750–3:44.750 | 2D prepared / access        | Carry household anchors forward; available grain connects to both; one access corridor narrows and remains open. P1/P2.                                                                          | No travelling grain counts or guaranteed exclusion.                                    |
| [ST-015](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-015/source-selected-v001.png>) | 3:44.750–4:03.875 | 2D prepared / substitution  | Cut to Hinderclay; exchange one broad editable grain-category label for another, then show the inference boundary. P1.                                                                           | No invented species, serving size or local Walsham meal.                               |
| [ST-016](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-016/source-selected-v001.png>) | 4:03.875–4:19.542 | 2D prepared / alternatives  | Show isolated and equally protected extremes briefly, then recompose a connected but constrained system. P1.                                                                                     | Three arrangements, not three caption swaps on a static network.                       |
| [ST-017](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-017/source-selected-v001.png>) | 4:19.542–4:41.667 | 2D prepared / inventory     | Date and exceptional wealth first; four supported category groups assemble in an editorial record structure. P3.                                                                                 | Drawn animals/tools are not exact recovered inventory entries.                         |
| [ST-018](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-018/source-selected-v001.png>) | 4:41.667–5:15.792 | 2D prepared / limit         | Categories → boundary of exact knowledge → incomplete relationship to the composite. Three compositions. P3.                                                                                     | No item/quantity/value transcription; 34.125-second shot must develop.                 |
| [ST-019](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-019/source-cleaned-v001.png>)  | 5:15.792–5:28.250 | 2D / recorded vs unseen     | Retain the full framed art. Outside it, separate what records preserve from under-recorded daily activity. P3.                                                                                   | Do not enlarge pseudo-writing or turn uncertain background people into facts.          |
| [ST-020](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-020/source-selected-v001.png>) | 5:28.250–5:54.750 | 2D / composite + H02 option | Human-scale beat using full source or scoped H02; step to unknown eating order, then widen the incomplete composite boundary. P6.                                                                | No person-by-person serving, fixed family or synthetic idle movement.                  |
| [ST-021](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-021/source-selected-v001.png>) | 5:54.750–6:19.833 | 2D prepared / crisis        | 1315–17 label → distinct stresses fracture links → wider system-wide view → hold. P5.                                                                                                            | Abstract explanation, not a measured causal sequence or local depletion.               |
| [ST-022](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-022/source-selected-v001.png>) | 6:19.833–6:38.875 | 2D prepared / reset         | Hard reset to Walsham 1327–29; retain neutral unresolved conditions and the date separation. P5.                                                                                                 | No healing morph, harvest success or claim of normality.                               |
| [ST-023](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-023/source-selected-v001.png>) | 6:38.875–6:56.750 | 2D prepared / answer        | A universal calendar rule separates from variable household paths; reclaim the episode question. P2.                                                                                             | No animation of identical seasonal hunger deadlines.                                   |
| [ST-024](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-024/source-selected-v001.png>) | 6:56.750–7:02.917 | 2D prepared / short resolve | Continue the unequal-margin motif from ST-023 with one clear qualitative change. P2.                                                                                                             | Only 6.167 seconds; remove literal ration counts and avoid a new mini-explanation.     |
| [ST-025](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-025/source-selected-v001.png>) | 7:02.917–7:15.625 | 2D prepared / synthesis     | Return to the familiar household anchor; group resources, access and claims around it as spoken. P1.                                                                                             | Avoid another nine-way simultaneous reveal; no quantified coin flow.                   |
| [ST-026](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-026/source-selected-v001.png>) | 7:15.625–7:28.000 | 2D prepared / return        | Reuse ST-013 house anchors and baseline, now enriched by the preceding resource/access explanation. P2.                                                                                          | A conceptual return, not another pair of different weather conditions.                 |
| [ST-027](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-027/source-selected-v001.png>) | 7:28.000–7:46.000 | 2D prepared / resolve       | Calendar recedes; resources and claims remain; isolate the land → rent/service relationship. P1.                                                                                                 | No numerical balance or universal deadline implied.                                    |
| [ST-028](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/stills/ST-028/source-selected-v001.png>) | 7:46.000–7:50.708 | 2D / closing hold           | The intact threshold completes the outgoing path; hold the next-episode line in its separate region. P6.                                                                                         | 4.708 seconds; do not introduce an eviction/punishment event.                          |

## 8. Asset preparation recipes

The selected source path and verified SHA-256 for every shot are in the [source and timing ledger](./s01e01-motion-source-ledger.json). These are reference-led preparation specifications; **no new image generation is required for the first graphic proof**. Work from unchanged originals, save derivatives separately, retain a full-source comparison, and implement labels/lines as editable elements. The current request authorizes this study and design, not an unlisted change to the episode's selected-shot treatments.

### P1 — system kit: ST-006/009/014/016/025/027

**Source instruction:** extract only the named house, store, tool, livestock or threshold needed by the narrated beat. Preserve the source contour and attached fixed print texture. Identify and exclude baked arrows, repeated money/food marks and artificial crop boundaries. Keep animals and people as intact groups; do not invent articulation.

**Assembly prompt:** “Compose a Layered Chronicle explanatory scene on fixed warm paper. One large household/store anchor, no more than four supporting relationships visible with equal-width editable connectors. Leave clean separation around each silhouette and clear space for short compositor labels. Diagram distance, connector width and icon size carry no quantitative claim. No embedded text, coin inscriptions, decorative document writing or new background architecture.”

**Motion:** sequential connection, narrowing, regrouping or resolution. **Fallback:** complete source plus separate abstract diagram. **Acceptance:** no duplicate baked connector underneath a new moving one; no food-unit traffic implying quantities; final relation readable at phone size.

### P2 — paired household kit: ST-008/013/024/026

**Source instruction:** preserve the two relevant house silhouettes; use a shared neutral field and common horizon. Do not use differing vegetation, worker count, gate position or weather as evidence for the stated comparison. Remove literal ration/count motifs when rebuilding ST-024.

**Assembly prompt:** “Two equal-scale symbolic households on a common warm-paper ground, aligned to the same baseline with open space between them. Shared season reference above, separate unmeasured condition labels below. Preserve the selected drawing language. No statistical axes, calibrated bars, counted grain, rich/poor facial caricature or different weather. Labels remain compositor text.”

**Motion:** synchronized introduction followed by a deliberately different response to a named strain; preserve both endpoints. **Fallback:** neutral text identifiers with common baseline beside the complete source. **Acceptance:** viewer identifies the compared variable without inventing a numerical stock ratio.

### P3 — evidence limits: ST-017/018/019

**Source instruction:** category names are safer than asserting every illustrated item belongs to Lene's inventory. Keep the date/wealth/source-access qualifiers. Do not enlarge pseudo-document marks.

**Assembly prompt:** “An editorial evidence-boundary composition: four broad supported categories—stores, animals, tools, household goods—on one side, visibly unanswered exact-detail fields on the other. Warm paper, charcoal lines, quiet space. No fabricated manuscript facsimile, inventory transcription, item count, valuation or quotation. All wording editable.”

**Motion:** category grouping → withdraw an overbroad inference → expose missing detail. Split the 34-second ST-018 into these three staged compositions. **Fallback:** two clear text groups with a purposeful hold. **Acceptance:** no implication that the research recovered a typical pantry or a complete household biography.

### P4 — literature: ST-011/012

**Source instruction:** retain the book/tableau and its literary identity. ST-012's painted settlement is not a verified local route; replace that relation with a simple abstract crop-to-market link if needed.

**Assembly prompt:** “A literary Layered Chronicle tableau with open book, grouped provisions and a distant coming-crop motif. Keep paper/illustration visibly literary; no authentic-evidence border or invented readable medieval verse. A compositor-added connector can link coming crop and market without drawing local geography.”

**Motion:** reveal provision groups, connect the coming crop to market, then briefly return to the book to close the comparison. **Fallback:** intact tableau and separate timed literary qualification. **Acceptance:** the literary/date label arrives before any animated inference.

### P5 — crisis: ST-021/022

**Source instruction:** separate nodes from existing paths; author intact and broken editable path states. Keep date changes independent from animation progress.

**Assembly prompt:** “An abstract connected resource/access system in the existing charcoal, ochre and restrained red language, with stable nodes and separable complete connectors. Separate prepared broken-path states; no distressed people, literal depleted stores, fake weather or new geography. Reserve a visible date region. A neutral unresolved comparison is a separate scene.”

**Motion:** dated multi-link fracture, wider view, explicit reset. **Fallback:** distinct dated panels. **Acceptance:** no apparent healing into Walsham's later years; no exact causal weight inferred from node size.

### P6 — people and places: ST-003/004/005/020/028

**Source instruction:** keep people, load, contact shadows and supporting ground together. A still of a carrier cannot supply unseen walking poses. Reuse the accepted H01/H02 only at their exact approved integration stage; use the full original source for the graphic fallback.

**Assembly prompt:** “Use the unchanged selected illustration as a complete human-scale composition, with qualifications in a separate region. For a separately authorized layered variant, isolate only a genuine foreground frame and supply its exposed background from a reviewed clean plate. Preserve body pose, garment contour, contact and original aspect ratio. No fabricated family identity, eating order or new physical action.”

**Motion:** one meaningful environmental reveal or existing hero action, then a deliberate cut. **Fallback:** strong hold intercut with the adjacent explanation, preserving assigned source coverage. **Acceptance:** no sliding feet, detached shadows, arbitrary body warping or obscured selected content.

## 9. What Still Shift should support next

Reuse `resource_flow`, `access_pressure`, `comparison_build` and `crisis_fracture` as **primitives**, with changed semantics and authored cue times. Their demonstration assets and token/count behavior are not automatically suitable for S01E01. Use `chronicle_reveal` for selected place shots; do not use `pose_prop_change` to invent serving order or rations.

The most useful additions for this episode are:

1. **Narration-timed events:** explicit frame windows for anticipation, transformation and reading hold instead of stretching the same seven-second schedule over a long paragraph.
2. **Continuity between scenes:** stable object IDs, anchors and entry/exit states so a pair of houses can survive the move into an access graphic.
3. **Semantic checks:** date visible before crisis; narrowed access remains open; resource quantity unchanged when only access changes; reading labels remain attached to their object.
4. **Prepared-asset support:** reviewed masks and complete clean plates where required. Existing alpha assets and rectangular clips do not amount to automatic semantic segmentation of these raster boards.

Remotion should retain the episode/audio timeline; Still Shift can render compatible prepared motion scenes. Author editorial text in one place so it does not get baked into a clip and duplicated by the episode compositor. This is an implementation recommendation, not a new dependency or renderer migration.

## 10. Independent editorial check

A separate reviewer inspected all 28 stills in contact sheets, the complete revised narration and all existing treatment rows. Its review agreed that repeated source resets, long unchanged hierarchies, already-complete diagrams and recurring reveal/path/hold patterns remain the main risks. It recommended using the same household anchors on each return and elevating ST-017/018 into an evidence-boundary sequence. Those findings are incorporated above. This was an independent design review, not a video watch or new historical verification.

## 11. Build and review order

1. Prepare the 27-second ST-013/014 motion proof with unchanged narration and final-scale labels. The diagram-only planning sketch illustrates its event, not final artwork.
2. Internally watch the proof in sequence and at phone size. Fix the actual cause of confusion or boredom; do not count cues as success.
3. Build the resources/buffers sequence and the dated crisis/reset sequence using the same reusable pieces.
4. Extend the approved visual language to the remaining shot rows. Integrate existing opening/hero footage within its exact treatment scope; preserve original cuts.
5. Watch the complete 7:50 sequence for repetition, overloaded explanations and unsupported implied claims. Render timing checks accompany this review rather than replace it.

Any next production step should reconcile the exact changed shot treatments with `production.json`, including the full-source three-second rule and hero placement. Existing `HYBRID-TREATMENTS-v001` approval is real; stale `PROPOSED_NOT_APPLIED` fields in its historical proposal are not new blockers. This document neither revokes that approval nor extends it to unspecified new alterations.

### Acceptance questions

- Can a viewer describe what changed and why after each anchor sequence?
- Is the focal change obvious with labels hidden, while historical limitations remain clear with labels restored?
- Does a label merely repeat narration, or help locate a relationship that is visibly changing?
- Do neighboring scenes use different rhythms and make deliberate use of stillness?
- Do 28-shot boundaries remain exact, with narration unchanged and no speed manipulation?
- Are masks, contact shadows, paths and small-screen labels clean throughout motion, not only at endpoints?
- Does the complete film feel coherent? No promise of retention or freedom from boredom is made before playback review.

### Deliverable boundary

Completed here: a 28-still design study, exact source/timing ledger, detailed anchor sequences, reusable preparation recipes and a symbolic interactive motion sketch. No selected image, episode production record or existing render was modified. No media generation or paid service was used.

Verification: all 28 source hashes match the episode registry; shot ranges are contiguous from frame 0 through 11,296. The symbolic sketch's play/pause and scrub interaction were checked in Chromium, with no JavaScript errors; its 800 px and 360 px preview layouts were visually inspected. This verifies the planning aid, not episode motion quality.

### Primary local references

- [Current episode record](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/production.json>)
- [Corrected narration](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/generated/workflow-adoption-v3/narration-revision-v002.txt>)
- [Current hybrid plan](</Users/jjae/Documents/obsidian/ai-business/history-offstage/06 Episodes/S01E01 - Hungry Months/Hybrid Video Production Plan.md>)
- [Layered Chronicle style bible](</Users/jjae/Documents/obsidian/ai-business/history-offstage/02 Operations/Layered Chronicle Animation Style Bible.md>)
- [AI production profile](</Users/jjae/Documents/obsidian/ai-business/history-offstage/02 Operations/Layered Chronicle AI Production Profile.md>)
