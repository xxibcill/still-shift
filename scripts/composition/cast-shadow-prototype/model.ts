/** Experimental only: never imported by production packages or authoring APIs. */
export const SHADOW_MODEL = "flat-alpha-shadow-candidate-1";
export const LIMITS = {
  casters: 8,
  textureSide: 64,
  coordinate: 1_000_000,
  bias: 0.001,
  angularEpsilon: 1e-6,
} as const;
export type Vec3 = [number, number, number];
export type Alpha = { width: number; height: number; pixels: number[] };
export type Plane = {
  id: string;
  scope: string;
  order: number;
  origin: Vec3;
  /** Full world-space edge vectors, including mirrored and nonuniform scale. */
  u: Vec3;
  v: Vec3;
  alpha: Alpha;
  opacity: number;
  castsShadow: boolean;
  receivesShadow: boolean;
};
export type Experiment = {
  version: typeof SHADOW_MODEL;
  receiver: Plane;
  casters: Plane[];
  /** One direct-light visibility field; spot cone/falloff belongs to CE8-L. */
  light: {
    position: Vec3;
    radius: number;
    samples: 1 | 4 | 16;
    enabled: boolean;
  };
};

export const dot = (a: Vec3, b: Vec3) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const subtract = (a: Vec3, b: Vec3): Vec3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
export const addScaled = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + b[0] * t,
  a[1] + b[1] * t,
  a[2] + b[2] * t,
];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

// Explicit square-root-free disk quadrature; never seeded by time or traversal.
export const SAMPLE_OFFSETS: Record<1 | 4 | 16, readonly [number, number][]> = {
  1: [[0, 0]],
  4: [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ],
  16: [
    [-0.25, -0.25],
    [0.25, -0.25],
    [0.25, 0.25],
    [-0.25, 0.25],
    [-0.75, -0.25],
    [-0.25, -0.75],
    [0.25, -0.75],
    [0.75, -0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [-0.25, 0.75],
    [-0.75, 0.25],
    [-1, 0],
    [0, -1],
    [1, 0],
    [0, 1],
  ],
};

export function validateExperiment(scene: Experiment): void {
  const fail = (message: string): never => {
    throw new Error(`shadow-prototype-input: ${message}`);
  };
  const bounded = (value: number, min: number, max: number) =>
    Number.isFinite(value) && value >= min && value <= max;
  const vector = (v: Vec3) =>
    v.length === 3 &&
    v.every((value) => bounded(value, -LIMITS.coordinate, LIMITS.coordinate));
  if (
    scene.version !== SHADOW_MODEL ||
    ![1, 4, 16].includes(scene.light.samples) ||
    !vector(scene.light.position) ||
    !bounded(scene.light.radius, 0, 1000) ||
    typeof scene.light.enabled !== "boolean"
  )
    fail("invalid light/version");
  if (scene.casters.length > LIMITS.casters) fail("caster limit exceeded");
  const ids = new Set<string>();
  for (const p of [scene.receiver, ...scene.casters]) {
    const key = `${p.scope}/${p.id}`;
    if (
      !p.id ||
      !p.scope ||
      p.id.length > 128 ||
      p.scope.length > 1024 ||
      ids.has(key)
    )
      fail("invalid/duplicate identity");
    ids.add(key);
    if (
      ![p.origin, p.u, p.v].every(vector) ||
      !bounded(p.opacity, 0, 1) ||
      !Number.isInteger(p.order) ||
      Math.abs(p.order) > 10000 ||
      typeof p.castsShadow !== "boolean" ||
      typeof p.receivesShadow !== "boolean"
    )
      fail("invalid plane");
    const normal = cross(p.u, p.v);
    if (
      dot(normal, normal) <=
        LIMITS.angularEpsilon ** 2 * dot(p.u, p.u) * dot(p.v, p.v) ||
      dot(p.u, p.u) === 0 ||
      dot(p.v, p.v) === 0
    )
      fail("degenerate plane");
    const { width, height, pixels } = p.alpha;
    if (
      ![width, height].every(
        (n) => Number.isInteger(n) && n >= 1 && n <= LIMITS.textureSide,
      ) ||
      pixels.length !== width * height ||
      !pixels.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    )
      fail("invalid alpha raster");
  }
}

/** Pixel-center bilinear filtering with a transparent border, independent of RGB. */
export function alphaAt(alpha: Alpha, u: number, v: number): number {
  if (u < 0 || v < 0 || u >= 1 || v >= 1) return 0;
  const x = u * alpha.width - 0.5,
    y = v * alpha.height - 0.5;
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy;
  const texel = (x: number, y: number) =>
    x < 0 || y < 0 || x >= alpha.width || y >= alpha.height
      ? 0
      : alpha.pixels[y * alpha.width + x]! / 255;
  return (
    (texel(ix, iy) * (1 - fx) + texel(ix + 1, iy) * fx) * (1 - fy) +
    (texel(ix, iy + 1) * (1 - fx) + texel(ix + 1, iy + 1) * fx) * fy
  );
}

function intersection(from: Vec3, ray: Vec3, p: Plane): number | null {
  const normal = cross(p.u, p.v),
    denominator = dot(normal, ray);
  if (
    Math.abs(denominator) <=
    LIMITS.angularEpsilon * Math.sqrt(dot(normal, normal) * dot(ray, ray))
  )
    return null;
  return dot(normal, subtract(p.origin, from)) / denominator;
}

/** Forward projection; null means a horizon/coplanar vertex, never an enormous quad. */
export function projectVertex(
  vertex: Vec3,
  light: Vec3,
  receiver: Plane,
): Vec3 | null {
  const ray = subtract(vertex, light),
    t = intersection(light, ray, receiver);
  if (t === null || t <= 0 || !Number.isFinite(t)) return null;
  const projected = addScaled(light, ray, t);
  return projected.every(
    (n) => Number.isFinite(n) && Math.abs(n) <= LIMITS.coordinate,
  )
    ? projected
    : null;
}

function blockerAlpha(receiverPoint: Vec3, light: Vec3, caster: Plane): number {
  const ray = subtract(light, receiverPoint),
    t = intersection(receiverPoint, ray, caster);
  const distance = Math.sqrt(dot(ray, ray));
  if (
    t === null ||
    t * distance <= LIMITS.bias ||
    (1 - t) * distance <= LIMITS.bias
  )
    return 0;
  const local = subtract(addScaled(receiverPoint, ray, t), caster.origin);
  const uu = dot(caster.u, caster.u),
    uv = dot(caster.u, caster.v),
    vv = dot(caster.v, caster.v);
  const determinant = uu * vv - uv * uv;
  return (
    caster.opacity *
    alphaAt(
      caster.alpha,
      (dot(local, caster.u) * vv - dot(local, caster.v) * uv) / determinant,
      (dot(local, caster.v) * uu - dot(local, caster.u) * uv) / determinant,
    )
  );
}

/** Call validateExperiment once before iterating pixels. No stateful frame cache. */
export function directVisibility(
  scene: Experiment,
  receiverPoint: Vec3,
): number {
  if (!scene.light.enabled || !scene.receiver.receivesShadow) return 1;
  const casters = scene.casters
    .filter(
      (p) =>
        p.castsShadow &&
        p.scope === scene.receiver.scope &&
        p.id !== scene.receiver.id,
    )
    .sort(
      (a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  let sum = 0;
  for (const [x, y] of SAMPLE_OFFSETS[scene.light.samples]) {
    const emitter = addScaled(
      scene.light.position,
      [x, y, 0],
      scene.light.radius,
    );
    let transmission = 1;
    for (const caster of casters)
      transmission *= 1 - blockerAlpha(receiverPoint, emitter, caster);
    sum += transmission;
  }
  return sum / scene.light.samples;
}

/** Visibility shades CE8-L's direct term only. Inputs/outputs are premultiplied linear. */
export function shadeLinear(
  rgba: [number, number, number, number],
  ambient: number,
  direct: number,
  visibility: number,
): [number, number, number, number] {
  const gain = ambient + direct * visibility;
  if (gain === 1) return rgba;
  return [rgba[0] * gain, rgba[1] * gain, rgba[2] * gain, rgba[3]];
}
