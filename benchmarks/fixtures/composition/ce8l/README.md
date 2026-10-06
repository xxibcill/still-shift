# Native CE8-L flat-lighting acceptance

Thirteen scenes contain 32 frames at 24 fps, with pinned existing image/font
assets. New lighting baselines are separate from frozen legacy fixtures.

- `ambient`, `point`, `spot`: full-frame independent scalar CPU oracles with
  hand-authored linear clocks, sRGB transfer and premultiplied RGBA8 quantization.
- `overlap`: eight lights in authored order, animated point/spot transforms and
  a mirrored/nonuniform, rotated parent and receiver.
- `content`: transparent image holes, pinned text, native shapes and an unlit overlay.
- `scopes`: internal lighting and parent lighting of a flattened precomp quad.
- `unlit`, `disabled`: exact unlit identity on Canvas/WebGL; `zero` tests an enabled
  zero-intensity light while preserving partial alpha.
- `exposure`, `focus`: animated illumination during actual shutter samples and
  shading before projection/focus blur.
- `effects`: lighting before primitive/Gaussian filtering, tint and feathered masks.
- `mirror`: front/back and mirrored planes retain two-sided diffuse response.

The required runner checks every frame forward/reverse, random seeking, alpha
against the same unlit graph, stored hashes, production/repeat/raw exports and
independently encoded previews. It tests Canvas retention for activation, a later
shutter graph, named inputs and mattes, the actual inspector edit/undo/save path,
and hardware preview under the unchanged perceptual policy. Independent CPU
pixels use the existing near tier (delta at most two, PSNR at least 50 dB), with
alpha checked separately and exactly. No legacy threshold changes.

`--profile` records serial 1080p cold/two-warm/five-measure costs for 1/4/8 lights,
four receivers and 1/4 actual exposure samples. `--write-ce8l-baseline` writes
only the new lighting directory. Acceptance remains pending until the committed
code completes these checks and the complete local gate.
