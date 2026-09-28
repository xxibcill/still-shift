import type { StoryRenderScene } from "./story-scene.ts";
import {
  typographyContainerContent,
  type PreparedTypography,
} from "./typography-renderer.ts";
import { passageError } from "./passage-diagnostics.ts";
import { validateStorySafeZones } from "./story-safe-zones.ts";
import { textContainerBounds } from "./text-container-layout.ts";

export function validateTypographySafeArea(
  scene: StoryRenderScene,
  prepared: PreparedTypography,
) {
  for (const node of scene.nodes) {
    if (node.type !== "text" || node.parent) continue;
    const layouts = [...(prepared.nodes.get(node.id)?.values() ?? [])].flatMap(
        (r) => [r.layout, ...[...r.variants.values()].map((v) => v.layout)],
      ),
      inset = scene.safeInset ?? 0;
    let left = Math.min(
        ...layouts.flatMap((l) => l.lines.map((line) => line.x)),
      ),
      right = Math.max(
        ...layouts.flatMap((l) => l.lines.map((line) => line.x + line.width)),
      );
    const corrections = prepared.corrections.get(node.id) ?? [];
    let top = Math.min(
        ...layouts.map((l) => l.top),
        ...corrections.map((c) => c.y + c.raster.layout.top),
      ),
      bottom = Math.max(...layouts.map((l) => l.top + l.height));
    right = Math.max(
      right,
      ...corrections.map((c) => c.x + c.raster.layout.width),
    );
    if (node.container)
      for (const layout of layouts) {
        const box = textContainerBounds(
          typographyContainerContent(node, layout),
          node.container,
        );
        left = Math.min(left, box.x);
        right = Math.max(right, box.x + box.width);
        top = Math.min(top, box.y);
        bottom = Math.max(bottom, box.y + box.height);
      }
    // Held destinations (for example a qualified claim making room) persist after
    // their animator ends, so they are part of the settled layout.
    const held = (scene.textAnimators ?? []).flatMap((a) =>
      a.node === node.id && a.to?.offset ? [a.to.offset] : [],
    );
    const dx = held.map(([x]) => x),
      dy = held.map(([, y]) => y);
    left += Math.min(0, ...dx);
    right += Math.max(0, ...dx);
    top += Math.min(0, ...dy);
    bottom += Math.max(0, ...dy);
    if (
      node.x + left < inset ||
      node.x + right > scene.width - inset ||
      node.y + top < inset ||
      node.y + bottom > scene.height - inset
    )
      passageError(
        "text-outside-safe-area",
        "Text layout, container and state transition union are outside the output safe area",
        { node: node.id },
      );
  }
  validateStorySafeZones(scene);
}
