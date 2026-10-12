# Native plates for current cue projects

Capture the native picture once, then recompile the current cues to reuse those
plates after screen-label, caption or sound edits. This workflow accepts current
native2 cue compositions with one flat physical controller and admitted world
artwork. Family support and production acceptance are tracked separately. The installed
API entry is `still-shift/engine`; workspace callers use
`@still-shift/animation-engine`.

```ts
import {
  compileMechanismCueProject,
  prepareMechanismCueNativePlates,
  checkMechanismCueNativePlates,
  renderMechanismCuePlateProject,
  checkMechanismCuePlateOutput,
} from "still-shift/engine";
const family = "/project/family.json",
  cues = "/project/cues.json";
const compiled = "/project/compiled",
  plates = "/project/native-plates";
await compileMechanismCueProject(family, cues, compiled);
await prepareMechanismCueNativePlates(family, cues, compiled, plates);
await checkMechanismCueNativePlates(family, cues, compiled, plates);
const rendered = await renderMechanismCuePlateProject(
  family,
  cues,
  compiled,
  plates,
  "/project/output",
);
await checkMechanismCuePlateOutput(
  family,
  cues,
  compiled,
  plates,
  rendered.outputPath,
);
```

Every destination must be fresh. Keep the capture directory intact: its receipt
refers to retained source snapshots, copied dependencies, original native
observations and the complete PNG16 sequence. The checker verifies their actual
bytes and replays the original evidence. Changes to those files reject the cache.
These methods accept an optional `{ signal }`; cancellation keeps the original
abort reason and removes failed owned output. Whole descendant/resource/lifetime
acceptance remains a separate gate.

After a [source-pinned cue edit](./mechanism-cue-authoring.md), compile into a fresh
directory and pass that new compilation with the original plate directory.

| Change                                                                                       | Required work                                                                    |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Screen-label text, position or style; caption; effect gain                                   | Recompile current cues and recheck bindings/media, then reuse compatible plates. |
| Camera, physical rig/geometry/material/mount, world text or surface mark, picture clock/size | Capture a fresh native picture for the new compilation.                          |

The native-picture fingerprint excludes ordinary screen/audio work only after
actual dependencies are verified. Current revision/source checks run before output
publication and again during final verification. An old compilation or old cached
video rejects after a cue edit, even when the native picture remains reusable.

```sh
pnpm still-shift episode compile --authoring cue --family-input /project/family.json --input /project/cues.json --output-dir /project/compiled
pnpm still-shift episode prepare --authoring cue --family-input /project/family.json --input /project/cues.json --prepared-dir /project/compiled --plates-dir /project/native-plates
pnpm still-shift episode check --authoring cue --family-input /project/family.json --input /project/cues.json --prepared-dir /project/compiled --plates-dir /project/native-plates
pnpm still-shift episode render --authoring cue --family-input /project/family.json --input /project/cues.json --prepared-dir /project/compiled --plates-dir /project/native-plates --output-dir /project/output
pnpm still-shift episode check --authoring cue --family-input /project/family.json --input /project/cues.json --prepared-dir /project/compiled --plates-dir /project/native-plates --final-output /project/output/output.mp4
```

On cue `prepare`, `--plates-dir` selects capture from `--prepared-dir`. Omit
`--output-dir` on that form. Cue `prepare` without these flags retains ordinary
compilation. On `check`, adding `--final-output` selects cached-video verification;
without it, the checker verifies current compatibility and original plates.
`--plates-dir` requires `--authoring cue`; this route uses WebGL2 and one worker.
The CLI preserves its existing 32KiB/100-item receipt limits and complete reports.

The public package exports the strict `MechanismCueNativePlatesSchema` and
`MechanismCuePlateExportSchema`, their inferred TypeScript types, named option
types, and `MECHANISM_CUE_NATIVE_PLATES_VERSION`/`MECHANISM_CUE_PLATE_EXPORT_VERSION`.
The wire versions are `mechanism-cue-native-plates-1` and
`mechanism-cue-plate-export-1`; generated schemas are available through `episode
schema --kind cue-native-plates` and `--kind cue-plate-export`.

Cached export lowers integer-grid screen bindings into the ordinary shared
composition path with the existing 2,000-key bound. Its separate receipt pins the
current compilation/source, lowered composition, original plate receipt/sequence,
actual scene/result and final video. Verification requires real worker delivery
and submission measurements. `freshNativeSubmissionCalls` is measured zero;
`originalNativeFrames`/`originalNativePasses` identify the retained capture.
Original observations are preserved as original evidence. Submission counters and
wall times describe synchronous work and do not measure GPU execution time.

Existing 32MiB source/512MiB Node bounds remain unchanged. Arbitrary nested native
controllers, imported source3 pictures, modified local clocks on bound overlays,
whole application/RSS/resource admission, encoded glyph/readability and human
visual/listening/pilot acceptance remain outside this scoped cache contract.
