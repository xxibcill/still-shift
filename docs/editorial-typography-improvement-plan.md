# Editorial title overlays: improvement plan

Date: 2026-11-15. Status: **ET0, ET1 and ET2 merged on `main` (PR #60, #61,
#62); ET3 done on `codex/editorial-titles-et3` (not pushed, no PR); ET4–ET8
proposed.** ET0 re-baselined every finding on `main`
(98a92e92); see [Re-baseline on `main`](#re-baseline-on-main-et0) below and the
[ET0 results](./editorial-typography-et0-results.json).
Source evidence: [proof report](./editorial-typography-proof-2026-11-15.md) and
[results JSON](./editorial-typography-proof-2026-11-15-results.json). Finding IDs
(O1–O11, P1) refer to that report.

## Goal

Make Still Shift a dependable renderer and checker for editorial and kinetic title
overlays on video, so a person or an external AI planner can produce varied
treatments that are correct (exact copy and glyphs), placed by measurement rather
than hand coordinates, and checked against the actual moving frames. Taste,
footage understanding and candidate search stay outside the core (ET7).

## Rules for every milestone

- Start from `main` on a `codex/` branch and target the PR at `main`
  ([AGENTS.md](../AGENTS.md)). Never on `production`.
- Use the pinned toolchain (`pnpm toolchain:check`). GitHub Actions are prohibited;
  verify locally ([verification tiers](./verification.md)).
- Each milestone begins by reproducing its findings as **failing** fixtures and
  ends with them passing. Retain failed runs and reruns in the milestone record.
- Existing outputs do not change silently. Any intended pixel or validation
  change is versioned, opt-in, or listed with its affected baselines.
- Software checks are not visual acceptance. Human review is recorded separately
  and never inferred from lint, render success or an AI score.
- Close each milestone with a dated [dev-log](./dev-log.md) entry and a results
  JSON beside this plan.
- Shared work is implemented once. ET1 **is** the font gate already scoped as MS1
  in the [typography plan](./typography-motion-engine-plan.md#exact-copy-font-coverage);
  ET5 reuses that plan's MS2 Thai probes.

## Re-baseline on `main` (ET0)

The proof ran on `e6eb7b06`; `main` is 424 commits later. All nine proof renders
are byte-identical on `main`, so every rendered finding behaves as recorded. Lint
and font routes did change. Details and numbers are in the
[ET0 results](./editorial-typography-et0-results.json); fixtures and their
recorded outcomes are in
[`benchmarks/fixtures/editorial-titles/`](../benchmarks/fixtures/editorial-titles/README.md).

| ID  | On `main`                                                                                                               | Effect on this plan                                                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | Still reproduced: 18/30 px authored gaps render as 92/107 px static, 150/239 px animated                                | ET4 unchanged                                                                                                                                                                     |
| O2  | Still reproduced: 39.9% of the line's ink off-frame; lint gives only `outside-safe-area`                                | ET5 unchanged                                                                                                                                                                     |
| O3  | Still reproduced: bar visible on frames 70–83 with no text ink                                                          | ET5 unchanged                                                                                                                                                                     |
| O4  | **Fixed** by `6ed1a5d0` (prepared media replaced base64 inlining)                                                       | ET2 needs no root cause; its O4 checks become regressions                                                                                                                         |
| O5  | Still reproduced on `comp`; the core gate exists on `main`                                                              | ET1 partly done: cmap 4/12, identity, strict/legacy `inspectFontText` and reachable-copy collection exist and gate mechanism episodes; the composition route passes no validation |
| O6  | Still reproduced: contrast falls to 1.16:1 with no finding                                                              | ET3 unchanged                                                                                                                                                                     |
| O7  | Still reproduced                                                                                                        | ET6 unchanged                                                                                                                                                                     |
| O8  | Changed: state lint no longer flags footage; pixel mode flags footage-only spans that are near-static in encoded pixels | ET2's frames 157–167 check revised below                                                                                                                                          |
| O9  | Changed: state lint still cannot evaluate `attach`; pixel mode can                                                      | ET4/ET6 unchanged                                                                                                                                                                 |
| O10 | Still reproduced (`-20–900` worst case)                                                                                 | ET5 unchanged                                                                                                                                                                     |
| O11 | Still reproduced and wider: serif seams persist through the hold                                                        | ET5 probe includes hold frames                                                                                                                                                    |
| P1  | Still passes: mark gap 11–12 px in frames 21–34                                                                         | ET5 Thai probes unchanged                                                                                                                                                         |

## Milestone tracker

| ID  | Milestone                                   | Findings         | Depends on                            | Estimate (active days)                     | Status                     |
| --- | ------------------------------------------- | ---------------- | ------------------------------------- | ------------------------------------------ | -------------------------- |
| ET0 | Tracked fixtures and baseline               | O1–O6            | owner: ET0 clip                       | 1–2                                        | Merged on `main` (PR #60)  |
| ET1 | Exact-copy font coverage gate (= MS1)       | O5               | ET0                                   | 3–5; re-estimate (core gate exists)        | Merged on `main` (PR #61)  |
| ET2 | Pixel lint over native video                | O4, O8           | ET0                                   | ~1 (O4 fixed; tests, bounds, cancellation) | Merged on `main` (PR #62)  |
| ET3 | Text-over-video legibility checks           | O6               | ET2                                   | 3–5; actual 1 session                      | Done on branch, not pushed |
| ET4 | Measured multi-layer layout anchors         | O1, O9           | ET0                                   | 3–5                                        | Proposed                   |
| ET5 | Authoring guards and probes                 | O2, O3, O10, O11 | ET0, owner: align                     | 2–4                                        | Proposed                   |
| ET6 | Measurement API and editorial lint profile  | O7, O9           | ET4, owner: reading rule              | 2–4                                        | Proposed                   |
| ET7 | External orchestration pilot (outside core) | —                | ET1–ET4, owner: location              | 5–10                                       | Proposed                   |
| ET8 | Aesthetic proof on authorized real inputs   | —                | ET1–ET3 (ET7 optional), owner: inputs | 2–3                                        | Proposed                   |

Recommended order: ET0 → ET1 → ET2 → ET3 → ET4 → ET5/ET6 → ET8 → ET7. ET1, ET2 and
ET4 touch separate code and can run in parallel after ET0. Estimates are planning
ranges, not deadlines; re-estimate at entry against the then-current code.

---

## ET0 — Tracked fixtures and baseline

**Why:** the proof depends on a git-ignored local clip, so its findings cannot be
re-run elsewhere or used as regression tests.

**Scope**

- A small tracked, license-free video fixture, generated deterministically with
  FFmpeg (for example a 1080×1920, 24 fps, 3–4 s clip with a bright region, a dark
  moving band and a mid-tone textured region), with its generator script,
  descriptor and SHA-256. Target size well under 1 MB.
- Fixture compositions under `benchmarks/fixtures/editorial-titles/` reproducing:
  attach drift (O1), origin-centred overflow (O2), orphaned highlight (O3),
  video pixel lint (O4), missing Thai glyphs in a pinned Latin font (O5) and text
  crossing a dark moving edge (O6), plus the passing Thai mark/axis case (P1).
- Record each fixture's current outcome as an expected-failure baseline.

**Checks**

- [x] Generator reproduces the fixture clip byte-identically on rerun; descriptor
      hash verified by `comp validate`. (70,569-byte clip, SHA-256 `c4daea53…4019`;
      `--check` matched twice; a zeroed hash fails with `comp-media-checksum`.)
- [x] Every fixture renders with the pinned toolchain; render hashes recorded.
      (Eight renders in `et0-baseline.json`; a second run reproduced all of them.)
- [x] Each negative reproduces its finding with a measured value (gap pixels,
      off-frame fraction, bar visible after text opacity 0, lint error text,
      missing code points, background luminance under glyphs). Exception: O4 no
      longer reproduces on `main`; its fixture is recorded as a now-passing
      regression with the lint outcome instead of error text.
- [x] P1 control renders with marks attached in recorded frames.
- [x] `pnpm check:fast` passes; no existing baseline changes.

**Owner decision:** approve committing a synthetic clip (or name another
authorized source). ET0 committed the synthetic clip as its task brief asked;
the owner can still reject it at review.

---

## ET1 — Exact-copy font coverage gate

**Why:** a pinned font without Thai glyphs renders Thai from an unknown face with
no warning (O5). Wrong-face copy is a correctness failure, not a style issue.

**Scope** (the typography plan's MS1 font gate; implement once for native and
adapter routes)

**ET0 re-baseline:** `main` already reads `cmap` formats 4/12
([`font-cmap.ts`](../packages/renderer-core/src/font-cmap.ts)), records font
identity and checks reachable copy with legacy/strict profiles
([`font-identity.ts`](../packages/renderer-core/src/font-identity.ts),
[`font-copy.ts`](../packages/renderer-core/src/font-copy.ts)), and enforces it for
mechanism-episode font dependencies. The composition renderer calls
`loadCompositionFonts` without validation options and `comp` has no strict font
option, so O5 still reproduces there. Remaining ET1 work is mainly wiring the
existing gate into `comp validate`/`render`, the legacy warning, the explicit
pinned fallback list and the checks below. Re-estimate at entry.

- Read `cmap` (formats 4 and 12 at minimum) during font preparation; the proof's
  [`cmap-probe.ts`](../research/editorial-typography-proof/cmap-probe.ts) is a
  starting reference, not production code.
- Check exact reachable text per resolved font run: all states, transitions,
  corrections, formatted counts, case transforms, spans with their own fonts.
- Diagnostic names font id/hash, layer, span and missing code points. Strict mode
  is an error; legacy inputs keep current behaviour with a reported warning.
- Optional explicit fallback list of pinned fonts; never an unpinned system face.
- Record actual font family/subfamily, cut and axes (shared MS1 identity work).

**Checks**

- [x] ET0 Plex + Thai negative fails strict validation naming U+0E25, U+0E38,
      U+0E04 and the layer; it does not reach render.
- [x] Noto Sans Thai mixed tag and all three proof treatments pass unchanged,
      with identical render hashes.
- [x] Generated count strings and state text are included (a missing glyph only
      in state 2 is caught).
- [x] Combining marks, ZWJ/ZWNJ and spaces handled per documented rules;
      malformed or unsupported font tables give a clear error.
- [x] Explicit pinned fallback renders the missing glyphs from the declared face;
      result JSON records which runs used it.
- [x] CE15 cache keys and existing export baselines unchanged unless versioned.
- [x] `pnpm check:fast`, `pnpm test:browser:typography`,
      `pnpm test:browser:composition-provider-typography` pass.

---

## ET2 — Pixel lint over native video

**Why:** `comp lint --pixels true` failed in 6/6 video-backed runs (O4), so no
automated check sees the footage. State lint also reports moving footage as frozen
(O8).

**Scope**

- **ET0 re-baseline:** done on `main`. `6ed1a5d0` removed the base64 data-URL
  inlining and passes prepared media; all six proof runs and the ET0 video
  fixture now lint with pixels and text bounds. The O4 checks below are kept as
  regressions.
- Root-cause the `page.evaluate` navigation failure in
  [`composition-lint.ts`](../packages/animation-engine/src/composition-lint.ts)
  (candidates: base64 data URLs for every prepared frame in one payload; Vite
  dev-page reload). Fix at the cause, preferably by reusing the export path's
  prepared-media loading instead of inlining assets.
- Bound memory for long clips; respect `mediaLimits`.

**ET2 re-estimate and outcome (2026-11-15):** about 1 active day. No crash
remained, so ET2 became regression coverage, long-clip bounds and
cancellation. Memory and `mediaLimits` were already enforced: the Node cache
reserves `decodedCacheBytes`, and the browser LRU stays within
`decodedFrameBytes`. Cancellation was not clean: an interrupted `comp lint`
left a media staging directory, the cache lock, the lint dev-server cache and
the compiled program. Three causes, all fixed: the CLI never turned
SIGINT/SIGTERM into the lint's abort; a listening Vite dev server exits the
process on SIGTERM; Playwright exits on SIGINT after closing browsers. Review
of PR #62 found and fixed more cases. SIGHUP (a closed terminal) skipped
cleanup once Playwright's handlers were off. A cancel at browser start left
Vite's `deps_temp_*` until cleanup waited for the dependency optimizer, now
under one 10 s deadline. A second `browser.close()` returned before Playwright
removed its temporary folders. Final contract: SIGINT, SIGTERM and SIGHUP
cancel; after cleanup the CLI reports `comp-program-aborted` and exits 128 +
the signal number. Repeats within 1 s count as relays of the same request; a
later signal stops at once and may leave temporary files. Evidence:
[ET2 results](./editorial-typography-et2-results.json).

**Checks**

- [x] Write the failing reproduction first: ET0 video fixture with `--pixels true`.
      O4 no longer fails on `main`, so the reproduction is a regression test in
      `test:browser:composition-quality` and `test:browser:composition-media`.
      Each was shown to fail on a deliberately broken lint path before it was
      trusted. Re-inlining frames as base64, the pre-`6ed1a5d0` cause, fails
      only at proof scale. The media group therefore lints a 4 s high-entropy
      clip derived from the tracked one (571 MB prepared), which reproduces
      O4's exact error when inlining is put back.
- [x] All three proof treatments and the ET0 video fixtures lint with pixels
      (`measured.pixels: true`, `textBounds: true`). (O4 and O6 fixtures plus
      T1–T3 on this base; the proof clip is local and git-ignored, so only the
      fixtures are in the automated tests.)
- [x] Frames 157–167 of the proof (footage only) are no longer reported frozen
      in pixel mode. **Revised by ET0:** the proof clip is effectively static
      there in encoded pixels (mean inter-frame luma change ≤ 0.002/255, several
      frames exactly 0), so the pixel-mode report may be correct. Use footage
      with measurable motion (the ET0 synthetic clip reports no frozen frames)
      and decide separately whether near-static footage should count as motion.
      (Synthetic clip, its no-video control and a 60 s loop of it are tested.
      The proof still reports its footage-only tails frozen, the same as ET0:
      T1 148–167, T2 154–167, T3 144–167. Met as revised by ET0 for footage
      with measurable motion; whether the proof's near-static frames count as
      frozen is **deferred to owner decision ET2-D1**, and the policy is
      unchanged until then.)
- [x] A 60 s clip lints within recorded memory bounds; cancellation leaves no
      temporary cache. (1080×1920 at 24 fps: 155 s, 1.75 GB peak resident,
      decode LRU peak 132,710,400 B within its 134,217,728 B (128 MiB) budget,
      493 MB on disk. The
      default 8 GiB `decodedCacheBytes` rejects this clip before decoding, so
      the run declares 16 GiB; see the owner decision in the results.)
- [x] Non-video pixel lint results are byte-identical before and after.
      (35 runs against `main`: stdout, stderr and exit status identical, at
      8879e960 and again at eccdbd5e after the PR #62 review fixes.)
- [x] `pnpm check:fast`, `pnpm test:browser:composition-quality`,
      `pnpm test:browser:composition-media`, then `pnpm check:runtime`. (The
      first `check:runtime` failed only on local runtimes missing from a
      fresh worktree; it passed on rerun. Rerun in order at eccdbd5e after
      the PR #62 review fixes: all pass. The first rerun at 6a752868 caught a
      review-fix regression, which was fixed before push. See results.)

---

## ET3 — Text-over-video legibility checks

**Why:** composition lint has no text-contrast rule (O6). In the proof, a credit
and rule crossed a dark roof edge under parallax with no finding.

**Scope**

- Composition `text-contrast` in pixel mode: per frame in each text layer's
  reading window, sample the composited background under measured glyph boxes
  (with and without the text layer) and report the worst contrast, frames and
  affected span/word. Reuse the story `typography-quality` measure where it fits.
- Phone-scale legibility: x-height floor evaluated at a declared review width
  (for example 360 px for 1080 px output).
- Optional platform safe-zone policy (top/bottom/right UI bands) as data, not
  hard-coded per platform.
- Findings are advisory by default; `--strict text-contrast` gates.

**ET3 outcome (2026-11-15):** three opt-in rules, `text-contrast`,
`x-height-floor` and `platform-safe-zone`, enabled by a `textLegibility` policy,
`--legibility true` or `--strict <codes>`. Reports without them are unchanged.
The contrast measure reuses the story `text-contrast` measure. At every fully
covered glyph pixel, it takes the WCAG 2 contrast between the rendered frame and
the same frame with that layer's glyph colours made transparent, so the layer's
container and highlight stay as its backdrop. A word's value is the 5th
percentile. A colour-coded glyph mask attributes pixels to words; whitespace
separates words. Targets are WCAG 2 AA: 3:1 for headings, 4.5:1 for other
roles. The x-height floor uses the font's OS/2 x-height at a 360 px review
width, with a 6 px floor. Safe-zone bands are policy data; none are built in.
Per-layer waivers keep findings measured but never gating, and the report lists
them. Real treatments exposed three defects in the first measure, all fixed with
tracked regression tests: the story's `container-only` probe dropped highlights;
hiding layers in the mask moved attach-constrained labels; and edge pixels
diluted interiors. Definitions and limits are in the
[composition reference](./composition-reference.md#text-legibility-over-video-et3);
evidence is in the [ET3 results](./editorial-typography-et3-results.json).

**Checks**

- [x] ET0 dark-band fixture: flagged on exactly the frames where the band is
      under the text (±1 frame), naming the word. (Test written first and run
      red. Credit 27–47 and line 33–54, against band-under-glyph frames 27–47
      and 33–55; every word named, worst 1.04/1.05:1. In
      `test:browser:composition-quality`.)
- [x] Proof T3 pass 2: `· 03` reported over the roof edge; T1 pass 2 passes.
      **T3 met; T1 not met as written.** T3's credit is reported on frames
      44–120: "03" 1.53:1, "·" 3.21:1 and "EDIT" 3.40:1 (its T touches the
      roof). Its line passes (worst 6.86:1). T1 pass 2 is reported, not passed:
      "Olive" falls to 2.72:1 against 3:1 over the shadowed wall, and the
      folio's "No."/"—" to 3.74/3.76:1 against 4.5:1. In a sensitivity run at
      the 25th percentile (before the final interior threshold), "Olive"
      still read 2.91:1. This is a real, marginal shortfall, not an outlier
      statistic. The targets are owner decision ET3-D1.
- [x] T2 passes with its scrim and fails with the scrim removed. (The poster
      passes at 3.60:1 with the scrim and fails at 1.52:1 without it; the Thai
      subline rises from 1.31:1 to 4.37:1. With the scrim, the subline is
      still below its 4.5:1 target and is reported; see ET3-D1. The tag,
      measured against its own highlight, passes in both.)
- [x] Pass-1 label sizes (30–32 px) fail the phone-scale floor; pass-2 sizes pass.
      (Pass 1: T1 kicker 30 px is 5.16 px and folio 32 px is 5.57 px; T3
      credit 26 px is 4.47 px; all fail the 6 px floor. T1 pass 2, at 38/40 px,
      passes with 6.54/6.96 px. T3's pass-2 credit is still 32 px Plex Mono, so
      it fails at 5.50 px, consistent with the proof's own "30–32 px too
      small". Floor: owner decision ET3-D2.)
- [x] Intentional low-contrast decorative text can be waived per layer, and the
      waiver appears in the report. (`textLegibility.waivers`; the finding
      stays, as a warning with `waiver.reason` and `rawSeverity`; under
      `--strict` the other layer still fails.)
- [x] Runtime on a 7 s 1080×1920 clip recorded; no change to rendered output.
      (T3, 168 frames, two text layers: 12.4 s without the rules and 20.9 s
      with them; a separately timed run took 21.2 s at 1.28 GB peak resident. No renderer or export file changed; the ET0 render hashes match.
      Lint without the rules is byte-identical to `main` d510b7b6 over 38
      runs, including video.)
- [x] `pnpm check:fast`, `pnpm test:browser:composition-quality`. (Also
      `composition-media` and `check:runtime`; see results.)

**Owner decisions:** ET3-D1, the contrast targets for editorial titles over
footage (recommended: keep WCAG 2 AA and waive per title). ET3-D2, the
x-height floor (recommended: keep 6 px at 360 px).

---

## ET4 — Measured multi-layer layout anchors

**Why:** `attach` follows the line box widened by animation excursions, so label
gaps of 18/30 px became 153/213 px (O1), and the target reference point is in
absolute pixels. Hand coordinates were the only workaround, and they do not adapt
to new copy.

**Scope**

- Separate **rest** bounds (settled layout) from **motion-union** bounds (culling,
  safe-area); attach chooses, defaulting to current behaviour for old JSON.
- Reference boxes: `line` (current), `ink`, `cap` (cap height to baseline) and
  `baseline` points, from shaped layout and font metrics.
- Target alignment by a normalized point on the target's own reference box
  (for example align the kicker's bottom-left baseline to the headline's
  cap-top-left).
- State lint able to evaluate these constraints using Node-side measurement
  (shared with ET6) or a clear "needs measurement" limitation instead of failing
  outright (O9).

**Checks**

- [ ] Write the failing case first: ET0 attach fixture measures 18/30 px gaps
      within ±1 px at rest, with entrance and exit animators present.
- [ ] Same layout with changed copy ("Olive" → "Ochre & Olive", and a Thai
      headline) keeps the gaps; nothing is hand-moved.
- [ ] Gaps stay fixed during the hold while the headline animates its tracking.
- [ ] Old compositions using `attach` render byte-identically.
- [ ] Reverse seeks and repeated exports match.
- [ ] `pnpm check:fast`, `pnpm test:browser:composition-typography-adapter`,
      `pnpm test:browser:composition`, composition baselines unchanged.

---

## ET5 — Authoring guards and probes

**Why:** two traps passed every check (O2, O3); two behaviours are unexplained
(O10, O11); Thai finer-unit risks remain untested.

**Scope and checks**

- [ ] **Align contract (O2).** Owner decides: keep origin centring (document it
      and warn when `align` is not `left` and the text overflows the frame) or
      centre within `textLayout.width` behind a versioned field. Proof T3 pass 1
      produces an error-level finding proportional to the hidden fraction.
- [ ] **Partial off-canvas severity.** A layer 50% off-frame is reported
      differently from a 5 px safe-inset incursion.
- [ ] **Decorations and fades (O3).** Either highlight/box/underline inherit their
      text's animator opacity (versioned), or lint reports a visible decoration
      with fully transparent text. Proof T2 pass 1 is caught or fixed.
- [ ] **Axis validation (O10).** Reproduce the T2 pass-1 rejection; validate
      reachable axis values over time, or document the conservative rule in the
      diagnostic text. No out-of-range value may reach rendering.
- [ ] **Serif fragment (O11).** Reproduce at frames 30–36 with masked per-glyph
      entrance; classify as overhang clipping, mask feather or other, then fix or
      record as accepted. ET0 found the seams also persist through the hold while
      a per-glyph tracking animator runs (proof T1 frame 100; ET0
      `o1-attach-animated.ts` frame 45); include hold frames.
- [ ] **Thai probes.** Run the typography plan's MS2 finer-segmentation and
      script-sensitive tracking probes with the ET0 Thai fixture; record supported
      units. No blanket claim either way.
- [ ] `pnpm check:fast` plus the browser groups for each touched area.

---

## ET6 — Measurement API and editorial lint profile

**Why:** an external planner needs text sizes before rendering (fit, layout
search), and the default reading rule fails every title with gentle hold motion
(O7), which conflicts with the owner's continuous-motion preference.

**Scope**

- Node API (and CLI `comp measure`) returning prepared rest/motion bounds, line
  and cluster boxes, and coverage results for a composition or a single text
  request, identical to what rendering uses.
- `editorial-title` lint policy profile: reading windows that allow bounded slow
  drift (displacement and velocity budgets), set from the owner's rule.

**Checks**

- [ ] `comp measure` bounds equal render-time `textBounds` for all ET0 fixtures
      and proof treatments (exact match).
- [ ] Measuring 100 copy variants completes without launching a render, with
      timing recorded.
- [ ] Under the profile, proof T1–T3 hold drift passes reading-time; a fast or
      jittery hold still fails.
- [ ] Default policy results unchanged.
- [ ] `pnpm check:fast`, `pnpm test:browser:composition-quality`.

**Owner decision:** how much hold motion counts as readable.

---

## ET7 — External orchestration pilot (outside the core)

**Why:** hierarchy, font pairing, footage-aware placement and taste are not
engine features. Build them outside Still Shift, using ET1–ET4 and ET6 as the
deterministic contract.

**Scope** (separate package or repository, as the owner decides)

- Font library manifest: licensed pinned files, roles, pairing tags, scripts covered.
- Footage analysis: free-space and contrast maps over the title's visible frames;
  subject matte delivered to Still Shift as a `sequence` used as a track matte.
- Candidate generator that writes builder programs from a small design grammar.
- Render candidates, contact sheets, ET3 diagnostics, human selection; record
  choices for possible later preference learning.

**Checks**

- [ ] Generates at least 8 visually distinct candidates for one clip and copy;
      every candidate passes ET1 strictly and is linted by ET2/ET3.
- [ ] No candidate needs hand-edited coordinates.
- [ ] Contact sheet and human selection recorded; agent scores are labelled as
      such and never treated as acceptance.
- [ ] Still Shift core gains no taste or footage-analysis code from this pilot.

---

## ET8 — Aesthetic proof on authorized real inputs

**Why:** the proof used an illustrated stand-in and the repository's four fonts;
the owner's reference looks need real footage and display/italic/script faces.

**Scope**

- Owner supplies authorized vertical fashion footage (with motion and cuts) and
  licensed fonts, with permitted use recorded.
- Repeat the three-treatment review (entrance, hold, exit; native and phone
  scale), using ET1–ET3 checks.

**Checks**

- [ ] Rights and font licences recorded beside the inputs.
- [ ] All treatments pass ET1 strictly and ET2/ET3 with any waivers explained.
- [ ] Review frames and phone sheets committed.
- [ ] Owner's visual acceptance or rejection recorded per treatment, in the
      owner's words.

---

## Out of scope for this plan

Text on a path, per-character 3D extrusion, a new shaping engine, automatic font
licensing, AI video generation, publishing or release. Paid generation is not
needed; any ElevenLabs use still requires batch-specific approval.

## Decisions needed before starting

1. Approve the plan and the first milestone (recommended: ET0, then ET1).
2. Allow a small synthetic video fixture to be committed (ET0).
3. Align contract (ET5) and title reading rule (ET6).
4. Where the orchestration layer lives (ET7).
5. Authorized footage and licensed fonts (ET8).
