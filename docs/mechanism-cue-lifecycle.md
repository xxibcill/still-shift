# Revision-bound cue compilation, rendering and checking

Saved family and cue authoring documents can now drive the normal native composition
export. `compileMechanismCueProject` (also CLI `prepare`) validates the current
family, source-pinned cue and actual font/audio/native assets before writing a fresh
composition snapshot. `cue-compilation.json` records both authoring revisions and
canonical project hashes, the exact composition bytes, dimensions, fps and frame count.
Relative assets are resolved against the cue document's directory.

```sh
pnpm still-shift episode compile --authoring cue --family-input /tmp/project/family.json --input /tmp/project/cues.json --output-dir /tmp/project/compiled-0
pnpm still-shift episode render --authoring cue --family-input /tmp/project/family.json --input /tmp/project/cues.json --prepared-dir /tmp/project/compiled-0 --output-dir /tmp/project/render-0
pnpm still-shift episode check --authoring cue --family-input /tmp/project/family.json --input /tmp/project/cues.json --prepared-dir /tmp/project/compiled-0 --final-output /tmp/project/render-0/output.mp4
pnpm still-shift episode schema --kind cue-compilation --output /tmp/cue-compilation.schema.json
```

The public APIs use these same arguments: family path, cue path, then prepared/output
directories (and output path for checking). Each accepts an optional AbortSignal.
`readMechanismCueCompilation` checks revisions and hashes, exact snapshot bytes,
freshly compiled semantics, dimensions and timing. A family revision change invalidates
a snapshot even when it generates identical geometry. A family geometry change also
requires updating the cue's native source asset/pin through the authoring workflow.
A changed cue requires fresh compilation. Existing snapshot/render directories are
never replaced. Failures after directory creation retain incomplete artifacts; the
completion receipt is written last. This is not crash-atomic directory publication.

Rendering reloads the snapshot through normal composition loading, revalidates media,
uses WebGL2/raw RGBA native export, and rechecks authoring/snapshot dependencies before
publication. The returned wrapper identifies both revisions and `whole-cycle` rerender
scope. Normal `output.mp4.result.json` keeps `composition-result-1` compatibility.
Patch invalidation reports identify affected cues, but this lifecycle conservatively
rerenders the entire cycle. The CLI rejects alternate routes/backends and `--cache-dir`
on this route. Complete reports and existing 32 KiB/100-item response limits remain.

Checking verifies the current preparation, normal export sidecar, actual encoded file
SHA-256, and ffprobe dimensions, frame count and fps. It reloads actual media and
independently replays every final native observation against the current source binding.
It then rechecks preparation and output identity. Encoded file hashing uses a regular
nonblocking descriptor, a fixed 64 KiB scratch buffer and size/timestamp stability checks.
This does not lock externally mutable files throughout the workflow, provide complete
whole-process resource accounting, or prove encoded pixels from observation metadata.

The three-family engineering fixture uses local synthetic PCM. Repeated complete
exports and decoded video/audio comparisons, stale revision rejection and altered
encoded-file rejection exercise this lifecycle. Genuine spoken inputs, rendered label
layout/readability/typography, listening, supported-pack promotion, production pilot,
remaining resource/lifetime gates and final installed-package verification remain
separate requirements. See [cue authoring](./mechanism-cue-authoring.md) and the
[lifecycle evidence](./mechanism-shorts-ms2-cue-lifecycle-results.json).
