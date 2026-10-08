# Native composition media

CE13 is in progress. The contract, source-clock evaluation and visual graph are
implemented, with actual FFmpeg source probing, SDR conversion and atomic frame-cache
preparation and bounded browser readiness. Production source/export/Lab hookup, actual
audio mixing, waveform capture and preview are verified. Whole-passage PCM integration is verified; complete final acceptance remains pending. Current proof is in
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
exact integer sample origins throughout nested scopes. Audio visibility compares
Q16 PCM coordinates against exact half-open layer, scope and inherited group bounds;
authored property/frame clocks and ordinary picture visibility remain unchanged.
The evaluator identity advances so prepared masters missing a boundary sample are
rebuilt. Audio is not picture geometry.

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
Native source/mix buffers and browser master ownership now enforce this limit.

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
Browser CPU/GPU and native PCM source/mix/preview allocation are verified.

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
frame-count limits remain unchanged. Source-loader and export-page integration are verified. Lab/CLI preview and draft integration are verified. Native passage mixing is verified; complete CE13 acceptance remains pending.

`loadComposition` and `renderComposition` prepare native sources before browser
rendering. An optional `cacheDirectory`, or `STILL_SHIFT_COMPOSITION_MEDIA_CACHE`,
selects the preparation cache; the default is scoped by the absolute workspace path
under the system temporary directory. `assetPaths` contains still/font resources, captured native PNG IDs and the verified
`__audio:mix` WAV resource. `mediaSourcePaths` retains original audio/video and
sequence pattern/manifest paths for trusted authoring integration. The exported scene
carries the immutable `preparedMedia` manifest and awaits readiness for each frame.
Still-only export callbacks keep their synchronous path.

Capture walks the full document with culling disabled, so history, mattes and required
coverage cannot miss originals. Documents whose measured text may drive source clocks
capture a conservative source set, bounded by the manifest entry cap. Unused sources
verify provenance but do not allocate decoded pixels. Actual video and sequence exports
with an animated still and native shape lower third match independently encoded preview
frames, repeat exports and raw/PNG transport on Canvas 1.45 and WebGL2 0.66. Matching whole-passage audio is verified; final CE13 acceptance remains pending.

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
step and guards restart/pause generations. Native resource captures remain owned by
an active or candidate preview until disposal, replacement failure, or connection
closure releases them. Later prepares and peer tabs cannot evict a held capture;
the server rejects additional preparation at the 64 live/pending capture bound
rather than removing an existing preview's resources. Still-only renderers remain
synchronous.
Native inspector source-clock keys expose Media key value editing. Real edit/undo/redo,
save/reload, backend switching and draft-export checks are verified; actual native PCM
and source/processed waveform lanes are the next work.

`evaluateCompositionAudio(composition, outputSample)` evaluates audio instances at
integer 48 kHz output samples through shared keyed, driven and expression stages. It
visits audio scopes, precomp hosts and their actual property dependencies instead of
rendering the picture tree per sample. Nested PCM continues through the last sample
of the scope; ordinary picture evaluation keeps its existing frameCount-1 clamp.
Audio cycle loops cover the full scope duration, including singleton scopes. Audio
pingpong reflects at the final 48 kHz sample, and finite audio loops end in silence.
The established picture loop/terminal-hold behavior stays unchanged.

Output samples must be nonnegative safe integers. Internal `scopeTimes` overrides
reject in this API; authored ordinary source remap remains supported. Protected
narration rejects baked `sampleTimes` on voice and ancestors, even when disabled, in
addition to the previously prohibited source-clock changes. The evaluator is version 55. Continuous clock/dependency correctness, PCM decode/mix,
waveforms, preview and matching-audio delivery are verified; passage mixing is verified.

`prepareCompositionAudioSource` verifies the actual single mono/stereo source stream
and decodes interleaved 48 kHz Float32 PCM to disk. The descriptor count names actual
decoded samples, including resampling from supported 8–384 kHz sources. Decoded sample
ordinal zero is the source clock; embedded video audio requires its own audio asset.
Source SHA verifies before/after preparation. The key includes actual stream provenance,
decoded format/count/channels, decoder version and the full FFmpeg version identity;
physical relocation and asset ID do not change it.

The decoder checks every finite sample, count and hash while streaming. It reserves
256 KiB plus 4 bytes of Node PCM working buffers before allocation and records their
peak separately from FFmpeg process RSS and non-PCM metadata. `audioWorkingBytes` can
reject that reservation; configured duration and cumulative cache bytes also apply.
Mono sources retain one channel in cache; stereo retains two. Duplication occurs later
in the mixer. Under/overruns and nonfinite samples reject without publishing.

Picture and audio cache entries share one lock and cumulative disk accounting. Private
stages publish atomically; cancellation kills/reaps the active decoder before cleanup.
Every hit revalidates the original hash, manifest and finite cached PCM/hash/count.
Actual PCM preparation is verified. Bounded mixing, source/processed waveforms, native
Whole-passage integration is verified; final CE13 acceptance remains pending.

`prepareCompositionAudio` prepares the complete 48 kHz stereo Float32 WAV master and
the immutable `composition-prepared-audio-1` capture. Whole-document validation runs
before source decoding, including protected narration. Mono duplicates to stereo;
stereo retains its channels. Source sampling uses Q16 linear interpolation within the
authorized trim. Shared keys/drivers/expressions determine normalized gain/pan at every
output sample. Fades multiply in the local clip clock: linear or quarter-sine
equal-power. CE16 centre-unity/constant-power pan and Float32 product/sum order apply.
The final mix is not normalized; actual peak dBFS and frames above full scale are reported.

Source PCM pages use fixed 4,096-sample buffers and reuse them on LRU eviction, with
at most 32 open source handles. Output streams in bounded blocks. The PCM reservation
also covers source verification buffers and PCM-derived waveform arrays/copies.
Source, processed-per-instance and mix waveforms come from actual samples, with at
most 1,024 peak bins per waveform and 131,072 total. Source bins follow the decoded
source clock; processed/mix bins follow the complete output clock. Disabled processed
waveforms are silent. The configured working limit rejects before mix allocation.

Audio loop arithmetic now uses the shared Q16 PCM clock. Finite singleton pingpong
ends on its exact terminal sample at 24/25/30/50/60 fps (evaluator 53); picture loop
behavior remains unchanged. Mix keys pin the actual evaluator, mixer/decoder versions,
source PCM/FFmpeg identities and authored mapping, excluding physical source paths.
The mixed WAV shares cumulative cache locking/reservation and atomic publication with
picture/source PCM. Hits reverify its full header/count/finite PCM/hash; originals and
source PCM reverify after mixing to reject races. Cancellation removes new output.

Both CE16 gain/pan/linear and equal-power fade reference WAVs match byte-for-byte.
The actual 96,000-sample bounded test uses 491,578 / 524,288 PCM working bytes, with 24
page loads and 16 reusable evictions. Full native mixing and waveform metadata are
verified, including loader/preview/mux and waveform presentation. Passage audio remains pending.

`readCompositionSource` and `loadComposition` accept actual audio assets and attach
`preparedAudio` to the inspected source/export scene. Original audio paths remain in
`mediaSourcePaths`; `assetPaths["__audio:mix"]` names the verified complete WAV master.
Trusted draft capture retains original bindings on disk and revalidates their hashes.
The shared capture now pins canonical authored mapping and evaluator identity;
changing gain or a source clock requires a new capture. Canonical mapping ignores
physical paths and object field order while retaining authored array order.

`exportScene` accepts a verified `audioInput` and requires it for a composition with
native audio. It verifies the captured mapping, evaluator, complete sample clock,
canonical header, finite PCM and SHA before encoding and again after encoding. AAC
is muxed inside the existing atomic MP4/scene/result transaction. Native AAC uses
48 kHz stereo at 192 kbps and a 48 kHz movie timebase/edit list, so the track duration
retains the exact authored sample count. The absent-audio argument path is unchanged.
Export metrics include master SHA/count and the delivery codec. Current versions are
audio mixer 2, export worker 0.6.7 and evaluator 53; audio decoder remains 1.

Actual WAV and explicitly declared embedded audio alongside video/sequence + animated
still/lower third now pass Canvas/WebGL delivery. All 12,000 master samples/channel,
including the final sample, match source bits. Twelve production MP4s match repeat,
independent preview and raw/PNG encodes; independent decoded AAC samples also match.
Actual post-mux cancellation or validation failure leaves no output/sidecar/stage.
Whole-passage mixing is verified; complete final CE13 acceptance remains pending.

Lab and CLI previews fetch only registered captured masters and validate their complete
clock, mapping/evaluator, canonical header, finite PCM and SHA. Float32 samples transfer
directly into a verified 48 kHz stereo AudioBuffer; browser codec decode/resampling is
not an authority. One pure WAV header is shared by capture, export and preview.

The browser budget counts active planar buffers and in-flight candidate reservations.
Before fetch, each candidate reserves three master byte lengths plus a fixed 64 KiB
BYOB page: encoded bytes, a conservative full checksum copy, planar PCM and canonical
header. After verification only the planar buffer remains owned. PCM transfer yields
periodically; cancellation, failed candidates and disposal release their reservations.
This records application-owned PCM, separately from browser/DSP process memory.

CE16 passage rendered masters and native previews use the same integer-sample boundary
scheduler. AudioContext time advances pictures; the final picture remains visible for
its entire final audio interval. Pause, seek, replacement, invalidation, export locking
and page lifecycle stop sound. A late resume cannot restart a replaced preview.

Source lanes show original PCM time; processed lanes and the complete mix use output
composition time, with actual peak/headroom/full-scale counts and a picture cursor.
Gain/pan keys use the existing inspector lanes, curves, history and trusted draft
preparation. Edits require a new master; save reloads its returned source revision.

Actual 96,000-sample stereo AudioBuffers preserve all source bits. Offline playback
from frame six preserves the remaining samples through the distinct final values.
Real picture/audio time stays within one frame across two seconds and playback keeps
the complete final interval. Gain/pan/waveform edit/undo/redo/save/reload, byte-identical
draft exports, both registered APIs and changed-source stop/restoration pass.

Native passage reference loading keeps original audio/video paths and sequence
pattern/manifest bindings separately from captured browser PNG/WAV resources. Static
image/font bindings still use their resolved original paths. An optional authorizer
checks each sequence manifest and every actual numbered original PNG before media
preparation; it receives real files rather than a nonexistent pattern filename.
Private-cache and AbortSignal options propagate through this loader.

Numbered PNG decoding and authorization share the contract's bounded `%01d`…`%099d`
padding rules. Two-digit widths such as `%010d` now decode and trigger CLI original
source watching correctly. The source-frame ordinal and pixel/sample laws remain
unchanged. Native whole-passage audio assembly is verified.

Passage exports prepare all native originals and complete beat masters before selecting
a picture range. Masters mix at compiled 48 kHz sample placements, in authored beat
order, including outgoing handoff tails. Float32 addition precedes one common master
gain. The selected canonical WAV copies exact samples from the complete master; source
fades and authorized trims do not restart at a range boundary. The disk mixer reserves
327,684 PCM bytes, uses two 4096-sample pages and at most 32 open source handles. Its
complete root clock is bounded to 3600 seconds before preparation. This reservation
excludes decoder process RSS, non-PCM metadata and earlier native beat preparation.

Every reachable native narration instance must preserve the contract's complete source
clock/visibility law. When the passage has a narration authority, the source SHA and
source sample interval must match its global sample placement. The native interval
replaces exactly that portion of the global narration, including authored muted voice;
the global voice continues elsewhere. Authored overlapping native instances still add
in their authored order. Validation and original-byte checks include beats outside a
selected picture range. Final verification checks captured masters without allocating
or rerendering their complete samples.

A saved CE16 project receives separate complete native narration/non-narration masters
through a private validated project. Native narration joins the saved narration track
before its gain, mute/solo, filters and ducking; its own native envelopes remain baked
into the stem. Global clip fades/automation remain on the remaining global voice. The
native non-narration stem enters a separate master-routed track. Saved master gain and
lookahead limiter process the complete project before cropping. Original saved JSON,
revision, source hashes and existing project track/clip/resource limits remain binding.
Default native audio export requires no optional DawDreamer/Python backend.

Native beat AAC is verified for picture caching, but passage audio comes from verified
PCM masters. Final and delivery AAC use 48 kHz stereo, a 48 kHz movie timescale and edit
lists with exact selected track counts. Delivery encodes original selected PCM rather
than decoding the passage's AAC again. Native cache2 uses content/source clock identity
without physical sequence patterns, manifests or first filenames; complete FFmpeg and
ffprobe build descriptions plus preparation/assembly helpers invalidate stale reuse.
All originals/captures are rechecked before publication, and failure/cancellation leaves
no passage product or private complete/range/assembly artifact. The existing no-native
encoder arguments, renderer/evaluator/mixer laws and frozen visuals remain unchanged.

Preview decoder policy: CE13 uses the same content-verified canonical FFmpeg PNG
frames as export, with bounded asynchronous browser bitmap readiness. WebCodecs is
not adopted for preview in this milestone: a separate browser decoder has no verified
source-ordinal, color, alpha and seek-history parity proof in this implementation.
This records the pipeline decision and makes no claim about universal browser support.
The combined authoring proof checks actual numbered source frames against an independent
linear reverse-remap calculation on both backends; production exports retain exact
source mapping and PCM/AAC reference checks. Browser audio-clock scheduling uses its
existing one-frame presentation allowance while displayed source mapping is exact.

Node export verification reads the pure evaluator identity and diagnostic module without
loading browser renderer implementations. The Lab config imports only the composition
source/media/audio preparation modules. This keeps native Node22 strip-only config
loading valid; PCM inspection uses ordinary fields and retains its sample/buffer laws.

Still-only previews retain synchronous seek presentation: `prepareFrame` returns void
when no native media needs preparation. Native video/sequence previews return their
loading promise and retain coverage, stale-seek and failed-frame guards. Callers may
`await` either result, or present immediately when readiness is void.
