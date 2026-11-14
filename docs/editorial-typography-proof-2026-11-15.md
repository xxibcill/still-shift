# Editorial title overlays over video: bounded proof and gap assessment

Date: 2026-11-15. Follows the [assessment handoff](./editorial-typography-assessment-handoff-2026-11-15.md).
Evidence, checksums and lint output: [results JSON](./editorial-typography-proof-2026-11-15-results.json).
Source: [`research/editorial-typography-proof/`](../research/editorial-typography-proof/README.md).
Review images: [`docs/review/editorial-typography-proof-2026-11-15/`](./review/editorial-typography-proof-2026-11-15/).
Milestone plan: [editorial typography improvement plan](./editorial-typography-improvement-plan.md).

## Answer in brief

Still Shift can already render varied editorial titles over a vertical video crop.
It has pinned fonts, variable axes, per-glyph/word/line animators with masks and
blur, decorations, native shapes and native video. All three treatments rendered
in about 18 s each, and each needed a second pass to fix problems visible in the
frames.

The partial support is in the layers above rendering:

- **Layout across layers** is only partly measured. `attach` follows measured text
  bounds, but those bounds are the font's line box widened by every animation
  excursion, so labels landed 153/213 px from a headline instead of 18/30 px.
- **Font choice** is limited by inventory. The repository pins two Plex cuts, one
  Source Serif weight and Noto Sans Thai: no italic, script, display or condensed Latin.
- **Video-aware checking** is missing. Pixel lint fails on every composition with a
  native video layer, and composition lint has no text-contrast rule, so nothing
  measures type against the actual moving frames.
- **Copy correctness** is not guarded. A pinned font with no Thai glyphs renders Thai
  from an unknown fallback face with no warning.

These are concrete, fixable engine gaps. Hierarchy, font pairing and taste are not
engine features at all today; they were all manual decisions in this proof.

## What was made

No live-action or fashion footage exists in the repository. The proof uses the
local Still Shift render `ci-09-layered-parallax.mp4` (generated courtyard kit,
slow parallax, one standing figure; 1920×1080, 24 fps, 7 s), cropped to
1080×1920 inside each composition. It stands in for footage. It is illustrated,
the camera moves only slowly and the subject does not walk, so it under-tests
subject motion and photographic texture. Copy: "Three ways to wear / Olive", Thai
"สามลุค / โทนเขียวมะกอก" and the mixed tag "3 ลุค · OLIVE GREEN".

| Treatment                                                                                      | Fonts and hierarchy                                                          | Placement and contrast                           | Motion                                                                                                         |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| [T1 editorial stack](../research/editorial-typography-proof/t1-editorial-stack.ts)             | 250 px Source Serif word, tracked Plex Mono kicker, Plex Sans folio          | Dark olive on the bright wall left of the figure | Glyphs rise through a line mask; kicker closes tracking; hold opens tracking; reverse-order lift and blur exit |
| [T2 condensed Thai poster](../research/editorial-typography-proof/t2-thai-condensed-poster.ts) | Noto Sans Thai at wght 900/wdth 62.5, Thai subline, mixed tag on a highlight | White over a gradient scrim on the paving        | Per-glyph swell from the thin/wide to the black/condensed instance; hold drift; glyphs thin and drop on exit   |
| [T3 minimal centred](../research/editorial-typography-proof/t3-minimal-centered.ts)            | 62 px lowercase serif line, tracked mono credit, drawn hairline              | Dark ink in the sky band, crossing the roof edge | Seeded word blur-in; rule draws on; tracking opens and dissolves on exit                                       |

Phone-scale sheets (entrance 16/24/32, hold 60/100, exit 130/138/146, 360×640 each):
[T1](./review/editorial-typography-proof-2026-11-15/t1-pass2-phone-sheet.jpg),
[T2](./review/editorial-typography-proof-2026-11-15/t2-pass2-phone-sheet.jpg),
[T3](./review/editorial-typography-proof-2026-11-15/t3-pass2-phone-sheet.jpg).
First-pass sheets are kept beside them.

**What the proof demonstrates:** with existing primitives, an author can render
three typographically distinct, animated title treatments on a moving vertical
clip, deterministically and quickly, including mixed Thai/English in a covering
font. It also shows that review of rendered frames found every substantive problem.
The existing checks found few of them.

**What it does not demonstrate:** aesthetic quality or human acceptance (only an
agent reviewed the frames); results on real fashion footage, photographic texture,
fast subject motion or cuts; reference looks needing script or italic faces;
automatic design, ranking or adaptation to other copy; WebGL2 output; Thai beyond
one word in one font.

## Findings

Classified as observed defects (reproduced in renders), check gaps and limits
(confirmed in source or runs), and passes. Details and frame numbers are in the
[results JSON](./editorial-typography-proof-2026-11-15-results.json).

| ID  | Finding                                                                                                                                                                                                                                                                                                                                                                           | Class                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| O1  | `attach` uses the font line box, not ink or cap height, and widens it by animation excursions. Authored gaps of 18/30 px became 95/109 px static and 153/213 px animated ([comparison](./review/editorial-typography-proof-2026-11-15/t1-pass1-attach-static-vs-animated.jpg)). The target's `constraintReference` is in absolute layer pixels, not normalized to its own bounds. | Observed defect           |
| O2  | `align: "center"` centres on the layer origin, not inside `textLayout.width`; half of T3's title rendered off-frame. Validation and render reported success; measured lint gave only the same `outside-safe-area` warning used for a few-pixel incursion.                                                                                                                         | Observed, unguarded       |
| O3  | A highlight decoration ignores text-animator opacity, leaving a bare bar after the tag faded.                                                                                                                                                                                                                                                                                     | Observed authoring trap   |
| O4  | `comp lint --pixels true` fails with a browser navigation error on all six video-backed runs; the same compositions lint once the video layer is removed.                                                                                                                                                                                                                         | Observed, not root-caused |
| O5  | Thai copy in pinned Plex Sans renders from a face outside the composition: `valid`, `rendered`, no warnings, empty `systemFontLayers` ([image](./review/editorial-typography-proof-2026-11-15/coverage-negative-plex-thai.jpg)). No code under `packages/*/src` reads `cmap`.                                                                                                     | Observed (known gap)      |
| O6  | Composition lint has no text-contrast rule (`text-contrast` exists only for story specimens). T3's `· 03` and hairline cross the dark roof edge under parallax unreported ([crop](./review/editorial-typography-proof-2026-11-15/t3-pass2-top-band-contrast.jpg)).                                                                                                                | Check gap                 |
| O7  | Default `reading-time` fails every treatment with a gentle hold drift (0.00–0.13 s readable), which conflicts with the owner's continuous-motion preference.                                                                                                                                                                                                                      | Policy conflict           |
| O8  | State lint calls footage-only spans frozen; O9: state lint cannot evaluate `attach` on text at all.                                                                                                                                                                                                                                                                               | Check limits              |
| O10 | Font-axis validation rejected a hold `wght` delta that frame analysis keeps in range; worst-case reasoning is more conservative than the timeline.                                                                                                                                                                                                                                | Not root-caused           |
| O11 | A small detached fragment beside the serif "v" during the masked per-glyph entrance (frames 30–36); settled frames are clean.                                                                                                                                                                                                                                                     | Minor, not root-caused    |
| P1  | Per-glyph Thai animation kept U+0E38 with its consonant, and `wght`/`wdth` animation rendered, in the inspected frames ([crop](./review/editorial-typography-proof-2026-11-15/t2-pass1-thai-glyph-marks.jpg)).                                                                                                                                                                    | Pass for this copy only   |

Untested risks that remain as documented in the
[typography plan](./typography-motion-engine-plan.md): finer Thai segmentation
below grapheme clusters, script-sensitive optical tracking, mixed-size mask
extents, and phone-scale x-height floors over video.

### Manual decisions in every treatment

Every one of these was a human-style judgement, encoded as coordinates or numbers:
which words lead and at what scale; which font plays which role; where the free
area is relative to the figure; whether to use a scrim; the tracking that keeps
serif letters from colliding (T1 pass 1 touched at −35); label sizes legible at
phone scale (30–32 px was too small at 1080 wide); that the bottom tag sits in
the area platform captions usually cover; and when entrance, hold and exit happen.
Moving the copy to another clip or language would require repeating most of them.

## Core versus an external authoring layer

**Belongs in Still Shift's core** (deterministic, measurable, needed by any author):

1. Exact-copy coverage: a strict gate naming font, layer, span and missing code
   points, plus reported fallback policy (O5; already scoped as MS1, 3–5 days).
2. Pixel lint that runs on native video, then a composition `text-contrast` rule
   that samples the rendered background under measured glyph bounds on every
   reading frame (O4, O6).
3. Layout anchors for measured cross-layer arrangement: rest/settled bounds
   separate from motion-union bounds, ink/cap/baseline reference boxes, and target
   points normalized to the target's own bounds (O1).
4. Guards for silent framing traps: partial off-canvas severity scaled by the
   hidden fraction, and decorations following their text's opacity or a lint for
   orphaned marks (O2, O3).
5. A Node-side text measurement API that returns the same prepared bounds without
   a full render, so an external planner can fit copy before rendering.
6. An editorial-title lint profile that permits slow intentional hold drift (O7),
   once the owner sets the reading/motion rule.

**Better in an external authoring/orchestration layer** (taste, footage
understanding, search):

- Font library curation, licensing, pairing metadata and role tags. Still Shift
  only pins and verifies the chosen bytes.
- A design grammar and candidate generator that writes builder programs (hierarchy,
  pairing, proportion, treatment, timing), with room for creative variation.
- Footage analysis: subject mattes, saliency and free-space maps over the title's
  visible frames, and platform UI zones. Mattes can enter Still Shift as `sequence`
  layers used as track mattes (for text behind a subject); placement can enter as
  coordinates or constraints.
- Rendering many candidates, contact sheets, a visual critic, human selection and
  any preference learning. Still Shift should supply the deterministic render and
  per-frame diagnostics; the ranking and taste live outside.

## Priorities by user value and evidence

| Priority | Work                                                                                       | Why now                                                                                | Evidence        |
| -------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | --------------- |
| 1        | Strict exact-copy coverage gate (cmap + reachable text + fallback report)                  | Silent wrong glyphs in Thai/mixed copy; prototype reader in this proof; already scoped | O5 observed     |
| 2        | Repair pixel lint with native video; add composition `text-contrast` over video            | Without it no automated check sees the footage; prerequisite for any visual critic     | O4, O6 observed |
| 3        | Rest/ink-aware attach bounds and normalized target reference                               | Makes measured multi-layer layouts adapt to copy instead of hand coordinates           | O1 observed     |
| 4        | Framing and decoration guards                                                              | Cheap; both traps passed every check                                                   | O2, O3 observed |
| 5        | Editorial reading/motion lint profile                                                      | Needs an owner decision, then small policy work                                        | O7              |
| 6        | Probes: Thai finer units, mask extents, axis-validation timing, serif fragment             | Risks not yet shown to affect a real title                                             | O10, O11, risks |
| Outside  | Font library, design grammar, footage analysis, candidate search, critic, preference model | High value, but depends on 1–3 for trustworthy signals                                 | Design ideas    |

**Smallest useful next step:** the strict exact-copy coverage gate. It is already
scoped, the bug is observed and silent, the prototype `cmap` reader here covers
formats 4/12, and it protects every Thai/mixed title an external generator might
produce. Immediately after, repair video pixel lint and add text contrast as one
slice; reuse T3 pass 1/pass 2 as fixtures.

## Decisions needed from the owner

1. Which slice to start: the coverage gate (recommended) or video pixel lint plus contrast.
2. Inputs for an aesthetic proof: authorized vertical fashion footage, and licensed
   fonts for the reference looks (display serif with italic, a script, condensed
   Latin, a Thai display face), with permitted use recorded.
3. Whether centring on the layer origin is the intended `align` contract (then
   document and lint it) or should centre within `textLayout.width`.
4. The reading rule for titles under the continuous-motion preference: how much
   hold drift counts as readable.
5. Where the design/orchestration layer should live (separate package or
   repository), keeping Still Shift as the deterministic renderer and checker.
6. Human visual acceptance of the three treatments is pending. None is claimed here.

## Reproduce

Use Node 22.23.1 (`pnpm toolchain:check` must pass). The clip is a git-ignored
local render, so these commands need this machine's `benchmarks/results` tree.

```bash
pnpm exec tsx research/editorial-typography-proof/cmap-probe.ts
```

```bash
pnpm --silent still-shift comp render --input research/editorial-typography-proof/t1-editorial-stack.ts --output benchmarks/results/editorial-typography-proof-2026-11-15/t1-editorial-stack.mp4
```

```bash
research/editorial-typography-proof/review-frames.sh benchmarks/results/editorial-typography-proof-2026-11-15/t1-editorial-stack.mp4 benchmarks/results/editorial-typography-proof-2026-11-15/t1-review
```

See the [proof README](../research/editorial-typography-proof/README.md) for every
program, control and lint command.
