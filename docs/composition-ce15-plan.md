# CE15 delivery plan

Codex is working on `codex/composition-ce15` from completed CE13 `aedfc9e`.
CE13 PR #48 is open and attached. CE15 remains in progress; its first focused
checkpoint establishes transparent renderer output before format integration.

## Accepted renderer checkpoint — 2026-10-07

`preserveAlpha: true` carries omitted, null and authored partial backgrounds
through Canvas and WebGL roots. The opaque default retains its original path.
Transparent screen full reads and incremental damage reads use the same in-place
conversion. Existing offscreen rounding remains unchanged.

The pinned browser's PNG conversion uses normalized float32 arithmetic followed
by clamped nearest-even bytes. An exhaustive actual GPU-to-PNG-to-FFmpeg test
verifies all 32,895 valid channel/alpha pairs and 256 zero-alpha pairs. Mathematical
nearest-up differed in 291 pairs; nearest-even without normalized float32 differed
in 139. The selected conversion matches every valid pair. This is actual output
proof, not an assertion about an unverified Chromium source revision.

All 38 authored alpha cases pass exact PNG/raw equality, fresh/incremental reads
and repeated forward/reverse frames across both backends. Build, schema,
boundaries, changed-file lint, 19 readback/exposure units and the complete original
WebGL regression suite pass. Earlier failed diagnostics remain in the
[results](./composition-ce15-results.json). No full gate has run for CE15 yet.

## Remaining implementation and acceptance

1. Deliver the first Q4 profiles together: ProRes 4444 alpha, PNG8/16, H.264 and
   HEVC10. Apply actual sRGB-to-BT.709 RGB conversion with linear alpha; verify
   color metadata, dimensions, frame clocks, actual decoded pixels and audio.
2. Add ProRes 422 HQ and VP9 alpha, including alpha-aware decoding and protected
   audio clocks. Prove 60fps and actual arbitrary-size limits for each codec.
3. Retain static layer and precomp surfaces once per export globally. Include
   coverage preflight painting, late visibility, nested effects/mattes, actual
   ownership counters, bounded memory and cached/uncached pixel equality.
4. Add bounded independent browser workers feeding one ordered encoder. Preserve
   absolute source time, cancellation and transactional publication. Verify
   boundary frames, repeat bytes, concurrent errors and foreign-file retention.
5. Record actual per-layer submission/render timings, cache hits and owned bytes.
   Measure a real two-minute export end-to-end with one and four workers under the
   same profile and cache policy, without competing workloads. Require identical
   output and at least 3x speedup.
6. Review implementation, run affected checks, then run the complete pinned local
   `pnpm check` on an immutable final checkpoint. Create and attach the CE15 PR,
   then continue all CE14 work on a new branch.

GitHub Actions remain disabled. CE5-X/Q9, CE6-P and separate owner work remain
pending. No milestone or PR is merged by this mission.
