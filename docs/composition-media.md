# Native composition media

CE13 is in progress. The contract, source-clock evaluation and visual graph are
implemented; FFmpeg preparation, bounded browser readiness, actual audio mixing,
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
