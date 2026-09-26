# Motion principles audit

> **Superseded (2026-09-26):** The stillness and frozen-hold guidance below is superseded by the [owner’s continuous storytelling decision](story-motion-continuous-storytelling-plan.md). Holds now preserve meaning while camera, currents and responses keep the picture moving. Other design and semantic invariants remain binding.

Date: 2026-09-26. Basis: the user's supplied seven motion-graphics principles.

This is the **v008 baseline audit**. The subsequent [quality implementation and seven-principle recheck](motion-quality-implementation.md) resolves the measured readability/hold findings, adds a narrated resource passage and advisory authoring checks, and records the remaining audiovisual acceptance limits.

**Verdict: the current Story Motion library mostly follows the principles.** Its strongest qualities are purposeful movement, distinct easing, connected entrances, coherent illustration, and real stillness. Complete-video rhythm and the combined sound/visual experience remain unproven by the current library studies and local episode proof.

This is an assessment, with no animation changes. The rubric follows the supplied motion principles rather than a general website accessibility/performance audit.

## Scope and evidence

- Read the active design context, scene authoring, compiler, easing, validation, brush geometry, proof assembly, and relevant roadmap.
- Visually inspected all seven v008 temporal sheets, the eight 390 px style frames, and the v007 narrated proof's nine-frame sheet.
- Computed final holds from compiled tracks for the current seven fixtures. These are exact settled intervals, not estimates of when movement becomes imperceptible.
- Ran 36 tests across story scenes, line motion, proof continuity, brush paths, cinematic scenes, focus handoff, and parallax paths; all passed under Node 22.23.1.
- Checked media streams: the Relationship Build study is an eight-second silent video; the local proof has 646 video frames at 24 fps and an audio stream.
- Read existing v008 verification reports: 98 preview/export comparisons, 14 backward seeks, and automated playback of seven studies. Those browser checks were not rerun for this assessment.

Visual judgment here uses sampled frames and code/timing inspection. This audit does not claim a continuous audiovisual watch, a listening assessment, or an audience study. Passing tests establishes technical behavior, not emotional impact.

## Principle-by-principle assessment

Scores describe observed implementation coverage: 0 absent, 1 early/limited, 2 partial, 3 strong with remaining checks, 4 consistently demonstrated in the inspected scope. They are editorial judgments, not measured viewer ratings. No overall product score is inferred.

| Principle                       | Coverage                         | Evidence and limit                                                                                                                                                                                                                                                         |
| ------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Timing and spacing              | 3/4 — strong                     | Relationship strokes use cubic ease-out; arrivals use quintic ease-out; pressure uses quintic ease-in-out; fractures use cubic ease-in. Curves are bounded and deterministic. The late small regroup in Relationship Build deserves another editorial pass.                |
| Rhythm and contrast             | 3/4 — strong within studies      | Access establishes routes, pauses, then narrows. Crisis holds its date before short fractures and a decisive context cut. Exact final holds range from 1.08 to 5 seconds. Whole-episode energy and strongest-moment contrast remain unreviewed.                            |
| Visual hierarchy                | 3/4 — mostly strong              | Stable anchors, sequential dependencies, semantic red accents, and separate evidence roles produce understandable held frames. At 390 px width, essential secondary qualifications are much less comfortable to read than the titles.                                      |
| Anticipation and follow-through | 3/4 — restrained and appropriate | A line prepares a destination's arrival; the destination finishes after its line. Access establishes the open state before restriction. Physical compression and elastic reactions are absent, which is appropriate for this editorial style. More bounce is not required. |
| Choreography and continuity     | 3/4 — strong locally             | Bound connectors stay attached during regrouping. The ST-013/014 proof preserves household position, scale, and ground across its cut. Continuity across the remaining episode passages is pending.                                                                        |
| Consistent personality          | 4/4 within inspected library     | Shared bone/ink/field/grain/red/crisis palette, pinned fonts, recurring illustration forms, fixed brush texture, and controlled stops. The studies avoid decorative oscillation and conflicting transition styles.                                                         |
| Sound and polish                | 1/4 — partial evidence           | The proof integrates existing narration and authored cue frames. The assembly script adds no separate event sound design, and this audit did not listen to the result. An audio stream and successful playback do not establish sound/visual reinforcement.                |

Sources: [easing implementation](../packages/renderer-core/src/motion-easing.ts), [authored scenes](../scripts/story-motion/scenes.ts), [proof continuity](../scripts/story-motion/proof.ts), [proof assembly](../scripts/render-story-proof.ts), [shared art](../scripts/story-motion/art.ts), and [brush geometry](../packages/renderer-core/src/brush-path.ts).

The strongest concrete choreography example is Relationship Build: its first line draws during frames 12–34; Land enters and settles during frames 24–42. More than 80% of the stroke is revealed before the destination begins appearing, and the destination finishes eight frames after the line. The next branches follow the composition in the same causal order with different timings. This directly implements the supplied principle that one movement should lead into the next.

## Findings and priorities

No P0 or P1 defect was established within this review. There are two P2 refinement findings and two P2 coverage gaps. Their priority is relative to motion quality, not a WCAG conformance claim.

### P2 — Evidence qualifications are too small for comfortable inline phone reading

**Location:** `scripts/story-motion/scenes.ts:288`, `scripts/story-motion/scenes.ts:293`, and `scripts/story-motion/scenes.ts:296`.

The Evidence Boundary labels “Items,” “Amounts,” “Not a recovered pantry,” and its final qualification use 42 px type on a 1920 px canvas. At a 390 px displayed width, that becomes approximately 8.53 px; 48 px labels become 9.75 px. The inspected phone sheet retains the main three-way distinction, but these necessary qualifications are markedly harder to read than the headlines. Existing documentation also acknowledges that smaller qualifiers depend on a larger or landscape view.

**Impact:** a viewer can absorb the main illustration while missing the limits of the claim. This weakens the supplied test that the important still frame must be immediately understandable and readable.

**Recommendation:** use `/typeset` and `/arrange` to promote essential qualifications, shorten lines without changing meaning, and allocate more space or separate beats. Judge the result at the intended displayed size; retaining a 42 px source minimum alone is insufficient. Preserve the current evidence distinctions.

### P2 — Two studies give the final resolved composition little fully settled time

**Location:** `scripts/story-motion/scenes.ts:218`, `scripts/story-motion/scenes.ts:235`, and `scripts/story-motion/scenes.ts:582`; the common eight-second length is in `scripts/create-story-demos.ts:47`.

Relationship Build's late regroup/emphasis ends at frame 166 of 192, leaving 1.08 seconds fully settled. Motif Resolve's outgoing arrow finishes at frame 154, leaving 1.58 seconds. Earlier labels are visible before these endpoints, so these numbers are not the viewer's entire reading time and do not prove an unreadable scene. They identify where the final synthesis gets the least quiet space.

**Impact:** the concluding relationship can feel less emphasized than the motion that assembled it, particularly when these studies become adjacent edited shots.

**Recommendation:** use `/animate` to test removing or advancing Relationship Build's small late regroup and finishing the outgoing arrow earlier. Compare a roughly 2–3-second final hold as an experiment, then conform to narration. Do not impose that duration on every shot or alter exact episode boundaries arbitrarily.

| Study              | Last changed frame | Fully settled tail at 24 fps |
| ------------------ | -----------------: | ---------------------------: |
| Unequal Margins    |                120 |                       3.00 s |
| Access Constraint  |                114 |                       3.25 s |
| Relationship Build |                166 |                       1.08 s |
| Evidence Boundary  |                108 |                       3.50 s |
| Dated System Break |                120 |                       3.00 s |
| Category Swap      |                 72 |                       5.00 s |
| Motif Resolve      |                154 |                       1.58 s |

Calculation: `(192 - lastChangedFrame) / 24`, including the display interval of the first fully settled frame. A longer hold is not automatically better: Category Swap deliberately uses an exact cut and a quiet result.

### P2 coverage gap — Full-sequence rhythm and sound remain unverified

**Location:** `docs/s01e01-story-motion-roadmap.md:97`, `docs/s01e01-story-motion-roadmap.md:128`, and `scripts/render-story-proof.ts:72`.

The studies share an eight-second container, but their internal timing differs. They are library demonstrations, not evidence that a finished episode has a well-shaped energy curve. The 26.917-second ST-013/014 proof is useful local continuity evidence; the other complete narrated passages and integrated episode review remain pending in the roadmap. The proof assembly concatenates two clips and trims/muxes the existing narration.

**Impact:** excellent individual movements can still form a monotonous edit or compete with spoken explanation. The current evidence cannot settle that question.

**Recommendation:** use `/critique` on a representative assembled narrated passage, first visually and then with sound, before extending the treatment throughout the episode. Identify one strongest moment, the preparation before it, and the hold afterward. Add selective sound accents only where they improve that moment; absence of a whoosh is not a defect.

### P2 coverage gap — Good motion is authored into these fixtures, not guaranteed for every input

**Location:** `packages/scene-contract/src/story-validation.ts:20` and `packages/scene-contract/src/story-validation.ts:139`.

Read-only experiments confirmed that validation accepts a Relationship Build with all branches starting together and an Access Constraint whose narrowing ends on the final frame. Existing checks correctly protect semantic order, identities, clearances, and timeline bounds, but do not guarantee a useful reading hold or focal hierarchy for arbitrary scenes.

**Impact:** the eventual automatic authoring workflow could produce technically valid scenes that violate the supplied principles even though the current fixtures are carefully staged.

**Recommendation:** use `/harden` for advisory authoring checks that flag a very short settled tail and competing focal events. Allow intentional exceptions: simultaneous supporting motion and cuts can be correct. Keep editorial review responsible for deciding what should lead.

## What to preserve

- Keep the line → destination → settle order and action-specific easing.
- Preserve real stillness; the current Story Motion studies do not animate every object continuously.
- Keep simple category cuts and the hard historical context reset. An elaborate transition could obscure their meaning.
- Preserve attached connectors, fixed deposited brush texture, opaque explanatory labels during art de-emphasis, and exact narration boundaries.
- Maintain the shared illustration language while varying scene composition. The sampled library is visually coherent and does not show a mixture of unrelated motion tricks.

## Broader project qualification

The positive verdict applies most directly to Story Motion v008 and the local v007 proof. Cinematic Parallax also supports deliberate acceleration, controlled camera motion, and focus transfer; its camera sampler includes a velocity plateau for lateral tracking and different deceleration for dramatic intensity. The older illustrated recipes share more default smoothstep interpolation and scaled preset timing. Neither subsystem by itself chooses a whole video's focal path or rhythm.

This is consistent with the [product positioning](product-positioning.md): Still Shift currently supplies components toward automatic faceless-video production, while finished-video editorial quality remains a separate requirement. The latest Story Motion quality should not be assumed for every legacy preset or automatically assembled future input.

## Suggested execution order

1. `/typeset` and `/arrange` for essential phone-size qualifications.
2. `/animate` for the two short final holds and the purpose of the late regroup.
3. `/critique` for a complete narrated passage and its quiet/strong moments.
4. `/harden` for advisory motion-authoring checks as automatic authoring expands.
5. `/polish` after timing and focal hierarchy are settled; then rerun `/audit` against this same rubric.

These can be addressed individually or together. This audit implements none of those changes.
