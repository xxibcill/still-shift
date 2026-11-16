# Editorial title overlays: improvement plan

Date: 2026-11-15. Status: **ET0–ET3, ET5a and ET5b merged on `main` (PR #60,
#61, #62, #63, #66, #67); G1 owner review done 2026-11-16
([record](./editorial-typography-g1-review-2026-11-16.md)): all three proof
treatments rejected on style, and the aesthetic target is now the owner's social
fashion-reel references. Remaining milestones as reordered by the
[direction review](#direction-review-2026-11-15). ET7a on
`codex/editorial-titles-et7a`: the owner accepted all 16 candidates ("all
yes"), so the success measure is met on the local-only reels (D-auth open;
[results](./editorial-typography-et7a-results.json)).** ET0
re-baselined every finding on `main` (98a92e92); see
[Re-baseline on `main`](#re-baseline-on-main-et0) below and the
[ET0 results](./editorial-typography-et0-results.json).
Source evidence: [proof report](./editorial-typography-proof-2026-11-15.md) and
[results JSON](./editorial-typography-proof-2026-11-15-results.json). Finding IDs
(O1–O11, P1) refer to that report.

## Goal

Make Still Shift a dependable renderer and checker for editorial and kinetic title
overlays on video, so a person or an AI planner can produce varied treatments that
are correct (exact copy and glyphs), placed by measurement rather than hand
coordinates, and checked against the actual moving frames. Taste, footage
understanding and candidate search stay outside `packages/` (ET7a, ET7b).

**Success measure (confirmed by the owner in G1, 2026-11-16):** on at least two
authorized clips, an AI-written batch of eight candidate titles per clip passes
strict font coverage and the legibility checks, needs no person to edit
coordinates, and the owner accepts at least three of the eight on each clip.
Engine milestones are worth doing to the extent they move this number.

_Open (D-auth):_ G1 approved the owner's third-party reference reels for
local use only. Whether that counts as "authorized" here is not yet decided.
If it does, no visual evidence of the pilot can be committed, so the result
rests on the owner's recorded verdicts. See [Decisions needed](#decisions-needed).

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
  ET5c reuses that plan's MS2 Thai probes.

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

Milestone IDs in this table predate the direction review below: ET5 is now
ET5a/ET5b/ET5c, ET6 is ET6a/ET6b, and ET4 is reduced.

## Direction review (2026-11-15)

After ET0–ET3 the remaining plan was reviewed against its results. The foundation
held: each finished milestone fixed or guarded an observed failure. The remaining
order did not, for these reasons.

- **No person has judged any output.** ET3 flags a headline that agent review had
  passed (2.72:1 against 3:1). Thresholds and priorities need the owner's view of
  real frames first (G1).
- **The goal itself was last.** Candidate generation and the aesthetic proof came
  after four more engine milestones. ET1–ET3 are enough to run a thin pilot now,
  and its evidence should order the engine work (ET7a, which absorbs ET8).
- **Measurement beats new anchors for a planner.** A planner that can measure text
  can place it; ET4 shrinks to repairing the defect and ET6a moves ahead of it.
- **One ET6 check was not achievable as written.** Text is shaped by the browser's
  canvas, so "without launching a render" becomes "browser preparation only, no
  frames rendered".
- **ET5 mixed priorities.** The serif seams persist through the hold on an
  animated serif headline, a visible defect (ET5b). The framing and decoration
  guards are cheap and come first (ET5a). Probes wait for a real need (ET5c).
- **Fonts limit variety more than any engine gap.** Four pinned faces cannot give
  "attractive and varied". G1 asks the owner to approve fonts and a clip.
- **Verification debt and follow-ups were untracked** (ET9).

## Milestone tracker

| ID   | Milestone                                         | Findings | Depends on                   | Estimate (active days)                     | Status                     |
| ---- | ------------------------------------------------- | -------- | ---------------------------- | ------------------------------------------ | -------------------------- |
| ET0  | Tracked fixtures and baseline                     | O1–O6    | owner: ET0 clip              | 1–2                                        | Merged on `main` (PR #60)  |
| ET1  | Exact-copy font coverage gate (= MS1)             | O5       | ET0                          | 3–5; re-estimate (core gate exists)        | Merged on `main` (PR #61)  |
| ET2  | Pixel lint over native video                      | O4, O8   | ET0                          | ~1 (O4 fixed; tests, bounds, cancellation) | Merged on `main` (PR #62)  |
| ET3  | Text-over-video legibility checks                 | O6       | ET2                          | 3–5; actual 1 session                      | Merged on `main` (PR #63)  |
| G1   | Owner review and inputs (no code)                 | —        | owner                        | owner time                                 | Done 2026-11-16            |
| ET5a | Framing and decoration guards                     | O2, O3   | ET0, owner: align            | 1–2                                        | Merged on `main` (PR #66)  |
| ET7a | Generator pilot and aesthetic proof (absorbs ET8) | —        | ET1–ET3, G1                  | 3–5; actual 1 session                      | Done: owner accepted 16/16 |
| ET6a | Text measurement command                          | O9       | ET7a evidence                | 2–3                                        | Proposed                   |
| ET5b | Serif seam fix                                    | O11      | ET0                          | 1–3 after root cause                       | Merged on `main` (PR #67)  |
| ET4  | Attach bounds repair (reduced)                    | O1       | ET0; scope from ET7a         | 2–3                                        | Proposed                   |
| ET6b | Editorial title lint profile                      | O7       | G1 (reading rule, ET3-D1/D2) | 1–2                                        | Proposed                   |
| ET5c | Deferred probes                                   | O10, P1  | a real title needing them    | per probe                                  | Deferred                   |
| ET9  | Release verification and carried follow-ups       | —        | before the next release      | 1–2                                        | Proposed                   |
| ET7b | External orchestration                            | —        | ET7a result, owner: location | 5–10                                       | Deferred                   |

Recommended order: G1 → ET5a → ET7a → (ordered by ET7a's evidence, see
[ET7a](#et7a--generator-pilot-and-aesthetic-proof-absorbs-et8)) ET6a → ET6b
(widened to treated display text) → small fixes ET7a found → ET4 → ET9 before
any release → ET7b. ET5a and ET5b do not depend
on G1's visual review and can run while it is pending. Estimates are planning
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

## G1 — Owner review and inputs (no code)

**Why:** four milestones in, no person has judged any output, and every remaining
threshold and priority depends on that judgement. ET3 flags the proof's "Olive"
headline at 2.72:1, which agent review had passed; only the owner's eyes can say
which of the two is right.

**Scope**

- Review the three existing pass-2 treatments (entrance, hold, exit and phone
  sheets in [`docs/review/editorial-typography-proof-2026-11-15/`](./review/editorial-typography-proof-2026-11-15/);
  the MP4s are in the primary checkout's git-ignored
  `benchmarks/results/editorial-typography-proof-2026-11-15/`).
- Settle the open decisions listed under [Decisions needed](#decisions-needed).
- Approve inputs for the pilot: one authorized vertical clip, and a short list of
  fonts to pin. Open-licence faces are enough to start; candidates to verify at
  pin time (licence text, source URL and SHA-256 recorded): a high-contrast
  display serif with italic (for example Playfair Display, Cormorant Garamond,
  Bodoni Moda), a script (for example Pinyon Script), a condensed Latin display
  (for example Anton, Oswald) and a Thai display or serif (for example Noto Serif
  Thai, Prompt, Kanit). Downloading any of them needs the owner's go-ahead.
  Pin TTF or OTF files: WOFF and WOFF2 are rejected before render (PR #64).

**Result (2026-11-16):** see the [G1 record](./editorial-typography-g1-review-2026-11-16.md)
and [results](./editorial-typography-g1-results.json). The owner watched T1–T3
re-rendered from `main` a897acb4, with the ET5 fixes, on a phone, and rejected
all three. In the owner's words: "not because still-shift is bad. because of
it's style of text and animation is not satisfy me". The owner then supplied
social fashion-reel references. Their shared style is:

- one large mixed-type lockup over the subject;
- legibility from outlines, shadows or boxes;
- a word-by-word build, held across fast cuts.

This style replaces editorial magazine minimalism as the target.

**Checks**

- [x] Acceptance or rejection of T1, T2 and T3 recorded per treatment, in the
      owner's words, with what should change. _All three rejected on text style
      and animation; the change is the reference style above._
- [x] ET3-D1 and ET3-D2 decided against those frames. _D1 split by size: "Olive"
      at 2.72:1 "easy to read", but the folio at 3.7:1 is readable in size and hard
      to read against the background. D2 kept._
- [x] Clip and font list approved; rights and licences recorded beside the inputs.
      _Fonts approved: the list above plus every popular free Thai family, with
      licences recorded at pin time in ET7a. Clip: the owner's reference reels as
      local-only test footage ("Yes, local only"). They are third-party, so
      nothing from them is committed; the repository is public._
- [x] Success measure (see [Goal](#goal)) confirmed or replaced. _Confirmed._

---

## ET5a — Framing and decoration guards

**Why:** two traps passed every check (O2, O3), and a generator will hit both
repeatedly. They are cheap and independent of the pilot's outcome.

**Result (2026-11-15):** implemented on `codex/editorial-titles-et5a` and
merged on `main` via PR #66; see the
[ET5a results](./editorial-typography-et5a-results.json). Pixel lint reports
both traps by default as errors: `text-off-canvas` (O2 fixture 0.399 of its
settled ink, matching ET0's pixel measurement; pass-1 T3 `line` 0.399 and
`credit` 0.365) and `orphaned-decoration` (O3 fixture frames 70–83 and its
first frame 4; pass-1 T2 `tag` 134–149). The opt-in decoration field
`fadeWithText` makes the bar follow its text's opacity. Default renders are
unchanged; the only ET0 baseline changes are the two new findings.

**Scope and checks**

- [x] **Align contract (O2).** Owner decides: keep origin centring (document it
      and warn when `align` is not `left` and the text overflows the frame) or
      centre within `textLayout.width` behind a versioned field. _Implemented
      the recommended guard (documented contract; the finding names it when a
      centred or right-aligned layer overflows). D-align stays open: the
      versioned centring field was not built._
- [x] **Partial off-canvas severity.** A layer with a large share of its ink
      off-frame is reported as an error proportional to the hidden fraction,
      distinct from a few-pixel safe-inset incursion. The ET0 O2 fixture (39.9%
      off-frame) fails; a 5 px incursion stays a warning. _`text-off-canvas`,
      `measured` = hidden share of settled glyph ink, threshold
      `textOffCanvasFraction` (default 0.05). Pixel lint only; text animators'
      excursions are excluded; layer transforms count except on
      frames within 0.5 s of the layer crossing the edge (hidden share changing
      by more than 0.5 per second; PR #66 review)._
- [x] **Decorations and fades (O3).** Either highlight/box/underline inherit their
      text's animator opacity (versioned), or lint reports a visible decoration
      with fully transparent text. The ET0 O3 fixture (frames 70–83) is caught or
      fixed. _Both: `orphaned-decoration` lint, and opt-in `fadeWithText`
      (`o3-highlight-fade-with-text.ts`: bar pixels after the fade 50,483 → 0)._
- [x] Existing outputs and default lint results unchanged unless versioned.
      _Render hashes unchanged; default lint changes only where the new rules
      fire, recorded in the ET0 baseline._
- [x] `pnpm check:fast` plus the browser groups for each touched area.

Estimate: 1–2 days.

---

## ET7a — Generator pilot and aesthetic proof (absorbs ET8)

**Why:** this is the first test of the actual goal. ET1–ET3 already give an AI
agent a strict copy check, a legibility signal over real frames and fast renders.
Running the loop on real inputs shows whether the results are attractive and
varied, and which engine gaps cost the most, before more engine work is designed.

**Scope** (in this repository, outside `packages/`)

- A skill beside [`skills/compose-with-still-shift`](../skills/compose-with-still-shift/SKILL.md)
  (working name `design-editorial-titles`): a small design grammar (roles,
  hierarchy, pairing, placement zones, treatments, entrance/hold/exit timing),
  the check loop, and what to record. The agent is the candidate generator.
- A thin script that, for one clip and copy, renders each candidate, runs
  `--font-coverage strict` and `--legibility true`, and builds contact sheets
  (entrance, hold, exit; native and phone scale).
- **Target style (G1):** the owner's social fashion-reel references, not
  editorial minimalism. Each title is:
  - one large lockup over the subject's torso, clear of the face;
  - mixed type per word (script or italic serif with heavy caps, condensed,
    extended or brush faces) and several colours;
  - made legible by outline, shadow, glow or a box;
  - built word by word in 1–2 s, then held across fast cuts, with optional
    decorations and small sub-labels.

  The [G1 record](./editorial-typography-g1-review-2026-11-16.md#engine-capability-against-the-references)
  maps each technique to current engine features. Confirm that mapping
  first, starting with the static glyph outline: try a `stroke`/`strokeWidth`
  text animator held at its end state with `to`, and only if that fails treat
  the outline as an engine gap.

- Inputs from G1: pinned fonts (the approved list plus popular free Thai
  families) and the owner's reference reels as **local-only** test footage.
  The reels, and every render and contact sheet made over them, stay
  git-ignored: keep the reels in `benchmarks/results/editorial-titles-references/`
  and the pilot's outputs in `benchmarks/results/editorial-titles-et7a/`
  (`benchmarks/results/*` is the only ignored media path; `research/` is not
  ignored). Check `git status` before each commit. Commit the composition sources, SHA-256s, check results and the
  owner's verdicts only.
- For each candidate, record the number of render-and-fix iterations and which
  problem caused each one (placement, overflow, contrast, collision, seams,
  missing measurement). This is the evidence that orders ET4, ET5b and ET6a.

**Result (2026-11-16):** implemented on
`codex/editorial-titles-et7a`; see the
[ET7a results](./editorial-typography-et7a-results.json), the
[skill](../skills/design-editorial-titles/SKILL.md), the
[pilot sources](../research/editorial-titles-et7a/README.md) and the
[check script](../scripts/editorial-titles/et7a-check.ts). Twenty-five fonts are
pinned with licences in `assets/editorial-titles/fonts/`. Two 7 s segments of
the owner's reels (local only) carry 8 candidates each, 4 of the 16 with Thai or
mixed Thai/English titles. The mapping held when rendered: a stroke animator
held at its end state draws a static outline behind the fill, and spans with
named styles, drop shadow, highlight boxes, word reveals and native sparkles
work. `light.glow` has no colour, so a halo is a zero-offset drop shadow.

- **Iterations:** 11 render-and-fix iterations over 16 candidates; 7 were
  right first time. Causes: missing measurement 5 (4 widths, 1 decoration
  offset), a highlight that ignores a glyph-by-glyph build 2, thin scripts
  with only a halo seen as weak by the agent 2, and one each for face
  placement, a font the metadata reader rejects, span-style axis inheritance,
  a boxed label that lint measured at 2.03:1 while its glyphs typed in, and a
  script ampersand that read poorly at phone size. In all: 43 renders (26
  design, 16 verification, 1 fix after verification).
- **Checks:** every candidate passes strict coverage and pixel lint
  (no errors). Boxed labels measure 6.1–17.2:1. Every treated display layer
  measures about 1.0–1.2:1 and is waived with a reason: the contrast mask
  counts the outline ring as glyph pixels and credits no shadow or halo
  (a new gap, below).
- **Engine fix needed to run the loop:** `--legibility` pixel lint failed
  schema validation on any text with spans; fixed in `text-legibility.ts`
  with a unit test.
- **Cost:** shadows and halos make Canvas renders and legibility lint about
  10 and 20 times slower (a01 15 s + 16 s; a03 130 s + 453 s).

**Ranked gaps** (by iterations and checks they cost):

1. **ET6a measure** — 5 of 11 fix iterations, plus font metrics read
   outside the engine for every stacked lockup.
2. **ET6b, widened** — contrast for treated display text: all 16 candidates
   needed waivers, and the two weak-script cases were caught by eye, not lint.
   Measure fill against its outline/shadow ring, and set the G1 display level.
3. **New small fixes** — font name budget (Prompt Black), span-style axis
   inheritance, decoration reveal under per-glyph builds (two iterations),
   highlight padding, coloured glow.
4. **New: effect render cost** — before candidate search at scale (ET7b).
5. **ET4** — no candidate used `attach`; zero iterations. Defer until a
   layout needs runtime-adaptive anchoring.

ET5b needed nothing: no seams in any glyph-animated serif.

**Owner review (2026-11-16):** the owner reviewed the contact sheets and
answered "all yes": all 16 candidates accepted, 8/8 on each reel, with no
per-candidate comments. The success measure (at least 3 of 8 per clip, on two
clips) is **met**, with caveats: both clips are third-party reels used local
only, so D-auth stays open and nothing visual is committed; the reels' own
burned-in text (reel A's small labels) was visible during review; and one
blanket answer does not rank the styles. Agent judgements stay separate from
this acceptance.

**Checks**

- [x] At least 8 visually distinct candidates for one clip and copy, on at least
      two clips or copies, including one Thai or mixed title. _8 per reel on two
      reels; 4 Thai or mixed._
- [x] Every candidate passes strict font coverage; legibility findings are fixed
      or waived with a reason. _Labels pass on boxes; treated display layers
      waived (reason in each composition)._
- [x] No person edits coordinates; the agent's iterations are counted.
- [x] Contact sheets built for owner review (local only over the reference reels;
      committed only for owner-shot, licensed or synthetic footage); font
      licences recorded beside the pinned fonts. _Both clips are third-party
      reels, so no sheet is committed (D-auth still open)._
- [x] Owner's acceptance or rejection recorded per candidate, in the owner's
      words. Agent scores are labelled as such and never treated as acceptance.
      _"all yes": 16/16 accepted; no agent scores were given._
- [x] Result against the success measure stated, pass or fail. _Pass: 8/8
      per reel on two reels, on local-only third-party clips (D-auth open)._
- [x] `packages/` gains no taste or footage-analysis code. _One lint bug fix
      only._
- [x] Ranked list of engine gaps by iterations cost, with a recommendation for
      the order of ET6a, ET5b and ET4. _Above._

Estimate: 3–5 days after G1. Not attempted here: subject mattes for text behind a
subject, automatic footage analysis and preference learning (ET7b).

---

## ET6a — Text measurement command

**Why:** a planner that can measure copy before rendering can compute positions
itself, which removes hand coordinates without new attach features. Start only
if ET7a shows measurement or placement iterations are a leading cost.

**Scope**

- CLI `comp measure` and a Node API returning, for a composition or a single text
  request, the same prepared rest and motion bounds, line and cluster boxes, ink
  and cap boxes, and font coverage that rendering uses.
- Text is shaped by the browser's canvas, so measuring runs the pinned headless
  browser's preparation step only. No frames are rendered or encoded.

**Checks**

- [ ] `comp measure` bounds equal render-time `textBounds` exactly for all ET0
      fixtures and proof treatments.
- [ ] Measuring 100 copy variants renders no frames; timing and peak memory
      recorded.
- [ ] Ink and cap boxes match rendered ink within ±1 px on the ET0 attach fixture.
- [ ] Cancellation leaves no temporary files (reuse the ET2 checks).
- [ ] `pnpm check:fast`, `pnpm test:browser:composition-quality`.

Estimate: 2–3 days.

---

## ET5b — Serif seam fix

**Why:** thin vertical fragments at serif edges appear during masked per-glyph
entrances and, as ET0 found, persist through the whole hold while a per-glyph
tracking animator runs (O11). That is a visible defect in a title's main element,
not a minor probe. It can run in parallel with ET7a.

**Result (2026-11-15):** implemented on `codex/editorial-titles-et5b` and
merged on `main` via PR #67; see the
[ET5b results](./editorial-typography-et5b-results.json). Root cause: each
glyph was drawn as a slice of the line's raster cut at its advance, so a
serif overhanging into the neighbour's slice moved and faded with the
neighbour. Lines whose glyphs have different poses now draw runs of
same-pose glyphs from their own shaped rasters; lines with one pose keep the
slices, so settled text is unchanged. Renderer versions
`composition-canvas-1.47.8` and `composition-webgl2-0.68.8`.

**Review (2026-11-16):** the [PR #67](https://github.com/xxibcill/still-shift/pull/67)
review's findings are fixed on the branch, one commit each: segment rasters
are bounded to the most recently used per raster; a segment with mixed span
colours under one animated fill is tinted as a whole; a ligature or
contextual form whose clusters have different poses keeps its shape (one
joined-unit raster cut at the layout advance) instead of being reshaped as
separate glyphs until it settles; and the WebGL2, export-memory,
tint-capacity and parallel groups were run (all pass). See `reviewFixes` in
the results.

**Scope and checks**

- [x] Failing test first: the ET0 `o1-attach-animated` fixture at frame 45 and
      the proof T1 at frames 30–36 and 100 show the fragments; the static control
      shows none. _A static-render oracle (`tests/browser/composition-glyph-seams.ts`)
      fails on `main` (the "v" loses 188 px of serif that travel with the "e";
      "li" 70 px, "iv" 164 px) and passes at 0. Lossless before/after renders
      of the O1 fixtures and pass-1 T1 are in the results; the static control is
      byte-identical in all 96 frames._
- [x] Root cause identified (candidate: overhang clipping when per-glyph slices
      change position) and fixed at the cause. _Confirmed._
- [x] Settled frames remain pixel-identical to the static draw path; kerning and
      ligatures inside a unit are preserved. _Uniform lines keep the slice path;
      segments are shaped as one run at the layout's kerned positions (an "fi"
      ligature dropping as a word matches the static oracle). Chromium drops
      optional ligatures under non-zero tracking, so T1 (−35) forms none._
- [x] Any intended pixel change is versioned and its affected baselines listed.
- [x] `pnpm check:fast`, `pnpm test:browser:typography`,
      `pnpm test:browser:composition-typography-adapter`, composition baselines.

Estimate: 1–3 days after root cause.

---

## ET4 — Attach bounds repair (reduced)

**Why:** `attach` follows the line box widened by animation excursions, so label
gaps of 18/30 px render as 150/239 px (O1). The original scope also added new
anchor types; with ET6a a planner can place by measurement, so only the defect is
fixed here unless ET7a shows runtime-adaptive layout is needed.

**Scope**

- Separate **rest** bounds (settled layout) from **motion-union** bounds (culling,
  safe-area); `attach` can choose rest bounds. Old JSON keeps current behaviour.
- `ink` and `cap` reference boxes alongside the current `line` box.
- Deferred until evidence asks for it: target alignment by a normalized point on
  the target's own box, and state lint evaluating `attach` (O9).

**Checks**

- [ ] Failing case first: the ET0 attach fixture measures 18/30 px gaps within
      ±1 px at rest, with entrance and exit animators present.
- [ ] Gaps stay fixed during the hold while the headline animates its tracking.
- [ ] Same layout with changed copy ("Olive" → "Ochre & Olive", and a Thai
      headline) keeps the gaps for left-aligned followers.
- [ ] Old compositions using `attach` render byte-identically.
- [ ] Reverse seeks and repeated exports match.
- [ ] `pnpm check:fast`, `pnpm test:browser:composition-typography-adapter`,
      `pnpm test:browser:composition`, composition baselines unchanged.

Estimate: 2–3 days.

---

## ET6b — Editorial title lint profile

**Why:** the default reading rule fails every title with gentle hold motion (O7),
which conflicts with the owner's continuous-motion preference; ET3's targets may
also need an editorial setting (ET3-D1).

**Scope**

- An `editorial-title` policy profile: reading windows that allow bounded slow
  drift (displacement and velocity budgets), plus the contrast and phone-scale
  values the owner chose in G1.

**Checks**

- [ ] Under the profile, proof T1–T3 hold drift passes `reading-time`; a fast or
      jittery hold still fails.
- [ ] Contrast and x-height results match the G1 decisions on the proof frames.
- [ ] Default policy results unchanged.
- [ ] `pnpm check:fast`, `pnpm test:browser:composition-quality`.

Estimate: 1–2 days after the owner's rule.

---

## ET5c — Deferred probes

Run only when a real title needs them; each is a probe before any repair.

- [ ] **Axis validation (O10).** Reproduce the `-20–900` rejection; validate
      reachable axis values over time, or state the conservative rule in the
      diagnostic. No out-of-range value may reach rendering.
- [ ] **Thai finer units and script-sensitive tracking.** The typography plan's
      MS2 probes with the ET0 Thai fixture and a pinned Thai display face; record
      supported units. No blanket claim either way.
- [ ] **Text behind a subject.** A subject matte supplied as a `sequence` used as
      a track matte over a title; record whether it renders and lints correctly.

---

## ET9 — Release verification and carried follow-ups

**Why:** ET1–ET3 ran the fast and targeted tiers only. ET2 changed how lint
serves its page, and the installed-package route for that is untested.

**Checks**

- [ ] `pnpm check` on the then-current `main`, failures and reruns retained.
- [ ] `pnpm release:check` before any release that includes ET1–ET3, including
      `comp lint --pixels true` and `--legibility true` from an installed package.
- [ ] WebGL2 backend: one video-backed title fixture rendered and linted with
      legibility on both backends.
- [ ] `comp render` handles SIGINT/SIGTERM with the same cleanup ET2 gave
      `comp lint`.
- [ ] Default media cache in the OS temp folder: eviction or a clear failure
      message with the path to clear (it currently fails every new preparation
      once full).
- [ ] ET2-D1 and ET2-D2 decided and applied.

This is not a release. Publishing still needs the owner's explicit request.

---

## ET7b — External orchestration (after the pilot)

Only if ET7a meets the success measure or shows a clear path to it.

- Font library manifest with roles, pairing tags and scripts covered.
- Footage analysis: free-space and contrast maps over the title's visible frames;
  subject mattes.
- Candidate search, a visual critic and recorded human choices for possible
  preference learning.
- Whether this stays an in-repository skill and scripts or moves to a separate
  package or repository is decided here, from the pilot's size.

---

## Out of scope for this plan

Text on a path, per-character 3D extrusion, a new shaping engine, automatic font
licensing, AI video generation, publishing or release. Paid generation is not
needed; any ElevenLabs use still requires batch-specific approval.

## Decisions needed

All are the owner's. G1 collects them.

| ID      | Decision                                                                                | Needed by | Recommendation                                                                                                             |
| ------- | --------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| D-view  | Visual acceptance of proof T1, T2, T3                                                   | G1        | **Decided (G1):** all rejected on style; target the owner's references                                                     |
| ET3-D1  | Contrast targets for titles over footage (WCAG AA 3:1/4.5:1, or a looser display level) | G1, ET6b  | **Decided (G1):** large display text may go below 3:1 (2.72:1 read easily); small text keeps 4.5:1; ET6b sets the boundary |
| ET3-D2  | Phone-scale floor: 6 px x-height at 360 px                                              | G1, ET6b  | **Decided (G1):** keep                                                                                                     |
| D-meas  | Success measure for the pilot                                                           | G1        | **Decided (G1):** 3 of 8 accepted per clip, on two clips                                                                   |
| D-input | One authorized vertical clip; fonts to pin (open-licence list or licensed files)        | G1, ET7a  | **Decided (G1):** fonts are the list plus popular free Thai families; clips are the owner's reels, local only              |
| D-align | `align` contract: centre on origin, or within `textLayout.width`                        | ET5a      | Keep origin, document and guard                                                                                            |
| D-read  | How much hold motion counts as readable                                                 | ET6b      | —                                                                                                                          |
| ET2-D1  | Near-static footage counted as frozen                                                   | ET9       | Keep current rule                                                                                                          |
| ET2-D2  | Default `decodedCacheBytes` rejects a 60 s 1080×1920 clip before decoding               | ET9       | —                                                                                                                          |
| D-clip  | Keep the committed synthetic fixture clip (merged with ET0)                             | Any time  | Keep                                                                                                                       |
| D-home  | Where orchestration lives long-term                                                     | ET7b      | In-repository skill for the pilot; decide after its size                                                                   |
| D-auth  | Whether local-only third-party reels count as authorized clips for the success measure  | ET7a      | ET7a passed on two such reels; still open. Recommended: confirm on one owner-shot, licensed or synthetic clip              |
