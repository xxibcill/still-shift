# Motion quality implementation

Date: 2026-09-26. The user rejected v011 as harder to read because of overall crowding and hierarchy. The v012 correction restored distinct text roles and illustration-led spacing. The current v013 Evidence Boundary study presents supported categories, unknown details and a composite household in separate held stages. Creative acceptance, continuous audiovisual acceptance and external episode integration remain open.

## Review artifacts

- [Before/after comparison: Evidence, Relationship and Motif](../benchmarks/results/story-motion-v012/comparison.html)
- [All seven revised motion studies](../benchmarks/results/story-motion-v012/index.html)
- [Refreshed 646-frame ST-013/014 proof](../benchmarks/results/story-motion-s01e01-proof-v010/index.html)
- [New 1507-frame ST-006–008 proof](../benchmarks/results/story-motion-s01e01-resources-v003/index.html) and [beat sheet](s01e01-resource-passage-beats.md)
- [Prior v011 independent frame review (superseded for readability)](../benchmarks/results/story-motion-v011/independent-review.md)
- [Library quality measurements](../benchmarks/results/story-motion-v012/quality-report.json)

Generated media lives in ignored `benchmarks/results`; source fixtures, scene authorship, report generation and tests are versioned. Rerender into a new directory to reproduce the deliverables.

## Changes and evidence

The rejected pass promoted almost every label and qualification to 80 px, flattening the hierarchy and crowding the illustration space. The corrected shared scale uses **56 px labels, 52 px qualifications, 64 px subheadings and 72 px section headings**. Main titles retain their established sizes. Labels have more separation from their illustrations. Evidence Boundary restores the larger side-by-side resource illustrations, separated columns, and a contained two-line composite qualification.

Evidence Boundary now uses a separate stage for each claim. Its primary copy is larger without crowding the images, while the boundary and qualifier stay visible throughout. Three rendered stages were inspected at **350 px video width**. The analyzer measures its smallest visible essential type at **14.22 px**, above the 14 px advisory target, and reports no competing focus. This establishes a readable sample at that width; it does not replace continuous viewing or creative acceptance.

Relationship Build no longer performs a small late positional regroup. Its emphasis restores sooner. Motif Resolve settles its supports and completes the outgoing arrow earlier. Resource and access spacing was recomposed after independent review found a collision.

| Study              | Previous final hold | Revised final hold |
| ------------------ | ------------------: | -----------------: |
| Unequal Margins    |              3.00 s |             3.00 s |
| Access Constraint  |              3.25 s |             3.25 s |
| Relationship Build |              1.08 s |         **2.25 s** |
| Evidence Boundary  |              3.50 s |         **2.33 s** |
| Dated System Break |              3.00 s |             3.00 s |
| Category Swap      |              5.00 s |             5.00 s |
| Motif Resolve      |              1.58 s |         **2.33 s** |

These are settled tails, not total reading time. They include secondary emphasis changes; an exact last-frame cut has one frame of settled time. All seven retain fixed brush texture, bounded easing, attached connections, exact category/context cuts and semantic qualifiers.

The new resource passage uses four compositions: dependencies beyond grain, a particular household/year, a food bridge with limits, then unequal household margins. Its shot slices remain 408, 360 and 739 frames. The strongest comparison settles before the spoken conclusion, leaving 7.21 seconds for its qualification. Grain never drains and no universal deadline or quantity is drawn. A household/year connector was rerouted after an independent reviewer found that it crossed a label.

## Authoring feedback

[story-quality.ts](../packages/renderer-core/src/story-quality.ts) provides deterministic advisory measurements shared by the lab and render scripts. It checks final settled time, essential text at a chosen display width, and simultaneous authored focal groups. Related strokes, arrivals and labels count as one group; supporting emphasis does not count as another focal subject. No-op motion, zero-opacity content and collapsed transforms are ignored.

Each story fixture marks its essential text IDs in optional scene review metadata. The lab and render scripts read those roles from the compiled scene, and a downloaded scene retains them. A scene without marked roles receives no small-essential-text warnings; callers may also supply an explicit policy. Policy can select focal groups, width/size/hold targets, and explained exceptions for particular diagnostic intervals. Defaults are 350 px, 14 px essential type and a 2-second hold. Relationship/evidence recipes infer separate focal groups; the other recipes default to one coherent authored idea. Authors can supply more specific groups. This is a review aid, not a collision detector, optical text-bound measurement, visibility/occlusion solver or an accessibility certification.

The lab displays warnings beside timing controls and can seek to their frames. A category cut at frame 191 produces a 0.04-second warning while the scene remains valid and downloadable. Reports do not alter the scene contract, rendering, export result JSON or exit codes. Evidence Boundary now provides explicit focal groups for its three stages. Other studies retain their own text-size warnings at the narrow default width. The lab explicitly says the measurements do not assess hierarchy or crowding. A clean report is not a design acceptance criterion.

## Verification and limits

- The initial pass ran 31 targeted unit checks across story semantics, prepared scenes/fonts, choreography, proof continuity and the new diagnostics. Diagnostics cover 24/30 fps, simultaneous branches, child focal groups under moving parents, exceptions, hidden/collapsed content and transformed type.
- The corrected v012 story browser suite passed 98 preview/export comparisons, 14 backward seeks, timing editing, advisory seeking, phone layout, a 646-frame export and 30 fps CLI output. Category/context exact-cut frames were inspected independently.
- TypeScript build, ESLint on changed code and Prettier on changed files passed.
- Both narrated proofs decode completely with audio. The resource delivery slices have exactly 408/360/739 decoded frames. Current typography outputs are comparison/access v010 and resources v003; earlier independent frame reviews apply to their preceding versions, not to creative acceptance of this correction. Narration bytes match the current recorded SHA-256; cues were checked against corrected captions and word alignment.
- Before the typography correction, decoded sample peaks were −1.5 dBFS for both candidates; mean sample levels were −16.3 dB (comparison/access) and −16.5 dB (resources). These are file measurements, not a listening or intelligibility judgment.
- Visual review combined full-resolution frames, motion contact sheets, exact boundary samples, actual 350 px image tiles and browser inspection. The prior independent reviewer confirmed repaired collisions and script-to-graphic consistency, but did not catch the crowding subsequently identified by the user. Current frames were reinspected after correction; no independent creative acceptance is claimed. No new historical-source verification was performed.

Iteration record: the library used v009–v011, followed by v012 after the user rejected the typography. The resource passage used v001/v002 for the connector repair, then v003 for this hierarchy correction. Renders of the seven library clips took approximately 4–5 seconds per clip, excluding gallery/media assembly. No paid generation occurred. Active human-equivalent labor time was not measured and is not inferred from render duration.

**Correction checks:** 20 story/diagnostic/proof unit tests passed after the typography changes. TypeScript, changed-file ESLint and formatting checks passed. The render exporter retained 646/1507 decoded frames and the resource delivery slices.

**Outstanding:** creative acceptance, continuous normal-speed visual review, listening to the combined narration/picture, full-episode rhythm, caption-region integration, protected selected-image treatment and the final episode creative decision. Phone-size inspection covers the three Evidence Boundary stages only; the other studies and narrated passages still need equivalent viewing. Successful automated playback or decoded audio does not close these items.

## Recheck against the supplied principles

| Principle                       | Result in this pass                                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Timing and spacing              | Bounded easing retained; unnecessary late regroup removed.                                                                                |
| Rhythm and contrast             | Longer final holds; two narration-sized proofs with deliberate quiet conclusions. Whole-episode assessment remains open.                  |
| Visual hierarchy                | v011 enlargement rejected by the user; v012 restores distinct text roles. The v013 Evidence Boundary stages add phone-size reading space. |
| Anticipation and follow-through | Line → destination → settle retained; no decorative bounce added.                                                                         |
| Choreography and continuity     | Shared identities, exact cuts and household match continuity preserved; 98 parity samples passed.                                         |
| Consistent personality          | Existing illustration family, palette, pinned fonts and fixed brush treatment retained.                                                   |
| Sound and polish                | Narration source/cues and file levels checked; two visual collisions repaired. Listening and combined audiovisual acceptance remain open. |
