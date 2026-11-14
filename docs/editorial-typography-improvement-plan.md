# Editorial title overlays: improvement plan

Date: 2026-11-15. Status: **proposed; no milestone approved or started.**
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

## Milestone tracker

| ID  | Milestone                                   | Findings         | Depends on                            | Estimate (active days) | Status   |
| --- | ------------------------------------------- | ---------------- | ------------------------------------- | ---------------------- | -------- |
| ET0 | Tracked fixtures and baseline               | O1–O6            | owner: ET0 clip                       | 1–2                    | Proposed |
| ET1 | Exact-copy font coverage gate (= MS1)       | O5               | ET0                                   | 3–5                    | Proposed |
| ET2 | Pixel lint over native video                | O4, O8           | ET0                                   | 1–3 after root cause   | Proposed |
| ET3 | Text-over-video legibility checks           | O6               | ET2                                   | 3–5                    | Proposed |
| ET4 | Measured multi-layer layout anchors         | O1, O9           | ET0                                   | 3–5                    | Proposed |
| ET5 | Authoring guards and probes                 | O2, O3, O10, O11 | ET0, owner: align                     | 2–4                    | Proposed |
| ET6 | Measurement API and editorial lint profile  | O7, O9           | ET4, owner: reading rule              | 2–4                    | Proposed |
| ET7 | External orchestration pilot (outside core) | —                | ET1–ET4, owner: location              | 5–10                   | Proposed |
| ET8 | Aesthetic proof on authorized real inputs   | —                | ET1–ET3 (ET7 optional), owner: inputs | 2–3                    | Proposed |

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

- [ ] Generator reproduces the fixture clip byte-identically on rerun; descriptor
      hash verified by `comp validate`.
- [ ] Every fixture renders with the pinned toolchain; render hashes recorded.
- [ ] Each negative reproduces its finding with a measured value (gap pixels,
      off-frame fraction, bar visible after text opacity 0, lint error text,
      missing code points, background luminance under glyphs).
- [ ] P1 control renders with marks attached in recorded frames.
- [ ] `pnpm check:fast` passes; no existing baseline changes.

**Owner decision:** approve committing a synthetic clip (or name another
authorized source).

---

## ET1 — Exact-copy font coverage gate

**Why:** a pinned font without Thai glyphs renders Thai from an unknown face with
no warning (O5). Wrong-face copy is a correctness failure, not a style issue.

**Scope** (the typography plan's MS1 font gate; implement once for native and
adapter routes)

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

- [ ] ET0 Plex + Thai negative fails strict validation naming U+0E25, U+0E38,
      U+0E04 and the layer; it does not reach render.
- [ ] Noto Sans Thai mixed tag and all three proof treatments pass unchanged,
      with identical render hashes.
- [ ] Generated count strings and state text are included (a missing glyph only
      in state 2 is caught).
- [ ] Combining marks, ZWJ/ZWNJ and spaces handled per documented rules;
      malformed or unsupported font tables give a clear error.
- [ ] Explicit pinned fallback renders the missing glyphs from the declared face;
      result JSON records which runs used it.
- [ ] CE15 cache keys and existing export baselines unchanged unless versioned.
- [ ] `pnpm check:fast`, `pnpm test:browser:typography`,
      `pnpm test:browser:composition-provider-typography` pass.

---

## ET2 — Pixel lint over native video

**Why:** `comp lint --pixels true` failed in 6/6 video-backed runs (O4), so no
automated check sees the footage. State lint also reports moving footage as frozen
(O8).

**Scope**

- Root-cause the `page.evaluate` navigation failure in
  [`composition-lint.ts`](../packages/animation-engine/src/composition-lint.ts)
  (candidates: base64 data URLs for every prepared frame in one payload; Vite
  dev-page reload). Fix at the cause, preferably by reusing the export path's
  prepared-media loading instead of inlining assets.
- Bound memory for long clips; respect `mediaLimits`.

**Checks**

- [ ] Write the failing reproduction first: ET0 video fixture with `--pixels true`.
- [ ] All three proof treatments and the ET0 video fixtures lint with pixels
      (`measured.pixels: true`, `textBounds: true`).
- [ ] Frames 157–167 of the proof (footage only) are no longer reported frozen
      in pixel mode.
- [ ] A 60 s clip lints within recorded memory bounds; cancellation leaves no
      temporary cache.
- [ ] Non-video pixel lint results are byte-identical before and after.
- [ ] `pnpm check:fast`, `pnpm test:browser:composition-quality`,
      `pnpm test:browser:composition-media`, then `pnpm check:runtime`.

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

**Checks**

- [ ] ET0 dark-band fixture: flagged on exactly the frames where the band is
      under the text (±1 frame), naming the word.
- [ ] Proof T3 pass 2: `· 03` reported over the roof edge; T1 pass 2 passes.
- [ ] T2 passes with its scrim and fails with the scrim removed.
- [ ] Pass-1 label sizes (30–32 px) fail the phone-scale floor; pass-2 sizes pass.
- [ ] Intentional low-contrast decorative text can be waived per layer, and the
      waiver appears in the report.
- [ ] Runtime on a 7 s 1080×1920 clip recorded; no change to rendered output.
- [ ] `pnpm check:fast`, `pnpm test:browser:composition-quality`.

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
      record as accepted.
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
