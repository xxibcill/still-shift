# Still Shift — Phase 0 Roadmap

**Status:** v0.3–v0.10 implementation complete; six richer illustrated presets implemented; creative review, frozen-corpus approval, and human decision gates pending

**Updated:** 2026-09-26

**Target:** 10 working days  
**Detailed plan:** [Phase_0_Implementation_Plan.md](./Phase_0_Implementation_Plan.md)  
**Architecture:** [Still_Image_Animation_Architecture.md](./Still_Image_Animation_Architecture.md)

**Corpus review:** The owner has retired all 43 prior candidate images (28 History
Offstage illustrations and 15 commercial photographs). The active selection and
official corpus are empty and unfrozen. See the
[selection review](./docs/corpus-review-2026-09-25.md).

**Illustrated-motion trial:** The owner found the first four treatments too basic.
The [History Offstage motion plan](./docs/history-offstage-motion-plan.md) is now
implemented as six treatments based on layers, paths, and authored state changes.
The [42-second review reel and verification](./docs/history-offstage-motion-implementation.md)
are ready; creative acceptance remains pending.

**Next creative direction:** The owner requested cinematic templates with parallax.
The [nine-template plan](./docs/cinematic-template-plan.md) and
[source prompt pack](./prompt-packs/cinematic-illustrated-still-animation-prompt-pack.md)
are recorded. The [first cinematic milestone](./docs/cinematic-parallax-implementation.md)
implements Layered Parallax, shared camera/depth support, and an original courtyard kit.
The [second milestone](./docs/threshold-push-implementation.md) adds the researched
Threshold Push recipe and an original storage-room kit with a grounded vessel.
The [third milestone](./docs/lateral-track-implementation.md) adds sustained lateral
travel and visible subject drift using that same grounded room kit.
The [fourth milestone](./docs/foreground-reveal-implementation.md) adds Foreground
Reveal with measured alpha concealment, complete clearance, and a held destination.

**S01E01 story motion:** The
[seven-treatment roadmap](./docs/s01e01-story-motion-roadmap.md) turns the
[28-still design study](./prompt-packs/s01e01-motion-design.md) into v0.13.
Start with Unequal Margins and Access Constraint, prove their visible change in
one short preview, then assemble the 26.917-second ST-013/014 narrated sequence.
Relationship Build, Evidence Boundary, Dated System Break, Category Swap and
Motif Resolve now share the implemented event compiler and renderer. All seven
recipes have rendered fixtures, lab timing controls and CLI export; narrated
S01E01 integration remains in progress. See the [implementation evidence](./docs/story-motion-implementation.md).
Cinematic iteration is deferred while v0.13 is active; Phase 0 acceptance remains separate.
The [implementation research](./docs/s01e01-story-motion-research.md) now covers
all seven, including source precedents, asset preparation and exact-frame timing requirements.

**Current creative priority:** Improve the seven story graphics using the channel's
existing Layered Chronicle identity. The [visual critique and redesign plan](./docs/story-motion-visual-redesign.md)
covers coherent artwork, distinct compositions, readable typography and stable
symbol meanings. Analysis is complete; the visual pass is planned within v0.13.

**Planned commerce adoption:** The [e-commerce motion adoption plan](./docs/ecommerce-motion-adoption-plan.md)
defines proposed v0.14: import the 40-format reference catalog, prove H03 with timed
typography, add H01/H04 and their A01 sequence, then support portrait/square layouts
and a brief-to-export workflow. It reuses v0.13's frame events. Implementation has
not started; v0.13 remains active.

## Phase 0 outcome

Prove that Still Shift can turn a representative batch of explainer-video stills into varied, deterministic 3–8 second MP4 footage with minimal manual repair and substantially lower cost than generative video.

Phase 0 ends with evidence, not infrastructure:

1. A working local animation engine.
2. A batch interface usable by the existing explainer workflow.
3. A frozen benchmark gallery.
4. One assembled 5–10 minute explainer.
5. A written go, conditional-go, or no-go decision.

## Status legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed
- `[!]` Blocked
- `[–]` Deferred; existing implementation retained

When work begins, update the roadmap date, mark exactly one version as in progress, and link its completion evidence. Each version is cumulative and should remain runnable after the next version begins.

## Progress

| Version | Deliverable                              |    Target | Status | Completion evidence                                                                                                    |
| ------- | ---------------------------------------- | --------: | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| v0.1    | Foundation, contracts, and frozen corpus |     Day 1 | `[!]`  | [Foundation checks pass; real corpus freeze remains blocked](./docs/v0.1-verification.md)                              |
| v0.2    | Reusable depth preparation               |  Days 2–3 | `[!]`  | [Depth worker merged; frozen-corpus review pending](./docs/v0.2-depth-preparation.md)                                  |
| v0.3    | First animated preview                   |     Day 3 | `[!]`  | [Preview implemented; corpus-wide review pending](./docs/v0.3-first-preview.md)                                        |
| v0.4    | Preset library and lab UI                |  Days 4–5 | `[!]`  | [Three presets implemented; frozen-corpus review pending](./docs/v0.4-preset-library.md)                               |
| v0.5    | Safety analysis and 2D fallback          |     Day 6 | `[!]`  | [Safety implemented; frozen-corpus review pending](./docs/v0.5-safety-fallback.md)                                     |
| v0.6    | Deterministic MP4 export                 |     Day 7 | `[!]`  | [1080p export passes; representative throughput gate pending](./docs/v0.6-mp4-export.md)                               |
| v0.7    | Preview/export parity and golden tests   |     Day 7 | `[!]`  | [Five golden scenes pass; frozen-corpus review pending](./docs/v0.7-preview-export-parity.md)                          |
| v0.8    | Single-image CLI integration             |     Day 8 | `[!]`  | [Real CLI and workflow candidate verified; frozen-corpus review pending](./docs/v0.8-single-image-cli.md)              |
| v0.9    | Unattended batch execution               |     Day 8 | `[!]`  | [50-item technical batch passes; frozen-corpus gate pending](./docs/v0.9-unattended-batch.md)                          |
| v0.10   | Evaluation release and Phase 1 decision  | Days 9–10 | `[!]`  | [Candidate gallery, 7.97-minute assembly, and gate report; human decision pending](./docs/v0.10-evaluation-release.md) |
| v0.11   | Illustrated editorial preset trial       | Extension | `[!]`  | [Six presets implemented and verified; creative review pending](./docs/history-offstage-motion-implementation.md)      |
| v0.12   | Cinematic illustrated template study     | Extension | `[–]`  | [Cinematic Parallax family: eight variations; quick preview workflow](./docs/cinematic-template-plan.md)               |
| v0.13   | S01E01 reusable story-motion treatments  | Extension | `[~]`  | [Seven-treatment roadmap; short proof first, then episode integration](./docs/s01e01-story-motion-roadmap.md)          |
| v0.14   | E-commerce catalog and prepared ads      | Extension | `[ ]`  | [Adoption plan; H03 proof, H01/H04 sequence, output layouts and workflow](./docs/ecommerce-motion-adoption-plan.md)    |

## Critical path

```text
v0.1 Foundation
  → v0.2 Depth
    → v0.3 First preview
      → v0.4 Preset library
        → v0.5 Safety and fallback
          → v0.6 MP4 export
            → v0.7 Preview/export parity
              → v0.8 Single-image CLI
                → v0.9 Batch execution
                  → v0.10 Evaluation release
```

v0.11–v0.13 are illustrated-style extensions with separate creative reviews.
Their outputs do not complete the Phase 0 release gates.
The planned v0.14 commerce collection also has its own implementation evidence.

The versions are numbered by cumulative capability, not independent branches. Implementation work for v0.5 and v0.6 may overlap, but neither version is complete until the previous version remains green.

## v0.1 — Foundation, contracts, and frozen corpus

**Target:** Day 1  
**Depends on:** Nothing  
**Release outcome:** A reproducible repository with a fake end-to-end animation path and a frozen evidence set.

### Tasks

- [x] Scaffold the planned repository layout.
- [x] Pin Node.js, pnpm, Python, browser, and FFmpeg versions.
- [x] Add format, lint, unit-test, integration-test, and benchmark commands.
- [x] Define `AnimationRequest`, `AnimationResult`, warnings, errors, and scene schema.
- [x] Implement a no-op/fake path through the animation-engine interface.
- [!] Collect 30–50 representative stills from real explainer projects. No source images were present; 30–50 are still required.
- [!] Cover portraits, environments, architecture, objects, illustrations, diagrams, and difficult edges. Category requirements are encoded, but no real entries exist yet.
- [!] Record image category, dimensions, rights, expected shot duration, and source checksum so the frozen corpus identifies exact source bytes. The schema and metadata fixture exist; real-image metadata remains outstanding.
- [x] Keep private source images untracked where required.
- [!] Freeze the corpus and evaluation gates before renderer tuning. Evaluation gates are recorded, but the empty corpus is explicitly unfrozen.

### Completion evidence

- [x] Clean installation succeeds from repository instructions. See [v0.1 verification evidence](./docs/v0.1-verification.md).
- [!] Software checks pass with `pnpm check`; the release-level `pnpm check:all` includes `corpus:check` and remains blocked until the corpus is frozen.
- [x] Fake animation request completes through the CLI.
- [!] `corpus-manifest.json` is structurally valid but cannot be reviewed and frozen until the required real images are supplied.
- [x] The engine and scene schema report version `0.1`.

### v0.1 checkpoint

Stop if the corpus does not resemble the images produced by the real explainer workflow. A convenient demo corpus cannot validate the product.

## v0.2 — Reusable depth preparation

**Target:** Days 2–3  
**Depends on:** v0.1  
**Release outcome:** The depth worker prepares and caches validated depth assets without rendering animation yet. The animation-engine integration follows in v0.8.

### Tasks

- [x] Normalize EXIF orientation, color space, dimensions, and input format.
- [x] Calculate the normalized/preprocessed source SHA-256 hash used for cache identity.
- [x] Implement the Depth Anything V2 Small adapter.
- [x] Implement a deterministic fake depth adapter for tests.
- [x] Cache results by source, preprocessing version, model identity, model checksum, and parameters.
- [x] Preserve raw float depth for evaluation.
- [x] Produce a normalized 8-bit depth texture for Phase 0 rendering.
- [x] Apply percentile normalization and light edge-preserving smoothing.
- [x] Validate dimensions, numeric range, NaNs, and corrupt outputs.
- [x] Record device, inference time, memory where available, and cache status.
- [!] Generate and review a depth contact sheet for the frozen corpus. The command is implemented, but the required real corpus is still empty.

### Completion evidence

- [ ] Every valid corpus input produces depth or a stable documented failure.
- [x] Cache reuse and invalidation tests pass with `pnpm test:depth`.
- [ ] Depth contact sheet is reviewed before renderer work is accepted.
- [x] Model and weight licenses/checksums are recorded.
- [x] The v0.1 fake path remains green.
- [x] Scene preparation reports version `0.2`.

### v0.2 checkpoint

If depth is consistently unusable for the target image style, compare one alternative permissively licensed model before proceeding. Do not add segmentation or inpainting at this checkpoint.

## v0.3 — First animated preview

**Target:** Day 3  
**Depends on:** v0.2  
**Release outcome:** Every prepared corpus image can be previewed with one conservative `slow_push` animation.

### Tasks

- [x] Implement the subdivided image plane and depth displacement shader.
- [x] Evaluate animation from `frameIndex / fps`, never wall-clock time.
- [x] Implement cover-fit composition and default overscan.
- [x] Implement versioned `slow_push` preset.
- [x] Support the `subtle` intensity level.
- [x] Clamp camera travel, depth strength, and crop to conservative hard limits.
- [x] Build the minimum browser lab around the shared renderer.
- [x] Display source image, depth texture, and resolved scene parameters.
- [!] Preview every frozen-corpus image with `slow_push`; the manifest is empty.

### Completion evidence

- [x] `slow_push` unit tests are deterministic.
- [x] Camera transforms never exceed defined safety limits.
- [x] No invalid depth sample creates NaN or infinite geometry.
- [!] A corpus-wide `slow_push` preview gallery is available for review; gallery generation exists, but no real corpus entries are available.
- [x] v0.2 preparation and cache tests remain green.

### v0.3 checkpoint — Core-effect review

Review the entire corpus before adding more presets.

- Continue when conservative motion is clearly more useful than plain Ken Burns animation.
- Continue conditionally when only particular image categories work; narrow the intended input contract.
- Stop when depth motion rarely improves footage or usually damages subjects.

## v0.4 — Preset library and lab UI

**Target:** Days 4–5  
**Depends on:** v0.3  
**Release outcome:** The lab can compare three deterministic presets and three intensity levels across the frozen corpus.

### Tasks

- [x] Implement versioned `horizontal_drift` preset.
- [x] Implement versioned `cinematic_float` preset.
- [x] Implement `standard` and `strong` intensity levels.
- [x] Seed every noise-driven value.
- [x] Clamp camera travel, roll, depth strength, and crop per preset.
- [x] Add depth-gradient damping near strong discontinuities.
- [x] Add preset and intensity controls to the browser lab.
- [x] Display renderer version and evaluated camera parameters.
- [!] Preview every frozen-corpus image through all three presets. The retired 43-image candidate gallery passed technically; a new corpus is pending.

### Completion evidence

- [x] All preset functions return identical transforms for identical scene time and seed.
- [x] Frame zero and the final frame match documented camera states.
- [!] Corpus comparison gallery includes all three presets for the retired candidate set; a new frozen-corpus review remains pending.
- [x] v0.3 `slow_push` output remains compatible.

### v0.4 checkpoint — Motion-variety review

- Continue when the presets are visually distinct and useful in a long-form edit.
- Revise or remove presets that primarily expose depth defects.
- Do not add decorative effects to compensate for weak core camera motion.

## v0.5 — Safety analysis and 2D fallback

**Target:** Day 6  
**Depends on:** v0.4  
**Release outcome:** Unsafe depth animation is automatically reduced or replaced with a valid deterministic 2D clip.

### Tasks

- [x] Measure depth-discontinuity density.
- [x] Detect large discontinuities near central/important image regions.
- [x] Measure disagreement between RGB edges and depth edges.
- [x] Detect flat or extreme depth ranges.
- [x] Verify requested movement against available overscan.
- [x] Combine signals into a versioned risk score.
- [x] Reduce lateral movement and depth strength according to risk.
- [x] Implement deterministic 2D pan/zoom fallback.
- [x] Emit stable warnings for every clamp and fallback.
- [x] Avoid describing the heuristic risk score as calibrated model confidence.

### Completion evidence

- [x] Synthetic risky scenes trigger the expected clamps.
- [x] Flat depth maps produce valid moving 2D previews; MP4 footage is covered by v0.6.
- [x] Safe requests remain unchanged.
- [x] Every fallback includes a stable reason code.
- [x] v0.4 preset behavior remains deterministic.

## v0.6 — Deterministic MP4 export

**Target:** Day 7  
**Depends on:** v0.5  
**Release outcome:** A resolved scene exports as a validated 1080p H.264 MP4 with exact timing.

### Tasks

- [x] Pin the headless Chromium build.
- [x] Load the shared scene contract and renderer package in the export worker.
- [x] Render frames using fixed frame indices.
- [x] Stream frames to FFmpeg without intermediate files; keep raw RGBA as a reference and use the faster in-memory PNG pipe by default, per the detailed-plan checkpoint.
- [x] Pin and document the FFmpeg codec configuration.
- [x] Encode H.264 MP4 with explicit frame rate, pixel format, color metadata, and fast start.
- [x] Write to a temporary path and publish atomically.
- [x] Validate dimensions, FPS, frame count, duration, and decodability with `ffprobe`.
- [x] Record frame-render, upload, encode-path, validation, and FFmpeg CPU time; output size; sampled worker-process-tree memory; and CPU/GPU information.

### Completion evidence

- [x] Five seconds at 30 FPS produces exactly 150 frames.
- [x] Duration is accurate within one frame.
- [x] Failed exports never publish partial final files.
- [!] A candidate scene exports repeatedly with matching timing and composition; the frozen-corpus repeat remains pending.
- [x] Actual 1080p throughput is recorded for a synthetic and one photographic candidate.
- [x] v0.5 fallback scenes export through the same output path.

### v0.6 checkpoint — Export-path decision

If headless Chromium cannot approach the throughput target on the intended hardware, document the result and test one alternative export adapter. Do not hide poor throughput behind optimistic cloud estimates.

## v0.7 — Preview/export parity and golden tests

**Target:** Day 7  
**Depends on:** v0.6  
**Release outcome:** Preview and final export consume the same scene semantics and are protected by visual regression evidence.

### Tasks

- [x] Select five original, CC0 golden scenes.
- [x] Cover portrait, environment, architecture, illustration, and difficult edges.
- [x] Capture first, middle, and final frames from preview and export.
- [x] Compare crop, camera direction, timing, geometry, and color.
- [x] Establish perceptual-difference thresholds without requiring cross-GPU pixel identity.
- [x] Add golden-scene checks to the test command.
- [x] Emit `PREVIEW_EXPORT_VARIANCE` when differences exceed tolerance.
- [x] Record browser, GPU, renderer, and shader versions with every golden run.

### Completion evidence

- [!] No material mismatch was measured on five golden scenes; frozen-corpus comparison remains pending.
- [x] Golden tests detect renderer changes and reversed or frozen frame motion.
- [x] Repeated export checks remain deterministic.
- [x] v0.6 throughput measurements remain available.

## v0.8 — Single-image CLI integration

**Target:** Day 8  
**Depends on:** v0.7  
**Release outcome:** The existing explainer workflow can request one complete animation without knowing about depth, Three.js, Chromium, or FFmpeg.

### Tasks

- [x] Implement the single-image `animate` command.
- [x] Accept input path, output path, duration, preset, intensity, FPS, and seed.
- [x] Return output path, scene manifest path, status, warnings, hashes, and metrics.
- [x] Document exit codes and machine-readable errors.
- [x] Add a real invocation from an existing explainer source and an integration fixture that matches it.
- [x] Reuse cached preparation artifacts across repeated single-image renders.
- [x] Document command examples and the input/output contract.

### Completion evidence

- [x] One real workflow image renders from a single documented command.
- [x] Invalid input produces a stable error without a partial output.
- [x] A repeated request reuses depth and preserves scene decisions.
- [x] v0.7 golden tests remain green.

## v0.9 — Unattended batch execution

**Target:** Day 8  
**Depends on:** v0.8  
**Release outcome:** A representative explainer-image batch completes unattended and produces a complete result manifest.

### Tasks

- [x] Implement newline-delimited JSON batch input.
- [x] Implement bounded concurrency.
- [x] Continue after individual item failures.
- [x] Reuse preparation artifacts across repeated renders.
- [x] Write one result record per input.
- [x] Include output path, status, warnings, hashes, timings, and selected preset.
- [x] Produce a final batch summary.
- [x] Make retries idempotent for already completed items.
- [x] Document batch exit behavior and partial-failure recovery.

### Completion evidence

- [!] A 50-item technical batch finishes unattended with 43 unique candidate images and seven repeats; the frozen representative 50-image gate remains pending.
- [x] All 50 technical batch items rendered valid MP4s (100%, above the 98% threshold); frozen-corpus measurement remains pending.
- [x] Retrying the same manifest preserves timing and scene decisions; all 50 outputs were reused.
- [x] Per-item failures do not prevent unrelated outputs.
- [x] v0.8 single-image usage remains compatible.

## v0.10 — Evaluation release and Phase 1 decision

**Target:** Days 9–10  
**Depends on:** v0.9  
**Release outcome:** A frozen evaluation release supplies the evidence for a go, conditional-go, or no-go decision.

### Tasks

- [!] Render the 43-image private candidate through all three presets at standard intensity (129/129 valid on the retired candidate); new corpus selection and rerun are pending.
- [x] Generate the static evaluation gallery.
- [x] Show input, depth, clip, parameters, warnings, and performance metrics together.
- [!] Collect human ratings for edge artifacts, subject deformation, borders, depth order, motion fit, and editorial usability.
- [x] Assemble a 478.125-second narrated explainer from 28 Phase 0 sources.
- [!] Record human editing time and manual-repair count after review.
- [x] Calculate archived preparation time, render time, and an explicitly hypothetical infrastructure-cost scenario per finished minute; selected worker pricing remains pending.
- [!] Render static and Ken Burns baselines; an illustrative public generative-video price is documented, but the selected workflow and visual baseline remain pending.
- [!] Evaluate motion repetition in the assembled video during human review.
- [x] Write the candidate gate report with measured and pending gates.
- [!] Record the go, conditional-go, or no-go decision after frozen-corpus review.

### Completion evidence

- [x] Benchmark results are reproducible from documented commands.
- [x] The private assembled explainer is available for review.
- [!] Human and selected-cost exit gates remain unmeasured.
- [!] The next-phase decision and rationale await human review.
- [x] The v0.10 report records exact engine, model, renderer, browser, and FFmpeg versions.
- [x] The v0.9 batch path reproduces the published candidate benchmark from documented commands.

## v0.11 — Illustrated editorial preset trial

**Release outcome:** Richer deterministic illustrated motion must explain a
change inside the composition. The first four-treatment implementation passed
technical checks but was judged too basic by the owner. See the
[replacement plan](./docs/history-offstage-motion-plan.md).

- [x] Add locked hold, short settle, panel reveal, and paired comparison presets.
- [x] Normalize flat-preset inputs without depth inference; preserve the three
      depth presets and existing `auto` selection.
- [x] Render four synthetic, original fixtures as exact 90-frame MP4s with no
      warnings or fallbacks. See the [local trial](./docs/history-offstage-presets.md).
- [x] Analyze the channel style, current hybrid plan, storyboards, and representative
      source artwork before planning the replacement presets.
- [x] Implement and validate all six treatments, reusable prepared-scene support,
      the CLI and preview lab, and a six-clip 24 fps review reel. See the
      [implementation evidence](./docs/history-offstage-motion-implementation.md).
- [!] Obtain creative acceptance of the new six-clip reel.
- [!] Select and review a new representative corpus before Phase 0 acceptance.
- [!] Validate any selected History Offstage image treatment and 24 fps editorial
  conform under that episode's own production rules.

## v0.12 — Cinematic illustrated template study

**Status:** Cinematic Parallax is one family with eight implemented variations, including [Focus Handoff](./docs/focus-handoff-implementation.md), [Detail to World](./docs/detail-to-world-implementation.md) and [Rising Vista and Curved Approach](./docs/parallax-path-variations.md). The owner requested faster iteration after finding the last three too similar. Future work starts with one short preview and targeted verification; the list below records the earlier study rather than requiring a separate feature/research cycle per variation. See the [current iteration policy](./docs/cinematic-template-plan.md).

**Release outcome:** One configurable Cinematic Parallax family, with additional
shot ideas evaluated through short previews. See the
[build plan](./docs/cinematic-template-plan.md) and
[source prompt pack](./prompt-packs/cinematic-illustrated-still-animation-prompt-pack.md).

- [x] Define nine treatments, four reusable scene kits, source prompts, movement
      bounds, fallbacks, and creative/technical acceptance criteria.
- [x] Add versioned camera/depth-plane support, subject anchors, and painted-area checks.
- [x] Implement **Layered Parallax** with two compositions, exact CLI export,
      preview parity, 24/30 fps, and Dramatic/Standard/Restrained controls.
- [x] Research stronger parallax and respond to the owner's slow-motion feedback
      with a wider sweep, revised timing, and foreground cut-edge checks.
- [ ] Obtain creative acceptance of the revised Layered Parallax prototype.
- [x] Research and implement Threshold Push with forward projection, grounded
      room artwork, dynamic sampling checks, two compositions, and preview parity.
- [ ] Obtain creative acceptance of Threshold Push.
- [x] Research and implement Lateral Track with sustained sideways travel, grounded
      room coverage, two compositions, and preview/export verification.
- [ ] Obtain creative acceptance of Lateral Track.
- [x] Research and implement Foreground Reveal with real-alpha concealment checks,
      complete clearance at every strength, early settling, two compositions and parity.
- [ ] Obtain creative acceptance of Foreground Reveal.
- [x] Add Rising Vista and Curved Approach to the shared parallax system, with
      four-second previews, all-strength coverage checks and preview/export parity.
- [ ] Obtain creative acceptance of Rising Vista and Curved Approach.
- [x] Research and implement Detail to World with fixed-focal pullback, source
      density and detail visibility checks, one short preview and export parity.
- [ ] Obtain creative acceptance of Detail to World.
- [x] Research and implement Focus Handoff with layer-local blur, preserved alpha
      edges, pixel sharpness checks, one short preview and export parity.
- [ ] Obtain creative acceptance of Focus Handoff.
- [ ] Evaluate Dolly-Zoom Tension with its specific quality checks.
- [x] Add one-clip iteration command and lab duration controls for the shared family.
- [ ] Review visible differences in short previews before expanding production scope.

## v0.13 — S01E01 reusable story motion

**Status:** Seven recipes implemented and rendered; episode integration in progress.
[Implementation and verification](./docs/story-motion-implementation.md) records the working engine,
lab, CLI and preview gallery. The detailed
[roadmap](./docs/s01e01-story-motion-roadmap.md) defines dependencies, proof
sequences, semantic checks and integration evidence.

**Release outcome:** Seven reusable treatments animate changing relationships
in prepared illustrations, with narration-timed events and continuity between
shots. Still Shift supplies motion scenes; Remotion retains episode assembly.

- [x] Study all 28 selected S01E01 stills and record the
      [motion design and source/timing ledger](./prompt-packs/s01e01-motion-design.md).
- [x] Define seven treatments, ordered milestones and scene-specific acceptance criteria.
- [x] Research implementation precedents for every treatment and record the
      [shared timing/geometry decisions and motion-specific preparation](./docs/s01e01-story-motion-research.md).
- [x] Implement all seven recipes, exact-frame timing, validated events, attached connectors, lab cue controls and reusable rendered fixtures.
- [x] Analyze the seven fixtures against the channel style bible and record the [visual redesign plan](./docs/story-motion-visual-redesign.md).
- [x] Apply the shared art kit, pinned typography and distinct compositions to all seven; deliver the [reviewed gallery and local narrated ST-013/014 proof](./docs/story-motion-visual-implementation.md).
- [x] Refine relationship strokes, attachment points and easing; provide a [synchronized before/after comparison](./docs/story-motion-line-timing-refinement.md).
- [x] Give narrative lines a distinct [split-nib brush treatment](./docs/story-motion-brush-lines.md), with stable texture, expressive pressure and bounded access clearance.
- [~] **M0:** Shared contract and fixture kit complete; episode-specific preparation pending.
- [~] **M1:** Implement Unequal Margins and Access Constraint; inspect one short
  illustrated preview, then the 26.917-second ST-013/014 narrated proof.
- [~] **M2:** Implement Relationship Build and the ST-006–008 resource sequence.
- [~] **M3:** Implement Evidence Boundary and the ST-017/018 evidence-limit sequence.
- [~] **M4:** Implement Dated System Break and the ST-021/022 crisis/context reset.
- [~] **M5:** Implement Category Swap and Motif Resolve; verify substitution
  and the concluding sequence using the established visual motifs.
- [~] **M6:** Complete lab/CLI examples, targeted compatibility checks, shot
  handoff and S01E01 integration/QA under its current production authority.
- [ ] Record independent editorial findings and the final episode creative decision.

Use one short preview and targeted checks before expanding each new behavior.
Milestones are AI-owned work, not repeated Creator review gates. Prepared episode
proofs do not reinstate retired corpus entries or establish Phase 0 acceptance.

## v0.14 — E-commerce motion library adoption

**Status:** Planned; implementation has not started. The
[adoption plan](./docs/ecommerce-motion-adoption-plan.md) records the source catalog,
shared machinery, exact delivery order and completion criteria.

**Release outcome:** Supply a product brief and prepared imagery, preview a supported
format and export a deterministic ad with its scene and provenance. All 40 formats
enter the reference catalog; the first executable release covers H03, H01, H04 and
the ten-second A01 recipe.

- [x] Inspect all five source files and map the pack to the current renderer.
- [x] Define the adoption plan using the implemented v0.13 frame-event path.
- [ ] **M0:** Import and validate the catalog; define the first H03 brief and asset manifest.
- [ ] **M1:** Render the eight-second H03 proof with font loading, text layout and exact timing.
- [ ] **M2:** Add H01/H04 and the ten-second A01 sequence with registered product groups and callouts.
- [ ] **M3:** Verify landscape, portrait and square layouts through preview and export.
- [ ] **M4:** Add the Commerce lab collection and brief preparation workflow; exercise a second product.
- [ ] **M5:** Record executable coverage, preparation/repair effort and the next shared technique.

## Final exit gates

| Gate                     | Required result                                                 | Actual                                                | Evidence                                                       |
| ------------------------ | --------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| Automatic usability      | ≥80% accepted without manual repair                             | Human ratings pending                                 | [v0.10 candidate evidence](./docs/v0.10-evaluation-release.md) |
| Severe artifacts         | <5% with obvious severe defects                                 | Human ratings pending                                 | [v0.10 candidate evidence](./docs/v0.10-evaluation-release.md) |
| Batch completion         | ≥98% rendered or valid fallback                                 | 129/129 candidate clips (100%)                        | [v0.10 candidate evidence](./docs/v0.10-evaluation-release.md) |
| Determinism              | Exact timing, framing, parameters, and frame count              | 129/129 hash-verified retries                         | [v0.10 candidate evidence](./docs/v0.10-evaluation-release.md) |
| Duration accuracy        | Within one frame                                                | 129 exact-frame exports                               | [v0.10 candidate evidence](./docs/v0.10-evaluation-release.md) |
| Preview/export agreement | No material crop, direction, or timing difference               | Five golden scenes pass; new corpus review pending    | [v0.7 parity evidence](./docs/v0.7-preview-export-parity.md)   |
| Export throughput        | Target ≥1× real time at 1080p/30                                | 1.24× aggregate on candidate worker                   | [v0.10 candidate evidence](./docs/v0.10-evaluation-release.md) |
| Cost reduction           | ≥70% below selected generative-video baseline                   | $0.071/min hypothetical worker scenario; gate pending | [v0.10 candidate evidence](./docs/v0.10-evaluation-release.md) |
| Editorial result         | 5–10 minute explainer does not feel like a repetitive slideshow | 7.97-minute assembly ready; human review pending      | [v0.10 candidate evidence](./docs/v0.10-evaluation-release.md) |

The 129 retired-candidate renders and the History Offstage assembly remain
historical engineering evidence. They do not establish Phase 0 acceptance.

## Decision outcomes

### Go — depth-first engine

All gates pass. Integrate with the existing workflow, benchmark deployment options, and add a minimal asynchronous job adapter.

### Conditional go — layered quality

The motion is useful, but boundary artifacts cause most failures. Phase 1 adds subject segmentation, background reconstruction, and correction controls behind the existing animation-engine interface.

### Conditional go — 2D-first engine

Depth adds limited value, but automatic framing, varied motion, and batch export substantially reduce editing work. Ship deterministic 2D animation first and retain depth as an optional mode.

### No-go

The assembled explainer remains repetitive, requires extensive manual repair, or fails to reduce cost and editing time materially. Preserve the spike as an experiment and stop platform development.

## Deferred until Phase 0 passes

- [ ] HTTP job interface and webhooks.
- [ ] Durable queue and worker autoscaling.
- [ ] Object storage and CDN delivery.
- [ ] Authentication, projects, billing, and quotas.
- [ ] Subject segmentation and mask correction.
- [ ] Background inpainting.
- [ ] Particles, fog, rain, snow, and lighting effects.
- [ ] Hair, clothing, breathing, blinking, and facial animation.
- [ ] Mobile optimization.
- [ ] Still-image generation providers.
- [ ] Collaborative editor and timeline features.

## Roadmap maintenance

After completing a version:

1. Change its status to `[x]` in the progress table.
2. Check completed task boxes.
3. Link concrete evidence such as a test command, gallery, metrics file, or rendered artifact.
4. Update the roadmap date.
5. Mark the next version `[~]`.
6. Record scope or gate changes in the detailed implementation plan before changing this roadmap.
