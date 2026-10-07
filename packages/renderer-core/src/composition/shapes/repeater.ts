import { SHAPE_LIMITS } from "@still-shift/scene-contract";
import type { Matrix } from "../../node-transform.ts";
import type { ShapeGeometryBudget } from "./budget.ts";
import { shapeMatrix, type ShapeTransform } from "./geometry.ts";

type Repeater = {
  copies: number;
  offset: number;
  transform: ShapeTransform;
  startOpacity: number;
  endOpacity: number;
  order: "above" | "below";
};
export type RepeaterCopy = { index: number; matrix: Matrix; opacity: number };

export function repeaterCopies(
  repeater: Repeater,
  budget: ShapeGeometryBudget,
): RepeaterCopy[] {
  const { copies, offset, transform, startOpacity, endOpacity, order } =
    repeater;
  if (!Number.isFinite(copies) || copies < 0 || copies > SHAPE_LIMITS.copies)
    budget.fail(
      "comp-shape-repeater-range",
      "Repeater copies are outside their bounded range",
    );
  const count = Math.ceil(copies);
  budget.vertices(count);
  const power = (value: number, exponent: number) => {
    if (
      (value < 0 && !Number.isInteger(exponent)) ||
      (value === 0 && exponent < 0)
    )
      budget.fail(
        "comp-shape-repeater-scale",
        "Fractional powers of negative scales and negative powers of zero scales are undefined",
      );
    const result = Math.pow(value, exponent);
    if (!Number.isFinite(result))
      budget.fail(
        "comp-shape-repeater-scale",
        "Repeater scale powers must remain finite",
      );
    return result;
  };
  const result = Array.from({ length: count }, (_, index): RepeaterCopy => {
    const factor = index + offset;
    const matrix = shapeMatrix({
      anchor: transform.anchor,
      position: [
        transform.anchor[0] + transform.position[0] * factor,
        transform.anchor[1] + transform.position[1] * factor,
      ],
      scale: [
        power(transform.scale[0], factor),
        power(transform.scale[1], factor),
      ],
      rotation: transform.rotation * factor,
      skewX: transform.skewX * factor,
      skewY: transform.skewY * factor,
    });
    if (matrix.some((value) => !Number.isFinite(value)))
      budget.fail(
        "comp-shape-repeater-transform",
        "Repeater transforms must remain finite",
      );
    const progress = count > 1 ? index / (count - 1) : 0;
    const partial = Math.min(1, copies - index);
    return {
      index,
      matrix,
      opacity:
        (startOpacity + (endOpacity - startOpacity) * progress) * partial,
    };
  });
  return order === "below" ? result.reverse() : result;
}
