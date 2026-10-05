# CE6-P compatible WebGL optimization lane

- Date: 2026-10-05
- Branch: `codex/composition-ce6p-compatible`
- Starting commit: `0e4838852855f6dc8cf91bba763a402dfd716f88` (CE7)
- Status: in progress; CE6-P acceptance remains open.

The owner resumed CE6-P using the current WebGL renderer in this isolated
worktree. Do not modify the primary checkout or main feature chat. No CPU/GPU
composition hybrid, default-backend change, GPU-policy change, acceptance revision
or frozen-baseline regeneration is authorized. GitHub Actions remain disabled.

## Preserved acceptance

Retain all original 117 tracked family timing failures and the existing 1.25×
legacy render/readback assertions, plus the native 1920×1080 2× WebGL versus
Canvas target. Each fixture keeps its pixel tier, evaluated-state agreement,
forward/reverse/random seeking, repeated-export identity and pinned SwiftShader
policy. Hardware preview must still agree with pinned export. Separate preview
and export budgets with environment fingerprints and warm/cold methods.

Prior evidence: [performance slices](./composition-ce6-performance-results.json),
[feasibility report](./composition-ce4b-feasibility.md),
[feasibility results](./composition-ce4b-feasibility-results.json),
[CE7 exposure costs](./composition-ce7-results.json).
Do not repeat the rejected scratch readback, framebuffer, PBO, skipped-clear,
unspecialized blur or upload-variant experiments.

## Slice 1: final exposure accumulation

The current exposure path accumulates integer byte samples into RGBA32F, then
performs a separate averaging draw. Test fusing the last sample addition with
the average into the destination. Integer sums at the schema cap of 64 samples
are exactly representable (at most 16,320 per channel), so operation order and
rounding can remain unchanged. Keep the offscreen feedback rule and independent
public readback ownership. This removes one full-frame draw, with no claimed
effect on ordinary one-sample cases or on the original 117 failures.

1. Preflight pinned Node 22.23.1/pnpm 10.29.3, workspace imports, Python, browser
   and independent Vite optimizer/config caches.
2. Compare the candidate byte-for-byte with the original accumulation at every
   count 1–64, odd dimensions, opaque screen/offscreen and transparent offscreen
   destinations, rounding ties, repeated reads and exception recovery.
3. Run serial baseline/candidate/candidate/baseline diagnostics after the main
   gate ends. Preserve original CE7 1080p sample-cost method, and measure preview
   separately with fingerprints. Retain failed experiments.
4. Run relevant exposure/WebGL/export/hardware regressions and required family
   audits with their existing methods. Review final code before the full gate.
5. Aim for one successful full `pnpm check` on final code. Retain any failed
   attempts; never claim an incomplete gate passed. Publish/attach a reviewable
   PR with the remaining performance targets.

Resumable verification or runner redesign is separate work.
