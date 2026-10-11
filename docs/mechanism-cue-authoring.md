# Source-pinned cue editing

`mechanism-cue-patch-1` edits an existing `mechanism-narrated-cycle-1` document using
its current revision and canonical hash. Stable targets are cue IDs, annotation IDs,
sound IDs and rig IDs. Supported properties are caption, cue window, semantic
kind/state/action minimum, camera/editing choice, annotation text/anchor/position,
effect gain and the existing rig control. There is no generic object-path setter.

```ts
import {
  readMechanismCueAuthoring,
  patchMechanismCueAuthoring,
} from "@still-shift/animation-engine";
// instance is the actual immutable family instance, from family authoring inspection.
const current = await readMechanismCueAuthoring(
  instance,
  "/tmp/project/cues.json",
);
await patchMechanismCueAuthoring(instance, "/tmp/project/cues.json", {
  schemaVersion: "mechanism-cue-patch-1",
  baseRevision: current.document.revision,
  baseHash: current.projectHash,
  operations: [{ cue: "contact", property: "caption", value: "Here" }],
});
```

Every edit recompiles the complete cue timeline with the existing recording bounds,
visible/source reading and action windows, property ownership, state/event order,
rig and relationship validators. Multiple writes to the same scoped property,
unknown targets, invalid values, unsupported versions, stale revision/hash and
revision overflow fail before writing. Patch limits remain 32 operations/16 KiB.
Annotation replacement preserves its existing ID. Editing timing or motion cannot
bypass the same semantic compiler used to author a cycle.

Pure `inspectMechanismCueAuthoring`/`applyMechanismCuePatch` take the caller's family
instance and validate authoring semantics. Saved `read`/`save`/`patch` additionally
read the cue's native source file, verify its exact raw SHA-256 and compare its
parsed scene identity with that instance. They reuse regular-descriptor bounded
source admission, the existing 32 MiB source ceiling and JSON expansion admission
before parsing under the unchanged 512 MiB source allowance. This scoped admission
is not complete process/resource/lifetime accounting. Byte backing and admission
leases are retired after the source check.

Saved edits validate, acquire the existing artifact lock, reread the current
revision/hash, verify the source and atomically replace the document. A fresh save
uses no-clobber publication. Saved replacement preserves project ID, native source,
font, narration metadata and output clock, and advances one revision. Reopen before
retrying a competing lock or stale write. This does not lock external media files
through subsequent rendering; normal loading must reverify their actual pinned
bytes. Font/audio decoding, glyph checks and production QA belong to that loading
and render/check path.

```sh
pnpm still-shift episode inspect --authoring cue --family-input /tmp/project/family.json --input /tmp/project/cues.json
pnpm still-shift episode patch --authoring cue --family-input /tmp/project/family.json --input /tmp/project/cues.json --request /tmp/cue.patch.json
pnpm still-shift episode summary --authoring cue --family-input /tmp/project/family.json --input /tmp/project/cues.json
pnpm still-shift episode schema --kind cue-patch --output /tmp/cue-patch.schema.json
```

`validate` and `save` also accept this authoring route. A CLI saved copy must stay in
the same project directory to preserve media path bases. `--family-input` names the
current pinned family authoring document. A family dimension/style/mount change
requires an updated source asset/cue pin; old source bytes fail against the changed
instance. This identifies a stale dependency without silently replacing assets.

Responses retain the 32 KiB/100-item budgets and complete-report access. The full
patch report includes the recompiled ordinary composition, changed paths,
affected cue IDs (`affectedShots`) and required cache effects. Caption/annotation/
effect edits locate their cues; timing, semantics, camera or rig edits conservatively
mark the whole cycle. Native picture/source reuse is distinguished from overlay
binding rechecks and supplied effect remix. Narration samples and clock are retained.
These are invalidation declarations; no rerender is claimed by patch success.
The [revision-bound lifecycle](./mechanism-cue-lifecycle.md) now compiles, renders
and checks current saved dependencies through normal native export. It rerenders
the whole cycle. Selective affected-shot reuse, final rendered label QA, genuine
spoken input, supported packs and production acceptance remain separate work.
