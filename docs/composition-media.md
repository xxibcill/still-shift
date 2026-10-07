# Native composition media

CE13 is in progress. The contract, source-clock evaluation and visual graph are
implemented, with actual FFmpeg source probing, SDR conversion and atomic frame-cache
preparation and bounded browser readiness. Production source/export/Lab hookup, actual audio mixing,
waveforms and complete production acceptance remain pending. Current proof is in
[CE13 results](./composition-ce13-results.json). The contract fixture uses placeholder
hashes and is a structural fixture, not a playable media example.

Video and sequence assets declare width, height, frame count and a reduced rational
`frameRate` (`numerator` / `denominator`). Rates may be fractional, up to 240 fps.
Video `sha256` pins the file. A sequence's `path` names one numbered PNG pattern,
such as `frames/frame_%04d.png`; `firstFrame` and `frameCount` select its files.
`manifestPath` names a `composition-sequence-1` JSON file whose ordered `frames`
array pins every original PNG hash. The asset `sha256` pins those exact manifest
bytes. Physical paths are separate from source identity.

The color descriptor records source primaries, transfer, matrix and range using
ffprobe names. Supported SDR values are BT.709 primaries, BT.709 or sRGB transfer,
BT.709 YUV or RGB matrix, and limited or full range. RGB requires full range.
Sequences require sRGB RGB PNGs. Decoder preparation must verify actual metadata
and convert samples to canonical encoded-sRGB RGBA8; the descriptor alone is not
evidence of conversion. `linear-srgb` remains a composition blending choice.

Visual media use their asset size unless a layer supplies `size`; `fit` defaults
to contain. `sourceInFrame` is inclusive and `sourceOutFrame` is exclusive.
Ordinary playback starts at the trim's first frame and advances by the existing
local layer clock, including start, stretch, hold, posterization and inherited
precomp clocks. Media `timeRemap` is absolute source **seconds**, sampled in layer
time and then passed through drivers and expressions. Precomp `timeRemap` remains
source **frames**. Remapped picture clamps to its authorized trim.

`frameBlending` defaults to hold. Linear blending selects the two adjacent original
source frames and mixes them as one premultiplied image layer. Its source coordinate
is quantized to Q32 frame units after the authorized trim clamp. This media-only
rule resolves floating-point near-boundary ambiguity without changing existing
composition or CE0 clocks. Graph identity contains the selected frame pair, mix
and source hash; changing a held source time within the same pair does not invalidate
otherwise identical artwork.

Audio descriptors specify actual decoded 48 kHz sample count and one or two source
channels. Normalized output duplicates mono and preserves stereo. Native audio
uses CE16's gain/pan/fade conventions while keeping its optional backend separate.
`gainDb` and `pan` are animatable properties and valid driver/expression targets;
written values clamp to -120…+12 dB and -1…+1. Audio `timeRemap` uses absolute source
seconds. `sourceStartSample` / `sourceEndSample` are an authorized half-open trim.
Remapped PCM positions use Q16 sample units; natural identity paths must preserve
exact integer sample origins throughout nested scopes. Audio is not picture geometry.

Narration may have an explicit source trim and placement, but its complete authorized
interval must fit the composition and every inherited visibility window. Changed
local or inherited stretch, hold, posterization, looping or remap—including a driver
or expression writing remap—is rejected before any caller selects a preview range.
Disabled narration cannot bypass these checks. Visual effects, masks, mattes and
spatial projection do not apply to audio layers.

`mediaLimits` configures source duration/resolution, total decoded-cache bytes,
live decoded-frame bytes and audio working memory. Defaults are 600 seconds,
8192 × 8192, 8 GiB of decoded disk cache, 128 MiB of live decoded pictures and
512 MiB of audio working memory. Decoder and renderer preparation must enforce
their separate allocation limits and reject an over-budget required frame set.
Disk, decoded-bitmap and native GPU raster-cache bounds now have focused proof.
Actual native audio allocation remains pending.

The video probe checks actual source bytes before and after ffprobe, and verifies
all authored dimensions, rational rate, original frame count and color fields.
Picture duration is frame count divided by source rate, even if container audio
lasts longer. Original presentation timestamps remain integer strings. An exact
BigInt quantizer-phase intersection proves one constant-rate timeline; alternating
41/42 ms ticks can be valid, while VFR gaps reject. Nonidentity rotation/display
matrices and known non-square pixels require prior normalization. Actual color
metadata must be supported. Prepared pixels are converted into canonical sRGB RGBA8.

`prepareCompositionVisualMedia` takes required **original** frame ordinals and a
private cache directory. Video selection uses FFmpeg frame ordinal `n`, with no
browser video seeking. Source SHA, verified rational timing and color, selected
ordinals, optional mapping SHA, decoder version and actual FFmpeg runtime identity
form the key; relocated physical paths do not. Prepared PNG hashes, byte counts,
dimensions and canonical layout verify on every hit. Modified entries reject.

Source range/matrix is converted to full RGB. BT.709 transfer is decoded and then
encoded with the sRGB piecewise curve in a 16-bit intermediate before RGBA8
quantization. Alpha stays linear. Independent real-media ramps verify a maximum
one code value RGB/alpha error and two code values for limited YUV neutral samples.
Prepared PNGs carry an sRGB chunk after conversion, with competing tags removed.

Sequence PNGs follow [PNG Third Edition color priority](https://www.w3.org/TR/png-3/):
cICP, ICC, sRGB, then legacy gamma/chromaticities. Supported authoritative cICP is
`[1, 13, 0, 1]`; standalone ICC or legacy-only tags require prior normalization.
Untagged PNGs use the authored sRGB descriptor and explicitly record that authority.
All original hashes and dimensions verify even when only a subset is selected.
Animated PNG and corrupt chunks reject. A root lock protects cumulative disk
accounting. Conservative reservations include transient files and manifest bytes;
private staging publishes atomically and is removed on cancellation or failure.
Browser CPU/GPU resource allocation is verified; actual audio remains pending.

`loadCompositionResources` accepts the captured `preparedMedia` manifest. Native
previews call `await preview.prepareFrame(frame)` before `preview.renderFrame(frame)`.
The same exposure and history graphs identify every required original, including
mattes, effect inputs, nested scopes and isolated required coverage. The complete
required set must fit `decodedFrameBytes`; retained unneeded bitmaps can be evicted.
Every stream is bounded by its pinned byte count, hashed before decoding, and checked
for canonical PNG layout and dimensions. Serial preparation, abortable readers and
bitmap cleanup prevent old seeks or disposed previews from publishing readiness.
Native full-timeline required coverage runs before the first prepared preview draw.

`decodedTextureBytes` separately bounds retained native GPU image raster textures
(default 128 MiB, maximum 512 MiB). Eviction deletes those textures and framebuffers
instead of transferring them to the general surface pool. Temporary render/effect
surfaces keep their existing renderer policies. Encoded download buffers have a
separate bound based on the pinned frame dimensions and byte count; they are not
counted as decoded bitmap residency. Prepared manifests allow at most 131,072 frame
entries, and one disk cache entry at most 262,144, to bound metadata. Native source
frame-count limits remain unchanged. Source-loader and export-page integration are verified. Lab/CLI preview and draft integration are verified. Actual PCM, native passage mixing
and complete CE13 acceptance are the next work.

`loadComposition` and `renderComposition` prepare native sources before browser
rendering. An optional `cacheDirectory`, or `STILL_SHIFT_COMPOSITION_MEDIA_CACHE`,
selects the preparation cache; the default is scoped by the absolute workspace path
under the system temporary directory. `assetPaths` contains only drawable still/font
resources and captured native PNG IDs. `mediaSourcePaths` retains original video and
sequence pattern/manifest paths for trusted authoring integration. The exported scene
carries the immutable `preparedMedia` manifest and awaits readiness for each frame.
Still-only export callbacks keep their synchronous path.

Capture walks the full document with culling disabled, so history, mattes and required
coverage cannot miss originals. Documents whose measured text may drive source clocks
capture a conservative source set, bounded by the manifest entry cap. Unused sources
verify provenance but do not allocate decoded pixels. Actual video and sequence exports
with an animated still and native shape lower third match independently encoded preview
frames, repeat exports and raw/PNG transport on Canvas 1.45 and WebGL2 0.66. Matching
audio is still pending.

Native authoring requests prepare only an accepted document with unchanged source
bindings. CLI revision captures and registered Lab fixture captures serve exact PNG
resource IDs, not arbitrary filesystem paths or original video files. A remap edit
can prepare a newly referenced original. Source files stay on disk rather than being
loaded into large browser snapshot buffers; every preparation/export revalidates the
pinned original bytes. Changed sources reject and preserve the last valid preview.
Sequence watchers include numbered originals and the manifest. Portable JSON resolves
and relocates both the sequence pattern and manifest path.

Preview sessions accept optional asynchronous `prepareFrame` readiness. They retain
visible pixels until readiness succeeds, ignore superseded seeks/first frames, cancel
stale candidates, and dispose resources once. Playback waits for each native readiness
step and guards restart/pause generations. Still-only renderers remain synchronous.
Native inspector source-clock keys expose Media key value editing. Real edit/undo/redo,
save/reload, backend switching and draft-export checks are verified; actual native PCM
and source/processed waveform lanes are the next work.
