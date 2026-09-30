# Motion craft authoring

Motion craft is available on `main` (merged from `codex/motion-craft-engine`). A story or commerce scene opts in with `motionModel: "curves-1"`. Legacy scenes retain their existing evaluation path and renderer version. New versions are `story-canvas-0.19.0`, `commerce-canvas-0.20.0`, and, for cinematic shared effects, `cinematic-canvas-0.9.0`.

Start with the complete scenes in [`benchmarks/fixtures/motion-craft`](../benchmarks/fixtures/motion-craft/). They include Buffer Press, accelerated Buffer Press, the property gallery, supply state ramps, and intent-only authoring. Their asset paths resolve relative to their JSON files.

## Curves and layers

Keys use integer `frame` values. The destination key owns the segment easing. `smooth: true` at an interior key uses monotone Hermite tangents; `in` and `out` specify temporal influence and optional speed in units per frame. Explicit bezier handles have normalized x coordinates. Springs use scene seconds and land exactly on the endpoint.

```json
{
  "motionModel": "curves-1",
  "recipe": {
    "preset": "generic",
    "moves": [
      {
        "node": "subject",
        "layer": "action",
        "keys": [
          { "frame": 0, "x": 100 },
          { "frame": 24, "x": 300, "smooth": true },
          { "frame": 48, "x": 500 }
        ]
      }
    ],
    "emphasis": []
  }
}
```

This is a motion fragment, to merge into a complete scene with a `subject` node. `entranceProfile: "accelerate"` changes supported entrance easing while retaining its duration.

| Layer    | Default blend                             |
| -------- | ----------------------------------------- |
| action   | replace                                   |
| response | multiply for scale/opacity; add otherwise |
| current  | add                                       |
| carrier  | add                                       |

Layers evaluate in that order, followed by range clamps. Add contributes `value × weight`; multiply contributes `1 + (value − 1) × weight`; replace interpolates from the preceding value. A missing weight means one. Weight curves are clamped to [0, 1]. Overlapping replace writers fail with `motion-conflict`; additive and multiplicative writers compose. Consecutive replace windows inherit the preceding endpoint, regardless of JSON ordering.

Numeric keys hold their endpoints outside their key range. Replace tracks begin at their first key. Periodic generators are active only inside their declared window. Fade the weight to zero when a periodic motion should enter or leave without a discontinuity. `oscillate` uses radians for phase; `noise` uses an explicit integer seed. Both support fractional sampling and backward seeks.

## Signals and relationships

`signals` contain scalar keys and optional cosine pulses, sine oscillators or seeded noise. A driver reads one signal, another node's evaluated numeric property, or a sum of sources. Mapping order is delay/lag, range-to with easing, scale, clamp, step, then offset. `step` rounds downward in the specified increment. A signal's cue retimes its keys and pulses together.

`lag` is a critically damped response solved analytically over deterministic one-frame linear source intervals. It has no playback state; for nonlinear source curves, the source reconstruction is a bounded sampling approximation. Very long dependency chains with lag cost more than ordinary curve sampling.

Constraints support `attach`, `contact`, `look-at`, `follow-path` and `keep-in-safe-area`. Related nodes must share a parent. Contact projects a local point onto an infinite transformed edge line; it solves the first usable property in `solve`, rather than running a physics simulation. It does not enforce the finite extent of the edge. Safe-area checks are advisory unless `clamp: true`; clamps require root nodes. Incompatible coordinate spaces and dependency cycles fail validation.

Existing component value bindings compile into the same numeric layer tracks when opted in. Existing pins and travels retain their established evaluators, participate in dependency checks, and use shared node matrices; their serialized component formats remain compatible. Component motion windows can declare layer, blend and weight.

## Composition, paint and text

`recipe.preset: "generic"` works in scenes and passages. `expandStoryRecipe(scene)` expands legacy recipe tracks into portable primitives without sampling away their easing. `checks` can require stable canvas anchors or minimum projected clearance. Templates with fractional generated frame times need integer timing before portable expansion.

The numeric vocabulary adds stroke width, trim start/end/offset, blur, skew and normalized anchor coordinates. Animated anchors compensate translation to preserve artwork placement, and attachment constraints can target the moved anchor. Brush texture dimensions retain the authored width while the envelope changes. Paint tracks accept six-digit hex colors and interpolate in OKLab. Paint supports weighted replace; additive/multiply color is rejected. Paint tracks currently live in story moves.

Spatial paths use joined cubic segments and deterministic arc-length tables with 128 subdivisions per segment. XY keys can carry relative spatial handles. Follow-path orientation uses the transformed tangent. Morphs require equal point counts. Text animators select lines, words or grapheme clusters, with stagger and opacity/offset/scale/rotation/blur/color. Completed text delegates to the existing text renderer, preserving its completed pixels and measured wrapping.

Story scenes can use `effectsVersion: "effects-1"` with motion blur, directional blur, focus, glow, grain and light sweep. Cinematic scenes use the same effects opt-in independently of the motion model. Blur subframes stay internal; authored addresses remain integer frames.

## Joins and state ramps

Passages opt in with `transitionModel: "joins-1"`. Incoming beat handoffs can use `overlap`, `crossfade`, `push` or `match`, with `frames`, optional `easing` and push `direction`. The join occupies the first N incoming frames and renders outgoing scene frames after its nominal beat boundary. To keep an outgoing subject moving through the join, author its motion through beat frame count + N − 1 and give the template enough frames to validate those keys. Motion without authored continuation holds its endpoint. The outgoing render handle does not change beat durations, source intervals or narration cues. Overlap and crossfade currently share the same opacity blend.

Match requires an explicit carried identity, compatible root-node geometry, and motion craft on the incoming scene. It adds a response curve from the outgoing pose difference back to the incoming motion. Join cache keys include both beat identities, transition data, frame rate and join renderer version.

Component state cuts accept `ramp: 1`, `2` or `3`. The old state is exact at the cut frame; the new state is exact at cut + ramp. Ramps cannot overlap or extend outside the scene. Hard cuts remain the default.

## Inspection and verification

The Illustrated Lab's story controls and the passage timeline include a motion inspector. Select a node/property and inspect final value, speed, authored layers and signal drivers. Key buttons expose handles and seek to the corresponding beat-local frame. Onion skin, matrix-based paths and measured role energy use the same renderer as export. Graphs are read-only.

`intentPresets` uses `schemaVersion: "story-motion-presets-1"` and supports `settle`, `press`, `recoil`, `handoff`, `breathe`, `draw-on` and `land`. Each entry takes node, window, optional numeric property and amount. These expand into serializable curves or periodic layers. Use a window long enough to keep the rounded interior keys distinct.

Motion diagnostics are advisory by default. Render commands accept `--require-motion-craft`; they measure reduced-resolution pixels and gate the configured craft codes. `requireMotionCraft(diagnostics, codes)` selects a custom gate set. Per-role pixel contributions are measured by leaving one role out and comparing temporal pixel changes. Because compositing and occlusion interact, marginal contributions do not sum to total energy. Legacy scenes without `review.focalEvents` retain the role-level `peak-not-story` check.

To check whether the strongest change belongs to a particular action, declare each focal node, numeric property and existing event cue in `review.focalEvents`. For example, `{"node":"band","property":"y","cue":"press"}` refers to an action event whose window has `cue: "press"` and animates `band.y`. The pixel analyzer freezes the declared properties at their cue starts and measures both the focal marginal change and the remaining change at 320×180. `peak-not-story` warns when the peak is outside every declared focal window or the remaining change exceeds 1.25 times the focal change. This catches an opacity fade that overpowers a press even when both motions have the same role and focal group. The declaration affects analysis only; it does not change rendered scene frames.

A cue must identify one action event and one independently animated property that changes between frames inside its window. A change only at the boundary from a preceding event does not qualify. A scene may declare only one focal cue per node property. Adjacent events are allowed; overlapping events on that same node property, constraints that can write that property, and missing or duplicate cue bindings fail with `focal-event-ambiguous` instead of producing a misleading pass. Entrance `assemble` child motion cannot be named through its parent cue; declare a separate attributable child event. The combined focal counterfactual is a marginal measurement, so occlusion and compositing still make contributions non-additive.

```sh
pnpm check:fast
pnpm test:integration
pnpm test:browser:motion-craft --output-dir benchmarks/results/<new-directory>
node --import tsx scripts/story-motion/check-motion-craft.ts --output-dir benchmarks/results/<new-quality-directory>
```

The historical quality command expects the local v013 and v014-g render manifests. If artwork has changed, it fails unless `--allow-current-assets` is explicitly supplied; changed checksums are recorded. Coverage validation remains enabled. A historical replay that fails coverage is recorded as unverified, rather than counted as an acceptance pass. See the [implementation record](motion-craft-engine-plan.md#implementation-record) and [historical verification](motion-craft-historical-verification.md) for results and remaining acceptance work.
