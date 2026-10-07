import type { CompositionLayer } from "./layers.ts";
/** Secondary optics read the primary control and film size at the same expression stage. */
export function cameraOpticalDependencies(
  layer: CompositionLayer,
  property: string,
  writers: readonly string[],
): readonly string[] {
  if (layer.type !== "camera") return [];
  const focal =
    layer.focalLength !== undefined || writers.includes("focalLength");
  if (property === "focalLength" && !focal) return ["zoom", "filmSize"];
  if (property === "zoom" && focal) return ["focalLength", "filmSize"];
  return [];
}
