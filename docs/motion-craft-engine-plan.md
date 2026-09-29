# Motion craft engine plan

- **Updated:** 2026-09-29
- **Status:** MC1–MC8 implementation and technical acceptance complete. MC3's historical match uses a pinned, isolated archival Canvas transform; the production renderer retains its current transform. Creative acceptance of the study remains with the owner.
- **Baseline:** `4b2861e` on `main` (story renderer `story-canvas-0.18.0`, commerce `commerce-canvas-0.19.0`)
- **Scope owner decision:** engine primitives and authoring tools only; motion studies are acceptance fixtures, not deliverables (see the [engine tooling plan](story-engine-tooling-plan.md#objective-and-scope), 2026-09-26).

## Objective

Give Still Shift the motion model that a motion designer expects from After Effects, but as a programmatic, deterministic, AI-authorable engine. The current engine is strong at _structure_ (cue-bound timing, templates, handoffs, cached exact renders). It is thin at _motion craft_: how values change over time, how motions combine, and how one motion drives another.

This plan adds that layer in eight phases (MC1–MC8). IDs are distinct from the episode's M0–M6 and the engine tooling E1–E7.

The owner's [continuous storytelling decision](story-motion-continuous-storytelling-plan.md) is a requirement: the engine must make "every second moves, and the motion carries the story" cheap to author. It must not make it cheap to satisfy with meaningless drift.

## Baseline findings (2026-09-27)

Evidence comes from reading the renderer and contracts, and from per-frame change energy of rendered MP4s (480×270 greyscale, pixels changing by more than 6 levels).

| #   | Finding                                                                                                                                                                                                                                                                                                                          | Evidence                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **Every key is a dead stop.** Node tracks are a series of independently eased segments. Velocity is zero at every key, so chained keys move start–stop. There are no velocity/influence handles, custom béziers or springs. The camera already has the right model (monotone Hermite, C1 at interior keys); nodes do not use it. | [`sampleTrack`](../packages/renderer-core/src/prepared-scene.ts), [`createTracks`](../packages/renderer-core/src/story-scene.ts), [camera curves](../packages/renderer-core/src/story-camera.ts)                                             |
| F2  | **Entrances arrive at full speed.** `set-down`, `attach`, `wipe` and `stamp` use `out-quint`/`out-expo` from their first frame. Motion pops, then decays; nothing accelerates.                                                                                                                                                   | Relationship Build v013: 25 → 4,183 changed pixels in one frame. Continuous prototype v014-g: 1,106 → 6,695 at frame 4, 388 → 6,599 at frame 28.                                                                                             |
| F3  | **One writer per property.** A second animation on the same node property throws `Conflicting story events`. Relative events are resolved serially into absolute keys, not layered. A drift, breath or pulse cannot sit on top of a move. `StoryRole` (`action/response/carrier/current`) is metadata only.                      | [`createTracks.finish`](../packages/renderer-core/src/story-scene.ts), [`StoryRoleSchema`](../packages/scene-contract/src/story-motion.ts)                                                                                                   |
| F4  | **No drivers or constraints.** Physical relationships are baked by hand. Buffer Press keeps its band in contact with the roof by sampling every frame into linear keys.                                                                                                                                                          | [`sampled()`](../scripts/story-motion/unequal-margins-v3.ts): **442** `linear` keys in [`story-motion-buffer-press/unequal-margins.json`](../benchmarks/fixtures/story-motion-buffer-press/unequal-margins.json). Intent is lost in numbers. |
| F5  | **Closed story vocabulary.** `StoryRecipeSchema` is a union of seven presets; a new story shape needs engine code. Story, commerce and cinematic scenes have separate effect vocabularies: story has no motion blur, overshoot or glow although commerce does.                                                                   | [`story.ts`](../packages/scene-contract/src/story.ts), [`commerce-effects.ts`](../packages/scene-contract/src/commerce-effects.ts)                                                                                                           |
| F6  | **Thin property set.** Animatable: `x, y, scaleX, scaleY, rotation, opacity, reveal, gap, state, pulse, pinch`. Missing: color/fill/stroke, stroke width, trim start/offset, blur, skew, path morph. Travel follows polylines (direction kinks at corners); tangent orientation is deferred. Text reveals only per line or word. | [`Property`](../packages/renderer-core/src/prepared-scene.ts), [story text](../packages/renderer-core/src/story-text.ts), [RC-09](reusable-components.md#path-travel-rc-09)                                                                  |
| F7  | **Rough finishing.** State cuts are single-frame pops. No authorable transition between beats ("no overlapping transition or crossfade").                                                                                                                                                                                        | `story-supply-sequence.mp4`: isolated spikes of 3,504 and 5,316 changed pixels. [Handoffs](story-engine-tooling.md#handoffs).                                                                                                                |
| F8  | **Gates measure quantity, not quality.** G1/G2 count frozen and moving frames. They are satisfiable by a sub-pixel camera creep plus a fade, and the prototype's strongest change is a fade rather than the story idea.                                                                                                          | [Continuous implementation §P2](story-motion-continuous-implementation.md) "Creative concern"                                                                                                                                                |

Also check during MC7: legacy holds in Access Constraint show a periodic 3/3/0/0 changed-pixel pattern every four frames. Confirm whether it is intended texture or rounding.

## Invariants (binding for every phase)

1. **Determinism.** Every value is a pure function of `(scene, frame)` (or sub-frame time for blur). No simulation state, playback history or wall-clock input. Backward seeks are identical.
2. **Legacy pixel parity.** Scenes that do not opt in keep their renderer version and decode byte-identically. The 1,344-frame legacy regression and existing parity suites must pass unchanged.
3. **Versioned opt-in.** New behavior is gated by a new schema field and bumps `story-canvas` / `commerce-canvas` versions only for opted-in scenes. Cache identity includes the new fields.
4. **Integer frame addressing.** Authoring stays in integer frames or cue-relative bindings; sub-frame sampling is internal (blur).
5. **Preview/export parity.** Lab and CLI share one evaluator.
6. **Strict, serializable data.** Unknown fields fail. No `eval`, no arbitrary code in scene JSON. AI and humans author the same JSON.
7. **Advisory, not prescriptive, lint.** New motion diagnostics report; they do not silently change choreography. Gates become hard only by explicit flag.
8. **Existing semantic invariants** from the continuous plan (§3) remain: attached connectors, exact narration boundaries, typography hierarchy, no decorative motion.

## Milestone tracker

Status: `[ ]` planned, `[~]` in progress, `[x]` complete, `[!]` blocked with a recorded reason.

| ID  | Deliverable                                                   | Depends on   | Fixes     | Status |
| --- | ------------------------------------------------------------- | ------------ | --------- | ------ |
| MC1 | Curve model: velocity-continuous keys, bézier easing, springs | —            | F1, F2    | `[x]`  |
| MC2 | Layered property evaluation by role                           | MC1          | F3        | `[x]`  |
| MC3 | Signals, drivers and constraints                              | MC1–MC2      | F4        | `[x]`  |
| MC4 | Open scene composition and one shared effect stack            | MC2          | F5        | `[x]`  |
| MC5 | Expanded property vocabulary                                  | MC1          | F6        | `[x]`  |
| MC6 | Beat transitions and ramped cuts                              | MC2, MC4     | F7        | `[x]`  |
| MC7 | Motion-quality lint                                           | MC1–MC3      | F8        | `[x]`  |
| MC8 | Lab motion tooling and intent presets                         | MC1–MC3, MC7 | authoring | `[x]`  |

**Original implementation branch:** `codex/motion-craft-engine`, merged into `main`. All eight workstreams were developed together. The historical acceptance and focal attribution were completed in a subsequent verification pass; see the record below.

## First slice (MC1 + MC2)

**Deliverable:** rewrite the Buffer Press fixture's non-contact motion with velocity-continuous keys and layered roles, with no conflict errors, and show on an energy curve that entrances accelerate into motion instead of popping.

- The house set-downs start below peak velocity (no single-frame spike above 2× the preceding frame's changed pixels, excluding declared cuts).
- The strain current and carrier drift are separate layers on the same nodes as the primary action.
- Legacy fixtures remain byte-identical.

Contact is still baked in this slice; MC3 removes it.

---

## MC1 — Curve model

**Outcome:** a node property can pass _through_ a key without stopping, and entrances can accelerate.

### Contract

Extend `StoryMove.keys` (and the shared component motion windows) under a new opt-in `motionModel: "curves-1"` scene field.

```json
{
  "node": "house-b",
  "keys": [
    { "frame": 40, "y": 520, "out": { "ease": 0.6 } },
    { "frame": 58, "y": 480, "smooth": true },
    { "frame": 80, "y": 470, "in": { "ease": 0.85 } }
  ]
}
```

- **Interpolation per key:** `hold`, `linear`, `ease` (existing named easings, unchanged), `bezier` (`[x1, y1, x2, y2]`, AE/CSS style, x clamped to [0,1]) or `smooth` (auto tangent).
- **`smooth` keys** use the camera's monotone Hermite with Fritsch–Carlson limiting, so the value passes through without stopping and without overshooting between monotone keys. Extract the camera spline into a shared `curve.ts`; the camera then consumes it with pixel-identical output.
- **Temporal handles:** `in`/`out` accept `ease` (influence 0–1, AE semantics) and optional `speed` (units per frame). Omitted handles mean speed 0 at hold/ease keys and auto at smooth keys.
- **Springs:** a window may use `easing: { "spring": { "stiffness": 170, "damping": 26, "mass": 1 } }`. Evaluate the closed-form damped oscillator (under/critical/over-damped cases) normalized so progress is exactly 1 at the window end. Where the analytic response has not settled by the window end, blend the residual to zero over the final 10% so endpoint identity holds. No integration state.
- **Named easings added:** `in-out-cubic`, `in-out-expo`, `out-back` (tunable overshoot), `anticipate` (small counter-move then out-cubic). Existing names keep their exact formulas.

### Engine work

- A shared `Curve` type and sampler in `renderer-core`, used by story tracks, component motions, commerce motion and the camera.
- `createTracks` emits curve segments instead of `{time, value, easing}` pairs when the scene opts in. `sampleTrack` keeps its current path for legacy keys.
- Default entrance verbs gain an opt-in `entranceProfile: "accelerate"` that replaces first-frame peak easings (`out-quint`, `out-expo`) with `in-out` or `anticipate` curves of the same duration. Legacy scenes keep current profiles.
- Validation: bézier x-handles within [0,1]; spring parameters bounded; speeds finite; `smooth` requires neighbors.

### Acceptance

- Unit: C1 continuity at every `smooth` interior key (finite-difference velocity equal within 1e-6 on both sides); overshoot-free monotone segments; spring endpoints exact; identity with legacy easings when handles are absent.
- The extracted camera spline renders the v014 prototype byte-identically.
- Energy check on a synthetic three-key move: no zero-velocity frame at the middle key.
- Browser preview/export parity at 9 frames including key joins; backward seeks identical.

### Out of scope

Spatial (x/y path) béziers; see MC5.

---

## MC2 — Layered property evaluation

**Outcome:** several motions contribute to one property at once, composed in a defined order. Continuous motion comes from composition, not special-case recipes.

### Contract

Under `motionModel: "curves-1"`, each motion declares a `layer` (defaulting from its existing `role`) and a `blend`:

| Layer (evaluation order) | Default blend                                         | Typical use                                            |
| ------------------------ | ----------------------------------------------------- | ------------------------------------------------------ |
| `action`                 | `replace`                                             | The story move: set-down, press, draw                  |
| `response`               | `add` (position/rotation), `multiply` (scale/opacity) | Reaction to an action: settle, recoil, compress        |
| `current`                | `add`                                                 | Semantic flow: strain pulse, supply rhythm             |
| `carrier`                | `add`                                                 | Shot-level life: drift, breath, camera-linked parallax |

- Final value = `action` value, then each additional layer applied in order, then clamped to the property's contract range (opacity [0,1], scale (0,4], reveal [0,1]).
- Conflict rule narrows: **two `replace` motions** on one property still conflict when their windows overlap. Additive layers never conflict.
- Each layer may carry a `weight` curve (0–1) so a carrier can fade out under a strong action ("duck the drift during the press").
- Periodic carrier primitives: `oscillate` (sine, period in frames, amplitude, phase) and `noise` (seeded, smoothed value noise, deterministic by `(seed, frame)`). Both are pure functions of frame.

### Engine work

- Replace the single `Key[]` per property with an ordered list of layer tracks for opted-in scenes; `evaluatePreparedNodeAtTime` sums/multiplies layers.
- Event index (`indexStoryEvents`) records each layer event with its layer name so cue retiming and the Lab keep working.
- Component adapters (`addStoryComponents`, `addCommerceComponents`) accept layered motions; existing single-writer checks remain for legacy component versions.
- Camera `jolts` become an additive camera layer (the current limit of one jolt lifts).

### Acceptance

- The Buffer Press house takes a `carrier` breath, an `action` set-down and a `response` compression on the same `y`, without conflict, and evaluates to the documented sum at sampled frames.
- `weight` ducking verified numerically.
- Legacy conflict tests still throw for legacy scenes.
- Continuous gates G1–G6 still pass on the rewritten fixture.

---

## MC3 — Signals, drivers and constraints

**Outcome:** one named quantity drives many properties, and physical relationships are declared, not baked. This is the equivalent of AE expressions, restricted to deterministic, serializable data.

### Contract

```json
{
  "signals": [
    {
      "id": "pressure",
      "keys": [
        { "frame": 50, "value": 0 },
        { "frame": 104, "value": 77, "in": { "ease": 0.8 } }
      ],
      "add": [{ "pulse": { "at": 128, "half": 12, "depth": 10 } }]
    }
  ],
  "drivers": [
    { "target": "band-b.y", "signal": "pressure", "map": { "offset": 212 } },
    {
      "target": "house-a.y",
      "signal": "pressure",
      "map": { "clamp": [0, 28], "offset": 380 }
    },
    {
      "target": "margin-a.scaleY",
      "signal": "pressure",
      "map": { "range": [0, 190], "to": [1, 0.5] }
    }
  ],
  "constraints": [
    {
      "type": "contact",
      "target": "house-b",
      "surface": "band-b",
      "point": [0.68, 0.07],
      "solve": ["y", "scaleY", "rotation"]
    }
  ]
}
```

- **Signals** are scalar curves (MC1 keys, layered MC2 additions, springs, oscillators, noise) bound to cues like any event.
- **Drivers** map a signal or another node's evaluated property into a target property through a closed set of mappings: `offset`, `scale`, `range→to` (with easing), `clamp`, `step`, `delay` (frames), `lag` (critically damped follow, closed form over the source curve), `sum` of several sources. No expression language.
- **Constraints** (a small fixed catalog): `attach` (origin to anchor; generalizes RC-12 pins), `contact` (keep a local point on another node's edge, solving the listed properties), `look-at` (rotation toward a node), `follow-path` (MC5 bézier travel with orientation), `keep-in-safe-area` (advisory clamp).
- Drivers and constraints write into a declared MC2 layer, so they compose with authored motion.

### Engine work

- A dependency graph over signals → drivers → constraints → nodes, topologically ordered once at compile time; cycles fail with a structured diagnostic naming the cycle.
- Unify with existing component `values`/`bindings`, `pins` and `travels` (RC-06/09/12). These become drivers and constraints internally; their readers and fixtures stay unchanged.
- Signals appear in the event index and passage bindings, so moving the `pressure` cue retimes everything it drives.

### Acceptance

- **Buffer Press rewrite:** the later 442-key Buffer Press fixture uses one signal, seven drivers and one contact constraint with **zero baked per-frame keys**, and keeps its sampled poses within 0.001 px. The archived v014-g is a different, eight-move-key composition. Its own five-signal/five-driver rewrite has zero recipe move keys and matches all 192 archived decoded frames within ±2/channel through the pinned archival-transform replay. These two source-specific checks replace the original single-fixture wording, which incorrectly treated the two compositions as identical.
- Cycle, missing-target and range errors produce stable diagnostic codes.
- Retiming the signal's cue in the Lab moves band, houses and margins together.

---

## MC4 — Open scene composition and a shared effect stack

**Outcome:** new story shapes need a template, not an engine change; every scene family has the same effects.

- Add `recipe: { "preset": "generic" }` (or make `recipe` optional under a new story schema minor version). A generic scene is nodes + connectors + camera + layered motions + signals + component data. Existing presets become **template macros** that compile into these primitives; their compiled output for legacy fixtures must remain byte-identical.
- Move semantic checks that presets currently enforce (e.g. Access Constraint clearance, Category Swap anchors) into reusable validators that a template can declare (`checks: ["clearance", "stable-anchors"]`).
- Lift commerce's effect catalog into a shared `effects-1` stack usable by story and cinematic scenes: `motion-blur` (shutter angle, sub-frame samples), `directional-blur`, `focus-blur`, `glow`, `grain`, `light-sweep`. Keep commerce's existing schema as a reader for compatibility.
- Story motion blur respects camera motion and MC2/MC3 evaluation at sub-frame time.

**Acceptance:** one of the seven studies re-expressed as a generic scene from its template macro renders byte-identically to the preset; a new synthetic shape (e.g. "two routes merge") is authored with no engine change; story motion blur passes preview/export parity and backward seek.

---

## MC5 — Expanded property vocabulary

**Outcome:** the expressive range expected from a motion tool.

| Property / feature                   | Notes                                                                                                                                                                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fill`, `stroke`, text `color`       | Interpolated in OKLab; hex endpoints; replaces flow `colorStates` step-only behavior when opted in                                                                                                                                                  |
| `strokeWidth`                        | Brush paths keep their deposited texture scale                                                                                                                                                                                                      |
| `trimStart`, `trimEnd`, `trimOffset` | Generalizes `reveal`; `reveal` maps to `trimEnd`                                                                                                                                                                                                    |
| `blur`                               | Per-node Gaussian radius, bounded; shared scratch surfaces                                                                                                                                                                                          |
| `skewX`, `skewY`                     | Matrix-consistent with annotations, pins and camera projection                                                                                                                                                                                      |
| `anchor` animation                   | Moving origin without a position jump                                                                                                                                                                                                               |
| Spatial béziers                      | `x/y` keys may declare spatial in/out tangents; travel on bézier paths with arc-length parameterization and optional `orient: "tangent"` (resolves RC-09 deferral)                                                                                  |
| Path morph                           | Between point sets with equal point counts; mismatched counts fail                                                                                                                                                                                  |
| Text animators                       | Per `line` / `word` / `glyph` units, a range selector (start/end/offset, shape, ease) driving opacity, offset, scale, rotation, blur, color; stagger in frames. Completed state must still equal the single `fillText` output (existing invariant). |

**Acceptance:** each property has unit sampling tests, a gallery example, preview/export parity and a backward-seek check. Text animator completion equality is verified in the browser suite.

---

## MC6 — Beat transitions and ramped cuts

**Outcome:** passages feel edited, not concatenated.

- New handoff kinds alongside `cut | continue | reset`: `overlap` (N frames where outgoing and incoming both render; both beat durations preserved by extending render ranges, not by shifting cues), `crossfade`, `push` (direction, eased), `match` (declared subject identity; carries pose over the overlap using MC1 curves).
- Transition rendering reuses beat caches: an overlap renders a separate short join segment whose cache identity includes both beats.
- **Ramped state cuts:** an image/text state cut may declare `ramp: 1–3` frames of blend, or rely on MC4 motion blur. Hard cuts stay the default and remain available for deliberate meaning (Category Swap).

**Acceptance:** join segments decode identically fresh and cached; narration boundaries are unchanged; the supply-sequence fixture with ramps shows no single-frame spike above a documented ratio.

---

## MC7 — Motion-quality lint

**Outcome:** diagnostics that match a motion designer's review, computed from compiled curves (fast, exact) and confirmed on pixels where needed.

| Code                     | Detects                                                                                                              | Source                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `velocity-discontinuity` | Speed jump at a key join above a threshold (units/frame², normalized by motion size)                                 | Curves                                    |
| `entrance-pop`           | Peak velocity on the first frame of an entrance/action window                                                        | Curves; pixel spike ratio as confirmation |
| `dead-stop-chain`        | Consecutive keys on one property with zero velocity between them where `smooth` was likely intended                  | Curves                                    |
| `competing-focus`        | Two `action` layers in different focal groups peak within N frames                                                   | Curves + `review.focalGroups`             |
| `peak-not-story`         | The pixel-energy peak of a beat is not produced by the beat's declared focal event (e.g. a fade outweighs the press) | Per-layer energy attribution              |
| `carrier-dominance`      | `carrier` share of motion energy exceeds a threshold across a beat, i.e. "moving without meaning"                    | Per-layer energy attribution              |
| `text-velocity`          | Existing G5, unchanged                                                                                               | Existing                                  |

- Per-layer energy attribution: render each layer's contribution by toggling it (curves are pure, so this is exact) at a reduced resolution, and report energy shares by role.
- Extend [`story-continuous-quality.ts`](../packages/renderer-core/src/story-continuous-quality.ts) and [`story-quality.ts`](../packages/renderer-core/src/story-quality.ts); do not add a parallel analyzer.
- `--require-motion-craft` makes chosen codes hard gates, mirroring `--require-continuous-motion`.

**Acceptance:** each code has a positive and negative synthetic fixture; running the lint on the v013 studies reproduces F2 (entrance pops) and on v014-g reproduces the known fade-over-press concern.

---

## MC8 — Lab motion tooling and intent presets

**Outcome:** humans and AI can see and reason about timing.

- **Graph view:** per-node, per-property value and speed curves for all layers, aligned to the existing beat/cue/event tracks; selecting a key shows its handles. Read-only first; handle editing after MC1 stabilizes.
- **Onion skin** (±N frames) and **motion-path overlay** in canvas space, using the same evaluated matrices as drawing.
- **Energy strip:** per-frame energy by layer beneath the timeline (planned as the continuous plan's lab activity strip, P5).
- **Intent presets** as data (`story-motion-presets-1`): `settle`, `press`, `recoil`, `handoff`, `breathe`, `draw-on`, `land`. Each expands to MC1–MC3 primitives with named, cue-bindable parameters. Presets are the recommended AI authoring surface; the full primitives stay available.
- **Authoring diagnostics for AI:** every compile error and MC7 finding carries a stable code, JSON path and, where unambiguous, a suggested fix (e.g. `"set smooth: true on keys[1]"`).

**Acceptance:** desktop and 390 px browser checks; graph view values equal evaluator samples; a preset-only fixture renders and passes MC7 without warnings.

---

## Acceptance fixtures

Existing studies serve as fixtures, not deliverables. Tuning their choreography is out of scope.

| Fixture                                                                          | Used by                                     |
| -------------------------------------------------------------------------------- | ------------------------------------------- |
| [`story-motion-buffer-press`](../benchmarks/fixtures/story-motion-buffer-press/) | MC1–MC3 rewrite target (442 baked keys → 0) |
| v013 Relationship Build, Motif Resolve                                           | MC1 entrance profile, MC7 `entrance-pop`    |
| `reusable-components/story-supply-sequence`                                      | MC6 ramped cuts                             |
| Seven legacy studies, both narrated passages                                     | Invariant 2 pixel parity                    |
| New synthetic fixtures per phase                                                 | Positive/negative unit and browser cases    |

## Verification per phase

```sh
pnpm check:fast
pnpm exec vitest run tests/unit tests/integration
pnpm test:browser:story
pnpm test:browser:story:continuous
pnpm test:browser:passage:authoring
node --import tsx scripts/story-motion/check-legacy-pixels.ts --output-dir <new-directory>   # legacy parity
```

Each phase records commands, results, renderer versions and limits in this document before its status becomes `[x]`. Generated media goes into new directories under `benchmarks/results/`; no existing render directory is overwritten.

## Implementation record

Implemented on 2026-09-27. The [authoring guide](motion-craft-engine.md) defines the shipped semantics and limits. New examples and the Buffer Press pose comparison are in [`benchmarks/fixtures/motion-craft`](../benchmarks/fixtures/motion-craft/). The implementation preserves the opt-in boundary; versions are `story-canvas-0.19.0`, `commerce-canvas-0.20.0`, `cinematic-canvas-0.9.0` for cinematic shared effects, and `story-join-1` for cached joins. Legacy versions are unchanged.

| Phase | Delivered and checked                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MC1   | Shared monotone tangents, smooth keys, temporal handles, beziers, bounded analytic springs, added easing names and accelerated entrances. Spring sampling uses scene FPS. Unit continuity/endpoints and browser samples across key joins pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| MC2   | Ordered replace/add/multiply tracks, weights, seeded noise and oscillators, component motion adapters, multiple jolts, consecutive-window inheritance, and writer conflict checks. Buffer Press adds a ducked carrier without baked keys.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| MC3   | Signals, cue retiming, source mappings, deterministic lag, cycle validation, attach/contact/look-at/follow-path/safe-area relationships and shared component value tracks. The later Buffer Press uses one signal, seven drivers and one contact constraint, reducing 442 baked keys to zero; its maximum numeric pose error across all 192 frames and six tracked nodes is **0.000497248**, below the original rounding tolerance of 0.001. The separate v014-g composition has five signals and five drivers replacing all eight recipe move keys. Legacy→opt-in and opt-in→rewrite each match 192/192 decoded frames exactly on the current engine. Both opt-in and rewrite outputs also match the saved v014-g MP4 byte for byte through the pinned archival-transform replay. |
| MC4   | Generic scenes work independently and inside passages. Recipe expansion preserves Relationship Build poses over all frames and exact browser pixels at nine samples. Semantic checks and the shared effects renderer are available; story motion blur passes export and backward-seek checks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| MC5   | OKLab paint, brush width, trim controls, node blur, skew, compensated anchors, cubic spatial paths, path morphs and line/word/glyph selectors. The property gallery passes nine export comparisons and reverse seeks; completed glyph animation matches the original text renderer exactly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| MC6   | Cached overlap/crossfade/push/match joins and 1–3 frame state ramps. Four join types preserve endpoints and reuse identical cached bytes. Full passage integration confirms unchanged source/cue boundaries, cache reuse and range export. Supply cut-window peak/mean energy ratios are **1.0138, 1.0207 and 1.0100**, below the documented acceptance bound of **1.03**.                                                                                                                                                                                                                                                                                                                                                                                                         |
| MC7   | Curve lint, stable craft codes and paths, optional suggested fixes, reduced-resolution marginal role attribution and explicit render gates. Positive/negative controls cover discontinuities, entrance pops, dead stops, competing focus, story peaks and carrier dominance. v013 Relationship Build and Motif Resolve reproduce entrance warnings. Property-level focal attribution under the isolated archival Canvas transform and pinned v014-g art reports `peak-not-story` for the thin-margin action at frame 85: 2,833 focal pixels against 328,966 other; removing the house-art fade lowers peak energy by 8,854. The warning reproduces the documented concern; it does not approve the study's creative choice.                                                        |
| MC8   | Value/speed graphs, key/handle inspection, signal-driver curves, onion skin, matrix-based paths and pixel-energy plots in story controls and passage playback. Desktop and 390 px checks pass. Serializable intent presets are implemented; the intent-only fixture renders and has zero craft warnings, including pixel checks.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Verification on pinned Node 22.23.1 / pnpm 10.29.3:

- `pnpm check:fast`: passed schema freshness, package boundaries, formatting, ESLint, TypeScript and **391 unit tests**.
- `pnpm test:integration`: **55 tests passed**. A concurrent run had two startup timeouts; the complete isolated rerun passed without changing timeout thresholds.
- `pnpm test:browser:story`: passed **98 parity comparisons**, 14 backward seeks, timing controls, phone layout, a 646-frame export and 30fps CLI export.
- `pnpm test:browser:story:continuous`: passed exact strip/full-reveal and backward-seek comparisons.
- `pnpm test:browser:passage:authoring`: passed nine frame comparisons, editing/recovery, playback, phone layout, audio reuse, cancellation/resume, cache reuse and range export.
- Targeted commerce effect pixel checks passed: stationary/exposure error 0, directional interior error 1, mask leakage 0, and blur extends beyond current geometry. A fresh Lab startup also passed; the full commerce effects UI run had timed out during concurrent Vite startup. [Pixel report](../benchmarks/results/motion-craft-20260927-effects/report.json).
- `pnpm test:browser:motion-craft --output-dir benchmarks/results/motion-craft-20260927-browser-03`: passed **45 preview/export comparisons**, backward seeks for all five fixtures, macro pixel parity, glyph completion and responsive inspector checks. [Report](../benchmarks/results/motion-craft-20260927-browser-03/report.json).
- `node --import tsx scripts/story-motion/check-motion-craft.ts --output-dir benchmarks/results/motion-craft-20260927-quality-04 --allow-current-assets`: saved curve and pixel reports, including zero intent-preset warnings and no compiled continuous-gate failures on either Buffer Press rewrite. Historical limitations are recorded rather than counted as passes. [Report](../benchmarks/results/motion-craft-20260927-quality-04/report.json).
- Direct current-`main` versus branch rendering matched **all 1,344 full-canvas frames** across seven legacy studies, with identical compiled tracks. [Report](../benchmarks/results/motion-craft-main-snapshot/report.json).
- MC7 focal attribution: `pnpm exec vitest run tests/unit/motion-craft-authoring.test.ts tests/integration/motion-craft-focal.test.ts` passed 12 tests, including real browser pixels for same-role fade and press controls.
- Both Buffer Press exports pass all existing continuous pixel gates. The original-profile rewrite has 0 frozen frames, 100% moving share and 3.123 peak/median contrast; the accelerated version has a longest frozen run of 2, 98.953% moving share and 2.962 contrast. Together with the compiled checks, G1–G6 pass. [Pixel-gate report](../benchmarks/results/motion-craft-20260927-quality-04/continuous-pixel-gates.json).
- MC3 v014-g: the [historical verifier](motion-craft-historical-verification.md) SHA-verifies and restores all 20 archived art/font assets. The source-specific replay confirms numeric poses and 192/192 exact decoded current-engine frames for legacy→opt-in→signal rewrite. The archival-transform replay pins engine commit `50b5dca`, changes only Canvas transform order in a temporary checkout, and produces the **exact saved MP4 SHA-256** for both opt-in and rewrite: `59916b3457df4c92e0a188d0d591195fa05a4e477dfd00040b17f7e9a1ac862a`. Both also pass all 192 full-resolution decoded frames at ±2/channel. Focused MC3 tests pass 3/3; TypeScript, ESLint and formatting checks pass.
- MC7 v014-g: the same isolated archival-transform checker runs property-level focal attribution with local copies of the 20 SHA-verified assets. It reports `peak-not-story` for `margin-b.scaleX` / `less-room-remains` and `pressure-b.x` / `shared-strain`; the archived house-art fade's frame-85 counterfactual effect exceeds the thin-margin focal contribution. The [historical verification](motion-craft-historical-verification.md) records exact values and the distinction between Canvas marginal RGB and encoded-video greyscale peak metrics.

Historical evidence and independent baseline limits:

1. The prescribed saved-v012 video checker passes Unequal Margins, then finds an Access Constraint mismatch beginning at frame 72. Direct comparison proves the same discrepancy exists on current `main`; this branch does not introduce it. The archived reference should be reconciled separately rather than overwritten. The periodic 3/3/0/0 observation has not been classified as intended texture versus codec/rounding behavior.
2. The v014-g manifest has three asset checksum differences against current files, so the replay uses the 20 SHA-verified archived assets. Current production alpha coverage rejects the archived transparent `paper` cover declaration. Only generated replay copies remove that declaration; production validation stays enabled. A current-engine legacy replay differs from the saved video starting at frame 11 because matrix application replaced the archived sequential Canvas transforms. The pinned isolated transform reproduces the saved video byte for byte. Direct v014-g versus later Buffer Press comparison still differs in all 192 frames because they are distinct compositions; no parity is attributed to that cross-composition comparison.
3. Opt-in `review.focalEvents` names a cue and node property. The reduced-resolution pixel checker freezes declared focal properties at cue start and compares their marginal change with all remaining change at the peak. A rendered same-node, same-role fade-versus-press scene and its press-dominant control pass positive/negative regression tests. Ambiguous shared-property events, properties without motion inside the named cue, and constraints that can write the focal property fail explicitly. Legacy scenes without focal declarations retain role-level attribution. The v014-g historical composition now reproduces the warning through the isolated archival transform; this is a diagnostic result, not an owner decision on the final motion design.

Implementation limits retained for review:

- Contact solves the first usable permitted degree of freedom against an infinite transformed edge line. Related nodes must share a parent. Safe-area clamping is limited to root nodes; nested safe-area checks are advisory.
- Lag uses a closed-form response to a one-frame piecewise-linear reconstruction of its source. Spatial arc length uses 128 subdivisions per cubic segment. Both approximations are deterministic.
- Existing component pins/travels remain compatible adapters using shared matrices and cycle validation; they have not been rewritten as serialized new constraints. Component value bindings use the common layer evaluator.
- Color tracks support weighted replace in story moves. Overlap and crossfade currently share the same blend; outgoing imagery holds the outgoing endpoint through the join. Handle editing remains deferred as planned.

Generated review media lives in fresh directories. These local outputs are ignored by Git; fixtures, generator, tests, contracts, engine code and documentation are the reviewable branch changes.

## Out of scope and risks

- **Out of scope:** new artwork, episode choreography, creative acceptance of any study, 3D, a general expression language, physics simulation with state, audio design.
- **Risk: layered motion enables decoration.** Mitigated by MC7 `carrier-dominance` and `peak-not-story`, and by MC2's `weight` ducking.
- **Risk: springs and smooth keys overshoot into invalid ranges.** Mitigated by per-property clamping (MC2) and validation of monotone segments (MC1).
- **Risk: cache identity drift.** Every new field enters the resolved scene hash; the render-job comparison (`--compare-with`) is run on fixtures after each phase.
- **Risk: sub-frame blur cost.** Motion blur samples are bounded (≤32) and cached per beat; the phase records render-time measurements as single local observations, not benchmarks.
