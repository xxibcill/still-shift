# Linked sound cues

Still Shift supports cue-linked sound effects in `story-passage-2` plans. The compiler resolves audio after visual event bindings. Moving a narration cue or an event therefore moves its sound too, including through undo/redo. Existing plans without `audio` continue to work.

## Try it in the Lab

Run `pnpm lab`, open the Passage workbench, and choose **edit linked sound cues**. The example is `benchmarks/fixtures/illustrated-sequence/sound/access-story.json`.

1. Load `assets/illustrated-sequence/narration-v001/narration.wav` using **Preview aids → Narration file**. Its checksum must match the plan. Effects are loaded automatically.
2. Play the passage. Toggle **Sound effects** to compare with narration alone, then press Play again.
3. In the first beat, change the **connection frame** from 115 to 117. The route and its brush sound move together. Undo restores both.
4. Under **Sound cues**, select a cue or an animation event's start/end. Edit the offset, duration, source in point, gain and fades. All timing fields use the passage's frame rate.
5. To add your own sound, put a mono or stereo WAV/MP3 in the workspace, enter its path, and click **Register sound file**. Choose it under **Asset for new sound**, then **Add sound to this beat**. New effects start at −18 dB.
6. **Save plan** keeps the audio contract; **Save workspace** also keeps edited templates. These downloads reference local files. Use a portable package to copy the media itself.

Narration and effects share one Web Audio clock. Pausing stops scheduled sources; resuming or seeking starts at the corresponding point within a sound and its fade. The preview checkbox is temporary and does not change the saved plan.

## Optional ElevenLabs generation

Set `ELEVENLABS_API_KEY` in the environment of the process running `pnpm lab` or the CLI. The key needs access to ElevenLabs Sound Effects. Still Shift reads it only on the server; never put it in a passage, browser field or `VITE_` variable. `.env` files are not automatically loaded by this integration. Existing file imports work without a key.

In **Sound cues → Generate sound with ElevenLabs**, enter a sound ID, a description and a duration. Click **Generate with ElevenLabs** to spend account credits on one take. The Lab saves and registers the result, offers an audio preview, and keeps the original prompt. Select the result under **Asset for new sound**, click **Add sound to this beat**, then choose its cue/event anchor, trim, level and fades. Generate several takes with the same ID if needed; registered asset IDs get a numeric suffix instead of replacing an earlier sound. If you load another passage during generation, use **Add to current passage** to attach the finished take explicitly.

The same generator is available from the CLI:

```sh
# Run after setting ELEVENLABS_API_KEY in your shell or secret manager.
pnpm --silent still-shift sfx generate \
  --provider elevenlabs \
  --id restriction-tap \
  --prompt "A single soft wooden tap, short dry decay, no music or voices" \
  --duration 1 \
  --prompt-influence 0.3 \
  --loop false \
  --output-dir assets/generated-sfx/restriction-tap-take-1
```

This uses [`eleven_text_to_sound_v2`](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert), requesting MP3 at 44.1 kHz / 128 kbps. Duration is 0.5–30 seconds, prompt influence is 0–1 (default 0.3), and `--loop true` asks the model for a seamless source. Playback still uses a single trimmed clip; it does not repeat the source automatically. Describe the sound itself, including its attack and decay, and keep exact timeline placement in Still Shift's cue controls.

Each take contains `request.json`, `sound.mp3`, and, after audio verification, `generation.json`. The CLI prints the verified asset (absolute path, SHA-256 and generation provenance), actual duration, channel count and manifest path as JSON. Add its `asset` object to `audio.assets` in a plan to retain provenance, or register the MP3 through the existing Lab file-import option. CLI generation creates an asset; it does not edit an existing passage. The Lab stores takes under `assets/generated-sfx/<id>-<request-uuid>/` and automatically retains provenance in the plan. **Save plan**, **Save workspace**, and portable packages preserve that provenance with the audio asset.

Generation happens only after an explicit CLI invocation or button click. Preview, export, undo and packaging reuse saved audio without calling ElevenLabs. Paid requests are not automatically retried. A take directory is reserved before contacting the provider; an existing directory or repeated Lab request is rejected. If generation, download or verification fails, inspect that directory and `failure.json` before explicitly requesting a new take. Any fully received audio is retained even if verification fails. A timeout or lost connection can still have consumed provider credits. Generation uses the existing FFprobe installation to verify the saved file.

Tests use simulated provider responses with real audio validation and browser registration; they do not spend credits or establish the quality of ElevenLabs-generated sound.

## Authoring contract

Add an optional `audio` object to a `story-passage-2` plan:

```json
{
  "schemaVersion": "passage-audio-1",
  "masterGainDb": 0,
  "narrationGainDb": 0,
  "assets": [
    {
      "id": "tap",
      "path": "assets/tap.wav",
      "sha256": "sha256:<64 lowercase hexadecimal characters>"
    }
  ],
  "sounds": [
    {
      "id": "restriction-tap",
      "beat": "action",
      "asset": "tap",
      "anchor": { "type": "event", "id": "access-changes", "edge": "start" },
      "offset": 0,
      "sourceStartFrame": 0,
      "durationFrames": 12,
      "gainDb": -14,
      "fadeInFrames": 0,
      "fadeOutFrames": 8
    }
  ]
}
```

The checksum above is a placeholder; the Lab records the real file hash. Asset paths resolve relative to the plan. Another supported anchor is `{ "type": "cue", "id": "restriction" }`; cue and event IDs refer to the named beat.

The compiler produces passage-local half-open `start`/`end` frames. `sourceStartFrame` inside a sound trims its audio file; the plan's `sourceStartFrame` trims narration only. Negative offsets allow anticipation. Sounds may continue across beat cuts but must stay inside the passage, and the source file must cover the complete trim. Retiming a visual event changes the sound's anchor; its authored duration stays fixed. This version does not stretch or loop audio.

Gains range from −60 to 0 dB. Fades are linear in amplitude, their lengths cannot overlap, and absent offsets, source in points, gains and fades default to zero. Duplicate identities, missing references, invalid timing, unsupported audio, and checksum mismatches are errors. WAV is recommended for precise sample alignment; MP3 decoding can differ slightly between browsers and FFmpeg.

The mix adds voice and effects without automatic normalization, ducking or limiting. Leave headroom using the individual and master levels. This avoids a background effect unexpectedly changing narration volume. Preview uses decoded source audio; delivery uses AAC, so lossy encoding can introduce small sample and peak differences.

## Export and sharing

```sh
# Regenerate the original procedural example sounds and sound plan.
pnpm story:sequence:sound

# Narration plus linked effects.
pnpm story:passage \
  --plan benchmarks/fixtures/illustrated-sequence/sound/access-story.json \
  --narration assets/illustrated-sequence/narration-v001/narration.wav \
  --output-dir benchmarks/results/my-sound-version

# Same plan and pictures, narration alone for comparison.
pnpm story:passage \
  --plan benchmarks/fixtures/illustrated-sequence/sound/access-story.json \
  --narration assets/illustrated-sequence/narration-v001/narration.wav \
  --without-sound-effects \
  --output-dir benchmarks/results/my-voice-comparison
```

Use exactly one export mode: `--narration <file>`, `--sound-only`, `--silent`, or `--prepare-only`. `--silent` mutes all audio. `--sound-only` requires sound cues and omits narration. `--without-sound-effects` requires `--narration`. Range exports preserve the part of any sound already playing at the range's start. Delivery slices include the assembled mix.

The engine API is `renderStoryPassage(output, prepared, narration, { soundEffects: false })` for narration-only comparison; omission enables effects. With no narration argument, configured effects still play. The render report records resolved sound timing, assets, gains, fades and the exported range. Audio is mixed at 48 kHz into stereo; mono sources feed both channels at their authored level. Audio edits change the assembly job identity while allowing unchanged rendered beat clips to be reused. As before, changed inputs require a fresh output directory.

`story:package` includes audio dependencies as checksummed `audio` entries, rewrites the plan's paths, and validates the package. Copy the whole package directory. The Lab's asset endpoint confines files to the current workspace; the CLI can prepare a relocated package elsewhere.

## Verification

Unit tests cover cue/event retiming, undo/redo, cross-cut tails, invalid anchors, bounds, duplicate IDs and fade validation. Integration tests check actual FFmpeg samples, partial fades, browser audio scheduling, narration-only playback, Lab editing and saving, and package relocation/tamper detection. The illustrated sound example shares the accepted narrated version's art and timing and uses original procedural sounds, with no anime audio.

The local candidate from 2026-09-28 is in `benchmarks/results/illustrated-sequence-sound-v001/`. Open `comparison.html` to switch between narration alone and narration plus effects. Its narration-only companion is `illustrated-sequence-sound-voice-v001/`. These generated outputs are excluded from Git.

Both MP4s contain 495 frames at 24 fps, with 20.625-second audio and video streams. All decoded video frames match each other and the accepted `illustrated-sequence-narrated-v002` export. The sound mix measured −1.37 dBFS sample peak and approximately −1.3 dBFS true peak. `audio-verification.json`, `picture-comparison.json` and `render-report.json` record the local evidence. The two pre-existing short-final-hold advisories remain because the accepted narration timing is unchanged.

The sound-only action-range proof and its delivery slice contain 77 video frames plus audio. The silent action-range proof contains video only. Technical checks establish timing and export behavior; the balance and character of the sound accents still need a listening judgment.

After adding optional ElevenLabs generation, `pnpm check:fast` passed with 456 unit tests. The affected integration/runtime suites passed 58 tests across generation, audio, Lab, portable workspace, cache and publication. An additional CLI success-path integration test verifies the public generation command with a simulated provider. No live paid API call was made because this server had no `ELEVENLABS_API_KEY` configured.

The subsequent [narration timing importer](narration-timing.md) adds a new 36-second [parcel story](../assets/parcel-story/README.md) with a real ElevenLabs door-knock asset. That asset was generated through the connected service; it does not establish live verification of the app's API-key route. The new story uses measured voice timing to anchor both animation and SFX. Current checks pass 466 unit tests and 62 affected integration/runtime tests.
