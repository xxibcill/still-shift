# Narration-led pacing example v001

This is an isolated Still Shift example using the existing illustrated access
story, not a historical episode. The user's 2026-09-28 request authorizes creating
the narration and using its performed timing to animate. The original silent
30-second proof remains available.

The spoken master is `raw.mp3`, ElevenLabs Multilingual v2 with the workspace's
**HOS — Wry Archivist — Male v001** voice. `provenance.json` records the provider
flow, voice and generation IDs. The connector produced its default four takes in
one request, at a reported total of 1,039.896 credits / $0.189072. Take 2 is the
timing candidate: 20.108481 seconds by provider metadata. No additional synthesis
or subjective audition comparison was performed.

## Copy-ready full script

```text
The grain is right there. But can this household reach it?

Watch the connection. As pressure builds, the route narrows.

The basket is still full. No grain has disappeared.

What changed is access. And for the household, that changes what it can actually use.
```

`script.txt` is the exact provider input, with no spoken production instructions,
SSML breaks or numeric voice overrides. Direction: conversational inquiry in the
opening question, concrete explanation through the narrowing, then a restrained
consequence. The distinction should come from sentence structure and the selected
voice; the connector does not expose speed, stability or style controls.

## Measured performance and picture plan

`alignment.json` is a local MLX Whisper small.en transcript with word timestamps.
It contains every scripted word, with one homophone transcription: **root** for
**route**. The generator explicitly maps that token for text comparison; captions
use the canonical spelling. This is a transcription observation, not evidence of
a pronunciation defect. `timing.json` and `captions.srt` are derived from these
measured phrase intervals. Alignment is a timing estimate, not a listening review.

| Spoken thought                                                                        | Measured interval | Picture response                                                                                                                                                         |
| ------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The grain is right there. But can this household reach it?                            | 0.00–3.96 s       | Establish house and full basket. Reveal the question caption at “But,” keeping the route absent while the question is raised.                                            |
| Watch the connection. As pressure builds, the route narrows.                          | 4.80–8.90 s       | Reveal and slide the route on “Watch”; cut closer at 6.125 s; introduce pressure on “As pressure,” then change to the narrow artwork on “narrows” at 8.083 s.            |
| The basket is still full. No grain has disappeared.                                   | 9.48–12.70 s      | Cut back toward the basket at 9.333 s, preserving the restricted route; reveal the grain caption on “basket.”                                                            |
| What changed is access. And for the household, that changes what it can actually use. | 13.50–19.74 s     | Begin the stronger pullback on “What changed,” reveal the access response at 14.542 s, restore the household during its final mention, and settle through the last word. |

The final picture is **495 frames / 20.625 seconds at 24 fps**. The added tail
gives the final thought under one second to settle after the last aligned word.
The narration stays at its original speed. Whole-frame cut and cue times are
rounded from the performance; they are not percentages of the old 30-second cut.

Every shot reuses the exact inspected house, basket, route states and pressure
wedges described in the [asset record](../README.md). Copy occupies the existing
empty scene space above the subjects. The final two lines now appear separately,
so “access” is not disclosed while the narrator is still describing the grain.
The same full basket and registered route endpoints persist across cuts.

## Audio conform and reproduction

`narration.wav` is mono, 48 kHz PCM, with loudness treatment and a padded tail.
It supplies the plan's SHA-256 identity. No music or sound effects were added.
The FFmpeg conform used the following measured first-pass values:

```sh
ffmpeg -i raw.mp3 \
  -af 'loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=-22.30:measured_TP=-2.18:measured_LRA=3.10:measured_thresh=-32.90:offset=1.32:linear=false,aresample=48000,apad,atrim=end_sample=990000' \
  -ac 1 -c:a pcm_s16le narration.wav
```

The input measured −22.30 LUFS and −2.18 dBTP. The conformed WAV measured
−16.70 LUFS and −1.49 dBTP. Waveform alignment at 0.25, 7.5 and 18 seconds found
zero timing shift between raw and conformed speech at an 8 kHz comparison rate.
To rebuild the timing, templates and captions without spending provider credits:

```sh
pnpm story:sequence:narrated
pnpm story:passage \
  --plan benchmarks/fixtures/illustrated-sequence/narrated/access-story.json \
  --output-dir benchmarks/results/my-narrated-example-v001 \
  --narration assets/illustrated-sequence/narration-v001/narration.wav
```

The script validates transcript coverage, reads the actual WAV duration, rounds
word anchors to frames, rewrites the copied templates and binds the actual audio
hash. New speech requires new alignment and a reviewed audio conform; reusing this
alignment with a different performance is invalid.

Version acceptance: on 2026-09-28, the Creator accepted the delivered narrated
example (`illustrated-sequence-narrated-v002`) as “good enough for this version.”
This records acceptance of this example. Agent inspection covered audio metadata,
transcript, timing and sampled picture; no full subjective listening review was
performed by the agent.

The delivered [video](../../../benchmarks/results/illustrated-sequence-narrated-v002/passage.mp4)
and [review page](../../../benchmarks/results/illustrated-sequence-narrated-v002/index.html)
contain 495 frames with an AAC narration track. The browser loaded it at
1920×1080, 20.625 seconds, with sound enabled and no media error. The complete
fast tier passed 436 tests, type checking, lint, formatting, schema and package
boundaries. Three new tests verify audio identity, measured cue timing and state
continuity into the final shot.

Two advisory `short-final-hold` warnings remain: 0.92 seconds in the opening and
0.83 seconds after the action's caption entrance. These are deliberate phrase-led
cuts; extending both to the generic two-second target would add pauses the voice
does not perform. The route continues into the close-up, and the changed state
continues into the consequence. The initial entrance-speed warning was repaired
with an accelerating/decelerating route slide.

Provider controls were checked against the current
[ElevenLabs prompting guide](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices)
and live connector schema. No unavailable settings were inferred.
