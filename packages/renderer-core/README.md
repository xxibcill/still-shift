# Renderer core

v0.3 exposes a versioned, deterministic `slow_push` scene resolver and frame evaluator.
The browser adapter draws a 128 × 72 subdivided source plane with vertex displacement
from the v0.2 normalized depth PNG. Source and depth textures must have identical
dimensions. Evaluation uses only `frameIndex / fps`; playback changes the integer
frame index, never the scene clock.

The subtle preset defaults to 2.5% push and 2.5% depth strength with 10% overscan.
Hard limits cap push and depth strength at 3.5% each. Cover fit handles differing
source and canvas aspect ratios. Input and timeline validation rejects mismatched
depth assets, non-finite parameters, and durations that do not map to whole frames.

This is a preview renderer. It does not create MP4 output or perform v0.5 risk
analysis and fallback.
