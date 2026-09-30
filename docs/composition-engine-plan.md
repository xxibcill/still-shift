# Programmable composition engine — implementation plan

- **Updated:** 2026-09-30
- **Status:** Planned. No milestone started.
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
   produce identical encoded frames. Randomness is seeded and part of the contract.
4. **Explicit versions.** New contracts start at `composition-1`. Each backend and effect
   has a version string that participates in cache identity, like the existing
   `ILLUSTRATED_RENDERER_VERSION`.
5. **Legacy formats keep working.** Existing scene files continue to validate and render.
   Adapters produce pixel parity within the tolerances recorded in CE0 before any old
   code path is removed.
6. **Preview/export parity.** Lab preview and CLI export use the same evaluator and
   backend for a given composition.
7. **Structured diagnostics.** Every validation failure returns a stable code, severity,
   message and a JSON path (and a builder source location once CE10 lands). Extend
   [`passage-diagnostics.ts`](../packages/renderer-core/src/passage-diagnostics.ts) rather than
   inventing a parallel mechanism.
8. **Bounded inputs.** Every array, string and numeric range in the schema has an explicit
   limit, as current contracts do.

## Core conventions

Fix these in CE1 and do not change them later without a decision-log entry.

| Topic             | Convention                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coordinates       | Origin top-left of the composition, +x right, +y down, +z away from the viewer. Units are composition pixels.                                               |
| Rotation          | Degrees, clockwise positive in 2D (matches Canvas and AE). 3D uses X, Y, Z rotation plus orientation, applied Z·Y·X.                                        |
| Anchor point      | In layer-space pixels, as in AE; default is the layer centre for sized layers and `[0,0]` for shape and null layers.                                        |
| Transform order   | Translate(position) · Rotate · Skew · Scale · Translate(−anchor). Parent matrices premultiply.                                                              |
| Scale             | Percent-free: `1` means 100%.                                                                                                                               |
| Opacity           | 0–1. Parent opacity does **not** inherit, matching AE; group/precomp opacity applies to the flattened result.                                               |
| Colour authoring  | `#RRGGBB` or `#RRGGBBAA` sRGB. Evaluated internally as floating-point RGBA.                                                                                 |
| Compositing space | sRGB-encoded by default for parity with existing renders. Linear-light compositing is an opt-in composition setting introduced in CE6.                      |
| Alpha             | Premultiplied in all render surfaces.                                                                                                                       |
| Time              | Integer composition frames; layer-local time = `(compFrame − startFrame) × stretch` (with time remap overriding). In point inclusive, out point exclusive.  |
| Frame rates       | 24, 25, 30, 50 and 60 fps. A precomp with a different rate is sampled at the parent's time; a posterize-time effect or layer setting snaps to its own rate. |
| Identifiers       | `^[a-zA-Z][\w-]*$`, unique within a composition. Precomps have their own namespace.                                                                         |

## Milestone tracker

| ID   | Deliverable                                     | Phase | Depends on                | Owner | Branch | Status | Completion evidence |
| ---- | ----------------------------------------------- | ----- | ------------------------- | ----- | ------ | ------ | ------------------- |
| CE0  | Baseline, parity harness and feature matrix     | A     | —                         |       |        | `[ ]`  |                     |
| CE1  | `composition-1` contract and property paths     | A     | CE0                       |       |        | `[ ]`  |                     |
| CE2  | Pure composition evaluator                      | A     | CE1                       |       |        | `[ ]`  |                     |
| CE3  | Render graph and Canvas 2D reference backend    | A     | CE2                       |       |        | `[ ]`  |                     |
| CE4a | Story adapter with pixel parity                 | A     | CE3                       |       |        | `[ ]`  |                     |
| CE4b | Commerce and reusable-component adapter         | A     | CE3, CE6 (effects parity) |       |        | `[ ]`  |                     |
| CE4c | Cinematic adapter                               | A     | CE3, CE8                  |       |        | `[ ]`  |                     |
| CE4d | Legacy illustrated adapter and old-path removal | A     | CE4a–CE4c                 |       |        | `[ ]`  |                     |
| CE5  | Shape layers                                    | B     | CE3                       |       |        | `[ ]`  |                     |
| CE6  | WebGL2 backend and effect registry              | B     | CE3                       |       |        | `[ ]`  |                     |
| CE7  | Motion blur and time controls                   | B     | CE3                       |       |        | `[ ]`  |                     |
| CE8  | 2.5D layers and unified camera                  | B     | CE3                       |       |        | `[ ]`  |                     |
| CE9  | Expressions and motion behaviours               | C     | CE2                       |       |        | `[ ]`  |                     |
| CE10 | TypeScript builder API and CLI                  | C     | CE1, CE2                  |       |        | `[ ]`  |                     |
| CE11 | Lab composition inspector and graph editor      | C     | CE3, CE10                 |       |        | `[ ]`  |                     |
| CE12 | Motion linting                                  | C     | CE2                       |       |        | `[ ]`  |                     |
| CE13 | Video, image-sequence and audio layers          | D     | CE3, CE7                  |       |        | `[ ]`  |                     |
| CE14 | Mesh warp and puppet pins                       | D     | CE6                       |       |        | `[ ]`  |                     |
| CE15 | Output formats, caching and parallel rendering  | D     | CE3                       |       |        | `[ ]`  |                     |

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

- [ ] CE0 parity harness and baselines for at least one fixture per family.
- [ ] CE1 schema for comp, precomp, solid, image, text and null layers; transforms;
      parenting; in/out points; blend modes; alpha mattes.
- [ ] CE2 evaluator covering those features.
- [ ] CE3 Canvas 2D backend covering those features, wired into export.
- [ ] CE4a adapter for `benchmarks/fixtures/story-motion-continuous/access-constraint.json`
      with the parity result recorded.
- [ ] Record commands, results and limitations here before marking the slice complete.

---

## CE0 — Baseline, parity harness and feature matrix

**Outcome:** Measurable baselines exist, so later milestones can prove they preserved
existing behaviour and did not regress performance.

- [ ] Select the **acceptance fixture set**, at least:
  - Story: `story-motion-continuous/access-constraint.json`, the Unequal Margins
    continuous prototype, one passage from `benchmarks/fixtures/story-passages/`,
    `illustrated-sequence/` (includes acting, props and text containers).
  - Motion craft: `motion-craft/buffer-press.json`, `motion-craft/supply-ramps.json`.
  - Typography: the fixtures used by `tests/browser/typography-fixtures.ts`.
  - Commerce: the hero used by `tests/browser/commerce.ts` and every effect demo in
    `commerce-effect-pixels.ts`.
  - Reusable components: all 63 gallery combinations.
  - Cinematic: Layered Parallax, Threshold Push, Dolly Zoom and Focus Handoff fixtures.
  - Legacy illustrated: all six `history-offstage-v2` presets.
- [ ] Add `tests/visual/composition-baselines/`: for each fixture, per-frame SHA-256 of
      decoded RGB at native size for a deterministic frame subset (first, last, every
      cue/event boundary, and every 12th frame), plus downsampled frames for tolerance
      comparison. Reuse the sampling helpers in
      [`parity.ts`](../packages/renderer-core/src/parity.ts).
- [ ] Define and record tolerance tiers:
  - **exact** — identical RGB;
  - **near** — max per-channel difference ≤ 2 and PSNR ≥ 50 dB;
  - **perceptual** — PSNR ≥ 40 dB and SSIM ≥ 0.99 on the fixture's frames.
    Each fixture is assigned a tier with justification (for example, blur effects may
    only achieve `near` on a new backend).
- [ ] Record render-time baselines (ms/frame, Chromium, pinned toolchain) for each
      fixture in `benchmarks/composition-baseline.json`.
- [ ] Write the **feature matrix** as an appendix to this plan: every current scene
      feature (recipe, component, effect, constraint, acting, text container, flow,
      camera jolt, etc.) mapped to its `composition-1` representation and the milestone
      that provides it. Features with no mapping block their adapter milestone until a
      mapping is decided.
- [ ] Record in the decision log how GPU nondeterminism will be handled (see
      [open questions](#open-questions-for-the-owner) Q1).

**Acceptance:** The baseline command runs from a clean checkout and reproduces its
own stored values. The feature matrix has no unmapped entries without an owner.

**Verification:** Run the baseline twice in fresh processes; results must be identical.

**Completion record:** _to be filled in._

---

## CE1 — `composition-1` contract and property paths

**Outcome:** One validated, versioned data format can describe everything an After
Effects composition can for this project's needs.

### Contract sketch

This is the intended shape; refine names during implementation and record changes.

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
  precomps?: Composition[]; // referenced by id, may nest (depth ≤ 8)
  layers: Layer[]; // index 0 = top, as in AE
  markers?: Marker[]; // cues: { id, frame, duration?, label? }
  signals?: Signal[];
  drivers?: Driver[];
  constraints?: Constraint[]; // reused from motion-craft
  expressions?: Record<PropertyPath, Expression>; // CE9
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
    | "precomp"
    | "adjustment"
    | "camera"
    | "light"
    | "video"
    | "sequence"
    | "audio";
  inPoint: number;
  outPoint: number; // comp frames, [in, out)
  startFrame?: number; // layer time 0 in comp frames
  stretch?: number; // time stretch, > 0
  timeRemap?: Animatable<number>; // precomp/video only
  parent?: string;
  enabled?: boolean;
  solo?: boolean;
  guide?: boolean;
  threeD?: boolean; // CE8
  transform: Transform; // every field Animatable
  blendMode?: BlendMode;
  trackMatte?: {
    layer: string;
    mode: "alpha" | "alpha-inverted" | "luma" | "luma-inverted";
  };
  masks?: Mask[];
  effects?: EffectInstance[]; // CE6 registry ids
  motionBlur?: boolean; // CE7
  collapseTransforms?: boolean; // precomp
  qualification?: string; // keep evidence/qualification metadata from story
  source?: { family: string; id: string }; // adapter provenance for diagnostics
};

type Transform = {
  anchor: Animatable<Vec2 | Vec3>;
  position: Animatable<Vec2 | Vec3>;
  scale: Animatable<Vec2 | Vec3>;
  rotation: Animatable<number>;
  orientation?: Animatable<Vec3>;
  rotationX?: Animatable<number>;
  rotationY?: Animatable<number>;
  skew?: Animatable<number>;
  skewAxis?: Animatable<number>;
  opacity: Animatable<number>;
  separateDimensions?: boolean;
  autoOrient?: "off" | "path" | "camera";
  spatialTangents?: SpatialTangent[]; // reuse SpatialPathSchema semantics
};

type Animatable<T> =
  | T
  | { keys: Key<T>[] }
  | { expression: string /* id into expressions */ };
```

`Key<T>` extends the existing `ScalarKeySchema` fields (`easing`, `interpolation`,
`bezier`, `in`, `out`, `smooth`) to vector and colour values. Vector keys interpolate
component-wise unless `spatial` tangents are given, in which case position follows the
spatial bezier with the temporal curve controlling progress along arc length (roving
keys become possible in CE9).

### Property paths

A single grammar addresses anything animatable, used by drivers, expressions,
diagnostics, the builder and the Lab:

```text
path     := [ precompId "/" ]* layerId "." segment ( "." segment )*
segment  := name | name "[" index "]"
examples: title.transform.position
          title.transform.position.x          (component access)
          bg.effects[glow].radius              (effect by instance id)
          bars.contents[bar1].trimEnd          (shape contents, CE5)
          scene/hero.transform.opacity         (inside a precomp)
          comp.camera.zoom
```

### Checklist

- [ ] Add `packages/scene-contract/src/composition/` with schemas for composition,
      assets, markers, all layer types listed above (types that later milestones
      implement may be schema-only here, rejected by a `comp-feature-unavailable`
      diagnostic until then), transforms, keys for scalar/vec2/vec3/colour, masks, track
      mattes and blend modes.
- [ ] Blend modes: `normal`, `multiply`, `screen`, `overlay`, `darken`, `lighten`,
      `color-dodge`, `color-burn`, `hard-light`, `soft-light`, `difference`,
      `exclusion`, `hue`, `saturation`, `color`, `luminosity` and `add` (Canvas
      `lighter`).
- [ ] Masks: closed bezier path (Animatable); mode `add`, `subtract`, `intersect`,
      `difference` or `none`; `inverted`, `feather` (px), `expansion` (px) and
      `opacity`.
- [ ] Implement the property-path parser and resolver with typed results
      (scalar/vec/colour/bool/enum) and use it for validation of every path reference.
- [ ] Generalise `MotionTargetSchema` and `DriverSchema` so targets and sources are
      property paths; keep the old node-and-property form valid as an alias.
- [ ] Semantic validation: unique ids, parent cycles, matte layer exists and is
      directly above (AE rule) or explicitly referenced, precomp cycles, in < out,
      key frames ascending and inside a sane window, asset hashes present, precomp
      nesting depth ≤ 8, total layer count ≤ 2,000.
- [ ] Diagnostic codes prefixed `comp-` with JSON paths; document every code in
      `docs/composition-reference.md` (created in this milestone and extended by each
      later milestone).
- [ ] Add the schema to `scripts/generate-corpus-schema.ts` so `pnpm schema:check`
      covers it and a JSON Schema file is generated for editors and AI agents.

**Acceptance:** A hand-written composition exercising every CE1 field validates; each
invalid variant in the test suite fails with the expected code and path.

**Verification:** Unit tests for schema, path grammar (valid, invalid, ambiguous,
precomp-scoped), cycles and limits. Round trip: parse → serialise → parse is identical.

**Completion record:** _to be filled in._

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

- [ ] `evaluateComp` and `evaluateProperty(comp, path, time)` in
      `renderer-core/src/composition/evaluate/`, with no DOM or Canvas imports
      (enforce with a lint rule or boundary check).
- [ ] Vector and colour interpolation, spatial bezier for position with arc-length
      parameterisation (reuse `SpatialPathSchema` semantics).
- [ ] Parenting with AE semantics: position, rotation, scale and skew inherit; opacity
      does not.
- [ ] Time stretch, negative stretch (reverse) and time remap.
- [ ] Screen-space bounding boxes for culling and diagnostics (images/solids exact;
      text from measured layout; shapes after CE5).
- [ ] Memoise per frame; cache compiled curves by object identity (as `story-camera.ts`
      does with a `WeakMap`).
- [ ] Performance budget: evaluating a 200-layer composition must take ≤ 2 ms per frame
      in Node on the reference machine; record the measurement.

**Acceptance:** For random frame orders, evaluation equals sequential evaluation.
Parenting, stretch and remap match hand-computed expectations.

**Verification:** Unit tests for every transform component, parent chains up to depth
16, reversed time, remapped precomps, and a property-based test (random seeks vs forward
play) using a fixed seed.

**Completion record:** _to be filled in._

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

- [ ] Render graph builder and Canvas 2D backend in `composition/render/`.
- [ ] Layer drawing for solid, image (reuse `imagePlacement`/`fit`), text (reuse the
      typography renderer and text animators as a layer content provider), null (no
      draw), adjustment (applies its effects to everything below within its bounds).
- [ ] All CE1 blend modes via `globalCompositeOperation`.
- [ ] Alpha and inverted alpha mattes via `destination-in`/`destination-out`. Luma
      mattes via a luminance pass (pixel loop in this backend; GPU in CE6).
- [ ] Masks as Path2D with `add/subtract/intersect/difference`; feather via blurred
      mask surface; expansion via stroke-and-fill approximation (document the limits).
- [ ] Precomps with and without collapsed transforms; nested time.
- [ ] Culling of layers whose bounds miss the viewport.
- [ ] Wire `composition-1` into [`export-page.ts`](../packages/execution-runtime/src/export-page.ts)
      and [`export-worker.ts`](../packages/execution-runtime/src/export-worker.ts) as an
      `ExportableScene`; add engine entry points in `packages/animation-engine`.
- [ ] `COMPOSITION_RENDERER_VERSION = "composition-canvas-1.0.0"`, included in manifests
      and cache identities.
- [ ] Add a browser test group `test:browser:composition` and include it in `pnpm test`.

**Acceptance:** The first-slice composition renders identically in Lab preview and MP4
export. Every blend mode and matte mode matches a reference image generated from the
formulas in the W3C Compositing and Blending specification within the `near` tier.

**Verification:** Pixel tests per blend mode and matte mode on a fixed test chart;
precomp nesting; mask boolean combinations; export transaction tests reused from
`tests/browser/export-worker.ts`.

**Completion record:** _to be filled in._

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
- Switch a family over only after its fixtures meet their CE0 tolerance tier. Until then,
  a flag (`--renderer composition`) selects the new path.

### CE4a — Story

- [ ] Map roots, groups (with `clip` → mask), images with states and state blends,
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
- [ ] Update [user guide](./user-guide.md) and README.

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
- [ ] Decide and implement the determinism strategy from CE0 (see Q1). Record the
      Chromium flags used for export and the GPU identity in manifests, as the golden
      test already does for `gpuRenderer`.
- [ ] Backend parity suite: every fixture renders on both backends and meets its tier.

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

Expressions are a **serialisable, deterministic AST**, not arbitrary JavaScript, so
compositions stay portable, safe to evaluate in export workers and easy for agents to
generate and validate. The builder (CE10) provides a JavaScript-like surface that
compiles to this AST. See Q3.

```json
{ "fn": "wiggle", "args": [{ "num": 2 }, { "num": 12 }, { "seed": 7 }] }
{ "fn": "linear", "args": [{ "ref": "slider.transform.position.x" }, { "num": 0 }, { "num": 100 }, { "num": 0 }, { "num": 1 }] }
```

### Checklist

- [ ] AST schema, type checker (scalar/vector/colour) and evaluator.
- [ ] Built-ins: `time`, `frame`, `value`, `index`, `layerCount`, `ref(path)`,
      `valueAtTime(path, t)`, `velocityAtTime(path, t)`, arithmetic and vector ops,
      `clamp`, `mix`, `linear`, `ease`, `easeIn`, `easeOut`,
      `wiggle(freq, amp, seed, octaves)`, `noise(seed, t)`, `random(seed, index)`,
      `loopIn`/`loopOut` with modes `cycle`, `pingpong`, `offset` and `continue`,
      `smooth(width, samples)`, `lookAt`, `length`, `normalize`, `step`, `if`.
- [ ] Dependency graph across properties with cycle detection (`comp-expression-cycle`).
      `valueAtTime` references to earlier times are allowed; same-time cycles are errors.
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

**Verification:** Evaluator unit tests per built-in, cycle detection, seek determinism,
bake round trip.

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
- [ ] Source maps: every emitted node records the builder call site; diagnostics show
      `file:line`.
- [ ] CLI: `still-shift comp` subcommands `validate`, `render`, `preview --watch`,
      `lint`, `bake` and `export-json`, accepting `.json` or `.ts` sources.
- [ ] AI reference: generated `docs/composition-reference.md` (schema, property paths,
      diagnostics, built-ins) plus a compact `skills/compose-with-still-shift/SKILL.md`
      with examples; keep both generated from the schema where possible.
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
- [ ] Formats: ProRes 4444 with alpha, ProRes 422 HQ, PNG sequence (8/16-bit),
      WebM VP9 with alpha, H.264 and HEVC 10-bit, all tagged BT.709. Extend the ffprobe
      verification in `export-worker.ts` per format.
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

| Risk                                                             | Impact                                             | Mitigation                                                                                |
| ---------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| GPU output differs across machines                               | Breaks determinism and cache identity              | Decide Q1 in CE0; pin export GPU path; tolerance tiers; record GPU identity in manifests  |
| Adapter parity is harder than expected (hidden family behaviour) | CE4 stalls; two render paths coexist for long      | Feature matrix in CE0; content providers as an escape hatch; flag-gated switch per family |
| Scope creep toward a GUI editor                                  | Lab work displaces engine work                     | CE11 is inspection plus light edits; code remains primary                                 |
| Expression language too weak or too strong                       | Authors blocked, or unsafe/nondeterministic output | AST with bake; builder offers JS ergonomics that compile to AST; revisit via Q3           |
| Performance regression from per-layer surfaces                   | Slower renders than today                          | Surfaces only when needed; culling; budgets in CE0/CE2/CE6; caching in CE15               |
| Media decode nondeterminism                                      | Video frames drift between runs                    | FFmpeg pre-decode with content-addressed cache; no element seeking in export              |
| Third-party geometry libraries (boolean ops, triangulation)      | Licence or determinism problems                    | Record library, version and licence in the decision log before adoption                   |

## Decision log

| Date       | Decision                                                                                              | Reason                                                                                  | Superseded by |
| ---------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------- |
| 2026-09-30 | Introduce one `composition-1` contract; existing families become compilers into it                    | Removes per-family duplication; every later feature is built once                       |               |
| 2026-09-30 | Keep Canvas 2D as the reference backend and add WebGL2 as the production backend behind one interface | Preserves parity with existing output while enabling GPU effects and performance        |               |
| 2026-09-30 | Expressions are a serialisable AST; JavaScript ergonomics live in the builder                         | Determinism, sandbox safety in export workers, easy validation of agent output (see Q3) |               |
| 2026-09-30 | JSON remains the serialisation format; the TypeScript builder is the primary code surface             | Keeps compositions portable and inspectable; gives coders and agents types              |               |
| 2026-09-30 | Video frames are pre-decoded with FFmpeg for export                                                   | Browser media seeking is not frame-accurate or deterministic enough for export          |               |

## Open questions for the owner

| ID  | Question                                                                                                                                                       | Needed by | Answer |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------ |
| Q1  | GPU determinism: pin export to a software GL path (SwiftShader, slower but reproducible), or accept `near`-tier tolerance across GPUs with hardware rendering? | CE0       |        |
| Q2  | Once adapters reach parity, should the four family schemas be frozen (still accepted, no new features) so new work targets `composition-1` only?               | CE4d      |        |
| Q3  | Is an AST expression language acceptable, or must compositions accept raw JavaScript expressions (with a sandbox) for AE-style familiarity?                    | CE9       |        |
| Q4  | Which output formats matter first: alpha for editors (ProRes 4444/PNG), social delivery (H.264/HEVC), or both?                                                 | CE15      |        |
| Q5  | Priority between mesh deformation (CE14) and video layers (CE13) for the faceless-video product goal.                                                          | Phase D   |        |
| Q6  | Should lights and 3D shading be planned after CE8, or is 2.5D without lighting sufficient?                                                                     | After CE8 |        |

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
