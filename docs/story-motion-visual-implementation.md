# Story motion visual implementation

**Date:** 2026-09-26. **Status:** all seven visual redesigns implemented and rendered;
local ST-013/014 narrated candidate prepared. Full S01E01 integration remains a
separate episode milestone.

**Latest refinement:** [Artistic brush lines](story-motion-brush-lines.md), following [authored curves and varied easing](story-motion-line-timing-refinement.md), supersede the v005 previews below. This page retains the initial visual redesign evidence.

## Review the result

- [Seven-motion gallery](../benchmarks/results/story-motion-v005/index.html)
- [Eight style frames, including the context reset](../benchmarks/results/story-motion-v005/contact-sheet.html)
- [390 px frames](../benchmarks/results/story-motion-v005/phone-frames-390.png)
- [320 px grayscale comparison](../benchmarks/results/story-motion-v005/silhouette-grayscale-320.png)
- [Narrated ST-013/014 candidate](../benchmarks/results/story-motion-s01e01-proof-v004/index.html)

Rendered outputs are local, ignored artifacts. The committed source, art, fonts,
fixtures and scripts reproduce them on another checkout.

## What changed

One original vector illustration family now supplies the households, store,
fields, access symbol, restriction bands and registered categories. It uses the
channel's bone/ink/field/grain/red/crisis palette, restrained fixed texture and
consistent contours. [Art provenance and font sources](../assets/story-motion/README.md)
remain inspectable. No selected episode image was altered.

Source Serif 4 and IBM Plex are loaded from pinned local files in both the lab
and export worker. Every meaningful label is at least 42 px at 1080p. Production
metadata moved into the gallery. Dates, comparisons, evidence limitations and
composite labels remain in the picture.

| Motion             | Finished visual treatment                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| Unequal Margins    | Large matched houses, shared ground, open pressure contours and readable consequence labels         |
| Access Constraint  | Dominant store, paired destinations, curved pressure sides and an open attached route               |
| Relationship Build | Asymmetric resource anchor, offset dependencies, legible labels independent of art emphasis         |
| Evidence Boundary  | Three editorial roles: supported categories, explicit unknown details, separate composite household |
| Dated System Break | Large dated crisis-blue composition, fractures, then a hard cut to a separate bone Walsham context  |
| Category Swap      | Registered basket states, synchronized editable caption and fixed comparison qualifier              |
| Motif Resolve      | Familiar grounded motifs, quiet upper-right area and a labeled land → rent/service conclusion       |

The small contract additions are optional pinned fonts, authored text states,
category `stateLabels`, and clipped illustration groups for restriction sides.
Existing scene inputs remain valid. The story renderer identifies this pass as
`story-canvas-0.13.1`.

## Inspection and repairs

The primary review inspected full-resolution posters, sampled temporal sheets,
the final 390 px color and 320 px grayscale frames, and exact proof-boundary
frames. Independent editorial review used a separate AI context and inspected
all seven v004 posters/motion sheets, affected v005 outputs and proof frames. The final v004 check found no remaining concrete text/roof
collision at frames 40, 96 and 145, and confirmed household continuity.
This was visual frame/sample review, not a recruited audience study or a human
watch of narrated playback.

Browser automation played all seven eight-second videos through to `ended` at
normal speed. [Playback evidence](../benchmarks/results/story-motion-v005/playback-report.json)
records those checks separately from visual judgment. It also verified the
390 px gallery has no horizontal overflow. Small qualifiers remain secondary
at phone width; the full-size/landscape view provides the intended reading size.
The main relationships, dates and unknown/composite distinction remain visible
in the inspected smaller frames, including grayscale.

Repairs made during inspection:

1. Replaced the equals-sign-like restriction with shaped pressure bands.
2. Removed the pale access-symbol mask edge on dark backgrounds.
3. Moved the access caption below the complete moving envelope.
4. Attached the category connector to the actual basket edge.
5. Let the fully assembled evidence composition hold for 3.5 seconds and the
   separate Walsham context for 3 seconds.
6. Kept closing labels opaque while their illustrations lose emphasis.
7. Mapped the narrated restriction to the less-room household; moved its source
   label and adjusted the complete restriction sweep clear of the roof.

## Verification

Using pinned Node 22.23.1:

- 153 unit/integration tests passed, including font references, invalid IDs,
  synchronized category captions, clipped restrictions and proof continuity.
- 70 story preview/export comparisons, seven pixel-identical backward seeks,
  valid/invalid timing edits, playback controls and phone layout passed.
- Real 646-frame/24 fps export and 192-frame/30 fps CLI export passed.
- Font loading/failure checks exercise the intended four faces, missing files,
  changed hashes and reuse during scene changes.
- Legacy illustrated checks: 42 comparisons, six alternate scenes, 24/30 fps
  and asset integrity passed.
- Cinematic checks: 31 comparisons, two compositions, 24/30 fps, repeated
  determinism and invalid-plate rejection passed.
- TypeScript build and ESLint passed.

[Parity data](../benchmarks/results/story-motion-v005/parity-report.json) and
[render measurements](../benchmarks/results/story-motion-v005/render-summary.json)
are available beside the clips. The seven studies total 1,344 frames / 56 seconds;
individual renders took approximately 2.6–3.2 seconds here. These are local
fixture measurements, not a general production-throughput claim. No paid image
or video generation was used; unmeasured human time and compute cost are not
estimated.

## S01E01 proof and scope

The [proof handoff](../benchmarks/results/story-motion-s01e01-proof-v004/handoff.json)
records master frames 4748–5393, 646 frames at 24 fps (26.917 seconds), the exact
334/312-frame split, narration path/hash, event windows and encoded output hash.
The source is the existing `narration-mix-v003.wav`, verified before rendering.
The houses retain identical scale and position across the cut at master5082.

The exported candidate has 646 decoded video frames and an audio stream; a full
FFmpeg decode passes. Browser playback reached the end at normal speed (muted),
and its restriction states were inspected at 390 px. Internal strain/access cues follow the existing corrected
caption timings. This is a symbolic graphic candidate in Still Shift, not a
replacement of protected selected episode assets. Narrated human playback,
remaining episode passages and full 11,297-frame assembly/QA remain outside
this completed visual-library pass.

Reproduce with `pnpm story:prepare`, then
`pnpm story:render --output-dir <new-directory>`. To create the local episode
proof, use `pnpm story:proof --output-dir <new-directory> --narration <current-WAV>
--narration-sha256 <expected-hash>`. Existing outputs are protected from overwrite.
