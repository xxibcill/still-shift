# Artistic brush lines

**2026-09-26 · story-canvas-0.13.3 · implemented**

The user found the previous smooth tapered connections too plain. This pass
makes the line itself part of the illustration: a broad brush gesture with a
loaded edge, translucent pigment spread and fine dry streaks through its body.

[Compare v007 / v008](../benchmarks/results/story-motion-v008/comparison.html) ·
[Seven revised motion studies](../benchmarks/results/story-motion-v008/index.html) ·
[Narrated S01E01 candidate](../benchmarks/results/story-motion-s01e01-proof-v007/index.html)

## Graphic decisions

- Relationship strokes swell from slender attachments into a heavier, asymmetric
  body. Small irregularities and split-nib streaks replace the clean vector edge.
- Field green links land and access; muted red connects claims to their red label.
  The concluding rent/service arrow uses the same brush treatment on its wings.
- The access symbol shares the procedural brush geometry, so its internal line
  belongs to the same family as the connection entering it.
- Large relationship marks use a 32 px envelope. Open access routes use 22 px;
  the tighter narrated proof uses 16 px. Comparison markers use 24 px and crisis
  connections use 28 px. These are graphic weights, not measured quantities.
- Evidence dividers remain fine rules. Existing cubic/quintic easing, staggered
  arrivals, reading holds, category cuts and context reset retain their timing.

## Implementation

`lineStyle: "brush"` is optional; `uniform` and the previous `ink` treatment remain
available. [brush-path.ts](../packages/renderer-core/src/brush-path.ts) constructs
fixed-coordinate polygons for the pigment edge, body and dry streaks. Canvas
uses an even-odd fill to expose the underlying wash through each streak; SVG
artwork uses the same geometry. No background color is painted into the holes,
so the brush also works on the crisis field and illustrated ground.

Texture is seeded by path ID and sampled on a fixed normalized grid. Reveal
only advances the tip; deposited edges stay fixed. Endpoints still follow their
authored anchors. Every pigment layer fits the declared width, including the
translucent edge. Fracture intervals clip every layer, leaving the gap empty.

## Verification

- 162 unit/integration tests passed, including brush clearance, empty fracture
  intervals, stable deposited edges, backward evaluation and degenerate paths.
  Existing process/IPC tests required the normal unrestricted local rerun.
- 98 preview/export comparisons and 14 pixel-identical backward seeks passed.
  The latter now includes a rendered mid-animation state as well as frame zero.
  Timing/easing controls, phone layout, 646-frame export and 30 fps CLI passed.
- All seven 192-frame studies rendered, taking approximately 2.6–4.3 seconds
  each on this machine. The narrated proof retains 646 frames and the existing
  verified narration, with the household cut at local frame 334/master 5082.
- TypeScript, ESLint and targeted formatting checks passed.
- Automated Chromium playback reached the end of all seven clips and three
  paired comparisons; paired scrubbing aligned both videos at frame 90.
  Reduced-motion mode starts paused, and the 390 px comparison has no overflow.
- Full-size relationship/access/conclusion holds and all eight phone style
  frames were inspected. Independent editorial review inspected eight posters,
  seven 16-frame sheets, the nine-frame proof sheet, and proof frames 40/96/145
  at full resolution, finding no concrete attachment, clearance, caption or
  semantic blocker. This was frame/sample review, not a human narrated watch.

[Parity report](../benchmarks/results/story-motion-v008/parity-report.json) ·
[Playback report](../benchmarks/results/story-motion-v008/playback-report.json) ·
[Phone frames](../benchmarks/results/story-motion-v008/phone-frames-390.png)

Inspection and playback evidence is recorded with the local gallery. This is a
graphic candidate; the selected S01E01 assets and full episode timeline are not
replaced by these studies.

```sh
pnpm story:prepare
pnpm story:render --output-dir benchmarks/results/story-motion-next
pnpm story:compare --before benchmarks/results/story-motion-v007 --after benchmarks/results/story-motion-next
pnpm test:browser:story --renders benchmarks/results/story-motion-next
```

Use a fresh directory for each render. Rendered media, comparison pages and QA
captures are ignored local artifacts; the source and fixtures reproduce the art.
