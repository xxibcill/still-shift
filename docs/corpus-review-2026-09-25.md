# Phase 0 corpus selection review — 2026-09-25

## Current decision

The project owner has **retired all 43 images** from Phase 0 corpus consideration:
28 History Offstage illustrations and 15 commercial photographs. No images from
that candidate remain provisionally selected. The seven proposed S01E02 additions
are also retired. Source files and completed renders remain untouched as
historical evidence; none is a freeze candidate.

The owner confirmed that the original 43 images are cleared for **private local
evaluation only**. This does not grant production or public-use rights. The
corpus remains `incomplete`; no release gate has been approved.

## Verified candidate evidence

- The 43-image candidate contains 28 History Offstage S01E01 illustrated stills and
  15 photographic commercial storyboard stills.
- All 43 source paths exist, all recorded SHA-256 hashes match, and no two entries
  share a source hash.
- All seven required category tags occur, but the tags overlap. The set is
  concentrated in two visual styles and every expected shot duration is five
  seconds.
- The candidate was assembled after renderer work began. A later freeze cannot
  retroactively satisfy the original pre-tuning benchmark plan; release reporting
  must disclose this limitation.
- The 15 photographic entries are 15 logical shots from one synthetic commercial
  storyboard. The other PNGs in that source project are continuity references,
  alternate or retired shots, and previews; they do not supply another 15
  independent shots or broaden the project mix.

## Superseded expansion proposal

An ignored, private 50-entry draft is stored at
`benchmarks/results/corpus-expanded-proposal.json`. It retains the 43 images
cleared for private evaluation and adds seven S01E02 development visual picks:

| Draft ID         | Reason for inclusion                                    |
| ---------------- | ------------------------------------------------------- |
| `hos-e02-s01-01` | Tight opening arc tests crop sensitivity.               |
| `hos-e02-s03-01` | Overlapping cards test the narrow left margin.          |
| `hos-e02-s05-01` | Hand and account diagram test a depth boundary.         |
| `hos-e02-s07-03` | Three separate source-state cards test flat layouts.    |
| `hos-e02-s08-01` | Thin land-change paths test line stability.             |
| `hos-e02-s09-02` | Fading evidence paths test low-contrast detail.         |
| `hos-e02-s12-02` | Answer arc and copy-safe field test restrained framing. |

The draft passes the manifest schema. All 50 files exist, their hashes match,
and IDs and source hashes are unique. The seven additions have `unknown` rights
in the draft because the owner's clearance covered only the original 43. Their
five-second durations are provisional. S01E02's own visual review calls them
development picks, not production-approved assets.

This 50-image proposal is superseded by the decision to retire all 43 original
images and the seven additions. It remains as historical candidate evidence,
not as a freeze candidate. Do not treat the seven additions as rights-cleared.

## Remaining selection work

1. Define the intended Phase 0 image distribution, then select 30–50 new,
   representative stills from the real workflow, including difficult examples
   rather than only preset-friendly images. The active selection currently has
   zero images; the four approved preset-demo images are demo-only.
2. If Phase 0 now excludes illustrations, revise its stated input distribution,
   required categories, and editorial evidence before claiming a pass.
3. Confirm private evaluation rights for any newly selected files.
4. Set expected durations from actual editorial use and include 3–8-second
   cases in the evaluation.
5. Record the final reviewer, date, and evidence, then freeze the exact manifest.
6. Run the depth, preset, batch, and human ratings checks on that frozen set.
7. Assemble and review a 5–10-minute video representing the revised target;
   the existing 7.97-minute History Offstage assembly does not cover it.

## Human review workload

The retired 43-image candidate produced 129 clips because each image was rendered
through three presets. Those renders remain historical engineering evidence;
**none of the 129 needs release ratings**. A new 30–50-image set would produce
90–150 clips under the current protocol.

The current evaluation report requires a named human reviewer to complete all
seven rating fields for every clip before its usability and severe-artifact gates
can pass. The owner can review a curated cross-category sample, every warning
case, and the assembled explainer while another human reviewer completes the
full clip ratings. If the project instead adopts sample-based release ratings,
update the evaluation protocol, report logic, and roadmap explicitly before
claiming a Phase 0 pass; a small sample cannot establish the current severe-
artifact threshold reliably.
