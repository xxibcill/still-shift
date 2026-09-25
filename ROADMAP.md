# Still Shift — Phase 0 Roadmap

**Status:** v0.3–v0.8 implemented; frozen-corpus and human review pending; v0.9 in progress

**Updated:** 2026-09-24  
**Target:** 10 working days  
**Detailed plan:** [Phase_0_Implementation_Plan.md](./Phase_0_Implementation_Plan.md)  
**Architecture:** [Still_Image_Animation_Architecture.md](./Still_Image_Animation_Architecture.md)

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

When work begins, update the roadmap date, mark exactly one version as in progress, and link its completion evidence. Each version is cumulative and should remain runnable after the next version begins.

## Progress

| Version | Deliverable                              |    Target | Status | Completion evidence                                                                                       |
| ------- | ---------------------------------------- | --------: | ------ | --------------------------------------------------------------------------------------------------------- |
| v0.1    | Foundation, contracts, and frozen corpus |     Day 1 | `[!]`  | [Foundation checks pass; real corpus freeze remains blocked](./docs/v0.1-verification.md)                 |
| v0.2    | Reusable depth preparation               |  Days 2–3 | `[!]`  | [Depth worker merged; frozen-corpus review pending](./docs/v0.2-depth-preparation.md)                     |
| v0.3    | First animated preview                   |     Day 3 | `[!]`  | [Preview implemented; corpus-wide review pending](./docs/v0.3-first-preview.md)                           |
| v0.4    | Preset library and lab UI                |  Days 4–5 | `[!]`  | [Three presets implemented; frozen-corpus review pending](./docs/v0.4-preset-library.md)                  |
| v0.5    | Safety analysis and 2D fallback          |     Day 6 | `[!]`  | [Safety implemented; frozen-corpus review pending](./docs/v0.5-safety-fallback.md)                        |
| v0.6    | Deterministic MP4 export                 |     Day 7 | `[!]`  | [1080p export passes; representative throughput gate pending](./docs/v0.6-mp4-export.md)                  |
| v0.7    | Preview/export parity and golden tests   |     Day 7 | `[!]`  | [Five golden scenes pass; frozen-corpus review pending](./docs/v0.7-preview-export-parity.md)             |
| v0.8    | Single-image CLI integration             |     Day 8 | `[!]`  | [Real CLI and workflow candidate verified; frozen-corpus review pending](./docs/v0.8-single-image-cli.md) |
| v0.9    | Unattended batch execution               |     Day 8 | `[~]`  | 50-image batch completes with a result manifest                                                           |
| v0.10   | Evaluation release and Phase 1 decision  | Days 9–10 | `[ ]`  | Gallery, assembled explainer, and gate report                                                             |

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
- [!] Preview every frozen-corpus image through all three presets. The 43-image candidate gallery passed, but corpus approval is pending.

### Completion evidence

- [x] All preset functions return identical transforms for identical scene time and seed.
- [x] Frame zero and the final frame match documented camera states.
- [!] Corpus comparison gallery includes all three presets for the candidate set; frozen-corpus review remains pending.
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

- [ ] Implement newline-delimited JSON batch input.
- [ ] Implement bounded concurrency.
- [ ] Continue after individual item failures.
- [ ] Reuse preparation artifacts across repeated renders.
- [ ] Write one result record per input.
- [ ] Include output path, status, warnings, hashes, timings, and selected preset.
- [ ] Produce a final batch summary.
- [ ] Make retries idempotent for already completed items.
- [ ] Document batch exit behavior and partial-failure recovery.

### Completion evidence

- [ ] A 50-image batch finishes unattended.
- [ ] At least 98% of inputs render or produce a valid 2D fallback.
- [ ] Retrying the same manifest preserves timing and scene decisions.
- [ ] Per-item failures do not prevent unrelated outputs.
- [ ] v0.8 single-image usage remains compatible.

## v0.10 — Evaluation release and Phase 1 decision

**Target:** Days 9–10  
**Depends on:** v0.9  
**Release outcome:** A frozen evaluation release supplies the evidence for a go, conditional-go, or no-go decision.

### Tasks

- [ ] Render every corpus image through all three presets at standard intensity.
- [ ] Generate the static evaluation gallery.
- [ ] Show input, depth, clip, parameters, warnings, and performance metrics together.
- [ ] Rate edge artifacts, subject deformation, borders, depth order, motion fit, and editorial usability.
- [ ] Assemble one real 5–10 minute explainer from Phase 0 clips.
- [ ] Record human editing time and manual-repair count.
- [ ] Calculate preparation, rendering, and estimated infrastructure cost per finished minute.
- [ ] Compare against static images, Ken Burns animation, and the selected generative-video baseline.
- [ ] Evaluate motion repetition in the assembled video, not just individual clips.
- [ ] Write the final gate report.
- [ ] Record the go, conditional-go, or no-go decision.

### Completion evidence

- [ ] Benchmark results are reproducible from documented commands.
- [ ] The assembled explainer is available for review.
- [ ] Every exit gate has a measured result and evidence link.
- [ ] The next-phase decision and rationale are written down.
- [ ] The v0.10 release records exact engine, model, renderer, browser, and FFmpeg versions.
- [ ] The v0.9 batch path reproduces the published benchmark from documented commands.

## Final exit gates

| Gate                     | Required result                                                 | Actual | Evidence |
| ------------------------ | --------------------------------------------------------------- | ------ | -------- |
| Automatic usability      | ≥80% accepted without manual repair                             | —      | —        |
| Severe artifacts         | <5% with obvious severe defects                                 | —      | —        |
| Batch completion         | ≥98% rendered or valid fallback                                 | —      | —        |
| Determinism              | Exact timing, framing, parameters, and frame count              | —      | —        |
| Duration accuracy        | Within one frame                                                | —      | —        |
| Preview/export agreement | No material crop, direction, or timing difference               | —      | —        |
| Export throughput        | Target ≥1× real time at 1080p/30                                | —      | —        |
| Cost reduction           | ≥70% below selected generative-video baseline                   | —      | —        |
| Editorial result         | 5–10 minute explainer does not feel like a repetitive slideshow | —      | —        |

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
