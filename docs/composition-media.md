# Native composition media

CE13 is in progress. The contract, source-clock evaluation and visual graph are
implemented, with actual FFmpeg source probing, SDR conversion and atomic frame-cache
preparation. Bounded browser readiness, actual audio mixing,
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
Those allocation proofs remain pending; structural limits are already validated.

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
Browser CPU/GPU resource allocation and actual audio remain pending.
