# Cinematic scene fixtures

The first implemented template is **CI-09 Layered Parallax**. Its two seven-second compositions use the same original courtyard kit and default to Dramatic intensity. The alternate moves the subject 220 px left and foreground 260 px left, changes all three plane distances, and reverses the camera direction.

```bash
pnpm cinematic:prepare
pnpm cinematic:render --output-dir benchmarks/results/cinematic-illustrated/my-review
pnpm test:browser:cinematic --renders benchmarks/results/cinematic-illustrated/my-review
```

Use a new output directory. The generator checks source dimensions/crops and every frame's geometry before writing the scenes. The render script invokes the real `animate-scene` CLI and produces three MP4s: two Dramatic compositions and the primary composition at Standard strength. It also writes metadata, motion measurements, posters, contact sheets, and an original-versus-Dramatic review page.

These use the experimental `illustrated-scene-2` contract. Each root image binds one depth plane. The recipe identifies foreground, anchored subject, and background. The background declares an opaque painted rectangle; the subject declares a nonzero protected polygon in local coordinates. Foreground `edgeAttachments` prevent cropped source edges from entering the frame. Camera travel is measured in the projection's authored scene units, with output displacement checked against the preset envelope. `dramatic`, `standard`, and `restrained` strengths are supported.

The source assets are original proof material, outside the frozen corpus. See the [implementation and QA report](../../../docs/cinematic-parallax-implementation.md) for limits and the current review clip.
