# Editorial titles ET7a: generator pilot

Milestone ET7a of the
[editorial typography plan](../../docs/editorial-typography-improvement-plan.md#et7a--generator-pilot-and-aesthetic-proof-absorbs-et8):
an AI agent, following
[`skills/design-editorial-titles`](../../skills/design-editorial-titles/SKILL.md),
writes eight fashion-reel title candidates per clip on two clips and checks
each with [`scripts/editorial-titles/et7a-check.ts`](../../scripts/editorial-titles/et7a-check.ts).
Results: [`docs/editorial-typography-et7a-results.json`](../../docs/editorial-typography-et7a-results.json).

| Path                  | Purpose                                                                            |
| --------------------- | ---------------------------------------------------------------------------------- |
| `fonts.ts`            | Pinned fonts (bytes, licences and sources in `assets/editorial-titles/fonts/`)     |
| `clips.ts`            | Descriptors for the two local-only clip segments (SHA-256 pinned)                  |
| `grammar.ts`          | Thin helpers over existing features: held outline, entrances, exits, halo, sparkle |
| `candidates/a01…a08`  | Reel A candidates (try-on, 7.0 s, 30 fps)                                          |
| `candidates/b01…b08`  | Reel B candidates (outfit changes, 7.0 s, 24 fps)                                  |
| `probes/mapping.ts`   | Step 2: the G1 engine mapping confirmed by rendering                               |
| `probes/all-fonts.ts` | Every pinned font through strict validation                                        |

## The clips are local-only

The pilot footage is the owner's third-party reference reels, approved in G1 as
**local-only** test footage ("Yes, local only"). This repository is public, so
the reels, their original file names, and every render, frame and contact
sheet made over them stay in the git-ignored `benchmarks/results/` tree and
are never committed. Only the composition sources, SHA-256s, check results and
the owner's verdicts are committed.

The candidates expect the trimmed segments at
`benchmarks/results/editorial-titles-references/reel-a.mp4` and `reel-b.mp4`;
the descriptors reject any other bytes. They were cut from the owner's reels
with FFmpeg 8.0.1:

```bash
ffmpeg -ss 7.0 -i reel-a-source.mp4 -an -frames:v 210 -c:v libx264 -crf 14 -preset slow -pix_fmt yuv420p -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 -r 30 reel-a.mp4
```

```bash
ffmpeg -ss 3.3 -i reel-b-source.mp4 -an -vf "setpts=N/24/TB" -r 24 -frames:v 168 -c:v libx264 -crf 14 -preset slow -pix_fmt yuv420p -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 reel-b.mp4
```

Reel B's source is 23.976 fps; the segment is retimed to 24 fps (0.1% faster)
because compositions use integer rates. Reel A's segment keeps small burned-in
labels from the source; reel B's has none.

## Commands

Run from the repository root with Node 22.23.1.

```bash
pnpm exec tsx scripts/editorial-titles/et7a-check.ts --input research/editorial-titles-et7a/candidates/b01-one-pant.ts
```

```bash
pnpm exec tsx scripts/editorial-titles/et7a-check.ts --overview b
```

Each run writes a new iteration folder
`benchmarks/results/editorial-titles-et7a/<candidate>/rNN/` with the render,
`validate.json`, `lint.json`, entrance/hold/exit sheets at native and phone
scale, `phone-sheet.png` and `summary.json`. `--lint false` skips the slow
legibility lint for a visual pass.
