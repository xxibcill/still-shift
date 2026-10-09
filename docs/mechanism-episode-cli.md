# Mechanism episode interface

MS1 delivers the Three.js plate route. The authoritative source is the versioned
scene and episode JSON; plates, sidecars and native compositions are derived
artifacts. Native 3D composition is the next milestone, MS1N.

Use the versions in [toolchain.json](../toolchain.json), locked dependencies and
installed Chromium/FFmpeg. Repository commands use `pnpm still-shift episode`.
The installed package exposes the same interface as `still-shift episode`;
`still-shift setup browser` installs its pinned browser runtime. FFmpeg/FFprobe
remain system prerequisites. No GUI or episode-owned HTTP/FFmpeg script is needed.

## Start, inspect and export

Supply a pinned font, its license, the complete 48 kHz PCM master and caption JSON.
The E01 factory copies these inputs into a fresh project directory, declares their
SHA-256 identities and emits the nine-shot source. It preserves supplied narration
samples and caption timing. Its geometry is illustrative, including enlarged
thickness/travel views; it is not a manufacturing model.

```sh
pnpm still-shift episode discover
pnpm still-shift episode init-tape-hook --output-dir /tmp/e01-project \
  --font /path/plex-sans-semibold.ttf --font-license /path/plex-LICENSE.txt \
  --audio /path/mix-v001.wav --captions /path/captions.json
pnpm still-shift episode deps --input /tmp/e01-project/episode.json
pnpm still-shift episode inspect --input /tmp/e01-project/episode.json
pnpm still-shift episode preview --input /tmp/e01-project/episode.json \
  --frame 138 --output-dir /tmp/e01-preview
pnpm still-shift episode render --input /tmp/e01-project/episode.json \
  --output-dir /tmp/e01-render --cache-dir /tmp/e01-plates
pnpm still-shift episode check --input /tmp/e01-project/episode.json \
  --prepared-dir /tmp/e01-render/prepared \
  --final-output /tmp/e01-render/episode.mp4
```

`deps` lists missing, mismatched and unsupported inputs before render and makes no
source or package changes. Matching hashes still require a supported scene version
and geometry, actual font cut/glyph/axis coverage and supported PCM audio. `preview` captures one requested source frame with its actual
shot camera/control/visibility state. `prepare` and `compile` prepare every shot's
plates and emit a native `composition-1`. `render` exports that composition and
checks the final artifact. Choose fresh render/package/report destinations;
existing outputs are preserved. Preparation publication is serialized by an
artifact lock. Interrupted capture attempts retain failure receipts and produced
plates for diagnosis; incomplete attempts never become cache hits.

## Scoped repair and resume

`summary` emits revision, semantic project/geometry hashes, dependencies, shot
ranges and labels without raw mesh buffers. Save that receipt with the check
receipt and its complete report before handing work to another agent.

A patch uses stable shot/label IDs and the current revision/hash. Supported
properties are `text`, `position`, `fontSize` and `qualification`. Stale patches
fail without overwriting the source. Each accepted patch increments the revision
and reports changed paths, affected shots and cache effects. For example:

```json
{
  "schemaVersion": "mechanism-patch-1",
  "baseRevision": 0,
  "baseHash": "sha256:<current 64 hexadecimal digits>",
  "operations": [
    {
      "shot": "V8-05",
      "label": "label-travel",
      "property": "position",
      "value": [670, 690]
    }
  ]
}
```

```sh
pnpm still-shift episode summary --input /tmp/e01-project/episode.json
pnpm still-shift episode patch --input /tmp/e01-project/episode.json \
  --request /tmp/e01-patch.json
pnpm still-shift episode render --input /tmp/e01-project/episode.json \
  --output-dir /tmp/e01-repaired --cache-dir /tmp/e01-plates
```

Label-only edits invalidate native overlays while reusing all verified clean
plates. Receipts report actual `new3dRenders` and `cacheHits`; inspect the complete
render result to compare every PNG hash. The supported exporter currently writes
one complete final episode file per revision; affected shot declarations and plate
reuse do not imply partial MP4 splicing.

## Portable package

```sh
pnpm still-shift episode package --input /tmp/e01-project/episode.json \
  --prepared-dir /tmp/e01-render/prepared \
  --final-output /tmp/e01-render/episode.mp4 --output-dir /tmp/e01-delivery
```

The package enumerates copied source/dependencies, font/license, native
composition, sequence manifests, clean plates, sidecars, receipts and optional
final output with byte hashes. A final-output package requires its current prepared
source and the exporter’s adjacent `.result.json` and `.scene.json` receipts. It
rejects old revisions and swapped final bytes. Paths are rebased to the package; unchanged PNG and
sidecar byte identities survive relocation. Only declared artifacts are copied;
caches and failed attempts stay outside the delivery. Rewritten JSON checksums are
refreshed; `packageRelocation` retains the original source and scene hashes. Scene
cache paths without delivered files are omitted explicitly, while their hashes
remain provenance. Packaging stages a fresh
directory, verifies it, then publishes it atomically. A moved package can run
`deps`, `validate`, `save`, `patch`, `render` and `check` without the original source
folder or previous cache. Use `save --input <episode.json> --output <same-project/new.json>`
for another saved revision; use `package` to relocate dependencies across folders.

## Portable semantic reading context

Native `composition-1` review contracts can persist in `metadata.readingPolicy`.
The shared quality resolver uses that saved policy in API, CLI and Lab analysis;
explicit supplied policy settings override saved settings. Pixel measurement uses
that same resolved threshold. `readingDeclarations` keep designated complete
reading holds. `semanticAssociations` separately assess the complete presentation
interval, including entrances and copy changes; a later readable hold cannot erase
an earlier value shown without its declared unit or qualification.

A quantity association explicitly names exact value/unit members and any required
qualification. A phrase association names intact copy such as `Wi-Fi 6E` or
`USB-C 30W`. Context is authored; the analyzer does not infer numerical meaning,
units or factual truth from placement. For example, this is an illustrative review
contract for three existing native text layers:

```json
{
  "semanticProfile": "require-declared-context",
  "semanticAssociations": [
    {
      "id": "duration-context",
      "purpose": "Read the illustrative duration with its complete context",
      "kind": "quantity",
      "start": 0,
      "end": 90,
      "requiredKinds": ["qualification"],
      "members": [
        { "layer": "value", "text": "12", "kind": "value" },
        { "layer": "unit", "text": "months", "kind": "unit" },
        { "layer": "qual", "text": "Illustrative", "kind": "qualification" }
      ]
    }
  ]
}
```

Intervals use inclusive start/exclusive end. Diagnostics identify member paths and
inclusive failing frame ranges. Exact visible copy changes are faults even when
other frames remain readable. Whenever a value is readable, all declared context
members must be exact and concurrently readable; zero measured readable-value
frames cannot establish a pass. Normal fade entrances with later readable values
remain possible. Motion stability and duration still belong to reading declarations.

Reports always include `semantic.status`: legacy scenes without associations are
`unassessed`; the strict profile requires declarations. Reports retain the normalized
semantic policy/version, measured value-frame counts and fault intervals. This is
assessment of displayed logical copy and measured layer context. Counts use the
renderer's local clock and formatting. Distinct mixed/partial transitions and
positive correction artwork cannot certify an intact declared phrase; a span
replacement remains fragment evidence after its animation. Factual truth and rendered
glyph readability remain separate; masks, inline glyph opacity and contrast require
encoded review. Use full selection, zero stagger, an all-text anchor and no mask for
the inspected intact-phrase treatment; this does not establish finer Thai segmentation.

## Contracts, limits and interpretation

[Generated schemas](./schemas/mechanism/episode.schema.json) are available for
geometry, scene, episode, frame, sidecar, patch and receipt. `episode schema
--kind <kind> --output <fresh.json>` emits a complete editor schema. Runtime Zod
validation also checks cross-references, exact partitions, mesh normals/bounds,
rig ownership and numeric resource budgets; JSON Schema alone cannot establish
those relationships. `pnpm schema:check` checks all seven snapshots for drift.

Every command emits `mechanism-command-result-1` JSON. Receipts are at most 32 KiB
and 100 combined rows/artifacts. Use `--offset`, `--limit` (1–100), and the complete
report artifact when pagination or byte truncation occurs. Patches are at most
16 KiB and 32 operations. Failure receipts include sanitized stage/path/recovery
instructions and bounded causes, with complete diagnostics in their report.
Unsupported versions/backends fail explicitly. No credentials, stacks or full
environment dumps are needed for recovery.

The bridge supports indexed solid meshes, opaque/cutout PBR materials, seeded tape
and wood textures, room reflections, two shadow lights with maps up to 2048,
Y-up right-handed hierarchy transforms, perspective cameras and one tape-hook
slider family. Per capture: at most 4,096 frames, 8,388,608 pixels and 8 MiB of font
bytes. Scene limits are 128 parts, 100,000 vertices, 200,000 triangles, 64 anchors,
32 materials and eight rigs. Independent mechanical checks cover authored
hierarchy/control state, legal travel, selected contact faces, contact gaps and
stationary blade/rivets. General family imports and semantic transition/event-order
compilation belong to MS2.

Physical inner/outer faces can be hidden. E01's INSIDE/OUTSIDE proof labels use an
external datum line while retaining the separate hidden physical `proofTarget`.
The sidecar's actual scene raycast visibility never turns an occluded physical
face into a visible one. Protected regions currently cover visible proof-anchor
points within a 24-pixel radius; they do not protect complete object silhouettes.

Final checks use native measured text bounds and all-frame plate/sidecar hashes.
Declared reading intervals preserve role/qualification groups. Independent pixel
motion checks remain active. Reports keep raw measurements when an eligible
stationary reading hold is classified as purposeful. Software checks and sampled
images do not establish human continuous visual/listening acceptance; those review
statuses remain separate in the result.
