# Native CE8 camera acceptance

These scenes exercise the native composition path. They use 32 frames at 24 fps
and pinned image/font assets. Existing family scenes and frozen baselines are
read-only.

- `affine`: camera motion, parallax, crossing depths and a 2D ordering barrier.
- `perspective` / `checker-perspective`: tilted solid/image planes with an
  independent screen-ray/plane-intersection oracle and hand-authored clocks.
- `clipping`: a plane crossing the near clip, with a bounded far clip.
- `content`: image, pinned text and shape projection.
- `parents`: parented POI, camera switching, orientation and mirrored billboards.
- `focus`: moving focus, screen overscan and required background coverage.
- `group-mask`: local feather/inversion, projected group mask and rectangular clip.
- `scopes`: a flat projected precomp with its own camera and source clock.
- `exposure`: seeded camera shake, xyz movement and complete shutter sampling.

The browser runner checks every frame forward, backward and by random seek. It
compares supported affine Canvas/WebGL paths, actual hardware pixels, repeated
PNG/raw exports and an independently encoded preview. Required-coverage failures
exercise an interior alpha hole, later source-state holes, masks and mattes.
Canvas perspective rejection must preserve the previous complete frame, including
an exposure case. `--profile` records serial cold/warm 1080p costs for 1/8/64
planes with 1/4 shutter samples. `--write-ce8-baseline` writes only the new CE8
baseline directory.

All checks are authored but unexecuted while the coordinated CE6-P quiet window
is active. No acceptance result is implied by these source fixtures.
