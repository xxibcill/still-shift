# The parcel at the wrong door

The latest [image-model artwork version](image-model-v001/README.md) replaces all eight SVG picture assets with generated PNG layers. It uses the same recorded narration, imported cues and ElevenLabs knock. The original SVG proof is documented below and remains available for comparison.

A 36-second fictional timing proof for Still Shift. Candidate for human listening and visual review; no historical event or measured social claim is depicted. All eight SVG drawings are original hand-authored illustrations. Text and door numbers use Still Shift's native text renderer and the repository's Source Serif 4 font.

## Exact narration

```text
The parcel was waiting at the wrong door. Nora checked the label, then looked across the hall. The number matched the apartment opposite.

She carried the parcel over and knocked. For a moment, nothing happened. Then the door opened, and an anxious neighbor smiled. He had been waiting all morning.

Nora handed it over and stepped back. A small mistake had taken only a minute to fix. When she returned home, the hallway was quiet again. This time, the parcel was exactly where it belonged.
```

## Measured voice and sound

- Narration: ElevenLabs `eleven_multilingual_v2`, saved voice **HOS — Wry Archivist — v001**, voice ID `wGCJpA17l87s9LEil0QE`. Take 1 of four provider candidates selected; no regeneration. Raw duration 34.737052 seconds. Complete provider IDs and returned cost metadata are in `narration-v001/provenance.json`.
- Conform: loudness normalization to −16 LUFS on the mono source, −1.5 dBTP ceiling, 48 kHz PCM WAV, silence padded to exactly 36 seconds / 864 frames at 24 fps. No speech time stretching. The stereo passage uses −3 dB master gain to account for dual-mono summation in loudness measurement.
- Alignment: locally cached `mlx-community/whisper-small.en-mlx`, word timestamps on the conformed WAV. `alignment.json` retains raw alignment. The transcript was checked against the script; ASR used “neighbour” for “neighbor.” Zero-length ASR word spans are retained. Selected cue phrases avoid that spelling difference.
- `captions.srt` contains speech subtitle intervals; it is separate from the visual beat plan. Times are measured, not estimated from text length. Padded silence holds the final composition.
- SFX: one real `eleven_text_to_sound_v2` generation via the connected ElevenLabs service. Prompt: “Two gentle knuckle knocks on an interior wooden door, close and dry, short natural decay, no music or voices.” The returned take is 14 seconds with several knock clusters. Playback trims the first pair from source frame 26 for 14 frames at 24 fps, with −12 dB cue gain and a four-frame tail fade. It does not stretch or replay the entire recording.
- Provider-reported cost: four speech candidates at $0.0892638 each plus $0.00303 for one sound = approximately $0.3601 total. These are returned costs for this run, not a pricing promise.

Flow: [ElevenLabs generation record](https://elevenlabs.io/app/flows/kdTRXzPLPlZ6xoM984ny). No anime art or audio was used. Media lineage is recorded beside each asset; expiring signed download URLs are not stored in the repository.

The app's own ElevenLabs API route has simulated-provider coverage but has not made a live request in this environment: its server key is absent. This proof used the connected service to obtain real media, then Still Shift's regular asset, timing, preview and render paths.

## Shot and timing plan

| Beat       | Passage interval         | Visual purpose                                                         | Imported cue examples                                                                          |
| ---------- | ------------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Wrong door | 0–8.5 s, frames 0–203    | Establish doors 12 and 21; lift parcel and reveal destination          | “checked the label” at frame 74; “number matched” at 150                                       |
| Knock      | 8.5–20 s, frames 204–479 | Carry, hold through silence, knock, then open door and reveal neighbor | “knocked” at frame 243; “opened” at 339; “an anxious” at 365                                   |
| Handover   | 20–36 s, frames 480–863  | Give parcel, step back, return, settle into an empty hallway           | “handed it over” at frame 496; “returned home” at 655; “quiet again” at 697; resolution at 775 |

Frames in this table are passage-global; saved cue frames are beat-local. Eleven matched phrases feed linked event bindings. The knock accent and sound share the same cue. Sparse translation, held drawings, image-state cuts, fades and camera framing support the voice; this is limited animation, not character rigging or lip sync.

## Reproduce and review

See [narration timing import](../../docs/narration-timing.md) for the general CLI command and Lab workflow. `benchmarks/fixtures/parcel-story/before-import.json` is the authored input with provisional cues. `parcel-story.json` is the imported result, with only dependency paths rebased for the repository and editorial presentation adjustments. Templates and artwork are data; no bespoke timing generator was added.

```sh
pnpm story:passage \
  --plan benchmarks/fixtures/parcel-story/parcel-story.json \
  --narration assets/parcel-story/narration-v001/narration.wav \
  --output-dir benchmarks/results/my-parcel-review
```

Local candidate review: `benchmarks/results/parcel-story-v002/index.html`. Export and checks are generated artifacts, excluded from Git. The earlier illustrated-sequence examples remain available unchanged.

## Verification

`pnpm check:fast` passed with 466 unit tests. Eleven affected integration/runtime files passed 62 tests, including browser preview/apply/undo/save, stale-preview rejection, portable timing metadata, audio, generation, cache and publication. The portable candidate is `benchmarks/results/parcel-story-package-v001/workspace.json` (15 checksummed files).

FFprobe confirms 864 frames at 24 fps, 1920×1080, with both audio and video exactly 36 seconds. The decoded MP4 measures −16.2 LUFS integrated and −4.5 dBFS true peak. The compiled knock interval is frames 243–257 exclusive, synchronized with the knock accent. Six decoded frames were visually inspected. `verification.json`, `contact-sheet.png`, `loudness.log` and `render-report.json` record the evidence beside the export.

One motion advisory remains: `entrance-pop` on Nora's final fade, which overlaps the end of her return movement. This is a review advisory, not a contract failure. Human listening and full-motion approval remain pending.
