# Still Shift — Phase 0 Implementation Plan

**Status:** Ready for execution  
**Scope:** Local, batchable photo-animation engine  
**Target duration:** 10 working days  
**Primary consumer:** The existing explainer-video production workflow  
**Related architecture:** `Still_Image_Animation_Architecture.md`

**2026-09-25 illustrated-style extension:** Four optional flat 2D presets were
added for a History Offstage style trial. They do not change the original three
depth-preset baseline or the required exit gates. The prior 43-image candidate
is retired; see [the preset trial](./docs/history-offstage-presets.md) and
[corpus review](./docs/corpus-review-2026-09-25.md).

**2026-09-25 creative review correction:** The owner found that first trial too
basic. The owner approved the [replacement motion plan](./docs/history-offstage-motion-plan.md).
Six presets using supplied layers, paths, and authored states are now implemented
as a bounded extension to this experiment; see the
[implementation and 42-second review reel](./docs/history-offstage-motion-implementation.md).
The extension explicitly accepts prepared alpha assets and rectangular clips,
with 24/30 fps scene metadata. Automatic segmentation, arbitrary mask authoring,
and background inpainting remain excluded. Creative review and the original
Phase 0 exit gates remain open.

**2026-09-25 cinematic planning request:** The owner requested a further cinematic
template family including parallax. The [next build plan](./docs/cinematic-template-plan.md)
proposes a shared camera, authored depth planes, painted-area checks, and nine
full-frame shot treatments. The first [Layered Parallax milestone](./docs/cinematic-parallax-implementation.md)
now implements a shared plane camera, coverage validation, and two original
compositions. A researched [Threshold Push milestone](./docs/threshold-push-implementation.md)
now adds forward travel and a grounded room assembly. The researched
[Lateral Track milestone](./docs/lateral-track-implementation.md) reuses that assembly
for sustained sideways travel and visible subject drift. The researched
[Foreground Reveal milestone](./docs/foreground-reveal-implementation.md) adds
asset-aware occlusion checks and a held revealed composition. Five recipes remain planned. Focus softening and dolly-zoom
are explicitly marked experiments; they do not revise the channel baseline or
the existing Phase 0 acceptance gates.

## 1. Phase 0 decision

Build the smallest production-shaped vertical slice that can answer one question:

> Can Still Shift turn a representative batch of explainer-video stills into varied, usable 3–8 second footage clips at low cost and with little or no manual editing?

Phase 0 is not a consumer product launch. It is a quality, integration, and economics test. It must process real inputs from the existing explainer workflow, export deterministic MP4 clips, expose failures clearly, and produce enough evidence for a go/no-go decision.

The implementation should remain local and single-machine. Cloud infrastructure, billing, authentication, and multi-tenant concerns begin only after the visual effect and workflow value pass the exit gates.

## 2. Hypotheses and exit gates

### 2.1 Hypotheses

1. Conservative depth-based motion is visually usable on most AI-generated explainer images.
2. A small set of well-selected presets can create enough variation that a long video does not feel like one repeated zoom effect.
3. Automatic safety rules can prevent obvious edge tearing, border exposure, and excessive distortion without manual depth editing.
4. A deterministic renderer can produce precise clip duration, resolution, frame rate, and framing for downstream assembly.
5. Preparation plus export costs materially less than generating the same footage duration with a video model.

### 2.2 Required exit gates

Phase 0 passes only when all of the following are true on a frozen evaluation corpus:

| Gate                     | Required result                                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Automatic usability      | At least 80% of clips accepted without manual repair                                                                          |
| Severe artifacts         | Fewer than 5% contain obvious tearing, holes, exposed borders, or subject deformation                                         |
| Batch completion         | At least 98% complete or return a valid 2D fallback without operator intervention                                             |
| Determinism              | Repeated renders have identical timing, framing, preset parameters, and frame count                                           |
| Duration accuracy        | Output duration differs by no more than one frame                                                                             |
| Preview/export agreement | No material difference in crop, camera direction, or motion timing                                                            |
| Throughput               | Measured fast enough to support the existing workflow; target at least 1× real-time export at 1080p/30 on the selected worker |
| Cost                     | At least 70% lower estimated footage cost than the chosen generative-video baseline                                           |
| Editorial result         | One 5–10 minute explainer assembled from Phase 0 clips does not feel like a repetitive slideshow during internal review       |

The 80% acceptance gate applies to the intended explainer-image distribution, not arbitrary photographs.

## 3. Assumptions

- The existing explainer workflow can call a local command and consume MP4 files plus JSON metadata.
- Inputs are JPEG, PNG, or WebP stills generated or selected upstream.
- Phase 0 targets 16:9, 1920×1080, 30 FPS, and clips between 3 and 8 seconds.
- Audio, narration, subtitles, shot ordering, and full-timeline assembly remain upstream responsibilities.
- The initial development environment is macOS or Linux. CUDA is optional; Apple Silicon MPS and CPU fallback are supported for development.
- Inputs are trusted for the local spike. Untrusted-media sandboxing begins after validation.
- Depth Anything V2 Small is the initial permissively licensed depth model. Alternative depth models are benchmark candidates, not simultaneous production dependencies.

## 4. Scope

### 4.1 Included

- Single-image normalization and hashing.
- Monocular depth estimation.
- Depth normalization and edge-preserving smoothing.
- Three deterministic motion presets:
  - `slow_push`
  - `horizontal_drift`
  - `cinematic_float`
- Motion intensity levels: `subtle`, `standard`, and `strong`, with safety clamping.
- Automatic overscan and safe framing.
- Browser-based interactive preview.
- Fixed-timestep headless rendering.
- H.264 MP4 export through a pinned FFmpeg build.
- 2D pan/zoom fallback.
- Single-image and manifest-driven batch commands.
- Machine-readable warnings, timings, hashes, and selected parameters.
- A static HTML evaluation gallery.
- Automated tests at the animation-engine interface.

### 4.2 Explicitly excluded

- Still-image generation.
- Script analysis, shot planning, narration, or timeline editing.
- User accounts, projects, billing, subscriptions, and quotas.
- PostgreSQL, Redis, durable queues, object storage, and CDN integration.
- SAM, semantic region detection, manual masks, and background inpainting.
- Hair, clothing, breathing, blinking, lip sync, or body animation.
- Particles and environmental effects beyond what is required to evaluate the core depth effect.
- Mobile optimization.
- Arbitrary camera orbits or large lateral motion.
- WebM and browser-side final export as required outputs.

## 5. Vertical slice

```text
Input image + animation request
        ↓
Validate and normalize
        ↓
Estimate and normalize depth
        ↓
Calculate risk score and safe motion envelope
        ↓
Resolve requested or automatic preset
        ↓
Create immutable scene manifest
        ↓
Preview with shared Three.js renderer
        ↓
Render frames at a fixed timestep
        ↓
Encode H.264 MP4 with FFmpeg
        ↓
Return video, manifest, warnings, metrics, and checksums
```

If preparation or risk analysis rejects depth motion, the same request must produce a deterministic 2D fallback clip rather than failing the batch.

## 6. Module design

### 6.1 External seam

Phase 0 exposes one deep `AnimationEngine` module. Callers and tests use the same interface. Normalization, caching, depth inference, risk analysis, preset resolution, frame rendering, encoding, and metric collection remain hidden in its implementation.

```ts
export type AnimationRequest = {
  inputPath: string;
  outputPath: string;
  durationMs: number;
  fps: 30;
  width: 1920;
  height: 1080;
  preset: "auto" | "slow_push" | "horizontal_drift" | "cinematic_float";
  intensity: "subtle" | "standard" | "strong";
  seed: number;
};

export type AnimationResult = {
  status: "rendered" | "rendered_with_warnings" | "fallback_2d";
  outputPath: string;
  sceneManifestPath: string;
  frameCount: number;
  durationMs: number;
  selectedPreset: string;
  warnings: AnimationWarning[];
  metrics: AnimationMetrics;
  checksums: {
    source: string;
    depth?: string;
    scene: string;
    output: string;
  };
};

export interface AnimationEngine {
  animate(request: AnimationRequest): Promise<AnimationResult>;
}
```

Interface invariants:

- `durationMs` must map to a whole frame count at the requested FPS.
- A request never silently changes output dimensions, FPS, or duration.
- The same normalized source, request, model version, and renderer version resolve to the same scene manifest.
- Unsafe motion is clamped and reported as a warning.
- Recoverable depth problems return `fallback_2d`; invalid input and export corruption are errors.
- Output publication is atomic: a final path is returned only after FFmpeg validation and checksum generation succeed.

### 6.2 Adapters at justified seams

| Seam             | Phase 0 adapters                                    | Reason it is a real seam                                                              |
| ---------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Depth estimation | Depth Anything V2 Small; deterministic fake         | Production inference and fast repeatable tests both need the same contract            |
| Rendering        | interactive browser preview; pinned headless export | Preview and final export execute in different environments but consume the same scene |
| Command entry    | single-image CLI; batch-manifest CLI                | Both are real callers of `AnimationEngine`                                            |

Everything else remains internal until a second real implementation exists. In particular, do not introduce storage, queue, database, or cloud-provider interfaces during Phase 0.

### 6.3 Internal depth result

```ts
type DepthResult = {
  rawFloatPath: string;
  previewTexturePath: string;
  width: number;
  height: number;
  modelId: string;
  modelChecksum: string;
  inferenceMs: number;
};
```

The Python depth adapter writes a raw floating-point depth artifact for evaluation and an 8-bit normalized PNG for the Phase 0 renderer. The renderer representation is deliberately simple; higher-precision texture formats should be added only if the benchmark reveals visible banding.

### 6.4 Minimal scene manifest

```json
{
  "schemaVersion": "0.1",
  "sourceHash": "sha256:...",
  "pipelineVersion": "prep-0.1.0",
  "rendererVersion": "render-0.1.0",
  "timeline": {
    "durationMs": 5000,
    "fps": 30,
    "frameCount": 150
  },
  "canvas": {
    "width": 1920,
    "height": 1080
  },
  "depth": {
    "asset": "depth.png",
    "strength": 0.12,
    "near": 0.0,
    "far": 1.0
  },
  "motion": {
    "preset": "slow_push",
    "intensity": "standard",
    "seed": 1842,
    "safeCrop": 0.1
  },
  "quality": {
    "riskScore": 0.18,
    "fallback": false,
    "warnings": []
  }
}
```

Unknown fields are ignored. Unknown preset names, unsupported schema versions, and non-finite numeric values fail validation.

## 7. Proposed repository layout

```text
apps/
└── lab/                         # Vite/React preview and evaluation UI
packages/
├── animation-engine/            # Deep module exposed to CLI callers
├── renderer-core/               # Shared Three.js scene evaluation and shaders
└── scene-contract/              # Types, validation, manifest serialization
tools/
├── still-shift-cli/             # Single and batch command adapters
└── export-worker/               # Pinned Chromium frame render + FFmpeg encode
services/
└── depth-worker/                # Python depth adapter
benchmarks/
├── corpus-manifest.json         # Metadata only; source images may stay untracked
├── results/                     # Metrics and rating outputs
└── gallery/                     # Generated static review gallery
tests/
├── fixtures/
├── integration/
└── visual/
```

Suggested tooling:

- Node.js 22, pnpm, TypeScript, Three.js, Vite, React, Zod, Vitest, and Playwright.
- Python 3.12, `uv`, PyTorch, Depth Anything V2 Small, Pillow, NumPy, and OpenCV.
- A pinned FFmpeg version with documented codec configuration.
- ESLint/Prettier for TypeScript and Ruff for Python.

## 8. Implementation milestones

### Milestone 0 — Foundation and frozen corpus

**Target:** Day 1

Tasks:

1. Create the repository structure and pin tool versions.
2. Add build, format, lint, unit-test, integration-test, and benchmark commands.
3. Define `AnimationRequest`, `AnimationResult`, warnings, errors, and scene schema.
4. Collect 30–50 representative images from real explainer projects.
5. Categorize each image by:
   - portrait/person;
   - landscape/environment;
   - architecture/interior;
   - product/object;
   - illustration/anime;
   - text-heavy/diagram;
   - difficult edges such as hair, foliage, glass, or smoke.
6. Record source rights, dimensions, category, expected shot duration, and the exact source-file SHA-256 checksum in `corpus-manifest.json`.
7. Keep private or licensed source images out of Git when required.

Done when:

- A no-op fake animation adapter passes through the full command path.
- The corpus and success gates are frozen before renderer tuning begins.

### Milestone 1 — Depth preparation

**Target:** Days 2–3

This milestone exposes the Python depth worker through preparation and contact-sheet
commands for development and corpus review. The final `AnimationEngine.animate`
integration remains part of Milestone 5, after rendering and export exist.

Tasks:

1. Implement input validation, EXIF orientation, sRGB conversion, resize policy, and normalized/preprocessed SHA-256 hashing for cache identity.
2. Implement the Depth Anything V2 Small adapter.
3. Cache depth outputs by source hash, preprocessing version, model ID, model checksum, and parameters.
4. Store raw float depth and normalized preview texture.
5. Implement percentile normalization, light bilateral smoothing, and NaN/range validation.
6. Record inference time, device, peak memory where available, and cache hit/miss.
7. Add a deterministic fake adapter for tests.

Tests:

- Rotated EXIF images normalize correctly.
- RGBA, grayscale, very wide, and very tall inputs produce valid normalized assets.
- Identical sources reuse cached depth.
- Changed preprocessing or model versions invalidate the cache.
- Corrupt inputs fail with stable machine-readable errors.

Done when:

- Every corpus image produces a valid depth preview or a documented preparation failure.
- A generated contact sheet permits visual depth review before animation work continues.

### Milestone 2 — Shared renderer and presets

**Target:** Days 3–5

Tasks:

1. Implement a subdivided image plane and depth displacement shader in `renderer-core`.
2. Use a fixed clock defined by `frameIndex / fps`; do not use wall-clock animation time.
3. Implement cover-fit composition and 10% default overscan.
4. Implement `slow_push`, `horizontal_drift`, and `cinematic_float` as versioned pure functions.
5. Make all noise deterministic from the scene seed.
6. Clamp camera travel, roll, and depth strength to preset-specific safe limits.
7. Add depth-gradient damping near strong discontinuities.
8. Implement the interactive preview adapter in the lab app.
9. Display source, depth, preset, risk score, warnings, and camera parameters alongside the preview.

Tests:

- Presets return the same transforms for the same scene time and seed.
- Frame zero and the final frame match documented camera states.
- Camera transforms never exceed safe limits.
- Invalid depth samples cannot create NaN or infinite vertex positions.
- Cover-fit and overscan avoid visible borders at supported aspect ratios.

Done when:

- All corpus images can be previewed through all three presets.
- Reviewers can identify whether the core effect is promising before export work begins.

### Milestone 3 — Risk analysis and fallback

**Target:** Days 5–6

Tasks:

1. Calculate simple, explainable risk signals:
   - depth discontinuity density;
   - large discontinuities near the frame center;
   - disagreement between RGB edges and depth edges;
   - insufficient overscan for the requested movement;
   - extreme or nearly flat depth range.
2. Combine them into a versioned risk score.
3. Map risk score to maximum depth strength and lateral travel.
4. Downgrade unsafe `strong` requests to `standard` or `subtle` and emit warnings.
5. Implement deterministic 2D pan/zoom fallback.
6. Record the reason for every clamp and fallback.

The risk score is a safety heuristic, not model confidence. Do not label it as calibrated depth confidence.

Tests:

- Synthetic high-contrast depth boundaries cause lateral motion to be clamped.
- Flat depth maps resolve to 2D fallback.
- Requested parameters remain unchanged when they are already safe.
- Every fallback has a stable reason code.

Done when:

- The engine never needs to crash or silently emit a broken clip because depth is unusable.

### Milestone 4 — Deterministic MP4 export

**Target:** Days 6–7

Tasks:

1. Pin a Chromium build for headless rendering.
2. Load the same scene contract and renderer package used by preview.
3. Render frames using the fixed frame index rather than `requestAnimationFrame` timing.
4. Pipe raw frames to FFmpeg where possible; avoid intermediate PNG files in the normal path.
5. Encode H.264 MP4 with explicit pixel format, color metadata, frame rate, and fast-start settings.
6. Write to a temporary output and rename atomically after validation.
7. Validate the result with `ffprobe`:
   - expected stream dimensions;
   - expected frame rate;
   - expected frame count;
   - duration within one frame;
   - decodable first and last frames.
8. Record frame-render time, encode time, output size, CPU/GPU information, and peak memory.

**2026-09-24 export transport checkpoint:** The raw RGBA pipe remains available and produces an exact-frame MP4, but a five-second 1080p synthetic scene took 29.8 seconds on the local Chromium SwiftShader path. An in-memory PNG frame pipe produced a byte-identical MP4 in 4.1 seconds with no PNG files written. It is the default Phase 0 transport. On one photographic candidate, the PNG pipe took 9.4 seconds; an optional 95%-quality JPEG pipe took 5.0 seconds with 0.993 mean SSIM against the PNG-pipe MP4. The JPEG adapter remains an evaluation option until v0.7 parity and v0.10 editorial review. These results change the transport choice, not the exact-frame, H.264, or validation requirements. The throughput gate is measured on real images and must not be inferred from the synthetic case.

Tests:

- A five-second, 30 FPS request produces exactly 150 frames.
- Export failure never publishes a partial final file.
- Preview and export agree on crop, direction, and timing for golden scenes.
- The same request creates manifests and perceptually equivalent output across repeated runs.

Done when:

- A frozen scene reliably exports a valid 1080p MP4.
- Export throughput is measured rather than assumed.

### Milestone 5 — CLI and batch operation

**Target:** Day 8

Single-image command:

```bash
pnpm still-shift animate \
  --input ./input.png \
  --output ./output.mp4 \
  --duration 5 \
  --preset auto \
  --intensity standard \
  --seed 1842
```

Batch command:

```bash
pnpm still-shift batch \
  --manifest ./batch.jsonl \
  --output-dir ./outputs \
  --concurrency 2
```

Tasks:

1. Implement commands as thin adapters over `AnimationEngine`.
2. Accept newline-delimited JSON batch requests.
3. Write one result record per request, including warnings and metrics.
4. Support bounded concurrency appropriate to the available GPU and encoder.
5. Continue after per-item failures and produce a final batch summary.
6. Make repeated requests reuse cached preparation artifacts.
7. Exit non-zero only for invalid batch configuration or incomplete batch execution; per-item failures belong in the result manifest.

Done when:

- The existing explainer workflow can invoke the batch command without knowing about depth, shaders, Chromium, or FFmpeg.
- A 50-image run completes unattended.

### Milestone 6 — Evaluation gallery and decision run

**Target:** Days 9–10

Tasks:

1. Render each corpus image with every preset at `standard` intensity.
2. Generate a static HTML gallery containing:
   - input image;
   - depth preview;
   - rendered clip;
   - selected parameters;
   - risk signals and warnings;
   - timing and output size;
   - reviewer rating controls or a linked rating manifest.
3. Rate each clip for:
   - edge tearing or halos;
   - subject deformation;
   - exposed borders;
   - incorrect depth ordering;
   - motion appropriateness;
   - overall editorial usability.
4. Assemble one 5–10 minute explainer using Phase 0 clips in the existing workflow.
5. Record total image preparation time, animation time, operator time, compute time, and estimated cost per finished minute.
6. Compare against:
   - static images with no movement;
   - basic Ken Burns animation;
   - the chosen generative-video baseline.
7. Publish a short decision report with pass/fail results for every exit gate.

Done when:

- The decision can be made from measured output and a real assembled video, not individual demo clips.

## 9. Test strategy

The `AnimationEngine` interface is the primary test surface.

### Unit tests

- Scene validation and serialization.
- Duration-to-frame calculation.
- Seeded noise and easing.
- Preset evaluation.
- Safe-envelope clamping.
- Risk-score calculation.
- Error and warning classification.

### Integration tests

- Image → fake depth → previewable scene.
- Image → real depth → MP4.
- Cache reuse and invalidation.
- Depth failure → 2D fallback MP4.
- Batch containing successes, fallbacks, and invalid inputs.
- FFmpeg validation and atomic publication.

### Visual regression tests

Keep five permissively licensed golden scenes covering portrait, landscape, architecture, illustration, and difficult edges. Compare fixed frames at 0%, 50%, and 100% of the clip using perceptual thresholds. Visual tests should detect major crop, camera, shader, and color changes without requiring identical pixels across GPU drivers.

### Manual evaluation

Automated image metrics cannot determine whether a shot is editorially usable. Human acceptance ratings on the frozen corpus are a required release gate.

## 10. Warning and error taxonomy

Warnings permit output:

- `MOTION_CLAMPED`
- `DEPTH_RANGE_FLAT`
- `DEPTH_EDGE_RISK_HIGH`
- `LATERAL_MOTION_REDUCED`
- `FALLBACK_2D_USED`
- `PREVIEW_EXPORT_VARIANCE`

Errors prevent output:

- `INPUT_UNREADABLE`
- `INPUT_FORMAT_UNSUPPORTED`
- `INPUT_DIMENSIONS_INVALID`
- `DEPTH_INFERENCE_FAILED`
- `SCENE_INVALID`
- `RENDER_FAILED`
- `ENCODE_FAILED`
- `OUTPUT_VALIDATION_FAILED`

Messages should state the failed operation and actionable context without exposing stack traces through the external interface.

## 11. Performance and cost instrumentation

Record the following for every animation:

- input dimensions and normalized dimensions;
- cache hit or miss;
- depth inference milliseconds;
- depth post-processing milliseconds;
- scene-build milliseconds;
- average and p95 frame-render milliseconds;
- FFmpeg encode milliseconds;
- total wall time;
- peak CPU memory;
- peak GPU memory when available;
- model, renderer, Chromium, and FFmpeg versions;
- output bytes;
- fallback and warning counts;
- selected device and hardware description.

Phase 0 should report measured resource usage. Translating measurements into cloud cost is part of the decision report, not hard-coded into the engine.

## 12. Main risks and containment

| Risk                                                   | Phase 0 response                                                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Depth errors create halos and stretching               | Conservative presets, edge damping, risk-based clamping, 2D fallback                                           |
| Repeated presets make long videos boring               | Three meaningfully distinct presets, deterministic variation, full-video evaluation                            |
| Headless Chromium lacks GPU acceleration               | Record renderer/device information and benchmark honestly; do not promise target throughput before measurement |
| Browser and export framing diverge                     | Shared scene contract, renderer package, fixed clock, golden-scene comparison                                  |
| Model or dependency licensing blocks commercialization | Pin exact models and dependencies; use Depth Anything V2 Small; do not copy AGPL renderer code                 |
| Phase 0 expands into a platform                        | Enforce exclusions and reject work unrelated to the exit gates                                                 |
| Quality requires masks/inpainting                      | Treat this as a measured Phase 1 decision, not hidden Phase 0 work                                             |

## 13. Go/no-go outcomes

### Go: depth-first engine

Choose when all gates pass. Next work is integration with the existing workflow, deployment benchmarking, and a minimal asynchronous job adapter.

### Conditional go: layered quality

Choose when motion is valuable but depth-boundary artifacts cause most failures. Phase 1 adds prompted subject segmentation, background reconstruction, and a layer-correction interface while preserving the same external animation interface.

### Conditional go: 2D-first engine

Choose when depth adds limited value but automated framing, motion selection, and batch export still save meaningful editing time. Ship deterministic 2D animation first and retain depth as an opt-in quality mode.

### No-go

Choose when the real explainer assembly remains repetitive, requires extensive manual repair, or does not materially reduce footage cost and editing time. Preserve the spike as an internal experiment and do not build the production platform.

## 14. Immediate execution order

1. Freeze the evaluation corpus and success gates.
2. Scaffold the repository and scene contract.
3. Complete depth preparation and contact-sheet review.
4. Complete browser preview before investing in export.
5. Review the complete corpus across all three presets.
6. Add risk clamping and 2D fallback.
7. Implement and benchmark headless MP4 export.
8. Add batch execution.
9. Assemble a real explainer video.
10. Make the Phase 1 decision from the measured results.
