# MS3 original pilot production brief

2026-10-13. Frozen selection `ms3-pilot-2026-10-12-v1`; all ten questions remain unchanged.

Use the requested procedural 3D explanation style at 1080×1920 and 30 fps. Narration and evidence determine runtime, normally20–40 seconds. Supplied audio and its measured word/cue timing are the editorial master. Do not pad, slow or stretch speech to reach a duration or shot count.

E01/E03/E08 use existing whole private recordings, assigned by their actual claims. The seven other recordings in the customer’s first-ten folder describe different mechanisms and are excluded from this frozen pilot. The seven new scripts below are recording drafts, with no approval or invented audio timestamps. This work includes no synthesis or paid generation.

| Episode | Frozen question                                                                              | Runtime variant                            | Narration                                  |
| ------- | -------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| E01     | Why does a tape measure hook move?                                                           | `floating-hook`                            | Whole supplied recording EU-001            |
| E02     | How can a loose tape hook slide without falling off?                                         | `slotted-retention`                        | Matching audio/timing missing; draft below |
| E03     | Why does this cable tie tighten but resist pulling back?                                     | `outside-serrated-integral-pawl-cutaway`   | Whole supplied recording EU-002            |
| E04     | Why does the modeled tie latch in steps rather than at any position?                         | `outside-serrated-integral-pawl-cutaway`   | Matching audio/timing missing; draft below |
| E05     | Why can a releasable cable tie back out when its trigger is pressed?                         | `inside-serrated-extended-trigger-cutaway` | Matching audio/timing missing; draft below |
| E06     | How can reverse tension seat a pawl more firmly against a tie head?                          | `hinged-pawl-frame-stop`                   | Matching audio/timing missing; draft below |
| E07     | Why does squeezing a clothespeg handle open its jaws?                                        | `wood-arms-central-spring-cloth`           | Matching audio/timing missing; draft below |
| E08     | Why does a clothespeg close again after the handles are released?                            | `wood-arms-central-spring-cloth`           | Whole supplied recording EU-003            |
| E09     | What do the opposing jaw notches do when a clothespeg grips a line?                          | `notched-line`                             | Matching audio/timing missing; draft below |
| E10     | How does pressing farther from the pivot change the force needed in an idealized clothespeg? | `ideal-lever-press-points`                 | Matching audio/timing missing; draft below |

The runtime variant names above map to the frozen design IDs; they do not rename the board or count a new question. The private family-packet record contains current immutable pack/source hashes for all ten. Seven families are prepared without a cue/audio placeholder or runnable queue item.

## Supplied audio and intake

E01 uses the current EU-001 recording (19.5512 seconds), E03 uses EU-002 (21.5017 seconds), and E08 uses EU-003 (21.4088 seconds). The current E01 voice source is shorter than the normal range; it stays whole and unchanged. It does not replace the separate original696-frame E01 benchmark. Exact source/transcript pins and sample intervals stay in the private input manifest and pilot rows. No private transcript text or media is copied into this repository.

For each remaining question, supply the full audio path and word/cue timing path, identifying the episode and whether the spoken copy is fixed. Local import measures the real clock and pins the bytes before authoring cue windows. The existing private four-take test manifest is a fixed fixture, not a general ten-episode intake schema.

The portrait authoring uses the existing family, cue, camera and production APIs. Generated camera poses are revalidated with the scene’s fixed near/far planes before narrated cue compilation. Source intervals and original words stay intact; synthetic engineering onset markers are omitted from these candidates.

## Narration and shot drafts

Durations below are estimates from an English cadence bracket of2.8–3.2 words per second. They are planning assumptions, not measured takes or locked timing. Each beat has one principal action and camera intention. Final timing and caption segmentation follow the supplied recording.

### E02 — How can a loose tape hook slide without falling off?

Status: new recording draft, 73 words, estimated22.81–26.07 seconds. Actual narration/timings are missing.

| Beat | Exact draft spoken line                                                                                              | Visible evidence and camera                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| B1   | The tape hook can slide, so what keeps it attached? Look underneath the rivet heads.                                 | Reveal rivet head and elongated slot; hold a top/side cutaway.                    |
| B2   | Each rivet passes through a long slot in the hook. Its wider head overlaps the edges, keeping the hook on the blade. | Show the cap overlapping both slot edges; hold the frame.                         |
| B3   | The narrow shaft has room to move along the slot, but only until it reaches an end.                                  | Slide the hook between stops; hold the rivet reference.                           |
| B4   | The slots allow the travel. The heads provide the retention. Those are two different jobs in the same connection.    | Compare head retention with permitted longitudinal travel; return to recognition. |

**Copy-ready full script**

```text
The tape hook can slide, so what keeps it attached? Look underneath the rivet heads. Each rivet passes through a long slot in the hook. Its wider head overlaps the edges, keeping the hook on the blade. The narrow shaft has room to move along the slot, but only until it reaches an end. The slots allow the travel. The heads provide the retention. Those are two different jobs in the same connection.
```

Sources and model basis: [US4930227A](https://patents.google.com/patent/US4930227A/en).

### E04 — Why does the modeled tie latch in steps rather than at any position?

Status: new recording draft, 73 words, estimated22.81–26.07 seconds. Actual narration/timings are missing.

| Beat | Exact draft spoken line                                                                                                                | Visible evidence and camera                                                                      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| B1   | Why does this modeled tie settle in steps? Follow the row of teeth past the flexible catch.                                            | Show adjacent teeth and the catch; hold a macro.                                                 |
| B2   | A tooth pushes the catch aside. After it passes, the catch returns into the next gap.                                                  | Feed one tooth through and settle; hold the catch reference.                                     |
| B3   | The spacing between neighboring teeth sets the distance between those seated positions. Change that spacing, and the step changes too. | Mark successive seats, then compare two pitches at fixed world scale; cut between aligned views. |
| B4   | The model is repeating the same tooth-and-gap pattern. It is not choosing a new resting place at every possible position.              | Hold neighboring seated positions and the interval witness; return to recognition.               |

**Copy-ready full script**

```text
Why does this modeled tie settle in steps? Follow the row of teeth past the flexible catch. A tooth pushes the catch aside. After it passes, the catch returns into the next gap. The spacing between neighboring teeth sets the distance between those seated positions. Change that spacing, and the step changes too. The model is repeating the same tooth-and-gap pattern. It is not choosing a new resting place at every possible position.
```

Sources and model basis: [mechanism-topic-family-coverage.json](mechanism-topic-family-coverage.json), [cable-tie-pack.ts](../packages/animation-engine/src/mechanism/cable-tie-pack.ts).

### E05 — Why can a releasable cable tie back out when its trigger is pressed?

Status: new recording draft, 74 words, estimated23.12–26.43 seconds. Actual narration/timings are missing.

| Beat | Exact draft spoken line                                                                                                                     | Visible evidence and camera                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| B1   | This tie has a release trigger. Press it, and the strap can come back out.                                                                  | Show the extended trigger and engaged catch; hold a cutaway.                        |
| B2   | The trigger is part of the flexible catch. Pressing it moves that catch away from the teeth instead of forcing a tooth backward through it. | Press the trigger with the catch/trigger geometry moving together; hold the camera. |
| B3   | With the catch clear, there is a path for the strap to withdraw.                                                                            | Withdraw the released strap through the cleared path; hold a side view.             |
| B4   | Let the trigger return, and the catch can meet the teeth again. Release works by clearing the obstacle, then restoring it.                  | Restore engagement and hold the seated state; return to recognition.                |

**Copy-ready full script**

```text
This tie has a release trigger. Press it, and the strap can come back out. The trigger is part of the flexible catch. Pressing it moves that catch away from the teeth instead of forcing a tooth backward through it. With the catch clear, there is a path for the strap to withdraw. Let the trigger return, and the catch can meet the teeth again. Release works by clearing the obstacle, then restoring it.
```

Sources and model basis: [RELK2R release closure](https://www.hellermanntyton.com/products/cable-ties-releasable/relk2r/115-02202).

### E06 — How can reverse tension seat a pawl more firmly against a tie head?

Status: new recording draft, 73 words, estimated22.81–26.07 seconds. Actual narration/timings are missing.

| Beat | Exact draft spoken line                                                                                                        | Visible evidence and camera                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| B1   | Can pulling backward make a tie seat more firmly? In this load-responsive design, the pawl can shift a little inside the head. | Show the pawl inside the frame and lower rear hinge; hold the cutaway.                  |
| B2   | The strap already meets its first tooth. Further loading shifts and turns the pawl while the thin hinge deforms.               | Apply the declared qualitative load and show hinge/pawl shifting; hold the reference.   |
| B3   | A second tooth moves into contact, and the rounded stop reaches the frame.                                                     | Show second-tooth and frame-stop contact together; cut to the stop macro.               |
| B4   | That stop bounds the movement. The shape turns reverse tension into additional contact at the teeth and the frame.             | Increase the model control beyond the stop with unchanged poses; hold the stop witness. |

**Copy-ready full script**

```text
Can pulling backward make a tie seat more firmly? In this load-responsive design, the pawl can shift a little inside the head. The strap already meets its first tooth. Further loading shifts and turns the pawl while the thin hinge deforms. A second tooth moves into contact, and the rounded stop reaches the frame. That stop bounds the movement. The shape turns reverse tension into additional contact at the teeth and the frame.
```

Sources and model basis: [US3872547A official PDF](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/3872547), [mechanism-shorts-ms3-load-alignment-results.json](mechanism-shorts-ms3-load-alignment-results.json).

### E07 — Why does squeezing a clothespeg handle open its jaws?

Status: new recording draft, 81 words, estimated25.31–28.93 seconds. Actual narration/timings are missing.

| Beat | Exact draft spoken line                                                                                                                      | Visible evidence and camera                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| B1   | Why do the jaws open when you squeeze these handles? Watch the middle of the peg.                                                            | Show both handles, jaws and common pivot; hold a side view.            |
| B2   | Each wooden arm turns around that region. Its handle is on one side; its jaw is on the other.                                                | Identify ends on opposite sides; hold the pivot reference.             |
| B3   | Bring the handles together, and the jaw ends move apart. The two ends of each arm move in opposite directions around the same turning point. | Squeeze and open with attached displacement witnesses; hold the frame. |
| B4   | The handles and jaws share that rotation around the middle. Bringing the handles together changes the spacing between the jaw ends.          | Return to the starting pose around the same pivot; hold the side view. |

**Copy-ready full script**

```text
Why do the jaws open when you squeeze these handles? Watch the middle of the peg. Each wooden arm turns around that region. Its handle is on one side; its jaw is on the other. Bring the handles together, and the jaw ends move apart. The two ends of each arm move in opposite directions around the same turning point. The handles and jaws share that rotation around the middle. Bringing the handles together changes the spacing between the jaw ends.
```

Sources and model basis: [US2590881A](https://patents.google.com/patent/US2590881A/en).

### E09 — What do the opposing jaw notches do when a clothespeg grips a line?

Status: new recording draft, 80 words, estimated25.0–28.57 seconds. Actual narration/timings are missing.

| Beat | Exact draft spoken line                                                                                                                                                                        | Visible evidence and camera                                                     |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| B1   | What are these matching recesses in the jaws for? Put a round line between them.                                                                                                               | Place the round line at the opposing notches; hold a front/side cutaway.        |
| B2   | As the jaws close, the two notches form a shaped seat around the line.                                                                                                                         | Close into the declared line stop; hold the seat.                               |
| B3   | The spring keeps the arms biased toward closure, while the recesses make room for the round shape.                                                                                             | Show spring and notch roles; cut to the spring detail.                          |
| B4   | Those are separate roles: the spring supplies the closing bias, and the notches define where the line sits. The opening motion lets the line enter; the shaped seat is where the jaws meet it. | Return to the line seat with no friction/strength claim; hold the contact view. |

**Copy-ready full script**

```text
What are these matching recesses in the jaws for? Put a round line between them. As the jaws close, the two notches form a shaped seat around the line. The spring keeps the arms biased toward closure, while the recesses make room for the round shape. Those are separate roles: the spring supplies the closing bias, and the notches define where the line sits. The opening motion lets the line enter; the shaped seat is where the jaws meet it.
```

Sources and model basis: [US2590881A](https://patents.google.com/patent/US2590881A/en), [mechanism-shorts-ms3-line-results.json](mechanism-shorts-ms3-line-results.json).

### E10 — How does pressing farther from the pivot change the force needed in an idealized clothespeg?

Status: new recording draft, 73 words, estimated22.81–26.07 seconds. Actual narration/timings are missing.

| Beat | Exact draft spoken line                                                                                                                              | Visible evidence and camera                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| B1   | Why can pressing farther from the pivot take less force? Compare the two push points while keeping the resisting twist the same.                     | Show near/far pads on one unchanged arm and shared pivot; hold a side view.                   |
| B2   | In this ideal balance, force times its perpendicular distance from the pivot must match that twist.                                                  | Show push lines and perpendicular moment arms with fixed declared resistance; hold a diagram. |
| B3   | A push line farther from the pivot needs less force for the same balance.                                                                            | Compare computed forces from original posed anchors; cut between aligned views.               |
| B4   | Real pegs also have changing spring and contact geometry. This comparison isolates the leverage: same resistance, different distance from the pivot. | Hold the idealization and comparison result; return to recognition.                           |

**Copy-ready full script**

```text
Why can pressing farther from the pivot take less force? Compare the two push points while keeping the resisting twist the same. In this ideal balance, force times its perpendicular distance from the pivot must match that twist. A push line farther from the pivot needs less force for the same balance. Real pegs also have changing spring and contact geometry. This comparison isolates the leverage: same resistance, different distance from the pivot.
```

Sources and model basis: [OpenStax ideal levers](https://openstax.org/books/college-physics-ap-courses/pages/9-5-simple-machines), [mechanism-shorts-ms3-lever-results.json](mechanism-shorts-ms3-lever-results.json).

## Evidence and review contract

For every original episode retain the frozen question/answer, selected factual variant, immutable family/source, supplied audio/transcript pins, semantic beat coverage and final artifact identity. Extract phone overviews, shot entry/mid/exit, contact/cut images, caption/anchor crops and full decode/audio evidence through the production workflow. A successful compile or encode establishes its named technical scope; whole factual/design/visual/continuous/listening acceptance stays separate.

The E02 rivet/slot, E05 trigger, E06 pawl/hinge/stop, E09 notch/line and E10 ideal lever extensions have source-bound engineering records. The episode must visibly establish its own causal question. E04 spacing is an analytic teaching model; E06 compliance is illustrative; E10 fixes declared resistance. No measured manufacturer force, friction, stiffness or holding-strength claim is introduced.

Three available inputs form a runnable subset, not a replacement denominator. Report subset execution separately from the original ten-episode target. Keep first-pass failures, missing-input rows, unresolved QA and unavailable token measurements visible. Pilot acceptance remains0/10 until the original gates are established.
