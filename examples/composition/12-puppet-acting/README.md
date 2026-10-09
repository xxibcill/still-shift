# Puppet acting

`composition.json` bends the character's arm and squashes the house over 48 frames
at 24 fps. Both SVGs are original, static artwork; only the puppet `pins` change.
The image transforms, rest positions and source assets remain fixed. The head has
a starch region so it stays stiff while the arm moves. Frame 0 is rest, frame 23
is the gesture, and frame 47 returns to rest.

`prop-follow.json` is a separate authoring example. An `attach` constraint moves
a null helper to the prop. Two scalar drivers copy that helper's solved position
into the hand pin, subtracting the actor's fixed layer offset. An expression moves
the elbow from the prop's keyed position. Expressions read the pre-constraint
stage; use a driver when a pin needs the final constrained position. This example
uses equal coordinate axes and fixed actor placement: for rotated/scaled parents,
convert the helper coordinates into the puppet layer's local space.

From the repository root:

```sh
pnpm still-shift comp render --input examples/composition/12-puppet-acting/composition.json --output /tmp/puppet.mp4 --backend webgl2
pnpm test:browser:composition-mesh
```

The browser check samples every frame of both examples on Canvas and WebGL2,
rejects any flipped/collapsed delivered triangle, checks hand/prop alignment and
reverse seeks, and exports the acting demo repeatedly through production workers.
Each backend must produce identical encoded output and all decoded frames across
repeat runs, one/four workers and enabled/disabled static caching. Export proof
and preview images are retained in the printed temporary results directory.

See [native puppet authoring](../../../docs/story-acting.md#native-composition-puppet-acting)
for pin coordinates, region semantics, topology limits and diagnostics.
