# Illustrated sequences: reveal, action, consequence

Three reusable Story templates demonstrate limited animation using still artwork,
layer movement, an exact image-state change and camera-led reframing. They apply
the methods identified in the [Househusband research](the-way-of-the-househusband-research.md)
to Still Shift's own illustration family. They use the existing deterministic
renderer and contain no anime artwork.

The shipped proof is **30 seconds, 720 frames, 24 fps, 1920×1080, silent**. It
explains one symbolic distinction: a resource can remain present while access to
it becomes constrained. It does not depict a documented historical incident or
measured quantities.

The [narration-led version](../assets/illustrated-sequence/narration-v001/README.md)
now demonstrates performed pacing: **20.625 seconds**, using the Wry Archivist
voice. Its word timings drive the reveal, close-up, state change, separate final
captions and pullback. The [narrated preview](../benchmarks/results/illustrated-sequence-narrated-v002/index.html)
includes the voice in the video. The original silent proof remains available.

Open **narration-paced version** in the Passage workbench to edit its template.
For synchronized Lab playback, expand **Preview aids** and load
`assets/illustrated-sequence/narration-v001/narration.wav` as the **Narration file**.
The rendered preview already includes this audio.

## Preview and export

Run `pnpm lab`, open the [Passage workbench](http://127.0.0.1:4173/passage.html)
and choose **30-second illustrated sequence**. The
[direct example link](http://127.0.0.1:4173/passage.html?plan=benchmarks%2Ffixtures%2Fillustrated-sequence%2Faccess-story.json)
loads the plan, all three templates, artwork and fonts. Scrub the shared timeline
or choose a beat to inspect its cues and parameters.

The checked-in inputs work without regeneration. To rebuild them after editing
the TypeScript authoring source:

```sh
pnpm story:sequence:prepare
```

This rewrites the generated example JSON and three new SVG files. Edit a copied
plan/template for your own production work, so regeneration cannot overwrite it.

Render to a **fresh** output directory:

```sh
pnpm story:passage \
  --plan benchmarks/fixtures/illustrated-sequence/access-story.json \
  --output-dir benchmarks/results/my-illustrated-sequence-v001 \
  --silent
```

The output contains `passage.mp4`, `index.html`, a poster, motion contact sheet,
per-beat renders and diagnostics. For a portable input package:

```sh
pnpm story:package \
  --plan benchmarks/fixtures/illustrated-sequence/access-story.json \
  --output-dir benchmarks/results/my-illustrated-workspace-v001
```

## Shot plan and continuity

The governing plan is
[`access-story.json`](../benchmarks/fixtures/illustrated-sequence/access-story.json).
This first implementation uses three compositions to exercise the three reusable
patterns; it does not implement the research report's optional six-shot treatment.
Timing is authored for a silent proof, not derived from a recorded voice-over.

| Shot / interval                        | Viewer question and visible explanation                                                                                 | Camera, action and copy                                                                                                                                                 | Exit and continuity                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `detail`, 0–8 s, frames 0–191          | What connects the household and grain? A route appears between the established subjects.                                | Wide arrangement develops toward the route. Reveal starts at 1 s, becomes opaque at 2.5 s and completes its slide at 4 s. “A household depends on access.” stays fixed. | Cut closer to the same route; house remains left and grain right.          |
| `action`, 8–18 s, frames 192–431       | What changes? Opposing wedges converge; the route becomes visibly narrower while staying open.                          | Close-up. Wedges fade in at 9–10 s and converge at 10–12 s. The artwork changes exactly at global frame 288 (12 s). “Access narrows.” follows at 12.5–13.5 s.           | Keep the restricted state after the action, including across the next cut. |
| `consequence`, 18–30 s, frames 432–719 | Has the resource disappeared? The full basket remains while the camera restores the household and altered relationship. | Retreat toward the household/context. “The grain remains. Access has changed.” appears at 19–20 s in empty space above the basket.                                      | End with both subjects and the restricted route readable.                  |

Each shot continuously changes its camera framing. Copy has camera depth zero and
stays fixed on screen. World artwork shares a camera plane; this is 2D limited
animation with camera movement, not a new depth-estimation or character-rig system.

The state swap uses registered images with identical dimensions and endpoints.
The consequence template explicitly starts in state 1. Cuts reset the camera,
and subject positions preserve left/right orientation. No morph invents an
intermediate resource quantity. The likely misleading reading—less grain rather
than less access—is addressed by keeping the same basket art and changing only
the route and pressure shapes.

## Reuse the templates

The templates live in `benchmarks/fixtures/illustrated-sequence/`:

| Template                    | Reusable job                                                                                        | Key event             |
| --------------------------- | --------------------------------------------------------------------------------------------------- | --------------------- |
| `detail-reveal.json`        | Establish subjects and expose a relationship or important detail.                                   | `route-reveals`       |
| `action-state-change.json`  | Move separate layers into contact, switch to a registered after-state, then introduce the response. | `access-changes`      |
| `reaction-consequence.json` | Preserve the changed state and reveal its wider significance.                                       | `consequence-appears` |

Every template exposes `caption`, `householdArt`, `resourceArt`, `beforeArt`,
`afterArt` and `pressureArt` slots. Supply replacements through a beat's
`parameters`. Asset values use the normal `{ id, path, sha256, width, height }`
contract; the template slot retains the target asset identity. Replacement paths
in beat parameters resolve relative to the passage plan; a template's own asset
paths resolve relative to that template. Use matching bounds and subject registration for before
and after artwork. Captions have fixed readable boxes; overflow is an error.

For this linked passage, edit the **Narration cues** control even though the proof
has no recorded narration. The named `restriction` cue is local frame 96 in the
action beat. Moving it to 108 also moves wedge arrival, both entrance windows and
the caption response by 12 frames. The beat boundaries stay unchanged. The
`connection` and `consequence` cues likewise drive their linked events.

The `revealTiming` and `changeTiming` template slots expose individual events for
unlinked use. The example's passage bindings are authoritative; use its cues to
retime the complete action rather than trying to override a linked event through
a timing slot. Keep events within the beat and let compiler diagnostics reject
invalid timing.

These are reusable **composition patterns**, not arbitrary layout generators.
Different artwork proportions, character poses or meanings need a framing and
copy-placement review. To change framing or duration, edit the template camera
keys and event windows alongside the plan's beat duration. Portrait output needs
authored vertical overrides; none are included in this first example.

## Implementation and verification

- `scripts/illustrated-sequence/templates.ts`: pure template and plan builders.
- `scripts/illustrated-sequence/art.ts`: registered route states and pressure art.
- `scripts/create-illustrated-sequence.ts`: reproducible fixtures and asset hashes.
- `tests/unit/illustrated-sequence.test.ts`: visibility, exact state swap,
  continuity, linked retiming, parameter replacement and continuous camera tests.
- `apps/lab/passage.html` and `src/passage.ts`: example shortcut and `?plan=` loading.
- [Asset record](../assets/illustrated-sequence/README.md): source lineage,
  inspected composition and limits.

The initial visual review caught an invisible fade target; a regression test now
asserts that route, pressure and response layers actually become visible. The
initial text-overflow diagnostic was resolved by shortening the final caption.
The current render has no compiler diagnostics. Export contact sheets and decoded
frames were inspected for registration, open-route clarity, caption spacing and
the consequence composition. These checks do not establish audience retention or
normal-speed editorial approval.

Verification on 2026-09-28:

- `pnpm check:fast` passed: schema, dependency boundaries, formatting, lint,
  TypeScript and all 433 unit tests (including five sequence tests).
- A complete silent export produced 720 frames with no compiler diagnostics in
  `benchmarks/results/illustrated-sequence-v003/`.
- The Lab example link loaded all three beats. Editing the action cue moved its
  linked events together; Undo restored the original frame 96 timing.
- `pnpm story:package` produced a 10-file portable workspace in
  `benchmarks/results/illustrated-sequence-workspace-v001/`.

The local [review page](../benchmarks/results/illustrated-sequence-v003/index.html)
and [video](../benchmarks/results/illustrated-sequence-v003/passage.mp4) are generated
outputs, excluded from Git. Regenerate them with the command above on another checkout.

The templates, silent proof and narration-led pacing example are implemented.
The Creator accepted the narrated example as “good enough for this version” on
2026-09-28. That accepted narration-only version remains unchanged.

The subsequent [linked sound feature](passage-audio.md) adds a reusable audio
contract, Lab controls, synchronized playback, portable sound assets and export
mixing. Its example plan is `sound/access-story.json` alongside these templates.
It reuses the accepted pictures and voice with four original procedural accents.
Character mouth/pose libraries and full episode integration remain future work.
