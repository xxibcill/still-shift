# History Offstage — source assets for the next preset proof

**Version:** 0.1 · 2026-09-25

**Status:** Executed as a shared three-asset kit feeding six prepared scenes; [implementation](../docs/history-offstage-motion-implementation.md), [exact executed prompts](../assets/history-offstage-v2/prompts.md), and [provenance](../assets/history-offstage-v2/provenance.json). Creative review pending.

**Companion:** [Motion analysis and build plan](../docs/history-offstage-motion-plan.md)

## Purpose and defaults

**Execution note:** The original cards below remain the design brief. The implementation consolidates their common objects into one coherent transparent atlas, adds a continuous background, and derives an empty/filled bowl state atlas from that object kit. It does not generate six unrelated master images. The pose proof uses the allowed prop-state variant. Exact prompts, references, and output hashes are recorded with the assets; preparation time and provider billing were not separately captured.

Prepare six original, reusable illustrated scene packages that can prove the proposed motion behaviors. These are engineering/creative demonstrations, not episode evidence, approved reconstructions, or replacements for selected History Offstage images.

- 16:9, 1920×1080 delivery; seven seconds at 24 fps per proof.
- Master compositions use Layered Chronicle's hand-drawn contours, shallow staging, fixed halftones, warm bone, charcoal, muted field green, ochre, and restrained dark red. Crisis blue appears only in the crisis demonstration.
- Keep essential shapes inside 96 px horizontal and 72 px vertical safe areas, with 20–35% quiet space for editable demonstration labels.
- Target generator for later execution: Codex's built-in image generation. Generate one coherent master, then derive only the necessary components against that master; independent asset generations must not drift in design.
- No baked writing, dates, arrows, numerical quantities, source cards, logos, or invented historical specificity. Add explanatory paths and copy in the compositor.
- Asset preparation belongs to AI. Inspect alpha boundaries and clean plates before animation. A layer image with a paper-colored rectangle is not a cutout.
- Hold texture fixed to its illustrated object. Do not animate noise or imitate old parchment.
- Existing selected episode images inform this analysis only. Do not feed them to an editing/generation step under this pack.

## Index

| ID     | Purpose                                        | Class                                     | Required ingredients                                                         | Main risk                                           |
| ------ | ---------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| HO-P01 | Reveal a relation behind a foreground object   | LAYERED                                   | foreground, middle, continuous background                                    | Exposed background or partial object at source edge |
| HO-P02 | Show a resource reaching two destinations      | LAYERED + authored paths                  | source and destination tokens, travelling token, background, anchor geometry | Implying exact allocations                          |
| HO-P03 | Distinguish connection from access             | LOCAL object translation + authored paths | endpoints, token, restriction marker, path geometry                          | Token crossing the intended stop point              |
| HO-P04 | Compare a changing margin on a shared baseline | LAYERED + state changes                   | matching panels, variable layers, common guides                              | Accidental uncontrolled differences                 |
| HO-P05 | Prove a deliberate action using authored poses | LAYERED + alternate states                | two registered object states, optional contact state, background             | Unseen pose invention or pivot jumps                |
| HO-P06 | Show a connected system become fractured       | LAYERED + authored paths                  | nodes, separate panels, intact/broken paths, fixed context region            | Unclear temporal/historical interpretation          |

## Shared source-image prompt

Use this prefix with the card's master composition prompt:

```text
Create an original 16:9 illustrated keyframe for a Layered Chronicle animation test. Use expressive hand-drawn 2D forms, strong readable silhouettes, variable charcoal contours, flat controlled color, sparse halftone shadows, and subtle fixed screen-print grain. Use warm bone, charcoal, muted field green, grain ochre, and restrained dark red. Arrange shallow foreground, middle, and background space with clear separable silhouettes. The composition should read as an art-directed story illustration at small size. Keep forms consistent and readable, with intentional negative space. No writing, dates, numbers, arrows, watermark, photo realism, glossy 3D, fantasy details, fake manuscript appearance, parchment distress, or decorative particles. Keep all critical object edges visible and allow generous breathing room around them.
```

Provider controls should use the tool's supported settings at execution time. Do not claim that a seed reproduces an image when the generator does not expose that control. Record the exact prompt, references, outputs, and asset hashes for each attempt.

## HO-P01 — Foreground to relationship

**Traceability:** Chronicle Frame and shallow parallax in the style bible; S01E01's scene-package reveal structure; visual overlap observed in ST-005.

**Intent:** Uncover a resource/threshold relationship rather than drift around an already complete view.

**Duration/class:** 7 s; LAYERED.

### Master composition prompt

```text
Compose a quiet illustrated scene with a broad, plain storage vessel in the lower-left foreground, a small anonymous human-scale threshold shape in the central middle ground, and a simplified distant field band. Use a restrained visual relationship between the storage vessel and the threshold. Leave open warm-bone space above and to the right. Show the entire vessel, including its bottom and rim; keep its silhouette separate from the central threshold. The distant field and ground plane must continue behind both foreground and middle-ground forms, with simple recoverable value groups. Avoid specific architecture, faces, costume claims, extra figures, text, or narrative distress. Preserve at least 8% breathing room around the movable foreground object.
```

**Preparation:** Derive a foreground vessel cutout, middle-ground threshold layer, and clean continuous background from the coherent master. Keep ground/contact shadow on the appropriate layer. Inspect the filled region before movement; the clean plate must cover the entire swept area plus filtering margin.

**Motion:** Establish 1.2 s; move the foreground 2% of frame width and the middle layer 0.5% over about 0.9 s, revealing the target; hold. At 3.8 s reveal one supplied relationship marker. Use the exact bounds of prepared pixels, with zero anatomy deformation.

**Checks/fallback:** No duplicated vessel or rectangular matte; no exposed holes; foreground remains grounded. If the clean plate fails, use a prepared two-panel reveal with the full source composition fitted inside its panel. Count the failed layer preparation in the results.

## HO-P02 — One resource, two uses

**Traceability:** S01E01 storyboard S04-01-B and S06 networks; Symbol Token and Causal Path components.

**Intent:** Make a branching relationship readable without suggesting measured shares.

**Duration/class:** 7 s; LAYERED with authored paths.

### Master composition prompt

```text
Create a graphic story composition around one large plain grain-container symbol slightly left of center. Place two smaller destination silhouettes at upper-right and lower-right: a plain bowl and a small seed pouch. Use the same irregular charcoal contour and ochre/field-green color family across all three objects. Give each silhouette generous blank space and keep the composition asymmetrical. Reserve two uninterrupted curved corridors between the central resource and the destinations, but do not draw arrows or connecting paths. Use a uniform warm-bone base with subtle print texture, not rectangular cards, a dashboard, or a pie chart. Do not depict amounts, numbered grains, scales, inscriptions, or human suffering.
```

**Preparation:** Separate source, destinations, and a reusable abstract travelling token as transparent objects; retain a clean base. Author two vector paths from measured anchors. Add editable labels identifying this as a schematic demonstration. Token size and path width are graphic choices, not allocation measurements.

**Motion:** First path draws in 10–18 frames; token follows and stops at its destination. Second branch activates later; the first branch remains stable. Animate one transfer at a time.

**Checks/fallback:** Endpoints touch meaningful anchors; no token teleport, duplicate baked path, or unintended quantity claim. If token extraction fails, show the branch drawing and destination appearance using the prepared graphic layers, and disclose that the transfer component was omitted.

## HO-P03 — A connection that cannot be completed

**Traceability:** S01E02 S01-01-A token stopping short; Causal Path states; S01E01 available/access distinction.

**Intent:** Show access becoming restricted while availability remains visible.

**Duration/class:** 7 s; LOCAL translation with authored paths.

### Master composition prompt

```text
Create an original illustrated system composition on a warm-bone field. Put a resource-container silhouette on the left and an abstract open destination frame on the right. Leave a broad clean corridor between them with a narrow clear point slightly right of center for a compositor-added restriction. Provide an isolated round travelling token in a separate lower margin of the composition for later extraction. Use expressive charcoal contours, sparse halftones, ochre resource color and muted green destination color. The two endpoints should feel related but distinct. Do not draw a path, gate mechanism, arrow, measurement, written label, person, confrontation, or outcome.
```

**Preparation:** Extract the endpoints and token; supply a clean base. Author the route, exact stop point, and open/restricted path states. Use a simple drawn restriction mark as an editable graphic, not an invented historical gate.

**Motion:** Connect first; activate the restriction at 3 s; send the token toward it and stop before the gap. Leave the destination visible and unfilled. No alternate route unless explicitly supplied by the shot plan.

**Checks/fallback:** A stopped token must never appear beyond the barrier in an intermediate frame. If a state is missing, reject the prepared scene with its missing asset; do not substitute a successful delivery.

## HO-P04 — Same baseline, unequal margin

**Traceability:** S01E01 S05-02-A/B and Split Comparison grammar; shared landscape composition observed in ST-013.

**Intent:** Isolate one changing variable while the common condition stays legible.

**Duration/class:** 7 s; LAYERED and state changes.

### Master composition prompt

```text
Create one wide, restrained illustrated field-band composition with a low distant horizon, simplified hedgerow-like silhouettes, and a large warm-bone upper region. Place one neutral abstract household marker below the horizon, isolated with empty space around it. Use shallow value groups, charcoal contours, field green and ochre, and controlled halftone. This master will be reused identically for both sides of a comparison, so keep the base simple and avoid people, extra buildings, seasonal weather cues, harvested-versus-unharvested differences, quantities, writing, and decorative details. Keep every meaningful object fully within the composition.
```

**Preparation:** Reuse the same master for both panels, rather than generate two subtly different landscapes. Separate the marker and prepare editable qualitative reserve bands and common baseline. Supply exactly which variable differs, and label the demo as schematic.

**Motion:** Reorganize a common scene into aligned panels over 16–28 frames. Change only the reserve layer at 3.3–4.2 s; keep shared background, horizon, and panel scale fixed. Preserve both final states simultaneously.

**Checks/fallback:** Same baseline before and after; no hidden crop differences; no fabricated time or quantity tick marks. If panel fit cannot preserve the subject, use smaller complete panels with deliberate margins.

## HO-P05 — Deliberate prop placement

**Traceability:** Stepped pose/object substitution vocabulary and S01E02 G02 deterministic fallback.

**Intent:** Prove an actual state change using authored drawings, without morphing a single pose.

**Duration/class:** 7 s; LAYERED alternate states.

### Master composition prompt

```text
Compose a close illustrated prop demonstration: a plain abstract token beside an unmarked receiving frame on a simple horizontal surface. Keep both objects clearly separated with charcoal contours, flat ochre and field-green shapes, and sparse halftone. Leave generous negative space for editable explanatory copy. The token's silhouette should be distinctive but should not imply an exact historic coin, denomination, legal instrument, or ritual. Use a fixed slightly elevated viewpoint and clear contact geometry. Do not show hands, characters, words, numerals, seals, decorative symbols, or a photorealistic surface.
```

**Preparation:** Derive registered state A (token beside frame), contact state, and state B (same token resting inside) against the master. Prefer one extracted token on a clean background where translation suffices. For a later character variant, require genuinely authored pose A/B with matching identity and pivots; never warp the one source drawing into a new pose.

**Motion:** Hold A; move the token on a short bounded path, with stepped contact/state change on the event frame; hold B. The motion should visibly complete placement rather than fade the entire picture. Character variants use the same event mechanism but require separate asset qualification.

**Checks/fallback:** Stable pivot and scale; no doubled token; exact final contact. If only one state exists, return a missing-state error instead of presenting a static clip as this preset.

## HO-P06 — A fractured system

**Traceability:** Crisis State component, S01E01 sequence 9, and intact/broken network geometry observed in ST-021.

**Intent:** Make a defined connection failure legible within a clearly labelled contrast.

**Duration/class:** 7 s; LAYERED with authored path states.

### Master composition prompt

```text
Create an illustrated network kit composition with one resource-container silhouette on the left and three distinct abstract destination nodes across the right half, arranged on a shallow rising arc. Leave generous blank corridors for later connecting paths and a quiet top band for an editable context label. Use confident hand-drawn charcoal contours, ochre, field green, and a restrained crisis-blue accent on a separate optional panel shape. Keep objects isolated and fully visible. Do not draw cracks, connections, arrows, dates, words, quantities, suffering people, disasters, maps, or apparent documentary evidence. The system should feel like an art-directed visual metaphor, not a dashboard.
```

**Preparation:** Extract nodes and optional panels; create clean base. Author intact and broken vector paths with explicit break points and affected node IDs. Add separate editable context/date/source layers. Use “SYSTEM CHANGE · SCHEMATIC DEMO” for the proof; real dates/claims require the actual episode plan.

**Motion:** Hold context; break one supplied connection over 6–16 frames; break the next on a later beat, with at most 1–2% panel displacement. Allow a short 4–6 px registration pulse on affected illustration only; keep type and evidence steady.

**Checks/fallback:** Broken pieces preserve direction and endpoints; no unintended connection to another node; no indefinite shaking. If separation reveals unfilled pixels, retain positions and use the explicit fractured vector state.

## Preparation handoff

Suggested package contents, included only when the preset needs them:

```text
HO-P01/
  master.png
  background.png
  layers/
  states/
  scene.json
  provenance.json
  preparation-notes.md
```

The implemented `illustrated-scene-1` format and six executable examples are in `benchmarks/fixtures/history-offstage-v2`. The directory sketch above is the original preparation proposal; execution shares three raster files across the six scene JSONs. Record normalized asset dimensions, alpha convention, pivots, anchors, reveal/stop positions, source hashes, prompt lineage, and any repair. Keep unneeded layer/state directories absent.

Before rendering, verify that the scene's actual available pixels cover every movement, text is separate, every event has an explanatory purpose, and its fallback is explicit. Use a second compatible scene internally to verify reuse after each preset's first proof. The user reviews the final six-clip reel, not every preparation candidate.
