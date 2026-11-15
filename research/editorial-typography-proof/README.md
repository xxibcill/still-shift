# Editorial typography proof (2026-11-15)

Bounded proof for the [editorial title assessment](../../docs/editorial-typography-proof-2026-11-15.md):
three title treatments over one moving vertical clip, plus controls and probes.
Not a product, template set or fixture suite.

| File                          | Purpose                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `copy.ts`                     | Exact copy shared by every program and the coverage probe                    |
| `shared.ts`                   | Clip descriptor (pinned SHA-256), vertical crop, pinned fonts, shared timing |
| `t1-editorial-stack.ts`       | Treatment 1, pass 2                                                          |
| `t2-thai-condensed-poster.ts` | Treatment 2, pass 2                                                          |
| `t3-minimal-centered.ts`      | Treatment 3, pass 2                                                          |
| `pass1/*.composition.json`    | Exported first-pass compositions that reproduce O1–O3                        |
| `t1-control-static.ts`        | Pass-1 T1 JSON without text animators, isolating attach-bound drift          |
| `coverage-negative.ts`        | Thai copy in pinned Plex Sans; `PROOF_PLEX_ONLY=1` loads no Thai face        |
| `without-clip.ts`             | Lint probe: a treatment with the video removed (`PROOF_TREATMENT=<name>`)    |
| `t2-without-scrim.ts`         | ET3 probe: treatment 2 with its gradient scrim disabled                      |
| `cmap-probe.ts`               | Reads cmap 4/12 and lists missing code points per font and copy              |
| `review-frames.sh`            | Extracts frames 16/24/32/60/100/130/138/146 and a 360×640 phone sheet        |

## Inputs and limits

The clip `benchmarks/results/cinematic-illustrated/review-v3/ci-09-layered-parallax.mp4`
is a git-ignored local render of the repository's generated courtyard kit, so the
programs only run on a machine that has it; the descriptor rejects any other bytes.
It is illustrated and slow-moving, a stand-in rather than fashion footage. Fonts are
the repository's pinned OFL faces. No paid generation was used.

## Commands

Run from the repository root with Node 22.23.1.

```bash
pnpm --silent still-shift comp validate --input research/editorial-typography-proof/t2-thai-condensed-poster.ts
```

```bash
pnpm --silent still-shift comp render --input research/editorial-typography-proof/t2-thai-condensed-poster.ts --output benchmarks/results/editorial-typography-proof-2026-11-15/t2-thai-condensed-poster.mp4
```

```bash
pnpm --silent still-shift comp lint --input research/editorial-typography-proof/t2-thai-condensed-poster.ts --pixels true
```

```bash
PROOF_TREATMENT=t3-minimal-centered pnpm --silent still-shift comp lint --input research/editorial-typography-proof/without-clip.ts --pixels true
```

```bash
PROOF_PLEX_ONLY=1 pnpm --silent still-shift comp render --input research/editorial-typography-proof/coverage-negative.ts --output benchmarks/results/editorial-typography-proof-2026-11-15/coverage-negative-plex-only.mp4
```

Render outputs refuse to overwrite; move or delete earlier outputs first.
