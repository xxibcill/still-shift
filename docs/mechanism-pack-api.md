# Reusable mechanism pack API

MS2 currently provides a **tape-hook candidate**. It has software evidence for
geometry, posed relationships and native rendering; it is not yet a supported
family or an accepted production episode. See the
[MS2 results](./mechanism-shorts-ms2-results.json) for retained failures and
[owning acceptance criteria](./mechanism-shorts-production-plan.md#ms2-reusable-mechanism-families-and-authoring)
for the remaining work.

## Inspect metadata and instantiate

These public Node APIs are exported from `@still-shift/animation-engine`:

```ts
import {
  inspectTapeHookPack,
  createTapeHookPack,
  evaluateTapeHookPackFrame,
} from "@still-shift/animation-engine";

const metadata = inspectTapeHookPack();
const instance = createTapeHookPack({
  parameters: { hookThickness: 0.26, bladeLength: 14, bladeWidth: 2.5 },
  style: { steelRoughness: 0.6, steelMetalness: 0.8 },
});
const expected = evaluateTapeHookPackFrame(
  instance,
  {
    frame: 0,
    width: 320,
    height: 180,
    rigControls: { slider: { type: "slider", value: 0.26 } },
  },
  "inside-push",
);
```

`inspectTapeHookPack()` returns a recursively frozen
`mechanism-pack-metadata-1` receipt with a canonical SHA-256 of its strict
`mechanism-pack-1` document. The receipt is bounded to 32 KiB and contains no
vertex, normal, index, UV or texture pixel arrays. It declares units, default
model bounds and their owning part, hierarchy, pivots, anchor/rig declarations,
material slots, parameter limits, factual variant/detail, neutral/diagnostic
views and rendering compatibility. Default geometry is generated once inside
inspection to derive truthful topology counts and bounds; only metadata is
returned. Inspection is not a claim that no geometry allocation occurred.

The six named targets are `recognition`, `approach`, `macro`, `comparison`,
`orbit` and `return`. They currently declare intent and a part/anchor target.
The thumbnail is a native preview recipe. Adaptive camera execution, a
packaged thumbnail and decisive-surface framing checks remain required.

`createTapeHookPack()` returns a frozen `mechanism-pack-instance-1` with a
`mechanism-scene-2` source, its canonical source hash, mesh data hash, current
bounds, parameters and exact pack reference. Pass a previously retained
reference as `expectedPack` to reject a changed revision, variant or detail.
The single declared detail is `teaching`; dimensions are illustrative model
values. The hook-thickness range is 0.04–0.35, blade length 4–20 and blade width
1–3. The tested dimensions are 0.18/10/2 and 0.26/14/2.5. A style change preserves
mesh arrays and their hash while changing the effective material/source identity.

## Rig and composition route

The slider moves `hook` relative to `model` over `[0, hookThickness]`. Its six
rivet meshes remain owned by `blade`. The optional `mount` transform moves the
model and its board/wall/datum reference together. `evaluateTapeHookPackFrame()`
performs fresh expected-state evaluation and rejects wrong travel, rivet
ownership, failed declared relationships or a changed source identity.
`outside-pull` requires the inner hook face to meet the board at position 0;
`inside-push` requires the outer face to meet the wall at position
`hookThickness`. The default `free` mode permits intermediate travel.

These are pure expected-state checks, not actual GPU observations, collision
simulation, continuous-motion acceptance or human visual/listening approval.
The floating-hook explanation follows
[STANLEY's description](https://support.stanleytools.com/hc/en-us/articles/360012677558-Why-does-the-hook-on-my-tape-measure-move).
No manufacturer dimensions are asserted.

Write the instance scene to a native asset file and use the standard composition
`native3d` layer with `format: "mechanism-scene-2"` and `rigControls`. A
composition asset's `sha256` must hash the **actual serialized file bytes**;
the instance's canonical source hash does not substitute for that transport hash.
`inPoint`/`outPoint` delimit visibility. Set `startFrame` explicitly when a later
layer's rig keys should use a local clock starting at zero.

Tape graduations require a real verified font asset. The native asset's
`textureFont` must name that font; the metadata compatibility declaration pins
its SHA-256 and weight. The repository example uses
`assets/story-motion/fonts/plex-sans-semibold.ttf`, weight `600`, SHA-256
`a20caf8286023a6a7a85e40b1d2a4ae9fc3e3b1f9eda8f4c542dd4986af67bb1`.
The browser and normal renderer verify and decode these bytes; no system-font
substitution is used. Installed-package font delivery remains to be verified.

## Retained software evidence and limits

`pnpm test:browser:mechanism-packs` runs the actual native renderer for both
sizes, including forward/backward repeat seeks, local travel sampling and strict
independent observed-frame checks. Each size has two independent nine-frame
normal final exports, with exact repeat movie hashes and independent retained
journal replay. The fixture's replay uses the existing exporter metadata
partition (128 MiB), records its approximately 31.4 MB peak and asserts every
reservation is released. The standalone verifier retains its 16 MiB default;
that smaller caller quota rejected the candidate and the failed run is retained.

Actual image inspection found that the existing camera crops the larger housing
and that the push wall obscures the decisive hook face. The candidate does not
count toward supported-family or pilot coverage until camera recipes and the
remaining MS2 checks are implemented. Cable-tie/clothespeg packs, shared bounded
primitives, rigid glTF/GLB import, complete metadata cross-reference admission,
full world allocation preflight, labels/cues, scoped typography, the 300-topic
coverage board and full/installed milestone gates remain open.
