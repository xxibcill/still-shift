# Relationship lines and motion rhythm

**2026-09-26 · story-canvas-0.13.2 · implemented**

The subsequent [brush-line art pass](story-motion-brush-lines.md) replaces these
smooth ink strokes with a more expressive split-nib treatment. This page retains
the timing design and its original verification record.

The previous clips already used cubic smoothstep, `t²(3−2t)`. They felt uniform
because almost every event shared that curve, similar durations, and simultaneous
line/label entrances. Adding easing alone would not address that rhythm.

[Compare before/after](../benchmarks/results/story-motion-v007/comparison.html) ·
[Watch all seven](../benchmarks/results/story-motion-v007/index.html) ·
[Narrated S01E01 proof](../benchmarks/results/story-motion-s01e01-proof-v006/index.html)

## Graphic treatment

Relationship lines now use a deterministic ink profile: narrower ends, stronger
middle weight and a subtle variation in nib pressure. The profile is fixed in
space and never exceeds its declared width. A fine leading tip makes a reveal
read as drawing. It does not introduce a traveling resource token.

Land, access, category and closing relationships use authored curved connections
where the composition allows them. Endpoints remain attached while objects settle
or regroup. The curve's bow is limited to 22% of the current endpoint distance to
keep short connections controlled. Source ports were corrected where the previous
line stopped short of the actual store/house silhouette.

The explicit Land → Rent/service conclusion ends with a small arrow. The access
restriction retains a straight axis, positive clearance and unmarked open routes.
Its bands and caption were repositioned around the corrected angled connection.
Evidence dividers remain simple editorial rules.

## Timing treatment

| Action                            | Curve and choreography                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| Drawing a relationship            | Cubic ease-out: quick progress, gentle completion                                             |
| Destination arrival               | A later entrance after most of its line has drawn; a small rise settles with quintic ease-out |
| Pressure narrowing                | Quintic ease-in-out: a restrained beginning, quicker middle and calm stop                     |
| Regrouping                        | Staggered quintic ease-out movements with distinct start/end frames                           |
| Crisis fracture                   | Cubic ease-in: stress builds into a decisive break                                            |
| Category change and context reset | Preserved exact-frame cuts                                                                    |

There is no bounce, elastic overshoot, perpetual oscillation or frame-random
jitter. Narrative reading holds remain. In the local proof, “More room” begins
at local frame 114 and “Less room” at frame 243, following the corrected narration timings;
the household cut remains master frame 5082 and the total remains 646 frames.

The lab now exposes `easing` beside event timing. Authoring additions are optional:
window `easing`, branch `arrival`, comparison `labelWindows`, connector `bend`,
and path `lineStyle`/`endArrow`. Inputs that omit them retain smoothstep and
uniform straight strokes. See the [authoring guide](story-motion-implementation.md).

## Checks and inspection

- 158 unit/integration tests passed; targeted checks cover bounded monotonic
  easing, exact endpoints/cuts, staged arrivals, curve attachment, stroke width
  and empty fracture gaps.
- 98 preview/export comparisons passed, including extra draw-on and fracture
  frames; seven backward seeks were pixel-identical. Easing/timing controls,
  phone layout, 646-frame export and 30 fps CLI passed.
- Existing illustrated and cinematic suites passed (42 and 31 comparisons).
- Browser automation played all seven revised clips and three paired comparisons
  through to their ends at normal speed. Paired scrubbing landed both videos at
  frame 90. Reduced-motion mode starts paused and offers static style frames.
- Full-size holds, temporal sheets, 390 px frames and comparison layouts were
  visually inspected. Independent editorial review inspected three posters,
  48 motion samples and the nine-frame proof sheet, finding no remaining
  concrete attachment/caption/arrow blocker. That review used the v005 proof;
  the final v006 proof only adjusts the less-room caption to its spoken onset.
  This is frame/sample judgment,
  separate from automated playback; no human narrated watch is claimed.
- Build, ESLint and formatting checks passed.

[Parity report](../benchmarks/results/story-motion-v007/parity-report.json) ·
[Playback/control report](../benchmarks/results/story-motion-v007/playback-report.json) ·
[Render measurements](../benchmarks/results/story-motion-v007/render-summary.json)

The seven eight-second studies still total 1,344 frames. Local renders took about
3.6–3.9 seconds per clip. The refreshed narration proof is a local graphic
candidate; protected episode assets and the full episode timeline are unchanged.

To reproduce the comparison after rendering a new gallery:

```sh
pnpm story:compare --before benchmarks/results/story-motion-v005 --after benchmarks/results/story-motion-v007
```

Rendered galleries and QA images are ignored local artifacts. The source and
fixtures reproduce the revised treatment; the comparison also requires an
existing baseline gallery. A render never silently replaces an earlier output.
