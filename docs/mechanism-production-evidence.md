# Production review evidence and fresh-session handoff

Native queue products generate review artifacts from the actual encoded final
video. The evidence manifest binds the output, inputs, runtime code/profile and
compiled source revision. Sample choices use the cue compiler's exact output
clock: each shot's entry/mid/exit, before/at/after semantic events, and both sides
of declared cuts. Duplicate frames keep every role and are extracted once.

Full-frame RGBA8 PNG samples must decode exactly like the corresponding final
video frames. Each shot also receives a360×640 phone overview preserving the
source aspect ratio, a caption-region crop, and an anchor-detail crop when actual
native projections are in frame. Projections come from the fully rechecked
original native capture; their visibility and occlusion states remain explicit.
Missing/not-drawn/outside projections produce a located crop exception. A crop
supplies no proof that a hidden contact is visible in the final overlays.

The verifier rederives sample clocks, native projections and each transformation
from current source artifacts. Declared image/pixel hashes alone cannot authorize
an unrelated phone or crop image. Nested file bytes, PNG shapes/decoded pixels,
source-frame mapping and full PCM identity are checked. Final audio is provided
as unmodified48kHz float32 PCM WAV, retaining the final decoder's channels and
samples, including permitted encoder padding. No normalization or retiming occurs.

The manifest links complete full-decode/audio reports and all images. Limits are
512 unique sample frames,1024 images,4MiB manifest JSON and32MiB declared retained
capacity. Cue JSON retains the existing32MiB source bound. WAV bytes must fit the
existing512MiB produced-file bound. Child process output is capped at256KiB and
child calls have a10-minute deadline; cancellation settles after child/pipe close.
These are declared bounds, with no physical RSS or driver-memory certification.

A compact generation handoff contains the exact family/cue revision and canonical
project hash, current output binding, queue/source locations, video/audio/manifest/
decode references and review counts. It is a snapshot, and cannot claim reviewed
readiness. A fresh process rechecks it through the existing report/native verifier:

```sh
pnpm still-shift production handoff \
  --manifest /absolute/path/queue.json \
  --output-dir /absolute/path/queue-output \
  --episode E01 \
  --report /absolute/path/fresh-handoff.json
```

The command requires a current verified selected product and emits a fresh
`mechanism-production-handoff-1` file with current effective QA statuses. The full
handoff stays within32,768 bytes. Use its recorded source revision/project hash
for a scoped cue patch, and retain current-artifact review gaps. The generated
[capability reference](./mechanism-production-capabilities.md) and discovery use
these same limits and the published evidence/handoff schemas.

The first retained-output scope checks81 derived images across the three existing
engineering families and rejects stale cue metadata and altered phone pixels even
with recomputed declarations. This scope retains the original eec1954a render
identity. Fresh integrated native/CLI handoff and complete local tiers remain
separate required proofs. Image generation/decode does not establish whole glyph,
mechanical, continuous-motion, listening, factual, human or ten-episode pilot
acceptance.
