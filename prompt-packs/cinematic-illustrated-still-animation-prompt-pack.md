# Cinematic illustrated scenes — source prompt pack

**Version:** 0.1

**Prepared:** 2026-09-25

**Status:** CI-09, CI-01, CI-02, and CI-03 have been executed. See the [courtyard kit](../assets/cinematic-illustrated/kit-b-courtyard/README.md), [threshold kit and exact prompts](../assets/cinematic-illustrated/kit-a-threshold/README.md), and [Threshold Push implementation](../docs/threshold-push-implementation.md). CI-02 and CI-03 reuse Kit A without new generation; five cards remain future briefs.

**Source:** Owner request for more cinematic templates, including parallax; [build plan](../docs/cinematic-template-plan.md); History Offstage's Layered Chronicle visual bible.

## 1. Purpose and assumptions

Prepare full-frame illustrated environments for nine camera templates. The camera discovers a subject or changes the viewer's relationship to a place. Keep the art's palette and drawn character consistent with History Offstage, using original schematic settings rather than selected episode sources.

The current study has no supplied narration or episode shot IDs. CI-01 through CI-09 trace directly to the named proposals in the build plan. They are visual demonstrations, not dated historical reconstructions. Anonymous figures are static authored poses; no new anatomy or action is synthesized during animation.

## 2. Production defaults

| Field            | Planned value                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Delivery         | 16:9, 1920×1080, 24 fps, seven seconds per shot                                                                          |
| Source target    | 2400×1350 or larger when supported; inspect actual returned dimensions                                                   |
| Generator        | Codex built-in image generation; use only controls exposed at execution                                                  |
| Reference policy | Original master from this pack, then reference-led derivatives from that master                                          |
| Reproducibility  | Record exact prompts, references, hashes, outputs, attempts, and provider settings; no reproducible seed is assumed      |
| Renderer         | Prepared-scene v2 camera/plane extension available for CI-09 and CI-01 through CI-03; five camera recipes remain planned |
| Safe framing     | Important subjects stay inside the inner 80% of the delivery frame throughout the move                                   |
| Hidden pixels    | Continuous prepared plates behind every moving occluder                                                                  |
| Texture          | Fixed to its illustrated surface; inspect charcoal lines and halftones after H.264 compression                           |
| On-screen copy   | None inside the proof shots; names, explanations, and controls remain in the review page                                 |

The source target provides overscan only when the actual crop and scale preserve it. Validate the full camera path against the actual painted pixels. Do not enlarge a crop beyond the source and describe the missing pixels as overscan.

### Shared generation constraints

Each master prompt starts with the channel's canonical style prefix. The scene instructions then describe specific framing, spatial structure, and light. Keep source masters sharp enough for clean layer extraction. Do not bake depth-of-field blur into the source; CI-06's optional softness is a compositor experiment with the sharp source preserved.

No generated text, dates, numbers, arrows, borders, labeled diagrams, logos, fantasy architecture, fake parchment, modern props, volumetric fog, random particles, distressed people, glossy 3D, or photorealistic imagery. Avoid thin lattices, transparent foreground objects, intertwined branches, reflected figures, and hair crossing busy backgrounds. These constraints are part of the prompt, not a claim that the provider has a separate negative-prompt parameter.

## 3. Index

| ID    | Role                                     | Duration | Treatment | Scene kit    | Main preparation risk                      | Safe fallback                                      |
| ----- | ---------------------------------------- | -------- | --------- | ------------ | ------------------------------------------ | -------------------------------------------------- |
| CI-01 | Enter an intimate space                  | 7 s      | LAYERED   | A: threshold | Exposed plate around doorway edges         | 2D push on complete master                         |
| CI-02 | Observe a place while passing            | 7 s      | LAYERED   | A: threshold | Room overscan and post occlusion           | 2D lateral crop within complete master             |
| CI-03 | Discover an obscured subject             | 7 s      | LAYERED   | A: threshold | Incomplete concealed subject or wall       | 2D reframing on a wider complete master            |
| CI-04 | Open the view to a landscape             | 7 s      | LAYERED   | C: hillside  | Missing terrain behind the near ridge      | 2D upward crop within complete master              |
| CI-05 | Reveal the subject's setting             | 7 s      | LAYERED   | C: hillside  | Insufficient final wide framing            | 2D pullback to the available master bounds         |
| CI-06 | Transfer attention between subjects      | 7 s      | LAYERED   | D: room      | Soft alpha fringes and unreadable linework | All-sharp 2D reframing between subjects            |
| CI-07 | Approach around foreground framing       | 7 s      | LAYERED   | B: courtyard | Camera implies unseen object geometry      | 2D curved crop with bounded scale                  |
| CI-08 | Change spatial pressure around a subject | 7 s      | LAYERED   | D: room      | Subject drift or implausible plane scaling | Identified CI-01-style push; not a dolly-zoom pass |
| CI-09 | Establish depth around a stable subject  | 7 s      | LAYERED   | B: courtyard | Hidden background and subject-anchor drift | Identified 2D crop; not a layered-parallax pass    |

All nine need creative source review and AI preparation/QA. None is automatically ready for publication or a frozen benchmark. No LOCAL deformation is required. Large orbit, walking, changing expressions, and revealing the back of a figure are UNSUITABLE for these source packages.

## 4. Prompt cards

### CI-01 — Threshold Push

**Intent:** Quiet anticipation as a storage vessel becomes the visual destination. **Kit A.** **Risk:** Medium. Trace: CI-01 in the build plan; the channel's layered scene and shallow parallax vocabulary.

#### Master still-image prompt

```text
Create a 16:9 keyframe in an original visual system called Layered Chronicle Animation. Use expressive hand-drawn 2D forms arranged in shallow layered depth, strong readable silhouettes, varied charcoal contour lines, controlled halftone shadows, subtle screen-print grain, selective construction marks, and a slight two-color registration offset. The composition should feel like premium graphic animation: energetic, clearly illustrated, intentionally art-directed, and readable within five seconds. Use a controlled palette of warm bone, near-black charcoal, muted field green, grain ochre, and restrained dark red unless a clearly identified crisis variant is requested. Build three separable depth bands suitable for parallax. Leave intentional negative space for manually added typography. Do not generate final writing.

Show a quiet storage chamber from just outside its doorway. Two broad near dark stone posts occupy the outer left and right, extending beyond the top and bottom without a visible lintel. An ochre ceramic vessel stands around 64 percent across, with its complete rim, base and compact shadow visible. A tall rectangular rear doorway lies clearly to the left of the vessel, opening into a quieter distant chamber. Keep the vessel, shadow, continuous floor and immediate walls coherent as one middle room. Use sparse irregular floor texture, a level viewpoint, restrained side light, warm bone plaster and field-green shadows. Keep the vessel clear of both near posts and safely inside the delivery view. No captions, arrows, cards, borders, people, glass, ornate objects, particles or photographic blur. Paint a complete still scene with generous margins.
```

**Preparation:** Generate kit A once, then prepare four derivatives. Make left/right near posts as separate tall portrait RGBA assets with high source density. Keep the vessel, contact shadow, floor and immediate walls together in a wide middle-room RGBA plate; remove the near posts and fill the concealed walls/floor, and make only the inside of the rear opening transparent. Make a complete opaque distant chamber to reveal through that opening. Preserve source aspect ratios and inspect the registered composite. The executed prompts, actual dimensions and provenance are in the [threshold kit](../assets/cinematic-illustrated/kit-a-threshold/README.md).

**Animation:** The [research revision](../docs/threshold-push-research.md) carries forward the owner's preference for stronger motion. Dramatic begins around 0.125 s and settles at 6.42 s. Fixed-focal forward travel 0.4 with depths 1.6/4/12 gives near growth 33.33%, middle room/vessel 11.11%, and distant chamber 3.45%. Standard and Restrained use smaller forward travel. The vessel's authored anchor holds while its room assembly grows. No local deformation or overlays.

**Checks:** Both doorposts expand faster than the room and distant plate. The vessel and floor share one transform. Protect the vessel rim/base; keep cut edges outside the view; validate coverage and source density after magnification every frame. Minimum density is 2/3 source pixel per output pixel. This is a flat room assembly with fixed internal perspective. **Fallback plan:** 2D push on the intact master, explicitly labelled; the current implementation rejects unsafe input rather than applying this fallback automatically.

### CI-02 — Lateral Track

**Intent:** Observe the storage chamber while passing sideways. **Kit A reuse.** **Risk:** Medium. The [research](../docs/lateral-track-research.md) revised the original courtyard proposal to keep the vessel, shadow, and floor grounded together.

**Source preparation:** Reuse the four original Kit A derivatives from CI-01 unchanged. Map the middle room wider than delivery and keep its four outer edges outside the frame throughout travel. Keep the rear opening transparent and place the continuous far chamber behind it. Stage the two near posts with enough genuine silhouette and overscan for the intended direction. No new image generation was required.

**Animation:** Fixed-direction lateral camera, fixed scale, no subject lock. Dramatic travels 492/183/64 px near/subject/far. Begin at 0.125 s and finish at 6.542 s, with smooth velocity ramps around a constant-speed middle occupying 76% of the move. The vessel and its floor shift together across the composition. Standard uses 60% and Restrained 40% of Dramatic travel. The alternate changes room scale/placement, post staging, depth spacing and direction.

**Checks:** Same-direction inverse-depth motion; subject remains readable; floor, vessel and contact shadow share one transform; room cut edges remain hidden; the rear opening exposes only prepared distant artwork. Inspect foreground occlusion separately from protected screen bounds. **Fallback:** Reject an invalid prepared scene and revise its staging before rendering. A small 2D crop would require a separately named treatment.

See [implementation and review](../docs/lateral-track-implementation.md) for geometry, limits and measured results.

### CI-03 — Foreground Reveal

**Intent:** Clear an obstruction and settle on the revealed vessel. **Kit A reuse.** **Risk:** Medium. [Research](../docs/foreground-reveal-research.md) established actual alpha concealment as the defining event.

**Source preparation:** Reuse the complete room/vessel/floor card, far chamber, and right post unchanged. Uniformly enlarge the near post to height 2100 px (2250 for the alternate), preserving aspect ratio and at least 2/3 source pixel per output pixel. Its outer right, top and bottom edges remain outside the frame. Trace a semantic vessel outline separately from the protected framing rectangle. Initial staging hides about 17.5–18.6% of that outline.

**Animation:** Hold the room anchor and move the foreground right through one shared horizontal camera. Dramatic moves the near post about 330 px, clears the target around 1 s, settles at 3.208 s, then holds through 7 s. Standard and Restrained use 80% and 60% of that travel and longer moves; all must fully clear the target. No local vessel deformation, fade reveal, or overlay.

**Checks:** Inspect actual decoded foreground alpha over the semantic vessel region at every frame. Initial coverage must be 10–35%; settled coverage must be at most 1%, with no reocclusion. Include every closer layer, real source crops, sampling resolution, and cut-edge coverage. Preserve vessel/shadow/floor registration. **Fallback:** Reject invalid staging and repair its source/placement before rendering; do not silently substitute another camera recipe.

No new generation was necessary. If a later compatible scene needs more wall width than its source provides, use the conditional wide-wall brief in the research document. See [implementation and review](../docs/foreground-reveal-implementation.md) for final metrics and limits.

### CI-04 — Rising Vista

**Intent:** The landscape opens beyond a near ridge. **Kit C.** **Risk:** Medium. Trace: CI-04 in the build plan; environment depth bands.

#### Master still-image prompt

```text
Create a 16:9 keyframe in an original visual system called Layered Chronicle Animation. Use expressive hand-drawn 2D forms arranged in shallow layered depth, strong readable silhouettes, varied charcoal contour lines, controlled halftone shadows, subtle screen-print grain, selective construction marks, and a slight two-color registration offset. The composition should feel like premium graphic animation: energetic, clearly illustrated, intentionally art-directed, and readable within five seconds. Use a controlled palette of warm bone, near-black charcoal, muted field green, grain ochre, and restrained dark red unless a clearly identified crisis variant is requested. Build three separable depth bands suitable for parallax. Leave intentional negative space for manually added typography. Do not generate final writing.

Show a broad quiet hillside with a solid near ridge across the lower quarter, a clearly separate middle-distance field and curved path, and a small low unadorned building near the far third of the landscape. Give the distant building a simple readable silhouette against a gently layered far slope and pale sky. Use calm diffuse daylight and a level horizon. The ridge edge is broad and irregular, without blades of grass or thin branches. The path continues naturally behind the near ridge; the rest of the landscape is spacious and coherent. Provide generous painted area above and below the intended view. No map symbols, labels, roads with markings, castle, dramatic sunset, volumetric haze, people, foreground trees, or decorative border. Feelings: open, quiet, distant. Maintain crisp illustrated boundaries across the scene.
```

**Preparation:** Generate kit C once with the entire wide landscape. Separate near ridge, middle terrain/path, and continuous distant landscape/sky. Extend the middle terrain through the full area concealed by the near ridge.

**Animation:** Establish 0–0.7 s; vertical camera change to 5.2 s; hold. Near layer moves downward by ≤4% H, middle ≤2% H, far ≤0.5% H. Keep the horizon level and the building within the protected view.

**Checks:** The move exposes actual path/terrain; no blank band appears at the bottom; mountains do not tilt. **Fallback:** 2D upward crop within the complete master.

### CI-05 — Detail to World

**Intent:** The wider setting gives a quiet subject context. **Kit C.** **Risk:** Low to medium. Trace: CI-05 in the build plan; wide context reveal.

#### Master still-image prompt

```text
Create a 16:9 keyframe in an original visual system called Layered Chronicle Animation. Use expressive hand-drawn 2D forms arranged in shallow layered depth, strong readable silhouettes, varied charcoal contour lines, controlled halftone shadows, subtle screen-print grain, selective construction marks, and a slight two-color registration offset. The composition should feel like premium graphic animation: energetic, clearly illustrated, intentionally art-directed, and readable within five seconds. Use a controlled palette of warm bone, near-black charcoal, muted field green, grain ochre, and restrained dark red unless a clearly identified crisis variant is requested. Build three separable depth bands suitable for parallax. Leave intentional negative space for manually added typography. Do not generate final writing.

Compose a complete wide view of a modest isolated building within broad cultivated fields. The building and the path approaching it form a compact focal grouping in the middle distance, with a substantial near ridge framing one lower corner and open field bands continuing toward a distant skyline. Keep the entire focal grouping near the center with ample setting on every side, so a slightly tighter central composition and the full wide composition are both strong. If a hillside reference is supplied, preserve its building, path, palette, diffuse daylight, and illustrated geometry. Show the whole final setting in this single source image. No labels, numbered details, map graphics, dramatic sky, tiny foreground branches, people, or invented monuments. Feelings: solitary, spacious, contemplative. All layers are sharply drawn.
```

**Preparation:** First test kit C with a tighter starting crop and its full ending view. Use this prompt only for an alternate master if the initial source cannot support both compositions. Use complete near/middle/far layers from that master; no generated image expansion is concealed as a renderer capability.

**Animation:** Establish 0–0.8 s; pull back from at most 1.20 to 1.00 framing scale through 5.5 s; hold. Near and far planes change at different camera-derived rates. The building stays the attention anchor. Reduce the starting crop if the actual source resolution cannot preserve its linework.

**Checks:** Added setting is visible and meaningful at 320×180; starting crop is detailed enough; ending frame never exceeds the actual plate. **Fallback:** Same bounded 2D pullback, identified as 2D.

### CI-06 — Focus Handoff

**Intent:** Attention moves from a near object to a quiet farther figure. **Kit D.** **Risk:** High because softness may damage the style. Trace: CI-06 in the build plan; a declared cinematic-study variation.

#### Master still-image prompt

```text
Create a 16:9 keyframe in an original visual system called Layered Chronicle Animation. Use expressive hand-drawn 2D forms arranged in shallow layered depth, strong readable silhouettes, varied charcoal contour lines, controlled halftone shadows, subtle screen-print grain, selective construction marks, and a slight two-color registration offset. The composition should feel like premium graphic animation: energetic, clearly illustrated, intentionally art-directed, and readable within five seconds. Use a controlled palette of warm bone, near-black charcoal, muted field green, grain ochre, and restrained dark red unless a clearly identified crisis variant is requested. Build three separable depth bands suitable for parallax. Leave intentional negative space for manually added typography. Do not generate final writing.

Inside a quiet modest room, place a substantial ochre bowl on a near table at the lower-left third. Across the room, an anonymous adult stands still at the right-center near a plain architectural opening. Keep the bowl, figure, and opening clearly separated in silhouette, with continuous wall and floor visible between them. The figure has a calm resting pose, simple unadorned clothing, grounded feet, and no direct stare toward the viewer. Diffuse side daylight creates a controlled value relationship between the near object and the far figure. Both near and far subjects must be sharply drawn and complete, with no photographic depth-of-field blur. Leave generous margin around each focal area. No writing, labels, arrows, comparative panels, period insignia, particles, decorative effects, or elaborate architecture. Feelings: attentive, uncertain, quiet.
```

**Preparation:** Generate kit D once. Separate bowl/table foreground, complete figure with contact shadow, middle room, and rear opening/clean wall. Preserve the sharp master. Render focus-softened layers into padded intermediate surfaces; inspect their alpha edges over the real background.

**Animation:** Near emphasis through 1.5 s; transfer through 3.5 s; tiny ≤1% W camera shift ends at 4.5 s; settle. Optional compositor blur ≤4 px at 1080p. No facial change, breathing, or cloth movement.

**Checks:** Viewer attention transfers; the figure never becomes a smeared silhouette; softened foreground edges do not create dark halos. **Fallback:** All-sharp 2D reframing between the two focal areas. A contrast/value-only variant must have its own treatment label.

### CI-07 — Curved Approach

**Intent:** A short approach negotiates foreground framing and settles. **Kit B.** **Risk:** Medium to high. Trace: CI-07 in the build plan; bounded camera path variation.

#### Master still-image prompt

```text
Create a 16:9 keyframe in an original visual system called Layered Chronicle Animation. Use expressive hand-drawn 2D forms arranged in shallow layered depth, strong readable silhouettes, varied charcoal contour lines, controlled halftone shadows, subtle screen-print grain, selective construction marks, and a slight two-color registration offset. The composition should feel like premium graphic animation: energetic, clearly illustrated, intentionally art-directed, and readable within five seconds. Use a controlled palette of warm bone, near-black charcoal, muted field green, grain ochre, and restrained dark red unless a clearly identified crisis variant is requested. Build three separable depth bands suitable for parallax. Leave intentional negative space for manually added typography. Do not generate final writing.

Compose a shallow courtyard seen past a broad near wall corner at the left edge. A stationary anonymous figure stands fully visible in the middle distance to the right of that wall, with a quiet passage and receding architecture behind. Arrange open floor and negative space between the wall and subject so a slightly shifted and tighter view would both remain composed. The near wall is a simple solid silhouette with one clearly presented surface; avoid a complex corner that would require unseen sides to become visible. Keep the figure's feet, hands, and compact shadow complete and separated from nearby shapes. Preserve the courtyard reference if supplied. Calm overcast light, consistent illustrated scale and contours. No walking, motion blur, text, arrows, ornamental frames, loose fabric, lattices, or photographic effects. Feelings: purposeful, restrained, anticipatory.
```

**Preparation:** Prefer kit B's existing layers with a new camera path. Produce an alternate master only if the original wall/figure overlap prevents the move. Paint behind the near wall and subject; keep architectural layers continuous.

**Animation:** Establish 0–0.5 s; quadratic screen path ends at 5.4 s; hold. Lateral excursion ≤2.5% W with ≤3% subject growth. Image planes remain front-facing; no yaw, orbit, or newly visible sides are implied.

**Checks:** The curved path has a clear destination; wall corners and body proportions stay rigid; frame edges remain covered throughout, including the curve's extremum. **Fallback:** A bounded 2D curved crop on the full master.

### CI-08 — Dolly-Zoom Tension

**Intent:** A brief change in spatial pressure around a stable subject. **Kit D.** **Risk:** High. Trace: CI-08 in the build plan; explicit camera-distance/focal compensation experiment.

#### Master still-image prompt

```text
Create a 16:9 keyframe in an original visual system called Layered Chronicle Animation. Use expressive hand-drawn 2D forms arranged in shallow layered depth, strong readable silhouettes, varied charcoal contour lines, controlled halftone shadows, subtle screen-print grain, selective construction marks, and a slight two-color registration offset. The composition should feel like premium graphic animation: energetic, clearly illustrated, intentionally art-directed, and readable within five seconds. Use a controlled palette of warm bone, near-black charcoal, muted field green, grain ochre, and restrained dark red unless a clearly identified crisis variant is requested. Build three separable depth bands suitable for parallax. Leave intentional negative space for manually added typography. Do not generate final writing.

Show a quiet anonymous adult standing still near the center of a modest room, full figure visible with a compact contact shadow. A broad near table corner and ochre bowl enter from the lower-left edge without covering the figure. Behind the figure, two simple successive architectural openings and a continuous rear wall provide clear distance landmarks. Keep the subject separated from those landmarks and comfortably inside the delivery frame. Use a level view, moderate drawn perspective, diffuse daylight, and restrained contrast. Preserve the room reference, clothing, light direction, and object designs if supplied. All surfaces and figures are sharply drawn; no distorted perspective, tunnel effect, optical blur, facial distress, text, diagram devices, decorative particles, or identifiable historical architecture. Feelings: contained, tense, still.
```

**Preparation:** Test kit D first with its figure as the camera anchor. An alternate composition from this prompt is required only if the rear landmarks do not provide readable scale change. Separate near foreground, subject, middle opening, and fully painted far wall; author their relative plane depths.

**Animation:** Hold 0–1 s; counter-animate camera distance and focal scale through 4.8 s; settle. Subject scale variation ≤1%, far landmark scale change 3–6%, near displacement ≤3% W. No subject morph or expression change.

**Checks:** Measured subject bounds stay fixed while background landmarks change size; the frame never resembles stretched flat artwork; coverage remains valid. **Fallback:** Clearly identified bounded push, and keep the dolly-zoom template marked failed/experimental.

### CI-09 — Layered Parallax

**Intent:** A stationary subject feels situated in a scene with clear near and far depth. **Kit B.** **Risk:** Medium. Trace: the owner's explicit request to add parallax; CI-09 in the build plan. This is the first camera prototype to build.

#### Master still-image prompt

```text
Create a 16:9 keyframe in an original visual system called Layered Chronicle Animation. Use expressive hand-drawn 2D forms arranged in shallow layered depth, strong readable silhouettes, varied charcoal contour lines, controlled halftone shadows, subtle screen-print grain, selective construction marks, and a slight two-color registration offset. The composition should feel like premium graphic animation: energetic, clearly illustrated, intentionally art-directed, and readable within five seconds. Use a controlled palette of warm bone, near-black charcoal, muted field green, grain ochre, and restrained dark red unless a clearly identified crisis variant is requested. Build three separable depth bands suitable for parallax. Leave intentional negative space for manually added typography. Do not generate final writing.

Compose a quiet courtyard with three unmistakably separated distances. A substantial dark masonry edge frames the left foreground; a stationary anonymous adult stands fully visible at the middle-right with grounded feet and a compact contact shadow; a low-contrast wall, simple passage, and distant roofline form the background. Leave clear open floor between foreground framing and the figure. Keep the figure's silhouette away from the masonry, and show the whole body and both resting hands in a calm authored pose. Preserve the courtyard master when supplied. Use diffuse daylight, coherent scale, strong charcoal contours, and fixed print texture. Paint generous room beyond the intended view on every side, with continuous architecture and ground. Keep the figure within the central safe region. No walking, diagram layout, labels, arrows, thin railings, glass, intricate foliage, floating cloth, particles, decorative fog, photographic blur, or ornate historical claims. Feelings: present, grounded, observant. Render a single sharp still.
```

**Preparation:** Reuse kit B where its plate coverage permits this composition. Isolate the near masonry, complete figure/contact-shadow group, and a continuous courtyard background; keep extra middle architecture on its own plane only when useful. Paint every area hidden by the figure and masonry. Reassemble and inspect the original view before moving the camera.

**Standard animation:** Establish 0–0.7 s; one shallow diagonal, subject-anchored camera sweep through 5.5 s; hold to 7 s. Near displacement 2–4% W, subject drift ≤0.5% W, far displacement 0.3–1% W; vertical travel ≤1% H. Keep focal scale constant and subject scale change ≤1%. Relative near/far direction follows the shared projection around the anchor. No random float, return loop, local deformation, or atmosphere overlay.

**Dramatic revision:** Following the owner's feedback and [primary-source research](../docs/parallax-motion-research.md), the existing courtyard kit also supports a larger lateral sweep. The delivered primary moves its near layer 300 px and far layer 50 px, with movement beginning around 0.13 s and ending around 6.42 s. Authoring limits for this strength are near travel 10–20% W, far ≤5% W, and vertical ≤2% H; asset coverage can impose tighter limits. Keep cropped foreground edges outside the picture using `edgeAttachments`. The current kit's floor shares the far plate; future stronger dolly/orbit source packages should provide a separate ground receiver or depth mesh to address ground sliding.

**Checks:** Three distinct depth responses are visible at normal speed and 320×180; foreground displacement is at least twice background displacement at standard strength; feet/shadow remain attached; no hidden-area holes or matte edges appear. **Fallback:** Restrained 2D crop of the intact master, explicitly labelled as a fallback rather than a layered-parallax success.

## 5. Preparation and naming

Proposed future output layout:

```text
assets/cinematic-illustrated/
  kit-a-threshold/
    master.png
    background.png
    foreground-left.png
    foreground-right.png
    subject.png
    provenance.json
  kit-b-courtyard/
  kit-c-hillside/
  kit-d-room/
benchmarks/fixtures/cinematic-illustrated/
  ci-01-threshold-push.json
  ci-02-lateral-track.json
  ci-03-foreground-reveal.json
  ci-04-rising-vista.json
  ci-05-detail-to-world.json
  ci-06-focus-handoff.json
  ci-07-curved-approach.json
  ci-08-dolly-zoom-tension.json
  ci-09-layered-parallax.json
```

This is a planned layout, not an existing contract or asset inventory. Each kit needs only its actual component files. Scene v2 serialization will be finalized during the shared camera implementation.

Generate four masters first, then derive referenced components. Reuse each master for its assigned templates before requesting an alternate master. Every derivative must preserve the camera, palette, linework, object geometry, and original coordinate registration. State the precise object removal/isolation request in the execution prompt and record the exact prompt used.

For each kit record: actual dimensions, source hashes, transparent-alpha checks, layer registration, continuous painted bounds, protected subject area, generation/repair attempts, billed cost if available, active preparation time, and template reuse count. Unknown measurements remain explicit.

## 6. QA and handoff

- Check every source at delivery size and 320×180 before animation. Identify the near, middle, and far planes visually.
- Reassemble derived layers at rest and compare them with the master; repair duplicate silhouettes, matte edges, contact shadows, or missing room/terrain.
- Inspect every planned camera endpoint and extremum before exporting. A clean source at frame zero does not prove later coverage.
- The prompt cards specify complete plates for every lateral/vertical reveal and a 2D fallback for every layered treatment.
- All nine have a distinct focal purpose, shot ID, source prompt, movement bounds, preparation steps, and failure criteria. No card asks a still generator to create temporal action.
- After technical QA, deliver one 63-second reel with clean images and optional individual replays. CI-06 and CI-08 retain explicit experimental status until their visual risks pass.
- These assets remain separate from the retired 43-image set and any future frozen Phase 0 corpus.
