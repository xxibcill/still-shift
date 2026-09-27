import type { CommerceRenderScene } from "./commerce-scene.ts";
import type { StoryRenderScene } from "./story-scene.ts";
import { componentCapabilities } from "./component-capabilities.ts";

export function validateComponentRelationships(
  scene: CommerceRenderScene | StoryRenderScene,
) {
  const features = componentCapabilities(scene.componentData);
  if (!features.supportsRelationships) return;
  const commerce =
    scene.schemaVersion === "commerce-scene-1" ? scene : undefined;
  for (const [name, shared, native, limit] of [
    ["visibility", features.visibility, commerce?.visibility ?? [], 100],
    ["text fit", features.textFits, commerce?.textFits ?? [], 32],
    ["mask", features.masks, commerce?.mattes ?? [], 16],
  ] as const) {
    if (shared.length + native.length > limit)
      throw new Error(
        `Component ${name} count ${shared.length + native.length} exceeds ${limit}`,
      );
    for (const item of shared)
      if (native.some((n) => n.target === item.target))
        throw new Error(`Conflicting native/component ${name}: ${item.target}`);
  }
  for (const pin of features.pins) {
    if (
      ["x", "y"].some(
        (p) =>
          scene.tracks[pin.target]?.[p as "x" | "y"]?.length ||
          features.bindings.some(
            (b) =>
              b.target === pin.target &&
              b.kind === "property" &&
              b.property === p,
          ),
      ) ||
      features.travels.some((t) => t.target === pin.target) ||
      Object.hasOwn(scene.followers, pin.target) ||
      commerce?.effects?.some((e) => "target" in e && e.target === pin.target)
    )
      throw new Error("Conflicting component pin ownership: " + pin.target);
  }
  const masks = [...features.masks, ...(commerce?.mattes ?? [])];
  for (const matte of masks) {
    if (masks.some((m) => m.target === matte.mask))
      throw new Error("Mask chains are unsupported: " + matte.mask);
  }
  for (const matte of features.masks) {
    const subtree = new Set([matte.mask]);
    let previous = -1;
    while (previous !== subtree.size) {
      previous = subtree.size;
      for (const n of scene.nodes)
        if (n.parent && subtree.has(n.parent)) subtree.add(n.id);
    }
    if (
      scene.nodes.some(
        (n) =>
          subtree.has(n.id) &&
          !["group", "image", "rect", "path"].includes(n.type),
      ) ||
      commerce?.effects?.some((e) => "target" in e && subtree.has(e.target)) ||
      commerce?.attachments?.some((a) => subtree.has(a.path)) ||
      features.annotations.some((a) => subtree.has(a.path)) ||
      (scene.schemaVersion === "story-scene-1" &&
        (scene.flows?.some((f) => subtree.has(f.path)) ||
          scene.connectors?.some((c) => subtree.has(c.path))))
    )
      throw new Error(
        "Mask source requires raw authored image/shape alpha: " + matte.mask,
      );
  }
}
