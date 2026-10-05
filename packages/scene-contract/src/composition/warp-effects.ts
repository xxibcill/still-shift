import {
  defineCompositionEffect,
  type EffectProperty,
  type EffectParameters,
  type CompositionEffectDefinition,
} from "./effect-definition.ts";
const point = (
  value: readonly [number, number],
  min: number,
  max: number,
): EffectProperty => ({ type: "vec2", default: value, min, max });
function validateQuad(params: EffectParameters) {
  const corners = ["topLeft", "topRight", "bottomRight", "bottomLeft"].map(
    (name) => params[name] as readonly number[],
  );
  let sign = 0;
  for (let index = 0; index < 4; index++) {
    const a = corners[index]!,
      b = corners[(index + 1) % 4]!,
      c = corners[(index + 2) % 4]!;
    const cross =
      (b[0]! - a[0]!) * (c[1]! - b[1]!) - (b[1]! - a[1]!) * (c[0]! - b[0]!);
    if (Math.abs(cross) < 1e-6 || (sign && Math.sign(cross) !== sign))
      throw Error(
        "Corner pin needs a convex, noncollapsed ordered quadrilateral",
      );
    sign = Math.sign(cross);
  }
}
export const WARP_EFFECT_DEFINITIONS: Readonly<
  Record<string, CompositionEffectDefinition>
> = {
  "distort.transform": defineCompositionEffect({
    version: "1.0.0",
    properties: {
      offset: point([0, 0], -1000000, 1000000),
      anchor: point([0.5, 0.5], 0, 1),
      scale: point([1, 1], -10, 10),
      rotation: { type: "scalar", default: 0, min: -36000, max: 36000 },
    },
    expandBounds: () => null,
    validateParams: (p) => {
      if ((p.scale as readonly number[]).some((v) => Math.abs(v) < 1 / 256))
        throw Error("Transform scale magnitude must be at least 1/256");
    },
  }),
  "distort.corner-pin": defineCompositionEffect({
    version: "1.0.0",
    properties: {
      topLeft: point([0, 0], -10, 10),
      topRight: point([1, 0], -10, 10),
      bottomRight: point([1, 1], -10, 10),
      bottomLeft: point([0, 1], -10, 10),
    },
    expandBounds: () => null,
    validateParams: validateQuad,
  }),
};
