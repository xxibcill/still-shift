/** Independent full-frame light oracle: hand-authored clocks, scalar world geometry
 * and transfer functions. No production evaluator, packer, sampler or shader imports. */
const decode = (v: number) =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const encode = (v: number) =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function lightingFixtureReference(
  name: string,
  frame: number,
): Uint8ClampedArray | null {
  if (!["ambient", "point", "spot"].includes(name)) return null;
  const width = 128,
    height = 96,
    t = frame / 31,
    result = new Uint8ClampedArray(width * height * 4),
    alpha = name === "ambient" ? 128 : 255;
  const source = name === "ambient" ? [128, 64, 192] : [128, 128, 128];
  const encoded = source.map((c) => Math.round((c * alpha) / 255) / alpha);
  const colour =
    name === "ambient"
      ? [(128 + 127 * t) / 255, 192 / 255, (255 - 127 * t) / 255]
      : name === "spot"
        ? [(255 - 127 * t) / 255, 204 / 255, (128 + 127 * t) / 255]
        : [1, 180 / 255, 120 / 255];
  const intensity =
    name === "ambient"
      ? 0.2 + 1.2 * t
      : name === "point"
        ? 0.3 + 1.2 * t
        : 0.4 + 1.2 * t;
  const point =
    name === "point"
      ? [15 + 100 * t, 48, -60 - 40 * t]
      : [20 + 88 * t, 40 + 16 * t, -100];
  const rx = (8 * t * Math.PI) / 180,
    ry = (-8 * t * Math.PI) / 180,
    direction = [
      Math.sin(ry) * Math.cos(rx),
      -Math.sin(rx),
      Math.cos(ry) * Math.cos(rx),
    ];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let weight = intensity;
      if (name !== "ambient") {
        const delta = [point[0]! - (x + 0.5), point[1]! - (y + 0.5), point[2]!],
          distance = Math.hypot(...delta);
        const range = name === "point" ? 220 + 130 * t : 320,
          start = name === "point" ? 10 + 30 * t : 30;
        weight *=
          Math.abs(delta[2]! / distance) * (1 - smooth(start, range, distance));
        if (name === "spot") {
          const cosine = -direction.reduce(
            (s, v, i) => s + (v * delta[i]!) / distance,
            0,
          );
          weight *= smooth(
            Math.cos(((50 + 30 * t) * Math.PI) / 360),
            Math.cos(((15 + 20 * t) * Math.PI) / 360),
            cosine,
          );
        }
      }
      const at = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const linear = Math.max(
          0,
          Math.min(1, decode(encoded[c]!) * decode(colour[c]!) * weight),
        );
        const premultiplied = Math.round(encode(linear) * alpha);
        result[at + c] = Math.round((premultiplied * 255) / alpha);
      }
      result[at + 3] = alpha;
    }
  return result;
}
