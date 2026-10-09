# Typography and text motion engine plan

- **Updated:** 2026-10-09 (restored 2026-10-08 research planning)
- **Status:** TY1–TY8 implemented on `codex/typography-motion-engine`. The post-implementation review defects and its three production follow-ups are fixed and re-verified. See [review fixes](#review-fixes-2026-09-28) and [follow-up fixes](#follow-up-fixes-2026-09-28).
- **Baseline:** `1e63aa3` on `main` (story renderer `story-canvas-0.21.0`)
- **Scope owner decision:** engine primitives and authoring tools only; motion studies are acceptance fixtures, not deliverables (see the [engine tooling plan](story-engine-tooling-plan.md#objective-and-scope), 2026-09-26). The owner named text and typography as the next focus on 2026-09-28.

## Objective

Make text a first-class motion material in Still Shift, with the typographic control a motion designer expects from After Effects' text engine, Rive text runs or GSAP SplitText. The difference is that everything is programmatic, deterministic and authorable as strict JSON by a human coder or an AI.

The engine already typesets carefully: pinned, checksummed fonts; overflow errors instead of silent clipping; safe-area validation; state-stable size fitting; locale-aware Thai wrapping. What it cannot do is let type _act_. In the v013 studies every headline and subhead is pixel-identical in every sampled frame after its entrance. The illustrations tell the story and the words watch. Under the owner's [continuous storytelling decision](story-motion-continuous-storytelling-plan.md), text must carry meaning over time, too, and it is the element viewers read most closely.

This plan adds that layer in eight phases (TY1–TY8). IDs are distinct from the episode's M0–M6, engine tooling E1–E7 and motion craft MC1–MC8.

## Baseline findings (2026-09-28)

Evidence comes from reading the text contract, layout and renderer, and from the v013 review stills and motion sheets.

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Evidence                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | **No typographic parameters beyond size and weight.** No tracking, leading animation, OpenType features, variable axes, italic, case or figure style. Pinned fonts are limited to weights 400–700; system fallback is `normal`/`bold` × `serif`/`sans-serif`. `fontSize` is capped at 180 px, which rules out large kinetic display type. Display serif at ~96 px ships at default tracking; ~22 px labels ship at default tracking.                                                                                            | [`PreparedNodeSchema` text](../packages/scene-contract/src/prepared.ts), [`PreparedFontSchema`](../packages/scene-contract/src/prepared.ts), [`evidence-boundary.png`](review/story-motion-v013/evidence-boundary.png), [`unequal-margins-motion.jpg`](review/story-motion-v013/unequal-margins-motion.jpg) |
| T2  | **One style per node.** A node has one color, weight and font. Emphasizing a word inside a line ("not **every** detail") requires splitting it into separately positioned nodes, which breaks kerning, wrapping and any shared animation.                                                                                                                                                                                                                                                                                       | Same schema; "More room" / "Less room" are separate nodes                                                                                                                                                                                                                                                   |
| T3  | **Two layout engines with different rules.** Story layout wraps greedily on whitespace (Latin only) using advance width. Text boxes use `Intl.Segmenter` and bounding-box width. Default line heights disagree: 1.2 (story layout), 1.4 (animator fallback), 1.28 / 1.5 (commerce en/th). Lines are positioned from `textBaseline: "top"`, not a baseline or cap height.                                                                                                                                                        | [`story-text-layout.ts`](../packages/renderer-core/src/story-text-layout.ts), [`text-layout.ts`](../packages/renderer-core/src/text-layout.ts), [`motion-text.ts:52`](../packages/renderer-core/src/motion-text.ts), [`commerce-text.ts`](../packages/renderer-core/src/commerce-text.ts)                   |
| T4  | **No rag control.** Greedy wrapping leaves orphans and ragged shapes.                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Evidence Boundary: "Not a recovered / pantry"                                                                                                                                                                                                                                                               |
| T5  | **Text reveals are a fixed, narrow vocabulary.** `revealMode` is `wipe` (horizontal clip) or `words` (fade-up). The wipe feather is a fixed 24 px built from six 4 px alpha bands regardless of font size (razor-sharp on 180 px type, smeared on 16 px). Words rise a fixed 10 px. Multi-line reveals run strictly line after line with no overlap. There is no line-mask reveal (text rising from behind its own line), the most common editorial type move.                                                                  | [`story-text.ts:26,64,92,107`](../packages/renderer-core/src/story-text.ts)                                                                                                                                                                                                                                 |
| T6  | **The text animator has craft defects and no users.** Glyphs are drawn one `fillText` at a time, losing kerning pairs and ligatures; at `animator.end` the renderer switches back to one `fillText`, so spacing visibly snaps. Scale and rotation pivot at each unit's left baseline, so a scale-in reads as a slide. Spaces count as stagger units. Blur uses per-glyph `ctx.filter`. Selector shapes are square/ramp/triangle only. No story, template or preset uses `textAnimators`; only a motion-craft test fixture does. | [`motion-text.ts`](../packages/renderer-core/src/motion-text.ts), [`TextAnimatorSchema`](../packages/scene-contract/src/motion-craft.ts), [`create-motion-craft-fixtures.ts`](../scripts/story-motion/create-motion-craft-fixtures.ts)                                                                      |
| T7  | **Text states hard-cut.** Switching `states[]` selects `Math.round(state)`; there is no retype, roll, glyph-diff crossfade or numeric count.                                                                                                                                                                                                                                                                                                                                                                                    | [`illustrated-renderer.ts:272`](../packages/renderer-core/src/illustrated-renderer.ts)                                                                                                                                                                                                                      |
| T8  | **Hierarchy is inferred from font size.** Without `textRole`, choreography calls ≥ 64 px root text a heading and ≤ 52 px a qualifier. Changing a size silently changes the entrance verb.                                                                                                                                                                                                                                                                                                                                       | [`story-choreography.ts:24-37`](../packages/renderer-core/src/story-choreography.ts)                                                                                                                                                                                                                        |
| T9  | **Narration and type are not linked at word level.** Imported alignments already carry per-word start/end times, but text events can only bind to cue or segment boundaries. A key word cannot land on its spoken onset.                                                                                                                                                                                                                                                                                                        | [`alignment.json`](../assets/parcel-story/narration-v001/alignment.json) `segments[].words[]`, [`narration-timing.ts`](../packages/scene-contract/src/narration-timing.ts)                                                                                                                                  |
| T10 | **Text quality checks cover size and speed only.** `small-essential-text` (display px at video width) and `text-velocity` (20 px/s outside entrance/exit) exist. There is no reading-time, contrast, rag, handoff-snap or "moving while being read" check, and no type specimen for review.                                                                                                                                                                                                                                     | [`story-quality.ts`](../packages/renderer-core/src/story-quality.ts), [`story-continuous-quality.ts`](../packages/renderer-core/src/story-continuous-quality.ts)                                                                                                                                            |

All canvas text is drawn through one path, `drawShape` in [`illustrated-renderer.ts`](../packages/renderer-core/src/illustrated-renderer.ts), which calls [`drawStoryText`](../packages/renderer-core/src/story-text.ts), [`drawAnimatedText`](../packages/renderer-core/src/motion-text.ts) or the text-box loop. That single seam makes a unified text evaluator practical.

## Capability gap against professional tools

| Capability                                                                       | After Effects / Rive / GSAP                | Still Shift today          | Phase    |
| -------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------- | -------- |
| Tracking and leading, static and animated                                        | Core                                       | Missing                    | TY1, TY4 |
| Rich runs inside one text block                                                  | Core                                       | Missing                    | TY1      |
| OpenType features, variable axes, italic                                         | Standard                                   | Missing                    | TY1      |
| Balanced rag, widow/orphan control                                               | Standard (CSS `text-wrap: balance/pretty`) | Missing                    | TY2      |
| Baseline / cap-height alignment                                                  | Core                                       | Top-of-em only             | TY2      |
| Line and word mask reveals                                                       | GSAP SplitText `mask`                      | Missing                    | TY4      |
| Anchor-point grouping per character/word/line                                    | Core                                       | Left-baseline pivot        | TY3      |
| Range selector: smooth shape, ease high/low, exclude spaces, seeded order, modes | Core                                       | Partial                    | TY4      |
| Stroke, highlight, underline, strike drawn on                                    | Standard                                   | Missing                    | TY5      |
| Source-text transitions: retype, roll, counter                                   | Core                                       | Hard cut                   | TY6      |
| Word-synced type from narration                                                  | Plugins or manual                          | Data present, unused       | TY7      |
| Type review: specimen, reading-time and snap checks                              | Manual                                     | Size and speed checks only | TY8      |

## Invariants (binding for every phase)

1. **Determinism.** Every glyph position, style and animated value is a pure function of `(scene, frame, pinned font bytes)`. Seeded randomness only. Backward seeks are identical.
2. **Legacy pixel parity.** Scenes that do not opt in keep their renderer version and decode byte-identically. Existing parity, golden and legacy-pixel suites pass unchanged.
3. **Versioned opt-in.** New fields bump `story-canvas` / `commerce-canvas` only for opted-in scenes. Cache identity includes the new fields.
4. **Pinned fonts for measured text.** Any layout-sensitive feature (tracking, spans, balance, masks, features, axes) requires a pinned `fontAsset`. System fallback fonts are not measured.
5. **Settled pixels equal animated pixels.** The frame an animation completes and the frame after it are identical. Handoff to a "static" draw path must never shift glyphs (fixes T6).
6. **One shaped layout per text state.** Wrapping, glyph placement and animation all read the same prepared layout. No second measurement at draw time.
7. **Preview/export parity.** Lab and CLI share one evaluator.
8. **Strict, serializable data.** Unknown fields fail; no `eval`. AI and humans author the same JSON.
9. **Semantic motion, not decoration.** Text motion must express a story change (emphasis, correction, qualification, pressure, count). Lint reports idle type drift. The owner's typography hierarchy decision stands: no blanket enlargement.
10. **Advisory lint.** New diagnostics report; they become hard gates only by explicit flag.

## Milestone tracker

Status: `[ ]` planned, `[~]` in progress, `[x]` complete, `[!]` blocked with a recorded reason.

| ID  | Deliverable                                                                  | Depends on | Fixes            | Status |
| --- | ---------------------------------------------------------------------------- | ---------- | ---------------- | ------ |
| TY1 | Type styles, tracking, features, axes and rich runs                          | —          | T1, T2           | `[x]`  |
| TY2 | Unified shaped layout with baseline alignment and rag control                | TY1        | T3, T4           | `[x]`  |
| TY3 | Text animator repairs: glyph placement, anchor grouping, em-based feathering | TY2        | T5 (feather), T6 | `[x]`  |
| TY4 | Text animator v2: typographic properties, masks, selector v2                 | TY3        | T5, T6           | `[x]`  |
| TY5 | Text decorations: underline, strike, highlight, stroke                       | TY2, TY4   | T1               | `[x]`  |
| TY6 | Source-text transitions                                                      | TY2, TY4   | T7               | `[x]`  |
| TY7 | Semantic text verbs, explicit hierarchy and narration-word anchors           | TY4–TY6    | T8, T9           | `[x]`  |
| TY8 | Type quality lint and review tooling                                         | TY2, TY4   | T10              | `[x]`  |

Recommended order: TY1 → TY2 → TY3 ship together as the first slice (they fix visible quality today and everything else depends on them). TY4 and TY8 next, so new motion arrives with its checks. TY5–TY7 after.

## TY1 — Type styles, tracking, features, axes and rich runs

**Goal.** Express professional typesetting decisions as data, and allow emphasis inside a line without splitting nodes.

**Contract.**

- `TextStyle` (named, reusable, referenced by id from a scene or template style):
  - `fontAsset`, `size`, `tracking` (em/1000, e.g. `-15`), `leading` (multiple of size), `case` (`none | upper | lower | small-caps`), `figures` (`proportional | tabular`, `lining | oldstyle`), `features` (allow-listed OpenType tags such as `kern`, `liga`, `ss01`, `case`), `axes` (variable-font axis → value, validated against the font's `fvar` ranges).
  - `opticalTracking: true` derives default tracking from size along a bounded curve (tight at display sizes, open at caption sizes). An explicit `tracking` overrides it.
- `PreparedFontSchema` gains `style` (`normal | italic`) and optional variable-font metadata recorded at preparation time. Weight accepts 100–900.
- Text node gains `style` (style id) and `spans[]`: `{ start, end, style?, color? }` over grapheme indices of each `states[]` string. Spans may not overlap; they are validated against every state.
- `fontSize` upper bound rises to 640 for pinned fonts. Existing nodes keep their validated range.

**Renderer.** Canvas `letterSpacing`, `fontKerning`, `fontVariantCaps` and `font-variation-settings` via `FontFace` descriptors where Chromium supports them. Unsupported combinations fail at preparation, not at draw.

**Acceptance.** A fixture with a two-style headline ("A record supports categories, _not every detail_.") renders one layout with correct kerning across the span boundary. Tracking and axis changes alter pixels only for opted-in nodes. Legacy parity unchanged.

## TY2 — Unified shaped layout

**Goal.** One layout engine for story, passage and commerce text, producing positioned glyph runs that every later phase reads.

**Engine.**

- Replace [`wrapStoryText`](../packages/renderer-core/src/story-text-layout.ts) and [`measureTextLayout`](../packages/renderer-core/src/text-layout.ts) with `shapeText(node, state, font) → ShapedLayout`: lines, each with baseline y, and glyph clusters with x advance, cluster text, span index, word index and line index. Segmentation uses `Intl.Segmenter` for the node's locale.
- Measure from font metrics: `ascent`, `descent`, `capHeight`, `xHeight`. Nodes gain `anchor: "top" | "cap" | "baseline"` (default `top` for legacy parity). New templates use `cap` so headline and body left edges and first baselines align optically.
- `wrap: "greedy" | "balance" | "pretty"`. `balance` minimizes line-width variance for ≤ 4 lines. `pretty` forbids a final line shorter than a configurable fraction (default: one word or 20% of the measure). Both stay deterministic and bounded (dynamic programming over break points, capped line count).
- One default `leading` table by role, replacing the 1.2 / 1.28 / 1.4 / 1.5 scatter for opted-in nodes.
- Layouts are computed once per state during preparation and cached on the prepared scene, as text-box layouts already are.

**Acceptance.** Evidence Boundary's qualification with `wrap: "pretty"` has no single-word final line. Thai text boxes produce identical breaks to today. Size fitting ([`component-text-fit.ts`](../packages/renderer-core/src/component-text-fit.ts)) uses the shared layout. Every existing overflow and safe-area error still fires with the same code.

## TY3 — Text animator repairs

**Goal.** Make the existing animator trustworthy before extending it.

**Engine.**

- Draw animated units from the TY2 cluster positions. Each unit's glyphs keep their shaped advances, so kerning and ligatures inside a unit are preserved and the completed frame matches the static path exactly (invariant 5).
- `anchor: "glyph" | "word" | "line" | "all"` with `anchorAlign: [x, y]` (normalized to the unit's ink box, default centre of cap height). Scale, rotation and skew pivot there.
- `excludeSpaces` (default `true` for new animators): whitespace clusters take no stagger slot.
- Reveal feathering in em units (`feather: 0.35` em default) implemented as a gradient mask, not stepped alpha bands. The legacy `wipe` path is unchanged for non-opted-in scenes.
- Multi-line reveals take `lineOverlap` (0–1) so lines cascade instead of queueing.
- Replace per-glyph `ctx.filter` blur with a bounded offscreen blur of the text layer, or a sampled directional smear, evaluated once per frame.

**Acceptance.** For every animator fixture, the frame at `end` and `end + 1` decode identically (pixel diff = 0). A glyph scale-in has its ink centroid fixed within 0.5 px across frames. Performance: a 60-character glyph animator stays within 1.5× the static text draw time per frame on the reference machine.

## TY4 — Text animator v2

**Goal.** After Effects parity where it pays off for editorial and explainer type.

**Contract additions to `TextAnimator`.**

- Animatable `from` properties: `tracking`, `leading` (line units), `skew`, `baselineShift`, `axes` (variable-font axis deltas), `fill` and `stroke` colors, `strokeWidth`. Existing properties stay.
- `to` in addition to `from`, so an animator can hold a unit away from rest (for example, a word that stays compressed while a constraint applies) and release later.
- `mask: "none" | "line" | "word"`. A unit rises from behind a clip at its own line or word box. Feather in em units.
- Selector v2: shapes `square | ramp-up | ramp-down | triangle | round | smooth`; `easeHigh` / `easeLow` (0–100); `basedOn: "clusters" | "words" | "lines"`; `order: "forward" | "reverse" | "center-out" | "seeded"` with `seed`; `mode: "add" | "intersect"` for multiple selectors. Selector `start`/`end`/`offset` may be animated tracks and bound to signals from MC3.
- Animators may target a span id from TY1 instead of the whole node.

**Layering.** Animated text properties participate in MC2 layered evaluation by role, so a `current` (for example a slow tracking release on a qualifier) can sit under an `action` entrance.

**Acceptance.** Fixtures for line-mask reveal, center-out tracking settle and a span-only emphasis. Each passes invariant 5, the determinism seek test and preview/export parity.

## TY5 — Text decorations

**Goal.** Underline, strike, highlight and outline as drawn, animatable marks tied to the shaped layout.

**Contract.** `decorations[]` on a text node: `{ span, kind: "underline" | "strike" | "highlight" | "box", color, thickness, offset, lineStyle: "uniform" | "ink" | "brush" }`. Each has a `reveal` track and follows line breaks, drawing one segment per line in reading order.

**Engine.** Geometry from TY2 glyph boxes and font metrics (underline position and thickness from the font where available). `ink` and `brush` reuse [`brush-path.ts`](../packages/renderer-core/src/brush-path.ts) and [`ink-path.ts`](../packages/renderer-core/src/ink-path.ts) so marks match the relationship-line language. Highlights draw behind glyphs; strikes draw over them.

**Acceptance.** A strike that crosses a line break draws continuously in reading order and stays attached if the text node moves or scales. Brush texture is fixed in text space (no swimming).

## TY6 — Source-text transitions

**Goal.** Replace the hard `states[]` cut with authorable transitions between strings.

**Contract.** A text state change takes `transition: { kind, window, easing }`, where `kind` is:

- `cut` — current behavior, the default.
- `crossfade` — per-cluster crossfade. Clusters common to both strings (longest common subsequence over clusters) stay in place or slide to their new position; removed clusters exit and added clusters enter.
- `roll` — clusters that change roll vertically through a line mask, staggered.
- `retype` — delete back to the common prefix, then type forward, with a caret option.
- `count` — numeric interpolation between two numbers parsed from the states, formatted with the node's figure style. Requires `figures: "tabular"` so width does not jitter; enforced by validation.

**Engine.** Both states' TY2 layouts are prepared, and the transition is evaluated from the pair. The layout box during a transition is the union of both, so safe-area and overflow checks cover every in-between frame.

**Acceptance.** "Supported categories" → "Exact details" in Evidence Boundary can be authored as `crossfade` with no pixel pop above the text-velocity budget. A count from 12 to 1,280 keeps constant width with tabular figures.

## TY7 — Semantic text verbs, explicit hierarchy and narration-word anchors

**Goal.** Let an author (especially an AI) state what the text _means_, and let the compiler produce the typography motion. This is how continuous motion becomes storytelling for type rather than drift.

**Contract.**

- `textRole` becomes required for text in opted-in scenes, replacing the font-size inference in [`story-choreography.ts`](../packages/renderer-core/src/story-choreography.ts). Roles map to TY1 styles through the template style, so hierarchy is declared once.
- Text verbs in story events, each compiling to TY4/TY5/TY6 primitives with role-aware defaults:
  - `reveal` — line-mask or word reveal chosen by role and length.
  - `emphasize(span, manner)` — `weight`, `color`, `underline`, `highlight`, `compress` (tracking and width axis tighten) or `expand`.
  - `correct(span, replacement)` — strike draws, replacement settles in beside or above.
  - `qualify(target)` — a qualifier arrives subordinate to its claim, and the whole claim moves away from it (a held offset of `amount` × claim size, default 0.15) to make room. Leading alone is not used because it moves only second and later lines, so a single-line claim would not move.
  - `retype`, `count`, `redact` (span replaced by a drawn bar), `release` (fade an emphasis layer to rest from whatever value it currently has, including a signal-bound emphasis that is already partly released).
- Timing anchors: `at: { narrationWord: { segment, index } }` or `{ narrationWord: "text", occurrence }`, resolved from the imported word-level alignment. Offsets are in frames. Resolution fails loudly if the word is missing or ambiguous.
- Intent presets (MC8) gain text entries, so the lab can offer "emphasize on spoken word" as one control.

**Acceptance.** In a synthetic fixture built from Unequal Margins, "Less room" tightens its tracking as the margin narrows, bound to the same signal as the margin geometry (MC3). In a narrated fixture, an emphasized word's emphasis peaks within ±2 frames of its spoken onset. Removing a `textRole` in an opted-in scene fails validation with a clear message.

## TY8 — Type quality lint and review tooling

**Goal.** Make typographic quality measurable, and give reviewers a fast way to see all type in a scene.

**Lint (extends [`story-quality.ts`](../packages/renderer-core/src/story-quality.ts) and [`story-continuous-quality.ts`](../packages/renderer-core/src/story-continuous-quality.ts); advisory by default).**

| Code                    | Check                                                                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reading-time`          | Visible, settled duration of each essential text is at least its length at a configurable reading rate (default 15 characters/s, plus a floor per block). Narration-covered text uses the spoken span instead. |
| `moving-while-read`     | Essential text exceeds a glyph displacement budget after its reading window starts. Complements `text-velocity`, which measures node speed rather than per-glyph motion.                                       |
| `animator-handoff-snap` | Pixel difference between an animator's end frame and the next frame is non-zero (invariant 5).                                                                                                                 |
| `rag`                   | Orphaned final word, or line-width variance above threshold, for multi-line text without `wrap: "balance" \| "pretty"`.                                                                                        |
| `text-contrast`         | Contrast between text fill and the rendered pixels behind it, sampled over its visible frames, below a role-specific minimum.                                                                                  |
| `hierarchy-drift`       | A role's rendered size, weight or tracking differs across beats of one passage.                                                                                                                                |
| `idle-type-motion`      | A text property animates with no linked story event, signal or role (decorative drift).                                                                                                                        |
| `x-height-floor`        | Extends `small-essential-text` to x-height at each output format, including vertical.                                                                                                                          |
| `text-pose-jump`        | A glyph moves more than a budget (default 2 px) in one frame while the frames on either side move less than a third of that. Catches pops that fall outside reading windows and animator end frames.           |

**Tooling.**

- `pnpm story:type-specimen` renders a contact sheet per scene: every style and role, every state, every span and decoration, at each output format, with measured tracking, leading and x-height annotated.
- A text lane in the lab timeline: narration words as ticks, text verbs and animators as bars, reading windows shaded, lint findings pinned to frames.
- Lint results are written into the existing quality report JSON so review pages can show them next to motion energy.

**Acceptance.** Every v013 study and passage fixture produces a type specimen and a lint report. `animator-handoff-snap` fails on the pre-TY3 animator fixture and passes after TY3. `rag` flags "Not a recovered / pantry" before TY2 and clears with `wrap: "pretty"`.

## Acceptance fixtures

Existing studies are regression and acceptance fixtures only; this plan does not redesign them.

- **Evidence Boundary** — rag (TY2), state crossfade (TY6), qualification verb (TY7).
- **Unequal Margins / Buffer Press** — signal-bound `emphasize: compress` (TY7), span emphasis (TY1/TY4).
- **Parcel story narration** — narration-word anchors (TY7), reading-time lint (TY8).
- **Commerce Thai text boxes** — shared layout parity (TY2), size fitting on the new layout.
- **Motion-craft glyph animator fixture** — handoff snap and anchor grouping (TY3).

New small synthetic fixtures may be added per phase to isolate a behavior.

## Out of scope

- Redesigning any study's copy, choreography or art.
- Text on path, 3D per-character extrusion and expression-driven selectors. Revisit after TY4 if a fixture needs them.
- Arbitrary script shaping beyond what Chromium's canvas shaper already provides (complex-script coverage follows the browser).
- Font discovery or licensing automation; fonts stay pinned by path and checksum.

## Implementation and verification (2026-09-28)

The eight milestones are implemented. [Typography engine authoring guide](typography-engine.md) documents the contracts, defaults, examples, preparation limits, and review commands.

- **TY1–TY2:** strict `type-1` opt-in; named styles and grapheme spans; pinned feature/axis validation; font weights 100–900 and italic descriptors; shared prepared layouts, font metrics, anchors, locale wrapping, balanced/pretty rag, and state-stable fitting.
- **TY3–TY4:** full-run raster shaping with contextual cluster placement; ink-box pivots; spaces excluded from stagger; continuous feathered line/word masks and line overlap; layer blur; held typographic properties, signal/track selectors, ordering and layer composition.
- **TY5–TY6:** line-following marks and stroke; LCS crossfade with an eased per-frame velocity budget, staggered roll, caret retype, and tabular counters with stable layout width and persistent locale formatting.
- **TY7:** explicit role styles; semantic reveal, emphasis, correction, qualification, retype, count, redaction and release; imported word provenance, word anchors and text intent presets. Near the start of a scene, emphasis pre-roll is shortened; an onset at frame zero peaks at frame one, within the two-frame acceptance tolerance.
- **TY8:** all nine advisory diagnostics (including `text-pose-jump`, added in review), explicit strict gates, measured contrast/handoff checks, passage hierarchy checks, multi-format specimens, and the Lab text timeline with seeking, word-emphasis authoring and pixel review controls.

### Recorded checks

| Check                               | Result                                                                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check:fast`                   | Schema generation, package boundaries, formatting, lint, TypeScript and all **505 unit tests** pass. The typography suites contain 19 cases.                                                           |
| `pnpm test:runtime`                 | **43 tests pass**.                                                                                                                                                                                     |
| `pnpm test:integration`             | **86/91 pass**. Five tests are blocked by the existing `access-open` asset checksum mismatch described below.                                                                                          |
| Focused typography browser fixture  | Deterministic backward seeks, fixed counter width, identical animator handoff pixels, invisible-ink contrast detection; scale-in ink centroid drift **0.247 px** (limit 0.5 px).                       |
| Eight persisted typography fixtures | All pass; **21** isolated end/end+1 comparisons are identical. Includes line and word masks, rich spans, marks across line breaks, variable Thai text, semantic narration, vertical and commerce text. |
| Glyph performance                   | **1.43×** the static draw time for the 60-character fixture (limit 1.5×), using median warmed runs on the reference machine.                                                                           |
| Preview/export                      | Seven encoded transition-video samples pass the existing parity thresholds; maximum normalized mean absolute error **0.006606**.                                                                       |
| Golden parity suite                 | Five scenes, 15 samples, 30 comparisons pass without baseline updates.                                                                                                                                 |
| Legacy source parity                | All **1,344 full-resolution frames** across seven v013 studies are byte-identical against the starting commit `1e63aa3`; renderer versions are unchanged.                                              |
| Lab controls                        | Adding emphasis on a spoken word, seeking from word ticks and running rendered pixel checks pass in Chromium.                                                                                          |
| Specimens and lint                  | **53** sheets/reports cover seven v013 studies, eight new fixtures, the legacy animator fixture and 37 passage beat/format combinations from all 13 valid passage plans.                               |

The legacy animator reports a **102-pixel** settled/static handoff difference; new animators report zero. The legacy Evidence Boundary caption authored as adjacent `composite-note` / `composite-note-end` nodes now reports its orphan. The shared `pretty` fixture produces “Not a” / “recovered pantry” and clears the rag diagnostic.

The reproducible browser checks are [typography.ts](../tests/browser/typography.ts), [typography-fixtures.ts](../tests/browser/typography-fixtures.ts), and [typography-legacy.ts](../tests/browser/typography-legacy.ts). The last accepts `--baseline-root` pointing to a source snapshot of the starting commit. Acceptance sources live in [the typography fixture directory](../benchmarks/fixtures/typography); regenerate them with `pnpm typography:prepare`.

Local review output is retained at `benchmarks/results/typography-review-20260928-complete/manifest.json` (generated artifacts remain ignored). The directory also records the passage preflight. Video and parity samples are at `/tmp/still-shift-type-final`, pivot evidence at `/tmp/still-shift-typography`, and full legacy comparisons at `/tmp/still-shift-type-legacy-browser`.

### Existing fixture limitations

Three illustrated-sequence passage plans (`access-story.json`, its `sound` variant and its `narrated` variant) cannot load because the pinned `access-open` checksum differs from the local asset. This also reproduces using `1e63aa3` and causes the five narration/audio/SFX integration failures. Their checksums and artwork were preserved; they are excluded from the 13 valid plans above.

The archived v013 Access Constraint video also differs from a fresh render of the starting commit from frame 72. Direct before/after comparison of this implementation against that commit is clean across every frame. Archived goldens were not rewritten to hide that pre-existing difference.

## Review fixes (2026-09-28)

An independent review of the branch reproduced the recorded checks above and found four defects. Each is fixed and covered by a test that fails on the previous behaviour.

| #   | Defect                                                                                                                                                                                                                                                                                    | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Legacy Lab regression.** The text timeline was attached to every scene containing text, including scenes without `type-1`. Its extra disclosure made `pnpm test:browser:story` (part of `pnpm test`) fail with a strict-mode locator violation on Category Swap.                        | The text timeline is part of the `type-1` opt-in ([motion-tools.ts](../apps/lab/src/motion-tools.ts)); legacy scenes keep their previous inspector.                                                                                                                                                                                                                                                                                                                                     |
| R2  | **Text containers dropped.** The typography draw path returned before `drawTextContainer`, so speech, thought and caption bubbles silently disappeared in opted-in scenes, and the typography safe-area check ignored container bounds and tails.                                         | `drawTextContainerShape` draws the legacy container geometry around the shaped layout's content box, behind the type and outside its overflow clip. The box follows the displayed state and eases between state boxes during transitions. [`validateTypographySafeArea`](../packages/renderer-core/src/typography-safe-area.ts) includes container bounds with tails, which also covers passage preflight. Legacy container pixels are unchanged (the drawing code was only extracted). |
| R3  | **Release pop.** `release` restarted from the emphasis's full target value. In the semantic fixture the signal-bound compression had already returned to rest at frame 140, so "Less room" tracking jumped from 0 to −45 at frame 145 (about 13 px on the last glyph) before easing back. | `release` no longer adds an animator. It fades the emphasis layer's `weight` from 1 to 0 over the release window, so it releases from the current value whether the emphasis is held or signal-bound. An existing weight curve is continued from its last value; overlapping curves fail with `text-release-weight`.                                                                                                                                                                    |
| R4  | **Qualification did not make room.** `qualify` animated the claim's leading, which moves only later lines. For a single-line claim, including the fixture's "Less room", the claim moved 0 px at every frame.                                                                             | The claim moves away from its qualifier as a held offset (`amount` × claim size, default 0.15), with spaces travelling with it. Held animator offsets are now part of the settled safe area.                                                                                                                                                                                                                                                                                            |

To catch pops like R3 in future, a ninth diagnostic, `text-pose-jump`, flags a single-frame glyph displacement above `jumpBudget` (default 2 px) that neighbouring frames do not share. The fixture suite now fails on any `text-pose-jump`, and its end-frame checks use the later of an animator's `end` and its last weight key, so release fades receive the same end/end+1 pixel comparison.

### Re-verification after the fixes

| Check                                                                                                | Result                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check:fast`                                                                                    | Pass; **509 unit tests** (four new: signal-bound release continuity, held release fade, qualification in both directions, and `text-pose-jump` flagging the previous release while passing the compiled one).                                       |
| `pnpm test:browser:story`                                                                            | Pass again (R1): 98 parity comparisons, 14 backward seeks, timing controls, phone layout, 646-frame export and 30 fps CLI.                                                                                                                          |
| `pnpm test:browser:typography`                                                                       | Pass, with a new container probe (R2): the speech container's fill is drawn, and a text node whose bubble tail crosses the frame edge fails the safe-area check while the same text without its container passes. Centroid drift is still 0.247 px. |
| `pnpm test:browser:typography:fixtures`                                                              | All eight fixtures pass with no `text-pose-jump`. The semantic and vertical fixtures now also compare the release end (frame 165) with the next frame; both are identical. Glyph performance measured 1.43× on a loaded machine (limit 1.5×).       |
| Legacy container pixels                                                                              | Speech, thought and caption containers at left, centre and right alignment hash identically before and after the extraction (nine renders).                                                                                                         |
| Story continuous, passage authoring, Lab session, motion craft, illustrated, commerce, golden parity | Pass (run during the review, before the fixes; the fixes touch no code these suites exercise beyond the extracted container drawer).                                                                                                                |
| `pnpm test:integration`                                                                              | 86/91, unchanged. The same five tests fail on `main` because `access-open.svg` hashes to `52ab…` while fixtures pin `f83c…`.                                                                                                                        |

The 1,344-frame legacy source-parity comparison was not re-run after the fixes; the only legacy drawing code touched is the container extraction verified above.

## Follow-up fixes (2026-09-28)

The three craft follow-ups from the review are resolved:

1. **Blur isolation.** Text is composited in consecutive glyph groups with the same blur value. A settled glyph is drawn without a filter even while another glyph is blurred. The focused browser test compares its pixels with an unanimated control.
2. **Weight and stroke.** `weight` emphasis uses the pinned font's `wght` axis when all targeted runs support it, with a bounded default increase of 150 axis units. Fonts without that axis use a true Canvas glyph outline for emphasis and `strokeWidth`; the eight-copy approximation is removed. The browser test compares the result with a direct `strokeText` reference.
3. **Lint coverage.** `moving-while-read` checks every reading window. `idle-type-motion` requires a cue, signal, or time-overlapping semantic text event, so naming a layer alone cannot suppress it. Unit tests cover later-window motion and a named drift layer.

The measured `animator-handoff-snap` check also now samples the later of the animator end and its final weight key, matching the fixture checks for releases. The focused browser test verifies a release ending after its animator window. The eight typography fixtures, seven preview/export samples and the focused browser test pass after these changes.

## Research disposition (2026-10-08)

**Restored:** 2026-10-09 from the original planning chat. The source statuses,
reproductions and estimates below describe the recorded `8faae4be` checkpoint,
not current `main`. Core CE15/CE14 delivery is now complete; review unresolved
findings against the released source before scheduling any repair. MS0–MS2 retain
the accepted production requirements. Restoration establishes planning continuity,
not fresh implementation or runtime acceptance.

This is the detailed disposition within the existing plan, not a new milestone
series. The [active roadmap](../ROADMAP.md) retains CE15 → CE14 → composition
closeout → MS0/MS1 → MS1N → MS2. Accept means include in the named phase's scope;
defer means no scheduled implementation; decline means do not adopt the suggested
approach. A reproduction task does not authorize a speculative renderer repair.

### Evidence boundary and current baseline

Read the [assessment][ta], [research index][tr], design/review guidance and the
assessment's font/layout, semantic, workflow, cache and independent review evidence.
Its final source revision is `f848b9a170d55062f4f716f1d977b6f663b7897b`.
Fresh v003 exports instead began at `c2473c2369b15067e6f209285aaf694d2c020a64`
with recorded working-tree drift in `managed-metadata.ts`; the later source
continuity review is not a fresh f848 runtime qualification. See the
[v003 packet][tv3] and [final integration addendum][tfinal].

This planning audit inspected local `codex/composition-ce15` HEAD `8faae4be`.
The two subsequent commits (`61d7b911`, `8faae4be`) repair GPU/Canvas color work
lifetimes. The only production source changed since f848 is `color-effects.ts`.
All 60 distinct code-file SHA-256 bindings extracted from the assessment's
font/layout, semantic, workflow and cache notes still match current files.
The specific gaps below therefore remained in that recorded source; no new
runtime reproduction on that HEAD, remote-delivery claim or full gate was asserted.
Existing owner edits were retained. The original session changed documentation
only; the 2026-10-09 restoration updates the repository development log.

Reuse completed TY1–TY8, the September review/follow-up repairs, CE4 adapter and
text-clock work, CE12 linting and CE15 cache/worker checkpoints. In particular,
font integrity/loading, axes/features, full-run shaping, color-span spacing,
state preparation, counters, bounds, vertical overrides and target bindings exist.
Do not rebuild these capabilities or relabel old checks as fresh results. CE12's
completed default stillness checks and CE15's successful cache fixtures remain
valid in their recorded scope; neither covers every new assessment input.

Five no-cache Canvas/H264/single-worker v003 outputs have recorded full decode
and byte/frame identity with v002 (600 frames), supporting only the saved bounded
visual findings. All five default pixel-lint runs failed. The clips are silent;
there is no continuous playback, listening, reader, real-phone or broad production
pass. The precise substituted platform face in SS05 is unknown. The earlier v001
unused SVG decode failure is superseded by the corrected PNG probes and is not
accepted here as a general SVG defect. Historical temporary export files that are
now absent remain dated reported results, not fresh acceptance evidence.

### Phase placement and size estimates

Estimates are planning ranges in active engineering days, including focused
regressions and evidence preparation, excluding milestone-wide gates and production
review. They are not deadlines or additive commitments: shared fixtures, font
metadata and diagnostic plumbing should be implemented once. Re-estimate at the
phase entry against its then-current code and available production inputs.

| Existing phase                                                | Accepted work                                                                                                               | Priority and estimated incremental scope                                                             |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| CE15 remaining cache/export acceptance                        | Cached upload reliability and actionable CLI causes, one transport/lifecycle slice                                          | P1; 2–4 days transport plus 1–2 days diagnostics, sharing tests                                      |
| MS0 baseline/dependency audit                                 | Exact font/copy inventory; confirm reproduction routes and carry forward unresolved evidence                                | P1 font inventory; P2 risk triage; about 1 day shared preparation                                    |
| MS1 native overlays and portable E01                          | Font gate; declared quantity/phrase contracts; intentional holds; portrait-anchor negative/positive pair; mask reproduction | P1 font work 3–5 days; P2 contracts 2–4, holds 2–4, portrait 1–2; mask probe 0.5–1                   |
| MS2 reusable authoring, before the relevant treatment is used | Explicit weight/outline choice, count-fit reproduction, Thai segmentation/tracking probes                                   | P2; weight 1–3 days, fit probe 0.5–1, combined Thai probes 1–2                                       |
| Conditional investment after a named shot demonstrates need   | Continuous genuine font-size relayout; broader shaping or automatic optical layout                                          | P3; unscheduled; font-size prototype/implementation roughly 5–10 days, re-estimate after feasibility |

MS1's complete-quantity and phrase work starts with authored metadata/examples
using existing primitives. A generalized automatic semantic group compiler is
only justified by repeated MS2 friction. Risk probes can share the MS0 inventory;
their scheduled phase owns actual reproduction and any separately sized repair.
No typography capability expansion is a new prerequisite for CE14 or a reason to
interrupt CE15's valid in-flight verification.

### Cached export reliability

**Current status: unresolved in source. Classification: observed failure. Accept,
P1, in [CE15's existing cache acceptance](composition-ce15-plan.md#typography-assessment-export-follow-up-2026-10-08).**
SS01 cached CLI and API fail on the assessment's recorded run; explicit
`--workers 1 --cache-static false` exports that same input. The stack identifies
the per-part guard: non-`Uint8Array` **or** more than 65,536 bytes. The rejected
part's actual type, size and surface identity were not instrumented. This is not
proof of total surface overflow, exhausted cache memory or a font error.

The [store](../packages/execution-runtime/src/composition-surface-store.ts),
[broker](../packages/execution-runtime/src/composition-surface-broker.ts) and
[client](../packages/execution-runtime/src/composition-surface-client.ts) still
combine a complete browser byte body with a raw HTTP stream and a fixed per-part
ceiling. Accept because this is a demonstrated public export blocker within CE15's
current remit. Depend on its ownership/admission lifecycle; normalize valid stream
partitioning at the transport boundary or provide equivalently bounded consumption.
Preserve exact totals, checksum, leases, backpressure, cancellation and aggregate
budgets. Do not silently disable static caching or loosen aggregate limits.

Acceptance/evidence: capture rejected-part facts in a fresh isolated reproduction;
exercise valid equal-byte bodies partitioned below, at and above the threshold
through the real client/broker, including byte and float surfaces. Export exact
SS01 cached and uncached from the same frozen checkpoint, retain commands/input
hashes and compare full decode, critical encoded states and repeated outputs.
Keep malformed types, truncation, extra bytes, checksum/ownership failures,
cancellation and foreign-output protection negative. Extend affected one/four-worker
checks; the five old no-cache exports establish no multiworker result. The existing
oversized-part unit expectation must be retained behind a normalizing adapter or
replaced with an explicit revised store contract and equally strong budget checks.

### Actionable CLI diagnostics

**Current status: unresolved. Classification: observed failure. Accept, P1, in the
same CE15 slice; MS1 reuses it.** [CLI exception mapping](../tools/still-shift-cli/src/cli.ts)
preserves `AnimationEngineError` but masks other failures behind
`RENDER_FAILED: Unexpected animation command failure` and generic retry advice.
The [cache review][tcache] and saved CLI/API records demonstrate the lost cause.

Retain existing exit codes and the outer failure envelope. Add bounded, sanitized
stage/cause details and useful recovery guidance, distinguishing stream type/part,
aggregate length, checksum and ownership failures. Do not expose broker credentials,
raw scene contents or unrestricted stacks. Depend on transport error distinctions;
reuse the same diagnostic path for MS1 receipts instead of building a second mapper.
Scope is 1–2 days shared with transport and CLI integration tests.

Acceptance/evidence: actual failing CLI commands emit machine-readable and useful
human diagnostics without requiring an API rerun; known structured errors, unknown
errors, non-Error reasons and cancellation retain correct semantics. Assert bounded
cause output and redaction, unchanged exit behavior and no misleading blanket retry.
Retain failure stdout/stderr alongside the successful repaired cached export.

### Exact-copy font coverage

**Current status: integrity/loading addressed; glyph coverage unresolved.
Classification: observed failure. Accept, P1, MS0 inventory → MS1 shared font gate.**
SS05's Plex-only Thai compiles/exports without a coverage diagnostic;
`systemFontLayers: []` describes explicitly unpinned layers and does not prove
absence of glyph fallback. [Font loading](../packages/renderer-core/src/prepared-fonts.ts)
and [metrics parsing](../packages/renderer-core/src/font-metrics.ts) still omit
`cmap` coverage. Accept because portable native overlays need predictable copy.

Inspect exact reachable text per resolved font run, including states, corrections,
formatted counts, case transformations and punctuation. Reuse bounded prepared-value
collection; account explicitly for controls, combining marks and unsupported font
formats. A Unicode coverage check is necessary evidence, not proof of shaping or
platform resolution. Keep the current SFNT TTF/OTF scope; do not add WOFF2/collections
incidentally. Share parsing/preparation across native and adapter routes.

Acceptance/evidence: exact SS05 negative names font hash/id, affected text/span and
missing code points; the Noto SS02 control covers its copy and preserves inspected
marks. Include mixed Latin/Thai, state-generated characters and malformed metadata.
For an explicitly allowed fallback, retain declared policy, exact pinned fallback
assets and actual resolution evidence where measurable; otherwise say unmeasured
and do not certify exact-face rendering. Preserve historical warning behavior for
legacy inputs while reporting the gap; use an explicit strict production check for
MS1. Never silently replace a pinned font. Coverage and identity together estimate
3–5 days plus the shared MS0 inventory.

### Truthful font cut and axis identity

**Current status: axis range/feature validation exists; static identity incomplete.
Classification: design-contract gap, source established. Accept, P1, merged with
the font gate above.** Hashes bind bytes; authored weight descriptors are accepted
without reading font names or `OS/2.usWeightClass`. The assessment did not freshly
render an intentionally misdeclared static weight, so do not call that an observed
pixel failure. See the [font/layout audit][tfont].

Record actual family/subfamily and cut/style metadata with variable axes/defaults;
validate authored declarations against the applicable static or variable contract.
A variable face's default weight is not its only valid instance. Synthetic bold or
an outline must not be reported as a genuine cut. Preserve old JSON interpretation;
add diagnostics/strict-profile behavior before considering breaking validation.

Acceptance/evidence: Plex Semibold declared 600 passes and a deliberately false
static declaration is diagnosed; real Noto ranges/instances pass and unsupported
axes/ranges fail. Bind exact files and resolved instances, show compiled/rendered
route and encoded endpoints. Loading success alone cannot close this item. Font
coverage/identity validation must not perturb CE15 cache keys or resource ownership
without corresponding fingerprint/version and affected parity checks.

### Genuine weight versus outline emphasis

**Current status: both routes implemented; semantic distinction not explicit enough.
Classification: design-contract gap. Accept, P2, MS2 reusable authoring.**
[Event compilation](../packages/scene-contract/src/typography-events.ts) selects
`wght` only if every targeted run has positive headroom; otherwise it outlines.
`amount` consequently switches between axis units and outline pixels. Existing
unit/browser tests cover these implementations; they do not make the fallback a
truthful genuine-weight recipe.

Expose requested and resolved treatment, units, font instance/range and fallback
reason. New genuine-weight requests must report unavailable headroom rather than
silently change treatment. Keep legacy automatic events numerically/pixel compatible
and report their resolved route; explicit outline remains a valid graphic treatment.
Depend on MS1 font identity and reuse compiled animators. Do not introduce another
renderer or add visual vocabulary to frozen family schemas; story conveniences
may compile to the existing native primitives. Estimate 1–3 days.

Acceptance/evidence: genuine variable weight, static face, maximum-weight face and
mixed-run headroom cases have explicit resolved receipts; test release/end boundaries
and backward seeks. Retain actual compiled axis versus stroke values and encoded
states, including natural English gaps. A changed raster alone is insufficient to
prove genuine weight; legacy fallback behavior remains covered.

### Continuous genuine font-size relayout

**Current status: absent; geometric scale and genuine axis variants already exist.
Classification: proposed capability. Defer, P3, conditional investment.**
[Animator properties](../packages/scene-contract/src/motion-craft.ts) have scale,
tracking, leading and axes, but no continuous size-relayout property. Do not relabel
raster scaling or `wght` as the research's continuous 128→196 px size fixture.
There is no named MS1 requirement that justifies its layout/cache cost yet.

If scheduled, begin with a bounded native-composition design: deterministic sampled
sizes, wrapping/reflow semantics, anchor stability, complete ink bounds, resource
budgets, cache identity and exposure/fractional-frame behavior. Depend on shared
font preparation and CE15 budgets. Preserve existing scale semantics and version
any new output contract; do not expand frozen family visual schemas. Estimate
5–10 days subject to feasibility and scope, with no implementation commitment.

Acceptance/evidence: exact genuine size metrics and rerasterized intermediate
states for the 128→196 case, a deliberate line-wrap boundary, reverse/random seeks,
encoded preview/export parity and bounded cache/memory cost. Compare endpoints
with real static typesetting, not only enlarged raster pixels. A named production
shot must demonstrate why existing treatments are insufficient before scheduling.

### Complete quantity, unit and qualification associations

**Current status: grouping/formatting exists; semantic association incomplete.
Classification: design-contract gap, demonstrated by an intentional negative.
Accept, P2, MS1 overlay contract; generalize only as needed in MS2.**
SS03 resolves to the complete group; SS04 deliberately renders only `12` before
unit/qualification appears at frame 70. That faithfully rendered input is not a
renderer defect. Generic opacity/reading warnings do not identify its missing
semantic context. Count formatting and width reservation do not establish factual
intermediate values.

Add explicit member IDs, units, required qualification and designated reading
intervals to the authored review/project contract, with stable references through
save/reload/compile. Validate jointly readable context over those intervals and
review the entrance for misleading value-only states. Reuse normal groups and
roles. Never infer semantic associations or historical truth from adjacency or
numeric interpolation. Endpoint presentation is the default when intermediates
lack an authored meaning. Scope 2–4 days shared with phrase contracts.

Acceptance/evidence: retain SS03 and SS04; the negative reports association/member
and exact interval, while an authored complete English/Thai control passes the
association check. Inspect native and declared reduced encoded first/change/resolved
states, especially low-alpha qualifiers: equal opacity is not equal readability.
Wrong/missing IDs, replaced copy, units changing mid-count and saved-project
round trips remain covered. Legacy unannotated scenes still render with an explicit
unassessed semantic status; a new strict project profile requires declared context.

### Intact phrase treatments

**Current status: explicitly authorable and observed for one Noto phrase; no general
safe-phrase guarantee. Classification: design-contract gap. Accept, P2, merged into
MS1 authored treatments; decline a new segmentation engine for this capability.**
Full selection, zero stagger, all-text anchor and no mask already express intact
motion. Semantic `reveal` instead defaults to staggered lines/words and a line mask.
Reuse an explicit recipe/brief, preserving meaningful phrases, technical identifiers,
negation and authored breaks. Do not change existing reveal defaults globally or
claim that Unicode graphemes encode meaning. Depend on exact font/copy checks.

Acceptance/evidence: compiled treatment retains full selection and phrase timing;
English spacing and SS02 Thai marks survive entry/change/end encoded states,
backward seeks and saved-project reload. Include `Wi-Fi 6E`, `USB-C 30W` and a
quantity/negation example without splitting their intended association. This closes
only the inspected full-phrase route; finer Thai units remain the separate probe below.

### Intentional reading holds and motion diagnostics

**Current status: configurable CE12 thresholds/roles/shots exist; purpose-specific
holds and reading eligibility remain incomplete. Classification: design-contract
gap with observed default-lint failures. Accept, P2, MS1 reading/label verification.**
Use [existing policy](../packages/renderer-core/src/composition/quality-policy.ts)
and [typography analysis](../packages/renderer-core/src/typography-quality.ts).
Do not recreate CE12 or the older authoring-feedback plan. Its default six frozen
comparisons is an intentional continuous-motion policy, not a universal reading
rule. SS01's 1.20-second eligible interval against a 1.33-second heuristic is not
measured unreadability; text-clock changes can interrupt reading eligibility even
when copy remains present. Completed settled/idle clock cache work does not resolve
that distinction.

Add bounded purpose/interval metadata through the existing quality-policy seam;
report justified reading holds separately while retaining raw measurements and
unexplained freezes. Define eligibility from stable, sufficiently visible/readable
content, including color-only emphasis and authored locale, rather than assuming
all animation clocks destroy reading time. Record policy identity in reports;
persistence belongs in the portable project/sidecar, not frame rendering. Default
unannotated continuous-motion behavior stays unchanged. Estimate 2–4 days; share
quantity/label interval fixtures and dependencies with MS1.

Acceptance/evidence: default SS01–SS05 reports remain reproducible; an intentional
readable hold is distinguished from an unintentional freeze or blank hold. Color-only
emphasis with adequate contrast can retain eligible reading time; content replacement,
low opacity, significant movement, SS03's clamp velocity change and SS04's late
opacity jump remain detectable. Test 24/30 fps, interval boundaries, Thai/English
locale, save/reload and unchanged pixels. Preserve MS1's 30 consecutive fully readable
label frames and any longer text-specific requirement. Decline filler motion,
blank padding, silence or slowed narration as heuristic repairs; fix copy, hierarchy,
event order or purposeful timing instead. Playback/listening remain separate review.

### Scoped validation of source-audited risks

Accept the following **reproductions**, P2, not an assumed defect list. Each needs
an exact valid input and saved failure/control before a repair is scoped. If the
predicted failure does not reproduce, record that result and retain only the supported
contract limitation. No blanket renderer rewrite or baseline regeneration follows.

| Finding and current code status                                                                                                                                                              | Classification, disposition, phase and dependencies                                                                                                                              | Acceptance and retained evidence; compatibility and size                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mixed-size masks: line metrics expand for spans, but non-none masks still use base layout ascent/descent in `typography-renderer.ts`; native bounds already include more than authored boxes | Source-audited risk. Accept MS1 reproduction beside overlay checks; depend on real loaded fonts and the existing mask path                                                       | Base 36/inline 96, Latin descenders and Thai upper/lower marks; line/word masks versus unmasked control at entry, active and resolved frames, including reverse seeks. Distinguish intentional reveal clipping from unintended lost ink. Save encoded samples and independent visual recheck. Probe 0.5–1 day; if confirmed, likely 1–2 days scoped extent repair, with versioned intended pixel changes and unchanged ordinary masks                                                                                                               |
| Generated count values in shared fitting: `prepareTextFits` uses explicit states, while `typographyTextValues` enumerates formatted counts; width reservation already exists                 | Source-audited risk. Accept MS2 reproduction before reusable count+fit use; depend on a permitted shared-fit caller, not direct native authoring                                 | Valid `1`→`2`, decimals 2, tabular pinned text in a narrow box; run fit then raster preparation and compare every generated string. Fit once for all reachable values or reject unsupported combination before claiming success. Keep 10,000-value budget, stable anchor and existing numeric-binding+fit rejection. Probe 0.5–1 day; possible 1–2 day repair sharing reachable-value collection; no new native auto-fitter                                                                                                                         |
| Finer Thai segmentation: complete runs are painted, then grapheme-estimated slices receive poses; no actual browser shaping-cluster map                                                      | Source-audited risk. Accept MS2 probe; defer finer-unit support claims/architectural replacement until results. Depend on MS1 coverage and fixed Noto bytes/axes                 | Six research stress strings plus production copy; intact control versus independent translation/rotation/opacity/retype, color boundary and size/font boundary. Inspect consecutive encoded windows, marks, ink overlap and final states at native/declared reduced sizes. Record which units are supported; no blanket broken-Thai claim. Share 1–2 days with tracking; shaping-engine replacement needs a new scoped estimate                                                                                                                     |
| Script-sensitive tracking: opt-in size-only `opticalTracking(96)` yields −25/1000 em (−2.4 px); ordinary default is zero                                                                     | Source-audited risk; source-proven policy mismatch, no observed defect in SS02. Accept MS2 paired probe and explicit script-aware authoring warning; defer global default change | Same exact Thai/mixed copy, font and size with tracking 0 versus opt-in formula. Retain resolved values and encoded mark/gap checks. Explicit authored tracking wins; existing outputs do not silently change. A new safe profile must specify script/run behavior and justify any prohibition. No universal automatic optical-spacing claim; share Thai probe effort                                                                                                                                                                               |
| Portrait annotation anchors: vertical overrides, crop/world mapping and outside-crop rejection exist; semantic target and optical placement are authored                                     | Source-audited risk. Accept MS1 portrait test, extend existing MS2 anchor recipes; no new automatic recomposition engine                                                         | Recreate lost-label/leader negative and corrected portrait control, preserve target ID through crop/scale/rotation, caption/contact exclusions and text size changes. Check source/world endpoint analytically and intended part/clearance in encoded entry/mid/exit frames. Include named center without measured text size; require explicit geometry/offset instead of inferred ink center. Save/reload and reverse seeks; 1–2 days shared with E01 anchor tests. Existing coordinate semantics unchanged; repair only a reproduced engine fault |

### Architectural decisions and implementation evidence

1. Keep one composition/typography implementation. Shared font facts, reachable
   text and compiled treatments feed native rendering, adapters and diagnostics.
   Browser shaping remains the baseline; `cmap` and grapheme segmentation do not
   substitute for shaped-pixel inspection. Do not adopt a new shaping engine now.
2. Preserve the frozen family visual vocabulary and existing scale/reveal/weight
   defaults. New semantic authoring recipes compile to existing primitives;
   genuinely new visual properties belong in native composition. Use explicit
   profile/version transitions for stricter validation or changed pixels, with
   migration notes and affected compatibility checks.
3. Keep semantic association and reading intent in the existing portable authoring/
   quality-policy path, with stable layer IDs, input hashes and report policy
   identity. They do not change pixels implicitly. No duplicate lint service,
   typography-only exporter or automatic factual-quantity inference is planned.
4. Cache transport accepts valid bytes independently of HTTP partitioning while
   retaining resource and integrity bounds. Errors carry sanitized actionable
   causes. MS1 consumes that CE15 work rather than duplicating it.
5. Technical correctness, exact-font evidence, semantic completeness, selected-frame
   readability, normal-speed playback/listening and human comprehension are separate
   verdicts. Neither font readiness, successful export nor lint alone establishes
   production quality. Real-phone results cannot be inferred from 320/360 bitmap
   reductions; project permissions and natural narration remain binding.

When implementation is scheduled, retain a packet keyed by exact source/dirty diff,
input/font hashes, toolchain, backend, renderer/evaluator, FPS, dimensions, codec,
workers and cache mode. Save commands, full diagnostics, compiled route, negative
controls, encoded boundary picks, full technical decode and repeat-output comparisons
where export changes. Seek/preview checks alone do not replace final-file review.
Explicitly label unmeasured platform resolution, playback, listening and reader claims.

Use existing local pnpm commands for relevant unit/runtime/CLI and browser suites:
`test:runtime`, `test:integration`, `test:browser:composition-surfaces`,
`test:browser:composition-parallel`, `test:browser:typography`,
`test:browser:typography:fixtures`, `test:browser:composition-typography-adapter`,
`test:browser:composition-provider-typography` and `test:browser:composition-quality`,
selecting affected checks at each slice. Preserve thresholds and frozen baselines.
Before expensive runs verify pinned tools, Python, imports, browser startup and
isolated optimizer/config caches. No fixture regeneration in the active owner
checkout. Scoped repairs do not require a new full gate; CE15 and later milestones
still require their original acceptance gates, with cost explained before starting.
This planning session runs document checks only; GitHub Actions remain prohibited.

[ta]: </Users/jjae/Documents/obsidian/ai-business/Knowledge Base/Motion Graphics/typography/assessments/2026-10-08-still-shift/assessment.md>
[tr]: </Users/jjae/Documents/obsidian/ai-business/Knowledge Base/Motion Graphics/typography/README.md>
[tv3]: </Users/jjae/Documents/obsidian/ai-business/Knowledge Base/Motion Graphics/typography/assessments/2026-10-08-still-shift/packets/v003/README.md>
[tfinal]: </Users/jjae/Documents/obsidian/ai-business/Knowledge Base/Motion Graphics/typography/assessments/2026-10-08-still-shift/qa/final-integration-addendum.md>
[tcache]: </Users/jjae/Documents/obsidian/ai-business/Knowledge Base/Motion Graphics/typography/assessments/2026-10-08-still-shift/qa/cache-failure-independent-review.md>
[tfont]: </Users/jjae/Documents/obsidian/ai-business/Knowledge Base/Motion Graphics/typography/assessments/2026-10-08-still-shift/fonts-and-layout.md>
