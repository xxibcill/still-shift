import type { ComponentBounds } from "./commerce-composition.ts";
import { ComponentBoundsSchema } from "../../scene-contract/src/components.ts";

export function layoutComponentBoxes(
  region: ComponentBounds,
  sizes: Pick<ComponentBounds, "width" | "height">[],
  options: {
    axis: "x" | "y";
    gap?: number;
    align?: "start" | "center" | "end";
    distribution?: "start" | "center" | "end" | "space-between";
  },
): ComponentBounds[] {
  const box = ComponentBoundsSchema.parse(region),
    gap = options.gap ?? 0;
  if (!Number.isFinite(gap) || gap < 0)
    throw new Error("Layout gap must be nonnegative");
  const main = options.axis === "x" ? "width" : "height",
    cross = main === "width" ? "height" : "width";
  for (const size of sizes)
    ComponentBoundsSchema.parse({
      x: 0,
      y: 0,
      width: size.width,
      height: size.height,
    });
  const used =
    sizes.reduce((sum, s) => sum + s[main], 0) +
    Math.max(0, sizes.length - 1) * gap;
  if (used > box[main] || sizes.some((s) => s[cross] > box[cross]))
    throw new Error("Component boxes do not fit the layout region");
  const spare = box[main] - used,
    distribution = options.distribution ?? "start";
  const actualGap =
    gap +
    (distribution === "space-between" && sizes.length > 1
      ? spare / (sizes.length - 1)
      : 0);
  let cursor =
    distribution === "center" ? spare / 2 : distribution === "end" ? spare : 0;
  return sizes.map((size) => {
    const offset =
      options.align === "center"
        ? (box[cross] - size[cross]) / 2
        : options.align === "end"
          ? box[cross] - size[cross]
          : 0;
    const result = {
      x: box.x + (options.axis === "x" ? cursor : offset),
      y: box.y + (options.axis === "y" ? cursor : offset),
      width: size.width,
      height: size.height,
    };
    cursor += size[main] + actualGap;
    return result;
  });
}
