# Revision-aware family authoring

A `mechanism-family-authoring-1` document stores a stable project ID, revision,
immutable pack reference, family and generator inputs. It contains authoring data;
regenerated meshes are returned by inspection separately. Inputs use the actual
family generator schemas exposed by the registry.

```ts
import {
  createMechanismFamilyAuthoring,
  saveMechanismFamilyAuthoring,
  readMechanismFamilyAuthoring,
  patchMechanismFamilyAuthoring,
} from "@still-shift/animation-engine";

const initial = createMechanismFamilyAuthoring("tape-hook", "demo");
await saveMechanismFamilyAuthoring(initial.document, "/tmp/demo/family.json");
const current = await readMechanismFamilyAuthoring("/tmp/demo/family.json");
await patchMechanismFamilyAuthoring("/tmp/demo/family.json", {
  schemaVersion: "mechanism-family-patch-1",
  baseRevision: current.document.revision,
  baseHash: current.projectHash,
  operations: [{ property: "parameter", id: "hookThickness", value: 0.24 }],
});
```

Patches target named parameters or the whole mount/style. Parameter names must
exist in the selected family. Final validation applies the real family input
schema and generator, including bounds, relationships and immutable pack revision.
Duplicate writers, unsupported versions, unknown targets, wrong-family styles,
out-of-range values and revision overflow fail before publication. A patch keeps
the document/project/pack identity and advances exactly one revision. Existing
32-operation/16 KiB patch limits apply.

`applyMechanismFamilyPatch` performs the same revision/hash checks and returns a
new frozen document without writing. `inspectMechanismFamilyAuthoring` regenerates
the pinned source and returns its exact source/mesh identities. A supplied
`input.expectedPack` must agree with the document's required pack reference.
Canonical document hashes are independent of JSON whitespace; parsed defaults are
part of that semantic identity.

Saved patches validate before entering the save operation, then reread/check the
current revision/hash under the existing artifact lock immediately before atomic
replacement. A fresh save uses no-clobber publication. Failed patches preserve the
existing file; concurrent callers either commit one writer or reject a competing
lock/stale base. Reopen the current project before retrying. A direct saved
replacement with a base also preserves project/pack identity and requires the next
revision. New directories are created for fresh saves.

```sh
pnpm still-shift episode inspect --authoring family --input /tmp/demo/family.json
pnpm still-shift episode patch --authoring family --input /tmp/demo/family.json --request /tmp/patch.json
pnpm still-shift episode summary --authoring family --input /tmp/demo/family.json
pnpm still-shift episode schema --kind family-patch --output /tmp/family-patch.schema.json
```

`save`, `validate` and `summary` also accept `--authoring family`. Family authoring
supports only inspect, validate, summary, save and patch; lifecycle commands reject
with a located `mechanism-authoring-command` diagnostic. Saving a copy to a
fresh location is supported because the family document has no media dependency
paths. Replacing an existing destination requires both `--base-revision` and
`--base-hash`, with the next revision in the input document. Responses retain
32 KiB/100-item bounds and a complete report; reports include changed paths,
affected component ID, previous/new generated source identities and cache effects.
Inspection does not put mesh arrays in its routine receipt or full authoring report.

Dimension edits regenerate geometry. Mount/material edits preserve local mesh
bytes while changing the generated scene. Dependent native plates and overlay
layout require refresh; the narration recording stays unchanged. The patch does
not silently rewrite any generated scene file, cue document, cached plate or
render. Regenerate the scene asset from the inspected instance, pin its actual file
hash in dependent compositions/cues, then compile/render/check them. Saved cue
editing uses the [cue authoring API](./mechanism-cue-authoring.md). Dependency-aware
affected-shot rendering remains subsequent work;
these transactions do not establish complete resource/lifetime accounting,
rendered label QA, supported packs, spoken narration or production acceptance.
