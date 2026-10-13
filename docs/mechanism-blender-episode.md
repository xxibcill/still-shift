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
input/output/code/profile/clocks. The remaining five review dimensions stay
unreviewed. Source changes require exact-CAS queue revisions; historical products
keep their original identities. The existing production CLI still selects the
Three.js executor; Blender command routing and native QA-plan/handoff integration
remain pending. `qaPath` declarations are rejected by this candidate factory.

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
