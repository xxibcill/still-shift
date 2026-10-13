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
restored before each absolute state; explicit hides override only that frame.

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
parts, relationship, measurement and range. The other review dimensions remain
unreviewed. Source changes require exact-CAS queue revisions; historical products
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
pilot admission remains0/10; the other nine episode plans and final gates remain.

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
