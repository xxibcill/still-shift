/**
 * CGA2 A3: look 2. Its models recover known transforms from synthetic block
 * pairs, a look-1 file applied through look 2 matches `color.matrix`, a look's
 * strength mixes the whole look, and exports round-trip through `grade.lut`
 * (CG5's bound) and ASC CDL.
 */
import { describe, expect, it } from "vitest";
import {
  applyCdl,
  parseCdlXml,
  parseCubeLut,
  pchip,
  type Rgb,
} from "@still-shift/color-science";
import {
  applyColorEffects,
  colorBlockMeans,
  colorLookApplyEffects,
  colorLookEffectParams,
  engineEffects,
  colorLookLegacyParams,
  colorLookModelOps,
  colorLookOps,
  colorLookOpsResidual,
  colorLookResidual,
  colorLookStack,
  colorLookStackOps,
  COLOR_LOOK_2_VERSION,
  COLOR_LOOK_LUT_SIZE,
  exportColorLook,
  fitColorLookLut,
  fitColorLookModel,
  fitColorMatrix,
  fitColorMatrixRows,
  parseAnyColorLook,
  parseColorLook2,
  type AnyColorLook,
  type ColorBlockSet,
  type ColorCorrectionEffect,
  type ColorLook,
  type ColorLook2,
  type ColorLookLut,
} from "@still-shift/animation-engine";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";

/** A deterministic generator (LCG), so every run fits the same data. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}
const quantize = (v: number) =>
  v >= 1 ? 255 : v > 0 ? Math.floor(v * 255 + 0.5) : 0;
/**
 * Block pairs over `shots` shots: each 4×4 block is one color in 0.06–0.94
 * with ±2 codes of noise per pixel; after = `transform` of the noisy pixel,
 * quantized.
 */
function blockPairs(
  transform: (v: Rgb) => Rgb,
  options: {
    shots?: number;
    blocks?: number;
    seed?: number;
    range?: [number, number];
  } = {},
): ColorBlockSet[] {
  const next = random(options.seed ?? 7);
  const [lo, hi] = options.range ?? [0.06, 0.94];
  const sets: ColorBlockSet[] = [];
  for (let shot = 0; shot < (options.shots ?? 3); shot++) {
    const count = options.blocks ?? 1500;
    const before = new Uint8Array(count * 48),
      after = new Uint8Array(count * 48);
    for (let b = 0; b < count; b++) {
      const base = [0, 1, 2].map(() => lo + (hi - lo) * next());
      for (let p = 0; p < 16; p++) {
        const px = base.map((v) =>
          Math.min(255, Math.max(0, Math.round(v * 255 + (next() - 0.5) * 4))),
        );
        const out = transform(px.map((v) => v / 255) as unknown as Rgb);
        for (let c = 0; c < 3; c++) {
          before[b * 48 + p * 3 + c] = px[c]!;
          after[b * 48 + p * 3 + c] = quantize(out[c]!);
        }
      }
    }
    sets.push({ shot, count, before, after });
  }
  return sets;
}
const MATRIX = {
  rr: 1.08,
  rg: -0.05,
  rb: -0.02,
  gr: -0.03,
  gg: 1.04,
  gb: -0.02,
  br: -0.04,
  bg: -0.08,
  bb: 1.12,
  ro: -0.01,
  go: 0.004,
  bo: 0.02,
};
const matrix = (v: Rgb): Rgb => [
  MATRIX.rr * v[0] + MATRIX.rg * v[1] + MATRIX.rb * v[2] + MATRIX.ro,
  MATRIX.gr * v[0] + MATRIX.gg * v[1] + MATRIX.gb * v[2] + MATRIX.go,
  MATRIX.br * v[0] + MATRIX.bg * v[1] + MATRIX.bb * v[2] + MATRIX.bo,
];
/** A soft S-curve per channel, each a little different. */
const TONE = [0.9, 1, 1.1].map((k) =>
  pchip([
    [0, 0],
    [0.25, 0.2 * k],
    [0.5, 0.5],
    [0.75, 1 - 0.2 / k],
    [1, 1],
  ]),
);
const curved = (v: Rgb): Rgb => {
  const m = matrix(v);
  return [TONE[0]!(m[0]), TONE[1]!(m[1]), TONE[2]!(m[2])];
};
const CDL = {
  slope: [1.1, 0.95, 1.05] as Rgb,
  offset: [-0.02, 0.01, 0.03] as Rgb,
  power: [1.2, 0.9, 1.1] as Rgb,
  saturation: 0.85,
};
const cdl = (v: Rgb) => applyCdl(v, CDL, "no-clamp");

/** Every 8-bit color on a coarse cube plus the neutral ramp, opaque RGBA. */
const CUBE = (() => {
  const values: number[] = [];
  for (let r = 0; r < 256; r += 15)
    for (let g = 0; g < 256; g += 15)
      for (let b = 0; b < 256; b += 15) values.push(r, g, b, 255);
  for (let v = 0; v < 256; v++) values.push(v, v, v, 255);
  return new Uint8Array(values);
})();
const maxDifference = (a: Uint8Array, b: Uint8Array) => {
  let max = 0;
  for (let i = 0; i < a.length; i += 4)
    for (let c = 0; c < 3; c++)
      max = Math.max(max, Math.abs(a[i + c]! - b[i + c]!));
  return max;
};
/** Apply float ops to the cube with one quantization (the renderer's math). */
const applyOps = (
  ops: readonly { apply: (v: Rgb) => Rgb }[],
  rgba: Uint8Array,
) => {
  const out = new Uint8Array(rgba);
  for (let i = 0; i < out.length; i += 4) {
    let v: Rgb = [out[i]! / 255, out[i + 1]! / 255, out[i + 2]! / 255];
    for (const op of ops) v = op.apply(v);
    for (let c = 0; c < 3; c++) out[i + c] = quantize(v[c]!);
  }
  return out;
};

const look1 = (params: Record<string, number>): ColorLook => ({
  schemaVersion: "still-shift-look-1",
  kind: "color-matrix",
  space: "encoded-srgb",
  params,
  summary: { neutralGains: [1, 1, 1], lumaChange: 0, saturationScale: 1 },
  fit: {
    method: "test",
    afterInterpretation: "code-values",
    afterTransfer: "bt709",
    pairs: 1,
    pixels: 16,
    residual: {
      pixels: 16,
      rms: 0,
      p95: 0,
      p99: 0,
      max: 0,
      blockRms: 0,
      blockP95: 0,
      blockP99: 0,
    },
    heldOut: null,
    shots: [],
    unmatchedShots: [],
  },
  sources: { before: [], after: { name: "after.mp4", sha256: "sha256:x" } },
});
/** A look-2 document around a list of effects (fit report minimal). */
const look2 = (
  effects: ColorLook2["effects"],
  model: ColorLook2["model"],
  extra: Partial<ColorLook2> = {},
): ColorLook2 =>
  parseColorLook2({
    schemaVersion: COLOR_LOOK_2_VERSION,
    model,
    space: "encoded-srgb",
    effects,
    assets: [],
    summary: { neutralGains: [1, 1, 1], lumaChange: 0, saturationScale: 1 },
    fit: {
      method: "test",
      afterInterpretation: "code-values",
      afterTransfer: "bt709",
      pairs: 1,
      pixels: 16,
      selection: {
        requested: "auto",
        basis: "held-out",
        penaltyPerParameter: 0.002,
        rule: "test",
      },
      candidates: [],
      residual: look1({}).fit.residual,
      heldOut: null,
      shots: [],
      unmatchedShots: [],
    },
    sources: { before: [], after: { name: "after.mp4", sha256: "sha256:x" } },
    ...extra,
  });

describe("look 2 models", () => {
  it("model 1 in encoded sRGB is look 1's fit", () => {
    const sets = blockPairs(matrix);
    const fit = fitColorLookModel(sets, "matrix", "encoded-srgb");
    expect(fit.effects).toEqual([
      { id: "look", effect: "grade.rgb-mixer", params: fitColorMatrix(sets) },
    ]);
    expect(fitColorMatrixRows(colorBlockMeans(sets))).toHaveLength(3);
  });

  it("each model recovers its own kind of transform best", () => {
    const residual = (
      sets: ColorBlockSet[],
      model: "matrix" | "cdl" | "matrix-curves",
    ) =>
      colorLookOpsResidual(
        colorLookModelOps(fitColorLookModel(sets, model, "encoded-srgb")),
        sets,
      );
    // A CDL with power and saturation: the CDL model fits it to the noise.
    const cdlSets = blockPairs(cdl);
    const onCdl = residual(cdlSets, "cdl");
    expect(onCdl.blockRms).toBeLessThan(0.35);
    expect(onCdl.blockRms).toBeLessThan(
      residual(cdlSets, "matrix").blockRms / 2,
    );
    // A matrix then per-channel tone curves: model 3 fits it, model 1 cannot.
    const curveSets = blockPairs(curved);
    const onCurves = residual(curveSets, "matrix-curves");
    expect(onCurves.blockRms).toBeLessThan(0.6);
    expect(onCurves.blockRms).toBeLessThan(
      residual(curveSets, "matrix").blockRms / 3,
    );
    // Model 3 is monotone per channel and stays inside the curve contract.
    const curves = fitColorLookModel(curveSets, "matrix-curves", "encoded-srgb")
      .effects[1]!;
    for (const name of ["red", "green", "blue"]) {
      const points = curves.params[name] as number[][];
      expect(points.length).toBeLessThanOrEqual(16);
      expect(points[0]![0]).toBe(0);
      expect(points.at(-1)![0]).toBe(1);
      points.forEach((p, i) => {
        if (i) expect(p[1]!).toBeGreaterThanOrEqual(points[i - 1]![1]!);
      });
    }
  });

  it("the linear-light space wraps the model in a 2.2 power and its inverse", () => {
    const sets = blockPairs(matrix);
    const fit = fitColorLookModel(sets, "matrix", "linear-gamma-2.2");
    expect(fit.effects.map((effect) => [effect.id, effect.effect])).toEqual([
      ["look-linear", "grade.cdl"],
      ["look-mixer", "grade.rgb-mixer"],
      ["look-encode", "grade.cdl"],
    ]);
    // Without the mixer the transfer pair is the identity within one code.
    const pair = colorLookOps([fit.effects[0]!, fit.effects[2]!]);
    expect(maxDifference(applyOps(pair, CUBE), CUBE)).toBeLessThanOrEqual(1);
  });

  it("the LUT keeps model 3 where no sample lands and counts those nodes", () => {
    // Samples only in the lower half of every channel.
    const sets = blockPairs(curved, { range: [0.06, 0.45] });
    const base = fitColorLookModel(sets, "matrix-curves", "encoded-srgb");
    const fit = fitColorLookLut(sets, base);
    const nodes = COLOR_LOOK_LUT_SIZE ** 3;
    expect(fit.lutFill!.nodes).toBe(nodes);
    expect(fit.lutFill!.filled).toBeGreaterThan(nodes / 2);
    expect(fit.lutFill!.filled).toBeLessThan(nodes);
    // The white node is far from every sample: model 3 exactly.
    const ops = colorLookModelOps(base);
    let white: Rgb = [1, 1, 1];
    for (const op of ops) white = op.apply(white);
    const last = fit.lut!.data.length - 3;
    for (let c = 0; c < 3; c++) expect(fit.lut!.data[last + c]).toBe(white[c]);
    // Where it is sampled the LUT fits at least as well as its base.
    expect(
      colorLookOpsResidual(colorLookModelOps(fit), sets).blockRms,
    ).toBeLessThanOrEqual(colorLookOpsResidual(ops, sets).blockRms + 0.05);
  });

  it("residuals through the float ops agree with look 1's integer path in range", () => {
    const sets = blockPairs(matrix);
    const params = fitColorMatrix(sets);
    const float = colorLookOpsResidual(
      colorLookOps([{ id: "look", effect: "grade.rgb-mixer", params }]),
      sets,
    );
    const integer = colorLookResidual(params, sets);
    expect(Math.abs(float.rms - integer.rms)).toBeLessThan(0.1);
    expect(Math.abs(float.blockRms - integer.blockRms)).toBeLessThan(0.1);
  });
});

describe("look 2 documents", () => {
  it("reads a look-1 file as itself and as a one-entry grade.rgb-mixer look", () => {
    const look = look1(MATRIX);
    expect(parseAnyColorLook(JSON.parse(JSON.stringify(look)))).toEqual(look);
    expect(colorLookStack(look)).toEqual([
      { id: "look", effect: "grade.rgb-mixer", params: MATRIX },
    ]);
    expect(colorLookLegacyParams(look)).toEqual(MATRIX);
  });

  it("validates effects against the contract and LUT bindings", () => {
    const code = (value: unknown) => {
      try {
        parseAnyColorLook(value);
        return "ok";
      } catch (error) {
        return passageDiagnostics(error)[0]!.code;
      }
    };
    const valid = look2(
      [{ id: "look-cdl", effect: "grade.cdl", params: { slopeR: 1.2 } }],
      "cdl",
    );
    expect(code(JSON.parse(JSON.stringify(valid)))).toBe("ok");
    expect(
      code({
        ...valid,
        effects: [{ id: "x", effect: "grade.cdl", params: { slopeR: 99 } }],
      }),
    ).toBe("comp-look-format");
    expect(
      code({
        ...valid,
        effects: [{ id: "x", effect: "grade.lut", params: {} }],
      }),
    ).toBe("comp-look-format");
    expect(
      code({
        ...valid,
        effects: [
          {
            id: "x",
            effect: "grade.lut",
            params: {},
            assets: { lut: "missing" },
          },
        ],
      }),
    ).toBe("comp-look-format");
    // Keys are not look operators (a look must bake to a LUT).
    expect(
      code({
        ...valid,
        effects: [{ id: "x", effect: "grade.key", params: {} }],
      }),
    ).toBe("comp-look-format");
    // A LUT in another space would render through CG7's conversions, which
    // the look's prediction, fit and export do not model.
    const lutLook = (inputSpace: string) => ({
      ...valid,
      effects: [
        { id: "x", effect: "grade.lut", params: {}, assets: { lut: "l" } },
      ],
      assets: [
        {
          id: "l",
          type: "lut",
          path: "look.cube",
          sha256: `sha256:${"0".repeat(64)}`,
          format: "cube",
          inputSpace,
          outputSpace: "legacy-srgb",
        },
      ],
    });
    expect(code(lutLook("legacy-srgb"))).toBe("ok");
    expect(code(lutLook("srgb"))).toBe("ok");
    expect(code(lutLook("acescct"))).toBe("comp-look-format");
  });

  it("the legacy engine applies look 1 only", () => {
    const mixer = look2(
      [{ id: "look", effect: "grade.rgb-mixer", params: MATRIX }],
      "matrix",
    );
    expect(colorLookLegacyParams(mixer)).toEqual(MATRIX);
    const curves = look2(
      [
        { id: "look-mixer", effect: "grade.rgb-mixer", params: MATRIX },
        {
          id: "look-curves",
          effect: "grade.curves",
          params: {
            red: [
              [0, 0],
              [0.5, 0.45],
              [1, 1],
            ],
          },
        },
      ],
      "matrix-curves",
    );
    try {
      colorLookLegacyParams(curves);
      expect.unreachable();
    } catch (error) {
      expect(passageDiagnostics(error)[0]!.code).toBe("comp-look-engine");
    }
  });
});

describe("applying look 2", () => {
  it("a look-1 file through look 2 matches color.matrix within the CG2 parity bound", () => {
    for (const strength of [0.6, 1]) {
      // The same effect as A1's mapping of the look's color.matrix.
      expect(colorLookApplyEffects(look1(MATRIX), strength)).toEqual(
        engineEffects("grade", [
          {
            id: "look",
            effect: "color.matrix",
            params: colorLookEffectParams(look1(MATRIX), strength),
          },
        ]),
      );
      const legacy = applyColorEffects(
        [
          {
            id: "look",
            effect: "color.matrix",
            params: { ...MATRIX, strength },
          },
        ],
        CUBE,
      );
      const grade = applyColorEffects(
        colorLookApplyEffects(
          look1(MATRIX),
          strength,
        ) as ColorCorrectionEffect[],
        CUBE,
      );
      expect(maxDifference(legacy, grade)).toBeLessThanOrEqual(1);
    }
  });

  it("a longer look's strength mixes the whole look, and a closing key stops it", () => {
    const look = look2(
      [
        { id: "look-mixer", effect: "grade.rgb-mixer", params: MATRIX },
        {
          id: "look-curves",
          effect: "grade.curves",
          params: {
            red: [
              [0, 0],
              [0.5, 0.4],
              [1, 1],
            ],
          },
        },
      ],
      "matrix-curves",
    );
    const full = colorLookStackOps(look);
    const effects = colorLookApplyEffects(look, 0.6);
    expect(effects.map((effect) => effect.effect)).toEqual([
      "grade.key",
      "grade.rgb-mixer",
      "grade.curves",
    ]);
    const mixed = applyOps(
      [
        {
          apply: (v: Rgb): Rgb => {
            let out = v;
            for (const op of full) out = op.apply(out);
            return [0, 1, 2].map(
              (c) => v[c]! + 0.6 * (out[c]! - v[c]!),
            ) as unknown as Rgb;
          },
        },
      ],
      CUBE,
    );
    expect(
      maxDifference(
        applyColorEffects(effects as ColorCorrectionEffect[], CUBE),
        mixed,
      ),
    ).toBe(0);
    // With an effect after the look, the closing key leaves it unmixed.
    const after: ColorCorrectionEffect = {
      id: "after",
      effect: "grade.primary",
      params: { gainMaster: 1.2 },
    };
    const closed = colorLookApplyEffects(look, 0.6, new Map(), {
      closed: true,
    });
    expect(closed.at(-1)).toEqual({
      id: "look-end",
      effect: "grade.key",
      params: {},
    });
    const gain = applyOps(
      [
        {
          apply: (v: Rgb): Rgb => {
            let out = v;
            for (const op of full) out = op.apply(out);
            return [0, 1, 2].map(
              (c) => (v[c]! + 0.6 * (out[c]! - v[c]!)) * 1.2,
            ) as unknown as Rgb;
          },
        },
      ],
      CUBE,
    );
    expect(
      maxDifference(
        applyColorEffects(
          [...(closed as ColorCorrectionEffect[]), after],
          CUBE,
        ),
        gain,
      ),
    ).toBe(0);
    // At full strength there is no key.
    expect(
      colorLookApplyEffects(look, 1).map((effect) => effect.effect),
    ).toEqual(["grade.rgb-mixer", "grade.curves"]);
  });
});

describe("exporting look 2", () => {
  const curvesLook = () => {
    const sets = blockPairs(curved);
    const fit = fitColorLookModel(sets, "matrix-curves", "encoded-srgb");
    return look2(fit.effects as ColorLook2["effects"], "matrix-curves");
  };
  /** The exported table applied through grade.lut against the look itself. */
  const roundTrip = (
    look: AnyColorLook,
    luts: ReadonlyMap<string, ColorLookLut>,
    size?: number,
  ) => {
    const { text, report } = exportColorLook(look, luts, {
      format: "cube",
      ...(size ? { size } : {}),
    });
    expect(report.sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    const lutOps = colorLookOps(
      [{ id: "lut", effect: "grade.lut", params: {}, assets: { lut: "x" } }],
      new Map([["x", parseCubeLut(text)]]),
    );
    return maxDifference(
      applyOps(lutOps, CUBE),
      applyOps(colorLookStackOps(look, luts), CUBE),
    );
  };

  it("a .cube round-trips through grade.lut within the CG5 bound", () => {
    // CG5: 33³ within 2 code values, 65³ within 1.
    expect(roundTrip(curvesLook(), new Map())).toBeLessThanOrEqual(2);
    expect(roundTrip(curvesLook(), new Map(), 65)).toBeLessThanOrEqual(1);
    expect(roundTrip(look1(MATRIX), new Map())).toBeLessThanOrEqual(2);
    // The export measures its own round trip and says when it exceeds the
    // bound: a linear-light CDL bends sharply near black (the 2.2 encode has
    // a vertical tangent where a channel crosses zero).
    const linear = fitColorLookModel(
      blockPairs(cdl),
      "cdl",
      "linear-gamma-2.2",
    );
    const linearLook = look2(linear.effects as ColorLook2["effects"], "cdl", {
      space: "linear-gamma-2.2",
    });
    const exported = exportColorLook(linearLook, new Map(), { format: "cube" });
    expect(exported.report.roundTrip!.colors).toBe(52 ** 3 + 256);
    if (exported.report.roundTrip!.maxCodes > 2)
      expect(exported.report.notes[0]).toMatch(/near black, in linear light/);
    else expect(exported.report.notes).toEqual([]);
    const encoded = exportColorLook(curvesLook(), new Map(), {
      format: "cube",
    });
    expect(encoded.report.roundTrip!.maxCodes).toBeLessThanOrEqual(2);
    expect(encoded.report.notes).toEqual([]);
  });

  it("a LUT look exports its own table (resampled) within the CG5 bound", () => {
    const sets = blockPairs(curved);
    const fit = fitColorLookLut(
      sets,
      fitColorLookModel(sets, "matrix-curves", "encoded-srgb"),
    );
    const look = look2(fit.effects as ColorLook2["effects"], "lut", {
      assets: [
        {
          id: "look-lut",
          type: "lut",
          path: "look.cube",
          sha256: `sha256:${"0".repeat(64)}`,
          format: "cube",
          inputSpace: "legacy-srgb",
          outputSpace: "legacy-srgb",
        },
      ],
    });
    const luts = new Map([
      [
        "look-lut",
        { asset: look.assets[0]!, path: "/look.cube", lut: fit.lut! },
      ],
    ]);
    // 33³ on the same grid holds the table's nodes exactly.
    expect(roundTrip(look, luts)).toBeLessThanOrEqual(1);
  });

  it("a .cube at a partial strength is that mix of the look", () => {
    const look = curvesLook();
    const { text } = exportColorLook(look, new Map(), {
      format: "cube",
      strength: 0.6,
    });
    const lutOps = colorLookOps(
      [{ id: "lut", effect: "grade.lut", params: {}, assets: { lut: "x" } }],
      new Map([["x", parseCubeLut(text)]]),
    );
    const effects = colorLookApplyEffects(look, 0.6) as ColorCorrectionEffect[];
    expect(
      maxDifference(applyOps(lutOps, CUBE), applyColorEffects(effects, CUBE)),
    ).toBeLessThanOrEqual(2);
  });

  it("a CDL look exports as ASC CDL and other looks refuse", () => {
    const sets = blockPairs(cdl);
    const fit = fitColorLookModel(sets, "cdl", "encoded-srgb");
    const look = look2(fit.effects as ColorLook2["effects"], "cdl");
    const { text, report } = exportColorLook(look, new Map(), { format: "cc" });
    const parsed = parseCdlXml(text);
    expect(parsed.corrections).toHaveLength(1);
    const params = fit.effects[0]!.params as Record<string, number>;
    expect(parsed.corrections[0]!.cdl.slope).toEqual([
      params.slopeR,
      params.slopeG,
      params.slopeB,
    ]);
    expect(parsed.corrections[0]!.cdl.saturation).toBe(params.saturation);
    expect(report.notes).toHaveLength(1);
    for (const other of [curvesLook(), look1(MATRIX)])
      try {
        exportColorLook(other, new Map(), { format: "cc" });
        expect.unreachable();
      } catch (error) {
        expect(passageDiagnostics(error)[0]!.code).toBe("comp-look-export");
      }
  });
});
