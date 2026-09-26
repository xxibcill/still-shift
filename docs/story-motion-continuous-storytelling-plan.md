# Story Motion continuous storytelling plan

**Date:** 2026-09-26 · **Status:** ready for implementation (handoff to Codex) · **Scope:** Story Motion library (7 recipes), the ST-013/014 proof and the ST-006–008 resource passage.

## 0. Read this first

### Owner decision (2026-09-26)

The owner does not want stillness. **Every second of every shot must contain motion, and that motion must tell the story.** The motion should carry the argument itself, not just reveal it.

This decision **supersedes** these earlier recorded positions:

- `.impeccable.md` principle 5: "retain … readable holds".
- [Motion principles audit](motion-principles-audit.md): "Preserve real stillness".
- [Motion quality improvement plan](motion-quality-improvement-plan.md) and [its implementation](motion-quality-implementation.md): "final hold" and "settled tail" as quality targets.

"Hold" now means **held in meaning, not frozen in pixels**. Once the idea has landed, the picture keeps living: the camera carries it, currents keep flowing and subjects keep responding. The text stays readable.

These earlier decisions are **still binding**:

- Typography hierarchy: 56/52/64/72 px roles and the established titles. Do not enlarge text; the owner rejected the v011 enlargement.
- Palette and fonts.
- Illustration family and fixed (non-boiling) brush texture.
- Exact cuts, connector attachment, evidence qualifiers and no unsupported historical specificity.
- Deterministic, frame-addressed rendering and preview/export parity.

### Required reading for the implementer

1. `.impeccable.md`: design context.
2. This plan.
3. [story-motion-visual-implementation.md](story-motion-visual-implementation.md), [story-motion-brush-lines.md](story-motion-brush-lines.md) and [motion-quality-implementation.md](motion-quality-implementation.md).
4. [s01e01-resource-passage-beats.md](s01e01-resource-passage-beats.md): narration clauses and cue frames.
5. The code seams listed in §4.

### Baseline (v012, measured 2026-09-26)

Reconciled method: consecutive decoded frames are compared in greyscale at 480×270. A pixel counts as changed if its level differs by more than 6; a frame counts as moving if **at least 7 pixels** changed. Frame 0 has no predecessor and is excluded from the moving-share denominator. The original any-pixel rule did not reproduce the table from the available MP4s; this seven-pixel floor rejects isolated encode/scale noise in static frames.

| Clip                     |     Moving frames | Longest frozen run |     Peak change |
| ------------------------ | ----------------: | -----------------: | --------------: |
| Unequal Margins          |               27% |              3.4 s | 0.67% of pixels |
| Access Constraint        |               34% |              3.4 s |           0.80% |
| Relationship Build       |               42% |              3.0 s |            3.2% |
| Evidence Boundary        |               33% |              3.7 s |            2.7% |
| Dated System Break       |               17% |              3.0 s |        cut only |
| Category Swap            | **2%** (4 frames) |              4.4 s |       swap only |
| Motif Resolve            |               47% |              2.3 s |            4.6% |
| Resource passage, 62.8 s |           **18%** |          **6.6 s** |               — |

The seven 192-frame studies are the P0 calibration corpus in `benchmarks/results/story-motion-v012/`; their moving shares and numeric peak-change entries reproduce from those MP4s. The original Dated System Break frozen-run entry was 2.4 s. Replaying its v012 MP4 gives 71 consecutive frozen comparisons, or 2.96 s; the table now reports that reproducible result. The separate resource-passage row uses `benchmarks/results/story-motion-s01e01-resources-v003/s01e01-resource-passage.mp4` (SHA-256 `7d26c980f6381128b66d07e6fc20af464fbd18aca6a8efcabca28ee47d79415c`), which measures 18.13% and 158 frozen comparisons (6.58 s). Its earlier 15% / 7.1 s entry did not reproduce from that artifact. Passage calibration and rollout are deferred to P4.

### Root causes in code

- `compileStoryScene` (`packages/renderer-core/src/story-scene.ts`): every `enter()` is opacity 0→1 in place. Only paths have a real reveal.
- There is no scene camera. Every shot is a locked-off frame.
- Hero art is one flattened SVG per object (`scripts/story-motion/art.ts`). Houses and stores never move or react; the argument is carried by small bars and labels beside them.
- Titles, footers and column scaffolding are already on screen at frame 0.
- Text is drawn with a single `fillText` (`illustrated-renderer.ts`), so partial or word-by-word reveal is impossible.
- Passages cut between near-identical layouts: title top-left, subject left, hill bottom.

Specific defects to fix along the way:

- **Access Constraint:** "Access narrows" is visible from frame 0, and the pressure bands pass through it between frames 14 and 85.
- **Evidence Boundary:** the dividers and footer appear before any content.
- **Category Swap:** the swap is a single-frame change with no build-up before it and no response after it.
- **Dated System Break:** the fracture, which should be the high point, barely registers.

## 1. Motion model: four layers

Every shot is authored as four simultaneous layers. The layer names are used throughout this plan and in the code (`role` tags, §4.9).

| Layer        | Purpose                                      | Always on?                    | Examples                                                                                                                     |
| ------------ | -------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Carrier**  | Guarantees no frozen frame. Directs the eye. | Yes, frames 0 to last         | Scene camera push, pull or track through depth planes                                                                        |
| **Action**   | The argument: an event that changes meaning  | At least one every ≤ 2.0 s    | A line draws, a subject arrives, access pinches, a category swaps, a fracture opens                                          |
| **Response** | The consequence of an action                 | Follows actions               | Shadow lands, the house compresses under strain, a label attaches, a bracket snaps                                           |
| **Current**  | Ongoing meaning between actions              | While the relationship exists | Grain tokens flowing along an open route, strain marks drifting past, obligation flowing out, marching dashes on uncertainty |

### Rules

- **R1. No frozen frames.** The Carrier layer runs for the whole shot. Camera velocity is continuous and never zero except at the first and last frame of a passage.
- **R2. No decoration.** Every Current and Response must encode something the narration or labels state. There is no generic dust, sparkle or parallax for its own sake. If you cannot write the meaning in the beat sheet's "Meaning" column, delete the motion.
- **R3. Semantic density.** The longest gap between the ends of consecutive Action or Response events is **48 frames (2.0 s at 24 fps)**. During narration, map every spoken clause to an Action or Response (§6).
- **R4. One peak per shot.** Each shot has one strongest moment, prepared by a lead-in of 6–24 frames and followed by visible Response. Its motion energy is at least 2.5× the shot's median energy (§2).
- **R5. Readable text in motion.**
  - Titles, subheadings and bottom qualifiers are screen-locked (camera depth 0) once they have entered.
  - Labels attached to subjects move with them, but essential text may not exceed **20 px/s** of on-screen velocity at 1080p outside its own entrance or exit window.
  - Text never passes through another element's motion envelope.
- **R6. Restraint in character.** Overshoot is at most 2% (`out-back-soft`) and is used only for Response settles. There is no bounce chain, elastic or shake, except the single decaying jolt on the fracture in Dated System Break.
- **R7. Avoid 24 fps judder.** Camera pans on the depth-1 plane stay between **0.4 and 2.5 px/frame**. Zoom rate stays at or below **0.0009 per frame**. Never pan the high-contrast house outlines at 3–8 px/frame.
- **R8. Exact cuts stay exact.** Category swap (frame 72) and context reset (frame 120) remain single-frame discontinuities on the subject. The camera does not jump at those frames unless the beat sheet says so.
- **R9. Sparse additions.** Currents use at most 6 tokens per path, with a radius or half-length of 7 px or less. Do not add new text, except the few words named in a beat sheet.
- **R10. Pure functions of the frame.** All motion is computed from the frame number. There is no state accumulated while playing, so backward seeks stay pixel-identical.

## 2. Acceptance gates

The gates are implemented in §4.9 and enforced for this pass by `story:render --require-continuous-motion`. The export CLI exit codes stay unchanged.

| Gate               | Measurement                                                                    | Target      | Hard limit                 |
| ------------------ | ------------------------------------------------------------------------------ | ----------- | -------------------------- |
| G1 Frozen run      | Pixel measurement on the encoded MP4 (§4.9b)                                   | ≤ 3 frames  | ≤ 6 frames, except frame 0 |
| G2 Moving share    | Share of frames with measured motion                                           | 100%        | ≥ 97%                      |
| G3 Semantic gap    | Analyzer on the compiled scene: longest interval without an Action or Response | ≤ 36 frames | ≤ 48 frames                |
| G4 Peak contrast   | Pixel energy: peak ÷ median per shot                                           | ≥ 3×        | ≥ 2.5×                     |
| G5 Text velocity   | Analyzer: screen velocity of essential text outside its entrance or exit       | ≤ 12 px/s   | ≤ 20 px/s                  |
| G6 Camera coverage | Compile-time: every `cover` plane fills the viewport on every frame            | Pass        | Pass                       |
| G7 Invariants      | Existing tests plus the new ones in §8                                         | Pass        | Pass                       |

G1–G6 prove the picture moves. They do not prove the story reads. The owner's review at the checkpoint (§7, Phase 2) decides that.

## 3. Invariants that must not change

- Frame counts, fps and `episodeStartFrame`.
- ST-013/014 proof: 646 frames, split at 334/312, cut at master frame 5082.
- Resource passage: 1507 frames, with delivery slices of 408/360/739.
- Narration file and its SHA-256.
- The Category Swap frame (72) and the Dated System Break reset frame (120), including the reset's single-frame semantics.
- Connectors stay attached on every frame, including under camera motion.
- Labels stay opaque while their art is de-emphasised. Evidence qualifiers are fully visible by the end of each shot.
- Symbols must not imply quantities. Token counts are symbolic and constant per path; speed changes express access qualitatively only.
- **Backward compatibility:** a scene JSON without the new fields (`camera`, `choreography` additions, `flows`, text `reveal` and so on) must render **pixel-identical to v012**. This is the main regression gate for Phase 1.

## 4. Engine and contract work

All new schema fields are **optional**. Work in this order.

### 4.1 Easing

Files: `packages/scene-contract/src/motion-easing.ts` and `packages/renderer-core/src/motion-easing.ts`.

Add these easings:

- `in-out-sine`: `-(cos(πt) - 1) / 2`. Use for camera segments.
- `out-expo`: `t === 1 ? 1 : 1 - 2^(-10t)`. Use for attach and wipe.
- `out-back-soft`: back-out with overshoot constant `s = 0.6`. Unit-test that the peak overshoot is at most 2.0%.
- `in-quad`: use for anticipation.

Unit tests: each easing returns 0 at t=0 and 1 at t=1. The existing easings are unchanged. `out-back-soft` peaks between 1.0 and 1.02.

### 4.2 Scene camera and depth planes

Files: `packages/scene-contract/src/story.ts` (schema), a new `packages/renderer-core/src/story-camera.ts`, `illustrated-renderer.ts` (apply the transform) and `story-geometry.ts` (connectors).

**Schema** (optional `camera` on the story scene):

```ts
camera?: {
  keys: { frame: number; x: number; y: number; zoom: number; rotation?: number }[]; // ≥ 2 keys; first at 0, last at frameCount-1
  depth: Record<NodeId, number>;   // root-level nodes only; default 1; 0 = screen-locked
  cover?: NodeId[];                // nodes that must fill the viewport on every frame (paper, ground)
  jolts?: { frame: number; dx: number; dy: number; decayFrames: number }[]; // ≤ 1 per shot, dated_system_break only in this pass
}
```

`x`/`y` are the world point shown at screen centre (default 960/540), and `zoom` is at least 1.0. Keep camera rotation at 0 in this pass; it is reserved.

**Sampling** (`sampleStoryCamera(scene, frame)`):

- Use **monotone cubic Hermite (Fritsch–Carlson)** interpolation through the keys, applied separately to x, y and zoom. Velocity is then continuous at interior keys, so there is no stop and start. This is the core of R1.
- Ease only the first segment in and the last segment out, with a sine profile. For shots inside a passage, allow `easeIn: false` / `easeOut: false` so that velocity carries across the handoff (§6).
- Add the jolt as `dx, dy × (1 - out-cubic(p))` over `decayFrames`, applied only to depth > 0.

**Projection** of a root node with depth `d`:

```
zoom_d = 1 + (zoom - 1) * d
cx_d   = 960 + (cam.x - 960) * d
cy_d   = 540 + (cam.y - 540) * d
screen = translate(960, 540) · scale(zoom_d) · translate(-cx_d, -cy_d)
```

- Apply the transform in `paint()` for root nodes only; children inherit it.
- `d = 0` is the identity (screen-locked).

**Connectors:** `evaluateStoryPath` must project each anchor through its own root node's camera transform, then draw the connector in screen space (depth 0). Unit test: anchors on nodes at depths 0.6 and 1.0 stay on their anchor points (≤ 0.5 px error) across 50 sampled frames.

Unbound paths (for example Access `route-a` and `route-b`) take their own depth.

**Coverage validation (G6):** at compile time, for each `cover` node and every frame, the projected bounds must contain the 1920×1080 viewport. On failure, throw `Camera exposes uncovered edge on <id> at frame <n>`, following the cinematic painted-bounds check.

- The ground art must be overscanned. Change `ground()` in `scripts/story-motion/design.ts` to `x: -160`, `width: 2240`.
- Paper stays at depth 0: its fixed grain is a texture, not scenery.

**Velocity validation (R7):** a compile-time check reports any frame where depth-1 pan speed exceeds 2.5 px/frame or zoom rate exceeds 0.0009 per frame. Report it as an analyzer diagnostic (`camera-too-fast`), not a throw.

**Default depths:**

| Node                                 | Depth |
| ------------------------------------ | ----- |
| paper                                | 0     |
| title, subheading, qualifier         | 0     |
| ground                               | 0.7   |
| subjects and their child labels      | 1.0   |
| foreground accents (bands, brackets) | 1.0   |

`relation` paths are connectors, drawn in screen space from projected anchors.

### 4.3 Generic choreography for every preset

File: `packages/scene-contract/src/story.ts`. Today only relationship, evidence and motif have `moves` and `emphasis`.

- Spread `choreography` into **all seven** recipes. Keep `motif_resolve.moves` required.
- Extend `move.to` with optional `scaleX`, `scaleY` and `opacity`, alongside the existing `scale` and `rotation`. Reject `scale` combined with `scaleX`/`scaleY` in the same move.
- Add **multi-key moves** so that anticipation → action → settle can be one authored move: `keys?: { frame, x?, y?, scaleX?, scaleY?, rotation?, easing? }[]` as an alternative to `window` + `to`. Validate that frames are strictly increasing.
- Add `entrances` and `exits`:

```ts
entrances?: { node: NodeId; window: StoryWindow; verb: EntranceVerb; from?: "left"|"right"|"up"|"down"; distance?: number }[];
exits?:     { node: NodeId; window: StoryWindow; verb: ExitVerb;     to?:   "left"|"right"|"up"|"down"; distance?: number }[];
type EntranceVerb = "set-down" | "attach" | "rise" | "wipe" | "draw" | "stamp" | "assemble" | "fade";
type ExitVerb = "lift" | "wipe-out" | "retract" | "fade";
```

The compiler expands each verb into tracks, in `compileStoryScene`, after the recipe switch:

| Verb       | Applies to              | Expansion (defaults in brackets)                                                                                                                                                                                                                                                             |
| ---------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `set-down` | image or group          | The shadow sub-node (§4.7) scales X 0.6→1 and fades in over the first 60% of the window (`out-cubic`). The object drops y−`distance` [28 px] → y with `out-quint`, opacity 0→1 over the first 40%, then settles scaleY 0.985→1 over the last 25% (`out-back-soft`). Origin is bottom-centre. |
| `attach`   | text label              | Slides `distance` [24 px] from `from` [down] with `out-expo`. Opacity 0→1 over the first 50%.                                                                                                                                                                                                |
| `rise`     | text                    | y+16 → y with `out-cubic`, opacity 0→1.                                                                                                                                                                                                                                                      |
| `wipe`     | text or rect            | Text `reveal` 0→1 (§4.4) with `out-expo`, plus y+8 → y.                                                                                                                                                                                                                                      |
| `draw`     | path                    | `reveal` 0→1 with `out-cubic`. Replaces the recipe's implicit reveal when both are present; conflicting events raise the existing "Conflicting story events" error.                                                                                                                          |
| `stamp`    | any                     | scale 1.06→1 with `out-back-soft`, opacity 0→1 over the first 30%.                                                                                                                                                                                                                           |
| `assemble` | group of clipped strips | Each child listed in `parts` (see below) enters from its own direction over staggered sub-windows, then the whole group settles.                                                                                                                                                             |
| `fade`     | any                     | The current behaviour. Allowed only when the beat sheet names it.                                                                                                                                                                                                                            |

Exits mirror these: `lift` rises −20 px and fades; `wipe-out` sets text reveal 1→0 from the left; `retract` sets path reveal 1→0; `fade`.

**Reconcile with in-progress work.** When this plan was written, the working tree had uncommitted changes adding an opacity-only `exits: entrance[]` to `evidence_boundary` (`story.ts`, `story-scene.ts`, `story-validation.ts`, the evidence fixture and its tests). Commit or merge that work first. Then fold it into the generic `exits`: an exit without `verb` defaults to `fade`, so existing evidence fixtures stay valid and pixel-identical. Keep any validation it added (for example, that qualifiers are not exited).

**Recipe defaults change:** the recipe-internal `enter()` calls (`relationship_build` destinations, `evidence_boundary` entrances, `unequal_margins` labels, `access_constraint` sides) use the verb from the node's **role**: image → `set-down`, label text → `attach`, qualifier or title → `wipe`, rect or band → `stamp`. The implicit opacity fade becomes the fallback only for scenes that don't opt in (`motionGrammar: "v2"` on the scene; if the field is absent, keep v012 behaviour so the pixel-identical regression gate holds).

`assemble` schema: `parts: { node: NodeId; from: Direction; distance: number; offset: number }[]`, where `offset` is a stagger in frames inside the window.

### 4.4 Text reveal

File: `illustrated-renderer.ts`, text case of `drawShape`, plus `baseValue` in `story-scene.ts`, which already defaults `reveal` to 1.

- Text nodes honour `reveal` (0..1). Add an optional `revealMode: "wipe" | "words"` to the text node schema (default `wipe`).
- **`wipe`:** measure the full string with `ctx.measureText` (fonts are pinned, so this is deterministic). Clip to the rectangle `[alignOffset, -pad, width × reveal, fontSize × 1.4]` and add a 24 px soft edge: draw the last 24 px band with linearly decreasing alpha, as 6 slices of 4 px. Handle `align` left, center and right.
- **`words`:** split on spaces. Word _i_ has a local progress `clamp((reveal × (n + 2) - i) / 3)`. Each word draws with alpha = local progress and y-offset `(1 - out-cubic(local)) × 10 px`, positioned at the prefix width.
- Text `states` (Category Swap captions) must work together with `reveal`.
- Tests: `reveal = 1` is pixel-identical to the current output. Seek determinism holds. Center-aligned text wipes from its visual left edge.

### 4.5 Currents (flows along paths)

Files: the schema in `story.ts`, compiled data in `story-scene.ts`, drawing in `illustrated-renderer.ts` after `drawPath`.

```ts
flows?: {
  id: string;
  path: NodeId;
  direction: 1 | -1;
  count: number;                        // 1–6 (R9)
  shape: "dot" | "dash";
  size: number;                         // ≤ 7 (radius or half-length)
  color: HexColor;
  colorStates?: { frame: number; color: HexColor }[];  // step changes (Category Swap)
  window: StoryWindow;                  // fade in over the first 12 frames, out over the last 12 if end < frameCount
  speed: { frame: number; pxPerFrame: number; easing?: MotionEasing }[]; // keyed; 0.5–8
  pinch?: { at: number; strength: number; width: number };  // bunching near a constriction, 0..1 along the path
}[]
```

- **Deterministic positions (R10):** at compile time, precompute `offset[frame] = Σ speed(f)` for f < frame (a `Float64Array`, length `frameCount`) for each flow. Token _i_ is at arc-length `u = (offset[frame] + i × L / count) mod L`.
- If `pinch` is set, warp with a monotone map `s = W(u)`, where `W' = 1 - strength × bump((s - at) / width)`, so tokens bunch before the pinch and spread after it. Precompute an inverse lookup table with 512 samples.
- Draw tokens only where `reveal ≥ u/L` and outside any `gap` interval of the path. This makes currents stop at a fracture: the Dated System Break meaning.
- Tokens inherit the path's camera projection. For bound connectors, compute them on the evaluated screen-space path.
- Tests: frame N is identical when rendered after 0..N-1 or directly. The token count is constant. No tokens appear inside a gap.

### 4.6 Path pinch (constriction of a line)

File: the `brushStroke` / `strokeInterval` input in `illustrated-renderer.ts` and `packages/renderer-core/src/brush-path.ts`.

- Add a new story track property `pinch` (0..1) and path fields `pinchAt` (0.1–0.9) and `pinchWidth` (0.02–0.3). The stroke width multiplier is `1 - pinch × 0.65 × bump((s - pinchAt) / pinchWidth)` along the arc.
- Apply it to the brush body and wash. Do **not** re-seed the brush texture; the multiplier only scales half-widths (keeping the fixed deposited-texture principle).
- The recipe `access_constraint` gets optional `pinch: { path, window, amount }`.
- Tests: `pinch = 0` is pixel-identical. The minimum width stays above 0.3 × `lineWidth`.

### 4.7 Art: shadows, origins, overscan and strips

File: `scripts/story-motion/art.ts` (SVG sources) and `design.ts` (helpers).

- Split the ground-contact shadow out of `house`, `store` and `land` into separate assets: `house-shadow`, `store-shadow` and `land-shadow`. The first `<path … opacity=".13|.15">` in each SVG is the shadow; move it into its own SVG with the same viewBox and remove it from the object.
- `household()` and `art()` gain an option `{ shadow: true }` that emits a group `<id>` containing `<id>-shadow` (drawn first) and `<id>-art`, with origin `[0.5, 1]`.
- The `set-down` verb looks for a `<node>-shadow` child. Without one it skips the shadow step.
- `assemble` helper: `strips(id, asset, x, y, w, h, n = 3)` emits a group with _n_ clipped child groups, each containing the full image offset so that together they reconstruct it exactly. The unit test compares the assembled frame to a single-image render at ≤ 1 level per channel.
- Record the new assets in `assets/story-motion/README.md` provenance, re-prepare with `pnpm story:prepare`, and update the hashes.

### 4.8 Renderer version

- Bump `rendererVersion` to `story-canvas-0.14.0` (independent of the roadmap's v0.14 milestone).
- Fixtures without `motionGrammar: "v2"` keep `story-canvas-0.13.3` output and render pixel-identical to v012.

### 4.9 Quality analyzer and pixel-energy tool

**(a) Analyzer:** extend `packages/renderer-core/src/story-quality.ts` with these checks:

- `frozen-run`: computed from the compiled scene. For each frame, check whether any track value, camera value, flow offset or reveal changes compared with the previous frame, and report the longest run where nothing changes. This is fast and gives authoring feedback in the lab.
- `semantic-gap`: every entrance, exit, recipe event, move and flow-speed change is tagged `role: "action" | "response" | "carrier" | "current"`. Defaults: recipe events are `action`; entrances of labels and shadows and `out-back-soft` settles are `response`; the camera is `carrier`; flows are `current`. Authors may override with `role` on the window. Report the longest interval without an action or response end.
- `text-velocity`: the screen-space velocity of essential text (from `review.essentialText`) outside its own entrance or exit windows, including camera projection.
- `camera-too-fast`: see §4.2.
- A new policy preset `continuous` with the G1–G5 limits. `short-final-hold` is **disabled** under `continuous`; it contradicts the owner decision.

**(b) Pixel-energy tool:** new `scripts/story-motion/motion-energy.ts`, used by render scripts and tests.

- Decode the MP4 with `ffmpeg -i <file> -vf format=gray -f rawvideo -` at **full resolution**.
- A pixel has changed when `|Δ| > 4`. A frame is moving when at least 200 pixels changed.
- **Calibrate before trusting it:**
  - v012 holds must measure as frozen.
  - A synthetic scene panning at 0.5 px/frame must measure as moving on every frame. Commit this scene as a test fixture.
  - If x264 noise produces false motion on static frames, raise `|Δ|` to 6 and document the change.
- Outputs `motion-energy.json`, containing per-frame changed-pixel counts, G1, G2 and G4, plus an inline SVG sparkline for the gallery.
- `story:render` and `story:proof` write `motion-energy.json` beside each MP4. With `--require-continuous-motion` they exit non-zero if G1, G2 or G4 fail. The export CLI (`still-shift`) is unaffected.

### 4.10 Lab

In `apps/lab/src/story-controls.ts`:

- Show the analyzer's frozen-run, semantic-gap and text-velocity diagnostics with seek buttons; this already exists for other codes.
- Draw a thin timeline strip under the scrubber that colours frames by layer activity (carrier, action, response, current), taken from the compiled scene.
- No camera editing UI in this pass.

## 5. Beat sheets for the seven library studies

Common to all studies:

- 192 frames at 24 fps, `motionGrammar: "v2"`, camera present, flows as listed.
- Frame ranges are windows `[start, end)`. **Existing recipe windows are kept unless stated.**
- Existing node ids come from `scripts/story-motion/scenes.ts`. New ids are proposals; rename only if they collide.
- Every study ends with motion still in progress: at least the camera and one current run through frame 191.

### 5.1 Unequal Margins: "same season, different room"

**Story move:** make the _room_ visible. Each house sits on its own brush margin plate. The same strain presses both; one plate barely shrinks, and the other shrinks until its house overhangs and sags.

New nodes:

- `margin-a` and `margin-b`: brush paths under each house, `lineWidth` 34, `field` colour at opacity 0.55. Set the path `width` so that origin `[0.5, 0.5]` scales about the house centre.
- `strain-path`: an invisible horizontal path at y≈360 spanning −100 to 2020, used as the carrier for the strain current.

Camera: keys `0:(960,540,1.00)`, `110:(1010,560,1.04)`, `191:(1290,600,1.10)`. This settles toward the less-room house.

| Frames          | Layer             | Event                                                                                                                                                       | Meaning                                            |
| --------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 0–18            | action            | `reference` wipe                                                                                                                                            | Establish "the same season"                        |
| 8–30            | action            | `question` wipe (words)                                                                                                                                     | The question                                       |
| 4–42 / 28–76    | action + response | `house-a` / `house-b` set-down (with shadow), staggered so the second arrival does not dominate the shot                                                    | Two comparable households                          |
| 22–46           | action            | `margin-a`, `margin-b` draw, same length                                                                                                                    | Both start with the same visible margin            |
| 30–52           | action            | `pressure-a` / `pressure-b` draw (they currently exist from frame 0)                                                                                        | Pressure exists on both                            |
| 40–191          | current           | `strain` flow on `strain-path`: 6 dashes in crisis colour, speed 5 → 2 px/f after 110                                                                       | The same season's strain passes over both houses   |
| 48–104          | action (**peak**) | Existing `strain` window (pressures move in). Moves: `margin-a` scaleX 1→0.82; `margin-b` scaleX 1→0.36, `in-out-quint`                                     | The margins shrink by different amounts            |
| 77–85 → 85–116  | response          | `house-b` multi-key move: scaleY 1→0.92, rotation 0→−2.5° (`in-quad`), then settle to scaleY 0.985, rotation −0.8° (`out-back-soft`). Origin at the bottom. | The house with less room visibly takes the strain  |
| 86–106 / 98–120 | response          | `room` / `strained` attach (from down)                                                                                                                      | Name the difference                                |
| 80–88           | response          | `house-a` art emphasis opacity →0.70 (the label stays opaque)                                                                                               | Focus shifts during the strained household's press |
| 140–164         | action            | `qualifier` wipe                                                                                                                                            | Qualitative comparison, not a measurement          |
| 150–191         | carrier + current | Camera settles toward `house-b`; the strain current keeps passing; `pressure-b` repeats a 2 px micro-press every 24 frames (a multi-key move)               | The strain persists                                |

Semantic gaps: the longest is 120→164 = 44 frames; the final gap is 164→191 = 27 frames. Pass. The P2 review revision places the strongest measured motion at frame 81, inside the 48–104 strain beat, through the combined household response and margin shrink.

### 5.2 Access Constraint: "grain available, access narrows"

**Story move:** access is shown as _flow_. Grain tokens flow along both routes. When the bands close, route A physically pinches and its tokens queue and slow to a trickle, while route B keeps flowing.

Recipe changes:

- Add `sidesEnter` (default `reveal` for backward compatibility) and `pinch: { path: "route-a", window = narrow, amount: 0.65 }`.
- **Move `aperture-label`** below the lower band's full motion envelope. Add the envelope-versus-label check as an analyzer diagnostic: `label-in-motion-envelope`.

Camera: `0:(960,540,1.00)`, `64:(980,540,1.03)`, `124:(1040,520,1.10)` (centred on the pinch), `191:(1180,600,1.08)` (drifting toward the open route).

| Frames        | Layer             | Event                                                                                                                                           | Meaning                                        |
| ------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 0–18 / 8–28   | action            | `title` wipe; `consequence` wipe (red)                                                                                                          | Thesis                                         |
| 0–26          | action            | `store` set-down                                                                                                                                | Grain is available                             |
| 10–34 / 18–42 | response          | `house-a` / `house-b` set-down                                                                                                                  | The households that need access                |
| 12–40         | action            | Existing `reveal`: routes draw                                                                                                                  | Connections exist                              |
| 30–50         | response          | `source-label` attach                                                                                                                           | Grain available                                |
| 40–191        | current           | Flows `grain-a` on `route-a` and `grain-b` on `route-b`: 5 grain dots each, 5 px/f, direction store→house                                       | Access _is_ movement of grain to the household |
| 50–64         | response          | `open-label` attach                                                                                                                             | Both routes open at first                      |
| 56–70         | action            | `sidesEnter`: bands stamp in (not before)                                                                                                       | Pressure arrives                               |
| 64–114        | action (**peak**) | Existing `narrow` (bands close) and the route-a pinch 0→0.65 (same window, `in-out-quint`). Route-a speed 5→1.2 px/f; pinch warp strength 0→0.7 | Access narrows: grain queues and slows         |
| 104–128       | response          | `aperture-label` attach (from down), in its new position                                                                                        | Name it only once it happens                   |
| 120–150       | response          | `house-a` emphasis →0.8; the grain-a trickle continues                                                                                          | The consequence for the affected household     |
| 150–174       | response          | `open-label` stamp (scale 1.04→1)                                                                                                               | Contrast: the other route stays open           |
| 150–191       | carrier + current | Camera drifts toward route B; both currents continue at their different rates                                                                   | The difference persists                        |

### 5.3 Relationship Build: "food was only part of it"

**Story move:** start close on the grain as if food were the whole story. Pull back as each dependency appears, so the frame literally widens. The claims line then tugs on the store.

Camera: `0:(420,620,1.22)` (on the grain), `60:(620,580,1.12)`, `128:(960,540,1.00)`, `191:(1060,560,1.03)` (toward claims).

- Coverage: ground is `cover`. Check that the title stays depth 0.
- Check `camera-too-fast` for the 0→128 pull-back.

| Frames           | Layer             | Event                                                                                                 | Meaning                         |
| ---------------- | ----------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------- |
| 0–18             | action            | Title wipe                                                                                            | Thesis                          |
| 0–24             | action            | Grain set-down                                                                                        | Start with food                 |
| 12–34 / 24–42    | action / response | Existing land branch draws and land arrives. The destination now uses `set-down`                      | Land                            |
| 34–50            | response          | Land label attach, along the line direction (`from` = left)                                           |                                 |
| 44–60            | response          | One-shot flow `land-return` (1 bright token, `field` colour, land→grain, window 44–60)                | Grain depends on land           |
| 50–76 / 64–84    | action / response | Existing access branch; arrival uses `set-down`                                                       | Access                          |
| 76–92            | response          | Access label attach, then one return token 80–96                                                      |                                 |
| 60–191 / 96–191  | current           | Low-rate currents on the land and access lines toward the grain (2 dots each, 1.5 px/f)               | Continuing dependency           |
| 95–117 / 107–126 | action (**peak**) | Existing claims branch (red); arrival `stamp`                                                         | Claims                          |
| 118–134          | response          | Claims label attach                                                                                   |                                 |
| 124–146          | response          | Grain multi-key move: x+10 toward claims (`in-quad`, 124–134), back to x+3 (`out-back-soft`, 134–146) | Claims pull on the store        |
| 128–191          | current           | Red flow on the claims line, grain→claims, 2 dashes, 2 px/f                                           | Obligation takes from the store |
| 116–138          | response          | Existing `whole-system` emphasis                                                                      |                                 |
| 138–191          | carrier           | Slow push toward claims                                                                               |                                 |

### 5.4 Evidence Boundary: "evidence has edges"

**Story move:** the camera _reads_ the three columns left to right, as a reader would. Each column is built by motion that matches its evidence status: supported items are set down solidly, unknown details stay provisional with marching uncertainty, and the composite household is visibly assembled from parts.

Changes:

- The dividers become `draw` entrances. Remove them from frame 0.
- The footer qualifier becomes a `wipe` late in the shot.
- The composite house becomes `strips("composite-house", "house", …, 3)` with `assemble`.
- New `supported-underline` path, and a new `unknown-rule` path under items/amounts, used as a flow carrier.

Camera: `0:(640,560,1.10)` on Supported, `56:(700,560,1.10)`, `100:(1100,560,1.10)` on Unknown, `146:(1420,560,1.10)` on Composite, `191:(960,540,1.00)` (the whole picture). The last segment eases out.

| Frames        | Layer             | Event                                                                                                                                                               | Meaning                                          |
| ------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 0–18 / 8–28   | action            | Title wipe; subtitle wipe (words)                                                                                                                                   | Thesis                                           |
| 10–26         | action            | "Supported" heading wipe                                                                                                                                            |                                                  |
| 12–28 / 28–46 | action            | Existing supported entrances as `set-down` (resources, holdings)                                                                                                    | Solid, supported categories                      |
| 20–44         | response          | Divider 1 draws top→bottom                                                                                                                                          | The boundary appears as content arrives          |
| 44–60         | response          | `supported-underline` brush draw                                                                                                                                    | Supported, with a mark of confidence             |
| 52–70         | action            | Existing `unknown` window: "Exact details" wipe, then "Unknown" wipe (words)                                                                                        | The evidence limit                               |
| 64–82         | response          | Items and amounts `rise` to opacity 0.75 (not full)                                                                                                                 | Provisional                                      |
| 78–191        | current           | Flow `uncertain` on `unknown-rule`: 4 dashes, 1.2 px/f, marching                                                                                                    | Unresolved uncertainty                           |
| 72–96         | response          | Divider 2 draws                                                                                                                                                     |                                                  |
| 78–108        | action (**peak**) | Existing composite window: `assemble` of 3 strips (roof from up, body from left, base from right, stagger 0/6/12, `out-quint`), then settle `out-back-soft` 102–110 | A composite: assembled from parts, not recovered |
| 100–120       | response          | "Not a recovered pantry" wipe                                                                                                                                       |                                                  |
| 146–170       | action            | Footer qualifier wipe (camera pulling back)                                                                                                                         | Scope of the whole claim                         |
| 146–191       | carrier           | Pull-out to the full composition                                                                                                                                    | The whole boundary at once                       |

### 5.5 Dated System Break: "1315–17, then a different place in time"

**Story move:** a working system, visibly flowing, is put under tension and breaks. The currents stop at the gaps, the destinations drop, and the frame takes one decaying jolt. Then an exact cut to Walsham, where the picture keeps living.

Changes:

- The system lines get `draw` entrances. Destinations get `set-down`.
- Flows on both lines are gated by `gap` (§4.5).
- One camera jolt: `{frame: 74, dx: 12, dy: -6, decayFrames: 12}`.

Camera (the crisis group): `0:(960,540,1.00)`, `70:(1000,560,1.05)`, `76:(1000,560,1.07)`, `119:(980,550,1.05)`.

After the reset the camera must not jump except as the cut itself dictates. Author the Walsham portion with its own drift, `120:(1010,560,1.05)` → `191:(960,540,1.00)`, and document that frame 120 is a deliberate discontinuity. The analyzer's `frozen-run` treats a step as motion.

| Frames        | Layer              | Event                                                                                                                                                                     | Meaning                         |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 0–24          | action             | Date wipe with scale 1.03→1 (`in-out-sine`)                                                                                                                               | Dated context                   |
| 10–30         | action             | Subtitle wipe                                                                                                                                                             |                                 |
| 0–26          | action             | Store set-down                                                                                                                                                            | The system's source             |
| 20–50         | action             | `break-a` / `break-b` paths draw                                                                                                                                          | The system connects             |
| 36–58 / 44–66 | response           | Destinations set-down; labels attach                                                                                                                                      |                                 |
| 50–191        | current            | Flows on both lines (4 dots, 4 px/f, crisis-bone colour), gated by gap                                                                                                    | The system working              |
| 58–72         | response           | Pulse 0→0.8 on both lines (`in-quad`); flow speed 4→2                                                                                                                     | Tension builds                  |
| 72–84         | action (**peak**)  | Existing `break-a` (`in-cubic`) plus the jolt at 74; resources destination drops y+14, rotation +2° (`in-cubic` 74–84, settle `out-back-soft` 84–94)                      | Resource system breaks          |
| 90–104        | action             | Existing `break-b`; access icon tilt −2.5° with settle                                                                                                                    | Access breaks                   |
| 96–119        | current + response | Tokens pile against the gaps (warp `pinch` at `gapAt`, strength 0.8); destinations sink a further 3 px                                                                    | Aftermath: nothing gets through |
| 120           | action             | **Exact reset** (unchanged): the Walsham context appears                                                                                                                  | A different place in time       |
| 120–150       | response           | Walsham `house` settle: scaleY 0.985→1 (`out-back-soft`) with a shadow pulse                                                                                              | Arrival in a new context        |
| 128–150       | response           | Brush underline draws under "Unknown."                                                                                                                                    | The key finding                 |
| 140–166       | action             | Qualifier "Earlier crisis ≠ known local conditions." wipe. If validation requires it to be visible at the reset, keep it visible and instead animate an underline 140–166 | Guard against inference         |
| 150–191       | carrier            | Walsham drift                                                                                                                                                             |                                 |

### 5.6 Category Swap: "the category changes, still connected"

**Story move:** build up, register, swap, respond. The swap stays one exact frame, but it gets anticipation (the basket compresses, a registration bracket closes, the current slows) and a response (settle, bracket snap, the current resumes in the new category's colour).

New nodes: `bracket-tl`, `bracket-tr`, `bracket-bl` and `bracket-br`, short brush corner paths around the basket in ink.

Camera: `0:(900,560,1.00)`, `71:(820,580,1.06)` (on the basket), `191:(1040,580,1.03)` (toward the connection). Velocity is continuous through frame 72.

| Frames       | Layer             | Event                                                                                          | Meaning                        |
| ------------ | ----------------- | ---------------------------------------------------------------------------------------------- | ------------------------------ |
| 0–18 / 8–28  | action            | Title and subtitle wipes                                                                       |                                |
| 0–24 / 10–32 | action            | Basket and house set-down                                                                      |                                |
| 20–44        | action            | Connector draws                                                                                | Supply connection              |
| 40–72        | current           | Flow basket→house in `grain` colour, 5 px/f → 2 px/f from 56 to 71                             | Supply flowing                 |
| 48–62        | action            | Brackets draw (staggered by 3)                                                                 | The category is a registration |
| 60–71        | response          | Basket scaleY 1→0.97 (`in-quad`)                                                               | Anticipation                   |
| **72**       | action (**peak**) | **Exact swap** (unchanged): basket state and caption state; flow `colorStates` step to `field` | The category changes           |
| 72–84        | response          | Basket scaleY 0.97→1 (`out-back-soft`); brackets scale 1.04→1                                  | Registration lands             |
| 74–92        | response          | Caption underline draws                                                                        | The new category is named      |
| 84–191       | current           | Flow resumes at 4 px/f in `field` colour                                                       | Still connected                |
| 96–112       | response          | "Still connected" stamp                                                                        |                                |
| 110–134      | action            | Qualifier wipe                                                                                 | Symbolic, no species or amount |
| 134–191      | carrier           | Drift toward the connection                                                                    |                                |

### 5.7 Motif Resolve: "a household, and its connections"

**Story move:** start close on the household. The pull-back reveals its connections, and the resolve makes obligation _flow out_ of the land toward rent or service.

Camera: `0:(430,650,1.18)` (on the house), `100:(960,540,1.00)`, `191:(1260,640,1.06)` (toward land → rent).

| Frames       | Layer             | Event                                                                                                                 | Meaning                            |
| ------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 0–18 / 16–36 | action            | "A household," wipe, then "and its connections." wipe (words), reading as one sentence                                |                                    |
| 0–24         | action            | House set-down                                                                                                        |                                    |
| 18–100       | action            | Existing moves regroup the motifs. Each motif's first appearance becomes a `set-down` at the start of its move window | Resources, access and land gather  |
| 30–100       | response          | Connectors draw as each motif settles                                                                                 |                                    |
| 60–191       | current           | Flows toward the house on the resources and access connectors (2 dots, 1.5 px/f)                                      | Household sustained by connections |
| 108–128      | response          | Existing `land-focus` emphasis                                                                                        |                                    |
| 112–136      | action (**peak**) | Existing `resolve`: the outgoing arrow draws land→rent/service                                                        | Land is tied to obligation         |
| 124–142      | response          | Rent label attach                                                                                                     |                                    |
| 136–191      | current           | Red flow along the outgoing arrow, land→rent (3 dashes, 2.5 px/f)                                                     | Obligation flows out               |
| 140–162      | action            | Qualifier wipe                                                                                                        | Conceptual relationships           |
| 150–191      | carrier           | Push toward land → rent                                                                                               |                                    |

## 6. Narrated passages

### 6.1 General rules

- **Clause mapping:** for each narration clause in [s01e01-resource-passage-beats.md](s01e01-resource-passage-beats.md) and the ST-013/014 cue ledger in `scripts/story-motion/proof.ts`, create a row in a new `docs/s01e01-continuous-motion-cues.md`. Each row lists the clause, its word frames (from the existing alignment), the Action or Response it triggers, and the start frame. The action starts **0–6 frames before** the stressed word. G3 (≤ 48 frames between Action/Response ends) must pass across the whole passage.
- **Beat handoffs:** each beat is a separate scene joined in sequence. For every beat boundary between k and k+1:
  - **State match:** nodes shared by both beats (for example `grain` in beats 1–3 of the resource passage) must have the same screen position, scale and opacity on beat k's last frame and beat k+1's frame 0, within 0.5 px and 1% opacity. Add a unit test in `tests/unit/story-proof.test.ts` that evaluates both.
  - **Camera velocity match:** beat k's last segment has `easeOut: false`, beat k+1's first has `easeIn: false`, and the Hermite tangents are matched (pass the boundary tangent explicitly). Velocity must differ by less than 10%.
  - **Outgoing content:** labels and branches not used in beat k+1 exit during beat k's last 12–18 frames (`wipe-out`, `retract`). Incoming content enters during beat k+1's first 18–30 frames. The title changes by a `wipe-out` in the last 10 frames, then a `wipe` in the first 18.
  - **Layout travel:** where a shared subject changes position between beats (for example the grain moving left as the household arrives in beat 2), animate it with a move across the last 18 frames of beat k.
  - **Hard cuts:** keep them only where the recorded episode boundary requires one: the ST-013/014 cut at local frame 334 (master 5082), where the households' identical scale and position are already the match.
- **Energy shape per passage:** build → focus → development → **peak** → living conclusion. Put the passage's strongest pixel energy in the conclusion beat's argument (the strain in "The same season"), not in an entrance. Plot it in the gallery.

### 6.2 Resource passage (ST-006–008, 1507 frames, `scripts/story-motion/resource-passage.ts`)

| Beat                         | Role in energy curve         | Continuous motion design                                                                                                                                                                                                                                                                                  |
| ---------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. More than grain           | Build                        | The camera starts close on the grain (1.15) and pulls back as each resource branch draws. Each branch label attaches as the narration names it. A current runs along each branch toward the grain. The "Loss / spoilage varies" red branch draws last and its current flows _away_ from the grain.        |
| 2. No universal pantry       | Focus (close, quieter)       | Handoff: branches retract and the grain travels to its beat-2 position during beat 1's tail. The house sets down. A single current links grain → household. The camera pushes in (1.0→1.08) on "a particular" household. "A particular year" draws with the camera tracking along it.                     |
| 3. A bridge, not a guarantee | Development                  | The link visibly _bridges_: the connector arcs up (bend animated 0→final), with tokens crossing it. On "uneven and finite", the red branch draws and the bridge current thins: speed and count stay constant, but token size shrinks 7→4 px and the tokens space out. This is qualitative, not an amount. |
| 4. The same season           | **Peak** + living conclusion | Use the Unequal Margins v2 design (§5.1), time-stretched to its slice. The margin shrink is the strongest energy of the passage. The conclusion's qualification period (7.21 s) keeps the strain current, the `house-b` micro-press and a slow push, with no frozen frame.                                |

Delivery slices (408/360/739) and narration stay unchanged. Re-verify `resourceShots` slicing after render.

### 6.3 ST-013/014 proof (`scripts/story-motion/proof.ts`, 646 frames)

- Apply §5.1 to the comparison half with the proof's own windows (strain 114–242, labels 114–136 and 243–263). Stretch the camera and flows over 334 frames.
- Apply §5.2 to the access half (312 frames).
- The cut at local frame 334 stays a hard cut. Continuity holds because the houses match, and the camera velocity should also continue across the cut: set the second half's first camera key to the first half's last camera state and tangent.

## 7. Delivery phases

Work on a new branch `codex/story-continuous-motion`, branched from `codex/motion-quality-pass`. Use conventional commit messages as in the repo history (`feat(story): …`, `docs: …`), one or more per phase. **Never overwrite existing `benchmarks/results/*` directories**; render into new versioned directories.

| Phase                             | Deliverable                                                                                                                                                                                                                                                                                                                                                            | Exit criteria                                                                                                                                                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0 Decision and baseline**      | Update `.impeccable.md` principle 5 and the aesthetic direction with the owner decision (§0), without deleting the other principles. Add a "Superseded" note on the audit's stillness guidance. Implement `motion-energy.ts` (§4.9b) with calibration. Commit a baseline report `benchmarks/results/story-motion-v012/motion-energy.json` and a synthetic pan fixture. | Calibration passes. The seven study MP4s in `story-motion-v012/` reproduce their §0 moving shares within ±2 percentage points under the stated 480×270 rule; the separate resource-passage render is outside this gate.           |
| **P1 Engine**                     | §4.1–4.8 and the analyzer part of §4.9a, with unit tests                                                                                                                                                                                                                                                                                                               | **All v012 fixtures render pixel-identical** (run the existing story preview/export parity suite and compare against v012 MP4s decoded frame by frame). New unit tests pass. `pnpm build` and `pnpm lint` pass.                   |
| **P2 Prototype, then STOP**       | Unequal Margins v2 (§5.1) only. Render into `benchmarks/results/story-motion-v013-proto/` with a gallery page showing v012 and v013 side by side, both energy sparklines, 9-frame contact sheets and a 390 px phone capture.                                                                                                                                           | Gates G1–G6 pass. **Stop and ask the owner for review before continuing.** Report the measured numbers and anything that felt wrong.                                                                                              |
| **P3 Library roll-out**           | §5.2–5.7, rendered into `story-motion-v013/`, with an index, comparison page and per-clip energy JSON                                                                                                                                                                                                                                                                  | G1–G6 pass for all seven. Existing story browser suite (98+ comparisons, backward seeks, timing editing, phone layout, 646-frame export, 30 fps CLI) passes. The exact-cut frames 71/72 and 119/120 are inspected and documented. |
| **P4 Passages**                   | §6: the cue mapping document, `story-motion-s01e01-proof-v011/` and `story-motion-s01e01-resources-v004/`                                                                                                                                                                                                                                                              | G1–G6 pass across the full passages. Frame counts, slices and narration hash are unchanged. Handoff tests pass. Both proofs fully decode with audio.                                                                              |
| **P5 Lab, docs and verification** | §4.10. A new `docs/story-motion-continuous-implementation.md` reporting measured results against the §0 baseline. README and ROADMAP (v0.13 section) links.                                                                                                                                                                                                            | `pnpm check` passes, or relevant failures are documented if an unrelated suite needs environment setup. The report separates measured results, sampled-frame judgement and what still needs human watching and listening.         |

**Stopping rules:**

- If a gate cannot pass without breaking an invariant in §3, stop and report rather than weakening the invariant.
- If R2 (no decoration) conflicts with R3 (density) on a narration span, prefer a Response on existing subjects or a camera reframe to a new element, and note it in the cue document.

## 8. Tests to add

Unit tests (vitest, `tests/unit/`):

- `story-camera.test.ts`: Hermite continuity (velocity continuous at interior keys); depth projection; screen-locked depth 0; jolt decay; coverage failure message; velocity diagnostics.
- `story-choreography.test.ts`: each verb's expansion (key values at start, mid and end); multi-key moves; `scale` vs `scaleX` rejection; recipe defaults under `motionGrammar: "v2"`; v1 unchanged.
- `story-text-reveal.test.ts`: tested through the prepared-scene evaluation plus a browser pixel check. `reveal = 1` is identical; alignment handling; word staging.
- `story-flows.test.ts`: deterministic offsets; seek independence; constant count; gap gating; pinch warp is monotone.
- `story-quality.test.ts` (extend): frozen-run from the compiled scene; semantic-gap roles; text-velocity under the camera; `continuous` policy disables `short-final-hold`; label-in-motion-envelope.
- `story-proof.test.ts` (extend): beat handoff state and velocity match; slices unchanged.
- `brush-path.test.ts` (extend): pinch multiplier bounds; texture seed unchanged.

Browser tests (`tests/browser/story.ts`):

- Extend the fixtures to the v2 scenes. Keep the preview/export parity and backward-seek checks.
- Add a motion-energy assertion over each exported clip (G1, G2).

## 9. Commands

```bash
pnpm story:prepare
pnpm story:render --output-dir benchmarks/results/story-motion-v013 --require-continuous-motion
pnpm story:proof --output-dir benchmarks/results/story-motion-s01e01-proof-v011 --narration <current-WAV> --narration-sha256 <expected-hash> --require-continuous-motion
pnpm test:unit
pnpm test:browser:story
pnpm build && pnpm lint && pnpm format:check
```

Use the pinned toolchain (Node 22.23.1, pnpm 10.29.3, FFmpeg 8.0.1). Look up the narration path and hash in the existing proof `handoff.json`; don't invent them.

## 10. Out of scope and known risks

**Out of scope:**

- Sound design and foley. Recommended as the next pass once picture motion is accepted.
- Cinematic Parallax and legacy illustrated presets.
- E-commerce adoption (roadmap v0.14).
- Full S01E01 11,297-frame assembly.
- Changes to historical content.

**Risks:**

- **Readability under motion.** R5 and G5 guard against it, but only the owner's review decides it. Take extra care at the P2 checkpoint; the owner rejected crowding before.
- **Judder at 24 fps on high-contrast outlines.** R7 limits help. If judder shows in review, reduce pan and prefer zoom.
- **Pixel-energy thresholds with x264.** Calibrate in P0 before trusting G1 and G2.
- **Performance.** Flows and text measurement add per-frame cost. Report render times against the v012 figure of about 4–5 s per clip.
- **Motion becoming wallpaper.** Currents must change behaviour when the story changes: slowing, stopping, changing colour or reversing. A current that looks the same from the first frame to the last is a defect under R2.
