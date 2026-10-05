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

## Candidate review (2026-10-06)

Two independent code-review skill axes inspected the candidate against `0e48388`.
The first fusion review found no renderer correctness or documented-standards defect.
Three findings were repaired before runtime verification: protect Vite/cache cleanup
when browser launch fails, preserve the old CE6-P heading anchor, and report cold
preview initialization/first submission/next RAF separately from warmed calls.
Preview submission and RAF costs do not guarantee GPU completion. Runtime evidence
is still required.

The timing harness refuses competing workloads at startup and samples processes
every two seconds until timing ends. Detected overlap or inspection failure is
retained as invalid timing and rejected. This is best-effort detection: very short
workloads can start and finish between polls. Do not use a contaminated run as
performance evidence; rerun the complete serial bracket once the machine is quiet.

## Slice 2 candidate: bounded exposure snapshots and sums (2026-10-06)

For an opaque screen whose clear bytes and conservative painted bounds are known,
accumulate signed byte differences from the first background only within the
growing union of painted bounds. Use the existing GPU `copyRegion` blit to snapshot
that region instead of resolving the entire screen texture. Restore the exact
nonnegative integer byte sum before the final division. Empty regions perform no
accumulation draw; changed/unknown later backgrounds expand the union to the full
screen. Unknown initial backgrounds and texture targets retain the fused full-frame
path. Public bytes, backend selection and GPU policy are unchanged.

An initial algebraic draft divided signed differences before adding the background.
That form can move half-byte ties through cancellation with approximate GPU
division, so it was rejected analytically before browser execution. The candidate
restores the original integer numerator, avoiding that change in rounding.

Regression coverage adds all counts 2–64 for moving/empty/full regions, white
background ties, changed backgrounds, unknown first/later metadata and exception
recovery against both the retained original algorithm and an independent average.
Standards review found that rounded background metadata cannot substitute for GPU
clear bytes. The bounded path now requires exact integer premultiplied clear
channels and an opaque screen; fractional clears use the full-frame path. Added
189 moving-region cases against original accumulation and independent averages
of actual GPU sample bytes. Both review axes are clean after repair.
Runtime correctness and performance remain unverified at this checkpoint.

The A/B harness can load both renderer and kernel from pinned refs without changing
files. Measure slice 1 separately with `--candidate-ref 706be71` against `0e48388`,
then slice 2 with `--baseline-ref 706be71` against the working tree. Keep each
four-session bracket and its source fingerprints separately.
