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
] as const;

/** Each catalogue cell is a native isolated group with independently moving paints. */
export function ce6NativeFixtures(): [string, Composition][] {
  const cases = ce6EffectCases(),
    families = [
      Object.keys(cases).filter((id) => id.startsWith("color.")),
      Object.keys(cases).filter((id) => id.startsWith("blur.")),
      Object.keys(cases).filter((id) => id.startsWith("distort.")),
      Object.keys(cases).filter(
        (id) =>
          id.startsWith("stylize.") ||
          id.startsWith("light.") ||
          id === "particles.rise",
      ),
      Object.keys(cases).filter((id) => id.startsWith("transition.")),
      ["time.echo", "distort.displacement-map", "transition.gradient-wipe"],
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
            params: cases[id]!,
            ...(source ? { inputs: { map: "map" } } : {}),
          },
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
