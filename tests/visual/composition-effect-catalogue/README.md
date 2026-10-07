# CE6 native effect catalogue baselines

These six 32-frame native compositions cover all 39 built-in effects. Separate
Canvas and WebGL SHA-256 frame arrays record forward renders, reverse playback
and random seeks in the pinned Chromium/SwiftShader environment. The sampled PNGs
belong to this new catalogue; the existing CE0 frozen baselines are unchanged.

`pnpm test:browser:composition-effects` checks these hashes, repeated PNG/raw MP4
exports, independent preview encodes, and native hardware comparisons. Initial
creation used `--write-ce6-baseline`; ordinary verification never writes them.

Pinned backend comparisons use the existing near tier. Hardware comparisons keep
the existing perceptual policy and report the actual tier achieved by each frame.
Timing evidence records cold and warm render plus complete readback separately.

The original catalogue files remain unchanged after the transition coverage fix.
Canvas transition kernels 1.0.1 have a separate versioned hash oracle in
`darwin-arm64-transition-coverage-1.0.1.json`, checked against the effect versions,
source digest and pinned raster fingerprint. All other original hashes, including
all WebGL frames, remain required. The corrected Canvas oracle records the
premultiplied coverage equations; it does not relax pixel tiers or replace legacy
CE0 baselines.
