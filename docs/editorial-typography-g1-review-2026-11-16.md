# Editorial titles: G1 owner review (2026-11-16)

Milestone G1 of the [improvement plan](./editorial-typography-improvement-plan.md#g1--owner-review-and-inputs-no-code).
Results: [`editorial-typography-g1-results.json`](./editorial-typography-g1-results.json).

## What was reviewed

The three proof treatments were re-rendered from `main` a897acb4, which includes
ET5a (PR #66) and ET5b (PR #67), over the proof's stand-in clip. The renders were
built with `research/editorial-typography-proof/review-frames.sh`, at native
size and as 360×640 phone sheets. The owner watched them on a phone.

| Treatment                | Render SHA-256 (prefix) | Change from the 2026-11-15 render                |
| ------------------------ | ----------------------- | ------------------------------------------------ |
| T1 editorial stack       | `ddb0a61805cb`          | Changed: ET5b serif seam fix                     |
| T2 Thai condensed poster | `23c3efeb0b4a`          | Byte-identical                                   |
| T3 minimal centred       | `14c2a486174b`          | Changed: per-glyph animation takes the ET5b path |

The MP4s are local, git-ignored outputs in
`benchmarks/results/editorial-typography-g1-review-2026-11-16/`.

## The owner's answers

These are recorded in the owner's words, lightly trimmed.

1. **T1, T2, T3:** "No, but not because still-shift is bad. because of it's style
   of text and animation is not satisfy me." All three treatments are rejected
   on style. No engine defect is named. Earlier, after looking at the proof
   frames, the owner said the Thai text lacks aesthetic quality but "that's not
   the point". That is a font-choice issue.
2. **T1 "Olive" (2.72:1 over the shadowed wall):** "yes, it's easy to read".
3. **Small text (T1 folio "No. 03 — Courtyard Edit"):** "I can read … without
   zoom but background make it hard to read." The size is acceptable, but the
   contrast against a busy background is not. ET3 measured the folio words at
   3.74 and 3.76:1 against the 4.5:1 target.
4. **Clip:** the owner supplied six vertical fashion reels (720×1280, 30 fps,
   9.5 to 33 s) and three phone screenshots as references and candidate pilot
   footage.
5. **Fonts:** "yes, download all popular free Thai font". The open-licence list
   is approved, with every popular free Thai family added.
6. **Success measure:** "yes". At least 3 of 8 candidates accepted per clip, on
   two clips.

## Decisions taken

| ID      | Decision                                                                                                                                                                                  |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-view  | T1, T2 and T3 rejected on text style and animation, not on engine defects. The aesthetic target is the owner's references (below), not editorial magazine minimalism.                     |
| ET3-D1  | Split by size. Large display titles may pass below 3:1: 2.72:1 was read easily. Small text keeps 4.5:1: 3.7:1 was hard to read. ET6b sets the size boundary and the display level.        |
| ET3-D2  | Keep the 6 px x-height floor at 360 px width. Size was not the problem; contrast and background were.                                                                                     |
| D-meas  | Confirmed: on two clips, at least 3 of 8 AI candidates per clip accepted by the owner.                                                                                                    |
| D-input | Fonts approved: the open-licence list plus every popular free Thai family, pinned as TTF/OTF with licence, source and SHA-256. Clip: the owner's reference reels, local only (see below). |

D-align was not raised. ET5a built the plan's recommendation (keep origin
centring, document it, warn on overflow), and the owner has not objected.

## Reference style analysis

The references are third-party social videos. This repository is public, so
no frames, file names or source URLs from them are committed. The style is
described in words only.

What the references share:

- **One large title lockup over the subject's torso.** It spans roughly 60–80%
  of the frame width, sits centred or at the upper third, and stays on screen
  across the footage. It is not a small label in a calm corner. The face is
  usually left clear.
- **Mixed type inside one title.** Script or italic display serif (for example
  "Dressed", "my", "Autumn Outfits") is paired with heavy bold caps, condensed
  serif, extended sans or a handwritten brush face. Size, colour and font change
  word by word, in a stacked or zig-zag arrangement.
- **Legibility from treatment, not placement.** Coloured or white fill with a
  contrasting outline, drop shadow, glow or slight extrusion, or a solid box
  behind a translated subtitle (Korean on black). Text sits directly on busy
  footage.
- **Colour drawn from the outfit or the mood.** Cranberry, gold, lavender,
  olive, pastel pink and sky blue, often several in one title.
- **Animation:**
  - The title builds word by word in the first 1–2 s: pop-in, typewriter with a
    cursor, or a staggered cascade.
  - It then holds while the footage cuts quickly between outfits.
  - Some titles change one word's colour on each cut.
  - Small decorations (sparkle stars) accompany the words.
  - Later sections add small labels (day names, colour names, colour swatches,
    height or size notes).
- **Depth:** in one reference the subject passes in front of the title (text
  behind the subject).
- **Language:** English titles with Korean or Japanese sub-labels. Thai
  equivalents are the owner's target.

The proof treatments were small, quiet and placed in empty areas. They sit at
the opposite end of this range, which explains the rejection better than any
measured defect.

## Engine capability against the references

This is a first mapping, done by reading the docs, not by rendering. ET7a must
confirm it with real candidates and count the iterations each gap costs.

| Reference technique                     | Current engine (per docs)                                                             | Status for ET7a        |
| --------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------- |
| Mixed fonts, sizes and colours per word | `spans` may reference another named style (with its own `fontAsset`)                  | Test                   |
| Outline around glyphs                   | Text animator `stroke` and `strokeWidth` (glyph outline). No static style field found | Test; possible gap     |
| Drop shadow, glow                       | Layer effects `light.drop-shadow` and `light.glow`                                    | Test                   |
| Box behind a subtitle                   | `textBox` and caption containers; highlight and box decorations                       | Test                   |
| Word-by-word build                      | `revealMode: "words"`, text animators per word                                        | Test                   |
| Hold across fast footage cuts           | Text layers persist; frame-level legibility from ET3                                  | Test                   |
| Colour change synced to cuts            | Needs cut times; footage analysis stays outside `packages/`                           | External (ET7a script) |
| Text behind the subject                 | Needs a subject matte; out of scope for ET7a                                          | Deferred (ET7b)        |
| Sparkle or sticker decorations          | Native shapes                                                                         | Test                   |
| Brush, script and Thai display faces    | Font pinning (TTF/OTF)                                                                | Download in ET7a       |

## Rights to the reference reels (decided: local only)

The owner supplied the reels as references and candidate pilot footage. They
appear to be downloads of other creators' public posts. Asked whether the pilot
may use them as local-only test footage, the owner answered "Yes, local only"
(2026-11-16). Under that decision:

- Use them for local style study and local test renders only.
- Keep them, and any renders or contact sheets made over them, git-ignored.
  Never commit, upload or publish them, or frames from them. The reels go in
  `benchmarks/results/editorial-titles-references/` and the pilot's outputs in
  `benchmarks/results/editorial-titles-et7a/`. `benchmarks/results/*` is
  ignored; `research/`, where the proof scripts live, is not.
- Commit only what identifies a render without showing it: the composition
  sources, render and clip SHA-256s, the checks' results and the owner's
  verdicts. Visual sheets can be committed only for owner-shot, licensed or
  synthetic footage.

Still open (D-auth): whether these local-only reels count as the "authorized
clips" in the success measure. If both pilot clips are reels, no visual
evidence of the pilot can be committed. The recommendation is that at least
one pilot clip be owner-shot, licensed or synthetic.
