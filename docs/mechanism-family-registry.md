# Mechanism family discovery

`inspectMechanismFamilyRegistry()` discovers the tape-hook, cable-tie and clothespeg
candidates from their actual generator schemas and immutable asset metadata.
`mechanismFamilySchemas` is shared by CLI schema export and generated JSON Schemas.
Discovery does not promote a candidate to a supported pack.

```ts
import { inspectMechanismFamilyRegistry } from "@still-shift/animation-engine";
const registry = inspectMechanismFamilyRegistry({
  schemaVersion: "mechanism-family-registry-1",
  family: "clothespeg", // or "all", "tape-hook", "cable-tie"
});
```

Each entry supplies its exact pack reference, parameter ranges/defaults/units and
help, strict generator input/parameter schema names, a minimal default example,
control IDs/types and complete asset metadata. That metadata includes illustrative
factual variant and evidence, dimensions, bounds, parts, mesh identities/counts,
material slots, anchors, relationships, teaching shapes, camera targets, diagnostic
views, thumbnail recipe and compatibility. It contains no mesh buffers. The
registry validates the parameter schema digest against the immutable pack receipt;
entries are frozen. The exported `TapeHookPackInputSchema`,
`CableTiePackInputSchema` and `ClothespegPackInputSchema` are the same schemas used
by their generators. Their `expectedPack` references retain existing strict
revision/variant/detail checks.

```sh
pnpm still-shift episode discover
pnpm still-shift episode discover --family all --report /tmp/families.json
pnpm still-shift episode discover --family clothespeg --offset 1 --limit 1
pnpm still-shift episode schema --kind clothespeg-input --output /tmp/peg.schema.json
pnpm still-shift episode schema --kind narrated-cycle --output /tmp/cues.schema.json
```

Default discovery lists family/schema references alongside existing commands and
native route limits. Family selection additionally returns parameter help, controls
and small examples, with an always-retained complete registry report containing
all metadata. Existing response limits remain 32 KiB/100 combined items; pagination
keeps deterministic row order and access to the full report. A supplied report
path must be fresh. Unknown families and registry protocol versions are rejected
with located runtime schema diagnostics. Exported JSON Schemas are structural;
runtime validation also enforces cross references, identities and aggregate budgets.

Expanded schema kinds include the three family input and parameter schemas, pack
metadata, timeline, narration cues, primitives, rigs, teaching shapes, scene2/3,
frame2, solid geometry2, native frame3 and prepared-native3d3. Generated documents
are in `docs/schemas/mechanism/`. This registry adds discovery/schema authoring;
revision-aware saved family/cue editing, complete rendered label QA, supported-pack
promotion and production acceptance remain separate work.
