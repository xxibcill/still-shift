# Soundtrack listening checklist (PR #33)

Automated tests prove the soundtrack renders are technically exact. They cannot
judge how the result sounds. This checklist is for the owner's listening pass on
the real 60-second CE16 episode (`benchmarks/fixtures/composition/ce16/project.json`,
whose media lives in the local episode folder). Everything renders into
`benchmarks/results/listening/`, which Git ignores. Use the pinned toolchain from the
[soundtrack guide](./soundtrack-project.md); run `pnpm soundtrack:setup` first if
the runtime is missing.

## Render the variants

Each command block starts from a fresh copy of the fixture. Run the blocks from
the repository root.

### A. Baseline (as authored)

```sh
mkdir -p benchmarks/results/listening
cp benchmarks/fixtures/composition/ce16/project.json benchmarks/results/listening/a.json
pnpm --silent still-shift soundtrack render --project benchmarks/results/listening/a.json --output-dir benchmarks/results/listening/a --stems
```

### B. Tiled music bed and equal-power SFX fades

The 16-second music clip is tiled to fill the minute with 1-second equal-power
crossfades, and both effect fade-outs switch to equal-power.

```sh
cp benchmarks/fixtures/composition/ce16/project.json benchmarks/results/listening/b.json
echo '[{"type":"tile","clip":"bgm-clip","endSample":2880000,"crossfadeSamples":48000},{"type":"fade","clip":"sfx-pouch-clip","fadeOutCurve":"equal-power"},{"type":"fade","clip":"sfx-roots-clip","fadeOutCurve":"equal-power"}]' | pnpm --silent still-shift soundtrack edit --project benchmarks/results/listening/b.json --revision 0 --operations -
pnpm --silent still-shift soundtrack render --project benchmarks/results/listening/b.json --output-dir benchmarks/results/listening/b --stems
```

### C. Hot mix, without and with the master limiter

Master gain is raised by 9 dB to force overs, then rendered as is and with a
−1 dBFS limiter (10 ms lookahead, 100 ms release).

```sh
cp benchmarks/fixtures/composition/ce16/project.json benchmarks/results/listening/c.json
echo '[{"type":"gain","target":"master","kind":"master","gainDb":9}]' | pnpm --silent still-shift soundtrack edit --project benchmarks/results/listening/c.json --revision 0 --operations -
pnpm --silent still-shift soundtrack render --project benchmarks/results/listening/c.json --output-dir benchmarks/results/listening/c-unlimited
echo '[{"type":"limiter","limiter":{"ceilingDb":-1,"lookaheadSamples":480,"releaseSamples":4800}}]' | pnpm --silent still-shift soundtrack edit --project benchmarks/results/listening/c.json --revision 1 --operations -
pnpm --silent still-shift soundtrack render --project benchmarks/results/listening/c.json --output-dir benchmarks/results/listening/c-limited
```

### D. Delivery format

Integer delivery clips overs. Encode both C mixes the way video export does:

```sh
for name in c-unlimited c-limited; do ffmpeg -v error -y -i benchmarks/results/listening/$name/audio/mix.wav -c:a aac -b:a 192k benchmarks/results/listening/$name.m4a; done
```

Each render's `render.json` lists `peakDbfs` and `samplesAboveFullScale` for the
mix; C-limited also lists the limiter's `maxReductionDb`.

## Listen for

Use headphones and speakers if possible. Note the timestamp of anything that
fails.

| #   | Listen to                                            | Pass when                                                                                        |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | A `mix.wav`                                          | Narration is clear over the music throughout                                                     |
| 2   | A `mix.wav`                                          | Music ducks under speech and returns smoothly in pauses, with no audible pumping or late release |
| 3   | A `mix.wav` around 0:00.9 and 0:11.8                 | Effect onsets and tails have no clicks; fades feel natural                                       |
| 4   | A `bgm.wav` stem                                     | The high/low-pass filters do not make the music sound thin or muffled                            |
| 5   | B `mix.wav` near 0:15, 0:30, 0:45                    | Music-bed joins have no level dip, bump or click                                                 |
| 6   | B `mix.wav` overall                                  | The repeated bed does not sound obviously looped for this episode                                |
| 7   | B `mix.wav` effect tails                             | Equal-power fade-outs sound better than or equal to A                                            |
| 8   | C-unlimited `.m4a`                                   | Expect audible clipping (this is the reason for the limiter)                                     |
| 9   | C-limited `.m4a`                                     | No clipping; peaks sound controlled without obvious distortion or pumping                        |
| 10  | C-limited vs C-unlimited `mix.wav` in quiet passages | Identical away from loud peaks                                                                   |

## Record the outcome

Add a dated line to [`docs/dev-log.md`](./dev-log.md) with pass or fail per item
and any timestamps. Parameter changes that come out of listening (ducking depth or
timing, fade curves, crossfade length, limiter ceiling or release) are authored
edits to the project. Engine changes are only needed if a behaviour is wrong
rather than a setting.
