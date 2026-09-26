# Story Motion direction: make the motion carry the argument

Date: 2026-09-26. **Status: first direction ("buffer press") ready for owner review.** It is a separate fixture set; the reviewed v2 prototype, the default seven-study catalog and both narrated passages are unchanged.

This builds on the [continuous storytelling plan](story-motion-continuous-storytelling-plan.md). That plan made every frame move. This direction is about whether the movement _says_ the idea.

## Critique of the reviewed v013 prototype

The v013 Unequal Margins prototype passes G1–G6, but with labels covered and sound off a viewer cannot tell which household is in trouble.

1. **The metric changed the meaning.** G4 needed a pixel-energy peak in the strain beat, and the largest change available was fading household A. The household with _more_ room ends up ghosted, which says the opposite of the story.
2. **The idea is the lowest-contrast element.** The two identical houses are the biggest, darkest shapes. The "room" is two thin edge brackets and a 0.55-opacity green smear on green-grey ground, so the labels do the storytelling.
3. **The camera creeps.** A 3% zoom and 80 px drift over 8 s stops frozen frames but reads as instability, not intent.
4. **Every shot shares one layout.** Title top-left, small subject left of centre, hill at the bottom, qualifier bottom-left. Across the resource passage the shots are nearly interchangeable, so the cuts feel like jump cuts.
5. **One motion vocabulary.** Almost everything fades, wipes or draws in place. Nothing anticipates, has weight or leaves.
6. **Details read as bugs.** The 7 px strain dashes look like dirt, two horizon lines overlap, and a letter wipe shows "A qualitative com" as if truncated.

## Direction principles

- **Motion enacts the claim physically, at hero scale.** If the idea is "same strain, different outcome," show one identical force and two different results.
- **Mute test.** With labels hidden and no sound, the idea must still read. Labels name what the motion already showed.
- **De-emphasise by staging, not by fading.** Opacity fades on a subject imply loss.
- **The peak must be the story's turn.** A pixel-energy peak is only valid if it lands on the declared hero event.
- **Holds are held in meaning.** After the peak, keep the argument alive with the same force acting again, not with drift.

## Buffer press: Unequal Margins

**Story move:** one season presses two identical households equally. A stands on a deep margin that compresses and holds. B's thin margin runs out, so the house itself takes the rest.

Both houses share one ground slab: same size, same baseline, same roof line, which also satisfies the recipe's equal-households validation. The only difference is the soft margin cut into the ground beneath each house: deep under A, a sliver under B. A single crisis-coloured strain band sweeps across both roofs and presses them down **in lockstep**. House, margin and band poses are sampled from one shared `travel(frame)` curve, so contact stays exact.

| Frames          | Layer             | Event                                                                                                  | Meaning                                       |
| --------------- | ----------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| 0–20            | action            | Shared ground wipes in; surface draws, open only where a margin is cut                                 | Same ground under both households             |
| 4–30            | action            | A's four margin layers draw bottom-up; B's single thin layer draws                                     | Different room, established before any strain |
| 14–38           | action            | Both houses set down together                                                                          | Comparable households                         |
| 28–48           | action            | One strain band sweeps left to right across both roofs (two halves, continuous velocity at the seam)   | The same season reaches both                  |
| 50–104          | action (**peak**) | The band presses 77 px (`in-out-quint`); both houses descend in lockstep                               | Same strain, same moment                      |
| 50–76           | response          | B's margin is crushed flat and runs out at frame 76, the encoded energy peak                           | B has no room left                            |
| 76–104          | response          | B's house takes the rest: scaleY → 0.84, tilt → −4.5°. A's margin compresses to 55% and holds          | The strain lands on the household itself      |
| 90–108 / 98–116 | response          | "More room" and "Less room" attach beside each margin                                                  | Name what was shown                           |
| 116–140         | current/response  | Strain pulse (10 px): A's margin absorbs it, B's house takes it                                        | The strain persists                           |
| 140–164         | action            | Qualifier word reveal                                                                                  | Qualitative, not measured                     |
| 167–191         | current/response  | Second pulse                                                                                           | Still pressing                                |
| 0–191           | carrier           | Camera leans in and down with the weight: `(960,540,1)` → `(976,564,1.032)` at 104 → `(986,570,1.045)` | Weight bears down                             |

Type roles, sizes and wording are unchanged: title 112, subheading 64 (now word reveal), labels 56, qualifier 52 (now word reveal). Palette, illustration family and the non-boiling brush are unchanged. No flows are used, so R9 is untouched. Titles and qualifier are screen-locked.

### Measurements

Encoded MP4 (full-resolution method) and compiled-scene analyzer. Rendered with `--require-continuous-motion`.

| Gate                        | Target | v013 prototype |              Buffer press |
| --------------------------- | -----: | -------------: | ------------------------: |
| G1 comparisons below motion |    ≤ 3 |              0 |                     **0** |
| G3 semantic gap             |   ≤ 36 |             44 |                    **28** |
| G4 peak / median            |   ≥ 3× |         2.984× | **3.14×** (peak frame 76) |
| G5 essential-text velocity  |   ≤ 12 |      18.5 px/s |              **7.6 px/s** |
| Pan / zoom per frame        |     R7 | 0.62 / 0.00023 |            0.48 / 0.00047 |

Every tighter target is met, not just the hard limits. The peak is not tuned: frame 76 is where B's margin runs out, and nothing is faded to raise it. The MP4 is byte-identical under the pinned Node 22.23.1 and under Node 24.

**What needs the owner's eye**

- Does A reading as "sinking into its margin" come across as absorbing, not as subsidence?
- Is B's squash and tilt the right strength (0.84 / −4.5°) under the R6 restraint rule?
- Should the camera lean harder at the peak?
- At 390 px, labels and qualifier remain secondary and small. The comparison still reads from the motion alone.

## Next directions (not started)

Apply the same test to the other studies before building them:

- **Access Constraint:** grain tokens flow on both routes; one pinches and its tokens queue in front of the pinch while the store stays full.
- **Category Swap:** contents drain and refill across the exact frame-72 swap while the connector's flow never stops ("still connected").
- **Dated System Break:** build tension before the frame-120 cut; routes snap with the one permitted jolt; "Unknown" draws as a hesitant dashed outline.
- **Evidence Boundary:** supported items ink solid, unknowns get a slow dashed outline, the composite house visibly assembles from parts.
- **Passages:** carry the recurring store and house across cuts with match moves or push-throughs, and vary shot size.

Proposed gate changes, for discussion:

- Replace G4's whole-frame pixel peak with a **declared hero** check: salience of the named hero node at the peak.
- Add a human **mute test** (labels hidden, no sound, 390 px) to each review.
- Let current tokens exceed R9's 7 px when the semantic object needs to be recognisable.

## Reproduce

Always choose a new output directory.

```sh
pnpm story:prepare --direction buffer-press
pnpm story:render --fixtures-dir benchmarks/fixtures/story-motion-buffer-press --output-dir <new-directory> --require-continuous-motion
```

The source is [unequal-margins-v3.ts](../scripts/story-motion/unequal-margins-v3.ts). `--direction` writes to `benchmarks/fixtures/story-motion-<direction>` and leaves `--prototype` (v2) and the default catalog untouched.
