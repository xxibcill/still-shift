# v012 Access Constraint historical pixel reconciliation

The saved v012 Access Constraint MP4 is a historical visual reference. It was
rendered with sequential Canvas transforms. The current production renderer
applies the same algebraic transform as one matrix. That floating-point
operation-order change is enough to alter rasterized edges once the pressure
sides move. It does not change the authored scene or its compiled tracks.

## Reproduce

Keep the original `access-constraint.mp4`, `.mp4.result.json` and
`.mp4.scene.json` together. The archived render is an ignored local output, so
a fresh checkout must be given those three files. From the repository root,
with the pinned Node/Chromium toolchain and FFmpeg available, run:

```sh
node --import tsx scripts/story-motion/check-v012-access-history.ts \
  --historical-result /path/to/story-motion-v012/access-constraint.mp4.result.json \
  --output-dir /path/to/new-scratch-directory
```

The checker requires a new output directory. It verifies the archived source
and MP4 checksums, resolves every asset/font from the current repository and
checks its hash, recompiles and compares tracks, renders with the current
renderer, then renders through a temporary checkout of pinned commit
`21b1602d2e45326d292e88836d34fd8dde5cc362` with **only** the Canvas transform call replaced by the historical
translate/rotate/scale sequence. It compares all decoded frames and the final
MP4 hash, samples raw Canvas pixels during the hold, and writes `report.json`
beside the two new videos. The temporary checkout is removed. Neither the
production renderer nor the archived files are changed.

## Recorded result, 2026-09-29

The saved source checksum is
`84fefa2a18ed061e1fc585d3af6957492c1b089eff8587479275b37dcf10b856`;
the saved MP4 checksum is
`5511c3c9660be5075c3872cdd563686c299155bf96c4c95869bcac9347bb6e27`.
The current renderer matches exactly **72/192 decoded frames**, frames 0–71;
its first difference is frame 72. The isolated archival-transform render
matches **192/192 decoded frames** and reproduces the saved MP4 byte for byte.
The scene's authored nodes, connectors and recipe, and all compiled tracks,
are unchanged. This resolves the saved-video discrepancy as a renderer
arithmetic-history difference. The current renderer's failure against the
saved MP4 is expected; the strict `check-legacy-pixels.ts` comparison must
still report it rather than waive pixel parity.

The reported 3/3/0/0 movement in the v012 hold is a **decoded-video artifact**.
Every evaluated node and path pose is constant from frame 114 through 191.
Direct browser Canvas RGBA comparisons at frames 114–122 and 191, including a
backward seek to 114, have zero changed channels. The saved H.264 video,
sampled at 480×270 greyscale with a difference threshold of 6, cycles through
3, 3, 0, 0 changed pixels in the settled interval. The motion gate requires
at least 7 changed pixels, so these tiny decoded differences do not count as
motion. The raw-to-decoded comparison identifies encoding/decoding as their
source; it does not identify a particular H.264 encoder decision.

This audit is separate from the v014-g source-specific MC3 migration and MC7
focal-attribution proof in [the historical verification](motion-craft-historical-verification.md).
