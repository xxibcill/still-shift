---
name: design-editorial-titles
description: Design and check fashion-reel title overlays on vertical video with Still Shift compositions — one large mixed-type lockup over the subject, made legible by outline, shadow or box, built word by word and held across cuts. Use when an agent writes title candidates for a clip, runs the render-and-lint loop, and records iterations for owner review.
---

# Design editorial titles

You are the candidate generator. For one clip and one piece of copy, write
several visually distinct title compositions, render each, check it, fix what
the checks or your own look at the frames find, and record every
render-and-fix iteration with its cause. You never judge acceptance: the owner
does, in their own words. Label any score of yours as the agent's.

This skill works from a Still Shift repository checkout: it uses the pinned
fonts in `assets/editorial-titles/`, the check script in
`scripts/editorial-titles/` and the pilot helpers in
`research/editorial-titles-et7a/`, none of which the npm package ships, so the
package leaves this skill out.

This skill assumes the composition basics in
[`compose-with-still-shift`](../compose-with-still-shift/SKILL.md). The pilot
it came from, with its candidates and evidence, is
[`research/editorial-titles-et7a/`](../../research/editorial-titles-et7a/README.md).

## Target style

The owner's social fashion-reel references (G1, 2026-11-16), not quiet
magazine minimalism. Each title is:

- **one large lockup** spanning about 60–80% of the frame width, over the
  subject's torso, **clear of the face** on every frame of the clip;
- **mixed type per word**: a script or italic display serif paired with heavy
  caps (condensed, extended, fat-face or brush), with two or three colours;
- **legible by treatment**, not by finding empty space: outline, hard or soft
  shadow, halo, or a solid box behind small text;
- **built word by word in 1–2 s**, then **held across the fast cuts**, with an
  optional quick exit; optional sparkles and one small sub-label.

## Inputs

- The clip as a pinned `video` descriptor (dimensions, rational rate, frame
  count, SDR colour, SHA-256). Compositions use integer fps: retime a
  23.976 fps source to 24 before pinning.
- The copy, exact. Thai copy needs `locale: "th"` on its layer.
- Fonts from `assets/editorial-titles/fonts/sources.json` (each with licence,
  source URL and SHA-256), loaded through `fontAsset`. Load only the faces a
  candidate uses into its `assets`.
- A look at the clip first: a 1 fps survey sheet (`ffmpeg … fps=1,tile`) and a
  cut list (`select='gt(scene,0.2)'`). Note the face's lowest point over the
  whole clip, where the torso is, the outfit colours, and any burned-in text.

## Grammar

**Roles.** A lockup has a _hero_ word (script, italic serif or brush: the
feeling), one or two _anchor_ words (heavy caps: the noun), and at most one
_sub-label_ (small boxed caps or Thai label: the detail). Sparkles are
decoration, never information.

**Pairings that work** (one candidate each, so a batch stays varied):

| Hero                                           | Anchor                                      | Notes                                  |
| ---------------------------------------------- | ------------------------------------------- | -------------------------------------- |
| Formal script (Pinyon, Great Vibes)            | Condensed caps (Anton, Bebas)               | Script overlaps the caps' top edge     |
| Bold italic serif (Playfair, Bodoni, DM Serif) | Extended grotesque (Archivo `wdth` 125)     | Italic large, caps tracked             |
| Fat-face serif (Abril)                         | Brush (Caveat Brush), tilted 4–8°           | Brush in an accent colour              |
| Brush marker (Permanent Marker)                | Boxed tag (Bebas)                           | Hard offset shadow, sticker feel       |
| Heavy Thai sans (Kanit Black)                  | Thai script/hand (Charm, Sriracha, Pattaya) | Zig-zag stack; English boxed sub-label |
| Thai display serif (Chonburi)                  | Thai handwriting with a halo                | Lavender/purple, sparkles              |
| Heavy Thai sans                                | English script                              | Mixed Thai/English lockup              |

**Hierarchy.** Hero and anchor are 120–260 px on a 720 px-wide frame; the
sub-label is 24–46 px, which keeps an x-height of at least 6 px at 360 px
review width. Two or three lines; stack them with slight horizontal offsets
(zig-zag) and let the script overlap the caps a little.

**Placement.** Centre lines with `align: "center"` and the origin at the line's
centre x (alignment is around the origin, not inside a box). Put the stack's
top below the face's lowest point over the whole clip plus about 30 px; keep
it above the hips. Without a measuring command, estimate widths before
rendering: about 0.44 em per capital in Anton, 0.37 in Bebas, 0.66 in Abril,
0.65–0.8 in Archivo at `wdth` 125, 0.27–0.32 per lowercase letter in the
scripts, and 0.55–0.75 per Thai base consonant in the heavy Thai faces. Keep
at least 40 px from each edge, then let lint confirm.

**Colour.** Two or three colours taken from the outfit or the room (cranberry,
cream, chocolate, gold, lavender, teal…), plus one dark or cream outline
colour that separates every word from the footage.

**Treatments** (all existing composition features):

- _Outline_: a text animator held at its end state, `from` equal to `to`
  (`{ stroke, strokeWidth }`), unit `line`. The stroke draws behind the fill,
  so `strokeWidth` is about twice the visible outline: 8–16 at 150 px.
- _Hard shadow_: `light.drop-shadow` with `blur: 0` and an offset of 6–9 px.
  _Soft shadow_: blur 10–14, opacity 0.8.
- _Halo_: a drop shadow with offset `[0, 0]` in a dark or accent colour.
  `light.glow` has no colour; it brightens the layer's own pixels.
- _Box_: a `highlight` decoration (the `box` kind is a stroked outline). It
  centres on the baseline minus half the x-height, plus `offset`; use offset 0
  for caps-only faces such as Bebas, about −4 for mixed-case label faces.
  Default thickness is 1.25 × cap height. It has no horizontal padding.
  Set `fadeWithText: true`, and key its `reveal` when the text types in
  glyph by glyph (the box does not follow per-glyph opacity).
- _Hollow caps_: a transparent fill (`#FFFFFF00`) with an outline animator.

**Timing.** Build from about 0.1–0.2 s to 1.4–1.9 s: word pops (scale 1.6–2.6
→ 1, 6–8 frames, stagger 6–8), a glyph typewriter (opacity, 1–4 frames,
stagger 1–3), a drop or slide cascade, or caps tracking in. Hold untouched
through the cuts. Exit in 0.3–0.5 s (fade with a small move, or reverse glyph
order). Use the markers from the `research/editorial-titles-et7a/grammar.ts`
helpers (`build`, `hold`, `exit`) so the check script picks the right frames.

## Check loop

Run from the repository root with Node 22.23.1:

```bash
pnpm exec tsx scripts/editorial-titles/et7a-check.ts --input <candidate.ts> --lint false
```

```bash
pnpm exec tsx scripts/editorial-titles/et7a-check.ts --input <candidate.ts>
```

The first is a fast visual pass (validate with `--font-coverage strict`,
render, sheets); the second adds `comp lint --pixels true --legibility true
--font-coverage strict`. Each run is a new `rNN` folder under
`benchmarks/results/editorial-titles-et7a/<candidate>/`.

1. **Validate.** Strict coverage must pass. Fix located errors first.
2. **Look at the phone sheet** (entrance, hold, exit rows at 360×640) and the
   native sheets: face clear on every hold frame, nothing cut off, every word
   readable at phone size, the build reads in order, nothing orphaned.
3. **Lint.** Errors (`text-off-canvas`, `orphaned-decoration`) must be fixed.
   Legibility findings are fixed or waived with a reason:
   - labels (role `label`, 4.5:1): put them on a box; never waive;
   - display layers (role `heading`) with an outline, shadow or halo: the
     contrast measure compares glyph pixels with the footage directly behind
     them. It counts an outline's ring as glyph pixels and credits no shadow
     or halo, so it reports 1.0–1.5:1 on text that reads well (a dark outline
     over dark clothing measures about 1:1). G1 allows large display text
     below 3:1. Waive `text-contrast` for those layers with that reason
     (`displayWaivers` in `research/editorial-titles-et7a/grammar.ts`, saved in
     `metadata.readingPolicy.textLegibility.waivers`), and only after
     looking at the hold frames yourself. A halo alone is often too weak for
     a thin script: give scripts an outline.
4. **Record** each iteration: what you changed and the cause, from this list:
   _placement_ (face, framing), _overflow_ (off-canvas), _contrast_,
   _collision_ (words or marks overlapping badly), _seams_, _missing
   measurement_ (a width, line height or decoration offset you had to guess),
   _font pin_, _engine behaviour_ (a surprise in an existing feature),
   _decoration sync_. Never move coordinates by hand outside a recorded
   iteration; no person edits coordinates.

## Known pitfalls (from the ET7a pilot)

- Prompt Black is pinned but rejected by `font-metadata`: its name table
  carries the full licence (8.7 KB) over the 2 KB name budget. Use Kanit
  Black or Mitr instead. Run
  `research/editorial-titles-et7a/probes/all-fonts.ts` after pinning new
  faces.
- A span's named style inherits the base style's `axes`; give a span style
  for a font without that axis `axes: {}`.
- Drop shadows and halos make Canvas renders about ten times slower (a 7 s
  720×1280 clip: about 9 s without, about 100 s with).
- Legibility lint renders two extra frames per text layer per reading frame:
  several minutes per candidate. Use `--lint false` while iterating on looks.

## What to keep out of git

When the clip is local-only footage (such as the owner's third-party reels),
the clip, its file name, renders, frames and contact sheets stay in the
git-ignored `benchmarks/results/` tree. Commit only composition sources,
SHA-256s, check results and the owner's verdicts. Check `git status` before
every commit.
