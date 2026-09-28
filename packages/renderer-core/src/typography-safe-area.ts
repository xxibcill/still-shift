import type { StoryRenderScene } from "./story-scene.ts";
import type { PreparedTypography } from "./typography-renderer.ts";
import { passageError } from "./passage-diagnostics.ts";
import { validateStorySafeZones } from "./story-safe-zones.ts";

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
    const left = Math.min(
        ...layouts.flatMap((l) => l.lines.map((line) => line.x)),
      ),
      right = Math.max(
        ...layouts.flatMap((l) => l.lines.map((line) => line.x + line.width)),
      );
    const corrections = prepared.corrections.get(node.id) ?? [];
    const top = Math.min(
        ...layouts.map((l) => l.top),
        ...corrections.map((c) => c.y + c.raster.layout.top),
      ),
      bottom = Math.max(...layouts.map((l) => l.top + l.height));
    if (
      node.x + left < inset ||
      node.x +
        Math.max(
          right,
          ...corrections.map((c) => c.x + c.raster.layout.width),
        ) >
        scene.width - inset ||
      node.y + top < inset ||
      node.y + bottom > scene.height - inset
    )
      passageError(
        "text-outside-safe-area",
        "Text layout and state transition union are outside the output safe area",
        { node: node.id },
      );
  }
  validateStorySafeZones(scene);
}
