# MS2 topic-to-family candidate coverage board

The first cohort contains ten selected causal questions across the three MS2
families. The [saved board](./mechanism-topic-family-coverage.json) freezes stable
IDs, exact base pack references, factual variants, causal relationships, required
views/capabilities, unresolved work and overlap before pilot production.

Validated coverage is **0 supported / 10 selected = 0%**. All three packs are
still candidates, every episode has unvalidated requirements, and MS3 production
has not started. Selection by the MS2 implementation owner does not establish
owner factual, visual, listening or pilot acceptance.

## Candidate routing

| ID  | Distinct question                                                   | Visible causal proof                                                       | Route                    |
| --- | ------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------ |
| E01 | Why does a tape hook move?                                          | Equal travel/thickness changes the active measuring contact face           | Existing pack/rig target |
| E02 | How can a loose hook slide without falling off?                     | Fixed rivet heads retain a slotted hook; slot ends bound travel            | New asset, existing rig  |
| E03 | Why does this tie tighten but resist pulling back?                  | Forward tooth crossing/reseating versus held reverse request               | Existing pack/rig target |
| E04 | Why does the modeled tie latch in steps?                            | Declared tooth pitch separates successive seated positions                 | Existing pack/rig target |
| E05 | Why can a releasable tie back out when its trigger is pressed?      | A physical trigger clears pawl engagement, permitting withdrawal           | New asset, existing rig  |
| E06 | How can reverse tension seat a pawl more firmly against a tie head? | Variant-specific load path shifts the pawl toward frame gripping and stops | New behavior             |
| E07 | Why does squeezing a peg handle open its jaws?                      | Arms rotate about a common pivot with handles/jaws on opposite sides       | Existing pack/rig target |
| E08 | Why does a peg close again after release?                           | Spring bias returns the arms until the selected contact stop               | Existing pack/rig target |
| E09 | What do opposing jaw notches do when a peg grips a line?            | Matched notch geometry forms a declared seat around the selected line      | New asset, existing rig  |
| E10 | How does pressing farther from the pivot change ideal input force?  | Explicit torque balance compares perpendicular moment arms at fixed load   | New behavior             |

The routing distribution is **5 existing pack/rig targets, 3 new assets with
existing rigs, and 2 behavior extensions**. A route is a candidate implementation
plan, never a support result. New asset work is required for **five episodes**:
E02/E05/E09 plus both behavior-extension episodes E06/E10. The two proposed
behavior types are load-dependent pawl seating and ideal lever moment balance.
No new asset or rig type has been admitted by this board.

## Distinctness and scene overlap

E01 shares the historical MS1/MS1N E01 topic. Its earlier artifacts and pending
human review remain separately identified. It counts once in this cohort; later
MS4C measurements must disclose reuse of this cohort.

E01/E02 both show a sliding hook, but measurement zero and rivet retention need
different constraint witnesses. E03/E04 share ratchet feed/reseat scenes: one
explains directionality, the other the declared seat interval. E04 is a geometric
inference from the authored tooth/rig contract, not a manufacturer adjustment
specification. E05 requires a different release design and E06 a different
load-responsive design; captions or stronger arrows cannot establish either.

E07/E08 share squeeze/release motion. E07 must show opposing displacement about
the pivot; E08 must show the spring and seated legs supplying restoring bias.
An easing curve establishes neither stiffness nor measured closing force. E09
introduces a shaped line contact; E10 needs a declared moment model rather than
whole-arm scaling. Every row records related episodes, shared scene patterns,
its counterfactual and what makes the explanation different. Exact duplicate
checks aid review; linguistic novelty alone cannot establish distinctness.

## Factual variants and unresolved work

Dimensions and materials remain illustrative. E01's causal basis comes from
[STANLEY's moving-hook explanation](https://support.stanleytools.com/hc/en-us/articles/360012682938-Why-does-the-hook-on-the-end-of-the-Stanley-tape-rule-move).
E02 targets the three-rivet/slotted-hook design described in
[US4930227A](https://patents.google.com/patent/US4930227A), which needs a separate
detailed asset rather than an unstated change to the current two-rivet pack.

E03/E04 retain the non-releasable outside-serrated variant identified by
[HellermannTyton's T50SOS data](https://www.hellermanntyton.com/products/cable-ties-outside-serrated/t50sos/118-00062).
E05 targets its separately identified
[inside-serrated RELK2R release-trigger design](https://www.hellermanntyton.com/products/cable-ties-releasable/relk2r/115-02202).
The generic ratchet's teaching-release state is a reuse hypothesis; the new
trigger geometry and clearance must prove that no behavior extension is needed.
The standard cable-tie family guard continues to reject release.

E06 froze the primary search excerpt for
[US3872547A](https://patents.google.com/patent/US3872547A/ca). The later
[primary admission record](./mechanism-shorts-ms2-e06-primary-admission-results.json)
retains an exact official22-page PDF and relevant rendered figure/description
pages for cable tie100. This supplements the unchanged frozen board. The separate
hinged-pawl/frame-stop asset, explicit load-response behavior, independent contact/
stop/native evidence and factual acceptance remain required. Existing scalar tooth
lift has no load-dependent seating model.

E07–E09 use only the conventional spring-clamp construction described in
[US2590881A](https://patents.google.com/patent/US2590881A/en), excluding that
patent's additional restraint mechanism. E09 needs a reviewed notched-jaw/line
asset and contact anchors; renaming the existing cloth prop is insufficient.
E10 draws its ideal torque relationship from
[OpenStax's lever explanation](https://openstax.org/books/college-physics-ap-courses/pages/9-5-simple-machines).
Applying it to a peg is an explicitly idealized inference requiring spring/contact
assumptions and an independent dimensional oracle. It does not establish measured
grip force or a real product's mechanical advantage.

## Frozen selection and support criteria

The selected IDs are E01–E10 in order, under `ms3-pilot-2026-10-12-v1`.
The saved selection SHA-256 binds selection/support criteria, selected rows and
all their referenced source claims. Row contents include exact base pack hashes,
variants, views, required capabilities, work, limitations and overlap.

Positive support requires a current verified immutable pack/asset and validated
requirements on the actual episode. Software checks and named capabilities do
not supply factual, readable continuous output or genuine speech/listening
acceptance. The version-1 board/auditor deliberately admits only the unsupported
candidate baseline. It rejects claimed supported rows and a silently verified
pack. A future positive-support admission contract must check current evidence
and review receipts; it must not turn scoped MS2 test success into acceptance.

Run the read-only audit from the repository root with the pinned toolchain:

```sh
node --import tsx scripts/mechanism/coverage-board.ts docs/mechanism-topic-family-coverage.json
```

It checks actual registry references/rigs, routes/work, IDs, duplicate questions
and answers, source/overlap references, frozen selection identity and existence
of the scoped evidence files. It reports proposed/selected/support counts,
routing, asset/behavior work and a null ratio for an empty selected denominator.
It does not inspect media or infer acceptance from an evidence filename.

MS3/MS4C must maintain this same board. Retain all proposed rows, disclose shared
episodes and changes to selection criteria or selected content, increment the
revision and record the previous selection hash before freezing a changed cohort.
Coverage and recurring effort must be measured against the declared cohort;
recolors, caption/camera substitutions and a synthetic engineering queue do not
increase the distinct-episode count.

[Slice50 evidence](./mechanism-shorts-ms2-coverage-results.json) retains the first
failed fixture test and corrected rerun. Complete MS2 pack admission, Thai cell
review, broader readability/speech/resource/full/final gates and the MS2 PR remain
open; this board completes the coverage-board creation task only.
