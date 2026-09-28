# Generated posture library

Seven transparent PNGs generated with the **built-in image_gen tool** on
2026-09-28, using the original Nora and neighbor as identity/style references.
The generator did not expose its model-version identifier.

| Asset                 | Performance                                              |
| --------------------- | -------------------------------------------------------- |
| `nora-idle.png`       | Relaxed arms, looking right                              |
| `nora-inspect.png`    | Leaning toward the label, pointing                       |
| `nora-knock.png`      | Raised knuckles; other hand supports the separate parcel |
| `nora-step-a.png`     | Leftward extended stride                                 |
| `nora-step-b.png`     | Leftward passing stride                                  |
| `neighbor-idle.png`   | Waiting, arms lowered                                    |
| `neighbor-thanks.png` | Receiving hand extended, other hand at chest             |

The original `image-model-v001/nora.png` and `neighbor.png` supply the offer and
receive poses. The walking passing pose and parcel-supporting knock arm each
received one targeted image-model revision. Original generated PNG bytes and
alpha channels are preserved; no pixel post-processing or SVG conversion was used.

[prompts.json](prompts.json) contains exact final generation/edit prompts and
source paths. [manifest.json](manifest.json) records dimensions, checksums, alpha
bounds and normalized foot registration. Alpha was inspected to locate the
foot baseline; this read-only measurement did not alter the images.

The reusable engine features are documented in
[story-acting.md](../../../docs/story-acting.md). The consuming plan is
`benchmarks/fixtures/parcel-story/acting/parcel-story.json`.

Final review: `benchmarks/results/parcel-story-acting-v002/index.html`.
Its `acting-verification.json` confirms 1920×1080, 864 frames at 24 fps,
36 seconds, unchanged narration cue frames and byte-identical decoded audio
relative to the accepted image-model version. Nine exported frames were inspected
across the poses, thought cloud and final caption; compiler diagnostics are empty.

Implementation validation: TypeScript build, 474 unit tests and 20 targeted
integration tests passed, including real Lab editing and portable workspace
relocation. The new visual treatment is ready for user review.
