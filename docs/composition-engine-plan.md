# Programmable composition engine — implementation plan

- **Updated:** 2026-10-01
- **Status:** CE0, CE1 and CE2 complete (2026-10-01); CE3 in progress. Q1 and Q3 decided
  2026-09-30; Q2, Q4 and Q8 decided 2026-10-01; Q5–Q7 open.
- **Baseline:** `6772717` — `Merge pull request #22 from xxibcill/codex/still-shift-plan-completion`
- **Tracker owner:** unassigned. Record the owner and branch per milestone in the [tracker](#milestone-tracker).

## Objective

Turn Still Shift into a **programmable After Effects**: a deterministic composition
engine that a human coder or an AI agent drives through code or data rather than a UI.
It must offer the building blocks a motion designer expects from After Effects —
compositions, layers, precomps, blend modes, mattes, masks, shape layers, an effect
stack, a 2.5D camera, motion blur, expressions and rigging — while keeping Still
Shift's strengths: integer-frame determinism, schema validation, narration-cue timing,
measurable motion quality and preview/export parity.

This plan follows the owner's 2026-09-26 scope: engine primitives, compilation,
validation, measurement and authoring tools. Existing studies, passages and demos are
**acceptance fixtures**, not creative deliverables. Every milestone must still support
the owner's requirement that every second moves with meaning (see the
[continuous storytelling plan](./story-motion-continuous-storytelling-plan.md)).

## Scope

**In scope**

- One composition contract that every current scene family compiles into.
- A pure evaluator, a render graph with a Canvas 2D reference backend and a WebGL2
  production backend, and one effect registry available to every layer.
- Shape layers, 2.5D layers and camera, motion blur, time remapping, expressions,
  motion behaviours, mesh deformation, video/image-sequence/audio layers.
- A typed TypeScript builder API, a CLI, a Lab composition inspector with a graph
  editor, AI-facing reference material and motion linting.
- Alpha and higher-quality export formats, per-layer caching and parallel rendering.

**Out of scope**

- A general-purpose GUI video editor. The Lab remains an inspection and light-editing
  tool; code and data are the primary authoring surfaces.
- AE project (`.aep`) import/export, Lottie export and third-party AE plugin
  compatibility. They may be proposed later as separate plans.
- Producing new artwork, episode choreography or creative acceptance of any fixture.
- AI video generation. The video layer consumes supplied clips.

## How to use this document

1. Read [Baseline](#baseline), [Architecture](#target-architecture) and
   [Invariants](#engineering-invariants) before starting any milestone.
2. Pick a milestone whose dependencies are `[x]` in the [tracker](#milestone-tracker).
   Set it to `[~]` with your name and branch in the same commit that starts the work.
3. Work through its checklist. Tick items only when their code, tests and docs are
   merged to the milestone branch.
4. Meet its **Acceptance** and **Verification** sections, then complete the
   [definition of done](#definition-of-done).
5. Record completion evidence (commits, commands, results, limitations) in the
   milestone's **Completion record** and set the tracker row to `[x]`.
6. Record decisions in the [decision log](#decision-log) and unresolved items in
   [open questions](#open-questions-for-the-owner). Do not silently change a recorded
   decision; add a superseding entry.

Status legend: `[ ]` planned, `[~]` in progress, `[x]` complete, `[!]` blocked with a
recorded reason.

## Baseline

What exists at `6772717`, and how it maps to After Effects.

### Strengths to preserve and reuse

| Capability                                                                                          | Location                                                                                                                                                                  | AE equivalent                            |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Keyframes with hold/linear/bezier/smooth interpolation, temporal handles, springs, overshoot        | [`curve.ts`](../packages/renderer-core/src/curve.ts), [`motion-easing.ts`](../packages/scene-contract/src/motion-easing.ts)                                               | Graph editor, keyframe velocity          |
| Signals, drivers (range map, clamp, lag, delay, sum), noise and oscillators                         | [`motion-craft.ts` contract](../packages/scene-contract/src/motion-craft.ts)                                                                                              | Pick-whip links, `linear()`, `wiggle()`  |
| Constraints: attach, contact, look-at, follow-path, keep-in-safe-area                               | same file, `ConstraintSchema`                                                                                                                                             | Parenting, auto-orient, Duik constraints |
| Additive motion layers (`action`, `response`, `current`, `carrier`) with replace/add/multiply blend | same file, `MotionLayerSchema`                                                                                                                                            | No native equivalent                     |
| Text animators with range selectors, glyph/word/line units, variable-font axes                      | same file, `TextAnimatorSchema`; [`typography-renderer.ts`](../packages/renderer-core/src/typography-renderer.ts)                                                         | Text animators, range selectors          |
| Trim paths, path morph, spatial bezier paths                                                        | same file, `NumericMotionPropertySchema`, `PathMorphSchema`, `SpatialPathSchema`                                                                                          | Trim Paths, path keyframes               |
| Cue and narration-word timing, linked retiming, passages                                            | [story engine tooling](./story-engine-tooling.md)                                                                                                                         | Manual markers only                      |
| Shutter-based motion blur, glow, grain, light sweep, displacement and more — commerce only          | [`commerce-effects.ts`](../packages/scene-contract/src/commerce-effects.ts), [`commerce-effects-renderer.ts`](../packages/renderer-core/src/commerce-effects-renderer.ts) | Effects, but not a general stack         |
| Deterministic export, transactional publication, golden sample parity, quality analysers            | [execution runtime](../packages/execution-runtime/README.md), [`golden-parity.ts`](../tests/browser/golden-parity.ts), `story-quality.ts`                                 | Not available in AE                      |

### Structural gaps

1. **No composition model.** Four scene families — legacy illustrated
   (`PreparedScene`), cinematic (`illustrated-scene-2`), story (`story-scene-1`) and
   commerce (`commerce-scene-1`) — each have their own schema and compiler.
   [`prepared-scene.ts`](../packages/renderer-core/src/prepared-scene.ts) and
   [`illustrated-renderer.ts`](../packages/renderer-core/src/illustrated-renderer.ts)
   branch on `schemaVersion` throughout; renderer-core contains 84 such comparisons.
   A new capability must be wired separately into each family.
2. **Five node types.** [`prepared.ts`](../packages/scene-contract/src/prepared.ts)
   defines `image | path | text | rect | group`. Paths are polylines of at most 128
   points with stroke only. There are no ellipses, fills, gradients or shape operators.
3. **A closed property list.** Only the 19 numeric properties in
   `NumericMotionPropertySchema` are animatable. Colours, effect parameters, masks and
   camera settings have no general animation path.
4. **No layer compositing.** The renderer paints directly onto one Canvas 2D context
   with ad-hoc scratch canvases. There are no per-layer buffers, blend modes, track
   mattes, adjustment layers or precomps.
5. **Effects belong to Commerce.** [`shared-effects.ts`](../packages/scene-contract/src/shared-effects.ts)
   exposes six commerce effects to other families; there is no general effect stack.
6. **Cameras are per family.** The story camera is 2D `x`/`y`/`zoom`
   ([`story-camera.ts`](../packages/renderer-core/src/story-camera.ts)); depth planes
   and projection exist only inside cinematic scenes
   ([`cinematic-scene.ts`](../packages/renderer-core/src/cinematic-scene.ts)).
7. **No media layers.** The product direction mixes stills with AI video clips, yet
   there is no video or image-sequence layer. Audio exists only at passage level.
8. **Poses swap whole images.** Characters change pose by state swap
   ([story acting](./story-acting.md)); there is no mesh deformation for still art.
9. **JSON-only authoring.** Fixtures are hand-written JSON with a SHA-256 per asset.
   There is no code-first API for coders or agents.
10. **8-bit opaque H.264 only.** [`export-worker.ts`](../packages/execution-runtime/src/export-worker.ts)
    emits `yuv420p` H.264; there is no alpha, high-bit-depth or image-sequence output.

The practical effect is visible in `docs/review/story-motion-v013/unequal-margins-motion.jpg`:
overlapping action, secondary motion and a camera with depth are expensive to author,
so they are rarely authored.

## Target architecture

```text
                    ┌─────────────────────────────┐
  TypeScript  ─────▶│ @still-shift/motion builder │──┐
  (coders, AI)      └─────────────────────────────┘  │
                                                     ▼
  Story / Commerce / Cinematic / Legacy     ┌──────────────────────┐
  scene JSON  ──── family adapters ────────▶│ composition-1 (JSON) │◀── hand-written / AI JSON
                                            └──────────┬───────────┘
                                                       │ validate (zod + semantic checks)
                                                       ▼
                                            ┌──────────────────────┐
                                            │  compile (resolve    │  expressions → AST,
                                            │  assets, precomps,   │  cues → frames,
                                            │  expressions, cues)  │  behaviours → drivers
                                            └──────────┬───────────┘
                                                       ▼
                                            ┌──────────────────────┐
                                            │ evaluateComp(frame)  │  pure, no DOM
                                            │ → EvaluatedLayerTree │
                                            └──────────┬───────────┘
                                                       ▼
                                            ┌──────────────────────┐
                                            │ render graph         │
                                            │  ├ Canvas2D (ref)    │
                                            │  └ WebGL2 (prod)     │
                                            └──────────┬───────────┘
                                                       ▼
                                   preview (Lab) · export (execution-runtime) · lint
```

### Package layout

| Location                                           | Responsibility                                                                | New or existing |
| -------------------------------------------------- | ----------------------------------------------------------------------------- | --------------- |
| `packages/scene-contract/src/composition/`         | `composition-1` zod schemas, property-path grammar, diagnostic codes          | New directory   |
| `packages/renderer-core/src/composition/evaluate/` | Pure evaluator: time, properties, expressions, constraints, parenting, camera | New directory   |
| `packages/renderer-core/src/composition/render/`   | Render graph, surface pool, Canvas2D and WebGL2 backends                      | New directory   |
| `packages/renderer-core/src/composition/effects/`  | Effect registry and built-in effects                                          | New directory   |
| `packages/renderer-core/src/composition/shapes/`   | Shape-layer geometry and operators                                            | New directory   |
| `packages/renderer-core/src/composition/adapters/` | Story, commerce, cinematic and legacy compilers into `composition-1`          | New directory   |
| `packages/motion-builder/` (`@still-shift/motion`) | TypeScript builder API; depends only on `@still-shift/scene-contract`         | New package     |
| `packages/execution-runtime/`                      | Export of `composition-1`, media pre-decode, output formats, parallel chunks  | Existing        |
| `packages/animation-engine/`                       | Engine entry points for compositions, caching                                 | Existing        |
| `tools/still-shift-cli/`                           | `comp validate/render/preview/lint` commands                                  | Existing        |
| `apps/lab/`                                        | `composition.html` inspector, timeline and graph editor                       | Existing        |

New packages must pass [`check-package-boundaries.ts`](../scripts/check-package-boundaries.ts):
declare every dependency, import other packages only through their public entry points,
and keep `motion-builder` free of renderer and Node-only runtime imports so it also runs
in the browser.

## Engineering invariants

These apply to every milestone. A change that breaks one needs a decision-log entry.

1. **Integer frames are authoritative.** Keys, in/out points and cues are integer
   frames. Subframe sampling exists only for motion blur and time remapping, and is
   deterministic.
2. **Evaluation is pure.** `evaluateComp(comp, time)` depends only on its inputs, never
   on previous frames. Seeking backwards must equal playing forwards.
3. **Determinism.** The same composition, assets, fonts, renderer version and toolchain
   produce identical encoded frames on the export render path, which is pinned to
   software rendering (see [GPU determinism](#gpu-determinism-policy)), **on the same
   operating system and CPU architecture**. CE0 showed that output differs across
   operating systems and architectures, so identity always includes both. Randomness is
   seeded and part of the contract.
4. **Explicit versions.** New contracts start at `composition-1`. Each backend and effect
   has a version string that participates in cache identity, like the existing
   `ILLUSTRATED_RENDERER_VERSION`.
5. **Legacy formats keep working, and look the same.** Existing scene files continue to
   validate and render. Before any old code path is removed, adapter output must look
   the same as the old renderer to a viewer; it need not be pixel-identical. Concretely:
   - every fixture meets its assigned tier in the CE0 manifest: `near` by default,
     `perceptual` only for a fixture with a recorded reason, never looser;
   - evaluated state matches the old path: identical frame timing and visibility, and
     positions within 0.001 composition pixels, so motion cannot drift or jitter even
     where each frame passes on its own;
   - text-bearing fixtures stay at `near`, because glyph shifts accumulate along a line.

   This is parity with the **old renderer**. The new engine's own export stays exact and
   reproducible (invariant 3).

6. **Preview/export parity.** Lab preview and CLI export use the same evaluator and
   backend code for a given composition. Export output is exact and reproducible.
   Lab preview may run on a hardware GPU and must match export within the
   `perceptual` tier, the level CE0 measured for hardware previews; any exception is
   listed in the [GPU determinism policy](#gpu-determinism-policy). Evaluated state
   (positions, timing, visibility) must match exactly; only pixel rasterisation may
   differ. A fixture's assigned `tier` in the CE0 manifest is its **adapter parity**
   target on the export path, not a preview guarantee.
7. **Structured diagnostics.** Every validation failure returns a stable code, severity,
   message and a JSON path (and a builder source location once CE10 lands). Extend
   [`passage-diagnostics.ts`](../packages/renderer-core/src/passage-diagnostics.ts) rather than
   inventing a parallel mechanism.
8. **Bounded inputs.** Every array, string and numeric range in the schema has an explicit
   limit, as current contracts do.

### GPU determinism policy

Decided 2026-09-30 (Q1, option C: hybrid).

**Background.** Different GPUs and drivers compute the same shader with slightly
different floating-point precision, texture filtering and summation order. The
differences are usually 1–2 levels per channel: invisible to viewers, but enough to
break exact checksums, cache identity, job resume and chunked rendering. At the
baseline, export already renders on software graphics by accident rather than by
setting: [`export-worker.ts`](../packages/execution-runtime/src/export-worker.ts) calls
`chromium.launch({ headless: true })` with no GPU flags, headless Chromium falls back to
SwiftShader, and [`golden-baseline.json`](../tests/visual/golden-baseline.json) records
`gpuRenderer` as `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device …), SwiftShader driver)`.

**Policy.**

| Render path                                        | Graphics                                      | Guarantee                                                     |
| -------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| CLI and Lab-triggered export, caches, golden tests | Pinned software rendering (SwiftShader)       | Exact: identical frames for identical inputs and toolchain    |
| Lab interactive preview                            | Hardware GPU when available, else SwiftShader | Matches export within the `perceptual` tier (CE0 measurement) |

**Rules.**

1. Export launches Chromium with the pinned flag set `--disable-gpu
--enable-unsafe-swiftshader`, defined once as `RENDER_BROWSER_ARGS` in
   [`render-browser.ts`](../packages/execution-runtime/src/render-browser.ts) (profile
   `chromium-software-2`). Verified in CE0 on Chromium 151.0.7922.34:
   - `--disable-gpu` reproduces the historical headless default byte for byte, for both
     Canvas 2D and WebGL, across repeated launches.
   - `--use-angle=swiftshader --use-gl=angle` must **not** be used: it moves Canvas 2D
     onto GPU rasterisation over SwiftShader, which changed a Canvas 2D probe by up to
     4 levels on 241,344 of 1,048,576 channels.
   - `--enable-unsafe-swiftshader` keeps WebGL available where Chromium no longer falls
     back to SwiftShader automatically; it did not change output on 151.
   - Canvas 2D output cannot be identified from the WebGL renderer string alone, so
     the probe also hashes a fixed Canvas 2D and WebGL drawing (`rasterFingerprint`).
   - Profile version 2 probes a fresh Canvas 2D context with export's `{ alpha: false }`
     attributes and one readback. This fixes detection of GPU rasterisation without
     changing the launch flags or pinned frame pixels. CE0 baseline and timing files
     retain their recorded version 1 identity.
2. Before rendering, export reads the WebGL renderer string and fails with a stable
   diagnostic (`export-renderer-mismatch`) if it is not the pinned software renderer.
3. The renderer string, Chromium version and CPU architecture are written to every
   export manifest and are part of cache identity.
4. The Lab shows which renderer the preview uses and labels hardware previews as
   approximate. CE0 measured Apple Metal previews of all 176 acceptance items: 158
   `perceptual`, 13 `near`, 4 `exact`, and one exception, Focus Handoff (PSNR 39.6 dB,
   SSIM 0.987), whose animated Canvas 2D blur rasterises differently on the GPU. Its
   blur moves to the CE6 lens-blur effect, which must bring it within `perceptual`.
   See [`hardware-preview-darwin-arm64.json`](../tests/visual/composition-baselines/hardware-preview-darwin-arm64.json).
5. Speed is recovered through per-layer caching and parallel chunk rendering (CE15),
   not by switching export to hardware. Heavy effects record their SwiftShader cost in
   CE6 so budgets are visible.
6. **Output is exact only within one operating system and CPU architecture.** CE0
   rendered the full fixture set on macOS arm64, Linux arm64 and Linux x86_64 (the
   last under Rosetta) and found two independent causes of difference:
   - **Operating system → text layout.** Chromium shapes and positions text through
     CoreText on macOS and FreeType on Linux. With identical font files, glyph
     advances differ slightly and accumulate along a line (a measured headline drifted
     0 → 6 px across its 20 glyph runs). Frames with text therefore differ beyond every
     tolerance tier (PSNR 22.7–33.6 dB), while frames without text are exact between
     macOS and Linux on arm64.
   - **CPU architecture → blur and resampling rounding.** Skia's vectorised blur and
     image-resampling paths round differently on x86 and ARM. Gradients and
     antialiased shapes are identical; blurred or scaled content differs at the `near`
     level (all cinematic scenes ≥ 54.9 dB). The raster fingerprint changes with it.

   Consequences: baselines, caches and job resume are keyed by `platform-arch`
   (already true for passage caches and the baseline files); chunks of one export must
   come from the same `platform-arch`; and text layout validation (overflow, fit,
   line breaks) can reach different results on different operating systems.

   **Reference environment (Q8, 2026-10-01): Mac first.** While the owner renders on a
   single MacBook, `darwin-arm64` is the reference environment for exports, baselines
   and caches, so previews and final output come from the same machine and match
   exactly. The Linux baselines and the container in
   [`scripts/composition/linux/`](../scripts/composition/linux/) are kept but not
   required by any check. Before a second machine type is supported, decide between
   one canonical environment with other machines as previews (option B) and
   platform-independent text layout (option C, preferred). Adopting C changes text
   output once, including on macOS, so the baselines would be regenerated and checked
   visually.

## Core conventions

Fixed in CE1 (2026-10-01; see the [decision log](#decision-log)) and documented for
authors in the [composition reference](./composition-reference.md#conventions). Do not
change them without a decision-log entry.

| Topic             | Convention                                                                                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coordinates       | Origin top-left of the composition, +x right, +y down, +z away from the viewer. Units are composition pixels.                                                                                                    |
| Rotation          | Degrees, clockwise positive in 2D (matches Canvas and AE). 3D uses X, Y, Z rotation plus orientation, applied Z·Y·X.                                                                                             |
| Anchor point      | In layer-space pixels, as in AE; default is the layer centre for sized layers (solid, image, group, precomp, adjustment) and `[0,0]` otherwise.                                                                  |
| Transform order   | Translate(position) · Rotate · Skew · Scale · Translate(−anchor), where skew is the shear `[[1, tan skewX], [tan skewY, 1]]` of the existing renderer. Parent matrices premultiply.                              |
| Scale             | Percent-free: `1` means 100%.                                                                                                                                                                                    |
| Opacity           | 0–1. Parent opacity does **not** inherit, matching AE; precomp opacity applies to the flattened result; a `group` layer's opacity multiplies into each child.                                                    |
| Colour authoring  | `#RRGGBB` or `#RRGGBBAA` sRGB. Evaluated internally as floating-point RGBA.                                                                                                                                      |
| Compositing space | sRGB-encoded by default for parity with existing renders. Linear-light compositing is an opt-in composition setting introduced in CE6.                                                                           |
| Alpha             | Premultiplied in all render surfaces.                                                                                                                                                                            |
| Time              | Integer composition frames; layer time = `(compFrame − startFrame) / stretch`, as AE (`stretch: 2` plays at half speed; negative reverses), with time remap overriding. In point inclusive, out point exclusive. |
| Keys              | Integer frames in **layer time**, as in AE. No fractional key frames.                                                                                                                                            |
| Frame rates       | 24, 25, 30, 50 and 60 fps. A precomp with a different rate is sampled at the parent's time; a posterize-time effect or layer setting snaps to its own rate.                                                      |
| Identifiers       | `^[a-zA-Z][\w-]*$`, at most 128 characters, unique within their scope; precomps have their own layer namespace. `comp` is reserved for composition properties.                                                   |

## Milestone tracker

| ID   | Deliverable                                     | Phase | Depends on                | Owner                  | Branch                  | Status | Completion evidence                                             |
| ---- | ----------------------------------------------- | ----- | ------------------------- | ---------------------- | ----------------------- | ------ | --------------------------------------------------------------- |
| CE0  | Baseline, parity harness and feature matrix     | A     | —                         | xxibcill (Claude Code) | `codex/composition-ce0` | `[x]`  | [CE0 record](#ce0--baseline-parity-harness-and-feature-matrix)  |
| CE1  | `composition-1` contract and property paths     | A     | CE0                       | xxibcill (Claude Code) | `codex/composition-ce1` | `[x]`  | [CE1 record](#ce1--composition-1-contract-and-property-paths)   |
| CE2  | Pure composition evaluator                      | A     | CE1                       | Codex                  | `codex/composition-ce2` | `[x]`  | [CE2 record](#ce2--pure-composition-evaluator)                  |
| CE3  | Render graph and Canvas 2D reference backend    | A     | CE2                       | xxibcill (Claude Code) | `codex/composition-ce3` | `[~]`  | Implementation started from `codex/composition-ce2` (`273d2c1`) |
| CE4a | Story adapter with visual parity                | A     | CE3                       |                        |                         | `[ ]`  |                                                                 |
| CE4b | Commerce and reusable-component adapter         | A     | CE3, CE6 (effects parity) |                        |                         | `[ ]`  |                                                                 |
| CE4c | Cinematic adapter                               | A     | CE3, CE8                  |                        |                         | `[ ]`  |                                                                 |
| CE4d | Legacy illustrated adapter and old-path removal | A     | CE4a–CE4c                 |                        |                         | `[ ]`  |                                                                 |
| CE5  | Shape layers                                    | B     | CE3                       |                        |                         | `[ ]`  |                                                                 |
| CE6  | WebGL2 backend and effect registry              | B     | CE3                       |                        |                         | `[ ]`  |                                                                 |
| CE7  | Motion blur and time controls                   | B     | CE3                       |                        |                         | `[ ]`  |                                                                 |
| CE8  | 2.5D layers and unified camera                  | B     | CE3                       |                        |                         | `[ ]`  |                                                                 |
| CE9  | Expressions and motion behaviours               | C     | CE2                       |                        |                         | `[ ]`  |                                                                 |
| CE10 | TypeScript builder API and CLI                  | C     | CE1, CE2                  |                        |                         | `[ ]`  |                                                                 |
| CE11 | Lab composition inspector and graph editor      | C     | CE3, CE10                 |                        |                         | `[ ]`  |                                                                 |
| CE12 | Motion linting                                  | C     | CE2                       |                        |                         | `[ ]`  |                                                                 |
| CE13 | Video, image-sequence and audio layers          | D     | CE3, CE7                  |                        |                         | `[ ]`  |                                                                 |
| CE14 | Mesh warp and puppet pins                       | D     | CE6                       |                        |                         | `[ ]`  |                                                                 |
| CE15 | Output formats, caching and parallel rendering  | D     | CE3                       |                        |                         | `[ ]`  |                                                                 |

### Phases and parallel work

- **Phase A — Foundation.** CE0 → CE1 → CE2 → CE3 is strictly sequential. Nothing in
  Phases B–D should start before CE2 is merged, because every later milestone targets
  the evaluator's types.
- **Phase B — Visual vocabulary.** After CE3, CE5, CE6, CE7 and CE8 can run in
  parallel on separate branches. CE4a can run alongside them.
- **Phase C — Authoring.** CE9, CE10 and CE12 need only CE2 and can start early. CE11
  follows CE10.
- **Phase D — Media and output.** CE15 can start after CE3. CE13 and CE14 follow their
  dependencies.

```text
CE0 → CE1 → CE2 → CE3 ─┬─ CE4a ────────────────┐
                 │     ├─ CE5                  │
                 │     ├─ CE6 ─┬─ CE4b         ├─ CE4d
                 │     │       └─ CE14         │
                 │     ├─ CE7 ── CE13          │
                 │     ├─ CE8 ── CE4c ─────────┘
                 │     └─ CE15
                 ├─ CE9
                 ├─ CE10 ── CE11
                 └─ CE12
```

## First implementation slice

**Deliverable:** A hand-written `composition-1` file with a precomp, a parented pair of
layers, a multiply-blended layer and an alpha track matte renders identically in the
Lab and through `pnpm still-shift comp render`, and one existing story fixture renders
through the story adapter with recorded parity.

- [x] CE0 parity harness and baselines for at least one fixture per family.
- [x] CE1 schema for comp, precomp, solid, image, text and null layers; transforms;
      parenting; in/out points; blend modes; alpha mattes. The slice composition is
      [`first-slice.json`](../benchmarks/fixtures/composition/ce1/first-slice.json).
- [x] CE2 evaluator covering those features.
- [x] CE3 Canvas 2D backend covering those features, wired into export.
- [ ] CE4a adapter for `benchmarks/fixtures/story-motion-continuous/access-constraint.json`
      with the parity result recorded.
- [ ] Record commands, results and limitations here before marking the slice complete.

---

## CE0 — Baseline, parity harness and feature matrix

**Outcome:** Measurable baselines exist, so later milestones can prove they preserved
existing behaviour and did not regress performance.

- [x] Select the **acceptance fixture set**:
      [`fixtures.json`](../tests/visual/composition-baselines/fixtures.json) lists 160
      fixtures that expand to 176 render items (passages expand to one item per beat):
  - Story: all seven continuous recipes, two v013 renders kept as stillness references,
    the buffer-press and v2 Unequal Margins variants, the camera calibration pan and
    two passage templates.
  - Passages: `comparison-access`, `linked-comparison` (continuity handoff and reset)
    and the vertical `linked-network`.
  - Acting: the illustrated sequence (text containers, poses, state change) and the
    parcel story's actions and image-model variants (props and registered poses).
  - Motion craft: `buffer-press`, `buffer-press-accelerate`, `supply-ramps`, `gallery`,
    `intent-presets`.
  - Typography: all eight typography fixtures.
  - Commerce: six heroes across formats and locales plus the vertical H01, and all 35
    atom demos (every effect and component atom).
  - Reusable components: 20 components × commerce, isolated and story contexts, plus
    the three component passages (the 63 gallery combinations).
  - Cinematic: all 14 landscape fixtures and the vertical Rising Vista.
  - Legacy illustrated: all six `history-offstage-v2` presets and the vertical variant.
- [x] Add the baseline harness and data. `pnpm composition:baselines` renders **every
      frame** of each item through the export renderer path in the pinned browser and
      stores, per item, a 64-bit prefix of each frame's RGBA SHA-256, a combined
      SHA-256, and 32-pixel thumbnails of the first, middle and last frames. Hashing all
      frames made the planned cue-boundary sampling unnecessary. Full-resolution
      comparison uses live renders, since the old path exists until CE4d.
      Implementation: [`baselines.ts`](../scripts/composition/baselines.ts),
      [`baseline-page.ts`](../scripts/composition/baseline-page.ts); data:
      [`darwin-arm64.json`](../tests/visual/composition-baselines/darwin-arm64.json).
- [x] Define and record tolerance tiers in
      [`frame-tolerance.ts`](../packages/renderer-core/src/frame-tolerance.ts)
      (`frame-tolerance-1`):
  - **exact** — identical RGB;
  - **near** — max per-channel difference ≤ 2 and PSNR ≥ 50 dB;
  - **perceptual** — PSNR ≥ 40 dB and SSIM ≥ 0.99 (Rec. 709 luma, 8×8 windows,
    stride 4).
    Every fixture carries an assigned tier for adapter parity with a justification.
    CE0 assigned `exact` by default and `near` for the 16 Commerce atoms and 7 heroes
    that use pixel or effect-driven motion effects and for Focus Handoff, whose effects
    move to the CE6 registry. On 2026-10-01 the owner set the requirement to "the same
    to the human eye, not pixel-identical", so all 176 items are now `near`
    ([decision log](#decision-log), invariant 5).
- [x] Record render-time baselines in
      [`composition-baseline.json`](../benchmarks/composition-baseline.json): per-item
      average and 95th-percentile frame cost (render plus pixel readback), with machine
      and render environment.
- [x] Write the [feature matrix](#appendix--ce0-feature-matrix). Every feature is mapped
      except single-image depth animation, which is outside CE4 and assigned to the owner
      as [Q7](#open-questions-for-the-owner). Six parity notes for adapter work are
      recorded with it.
- [x] Implement rules 1–3 of the [GPU determinism policy](#gpu-determinism-policy):
      [`render-browser.ts`](../packages/execution-runtime/src/render-browser.ts) pins the
      flags, probes the WebGL renderer and a raster fingerprint, and rejects anything
      else with `export-renderer-mismatch`. The export worker, passage text validation
      and the baseline harness use it. Export result manifests now include
      `renderEnvironment`. Passage cache identity already hashes every
      `execution-runtime` source file with the Chromium version, platform and
      architecture, so the pinned profile is part of it without further change.
- [x] Render the CE0 fixture set on Linux and compare with macOS arm64. Done in the
      pinned Playwright 1.62.1 image with Node 22.23.1
      ([`scripts/composition/linux/`](../scripts/composition/linux/)) on Linux arm64
      (native) and Linux x86_64 (Rosetta). Software rendering is **not** exact across
      operating systems or architectures; policy rule 6 records the causes and
      consequences. Baselines now exist for `darwin-arm64`, `linux-arm64` and
      `linux-x64`, and reports compare each Linux run with macOS at full resolution:
      [`platform-linux-arm64-vs-darwin-arm64.json`](../tests/visual/composition-baselines/platform-linux-arm64-vs-darwin-arm64.json),
      [`platform-linux-x64-vs-darwin-arm64.json`](../tests/visual/composition-baselines/platform-linux-x64-vs-darwin-arm64.json).
- [x] Measure hardware-GPU Lab preview against export for the fixture set and record
      the observed differences. `pnpm composition:baselines --compare-hardware`
      renders the sampled frames (first, last, every 24th) with Metal and compares
      them with the pinned render. Result: every item except Focus Handoff meets
      `perceptual`, so invariant 6 now promises `perceptual` for previews (it
      previously said `near`); Focus Handoff is recorded as an exception in the
      policy. Assigned tiers are adapter-parity targets and are unchanged.

**Acceptance:** The baseline command runs from a clean checkout and reproduces its
own stored values. The feature matrix has no unmapped entries without an owner.

**Verification:** Run the baseline twice in fresh processes; results must be identical.
Launch export with a forced hardware GPU and confirm it fails with
`export-renderer-mismatch`.

**Completion record (2026-10-01).** All seven items are complete. The x86_64 result
was produced under Rosetta and should be confirmed on real x86 hardware (follow-up
below).

- **Branch:** `codex/composition-ce0`, based on `codex/composition-engine-plan`.
- **Environment:** Apple M5 Pro, macOS 26.6.2 arm64, Node 22.23.1, Chromium
  151.0.7922.34, FFmpeg 8.0.1. Raster fingerprint
  `sha256:cf238cf2dddb639b7503248b282588056b2a0e559116a0f906acb1cfc1b166ba`.
- **Baseline:** 176 render items, 36,061 frames, rendered in about 4.5 minutes;
  [`darwin-arm64.json`](../tests/visual/composition-baselines/darwin-arm64.json)
  is 1.2 MB.
- **Reproducibility:** three full renders in separate processes produced identical
  results: the first `--write`, a full `--check` (176 of 176 ok), and a second
  `--write` whose baseline file was byte-identical to the first (`cmp`).
- **Frame cost by family** (render plus readback, average ms/frame; worst item
  95th percentile):

  | Family             | Items | Frames | Avg ms | Worst p95 ms                        |
  | ------------------ | ----- | ------ | ------ | ----------------------------------- |
  | cinematic          | 15    | 2,160  | 8.6    | 29.5 (`cinematic/focus-handoff`)    |
  | commerce           | 7     | 1,752  | 1.3    | 1.6                                 |
  | commerce-atom      | 35    | 8,400  | 6.1    | 144.2 (`commerce/atom-motion-blur`) |
  | legacy-illustrated | 7     | 1,176  | 2.0    | 3.3                                 |
  | motion-craft       | 5     | 698    | 30.3   | 628.9 (`motion-craft/gallery`)      |
  | reusable-component | 70    | 13,440 | 1.3    | 4.6                                 |
  | story              | 14    | 3,264  | 6.3    | 19.4                                |
  | story-acting       | 9     | 2,448  | 5.2    | 6.9                                 |
  | story-passage      | 6     | 1,414  | 7.0    | 12.5                                |
  | typography         | 8     | 1,309  | 2.9    | 9.5                                 |

- **Hardware preview (Metal):** 158 `perceptual`, 13 `near`, 4 `exact`, 1 below
  every tier (Focus Handoff). Worst per family: minimum PSNR 39.6 dB (cinematic, Focus
  Handoff), otherwise 41.4 dB or more; minimum SSIM 0.987 (Focus Handoff), otherwise
  0.9979 or more; isolated edge pixels differ by up to 171 levels.
- **Method finding:** Chromium moves a canvas off the GPU after repeated
  `getImageData` readbacks. A first hardware run that read every frame from one canvas
  reported 175 of 176 items as exact, which was wrong. The harness now renders each
  sampled hardware frame on a fresh canvas and reads it back once. Anyone measuring
  GPU output must do the same.
- **Pinned flags:** see policy rule 1. The obvious `--use-angle=swiftshader` choice
  would have changed existing Canvas 2D output; `--disable-gpu` reproduces the
  historical default exactly.
- **Checks run:** `pnpm check:fast` (schema, boundaries, format, lint, types, 546 unit
  tests), `pnpm test:runtime` (43 tests), `pnpm test:integration` (108 tests including
  the new export-renderer tests), `pnpm test:browser:export`, `pnpm test:golden`, and
  `pnpm test:browser:composition-baselines`. The full `pnpm check` browser matrix was
  not run in this session.
- **Cross-platform (2026-10-01):** Linux runs used
  `mcr.microsoft.com/playwright:v1.62.1-noble` with Node 22.23.1 and pnpm 10.29.3
  installed at their pinned versions, and Ubuntu's FFmpeg 6.1.1 for audio probing only
  (it never touches pixels). Compared with macOS arm64, frames that differed were saved
  at full resolution (the first difference and differing sampled frames, up to six per
  item) and classified:

  | Environment            | Exact | Near | Perceptual | Below every tier | Raster fingerprint |
  | ---------------------- | ----- | ---- | ---------- | ---------------- | ------------------ |
  | Linux arm64 (native)   | 45    | 0    | 9          | 122              | same as macOS      |
  | Linux x86_64 (Rosetta) | 4     | 36   | 15         | 121              | different          |
  - Items without text (all 15 cinematic scenes, most Commerce atoms) are exact on
    Linux arm64. On x86_64 they are `near`, down to 54.9 dB for cinematic scenes.
  - Items with text are below every tier on both, with PSNR as low as 22.7 dB
    (typography) and 24.5 dB (passages). The cause is glyph advance drift, not
    antialiasing.
  - A split probe inside the x86_64 container matched macOS for gradients and
    antialiased shapes and differed from the blur filter onward.
  - A second Linux arm64 container reproduced all 176 items (36,061 frames) exactly,
    so Linux rendering is deterministic within its own environment.
  - Timing: about 6 minutes per full render in the arm64 container, and about
    34 minutes under Rosetta.

- **Limitations:**
  - The `linux-x64` baseline was generated under Rosetta (its file records the CPU as
    `VirtualApple`). SwiftShader and Skia choose code paths by CPU features, so a real
    x86 CPU with AVX may differ again. Confirm on real x86 hardware before relying on
    it, and regenerate there if it differs.
  - Linux runs used Ubuntu's FFmpeg 6.1.1 instead of the pinned 8.0.1, only for audio
    duration probing during passage preparation.
  - The hardware profile is headless Chromium with Metal (ANGLE). It approximates a
    user's desktop Chrome, which may use a different GPU and driver.
  - Only the export path, passage text validation and the baseline harness use the
    pinned launcher. Other test and script launches keep the headless default, which
    CE0 showed is byte-identical today; migrating them is a follow-up.
  - Frame hashes are 64-bit prefixes, sufficient for regression detection, not for
    proving identity against an adversary.

---

## CE1 — `composition-1` contract and property paths

**Outcome:** One validated, versioned data format can describe everything an After
Effects composition can for this project's needs.

### Contract sketch

This sketch reflects the implemented names. The complete contract, field defaults,
limits and diagnostics are in the [composition reference](./composition-reference.md)
and `packages/scene-contract/src/composition/`. Implementation decisions are recorded
in the [decision log](#decision-log).

```ts
type Composition = {
  schemaVersion: "composition-1";
  id: string;
  width: number;
  height: number; // 16–8192
  fps: 24 | 25 | 30 | 50 | 60;
  frameCount: number; // integer ≥ 1
  background?: Color | null; // null = transparent
  colorSpace?: "srgb" | "linear-srgb"; // compositing space, CE6
  motionBlur?: {
    enabled: boolean;
    shutterAngle: number;
    shutterPhase: number;
    samples: number;
  }; // CE7
  assets: Asset[]; // images, fonts, video, audio (sha256-pinned)
  precomps?: Precomp[]; // flat root list; own layer namespaces; depth ≤ 8
  layers: Layer[]; // index 0 = top, as in AE
  markers?: Marker[]; // cues: { id, frame, duration?, label? }
  signals?: Signal[];
  drivers?: CompositionDriver[];
  constraints?: Constraint[]; // per scope, reused from motion-craft
  periodic?: CompositionPeriodic[];
  textAnimators?: TextAnimator[]; // per scope
  camera2d?: Camera2d; // story-compatible camera with layer cameraDepth
  expressions?: Record<PropertyPath, { source: string; ast?: ExpressionAst }>; // CE9: text syntax parsed to AST
  format?: OutputFormat; // reuse output-format.ts
};

type LayerBase = {
  id: string;
  name?: string;
  type:
    | "solid"
    | "image"
    | "text"
    | "shape"
    | "null"
    | "group"
    | "precomp"
    | "adjustment"
    | "camera"
    | "light"
    | "video"
    | "sequence"
    | "audio";
  inPoint?: number; // default 0
  outPoint?: number; // default scope frameCount; comp frames, [in, out)
  startFrame?: number; // layer time 0 in comp frames
  stretch?: number; // nonzero; 2 is half speed, negative reverses
  timeRemap?: Animatable<number>; // precomp or media layers
  parent?: string;
  enabled?: boolean;
  solo?: boolean;
  guide?: boolean;
  threeD?: boolean; // CE8
  transform?: Transform; // fields optional and animatable
  blendMode?: BlendMode;
  trackMatte?: {
    layer: string;
    mode: "alpha" | "alpha-inverted" | "luma" | "luma-inverted";
  };
  masks?: Mask[];
  effects?: EffectInstance[]; // CE6 registry ids
  motionBlur?: boolean; // CE7
  collapseTransforms?: boolean; // precomp
  cameraDepth?: number; // unparented root layers only
  qualification?: string; // keep evidence/qualification metadata from story
  source?: { family: string; id: string }; // adapter provenance for diagnostics
};

type Transform = {
  anchor?: Animatable<Vec2 | Vec3>;
  position?: Animatable<Vec2 | Vec3>;
  scale?: Animatable<Vec2 | Vec3>;
  rotation?: Animatable<number>;
  orientation?: Animatable<Vec3>;
  rotationX?: Animatable<number>;
  rotationY?: Animatable<number>;
  skewX?: Animatable<number>;
  skewY?: Animatable<number>;
  opacity?: Animatable<number>;
  autoOrient?: "off" | "path" | "camera";
};

// An expression attaches to a property through the `expressions` map (keyed by
// property path) and receives the keyed value as `value`, as in AE.
type Animatable<T> = T | { keys: Key<T>[] };
```

`Key<T>` extends the existing `ScalarKeySchema` fields (`easing`, `interpolation`,
`bezier`, `in`, `out`, `smooth`) to vector and colour values, with one recorded CE1
restriction: `in`/`out` accept `ease` on these values, while explicit `speed` is
scalar-only. Separate dimensions support per-component scalar speeds. Grouped
vector/colour speed semantics are deferred to CE2, which must define their units
and representation before enabling them (see the [decision log](#decision-log)).
Vector keys interpolate component-wise unless per-key `spatialIn` / `spatialOut`
tangents are given, in which
case position follows the spatial bezier with the temporal curve controlling progress
along arc length (roving
keys become possible in CE9). Separate dimensions use `{ x, y, z? }` with each
component animatable; keys are integer frames in layer time, bounded to ±216,000.

### Property paths

A single grammar addresses anything animatable, used by drivers, expressions,
diagnostics, the builder and the Lab:

```text
path     := [ precompId "/" ]* layerId "." segment ( "." segment )*
segment  := name | name "[" id "]"
examples: title.transform.position
          title.transform.position.x          (component access)
          bg.effects[glow].radius              (effect by instance id)
          bars.contents[bar1].trimEnd          (shape contents, CE5)
          scene/hero.transform.opacity         (inside a precomp)
          comp.camera.zoom
```

### Checklist

- [x] Add `packages/scene-contract/src/composition/` with schemas for composition,
      assets, markers, all layer types listed above (types that later milestones
      implement may be schema-only here, rejected by a `comp-feature-unavailable`
      diagnostic until then), transforms, keys for scalar/vec2/vec3/colour/discrete/path,
      masks, track mattes and blend modes.
- [x] Blend modes: `normal`, `multiply`, `screen`, `overlay`, `darken`, `lighten`,
      `color-dodge`, `color-burn`, `hard-light`, `soft-light`, `difference`,
      `exclusion`, `hue`, `saturation`, `color`, `luminosity` and `add` (Canvas
      `lighter`).
- [x] Masks: closed bezier path (Animatable); mode `add`, `subtract`, `intersect`,
      `difference` or `none`; `inverted`, `feather` (px), `expansion` (px) and
      `opacity`.
- [x] Implement the property-path parser and resolver with typed results
      (scalar/vec2/vec3/colour/discrete/path) and use it for validation of every path
      reference.
- [x] Add composition driver and periodic schemas whose targets and sources use
      property paths; keep legacy `node.property` aliases and periodic `node` +
      `property` valid. Existing story and commerce schemas remain unchanged.
- [x] Resolve the CE0 [parity notes](#parity-notes-for-adapter-work): an opacity
      inheritance option for group layers, fractional key times or baking for legacy
      millisecond tracks, a composition 2D camera with per-layer depth factor, and an
      image rasterisation option. Record each decision in the decision log.
- [x] Semantic validation: unique ids, parent cycles, matte layer exists and is
      directly above (AE rule) or explicitly referenced, precomp cycles, in < out,
      key frames ascending and inside a sane window, asset hashes present, precomp
      nesting depth ≤ 8 across every precomp graph, total layer count ≤ 2,000.
      Driver, constraint and parent dependencies must be acyclic. Text layers follow
      the supported story typography rules.
- [x] Diagnostic codes prefixed `comp-` with JSON paths; document every code in
      `docs/composition-reference.md` (created in this milestone and extended by each
      later milestone).
- [x] Add the schema to `scripts/generate-corpus-schema.ts` so `pnpm schema:check`
      covers it and a JSON Schema file is generated for editors and AI agents.

**Acceptance:** A hand-written composition exercising every CE1 field validates; each
invalid variant in the test suite fails with the expected code and path.

**Verification:** Unit tests for schema, path grammar (valid, invalid, ambiguous,
precomp-scoped), cycles and limits. Round trip: parse → serialise → parse is identical.

**Completion record (2026-10-01).** CE1 is implemented on
`codex/composition-ce1`, stacked on `codex/composition-ce0`.

- **Contract:** exported from `@still-shift/scene-contract`, with structural and
  semantic validation and stable `comp-*` diagnostics.
- **Fixtures:** `first-slice.json` and `every-field.json` in
  `benchmarks/fixtures/composition/ce1/`; the field-coverage test checks the latter.
- **Reference and schema:** `docs/composition-reference.md` and generated
  `packages/scene-contract/schemas/composition-1.schema.json`, covered by
  `pnpm schema:check`.
- **Original implementation checks:** the full `pnpm check` on the pinned toolchain (Node 22.23.1,
  pnpm 10.29.3, Python 3.12.11, Playwright 1.62.1, FFmpeg 8.0.1) passed in about
  27 minutes: toolchain, schema, boundaries, format, lint and types; 736 unit tests
  (181 new: 99 contract and 82 property-path tests); 43 runtime and 110 integration
  tests; the depth tests; and all 29 browser groups, ending with the CE0 baselines
  (176 of 176 items unchanged). Earlier runs during development used Node 24.16, the
  shell default, which `pnpm check` rejects.
- **Limitations and follow-ups:**
  - Temporal handle `speed` is scalar-only in CE1. Joint vector and colour keys
    accept `ease`; grouped speed semantics are deferred to CE2 because one scalar
    slope has no defined interpretation for spatial vectors or RGBA values.
    Authors can already set independent vector speeds with separate dimensions.
  - Text layers can change text through `state` keys and through typography
    `transition`s. CE3 must define how the two combine (the typography renderer
    currently drives state from transitions).
  - "Key frames inside a sane window" is only the ±216,000 schema bound. Keys outside a
    layer's visible range are allowed, as in AE.
  - Content providers (CE4) are not in the contract yet. CE4a adds them as a layer type
    with a versioned provider id.
  - The generated JSON Schema was checked against both fixtures with a draft-07
    validator already in `node_modules`, which ignores `prefixItems`. No 2020-12
    validator was added as a dependency.
- **Review follow-up:** regression tests cover inherited style names, empty path
  keys, resolved display fonts, motion dependency cycles (including precomp scopes),
  and unused precomp depth. `pnpm check:fast` passed on Node 22.23.1: generated schema,
  package boundaries, formatting, lint, TypeScript and all 771 unit tests (including
  123 composition contract tests). Full rendering was not rerun for these validation
  fixes.
- **Metadata validation follow-up:** nesting is limited to 64 container levels
  below each metadata root before recursive parsing; cyclic values also return a
  structured diagnostic. Regression checks cover root, layer and precomp-layer
  metadata, the depth boundary and shared objects. The metadata and contract unit
  groups passed (161 tests), along with schema freshness, TypeScript and lint on
  Node 22.23.1.
- **Property-path validation follow-up:** legacy alias tables now match only their
  own entries. Seven inherited JavaScript property names return `comp-path-property`
  through direct resolution and through driver targets, sources and sum terms.
  The path, time-dependency and contract unit groups passed (229 tests), along with
  TypeScript and lint on Node 22.23.1.
- **Temporal-speed clarification:** the contract sketch, this record, the decision
  log and the CE2 checklist now agree with the scalar-only restriction documented
  in the reference. Final `pnpm check:fast` passed on Node 22.23.1: schema freshness,
  package boundaries, formatting, lint, TypeScript and all 833 unit tests. Full
  rendering was not rerun for these contract-validation and documentation fixes.

---

## CE2 — Pure composition evaluator

**Outcome:** `evaluateComp(comp, time)` returns every visible layer's resolved state
at any frame, in Node or the browser, with no rendering.

### Evaluation order per frame

1. Map composition time to each layer's local time (start, stretch, time remap).
2. Determine visibility: in/out points, `enabled`, solo.
3. Sample keyed properties (`curve.ts`, extended to vectors and colours).
4. Apply motion-craft layers: signals, periodic motion, drivers, blend by layer order
   (reuse [`motion-craft.ts`](../packages/renderer-core/src/motion-craft.ts) logic, now keyed by property path).
5. Evaluate expressions (CE9; a no-op stub until then).
6. Apply constraints (attach, look-at, follow-path, contact, safe area).
7. Compose world matrices through the parent chain (2D in CE2, 3D in CE8).
8. Apply the camera (CE8) and compute screen-space bounds.
9. Recurse into precomps at their local time.

### Checklist

- [x] `evaluateComp` and `evaluateProperty(comp, path, time)` in
      `renderer-core/src/composition/evaluate/`, with no DOM or Canvas imports
      (enforce with a lint rule or boundary check).
- [x] Vector and colour interpolation, spatial bezier for position with arc-length
      parameterisation (reuse `SpatialPathSchema` semantics).
- [x] Resolve the CE1 temporal-speed follow-up: define grouped vector/colour speed
      units and representation, including spatial arc length and colour channels,
      and record a decision before enabling these handles. CE1 keeps explicit speed
      scalar-only; separate vector dimensions already accept scalar speeds. CE2
      records the units/representation below; enabling grouped handles moves to
      CE9 alongside velocity expressions and spatial speed controls.
- [x] Parenting with AE semantics: position, rotation, scale and skew inherit; opacity
      does not.
- [x] Time stretch, negative stretch (reverse) and time remap.
- [x] Accept fractional evaluation times from the start (parity note 4).
- [x] A constraint reference point separate from the transform anchor, so adapted
      legacy anchor animation keeps its meaning (parity note 7).
- [x] Screen-space bounding boxes for culling and diagnostics (images/solids exact;
      text from measured layout; shapes after CE5).
- [x] Memoise per frame; cache compiled curves by object identity (as `story-camera.ts`
      does with a `WeakMap`).
- [x] Performance budget: evaluating a 200-layer composition must take ≤ 2 ms per frame
      in Node on the reference machine; record the measurement.

**Acceptance:** For random frame orders, evaluation equals sequential evaluation.
Parenting, stretch and remap match hand-computed expectations.

**Verification:** Unit tests for every transform component, parent chains up to depth
16, reversed time, remapped precomps, and a property-based test (random seeks vs forward
play) using a fixed seed.

**Completion record (2026-10-01).** CE2 is complete on its milestone branch; follow-ups are assigned below.

- Branch: `codex/composition-ce2`, based on CE1 `9186720`; tracker start commit
  `3e3e486`; implementation `23876a6`, final corrections `ee06567`. Owner: Codex.
- Public APIs: `evaluateComp`, `evaluateProperty`, `COMPOSITION_EVALUATOR_VERSION`
  (`composition-evaluator-1`) and typed evaluated trees in
  `packages/renderer-core/src/composition/evaluate/`. ESLint prevents DOM/Canvas
  globals, runtime imports and imports of impure renderer helpers in this directory.
- Scalar/vector/colour/path curves and spatial arc tables are cached by object
  identity; layer state and precomp clocks are memoised within each call. Inputs are
  immutable; output state is fresh. Drivers reuse the extracted pure motion-craft
  sampling, blending and lag/map implementation; legacy rendering is unchanged.
- Added `constraintReference` (and scalar component paths), regenerated the JSON
  Schema, and documented timing, group visibility/opacity, scope selection, bounds
  and diagnostics in the composition reference and user guide. The CE2 timing
  fixture covers parent transforms, half-speed/reversed/different-rate precomps and
  remap. Every transform component, depth-16 parents, constraints, masks, fixed-seed
  random seeks, discrete state and input immutability have unit coverage.
- Verified: `pnpm check:fast` (87 files, 880 unit tests), including
  `pnpm exec vitest run tests/unit/composition-evaluate.test.ts --maxWorkers=2`
  after the final reference-point/text-bounds and reused-instance corrections
  (47 evaluator tests passed).
  `pnpm test:browser:composition-evaluator` passed for three fixtures × nine frames:
  timing/visibility and reverse seeks are exact; Node 22 versus Chromium 151 differs
  by at most `1.1102230246251565e-16` in numeric state. The cross-runtime check allows
  `1e-9`; preview/export still use the same browser evaluator and retain invariant 6.
- Performance: `node --import tsx scripts/composition/benchmark-evaluator.ts`, Apple
  M5 Pro, macOS arm64, pinned Node 22.23.1. A 200-layer fixture with depth-16 chains,
  animated transforms, 40 drivers, 40 noise motions and a camera averaged **1.0394
  ms/frame** over five batches of 5,000 frames after 1,000 warm-up frames, while the
  full render suite was running. Batch means: 1.2364, 1.0579, 0.9368, 0.9055, 1.0604
  ms; budget ≤ 2 ms passed. The initial isolated run measured 0.5316 ms/frame.
- Follow-ups: CE3 prepares measured text bounds and text animator geometry through
  the data-only `textBounds` option. Missing measurements warn and produce null
  bounds; bounds-dependent constraints fail explicitly. CE5 owns shape bounds and
  follow-path constraints, still rejected by CE1 validation. CE9 owns grouped
  temporal velocity authoring: a vector/colour velocity tuple must match its value's
  dimensions (pixels/frame, scale factors/frame, normalized RGBA channels/frame);
  spatial speed is a separate scalar in arc-length pixels/frame. Scalar `speed` and
  separated vector dimensions remain available. CE10 must define instance-specific
  paths; repeated precomps evaluate independently, but ambiguous cross-instance
  reads currently produce `comp-evaluation-scope` rather than selecting a host.
  Stateful font measurement and ambiguous grouped slopes would break the pure,
  explicit CE2 interface, which is why those authoring/preparation pieces live in
  their owning milestones. Existing lag cost is proportional to elapsed source
  frames and is outside this no-lag performance fixture.
- Full `pnpm check` passed on the pinned toolchain: schema/boundaries, TypeScript
  and Python formatting/lint, type checking, unit/runtime/integration/depth tests,
  the complete legacy browser/export/authoring/typography matrix and CE0 baselines.
  Runtime: 43 tests; integration: 110 tests; depth: 14 tests. CE0 checked **176 items,
  36,061 frames in 267.11 s**, all exact against `darwin-arm64`; no baselines were
  regenerated. The final `pnpm check:fast` and new browser evaluator group also
  passed after the last CE2 corrections (the full matrix had already started).
  No legacy renderer version bump is required; the new evaluator has its own version.
- PR #26 dependency-chain correction (2026-10-01): layer and precomp-clock tasks
  now run on an explicit work stack, including delayed and lagged source reads.
  Accepted 500-driver chains are covered in both painter orders and independently
  timed reused precomps. The evaluator version is now `composition-evaluator-3`.
  Pinned Node 22.23.1 passed 62 evaluator regressions, the existing motion-craft
  tests, type/lint/format/boundary checks and Node/browser evaluator parity. The
  200-layer benchmark averaged 0.6301 ms/frame on the reference Apple M5 Pro.
- PR #26 signal-cache correction (2026-10-01): immutable signal curves and smooth
  tangents now share the evaluator's object-identity cache. Each evaluation call
  memoises up to 128 source times per signal across root, precomp and historical
  reads. Four regressions cover reuse, fractional lag, legacy numerical parity and
  bounded-cache eviction. Pinned Node 22.23.1 passed `pnpm check:fast` in a clean
  snapshot (88 files, 899 tests), Node/browser evaluator parity and all 176 legacy
  baseline items (36,061 frames, exact; no baselines regenerated). The final
  200-layer benchmark averaged 0.7492 ms/frame against the 2 ms/frame budget.

---

## CE3 — Render graph and Canvas 2D reference backend

**Outcome:** Compositions render correctly, including precomps, blend modes, mattes,
masks and adjustment layers, and export through the existing runtime.

### Design

- A **render graph** built per frame from the evaluated tree: nodes are layer draws,
  precomp surfaces, matte combines, mask applications, effect passes (CE6) and the
  final composite.
- A **backend interface** (`createSurface`, `drawImage`, `drawText`, `drawPath`,
  `composite(src, dst, blendMode, opacity, matrix)`, `applyMask`, `applyMatte`,
  `readPixels`) so CE6 can add WebGL2 without changing the graph.
- A **surface pool** that reuses offscreen canvases by size to avoid per-frame allocation.
- Layers only get their own surface when needed (non-normal blend, matte, mask, effect,
  adjustment, precomp without collapse). Otherwise they draw straight into the parent
  surface, which keeps parity with current output.

### Checklist

- [x] Render graph builder and Canvas 2D backend in `composition/render/`.
- [x] Layer drawing for solid, image (reuse `imagePlacement`/`fit`), text (reuse the
      typography renderer and text animators as a layer content provider), null (no
      draw), group (per-child opacity and clip), adjustment (applies its effects to
      everything below within its bounds).
- [x] Define how a text layer's `state` keys combine with typography `transition`s,
      which also change the displayed state.
- [x] All CE1 blend modes via `globalCompositeOperation`.
- [x] Alpha and inverted alpha mattes via `destination-in`/`destination-out`. Luma
      mattes via a luminance pass (pixel loop in this backend; GPU in CE6).
- [x] Masks as Path2D with `add/subtract/intersect/difference`; feather via blurred
      mask surface; expansion via stroke-and-fill approximation (document the limits).
- [x] Precomps with and without collapsed transforms; nested time.
- [x] Prepare pinned measured text bounds and text animator geometry for the CE2
      `textBounds` data API; preserve missing-measurement diagnostics (CE2 follow-up).
- [x] Culling of layers whose bounds miss the viewport.
- [x] Wire `composition-1` into [`export-page.ts`](../packages/execution-runtime/src/export-page.ts)
      and [`export-worker.ts`](../packages/execution-runtime/src/export-worker.ts) as an
      `ExportableScene`; add engine entry points in `packages/animation-engine`.
- [x] `COMPOSITION_RENDERER_VERSION = "composition-canvas-1.0.0"`, included in manifests
      and cache identities.
- [x] Keep text layout (shaping, advances, line breaks) behind one module, so
      platform-independent text layout (Q8 option C) can later replace the operating
      system's layout without changing the text layer contract.
- [x] Add a browser test group `test:browser:composition` and include it in `pnpm test`.

**Acceptance:** The first-slice composition renders identically in Lab preview and MP4
export. Every blend mode and matte mode matches a reference image generated from the
formulas in the W3C Compositing and Blending specification within the `near` tier.

**Verification:** Pixel tests per blend mode and matte mode on a fixed test chart;
precomp nesting; mask boolean combinations; export transaction tests reused from
`tests/browser/export-worker.ts`.

**Completion record (in progress, 2026-10-01).** Every checklist item is implemented on
`codex/composition-ce3` (owner: xxibcill with Claude Code), based on CE2 `273d2c1`
and merged with the later CE2 review fixes (`4130c27`, `b1697b8`, `50314eb`). The
tracker stays `[~]` until review.

- Commits: tracker start `2b359b2`; contract `ee733ed`; renderer `32c6eab`; export
  `101c014`; browser tests `e3f59fc`; docs `2144a42`.
- **Render graph** (`composition/render/graph.ts`): pure and DOM-free (enforced by
  ESLint, with `backend.ts` and `version.ts`), built per frame from the evaluated tree.
  Ops are direct draws, isolated layers (masks, matte, blend), and adjustment
  re-composites; precomp surfaces nest as draw content. `executeGraph` runs any
  `RenderBackend`. The interface is `createSurface`/`releaseSurface` (pooled by size),
  `clear`, `fillRect`, `drawImage`, `drawText`, `composite`, `applyMask`, `applyMatte`,
  `lerp` and `readPixels`; path drawing for shapes joins with CE5.
- **Canvas 2D backend** (`canvas2d.ts`): every blend mode through
  `globalCompositeOperation`; alpha mattes by `destination-in`/`-out`, luma mattes by
  a pixel pass; masks as `Path2D` combined with `source-over`, `destination-out`,
  `destination-in` and `xor`; feather by blur; expansion by stroke. Image crossfades
  and `rasterize: natural-size` follow the legacy renderer.
- **Text** (`text.ts`): the single shaping/measuring/drawing module. Pinned-font layers
  render through the typography renderer; prepared bounds per state feed the
  evaluator's `textBounds`. The state/transition rule and the other semantics are in
  the [composition reference](./composition-reference.md#rendering-a-composition).
  The typography renderer gained an opt-in raster `baseColor` for animated layer
  colour; legacy rasters leave it unset, so legacy output is unchanged.
- **Contract:** text `size`; `comp-text-pinned-font` and `comp-text-box-size`;
  `every-field.json` gained a `size` on its `textBox` layer; two CE1 tests now pin a
  base font (see the [decision log](#decision-log)). The evaluator also builds content
  for precomps used as track mattes.
- **Export:** `CompositionScene` (`composition-scene-1`) is an `ExportableScene`;
  `loadComposition`/`renderComposition` in the animation engine resolve and verify
  assets and record `COMPOSITION_RENDERER_VERSION` and `COMPOSITION_EVALUATOR_VERSION`
  in the scene manifest (and so in its checksum). `still-shift comp render` is a
  minimal command until CE10.
- **Verification so far** (pinned toolchain: Node 22.23.1, Chromium 151.0.7922.34,
  macOS arm64): `pnpm test:browser:composition` passes in about 36 s:
  - 17 blend modes × 64 cells (opaque and translucent backdrops and sources) against
    the W3C formulas: max Δ2, the `near` tier;
  - 4 matte modes × 8 matte values: max Δ1;
  - 8 mask boolean/inversion/opacity cases, feather ramp and midpoint, positive and
    negative expansion;
  - nested precomps with reversed nested time, clipped unless collapsed; adjustment
    layers (multiply, half-opacity screen); group clips; culling;
  - `every-field.json`, 12 frames, without `comp-text-layout-missing`;
  - first slice: preview pixels identical across fresh page loads; the exported MP4
    decodes identically to the preview's own frames encoded with the export's encoder
    arguments (H.264 at CRF 18 costs 38.6–41.1 dB against the raw preview, which is
    why the check compares encoded frames); repeat exports and PNG versus raw-RGBA
    transports are byte-identical; existing outputs, invalid compositions and
    tampered assets fail and publish nothing.
  - `pnpm check:fast`: schema, boundaries, format, lint, types and 895 unit tests
    (9 render-graph tests, 6 contract tests; a tenth render-graph test followed the merge).
  - The first slice exports 90 frames at 1080p in about 2.1 s: 14.6 ms average and
    17.2 ms p95 per frame, including capture.
  - Full `pnpm check` at `32e4410` passed in 30 min 21 s: schema, boundaries,
    format, lint, types; 895 unit, 43 runtime, 110 integration and 14 depth tests;
    every legacy browser, export, authoring and typography group; the composition
    evaluator and `test:browser:composition` groups; and CE0 baselines, **176 items,
    36,061 frames in 268.62 s, all exact** against `darwin-arm64`. No baseline was
    regenerated and no legacy renderer version changed. (A first run failed only
    because the new worktree's Python environment was created mid-run, which timed
    out three depth-worker tests; they pass on their own.)
  - After merging the CE2 fixes: `pnpm check:fast` (914 unit tests),
    `test:browser:composition-evaluator` and `test:browser:composition` pass. The
    matte-precomp content change bumps the evaluator to `composition-evaluator-4`.
- **Limitations and follow-ups:**
  - Acceptance names the Lab preview. The Lab has no composition page until CE11, so
    CE3 verifies the shared `createCompositionPreview` in the pinned browser. Hardware
    GPU previews of compositions are unmeasured; CE11 measures them against the
    `perceptual` tier.
  - Adjustment layers apply only their blend mode until effects arrive (CE6).
  - Isolated layers use scope-sized surfaces; bounds-sized surfaces and caching belong
    to CE15. Luma mattes read pixels back on the CPU (GPU in CE6).
  - Mask expansion rounds concave corners; feather scales σ by the layer's average
    screen scale, so skewed or non-uniformly scaled layers feather approximately.
  - Text without a pinned font uses the browser's generic faces and is not
    reproducible across machines. Signal-driven text selectors sample layer time.
    Animated layer colour recolours cached rasters (a 16-entry cache per raster).
  - CE4a must check legacy non-typography story text, which the composition draws
    through the generic-font path only when no font is pinned.

---

## CE4 — Family adapters and legacy path removal

**Outcome:** Every existing scene family compiles to `composition-1` and renders
through the new graph with recorded parity. The old per-family branches in the
renderer are then removed.

General rules for all adapters:

- The adapter is a **compiler**, not a renderer: `storyToComposition(scene)` etc. It runs
  the family's existing compile step and translates the result.
- Components that have no general equivalent (for example story flows or component
  annotations) become **layer content providers**: a registered draw function with a
  versioned id, called by the render graph. Record each one in the feature matrix and
  prefer migrating it to shapes/effects later.
- Keep the adapter's output inspectable: `pnpm still-shift comp export-json --scene X`
  writes the compiled composition for debugging.
- Switch a family over only after its fixtures meet their CE0 tolerance tier and their
  evaluated state matches the old path (invariant 5). Until then, a flag
  (`--renderer composition`) selects the new path.
- Each adapter records an evaluated-state comparison per fixture: frame timing and
  visibility identical, positions within 0.001 composition pixels. A fixture moves to
  `perceptual` only with its reason recorded in the manifest's `note` and in the
  completion record.

### CE4a — Story

- [ ] Add content providers to the contract as a layer type with a versioned provider
      id, with schema, reference and diagnostics as in CE1.
- [ ] Decide how a family scene uses a composition-only feature (Q2 freezes the
      family's visual vocabulary): a passage beat that is a `composition-1` file, a
      story scene that references a `composition-1` precomp, or both. Decide with the
      first real case and record it in the decision log.
- [ ] Map roots, groups (to `group` layers with `clip`), images with states and state blends,
      paths (ink/brush line styles as content providers until CE5), text and text
      containers, flows, props attached to hand anchors, poses and actions.
- [ ] Map the story camera to a camera or null-layer parent (2D until CE8), including
      jolts, start/end tangents and ease flags.
- [ ] Map motion-craft layers, signals, drivers, constraints, intent presets and text
      animators to property-path form.
- [ ] Preserve cue markers and qualification metadata as markers/layer metadata.
- [ ] Passage rendering compiles each beat to a composition; handoffs remain in the
      passage engine for now.
- [ ] Parity for all story fixtures in the CE0 set; `story-continuous-quality.ts`
      measurements unchanged.

### CE4b — Commerce and reusable components

- [ ] Map commerce layout, product layers, shadows, floating, detail windows, paths,
      text fits, component state/travel/pin/values/visibility/masks.
- [ ] Commerce effects become CE6 registry effects; parity requires CE6.
- [ ] Parity for all commerce fixtures and all 63 reusable-component combinations.

### CE4c — Cinematic

- [ ] Map depth planes to 3D layers and the cinematic camera (including dolly zoom,
      curved approach and focus handoff) to the CE8 camera.
- [ ] Keep coverage, source-resolution and framing validations, now evaluated on the
      composition camera.
- [ ] Parity for all cinematic fixtures, landscape and vertical.

### CE4d — Legacy illustrated and removal

- [ ] Map the six legacy presets.
- [ ] Switch the Lab and CLI default to the composition path for all families.
- [ ] Remove per-family branches from `illustrated-renderer.ts` and
      `evaluatePreparedNodeAtTime`, leaving family modules as adapters. Target: zero
      `schemaVersion` comparisons in the render path.
- [ ] Freeze the visual vocabulary of the four family schemas (Q2, option C): add a
      schema comment and a contributor note that rendering features land only in
      `composition-1`, while story-level additions (recipes, actions, presets, passage
      features) remain allowed if they compile to existing composition features.
      Mark `illustrated-scene-1` as frozen entirely.
- [ ] Update [user guide](./user-guide.md) and README, including which format to use
      for which kind of work after the freeze.

**Acceptance (each part):** All fixtures in that family meet their tolerance tiers;
Lab preview and export agree; render time is no worse than 1.25× the CE0 baseline.

**Verification:** Family browser tests re-run on the composition path; baseline
comparisons; the full `pnpm check`.

**Completion record:** _to be filled in per part._

---

## CE5 — Shape layers

**Outcome:** Vector graphics are authored and animated procedurally, like AE shape
layers.

- [ ] Shape contents tree: `group` (own transform), `rect` (size, roundness), `ellipse`,
      `polystar` (points, inner/outer radius and roundness), `path` (closed/open cubic
      bezier, up to 1,024 vertices).
- [ ] Paint: `fill` (colour, opacity, fill rule), `stroke` (colour, width, cap, join,
      miter limit, dashes with animatable offset), `gradient-fill` and
      `gradient-stroke` (linear/radial, animatable stops and endpoints).
- [ ] Operators applied in AE order: `trim-paths` (start, end, offset,
      simultaneous/individual), `repeater` (copies, offset, transform, start/end
      opacity), `merge-paths` (union/subtract/intersect/exclude; document the polygon
      clipping library and its licence), `offset-path`, `round-corners`,
      `wiggle-paths` (seeded), `zig-zag`, `pucker-bloat`, `twist`.
- [ ] Path morphing between keyed bezier paths with vertex-count matching and
      first-vertex alignment (extend the existing `PathMorphSchema`).
- [ ] Migrate the `ink` and `brush` line styles ([`ink-path.ts`](../packages/renderer-core/src/ink-path.ts),
      [`brush-path.ts`](../packages/renderer-core/src/brush-path.ts)) to stroke styles on shape paths.
- [ ] Shape bounds for culling and diagnostics.

**Acceptance:** A reference sheet of every primitive and operator renders to a stored
baseline; story connector fixtures can be expressed with shapes instead of content
providers.

**Verification:** Geometry unit tests (trim arithmetic, repeater transforms, boolean
results on known polygons), pixel tests, animated trim/morph sequences.

**Completion record:** _to be filled in._

---

## CE6 — WebGL2 backend and effect registry

**Outcome:** Every layer can carry an effect stack, effects run on the GPU, and the
Canvas 2D backend remains a correctness reference.

### Effect plugin interface

```ts
type EffectDefinition<P> = {
  id: string; // "blur.gaussian"
  version: string; // participates in cache identity
  params: ZodType<P>; // every numeric/colour/point param is Animatable
  expandBounds?(bounds: Rect, params: P): Rect; // e.g. blur radius, drop shadow offset
  renderGpu(ctx: GpuEffectContext, input: Texture, params: P): Texture;
  renderCanvas?(ctx: CanvasEffectContext, input: Surface, params: P): Surface; // optional reference
  requiresLayers?: string[]; // e.g. displacement map source layer
};
```

### Checklist

- [ ] WebGL2 backend implementing the CE3 backend interface: texture per surface,
      FBO pool, premultiplied alpha, all blend modes in shaders, luma mattes,
      feathered masks via distance field or blur.
- [ ] Effect registry with the interface above; effects are addressable by property
      path (`layer.effects[id].param`).
- [ ] Initial effects (each with tests and a reference render):
  - Blur: gaussian (separable), directional, radial/zoom, camera lens blur (shared
    with CE8 depth of field).
  - Light: glow, drop shadow, inner shadow, light sweep, background light.
  - Colour: levels, curves (≤ 16 points), tint, hue/saturation, exposure, brightness/
    contrast, fill, gradient ramp, invert, posterize.
  - Distortion: displacement map, turbulent displace (seeded), transform, corner pin,
    bulge, ripple.
  - Stylise: fractal noise (seeded, animatable evolution), grain (seeded), vignette,
    chromatic aberration, echo.
  - Transitions: linear wipe, radial wipe, venetian blinds, block dissolve (seeded),
    gradient wipe.
- [ ] Port every commerce effect (`motion-blur`, `directional-blur`, `overshoot`,
      `drift`, `height-shadow`, `focus-blur`, `parallax`, `light-sweep`, `glow`, `echo`,
      `grain`, `particles`, `background-light`, `displacement`). Motion-type commerce
      "effects" (overshoot, drift, parallax) become behaviours (CE9) or drivers, not
      pixel effects.
- [ ] Optional linear-light compositing (`colorSpace: "linear-srgb"`).
- [ ] Apply the [GPU determinism policy](#gpu-determinism-policy) to the WebGL2
      backend: export and tests run on pinned SwiftShader; the Lab may use a hardware
      GPU and shows which renderer is active.
- [ ] Avoid avoidable nondeterminism even on software rendering: fixed summation order
      in multi-pass effects, no reliance on driver-specific precision qualifiers, seeded
      noise computed in shaders from integer hashes rather than `sin`-based tricks.
- [ ] Record SwiftShader render cost per effect at 1920×1080 and representative
      parameters, so heavy effects have visible budgets.
- [ ] Backend parity suite: every fixture renders on both backends and meets its tier.
- [ ] Preview parity suite: on a machine with a hardware GPU, Lab preview frames match
      export within each fixture's tier.

**Acceptance:** Every effect is usable on every layer type, including adjustment
layers and precomps. The commerce effect demos meet their tiers through the registry.
The WebGL2 backend renders the CE0 fixture set at least 2× faster than Canvas 2D at
1920×1080 (record numbers).

**Verification:** Per-effect pixel tests at several parameter values, bounds expansion
tests, backend parity suite, repeated-export determinism test.

**Completion record:** _to be filled in._

---

## CE7 — Motion blur and time controls

**Outcome:** Motion reads as filmed rather than stepped, and time can be manipulated as
in AE.

- [ ] Composition-level motion blur (shutter angle 0–720, phase, 2–64 samples) with
      per-layer opt-in, evaluated by deterministic subframe sampling of the evaluator
      and accumulation on the backend.
- [ ] Adaptive sample count by screen-space velocity (cap by setting) — optional, must
      stay deterministic.
- [ ] Replace the commerce-only motion-blur effect with this mechanism (keep an alias).
- [ ] Posterize time (per layer and per precomp), frame blending (for CE13 media), hold
      frames.
- [ ] Loop helpers for precomps: `loop: "cycle" | "pingpong"` with count.
- [ ] Freeze frame (time remap with a single hold key).

**Acceptance:** A fast-moving layer shows correct blur length for its velocity and
shutter angle; blur is zero for a stationary layer; nested precomps inherit blur
correctly.

**Verification:** Analytic tests (blur extent vs velocity × shutter), subframe
determinism, performance budget recorded per sample count.

**Completion record:** _to be filled in._

---

## CE8 — 2.5D layers and unified camera

**Outcome:** One camera model serves every composition, replacing the separate story
and cinematic cameras.

- [ ] 3D layer flag: position z, orientation, X/Y/Z rotation, scale z, depth sorting by
      camera-space z with a stable tie-breaker (layer order), 2D layers composited in
      stacking order between 3D groups as AE does.
- [ ] Camera layer: one-node or two-node (point of interest), zoom/focal length with
      film size, depth of field (focus distance, aperture, blur level) using CE6 lens
      blur, auto-orient toward POI.
- [ ] Perspective projection of image, solid, text and shape layers. Draw as projective
      quads on WebGL2; Canvas 2D reference supports affine-only camera moves and reports
      `comp-feature-backend` for true perspective.
- [ ] Camera shake as a behaviour (CE9) and the existing story jolts mapped to it.
- [ ] Generalise cinematic coverage checks: warn/fail when any frame exposes the
      composition background through the camera frustum on a layer marked
      `coverage: "required"`.
- [ ] Optional lights (point, spot, ambient) are **not** in this milestone; record them
      as a follow-up if needed.

**Acceptance:** Cinematic fixtures (CE4c) and a story fixture reproduce their camera
paths through the unified camera. A test scene demonstrates correct parallax from z
depth alone.

**Verification:** Projection unit tests against hand-computed points, depth-sort tests,
DOF blur amount vs focus distance, coverage-check regression tests.

**Completion record:** _to be filled in._

---

## CE9 — Expressions and motion behaviours

**Outcome:** Authors describe relationships and procedural motion instead of keying
everything, and common motion-design craft (overlap, follow-through, squash) is one
line of intent.

### Expression form

Decided 2026-09-30 (Q3, middle ground): a **short text syntax that parses into a
serialisable, deterministic AST**. Arbitrary JavaScript is not evaluated at render time.

Two kinds of code exist, and only the second is an expression:

- **Authoring-time code** is the TypeScript builder (CE10). It runs once to build the
  composition and may use full JavaScript: loops, functions, data files, seeded random
  generators. Its output is plain data.
- **Render-time code** (expressions) is stored in the composition and evaluated per
  frame. It covers only logic that depends on other animated values during playback.

Authors and agents write expressions as text; the engine validates them by parsing into
an AST, and the AST is what it evaluates, caches by and emits in normalised output. The
original text is kept for display and editing.

```json
{
  "expressions": {
    "shadow.transform.position": {
      "source": "ref('hero.transform.position') + [12, 18]"
    },
    "flag.transform.rotation": { "source": "wiggle(2, 6, 7)" },
    "bar.transform.scale.y": {
      "source": "linear(ref('slider.transform.position.x'), 0, 100, 0, 1)"
    }
  }
}
```

Normalised form of the second example (as written by `comp export-json --normalized`):

```json
{
  "source": "wiggle(2, 6, 7)",
  "ast": {
    "call": "wiggle",
    "args": [{ "num": 2 }, { "num": 6 }, { "num": 7 }]
  }
}
```

**Grammar (deliberately small).**

- Literals: numbers, vectors `[a, b]` / `[a, b, c]`, colours `#RRGGBB[AA]`, `true`,
  `false`, single-quoted strings (only as `ref` paths and enum arguments).
- Operators: `+ - * / %` (component-wise on vectors, scalar broadcast), unary `-`,
  comparisons, `&&`, `||`, `!`, ternary `a ? b : c`, parentheses.
- Identifiers: `time` (seconds), `frame`, `value` (the property's keyed value), `index`,
  `layerCount`, `fps`.
- Component access `.x`, `.y`, `.z`, `.r`, `.g`, `.b`, `.a`; no other member access.
- Calls to registered built-ins only. No assignment, declarations, loops, user
  functions, `this`, globals or property access on arbitrary objects.
- Limits: 2,000 characters and 500 AST nodes per expression.

**Why not raw JavaScript.** The AST cannot perform I/O or read clocks or unseeded random
sources, so export workers can evaluate compositions from agents or other authors
safely. Property dependencies are known before rendering, so evaluation order, cycle
errors and targeted cache invalidation work. Validation failures point at a JSON path
and a character column instead of crashing mid-render. If a need arises that the
built-ins cannot express, add a built-in; do not add an escape hatch to arbitrary code.

### Checklist

- [ ] Text syntax parser producing the AST, with diagnostics carrying the JSON path
      and a 1-based character column (`comp-expression-syntax`,
      `comp-expression-unknown-function`, `comp-expression-type`, `comp-expression-limit`).
- [ ] AST schema, type checker (scalar/vector/colour/bool) and evaluator.
- [ ] Printer from AST back to canonical text, so normalised output and the Lab show a
      consistent form; `parse(print(ast))` must equal `ast`.
- [ ] When both `source` and `ast` are present in an input, validate that they agree
      (`comp-expression-mismatch`).
- [ ] Built-ins: `time`, `frame`, `value`, `index`, `layerCount`, `ref(path)`,
      `valueAtTime(path, t)`, `velocityAtTime(path, t)`, arithmetic and vector ops,
      `clamp`, `mix`, `linear`, `ease`, `easeIn`, `easeOut`,
      `wiggle(freq, amp, seed, octaves)`, `noise(seed, t)`, `random(seed, index)`,
      `loopIn`/`loopOut` with modes `cycle`, `pingpong`, `offset` and `continue`,
      `smooth(width, samples)`, `lookAt`, `length`, `normalize`, `step`, `if`.
- [ ] Dependency graph across properties with cycle detection (`comp-expression-cycle`).
      `valueAtTime` references to earlier times are allowed; same-time cycles are errors.
- [ ] Enable grouped temporal velocity tuples with dimensions/units matching the
      property, plus a distinct spatial speed in arc-length pixels/frame; extend
      schema, sampler and documentation together (CE2 follow-up). Keep scalar
      `speed` unchanged.
- [ ] Re-express signals, drivers and periodic motion as expression sugar internally;
      their schemas remain valid.
- [ ] Behaviours (compile to expressions/drivers, each with parameters and tests):
  - `follow-through` / `overlap` chain: child lags parent motion with spring response
    to parent acceleration (Duik-style).
  - `inertial-bounce` after a keyed stop.
  - `squash-stretch` from velocity along motion direction with volume preservation.
  - `anticipation` before a keyed move.
  - `auto-orient` along motion path.
  - `constant-speed` (roving keys) over a spatial path.
  - `camera-shake` (seeded, decaying).
  - `stagger(layers, offsetFrames, order: forward | reverse | center-out | seeded)`.
- [ ] Bake command: `pnpm still-shift comp bake` converts expressions to keys for
      inspection and for consumers that cannot evaluate expressions.

**Acceptance:** A demo composition where three layers follow a keyed leader with
overlap, a bounce and squash is expressed without per-layer keys and matches its
baked version exactly.

**Verification:** Parser tests (valid, invalid, limits, column positions), print/parse
round trip, evaluator unit tests per built-in, type errors, cycle detection, seek
determinism, bake round trip. A fuzz test with a fixed seed confirms that arbitrary
input either parses to a valid AST or returns a diagnostic, never throws.

**Completion record:** _to be filled in._

---

## CE10 — TypeScript builder API and CLI

**Outcome:** A coder or an agent writes motion as code, with types, autocompletion and
fast feedback, and the result is ordinary `composition-1` JSON.

### API sketch

```ts
import {
  comp,
  image,
  text,
  shape,
  precomp,
  ease,
  seq,
  par,
  stagger,
  at,
} from "@still-shift/motion";

export default comp({ width: 1920, height: 1080, fps: 30, seconds: 8 }, (c) => {
  const house = c.add(image("house", "./art/house.svg").at(420, 620));
  const title = c.add(
    text("The same season.", { style: "heading" }).at(96, 120),
  );
  const bars = ["a", "b", "c"].map((id, i) =>
    c.add(
      shape
        .rect(id, { size: [40, 200] })
        .at(900 + i * 80, 800)
        .anchor("bottom"),
    ),
  );

  c.timeline(
    seq(
      title.fadeIn(12, ease.outCubic),
      par(
        house.moveBy(
          [0, -20],
          24,
          ease.spring({ stiffness: 180, damping: 18 }),
        ),
        stagger(
          bars.map((b) => b.scaleY.from(0).to(1, 18, ease.outBack)),
          4,
        ),
      ),
      at("cue:margin", house.behaviour("inertial-bounce")),
    ),
  );
});
```

### Checklist

- [ ] New package `packages/motion-builder` (`@still-shift/motion`), browser- and
      Node-safe, depending only on `@still-shift/scene-contract`.
- [ ] Constructors for every layer type, fluent transforms, property animation
      (`to`, `from`, `by`, `keys`), easing helpers mirroring `CurveEasingSchema`.
- [ ] Timeline algebra: `seq`, `par`, `stagger`, `delay`, `after(ref, frames)`,
      `at(markerOrCue)`, relative durations in frames or seconds (rounded by the
      documented rule), with conflict detection on the same property.
- [ ] Asset registration computes SHA-256 and dimensions at build time (Node) or
      accepts precomputed hashes (browser).
- [ ] Presets as plain functions (for example `presets.drawOn(path)`); port the story
      intent presets.
- [ ] Define instance-specific property addressing for reused precomps (CE2 follow-up);
      preserve definition-scoped drivers while making cross-instance reads explicit.
- [ ] Source maps: every emitted node records the builder call site; diagnostics show
      `file:line`.
- [ ] CLI: `still-shift comp` subcommands `validate`, `render`, `preview --watch`,
      `lint`, `bake` and `export-json`, accepting `.json` or `.ts` sources.
- [ ] AI reference: generated `docs/composition-reference.md` (schema, property paths,
      diagnostics, built-ins, expression grammar) plus a compact
      `skills/compose-with-still-shift/SKILL.md` with examples; keep both generated from
      the schema and the built-in registry where possible.
- [ ] Builder helpers for expressions (an `expr` tagged template such as `` expr`wiggle(2, 6, 7)` `` and `ref(path)`) that
      emit the text syntax and validate it at build time with source locations.
- [ ] Examples directory with at least eight small programs covering the milestones
      delivered so far.

**Acceptance:** The Unequal Margins continuous prototype is re-authored as a builder
program under 200 lines that compiles to a composition matching the CE4a output within
its tier. An agent following only the skill file can produce a valid composition for a
new brief without schema errors (record the trial).

**Verification:** Type tests (`tsd` or `expectTypeOf`), emitted-JSON snapshot tests,
timeline-algebra unit tests, CLI integration tests.

**Completion record:** _to be filled in._

---

## CE11 — Lab composition inspector and graph editor

**Outcome:** Code-authored motion can be seen, scrubbed and tuned visually, with edits
written back to data.

- [ ] `apps/lab/composition.html` using the shared
      [preview session](../apps/lab/src/preview-session.ts).
- [ ] Layer stack with in/out bars, parenting, blend mode, matte and effect badges;
      solo/hide toggles (view-only unless saved).
- [ ] Keyframe lanes per property path; marker/cue lane; audio waveform when present.
- [ ] Graph editor: value graph and speed graph per property, handle editing that writes
      `in`/`out` temporal handles and bezier values back into the composition.
- [ ] Overlays: bounds, anchor points, motion paths with spatial tangents, safe areas,
      camera frustum (CE8), diagnostics with jump-to-frame.
- [ ] Hot reload from a builder file (`preview --watch`). Builder-sourced compositions
      are read-only in the Lab with "copy edited keys as code" instead of writing JSON.
- [ ] Undo/redo, save, lossless round trip, desktop and phone browser checks as the
      passage workbench does.

**Acceptance:** An author changes an easing handle in the graph editor, sees the
result, saves, and the exported MP4 matches the Lab preview.

**Verification:** Browser tests for editing, undo/redo, save/reload, hot reload and
preview/export parity.

**Completion record:** _to be filled in._

---

## CE12 — Motion linting

**Outcome:** Craft problems are found before render, which makes AI-authored motion
reviewable at scale.

Extend the existing analysers ([`story-quality.ts`](../packages/renderer-core/src/story-quality.ts),
[`story-continuous-quality.ts`](../packages/renderer-core/src/story-continuous-quality.ts),
[`typography-quality.ts`](../packages/renderer-core/src/typography-quality.ts)) to
compositions rather than creating a new analyser.

- [ ] **Stillness:** frozen-pixel runs and frozen-evaluated-state runs per shot, using
      the owner's continuous-motion requirement as the default threshold (configurable).
- [ ] **Velocity discontinuity:** jumps in first derivative at key joins and handoffs
      (reuse camera boundary-velocity logic).
- [ ] **Easing monotony:** share of linear or identical easing across moving properties.
- [ ] **Co-start:** many layers starting on the same frame with identical easing
      (missing overlap).
- [ ] **Reading time:** on-screen time for text vs words, by role.
- [ ] **Framing:** off-canvas, safe-area and coverage violations over time.
- [ ] **Scale/opacity pops:** abrupt single-frame changes not marked as intentional cuts.
- [ ] Report as structured diagnostics with severity and frame ranges; `comp lint`
      exits non-zero on errors; the Lab shows findings on the timeline.

**Acceptance:** Every lint rule has a passing and a failing fixture. The v013 Unequal
Margins render is flagged for stillness and the continuous prototype is not.

**Verification:** Rule unit tests and a lint run across all CE0 fixtures with results
recorded.

**Completion record:** _to be filled in._

---

## CE13 — Video, image-sequence and audio layers

**Outcome:** Compositions mix supplied video clips (including AI-generated ones),
image sequences and sound with stills and graphics.

- [ ] Video layer: SHA-256-pinned file, source frame rate and duration probed with
      ffprobe, time remap/stretch, frame blending from CE7, trimming by in/out.
- [ ] Deterministic decoding: pre-decode the frames each composition needs with FFmpeg
      into a content-addressed cache (keyed by file hash, time mapping, size and pixel
      format) and load them as image frames in the browser. Do not use `<video>`
      element seeking for export. Record whether WebCodecs is acceptable for preview.
- [ ] Image-sequence layer (`frame_%04d.png` with explicit count and rate).
- [ ] Audio layers: gain/pan (Animatable), fades, time remap, mixed with the existing
      [passage audio](./passage-audio.md) pipeline in FFmpeg; waveform data for CE11.
- [ ] Colour handling: detect source colour metadata and convert to the composition
      space; reject unsupported inputs with a diagnostic.
- [ ] Limits: maximum duration, resolution and total decoded-cache size, configurable.

**Acceptance:** A composition combining a video clip with time remap, a still with
motion and a lower-third shape layer exports with correct sync (± 0 frames) and
matching audio.

**Verification:** Frame-accurate tests on a synthetic video with burnt-in frame numbers,
variable-frame-rate rejection or conversion tests, cache reuse tests, audio sync test.

**Completion record:** _to be filled in._

---

## CE14 — Mesh warp and puppet pins

**Outcome:** Still artwork bends, squashes and gestures without new poses, which is the
core acting tool for a still-image engine.

- [ ] Bezier mesh warp effect (grid of animatable control points, 2×2 to 8×8).
- [ ] Puppet: triangulate the layer's alpha outline (document the triangulation library
      and licence), place pins (Animatable positions), solve deformation with an
      as-rigid-as-possible or moving-least-squares rigid solver. Choose one, record the
      decision, and keep it deterministic (fixed iterations, no parallel reduction).
- [ ] Starch regions (stiffer areas) and overlap order (which parts draw in front).
- [ ] Pins can be driven by constraints and expressions (for example a hand pin
      attached to a prop), integrating with [character actions](./story-acting.md).
- [ ] WebGL2 rendering of textured meshes; Canvas 2D reference renders triangle-by-
      triangle with affine texture mapping.

**Acceptance:** A demo bends a character arm and squashes a house using pins only;
repeated exports are identical; deformation stays free of triangle flips for the demo's
pin ranges.

**Verification:** Solver unit tests (rigid motion is preserved, pinned points hit their
targets), flip detection, pixel tests on both backends.

**Completion record:** _to be filled in._

---

## CE15 — Output formats, caching and parallel rendering

**Outcome:** Output fits professional pipelines, and long compositions render quickly.

- [ ] Transparent composition backgrounds carried through export.
- [ ] First formats (Q4: both audiences, delivered together): ProRes 4444 with alpha
      and PNG sequence (8/16-bit) for editors; H.264 and HEVC 10-bit for social
      delivery. All tagged BT.709. Extend the ffprobe verification in
      `export-worker.ts` per format.
- [ ] Then ProRes 422 HQ and WebM VP9 with alpha.
- [ ] Frame rates up to 60 fps; arbitrary sizes within limits.
- [ ] Per-layer and per-precomp caching: static subtrees render once per export and are
      reused, keyed by content hash, backend version and evaluated state.
- [ ] Parallel chunked export: split the frame range across N browser pages, encode
      chunks and concatenate losslessly (or pipe in order); integrate with the existing
      transactional publication and cancellation.
- [ ] Render statistics in the result manifest (ms/frame per layer type, cache hits).

**Acceptance:** A two-minute composition renders at least 3× faster with 4 workers than
with 1, with identical output. Each new format passes ffprobe verification and a
decode-back pixel check.

**Verification:** Format tests, alpha round-trip test, chunk-boundary parity test
(frames on both sides of a boundary), cancellation during parallel export.

**Completion record:** _to be filled in._

---

## Definition of done

A milestone is complete when **all** of the following hold:

1. Every checklist item is ticked or moved to a follow-up with a recorded reason.
2. Acceptance and Verification sections are satisfied and their commands and results
   are recorded in the milestone's completion record.
3. `pnpm check` passes on the pinned toolchain ([verification tiers](./verification.md)).
   New browser groups are added to `pnpm test`.
4. CE0 baselines still pass, or intentional changes are documented with regenerated
   baselines and the reason.
5. `docs/composition-reference.md` covers new schema fields, property paths, diagnostics
   and built-ins; the [user guide](./user-guide.md) is updated for anything user-visible.
6. Renderer, backend or effect versions were bumped if output changed.
7. The tracker row lists owner, branch, status `[x]` and evidence links.

## Test and fixture strategy

- **Unit (`tests/unit`)**: schemas, path grammar, evaluator, expression runtime,
  geometry, timeline algebra. No DOM, no processes.
- **Browser (`tests/browser`)**: pixel tests per backend, parity against CE0 baselines,
  Lab flows. One group per milestone, named `test:browser:composition-*`.
- **Runtime/integration**: export formats, media decode cache, parallel export,
  cancellation.
- **Fixtures**: small synthetic compositions live in
  `benchmarks/fixtures/composition/`, one directory per milestone. Existing family
  fixtures are acceptance fixtures and must not be edited to make a test pass.
- **Reference renders** for effects and blend modes are generated from documented
  formulas, not from the implementation under test.

## Risks

| Risk                                                             | Impact                                                                                          | Mitigation                                                                                                                                                                                 |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GPU output differs across machines                               | Breaks determinism and cache identity                                                           | [GPU determinism policy](#gpu-determinism-policy): export pinned to SwiftShader, renderer check, identity in manifests; hardware preview within tolerance; cross-architecture check in CE0 |
| Adapter parity is harder than expected (hidden family behaviour) | CE4 stalls; two render paths coexist for long                                                   | Feature matrix in CE0; content providers as an escape hatch; flag-gated switch per family                                                                                                  |
| Scope creep toward a GUI editor                                  | Lab work displaces engine work                                                                  | CE11 is inspection plus light edits; code remains primary                                                                                                                                  |
| Expression language too weak or too strong                       | Authors blocked, or unsafe/nondeterministic output                                              | Text syntax parsed to AST; full JavaScript at authoring time in the builder; add built-ins for new needs; bake to keys                                                                     |
| Text layout differs between operating systems (CE0)              | Text fit, overflow and line-break decisions may pass on macOS and fail on Linux, or the reverse | Q8: `darwin-arm64` is the reference while the owner uses one MacBook; decide between a canonical environment and platform-independent text before supporting a second machine type         |
| Software export rendering is too slow for heavy effects          | Long renders for effect-heavy or long compositions                                              | Per-effect SwiftShader budgets in CE6; per-layer caching and parallel chunks in CE15                                                                                                       |
| Performance regression from per-layer surfaces                   | Slower renders than today                                                                       | Surfaces only when needed; culling; budgets in CE0/CE2/CE6; caching in CE15                                                                                                                |
| Media decode nondeterminism                                      | Video frames drift between runs                                                                 | FFmpeg pre-decode with content-addressed cache; no element seeking in export                                                                                                               |
| Third-party geometry libraries (boolean ops, triangulation)      | Licence or determinism problems                                                                 | Record library, version and licence in the decision log before adoption                                                                                                                    |

## Decision log

| Date       | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Reason                                                                                                                                                                                                                                          | Superseded by  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 2026-09-30 | Introduce one `composition-1` contract; existing families become compilers into it                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Removes per-family duplication; every later feature is built once                                                                                                                                                                               |                |
| 2026-09-30 | Keep Canvas 2D as the reference backend and add WebGL2 as the production backend behind one interface                                                                                                                                                                                                                                                                                                                                                                                                                               | Preserves parity with existing output while enabling GPU effects and performance                                                                                                                                                                |                |
| 2026-09-30 | Expressions are a serialisable AST; JavaScript ergonomics live in the builder                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Determinism, sandbox safety in export workers, easy validation of agent output (see Q3)                                                                                                                                                         | Q3 entry below |
| 2026-09-30 | JSON remains the serialisation format; the TypeScript builder is the primary code surface                                                                                                                                                                                                                                                                                                                                                                                                                                           | Keeps compositions portable and inspectable; gives coders and agents types                                                                                                                                                                      |                |
| 2026-09-30 | Video frames are pre-decoded with FFmpeg for export                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Browser media seeking is not frame-accurate or deterministic enough for export                                                                                                                                                                  |                |
| 2026-09-30 | Q1: hybrid GPU policy — export, caches and tests pinned to SwiftShader; Lab preview may use a hardware GPU within tolerance                                                                                                                                                                                                                                                                                                                                                                                                         | Exact reproducible output where caches, resume and chunking depend on it; fast interactive preview. Formalises what headless export already does by default                                                                                     |                |
| 2026-09-30 | Q3: expressions are written in a small text syntax and parsed into a validated AST; no arbitrary JavaScript at render time                                                                                                                                                                                                                                                                                                                                                                                                          | AE-like brevity for authors and agents, with safety, known dependencies and precise diagnostics. Full JavaScript remains available at authoring time in the builder                                                                             |                |
| 2026-10-01 | Adapter parity means "the same to the human eye, not pixel-identical" (owner). Default adapter tier is `near` for all 176 CE0 items; `perceptual` only per fixture with a recorded reason; evaluated state must match the old path (timing and visibility identical, positions within 0.001 px); the new engine's own export stays exact                                                                                                                                                                                            | Invisible differences in antialiasing, blur or resampling no longer block CE4, while `near` keeps a margin against differences that encoding or other displays could reveal, and state parity catches motion jitter that per-frame metrics miss |                |
| 2026-10-01 | Q2: option C. After CE4d the four family schemas stay accepted and keep rendering through adapters, but their visual vocabulary is frozen: effects, shapes, masks, blend modes, 3D, motion blur and mesh warp exist only in `composition-1` and the builder. Story recipes, character actions, commerce presets and passage features may still grow if they compile to existing composition features. Story stays the main front end, commerce keeps its presets, cinematic is mostly frozen, legacy illustrated is frozen entirely | Each visual feature is built once, as the plan intends, while the families keep the high-level authoring verbs that `composition-1` deliberately does not model                                                                                 |                |
| 2026-10-01 | Q4: both. CE15 delivers alpha formats for editors (ProRes 4444, PNG sequence) and social delivery formats (H.264, HEVC 10-bit) together; ProRes 422 HQ and WebM VP9 alpha follow                                                                                                                                                                                                                                                                                                                                                    | The product needs finished social videos and assets that editors can composite                                                                                                                                                                  |                |
| 2026-10-01 | Q8: Mac first. `darwin-arm64` is the reference environment for exports, baselines and caches while the owner uses a single MacBook. Linux baselines and the container are kept but not required. Before supporting a second machine type, decide between a canonical environment (B) and platform-independent text layout (C, preferred)                                                                                                                                                                                            | With one machine, previews and final output already match exactly, so the cross-platform cost can wait until it is needed. C best meets the "same to the human eye" requirement across machines                                                 |                |
| 2026-10-01 | CE1, parity note 1: add a `group` layer type whose opacity multiplies into each child and which can clip children to its bounds                                                                                                                                                                                                                                                                                                                                                                                                     | Legacy groups apply opacity per child, which neither AE parenting (no inheritance) nor a precomp (flattened) reproduces; a named type keeps AE semantics intact elsewhere                                                                       |                |
| 2026-10-01 | CE1, parity note 2: no fractional key frames; CE4d bakes legacy millisecond tracks to one key per integer frame                                                                                                                                                                                                                                                                                                                                                                                                                     | Keeps invariant 1. Baking is exact because legacy scenes are only sampled at integer frames; CE4d must confirm this against the CE0 baselines                                                                                                   |                |
| 2026-10-01 | CE1, parity note 3: composition-level `camera2d` (story camera semantics) applied by per-layer `cameraDepth` until CE8                                                                                                                                                                                                                                                                                                                                                                                                              | The story camera scales each root by its depth, which a parent transform cannot express; reusing its curve keeps adapted story motion exact                                                                                                     |                |
| 2026-10-01 | CE1, parity note 5: image layers take `rasterize: "draw" \| "natural-size"`                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `motionGrammar: "v2"` pre-rasterises SVGs at natural size; without the option, output would depend on clipping                                                                                                                                  |                |
| 2026-10-01 | CE1: transforms use `skewX`/`skewY` (shear `[[1, tan skewX], [tan skewY, 1]]`) instead of AE `skew`/`skewAxis`                                                                                                                                                                                                                                                                                                                                                                                                                      | The existing renderer's two-axis shear cannot be expressed by AE's skew and axis in general; AE-style skew can be builder sugar later                                                                                                           |                |
| 2026-10-01 | CE1: layer time = `(compFrame − startFrame) / stretch`, and keys are in layer time; corrects the original `× stretch` convention                                                                                                                                                                                                                                                                                                                                                                                                    | Matches AE, where a stretch of 200% plays at half speed and moving a layer moves its keys                                                                                                                                                       |                |
| 2026-10-01 | CE1: separate dimensions are the value form `{ x, y, z? }`; spatial tangents are per-key `spatialIn`/`spatialOut`                                                                                                                                                                                                                                                                                                                                                                                                                   | Adapters need independently keyed x and y; a value form keeps each property self-describing, and per-key tangents match the existing motion-craft fields                                                                                        |                |
| 2026-10-01 | CE1: precomps are a flat list on the root with their own layer namespace; property-path prefixes are precomp ids                                                                                                                                                                                                                                                                                                                                                                                                                    | Avoids duplicated nested definitions when a precomp is reused, and lets paths and diagnostics name a precomp once                                                                                                                               |                |
| 2026-10-01 | CE1: composition drivers and periodic motion use property paths in new schemas; story and commerce motion schemas stay unchanged                                                                                                                                                                                                                                                                                                                                                                                                    | Family schemas remain as written for CE0 parity, and legacy `node.property` targets stay valid inside compositions as aliases                                                                                                                   |                |
| 2026-10-01 | CE1: explicit temporal handle `speed` remains scalar-only; vector and colour keys accept `ease`. Grouped speed semantics are deferred to CE2; separate vector dimensions already support scalar speeds                                                                                                                                                                                                                                                                                                                              | A scalar slope has no defined mapping to grouped vectors, spatial arc length or RGBA values. Keep the validated contract explicit until CE2 defines the units and representation                                                                |                |
| 2026-10-01 | CE2: keep scalar temporal `speed` in property units/frame; future grouped velocity is a matching vector/RGBA tuple, while spatial speed is a distinct arc-length pixels/frame scalar. Enabling those new forms moves to CE9                                                                                                                                                                                                                                                                                                         | Component velocities and arc speed are different quantities; preserve validated CE1 authoring until each has an explicit field and sampler                                                                                                      |                |
| 2026-10-01 | CE2: measured text bounds enter through immutable data; CE3 prepares font layout and text animator geometry                                                                                                                                                                                                                                                                                                                                                                                                                         | Keeps Node/browser evaluation pure and avoids guessed glyph bounds; missing measurements are diagnosed                                                                                                                                          |                |
| 2026-10-01 | CE2: reused precomps evaluate per instance; ambiguous scoped reads fail until CE10 adds instance addressing                                                                                                                                                                                                                                                                                                                                                                                                                         | CE1 paths identify definitions, so choosing an arbitrary host would make sampled time ambiguous                                                                                                                                                 |                |
| 2026-10-01 | CE3: text layers gain an optional `size` (the `textBox` wrap box). Spans, decorations, transitions, text animators and `textBox` require a pinned base font (`comp-text-pinned-font`, `comp-text-box-size`)                                                                                                                                                                                                                                                                                                                         | The typography renderer shapes with the base font's metrics and wraps `textBox` to the box width; CE1 accepted a span-only pinned font that cannot render                                                                                       |                |
| 2026-10-01 | CE3: text transitions, decoration reveals, counts and text animators sample layer time. `state` keys choose the text until the first transition starts; then the latest started transition decides (the story typography rule)                                                                                                                                                                                                                                                                                                      | Keys are in layer time, so typography moves with its layer; reusing the story rule keeps CE4a parity                                                                                                                                            |                |
| 2026-10-01 | CE3: track mattes ignore the source's `enabled`, solo and blend mode but honour its in/out points; luma mattes use the CSS Masking luminance of the premultiplied colour. The evaluator builds content for precomps used as mattes                                                                                                                                                                                                                                                                                                  | AE behaviour, and a published formula for the reference renders                                                                                                                                                                                 |                |
| 2026-10-01 | CE3: masks combine as `m = opacity × coverage` with add `a+m−am`, subtract `a(1−m)`, intersect `am`, difference `a+m−2am`; a leading subtract or intersect starts from the whole layer. Feather is a Gaussian with σ = feather/2; expansion is a round-joined stroke                                                                                                                                                                                                                                                                | Matches AE at full opacity and maps exactly onto Canvas `source-over`, `destination-out`, `destination-in` and `xor`; approximation limits are documented                                                                                       |                |
| 2026-10-01 | CE3: adjustment layers composite `below·(1−k) + adjusted·k`; `normal` ones without effects are skipped. Collapsed precomps draw no background and multiply host opacity into each layer                                                                                                                                                                                                                                                                                                                                             | AE semantics, including blend modes on adjustment layers without effects                                                                                                                                                                        |                |
| 2026-10-01 | CE3: preview and export canvases are opaque; transparent backgrounds render over black until alpha formats (CE15)                                                                                                                                                                                                                                                                                                                                                                                                                   | Matches legacy export and gives MP4, which has no alpha, one deterministic flattening                                                                                                                                                           |                |
| 2026-10-01 | CE3: export/preview identity is proven by encoding the preview's frames with the export's encoder arguments and requiring identical decoded frames                                                                                                                                                                                                                                                                                                                                                                                  | H.264 at CRF 18 costs 38–41 dB against raw frames on fine line art, so tolerances against raw frames cannot separate codec loss from renderer differences                                                                                       |                |

## Open questions for the owner

| ID  | Question                                                                                                                                                                                                                                                                                                                                       | Needed by                                                       | Answer                                                                                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | GPU determinism: pin export to a software GL path (SwiftShader, slower but reproducible), or accept `near`-tier tolerance across GPUs with hardware rendering?                                                                                                                                                                                 | CE0                                                             | 2026-09-30: hybrid (option C). See [GPU determinism policy](#gpu-determinism-policy)                                                                                                                                                                                      |
| Q2  | Once adapters reach parity, should the four family schemas be frozen (still accepted, no new features) so new work targets `composition-1` only?                                                                                                                                                                                               | CE4d                                                            | 2026-10-01: option C — freeze the families' visual vocabulary; story-level features may still grow. See [decision log](#decision-log) and CE4d                                                                                                                            |
| Q3  | Is an AST expression language acceptable, or must compositions accept raw JavaScript expressions (with a sandbox) for AE-style familiarity?                                                                                                                                                                                                    | CE9                                                             | 2026-09-30: text syntax parsed into an AST; no raw JavaScript. See [CE9 expression form](#expression-form)                                                                                                                                                                |
| Q4  | Which output formats matter first: alpha for editors (ProRes 4444/PNG), social delivery (H.264/HEVC), or both?                                                                                                                                                                                                                                 | CE15                                                            | 2026-10-01: both — alpha formats for editors and social delivery formats ship together. See CE15                                                                                                                                                                          |
| Q5  | Priority between mesh deformation (CE14) and video layers (CE13) for the faceless-video product goal.                                                                                                                                                                                                                                          | Phase D                                                         |                                                                                                                                                                                                                                                                           |
| Q6  | Should lights and 3D shading be planned after CE8, or is 2.5D without lighting sufficient?                                                                                                                                                                                                                                                     | After CE8                                                       |                                                                                                                                                                                                                                                                           |
| Q7  | Single-image depth animation (depth presets and flat editorial presets) uses a separate WebGL renderer. Should it become a composition layer type (for example a `depth-image` layer), or stay a separate path?                                                                                                                                | CE4d                                                            |                                                                                                                                                                                                                                                                           |
| Q8  | Output is exact only within one operating system and CPU architecture (policy rule 6). Should one canonical render environment, for example the Linux container in `scripts/composition/linux/` on a fixed architecture, be used for CI, caches shared between machines and final exports, with macOS renders treated as development previews? | Before shared caches or CE15 parallel rendering across machines | 2026-10-01: Mac first — `darwin-arm64` is the reference environment for now; before supporting a second machine type, decide between B (canonical environment) and C (platform-independent text, preferred). See [GPU determinism policy](#gpu-determinism-policy) rule 6 |

## Appendix — AE feature coverage map

| AE feature                            | Today                             | Milestone   |
| ------------------------------------- | --------------------------------- | ----------- |
| Compositions, layers, in/out, stretch | Per-family nodes, no in/out model | CE1–CE3     |
| Precomps, collapse transforms         | Groups only                       | CE1–CE3     |
| Parenting, null objects               | `parent` on nodes; no null layer  | CE1–CE2     |
| Blend modes                           | Ad hoc, commerce only             | CE3         |
| Track mattes, masks                   | Component masks, group clip       | CE3         |
| Adjustment layers                     | None                              | CE3, CE6    |
| Shape layers and operators            | Polylines, rect; trim paths       | CE5         |
| Effects stack                         | Commerce effect list              | CE6         |
| Motion blur                           | Commerce effect                   | CE7         |
| Time remap, posterize time, loops     | None                              | CE7         |
| 3D layers, camera, depth of field     | Story 2D camera; cinematic planes | CE8         |
| Expressions                           | Drivers, signals, noise           | CE9         |
| Duik-style behaviours                 | Constraints; intent presets       | CE9         |
| Graph editor                          | Passage timeline only             | CE11        |
| Text animators                        | Implemented                       | CE3 (reuse) |
| Video, image sequence, audio layers   | Passage audio only                | CE13        |
| Puppet tool, mesh warp                | Pose swaps                        | CE14        |
| Render queue formats, alpha           | 8-bit H.264                       | CE15        |
| Scripting (ExtendScript equivalent)   | JSON only                         | CE10        |
| Motion quality review                 | Story analysers (ahead of AE)     | CE12        |

## Appendix — CE0 feature matrix

Every scene feature in the four current families, mapped to its `composition-1` form and
the milestone that provides it. Recorded 2026-09-30 against the contracts in
`packages/scene-contract/src/`. Adapters (CE4) translate **compiled** render scenes, so
authoring verbs that the existing compilers already expand into keyframes need no new
primitive; they are listed as "compiled".

**Interim content provider** means a registered, versioned draw function called by the
render graph (see CE4). It preserves exact output until the feature can be expressed
with general primitives; the "Target" column names that later form.

### Scene structure and nodes

| Feature                                                    | Today                                                                | `composition-1` form                                                          | Milestone          |
| ---------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------ |
| Scene size, fps, duration, background                      | `PreparedSceneFieldsSchema`, `frameCount`                            | Composition `width`, `height`, `fps`, `frameCount`, `background`              | CE1                |
| Format variants (landscape/vertical, commerce profiles)    | `formats`, `format`, cinematic vertical fixtures, commerce `profile` | One composition per resolved variant; the adapter selects the variant         | CE4                |
| Image node, `fit`, `crop`                                  | `prepared.ts` image                                                  | Image layer with `fit` and source `crop`                                      | CE1–CE3            |
| Image states and state switch                              | `states[]`, `state` track, component state cuts                      | Image layer `sources[]` plus hold-keyed `state` property                      | CE1–CE3            |
| State crossfade (`stateFrom`/`stateMix`)                   | Renderer blends with `lighter` on a scratch canvas                   | Image layer `stateMix` property rendered by the same two-pass blend           | CE3                |
| Pose registration and anchors per state                    | `registration`, `anchors` on image states                            | Per-source registration offset and named anchor points on the image layer     | CE1                |
| SVG pre-rasterisation (`motionGrammar: "v2"`)              | Assets rasterised once at natural size                               | Image source option `rasterize: "natural-size"`                               | CE1, CE3           |
| Rect node (`fill`, `stroke`, `radius`)                     | `prepared.ts` rect                                                   | Solid layer when unstroked and square; otherwise shape layer `rect`           | CE3 (interim), CE5 |
| Path node: uniform, `ink`, `brush` line styles             | `ink-path.ts`, `brush-path.ts`                                       | Interim content provider `story-path`; target shape path with stroke styles   | CE4a, CE5          |
| Path `endArrow`, `gap`, `pinch`, `reveal`                  | Path drawing in `illustrated-renderer.ts`                            | Interim provider; target stroke end cap, trim paths and width profile         | CE4a, CE5          |
| Text node, fonts, `textBox`, `textLayout`, `align`, states | `typography-renderer.ts`, `text-layout.ts`                           | Text layer whose content is drawn by the existing typography renderer         | CE3                |
| Group node with `clip`                                     | `group` with optional clip                                           | Group layer (see parity note 1) with a rectangular mask when clipped          | CE1, CE3           |
| `parent` hierarchy                                         | `parent` on every node                                               | Layer `parent`, plus opacity inheritance option (parity note 1)               | CE1–CE2            |
| `initialState`                                             | Story `initialState`                                                 | Initial property values                                                       | CE1                |
| Text containers (caption, speech, thought, tail side)      | `story-acting.ts`, `text-container.ts`                               | Interim content provider `text-container`; target shape layer plus text layer | CE4a, CE5          |

### Timing and animation

| Feature                                                                 | Today                                                 | `composition-1` form                                        | Milestone    |
| ----------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- | ------------ |
| Keyed tracks (`x`, `y`, `scaleX/Y`, `rotation`, `opacity`, `reveal`, …) | `prepared-scene.ts` tracks, `frame-tracks.ts`         | Keyed properties addressed by property path                 | CE1–CE2      |
| Legacy millisecond key times                                            | Legacy tracks keyed in milliseconds                   | Keys at fractional frames (parity note 2)                   | CE1, CE4d    |
| Curve interpolation, temporal handles, springs, overshoot               | `curve.ts`, `motion-easing.ts`                        | Same key fields, extended to vectors and colours            | CE1–CE2      |
| Story moves, emphasis, entrances (8 verbs, `parts`), exits (4 verbs)    | `story-motion.ts`, `story-choreography.ts`            | Compiled to keys by the existing story compiler             | CE4a         |
| Story recipes (7 plus `generic`)                                        | `StoryRecipeSchema`                                   | Compiled                                                    | CE4a         |
| Legacy presets (6)                                                      | `IllustratedRecipeSchema`                             | Compiled                                                    | CE4d         |
| Commerce presets (H01, H03, H04, A01) and component demos               | `commerce-catalog.ts`, `buildCommerceScene`           | Compiled                                                    | CE4b         |
| Commerce `events`                                                       | `CommerceEventSchema`                                 | Keys                                                        | CE4b         |
| Legacy path followers                                                   | `followers`                                           | `follow-path` constraint with keyed progress                | CE2, CE4d    |
| Motion layers (`action`/`response`/`current`/`carrier`), blend, weight  | `motion-craft.ts`                                     | Retained, keyed by property path                            | CE2          |
| Signals, drivers, periodic motion                                       | `motion-craft.ts`                                     | Retained with property-path targets; later expression sugar | CE1–CE2, CE9 |
| Constraints: attach, contact, look-at, follow-path, keep-in-safe-area   | `motion-craft.ts`                                     | Constraints with property paths (evaluation step 6)         | CE2          |
| Spatial bezier paths                                                    | `spatialPaths`                                        | Position spatial tangents                                   | CE1–CE2      |
| Path morphs                                                             | `pathMorphs`                                          | Interim provider; target shape path keys                    | CE4a, CE5    |
| Text animators and range selectors                                      | `textAnimators`, `motion-text.ts`                     | Text layer animators (reused)                               | CE3          |
| Intent presets, `entranceProfile`                                       | `intentPresets`                                       | Compiled                                                    | CE4a         |
| Text styles, spans, decorations, transitions, text events               | `typography.ts`, `typography-*.ts`                    | Text layer content (reused typography engine)               | CE3          |
| Narration timing and word anchors                                       | `narrationTiming`                                     | Composition markers; text events resolved at compile        | CE1, CE4a    |
| Character actions (walk, knock, offer, receive, react)                  | `character-actions.ts`, resolved into poses and moves | Compiled to state keys and transforms                       | CE4a         |
| Prop attachments to hand anchors and transfers                          | `story-props.ts`                                      | `attach` constraint to a state-dependent anchor             | CE2, CE4a    |

### Components (`scene-components-1..3`)

| Feature                                           | Today                                                  | `composition-1` form                                                        | Milestone        |
| ------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- | ---------------- |
| Values and numeric text bindings (formatting)     | `component-values.ts`                                  | Interim provider for formatted text; target expression bound to text source | CE4a/b, CE9      |
| Property bindings                                 | `component-values.ts`                                  | Driver / expression                                                         | CE2, CE9         |
| State schedules (cuts, ramp)                      | `component-state.ts`                                   | `state` keys with hold interpolation; ramp as `stateMix` keys               | CE1–CE3          |
| Travels along paths                               | `component-travel.ts`                                  | `follow-path` constraint with keyed progress                                | CE2              |
| Visibility windows                                | `component-visibility.ts`                              | Layer in/out points; multiple windows as hold-keyed opacity                 | CE1              |
| Pins                                              | `component-pin.ts`                                     | `attach` constraint                                                         | CE2              |
| Text fits                                         | `component-text-fit.ts`                                | Text layer fit option resolved at compile with measured fonts               | CE3              |
| Masks (`invert`)                                  | `component-mask.ts`                                    | Track matte (`alpha` / `alpha-inverted`)                                    | CE3              |
| Annotations (anchored leaders, protected regions) | `component-annotations.ts`                             | Interim provider; target shape path with expression-driven vertices         | CE4a/b, CE5, CE9 |
| Relationships and instances                       | `component-relationships.ts`, `component-instances.ts` | Compiled                                                                    | CE4a/b           |

### Story-only rendering

| Feature                                                       | Today                      | `composition-1` form                                                                 | Milestone    |
| ------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------ | ------------ |
| Story camera keys (`x`, `y`, `zoom`), ease flags, tangents    | `story-camera.ts`          | Composition 2D camera with per-layer depth factor (parity note 3); later CE8 camera  | CE1–CE2, CE8 |
| Camera `depth` per root and `cover` list                      | `StoryCameraSchema`        | Layer depth factor; `cover` as coverage-required layers                              | CE1, CE8     |
| Camera jolts                                                  | `jolts`                    | Evaluated in the 2D camera step; later `camera-shake` behaviour                      | CE2, CE9     |
| Flows (dots/dashes along a path, speed, colour states, pinch) | `story-flows.ts`           | Interim provider `story-flow`; target shape repeater along trimmed path              | CE4a, CE5    |
| Connectors (anchor-to-anchor paths with bend)                 | `connectors`               | Compiled path geometry per frame via interim provider; target expression-driven path | CE4a, CE9    |
| Safe zones, `safeInset`, review metadata, focal events        | `story.ts`                 | Composition metadata; checked by lint                                                | CE1, CE12    |
| Semantic checks (`stable-anchors`, `clearance`)               | `motion-craft.ts` `checks` | Lint rules                                                                           | CE12         |
| Shared effects (`effects-1`)                                  | `shared-effects.ts`        | Effect registry                                                                      | CE6          |

### Commerce-only rendering

| Feature                                                                                                                         | Today                                                 | `composition-1` form                                                 | Milestone |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------- | --------- |
| Effects: directional blur, focus blur, glow, grain, light sweep, background light, displacement, echo, particles, height shadow | `commerce-effects.ts`, `commerce-effects-renderer.ts` | Effect registry entries                                              | CE6       |
| Effect: motion blur (shutter angle, samples)                                                                                    | `commerce-effects.ts`                                 | Composition/layer motion blur                                        | CE7       |
| Effects: overshoot, drift, parallax                                                                                             | `commerce-effect-motion.ts`                           | Behaviours or compiled keys, not pixel effects                       | CE9       |
| Geometry (anchors, protected regions) and attachments                                                                           | `commerce-spatial.ts`, `commerce-geometry.ts`         | Asset anchors; attached paths as interim provider, later expressions | CE4b, CE9 |
| Mattes (`invert`, `order: after-effects`)                                                                                       | `commerce-spatial.ts`                                 | Track mattes                                                         | CE3       |
| Visibility windows, text fits                                                                                                   | `commerce-spatial.ts`                                 | In/out points; text fit option                                       | CE1, CE3  |
| Layout, product preparation, shadow textures, floating hand                                                                     | `commerce-*.ts`, `animation-engine/commerce-*.ts`     | Compiled; generated shadows are prepared files referenced as assets  | CE4b      |
| Registration, claims and source metadata                                                                                        | `metadata`                                            | Composition metadata passthrough                                     | CE1       |

### Cinematic-only rendering

| Feature                                                                       | Today                   | `composition-1` form                                 | Milestone |
| ----------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------- | --------- |
| Depth planes (`depth`, `paintedBounds`, `protectedRegion`, `edgeAttachments`) | `cinematic.ts` `layers` | 3D image layers with z from depth; coverage metadata | CE8, CE4c |
| Camera travel, push, pullback, curve, anchor                                  | `cinematic-scene.ts`    | CE8 camera path                                      | CE8, CE4c |
| Focus handoff (`focus.maxBlurPx`, transition)                                 | `sampleCinematicBlur`   | Depth of field via lens blur                         | CE6, CE8  |
| Nine presets, intensity                                                       | `cinematic.ts` recipe   | Compiled                                             | CE4c      |
| Coverage, source-resolution and framing validation                            | `cinematic-scene.ts`    | Camera coverage checks on the composition camera     | CE8       |
| Foreground reveal validation                                                  | `reveal-validation.ts`  | Retained as an adapter-level check                   | CE4c      |

### Passage level (remains outside a composition)

| Feature                                                 | Today                                     | Treatment                                                        | Milestone |
| ------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- | --------- |
| Beats, cues, templates, slots, style profiles, purposes | `story-passage.ts`, `story-template.ts`   | Unchanged; each beat compiles to one composition                 | CE4a      |
| Handoffs and continuity between beats                   | `story-handoff.ts`                        | Unchanged in the passage engine                                  | —         |
| Narration import, audio cues, SFX                       | `narration-timing.ts`, `passage-audio.ts` | Unchanged; audio layers may later carry per-composition sound    | CE13      |
| Incremental render cache and jobs                       | `passage-cache.ts`, `passage-job.ts`      | Unchanged; cache identity gains the composition renderer version | CE3       |

### Not mapped

| Feature                                                                                                              | Today                                            | Status                                                                                             |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Single-image depth animation (`slow_push`, `horizontal_drift`, `cinematic_float`, `auto`) and flat editorial presets | `webgl-renderer.ts`, `webgl-animation-engine.ts` | Separate WebGL renderer, outside CE4. Owner decision needed ([Q7](#open-questions-for-the-owner)). |

### Parity notes for adapter work

1. **Group opacity applies per child.** `illustrated-renderer.ts` paints children inside
   the parent's `save()` with `globalAlpha` multiplied, so each child is drawn with the
   product of ancestor opacities. That is neither AE parenting (no opacity inheritance)
   nor a precomp (opacity applied to the flattened result); they differ wherever
   semi-transparent children overlap. CE1 must provide a layer option equivalent to
   `inheritOpacity: "multiply"` for adapter output, distinct from precomps.
2. **Legacy timing is in milliseconds.** Legacy illustrated tracks key at
   `time × durationMs / 7000` ms, which can fall between frames. CE1 must either allow
   fractional key frames in adapter-produced compositions or CE4d must bake those
   tracks to per-frame keys. Decide before CE1 is complete.
3. **The story camera scales each root by its depth.** The camera transform is applied
   per root node with a depth factor, not as one parent transform. A null parent cannot
   express it; CE1 needs a composition 2D camera with a per-layer depth factor until CE8.
4. **Sub-frame sampling already exists.** Commerce and motion-model story scenes evaluate
   at fractional frames for motion-blur exposure. CE2's evaluator must accept fractional
   times for those paths from the start; CE7 generalises it.
5. **SVG rasterisation depends on clipping** unless assets are pre-rasterised
   (`motionGrammar: "v2"`). Image layers must expose the same policy.
6. **Reusable components.** `REUSABLE_EXAMPLES` has 20 components, rendered in commerce,
   isolated and story contexts (60 scene fixtures). The acceptance set adds the three
   `story-*.passage.json` component passages, matching the "63 combinations" figure in
   the technical debt audit.
7. **Legacy anchors do not move artwork** (found in CE1). In
   [`nodeMatrix`](../packages/renderer-core/src/node-transform.ts), `x`/`y` place the
   top-left corner of the node's box and rotation, skew and scale pivot about the
   static `origin`. Animated `anchorX`/`anchorY` leave the matrix unchanged; they only
   move the reference point that attach and follow constraints use. In `composition-1`
   (as in AE), the anchor is the pivot and moving it moves the artwork. Adapters
   therefore emit `position = [x + width·originX, y + height·originY]` and a static
   anchor `[width·originX, height·originY]`. Animated legacy anchors must not become
   `transform.anchor` keys; CE2 needs a separate constraint reference point for them.

**Resolutions (CE1, 2026-10-01).** Note 1: `group` layer type. Note 2: legacy tracks are
baked to one key per integer frame in CE4d; no fractional key frames. Note 3: `camera2d`
with `cameraDepth`. Note 4: no contract change; CE2 accepts fractional evaluation times.
Note 5: image `rasterize: "natural-size"`. Note 6: no contract change. Note 7: adapter
rule above, plus a CE2 follow-up. See the [decision log](#decision-log).
