# Narration timing import

Still Shift can import measured speech timing into an existing linked passage. The shared engine powers both the Passage Lab and CLI. Matched cue IDs stay unchanged, so linked animation events and sound effects move with them. Beat lengths remain editorial decisions.

## Passage Lab

1. Open a `story-passage-2` plan (or enable linked authoring).
2. Under **Narration cues → Import narration timing**, select the narration WAV/MP3 and its word timing JSON or SRT.
3. Choose **Match existing cue phrases** to retime existing links, or **Add transcript cues** to add unbound sentence/subtitle cues.
4. Select **Preview timing import**, inspect the proposed frame changes, then **Apply timing import**. The complete edit has one Undo step; the selected voice is ready for playback.
5. Edit cues normally, link new cues under **Linked events**, and save the plan or portable workspace.

A preview becomes invalid if the passage changes before applying. Audio and timing are read locally; this step does not upload them or call a provider. Limits are 100 MB audio and 2 MB timing. Audio must cover the passage's entire source interval. A plan stores the audio hash and normalized timing, not the audio bytes; package the workspace to move dependencies together.

## Timing formats

Word JSON accepts an array, `{ "words": [...] }`, or Whisper-style `{ "segments": [{ "words": [...] }] }`. Each word has `word` (or `text`), `start`, and `end`, in seconds relative to the supplied audio:

```json
{
  "words": [
    { "word": "Pressure", "start": 2.5, "end": 2.9 },
    { "word": "builds.", "start": 2.9, "end": 3.3 }
  ]
}
```

SRT uses subtitle onsets. Matching requires a complete subtitle phrase; the importer does not infer individual word timing inside a subtitle. Add mode uses subtitle entries directly. Word add mode groups sentences, pauses over 0.6 seconds, or at most 14 words.

Matching ignores case and punctuation and supports Unicode words. A phrase must match exactly once **within its beat**. Missing or repeated matches reject the whole import; choose a longer unique phrase or correct the transcript. Alignment quality remains the responsibility of the input: timestamps cannot prove that words were actually spoken.

Source seconds become `round(seconds × fps) − sourceStartFrame − beatStartFrame`. Onsets use half-open beat intervals after rounding. A word on a cut belongs to the following beat. Timing beyond the audio, invalid source ordering, missing references, conflicting event windows and out-of-bounds linked effects are rejected. Existing compiler validation still applies.

Normalized metadata is saved as `narration.timing` with `schemaVersion: "narration-timing-1"`, `granularity: "word" | "subtitle"`, and `segments: [{ text, start, end }]`. It survives save/load and portable packaging. Metadata does not continuously resnap manual edits; importing again is an explicit operation.

## CLI

```sh
pnpm still-shift passage import-narration \
  --plan benchmarks/fixtures/parcel-story/before-import.json \
  --narration assets/parcel-story/narration-v001/narration.wav \
  --timing assets/parcel-story/narration-v001/alignment.json \
  --mode match \
  --output benchmarks/results/my-parcel-plan.json

pnpm story:passage \
  --plan benchmarks/results/my-parcel-plan.json \
  --narration assets/parcel-story/narration-v001/narration.wav \
  --output-dir benchmarks/results/my-parcel-render
```

Use `--mode add` for a new set of transcript cues. The command inspects actual audio, validates the complete passage, prints the proposed/applied cue changes, and writes a new plan exclusively. It never overwrites an existing output. CLI paths become absolute so the output can live elsewhere on the same machine; use `pnpm story:package` for a portable copy.

This version does not generate narration, run transcription/alignment, resize beats, or select animation events automatically. Supply measured timing from your speech/alignment workflow, then choose what those cues control.

## New story proof

Open **imported narration timing** from the Passage workbench. [The parcel story](../assets/parcel-story/README.md) is a new 36-second fictional sequence with original SVG art, an ElevenLabs voice, local word alignment, and one generated door-knock effect. Eleven cue matches drive carries, door states, character appearances, handover and resolution. Its plan was produced through this CLI command; there is no parcel-specific timing importer.

The workbench now opens the [image-model artwork version](../assets/parcel-story/image-model-v001/README.md), which replaces every picture asset with a generated PNG while keeping the same imported timing and audio. The SVG proof remains available at the original fixture path used in the CLI example above.

The media was generated through the connected ElevenLabs service. The optional Still Shift API-key generator remains a separate path: its live provider request still needs `ELEVENLABS_API_KEY` configured on the server. The story proves real generated media playback and synchronization, not that missing credential setup.
