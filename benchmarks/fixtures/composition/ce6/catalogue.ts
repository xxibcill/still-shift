import { bakeCubeLut, writeCubeLut } from "@still-shift/color-science";
import {
  FLOAT_GRADE_EFFECT_IDS,
  GRADE_EFFECT_IDS,
} from "@still-shift/scene-contract";
import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";

type Effect = NonNullable<CompositionLayer["effects"]>[number];
const animated = (from: number, to: number) => ({
  keys: [
    { frame: 0, value: from, easing: "linear" as const },
    { frame: 31, value: to, easing: "linear" as const },
  ],
});

/** Representative controls shared by stored native scenes and serial cost probes. */
export function ce6EffectCases(
  width = 320,
  height = 180,
): Record<string, NonNullable<Effect["params"]>> {
  return {
    "color.curves": {
      curve: [
        [0, 0],
        [0.3, 0.5],
        [0.7, 0.8],
        [1, 1],
      ],
      amount: 0.8,
    },
    "color.levels": { inputBlack: 0.05, inputWhite: 0.9, gamma: 0.8 },
    "color.tint": { black: "#18304d", white: "#ffe7ac", amount: 0.6 },
    "color.hue-saturation": { hue: 35, saturation: 20, lightness: 5 },
    "color.exposure": { exposure: 0.25, gamma: 0.9 },
    "color.brightness-contrast": { brightness: 0.08, contrast: 0.15 },
    "color.fill": { color: "#29bdb4", amount: 0.45 },
    "color.gradient-ramp": {
      start: [0, 0],
      end: [width, height],
      startColor: "#274caa",
      endColor: "#ffc85a",
      amount: 0.7,
    },
    "color.invert": { amount: 0.65 },
    "color.posterize": { levels: 5 },
    "color.matrix": {
      rr: 1.18,
      rg: -0.12,
      rb: -0.06,
      gr: -0.05,
      gg: 1.1,
      gb: -0.05,
      br: -0.08,
      bg: -0.14,
      bb: 1.28,
      bo: 0.02,
      strength: animated(0.2, 1),
    },
    "color.white-balance": { temperature: animated(-40, 40), tint: 15 },
    "color.vibrance": { vibrance: animated(0, 80), saturation: 10 },
    "grade.primary": {
      liftMaster: 0.04,
      gammaB: 0.9,
      gainMaster: animated(0.8, 1.6),
      contrast: 1.2,
      pivot: 0.45,
      saturation: 1.3,
      hue: animated(-20, 20),
      shadows: 0.2,
    },
    "grade.white-balance": {
      temperature: animated(3000, 9000),
      tint: 12,
    },
    "grade.cdl": {
      slopeR: 1.1,
      slopeB: 0.92,
      offsetG: animated(-0.05, 0.05),
      powerR: 0.9,
      powerB: 1.15,
      saturation: 1.2,
    },
    "grade.rgb-mixer": {
      rr: 1.2,
      rg: -0.15,
      gb: -0.1,
      bb: 1.25,
      bo: 0.02,
      strength: animated(0.2, 1),
    },
    "grade.curves": {
      master: [
        [0, 0],
        [0.25, 0.18],
        [0.75, 0.84],
        [1, 1],
      ],
      red: [[0, 0.04], { x: 0.5, y: animated(0.45, 0.6) }, [1, 1]],
      lumaMix: 0.3,
    },
    "grade.hue-curves": {
      hueVsHue: [
        [0, 0.5],
        { x: 0.1, y: animated(0.5, 0.62) },
        [0.3, 0.5],
        [1, 0.5],
      ],
      hueVsSat: [
        [0, 0.7],
        [0.5, 0.5],
        [1, 0.7],
      ],
      satVsLum: [
        [0, 0.5],
        [1, 0.42],
      ],
    },
    "grade.tonal": {
      shadowB: 0.05,
      highlightR: 0.04,
      shadowExposure: animated(0, 0.8),
      highlightExposure: -0.4,
      softClipHigh: 0.85,
    },
    "transition.linear-wipe": {
      progress: animated(0.1, 0.85),
      softness: 0.15,
      angle: 25,
    },
    "transition.radial-wipe": { progress: animated(0.1, 0.85), softness: 0.08 },
    "transition.venetian-blinds": {
      progress: animated(0.1, 0.85),
      softness: 0.1,
      width: 24,
      angle: 15,
    },
    "transition.block-dissolve": {
      progress: animated(0.1, 0.85),
      softness: 0.12,
      seed: 912,
      width: 12,
      height: 12,
    },
    "transition.gradient-wipe": {
      progress: animated(0.1, 0.85),
      softness: 0.15,
    },
    "blur.radial": { angle: 5, samples: 8 },
    "blur.zoom": { amount: 0.04, samples: 8 },
    "blur.lens": { radius: 3, samples: 12 },
    "blur.gaussian": { radius: 4 },
    "blur.directional": { length: 8, angle: 25, samples: 8 },
    "blur.primitive": { radius: 2 },
    "distort.mesh-warp": {
      size: [width, height],
      subdivisions: 12,
      controls: [
        [0, 0],
        [1, 0.03],
        [0, 1],
        [1, 1],
      ],
    },
    "distort.puppet": { rest: [], pins: [], refinement: 1 },
    "distort.transform": {
      offset: [1.5, -0.5],
      scale: [0.98, 1.02],
      rotation: 2,
    },
    "distort.corner-pin": {
      topLeft: [0.02, 0],
      topRight: [0.99, 0.02],
      bottomRight: [1, 0.99],
      bottomLeft: [0, 1],
    },
    "distort.turbulent": {
      amount: 3,
      scale: 32,
      octaves: 3,
      evolution: animated(0.25, 2.75),
      seed: 412,
    },
    "distort.bulge": { radius: [width, height], amount: 0.12 },
    "distort.ripple": {
      amplitude: 2,
      wavelength: 32,
      phase: animated(0, 2),
      decay: 0.15,
    },
    "distort.displacement-map": {
      amount: [4, -3],
      channelX: 0,
      channelY: 1,
      midpoint: 0.5,
    },
    "distort.sine": { amount: 2, wavelength: 32, phase: animated(0, 2) },
    "stylize.fractal-noise": {
      amount: 0.35,
      scale: 32,
      octaves: 3,
      evolution: animated(0.25, 2.75),
      seed: 681,
      dark: "#173553",
      light: "#f3cb77",
    },
    "stylize.grain": {
      amount: 0.08,
      seed: 835,
      evolution: animated(0.25, 3.75),
    },
    "stylize.vignette": {
      radius: [width * 0.8, height * 0.8],
      softness: 0.6,
      amount: 0.4,
    },
    "stylize.chromatic-aberration": { offset: [1, -0.5], amount: 0.65 },
    "time.echo": { count: 3, spacing: 2, decay: 0.45 },
    "light.drop-shadow": {
      offset: [3, 2],
      blur: 3,
      opacity: 0.7,
      color: "#172745",
    },
    "light.inner-shadow": {
      offset: [2, 2],
      blur: 3,
      opacity: 0.6,
      color: "#172745",
    },
    "light.glow": { radius: 3, threshold: 0.3, intensity: 0.3 },
    "light.sweep": {
      width,
      height,
      band: 0.2,
      progress: animated(0, 1),
      strength: 0.3,
    },
    "light.radial": {
      x: width / 2,
      y: height / 2,
      radius: width * 0.7,
      strength: 0.25,
      color: "#9abbd4",
    },
    "particles.rise": {
      count: 12,
      radius: 2,
      opacity: 0.3,
      seed: 891,
      progress: animated(0, 1),
      color: "#f9db99",
    },
  };
}

export const CE6_NATIVE_FIXTURES = [
  "catalogue-color",
  "catalogue-blur",
  "catalogue-distortion",
  "catalogue-stylize-light",
  "catalogue-transition",
  "catalogue-history-linear",
  "catalogue-mesh",
  "catalogue-grade",
  "catalogue-float-grade",
  "catalogue-curve-grade",
  "catalogue-lut-grade",
  "catalogue-key-grade",
] as const;
/** CGA grade effects, kept out of the frozen color catalogue cell layout. */
const GRADE_EFFECTS: readonly string[] = GRADE_EFFECT_IDS;
/** The CG2 float grade cell keeps its four effects (and its baseline). */
export const CG2_FLOAT_GRADE_EFFECTS = FLOAT_GRADE_EFFECT_IDS.slice(0, 4);
/** CG4 curve and tonal grade effects: their own cell and baseline file. */
export const CG4_CURVE_GRADE_EFFECTS = FLOAT_GRADE_EFFECT_IDS.slice(4, 7);
/**
 * CG5: grade.lut, its own cell and baseline file. Its LUT asset is generated
 * here (license-free) and committed as `lut-grade.cube`; the unit test checks
 * the file against this text and its pinned hash.
 */
export const CG5_LUT_GRADE_EFFECTS = FLOAT_GRADE_EFFECT_IDS.slice(7, 8);
/**
 * CG6: grade.key, its own cell and baseline file. A key alone changes
 * nothing, so the cell keys a grade.primary on the orange paint inside an
 * animated ellipse window, with matte finesse.
 */
export const CG6_KEY_GRADE_EFFECTS = FLOAT_GRADE_EFFECT_IDS.slice(8, 9);
const KEY_GRADE_PARAMS = {
  qualifier: 1,
  hueCenter: 38,
  hueWidth: 30,
  hueSoftness: 15,
  saturationMin: 0.3,
  saturationSoftness: 0.1,
  blur: 1.5,
  shrinkGrow: 1,
  window: 1,
  windowCenter: {
    keys: [
      { frame: 0, value: [30, 70], easing: "linear" as const },
      { frame: 31, value: [50, 110], easing: "linear" as const },
    ],
  },
  windowSize: [60, 90],
  windowRotation: 20,
  windowFeather: 6,
};
const KEYED_GRADE_PARAMS = { hue: 120, saturation: 1.4, gainMaster: 1.1 };
export const CE6_LUT_FILE = "lut-grade.cube";
export const CE6_LUT_SHA256 =
  "sha256:100e6cd1bbe34bea93153ff71dd5d2dd20b05a6a90a44a9a5edeb7f6d9ad703d";
export function ce6LutText(): string {
  // A warm, gently compressed look on a 17-point grid.
  const look = ([r, g, b]: readonly number[]) =>
    [
      0.04 + 0.92 * Math.pow(r!, 0.95) + 0.03 * g! * b!,
      0.02 + 0.9 * g! + 0.04 * r! * (1 - g!),
      0.06 + 0.82 * Math.pow(b!, 1.1) - 0.03 * r! * g!,
    ] as [number, number, number];
  return writeCubeLut(
    bakeCubeLut(look, 17, {
      title: "Still Shift CE6 generated LUT (license-free test data)",
    }),
  );
}
/** grade.lut needs an asset, so it is not in ce6EffectCases (the cost probe). */
const LUT_GRADE_PARAMS = {
  intensity: {
    keys: [
      { frame: 0, value: 0.4, easing: "linear" as const },
      { frame: 31, value: 1, easing: "linear" as const },
    ],
  },
};

/** Each catalogue cell is a native isolated group with independently moving paints. */
export function ce6NativeFixtures(): [string, Composition][] {
  const cases = ce6EffectCases(),
    families = [
      Object.keys(cases).filter(
        (id) => id.startsWith("color.") && !GRADE_EFFECTS.includes(id),
      ),
      Object.keys(cases).filter((id) => id.startsWith("blur.")),
      Object.keys(cases).filter(
        (id) =>
          id.startsWith("distort.") &&
          id !== "distort.mesh-warp" &&
          id !== "distort.puppet",
      ),
      Object.keys(cases).filter(
        (id) =>
          id.startsWith("stylize.") ||
          id.startsWith("light.") ||
          id === "particles.rise",
      ),
      Object.keys(cases).filter((id) => id.startsWith("transition.")),
      ["time.echo", "distort.displacement-map", "transition.gradient-wipe"],
      ["distort.mesh-warp", "distort.puppet"],
      [...GRADE_EFFECTS],
      [...CG2_FLOAT_GRADE_EFFECTS],
      [...CG4_CURVE_GRADE_EFFECTS],
      [...CG5_LUT_GRADE_EFFECTS],
      [...CG6_KEY_GRADE_EFFECTS],
    ];
  return families.map((effects, family) => {
    const doc: Composition = {
      schemaVersion: "composition-1",
      id: CE6_NATIVE_FIXTURES[family]!,
      width: 320,
      height: 180,
      fps: 24,
      frameCount: 32,
      assets: [],
      background: "#101a2a",
      layers: [],
    };
    if (family === 5) doc.colorSpace = "linear-srgb";
    if (effects.includes("grade.lut"))
      doc.assets.push({
        id: "look",
        type: "lut",
        path: CE6_LUT_FILE,
        sha256: CE6_LUT_SHA256,
        format: "cube",
        inputSpace: "legacy-srgb",
        outputSpace: "legacy-srgb",
      });
    const columns = 4,
      rows = Math.ceil(effects.length / columns),
      cellWidth = 80,
      cellHeight = 180 / rows;
    for (const [index, id] of effects.entries()) {
      const group = `cell-${index}`,
        source =
          id === "distort.displacement-map" ||
          id === "transition.gradient-wipe";
      doc.layers.push({
        id: group,
        type: "group",
        size: [cellWidth, cellHeight],
        transform: {
          anchor: [0, 0],
          position: [
            (index % columns) * cellWidth,
            Math.floor(index / columns) * cellHeight,
          ],
        },
        effects: [
          {
            id: "treatment",
            effect: id,
            params:
              id === "grade.lut"
                ? LUT_GRADE_PARAMS
                : id === "grade.key"
                  ? KEY_GRADE_PARAMS
                  : cases[id]!,
            ...(source ? { inputs: { map: "map" } } : {}),
            ...(id === "grade.lut" ? { assets: { lut: "look" } } : {}),
          },
          ...(id === "grade.key"
            ? [
                {
                  id: "keyed",
                  effect: "grade.primary",
                  params: KEYED_GRADE_PARAMS,
                },
              ]
            : []),
        ],
      });
      for (const [stripe, color] of ["#f0ba58", "#3baea0", "#b86884"].entries())
        doc.layers.push({
          id: `${group}-paint-${stripe}`,
          type: "solid",
          parent: group,
          size: [18, cellHeight * 0.65],
          color,
          transform: {
            anchor: [0, 0],
            position: {
              x: animated(5 + stripe * 23, 10 + stripe * 23),
              y: cellHeight * 0.2,
            },
            opacity: stripe === 1 ? 0.65 : 1,
          },
        });
    }
    doc.layers.push({
      id: "map",
      type: "solid",
      enabled: false,
      size: [320, 180],
      color: "#ffffff",
      transform: { anchor: [0, 0] },
      effects: [
        {
          id: "rank",
          effect: "color.gradient-ramp",
          params: {
            start: [0, 0],
            end: [320, 180],
            startColor: "#336699",
            endColor: "#dddddd",
          },
        },
      ],
    });
    return [doc.id, doc];
  });
}
