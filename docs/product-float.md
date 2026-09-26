# Product Float

The smallest reusable commerce motion component: one intact approved product cutout with a vertical hover. It has no background, copy, font, camera or format selection.

Implementation: `packages/renderer-core/src/product-float.ts`, exported by `@still-shift/renderer-core`.

## Use

```ts
import { buildProductFloat } from "@still-shift/renderer-core";

const float = buildProductFloat({
  id: "hero",
  product: approvedProductAsset, // id, path, sha256, width and height
  x: 300,
  y: 160,
  width: 480,
  travel: 18,
  cycleDurationSeconds: 5,
  cycles: 2,
  fps: 30,
});

// Compose into a prepared commerce scene:
const fields = {
  fps: float.fps,
  frameCount: float.frameCount,
  assets: float.assets,
  nodes: float.nodes,
  events: float.events,
};
```

The containing scene supplies its canvas, background, metadata and other required scene fields. Add a stationary background node before the product nodes if desired. Use unique component IDs for multiple products, merge their assets by asset ID, and keep their frame rates and timeline lengths compatible. The scene's existing event-count limit still applies to the combined composition.

## Contract

- `x`, `y`, `width` and `travel` are canvas pixels. `y` is the lowest resting position; the product rises to `y - travel`.
- Height follows the supplied asset's aspect ratio. The complete image is referenced once, including any transparent padding. No crops, generated replacements or product-part edits are made. The caller supplies an approved cutout; this component does not inspect its alpha channel or visual identity.
- Only the product group's `y` property changes. Its child image, horizontal position, scale, rotation and opacity stay fixed.
- Each cycle rises and returns using smoothstep easing. `cycles` defaults to one; supported range is 1–50. Zero travel is allowed for a static placement.
- Output frames are `round(cycleDurationSeconds × fps × cycles)`, at 24 or 30 fps. Half-cycle boundaries are rounded to integer frames across the first and last sampled poses. Both endpoint poses match, so displayed cycle timing is quantized by the frame grid.
- Timing must leave at least one frame interval for each half-cycle. Maximum output is 108,000 frames.
- Evaluation uses the existing exact-frame renderer, so seeking does not depend on playback history.
- `bounds` is the full swept image rectangle. The containing composition uses it to check canvas fit and clearance from other objects. This rectangle includes transparent padding and does not infer object contours.

## First composition: palm-up product float

`commerce-floating.ts` combines the component with a stationary palm background, enforces 4:5 framing and at least 40 pixels of clearance, and retains the existing Production v1.0 registration. It uses an 18-pixel float with two cycles across the selected duration. For the ten-second example, each cycle is five seconds.

The component itself carries no Production designation. New compositions continue to follow the catalog's Experimental default.

## Verification

`tests/unit/product-float.test.ts` covers different product proportions, independent composition, custom motion at 24/30 fps, backward seeking, invalid inputs and exact compatibility with the saved production example. The existing commerce scene tests check hand clearance across every frame.

## Atomic foundation

Product Float now delegates image construction to Product Layer and motion to an independent Float behavior. Its public interface and prepared output are preserved. See the [component implementation](ecommerce-atomic-components-implementation.md) for the complete composition contract, other components and gallery.
