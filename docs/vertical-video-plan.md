# Vertical video plan

- **Updated:** 2026-09-28
- **Status:** VV0–VV8 complete. Vertical layout and art follow-ups are tracked separately.
- **Baseline:** `0b2e254` on `codex/motion-craft-engine`
- **Scope:** Engine primitives and authoring tools only (see [engine tooling scope](story-engine-tooling-plan.md#objective-and-scope)). Vertical motion studies are acceptance fixtures, not deliverables.

## Objective

Still Shift renders every family at 1920×1080. The product targets faceless YouTube, and short-form channels need 9:16. This plan makes **output format** a first-class engine concept. Every family can then render at 1080×1920 through the same Lab, CLI, cache and verification paths as landscape.

The goal is not to author one vertical copy of every scene by hand. The engine should turn an existing landscape story, cinematic scene or image into a vertical render cheaply. When it cannot do so safely, it should say exactly why.

## Baseline findings (2026-09-27)

| #   | Finding                                                                                                                                                                                                                                                                                                                                             | Evidence                                                                                                                                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | **Contracts pin 16:9.** The illustrated, cinematic and story scenes extend `PreparedSceneFieldsSchema`, which declares `width: z.literal(1920)` and `height: z.literal(1080)`. The export result metrics repeat the same literals. The v0.1 request constraints also fix 1920×1080.                                                                 | [`prepared.ts`](../packages/scene-contract/src/prepared.ts) (`preparedShape`, `PreparedAnimationResultSchema`), [`contracts.ts`](../packages/scene-contract/src/contracts.ts) `V0_1_REQUEST_CONSTRAINTS`                                                                                                         |
| B2  | **Renderers are mostly already parametric.** Story camera, motion craft, text layout, cinematic projection and coverage checks read `scene.width` and `scene.height`. The export worker sizes the viewport, raw frame buffer and ffprobe checks from `scene.canvas`.                                                                                | [`story-camera.ts`](../packages/renderer-core/src/story-camera.ts), [`motion-craft.ts`](../packages/renderer-core/src/motion-craft.ts), [`cinematic-scene.ts`](../packages/renderer-core/src/cinematic-scene.ts), [`export-worker.ts`](../packages/execution-runtime/src/export-worker.ts)                       |
| B3  | **Some output paths still hard-code 1920×1080.** The passage verifier asserts the width and height. The transition render samples at 1920×1080 and builds a `color=…:s=1920x1080` ffmpeg base. The depth Lab preview and the passage preview fix their canvas size.                                                                                 | [`story-passage-render.ts`](../packages/animation-engine/src/story-passage-render.ts) `verifyVideo`, [`story-transition-render.ts`](../packages/animation-engine/src/story-transition-render.ts), [`main.ts`](../apps/lab/src/main.ts) `canvasWidth`, [`passage-preview.ts`](../apps/lab/src/passage-preview.ts) |
| B4  | **Commerce already solved the format problem locally.** `COMMERCE_PROFILES` defines landscape, portrait (1080×1920), square and feed. Scene validation checks the output size against the profile. The layout code branches per profile, and each profile has its own fixtures (`h01-portrait.json` and others). No other family can use this code. | [`commerce.ts`](../packages/scene-contract/src/commerce.ts), [`commerce-scene.ts`](../packages/renderer-core/src/commerce-scene.ts)                                                                                                                                                                              |
| B5  | **Authored content is absolute 16:9 pixels.** Story, cinematic and illustrated nodes carry `x/y/width/height` in 1920×1080 space. Story templates can override poses per slot, but not per format. `safeInset` is one scalar for all four edges.                                                                                                    | [`story.ts`](../packages/scene-contract/src/story.ts), [`story-authoring.ts`](../packages/scene-contract/src/story-authoring.ts), [`story-template.ts`](../packages/renderer-core/src/story-template.ts), [`story-text-layout.ts`](../packages/renderer-core/src/story-text-layout.ts)                           |
| B6  | **Motion limits are tuned for wide frames.** Cinematic camera travel allows ±160 px horizontally but only ±40 px vertically. Several gates scale with `scene.width`, so switching to 9:16 would quietly tighten horizontal limits by 44%. Depth `horizontal_drift` would show only a narrow band of a wide source in 9:16.                          | [`cinematic.ts`](../packages/scene-contract/src/cinematic.ts) `camera`, [`cinematic-scene.ts`](../packages/renderer-core/src/cinematic-scene.ts) travel gates, [`scene.ts`](../packages/renderer-core/src/scene.ts) presets                                                                                      |
| B7  | **Depth-image framing is centre-only.** `coverFit` crops symmetrically. The safety analysis weights the central 50% of the source, not the region that ends up on screen. A 16:9 source in a 9:16 frame keeps only about 32% of its width. With no focal point, the subject can be cut off.                                                         | [`webgl-renderer.ts`](../packages/renderer-core/src/webgl-renderer.ts), [`safety.ts`](../packages/renderer-core/src/safety.ts)                                                                                                                                                                                   |
| B8  | **Cinematic art kits are painted for 16:9.** Layer `paintedBounds` and the coverage checks already exist. In 9:16, most current kits will fail background coverage at the top and bottom unless layers are rescaled or repainted.                                                                                                                   | [`assets/cinematic-illustrated`](../assets/cinematic-illustrated), `Background coverage fails` in [`cinematic-scene.ts`](../packages/renderer-core/src/cinematic-scene.ts)                                                                                                                                       |

## Design decisions

1. **One shared format table.** Move `COMMERCE_PROFILES` into a new `scene-contract/src/output-format.ts` as `OUTPUT_FORMATS`: `landscape` 1920×1080 and `vertical` 1080×1920. Add `square` and `feed` only if a family needs them. Commerce keeps its `profile` names, and `portrait` becomes an alias of `vertical`, so commerce fixtures and hashes do not change.
2. **Format is scene data, not a render flag.** Scenes gain an optional `format` field, defaulting to `landscape`. `width` and `height` are derived from it and validated against it. The CLI `--format` flag chooses which variant to resolve (decision 3); it never stretches a resolved scene.
3. **Per-format overrides, not separate scenes.** Templates and scenes may carry a `formats.vertical` block. The block patches node poses, camera keys, text boxes, `safeInset` and safe zones. The base scene remains the landscape authority, and resolution applies the override before validation. This gives one story, one cue timeline and one narration for both cuts.
4. **Automatic reframe first, overrides second.** The engine proposes a vertical layout (decision 5). Authors write overrides only where the proposal fails lint. This follows the owner's direction toward engine and tooling work.
5. **Reframe primitives, one per family:**
   - _Depth image:_ a focal point, either `focus: [x, y]` normalised or taken from the depth worker's subject estimate. The crop window follows it. Motion presets use the axis that has spare source pixels, so vertical frames pan across the width.
   - _Cinematic:_ scale layers to cover the frame height, and anchor the crop on `camera.anchor` or the subject. Camera limits are fractions of frame size, not pixels.
   - _Story:_ a deterministic reflow pass maps landscape regions (left/centre/right) to vertical bands (top/middle/bottom). It swaps the axis of `layoutComponentBoxes` rows and refits text to the new line width. The reflow proposes changes and lint judges them. It never silently rewrites motion (invariant 7 of the motion-craft plan).
6. **Safe zones are separate from `safeInset`.** Add `safeZones`: named rectangles per format, such as caption and interface overlay areas. Text and focal subjects must avoid authored zones. Organic YouTube Shorts has no fixed numeric default zone; authors can supply zones for a scene.

## Invariants

1. **Landscape parity.** Scenes without `format` or `formats` resolve to the same JSON, renderer versions and decoded bytes as today. Golden parity, the legacy regression and every existing browser suite must pass unchanged.
2. **Versioned opt-in.** Vertical output bumps a renderer version (`story-canvas`, `commerce-canvas` or cinematic) only for scenes that opt in. `format` and any applied override are part of cache identity.
3. **Determinism and preview/export parity** as in the [motion craft invariants](motion-craft-engine-plan.md#invariants-binding-for-every-phase).
4. **Fail loudly.** A vertical render that would crop the subject, leave coverage gaps or put text in a safe zone fails with a structured `passageError`. It is not shipped with a warning.
5. **One format per render.** A passage renders at one format. Mixed-format passages are out of scope.

## Milestone tracker

Status: `[ ]` planned, `[~]` in progress, `[x]` complete, `[!]` blocked with a recorded reason.

| ID  | Deliverable                                                | Depends on | Fixes  | Status |
| --- | ---------------------------------------------------------- | ---------- | ------ | ------ |
| VV0 | Safe-zone research and format decisions (owner)            | —          | —      | `[x]`  |
| VV1 | Shared `OUTPUT_FORMATS` contract with landscape parity     | —          | B1, B4 | `[x]`  |
| VV2 | Output-size-agnostic export, transitions and verification  | VV1        | B3     | `[x]`  |
| VV3 | Lab format switcher and safe-zone overlay                  | VV1        | B3     | `[x]`  |
| VV4 | Depth image focal reframe and axis-aware presets           | VV2        | B6, B7 | `[x]`  |
| VV5 | Cinematic reframe, relative camera limits, coverage report | VV2        | B6, B8 | `[x]`  |
| VV6 | Story per-format overrides and safe zones                  | VV2, VV0   | B5     | `[x]`  |
| VV7 | Story reflow proposal and vertical lint                    | VV6, VV3   | B5     | `[x]`  |
| VV8 | CLI, batch and passage `--format`, fixtures, docs          | VV4–VV7    | —      | `[x]`  |

VV0 research is recorded in [vertical-safe-zones-research.md](vertical-safe-zones-research.md). The owner approved organic YouTube Shorts as the first vertical target, shared narration and timeline for landscape and vertical story cuts, landscape and vertical only outside commerce, batch rendering of both formats only when requested, and no fixed numeric organic-Shorts `vertical.safeZones` default. Authors may supply named zones. Google's numeric ad-safe rectangle remains a research reference for ads, not an automatic organic-Shorts gate. The [VV7 proposal trial](review/vertical-video/vv7-proposal-report.md) records the remaining manual layout work for the two legacy passages.

For landscape parity, parsed legacy scenes omit `format`; absence is treated as
`landscape` during validation and resolution. Prepared vertical scene JSON must
include `format: "vertical"` and matching explicit dimensions. CLI and story
format resolvers derive those dimensions when producing vertical variants.

VV4, VV5 and VV6 are independent and can run in parallel after VV2.

## Phases

### VV0 — Research and owner decisions

- Use the `research` skill to find the current published interface overlay and safe-area guidance for YouTube Shorts, and optionally TikTok and Reels. Record it in `docs/vertical-safe-zones-research.md` with sources. Do not hard-code zone values before this.
- Record the owner's [format and safe-zone decisions](#resolved-owner-decisions).
- **Exit:** research doc merged; default policy for `vertical.safeZones` agreed. Complete on 2026-09-28.

### VV1 — Shared format contract

- Add `packages/scene-contract/src/output-format.ts` with `OUTPUT_FORMATS`, `OutputFormatSchema` and `formatSize(format)`.
- In `prepared.ts`, add `format: OutputFormatSchema.default("landscape")` and replace the width and height literals with a `superRefine` that checks them against `formatSize(format)`. Keep `width`/`height` in the parsed output so renderers stay unchanged. Apply the same change to `PreparedAnimationResultSchema.metrics`.
- Re-export `COMMERCE_PROFILES` from the shared table and keep `portrait` as an alias. Commerce validation is unchanged.
- Generalise `V0_1_REQUEST_CONSTRAINTS` to allow either format size.
- Regenerate the corpus schema (`pnpm schema:generate`).
- **Tests:** unit tests for defaults, mismatches and the alias; `pnpm test:golden` and the full `pnpm check` pass with no fixture changes.

### VV2 — Output-size-agnostic pipeline

- `story-passage-render.ts` `verifyVideo`: compare against the passage's resolved format, not 1920×1080.
- `story-transition-render.ts`: pass width and height through `sampleStoryTransition` and the ffmpeg `color=…:s=` base.
- `export-worker.ts`: already reads `scene.canvas`. Add a vertical smoke export and confirm the H.264 level and profile the encoder picks for 1080×1920 play back in target players.
- Audit `benchmarks`, `scripts/*render*` and review-page generators for 16:9 assumptions (contact sheets, gallery thumbnails, `480×270` energy probes). Derive probe size from the aspect ratio.
- **Tests:** a synthetic 1080×1920 story scene and handoff exported end to end; ffprobe width, height and frame count match.

### VV3 — Lab format support

- Add a format switch to each Lab screen. `main.ts` and `passage-preview.ts` size canvases from the scene; CSS uses `aspect-ratio` as `commerce-components.ts` already does.
- Add a toggleable overlay for `safeInset`, `safeZones` and the landscape frame's footprint inside the vertical frame.
- **Tests:** Lab-session browser test loads a vertical scene and checks canvas size and overlay presence.

### VV4 — Depth image reframe

- Add optional `focus: [x, y]` (normalised source coordinates) to the single-image request. When it is absent, derive a default from the depth worker's output: the nearest large region, weighted to the centre. Record the source of the choice in the scene manifest.
- Replace the symmetric `coverFit` with a focus-anchored crop window clamped to the source bounds. Evaluate `analyzeDepthSafety` on the pixels inside the crop window, not the source centre.
- Make motion presets axis-aware: amplitudes are fractions of the crop window, and drift runs along the axis with spare pixels. `auto` preset selection considers the format. Recompute overscan per format.
- **Tests:** unit tests for crop placement and clamping; a browser depth test with a landscape source rendered to vertical; landscape outputs are byte-identical.

### VV5 — Cinematic reframe

- Express camera limits (`travel`, `curve`) and the travel gates in `cinematic-scene.ts` as fractions of the frame, with per-format profiles. Landscape values must reproduce today's pixel limits exactly.
- Add a reframe step: uniform layer scale so the background covers the frame height, plus a crop anchor from `camera.anchor` and the subject. Vertical-only presets such as Rising Vista can use the larger vertical budget.
- Turn the coverage failure into a structured report: which layer, which edge, how many pixels are missing. Authors can then decide whether to extend `paintedBounds` or repaint.
- **Tests:** a vertical variant of every `ci-*` fixture either renders or fails with a coverage report that matches a recorded snapshot. At least one kit, for example Rising Vista, renders clean in 9:16.

### VV6 — Story per-format overrides

- Add `formats: { vertical?: StoryFormatOverride }` to `story.ts` and `story-authoring.ts`. An override can patch node `x/y/width/height/scale/origin`, text `lineWidth/fontSize/align`, `initialState`, camera keys, `safeInset` and `safeZones`. It cannot change events, cues or timing, so both cuts share one narration timeline.
- Apply the override inside template resolution, before `StorySceneSchema` validation. Include the override in the event index and cache identity.
- Extend `story-text-layout.ts` and the motion-craft `keep-in-safe-area` constraint to respect `safeZones`. Add diagnostics `text-in-safe-zone` and `subject-in-safe-zone`.
- **Tests:** one passage renders in both formats from one plan; landscape output unchanged; a deliberate zone violation fails with the new diagnostic.

### VV7 — Reflow proposal and vertical lint

- `proposeVerticalLayout(scene)` in `renderer-core`: deterministic mapping from landscape regions to vertical bands. It rotates the axis of horizontal `layoutComponentBoxes` groups, refits text to the vertical line width and scales the camera zoom to preserve subject size. Output is a `formats.vertical` override for the author to accept, edit or reject. It is never applied implicitly.
- `lintVertical(scene)`: collects every format-specific failure in one pass, including overflow, safe-zone hits, subjects smaller than a minimum size and relationships broken by the move (for example, connectors that no longer attach).
- Lab: "Propose vertical" writes the override into the workbench; lint results appear in the passage diagnostics panel. CLI: `still-shift passage lint --format vertical`.
- **Exit:** run the proposal on both existing story passages and record the result. Report how many nodes needed manual override edits and how many lint issues remained. Aim to minimise both; this is not a hard gate.

### VV8 — CLI, batch, fixtures and docs

- Add `--format` to `still-shift`, `cinematic:preview`, `story:passage` and the batch runner. The batch manifest can request both formats per item.
- Fixtures: one vertical fixture per family under `benchmarks/fixtures/**/vertical/`; register them in the relevant catalogs and in `pnpm test`.
- Docs: add a "Vertical video" section to the [user guide](user-guide.md) and a phone-sized capture gallery, as in the continuous-storytelling review. Update the README and ROADMAP.

## Risks

- **Art kits:** some cinematic and story art is too narrow to fill 9:16 at acceptable `sourcePixelsPerOutputPixel`. Mitigation: VV5 coverage report; asset repaint work is tracked outside this plan.
- **Reflow quality:** automatic layout can be valid but dull. Mitigation: the proposal is advisory; lint and human review decide.
- **Hidden 16:9 constants:** thresholds tuned by eye, such as energy gates and the `0.1–0.9` subject-position bounds in `cinematic-scene.ts`, may mean different things in 9:16. Mitigation: VV2 audit plus vertical fixtures in every browser suite.
- **Cache churn:** adding `format` to identity must not invalidate landscape caches. Mitigation: omit the field from the hash when it has the default value, and cover this with a test.

## Resolved owner decisions

1. **Platform priority:** Organic YouTube Shorts first. TikTok and Reels are future targets, with their own overlay guidance if added.
2. **Story relationship:** Landscape and vertical cuts share one narration and cue timeline. Format-specific layout overrides do not change story timing.
3. **Formats outside commerce:** Landscape and vertical only. Commerce retains its existing profiles.
4. **Batch behavior:** Render both formats only when the batch request explicitly asks for both.
5. **Organic Shorts safe zones:** No fixed numeric default. Authors can declare named `vertical.safeZones`; the Google Ads rectangle is an ad-specific research reference, not an organic Shorts rule.
