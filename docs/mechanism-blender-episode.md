# Native Blender narrated episodes

This candidate MS3 Node API builds an episode from an existing saved native asset
and the whole selected recording. It is available in this checkout, outside the
published 0.1.1 production pin. The editable object, drivers, deformation and
material graphs remain in Blender; Still Shift receives verified PNG sequences,
native text and audio. No source model is rebuilt or saved by this producer.

`BlenderEpisodeSourceSchema` binds a native asset's file bytes/hash, collection,
design variant, bounded custom-property controller and evidence files. The current
resource policy is `embedded-only`: the worker rejects linked libraries and
unpacked image/font resources before rendering. `readBlenderEpisode` discovers
and hashes source/plan/asset/font/audio/evidence dependencies relative to the
canonical manifest directory, including external resources.

`BlenderEpisodePlanSchema` declares dimensions/FPS/samples, the whole narration,
its original sample clock, pinned font, source-frame/control tracks, a complete
shot partition and ordered exact-copy speech windows. Every declared native
control has one absolute track. Keys start at zero; hold, linear and smoothstep
sampling is independent of seek history. Each shot selects a saved native camera
and optional explicit cutaway hides. Camera projection metadata and evaluated
surface/matrix/bounds accompany the captured frames. Visibility drivers are
restored before each absolute state. Optional `shownParts` and `hiddenParts` contain
at most128 distinct, disjoint source collection members together. Overrides apply
only to the requested frame; a render flag does not prove visible contact.

A shot may supply `framing`: `orthoScale` (0.0001–10,000) for an orthographic camera
or `lensMillimeters` (1–2,000) for a perspective camera, plus optional `shiftX` and
`shiftY` (−10–10). Values are finite and at least one is required. Original camera
transforms remain. Shared projection data resets before each source state; animated
projection data and mismatched zoom modes reject before the first render. Framing
and sorted visibility overrides enter native state keys; replay compares actual
projection values and declared part render flags. Expanded member/camera strings
are admitted before frame sampling. The actual worker regression is
`tests/fixtures/blender-shot-regression.py`; run it with Blender's
`--background --python-exit-code 1 --python` options.

Native controller drivers and unrelated source-clock channels remain active. Only
keyed channels for declared public inputs are muted in private copies of their
active/NLA action slots; shared source actions stay intact for other objects.
Declaring a driven property as a public input fails before rendering. The native
regression is `tests/fixtures/blender-driver-regression.py`, run with Blender's
`--background --python-exit-code 1 --python` options. It checks actual graph values
across forward, repeated and backward states without rendering.

Narration's asset count describes the existing renderer's actual 48kHz decoded
PCM. The source clock separately retains the original rate/count, checked against
FFprobe. Their durations must agree; this route contains no narration speed,
pause or duration-fitting controls. Captions use the shared safe-area layout,
native editable body text and source/audio-bound speech metadata. The natural
partial final video frame does not lengthen the source recording.

```ts
import { writeFile } from "node:fs/promises";
import {
  createBlenderProductionExecutor,
  runMechanismProductionQueue,
  readMechanismProductionReports,
} from "@still-shift/animation-engine";

const executor = await createBlenderProductionExecutor({
  blenderExecutable: "/Applications/Blender.app/Contents/MacOS/Blender",
});
const directory = "/absolute/episode";
const queue = await executor.createQueue(
  "native-pilot",
  [
    {
      id: "EU-004",
      question: "How does a zipper join its teeth?",
      familyPath: "source.json",
      cuePath: "plan.json",
    },
  ],
  directory,
);
await writeFile(directory + "/queue.json", JSON.stringify(queue));
await runMechanismProductionQueue(
  directory + "/queue.json",
  directory + "/output",
  executor,
);
const reports = await readMechanismProductionReports(
  directory + "/queue.json",
  directory + "/output",
  executor,
);
```

The executor uses explicit queue/product/report version2. Its producer profile
pins the actual Blender executable/version/build, frozen worker and receiving
runtime profile. Per-state keys include the native source, declared controls,
source time, camera/cutaway and capture settings. Matching sealed captures verify
all original file pins and actual controls/camera before reuse. Repeated holds
reuse one native state; caption/font changes reuse clean frames. Camera/control
changes invalidate affected states. Output PNG copies are independent from cache
files. Sealed producer/submission receipts retain original render counters;
changed/corrupt cache records retain rejection diagnostics.

Export writes a saved native composition and fully decodes its video/audio.
Verification reopens the captured origins, current mapping, composition and
encoded output without another Blender render. Technical QA binds current
input/output/code/profile/clocks. Passing sampled numeric rules leaves whole-mechanism review unreviewed. A failed
registered rule marks mechanical QA failed and retains the original frame, rig,
parts, relationship, measurement and range. Sampled-visual QA now reports measured frame/glyph findings. Factual, continuous
and listening reviews remain unreviewed. Source changes require exact-CAS queue revisions; historical products
keep their original identities. The production CLI now routes queue/run/report to this backend from explicit
creation selection and pinned manifest versions. An optional pinned `qaPath` now selects `BlenderProductionQAPlanSchema`. It declares
named observation selectors and bounded interval programs using the existing
semantic registrations. Units are `control-value`, `matrix-component`, `boolean`
or `native-unit`; source-library units carry no inferred meter calibration.
Selectors use actual Bpy controls, row-major matrices, evaluated bounds, render
flags and surface hashes. Signed AABB separation is a bounds measurement and does
not establish surface contact or collision; a render flag does not prove visibility.

QA authenticates original native state receipts before replay. It writes bound
`qa-program.json`, `qa-warnings.json`, `qa-warning-groups.json` and `qa-facts.json`.
All numeric samples and located findings remain accessible. Consecutive failure
runs retain their actual peak frame and image; grouped warnings retain raw peak
ownership. Report verification recomputes these artifacts against the current
inputs/export without another Blender render. Comparison and retained-data limits
apply before reads/execution and serialization. Native review evidence and handoff
remain pending.

Limits are1MiB per source/plan,2,000 output frames,128 shots,256 speech cues,
256 keys per track,64 controls,4,096px per dimension and8,388,608 pixels. Sampling
also has a prospective expanded-track budget. Bounded adapters contend within
the caller's Node allowance; Blender has separate host resource use. The current
receiving proof is a saved composition in its owning folder; relocated/isolated
content needs its own verification.

The [source-bound evidence](./mechanism-shorts-ms3-blender-episode-results.json)
retains the actual full Alden zipper engineering draft, cache/font/caption repairs
and failed checks. Its320×568 draft supplies no1080×1920 production, whole glyph,
mechanical/contact, factual, continuous-motion or listening acceptance. Current
pilot admission remains0/10. [All ten HD plans and phone scouts](./mechanism-shorts-ms3-first-ten-scout-results.json)
now exist; framing/contact staging, whole products/reviews and final gates remain.
Current producer changes invalidate prior producer-bound captures; historical
products keep their original binding.

## Production CLI

Use the same strict `mechanism-production-projects-1` declaration with native
`source.json` and `plan.json` paths. Creation defaults to the Three.js adapter;
select Blender explicitly for a new native queue. The host executable is required
for Blender creation, execution and reporting. Run/report select the backend from
the manifest; an optional `--backend` must agree with that version. Retry grants a
bounded exact-CAS batch without constructing either producer.

```sh
pnpm still-shift production queue --projects projects.json --manifest queue.json --backend blender-native --blender-executable /Applications/Blender.app/Contents/MacOS/Blender
pnpm still-shift production run --manifest queue.json --output-dir output --blender-executable /Applications/Blender.app/Contents/MacOS/Blender
pnpm still-shift production report --manifest queue.json --output-dir output --blender-executable /Applications/Blender.app/Contents/MacOS/Blender --report fresh-report.json
```

`production discover` exposes both candidate backends and their actual limits.
`production schema --kind blender-episode-source` and the other `blender-*`
selectors emit the same strict source/plan/capture/map/queue/product/report
contracts used by the runtime. These declarations establish technical routing;
they supply no supported-pack, whole-review or pilot qualification. Native
handoff generation remains pending and returns a missing-artifact exception.

Every native product now runs rendered QA with all output frames, actual cached-
sequence preview pixels and measured glyph bounds. The pinned source plan supplies
caption copy, audio/sample intervals and native shot cuts independently of the saved
text being checked. Source-copy/audio mismatches keep the affected cue/frame range
while layout measurement continues with valid speech declarations. The evaluator
retains `qa-rendered-visual.json`, grouped warnings and exact RGBA PNGs decoded from
the bound output at warning endpoints. Fresh verification repeats rendered analysis
and checks saved PNG pixels against that video without another Blender render.
Optional numeric facts link the visual report; products without a numeric plan
expose it directly as report quality evidence.

Rendered QA is admitted before native capture: at most 100,000 layer-frames and
256 MiB of prospective quality capacity. Reports are bounded to 8 MiB, 2,048 warning
rows and 512 endpoint images. Measured sampled-visual status does not establish
all-frame encoded-glyph, factual, mechanical, continuous or listening acceptance.
Full phone overviews, shot/contact crops, audio review and native handoff integration
remain separate work.

[Current native framing proof](./mechanism-shorts-ms3-native-framing-results.json)
retains all ten 59-shot/177-state HD scouts and scoped camera repairs. Causal
labels/highlights and resolved holds still need implementation/review before the
whole products. Same-material cut faces can remain unclear despite correct source
geometry, camera projection and render flags; those numeric checks do not approve
physical contact or pixel readability.
