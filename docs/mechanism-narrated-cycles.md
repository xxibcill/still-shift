# Compile mechanism tracks from supplied narration cues

`compileMechanismNarratedCycle(instance, document)` accepts the versioned
`mechanism-narrated-cycle-1` contract and returns an ordinary editable native
composition, its compiled state timeline and the shared cue map. See the
[generated JSON Schema](./schemas/mechanism/narrated-cycle.schema.json).
The compiler performs no asset I/O or paid generation. The normal composition
loader subsequently verifies declared source hashes and decoded audio/font facts.

The document pins a native version 2 pack source, a font and a 48 kHz narration
asset. Tape graduation artwork binds that same pinned font; unresolved alternate
texture-font references are rejected. Cues name actual source sample intervals, semantic initial/contact/release/
return/reset events, authored states, caption text, minimum action time, camera
editing choices, optional anchored annotations and supplied sound assets.
The [state timeline contract](./mechanism-pack-timelines.md) declares the legal
transitions and required physical relationships. Event names do not override
variant rules: a non-releasable ratchet cannot acquire a latch release merely
because the author names a cue `release`.

Motion keys refer to cues instead of fixed episode frames:

```json
{
  "rig": "slider",
  "control": {
    "type": "slider",
    "keys": [
      { "at": { "cue": "intro" }, "value": 0, "easing": "hold" },
      { "at": { "cue": "release" }, "value": 0.18 },
      { "at": { "cue": "return" }, "value": 0 }
    ]
  }
}
```

References support the cue's `start` or `end` sample edge and an integer
`offsetSamples`. Slider, hinge, spring return and ratchet writers reuse the existing
whole-interval validator after resolving their references. Unknown references,
conflicting writers, invalid stops/transitions and references outside the
recording fail before a composition is returned.

All five tracks use the same resolved map:

- **Picture:** one native world, cue-driven controls and camera keys. Cut/hold/
  transition choices remain authored; a held pose cannot silently change. Camera
  near/far planes remain the scene's planes and incompatible changes are rejected.
- **Annotations:** screen labels and declared tabs, open callouts, brackets, arrows
  or restrained outline highlights appear within the cue window. Omitted style
  preserves the original filled tab and leader. Unknown anchors and starts outside
  the viewport are rejected; explicit visibility policy controls hidden/offscreen
  behavior. See the recipes below.
- **Captions:** original text and locale use the pinned font and cue window, with
  a dark backing to preserve contrast against light mechanism scenes.
- **Sound:** supplied effects start with their cue; declared source trims and tails
  must fit both their actual source and the narration interval. Source identity
  conflicts fail instead of replacing an asset.
- **Narration:** the entire pinned recording keeps sample range `[0, sampleCount)`
  and its original source clock. No time stretch/remap or filler audio is generated.

Source cue timestamps stay exact PCM samples. The composition's placement clock
uses integer output frames: a cue starts on the first frame at or after its source
sample. `cueMap.onsetDelaySamples` reports that deterministic delay (less than one
frame interval, subject to integer PCM boundary rounding). Visual windows and
sound onsets use the same placement; motion and state keys use that same frame.
The final output is the recording duration rounded up to the final video frame,
with the source sample count retained separately from the render boundary count.
This frame quantum is not an authored extension to satisfy a shot template.

Cues must start at sample zero, be ordered and non-overlapping, and fit the supplied
recording. The next cue or actual recording end bounds each semantic action; its source
interval and visible frame hold must both satisfy the declared minimum.
Caption and annotation reading checks count locale-aware graphemes against the
explicit reading policy (default 18 graphemes/second) and both source and visible
frame durations. Overfull actions, insufficient reading windows, collapsed frame
intervals and out-of-recording sound tails produce located failures.

Replacing narration with a valid shorter take means supplying its new pinned
sample count/hash and its new cue sample intervals, then recompiling. Picture,
annotation, caption, sound and state timings all change together. There is no
fixed nine-shot duration. The contract permits 64 cues, eight rig writers and
eight annotations/sounds per cue, with the existing composition/frame/key budgets.
Track IDs are derived from separate cue/member identities, remain bounded and
repeat deterministically.

The live software fixture uses **synthetic local PCM**, not spoken narration:
three candidate families, two recording lengths and repeated actual native exports
with independent observation replay and complete decoded video/audio comparisons.
These checks prove timing/compiler/export behavior; they do not establish human
listening acceptance, narration quality, continuous physical correctness or a
supported pilot. Full rendered label layout/readability, registry/coverage,
whole-resource/lifetime accounting, final installed verification and remaining
MS2/MS3 acceptance requirements retain their separate gates.

Spring driver association keys explicitly use Float32 input precision, matching
the declared GPU storage. Tiny cross-runtime Float64 trigonometric differences do
not invalidate an otherwise identical uploaded mesh. Shape sampling remains
Float64; independent observation still verifies exact used position/normal/index
byte digests and the current part/landmark relationships. This changes the opaque
spring key prefix to `spring-f32:`; source/execution identity and final archive
verification must be refreshed for the new producer.

[Cue-wide crowded-label placement](./mechanism-cue-layout.md) adds locked/priority
candidates and projected contact exclusions with actual rendered visibility proof.

## Screen annotation recipes

An annotation's optional `style` selects one recipe; its text, anchor, position,
reading window and cue-wide layout locks/priority/candidates retain the existing
contract. The same authoring fields are accepted by the revision-safe `annotation`
patch operation. Omitted optional fields preserve existing authored values in that
operation; explicitly select `tab` to restore the legacy presentation.

| `style.kind`   | Result                                                                    | Bounded options                                                                                                  |
| -------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `tab`          | Original text, filled backing and moving leader; exact legacy composition | No additional options                                                                                            |
| `open-callout` | Open three-sided border with matching text/leader ink                     | `ink`: RGB hex, default `#101820`                                                                                |
| `bracket`      | Four-point range path joining two physical anchors                        | `toAnchor` required; `offsetPixels` each ±512, default `[0,20]`; positive `tickPixels` ≤64, default 6; RGB `ink` |
| `arrow`        | Moving tip and screen-tangent triangular head                             | Positive `headLengthPixels`/`headWidthPixels` ≤256, defaults 12/8; RGB `ink`                                     |
| `highlight`    | Subtle anchored outline alongside the label/leader                        | `sizePixels` each 2–512 and smaller than the viewport; `opacity` 0.05–0.5, default 0.35; RGB `ink`               |

Arrow, bracket and highlight ink defaults to `#101820`; tabs retain their original
paint. Arrow shafts and heads use the same selected ink. Open callouts use the supplied ink for border, text and leader. Select ink
that preserves contrast in the actual shot. A highlight has a 1.5px outline with
no fill. Arrow heads shorten on small segments using the composition binding's
45% length/25% half-width caps, and collapse safely on a zero-length segment.

```json
{
  "id": "span",
  "text": "Gap",
  "anchor": "hook.outerFace",
  "position": [18, 18],
  "layout": { "locked": true },
  "style": {
    "kind": "bracket",
    "toAnchor": "wall.contact",
    "offsetPixels": [0, 20]
  },
  "visibility": { "policy": "hide-occluded" }
}
```

`visibility` optionally declares `policy: hide-occluded | offscreen-indicator`,
`visibleWhen: shown | indicator`, and `insetPixels` (0–4096, default 12).
Omission preserves hide-occluded. Indicator-only presentation requires the
indicator policy; hidden-part, occluded, behind-camera and clipped anchors hide
both policies. Visible anchors use their actual pixels; offscreen arrow/bracket
endpoints and highlights clamp to the owning viewport under the explicit indicator
policy. Labels stay at their solved screen positions. An offscreen highlight's
inset must enclose half its larger dimension plus 1px; an invalid request fails at
`visibility.insetPixels`.

A bracket's label, backing and path share an identity group bound to both anchors.
Both must be shown; either hidden endpoint hides the complete annotation. The
indicator state is true if either shown endpoint is outside-frame. The group uses
explicit `[0,0]` anchor/position so layout coordinates remain owning-screen pixels.
This is necessary because ordinary shape/null parenting carries transforms without
inheriting visibility. The shared `composition-1` visibility target accepts up to 31
additional unique anchors and validates all references before their visible interval.
Evaluator version 59 records this extension; ordinary parenting remains unchanged.

The renderer and graph own path binding, screen transforms, glyph measurement and
paint. Recipes add no separate family renderer. The all-frame three-family style
proof is `pnpm test:browser:mechanism-annotation-styles`, registered in the full
local matrix. It uses synthetic PCM and retains actual preview/font/anchor facts,
reverse/shuffled seeks, repeated native finals and independent closure replay.
World text, actual surface markings, label-only plate reuse, genuine-speech renders,
continuous-time/encoded readability and human acceptance retain separate MS2 gates.
