/**
 * CG1: the color-science core against the CG0 reference vectors
 * (benchmarks/fixtures/color/cg0/vectors). Each vector file states the
 * tolerance it is good for; these tests use exactly those tolerances.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyCdl,
  applyPrimaryCorrection,
  COLOR_SPACE_IDS,
  colorSpace,
  INPUT_TRANSFORMS,
  inputTransform,
  lumaCoefficients,
  NEUTRAL_PRIMARY,
  parseCubeLut,
  rgbConversionMatrix,
  rgbToXyzMatrix,
  sampleLut,
  TRANSFER_FUNCTION_IDS,
  transferFunction,
  type Rgb,
} from "@still-shift/color-science";

const vectors = join(
  import.meta.dirname,
  "../../benchmarks/fixtures/color/cg0/vectors",
);
const read = (name: string) =>
  JSON.parse(readFileSync(join(vectors, name), "utf8"));

/** |got − want| ≤ abs + rel·|want| (the CG0 float64 port rule). */
function within(got: number, want: number, abs: number, rel = abs) {
  return Math.abs(got - want) <= abs + rel * Math.abs(want);
}
function worst(pairs: [number, number][], abs: number, rel = abs) {
  return pairs.filter(([got, want]) => !within(got, want, abs, rel));
}

describe("transfer functions (CG0 transfer-functions.json)", () => {
  const file = read("transfer-functions.json");
  it("implements exactly the 19 vector functions", () => {
    expect([...TRANSFER_FUNCTION_IDS].sort()).toEqual(
      file.functions.map((fn: { id: string }) => fn.id).sort(),
    );
  });
  for (const fn of file.functions) {
    it(`${fn.id}: encode, extra points and decode within 1e-12`, () => {
      const t = transferFunction(fn.id);
      expect(t.kind).toBe(fn.kind);
      const pairs: [number, number][] = [
        ...fn.encode.linear.map((x: number, i: number) => [
          t.encode(x),
          fn.encode.code[i],
        ]),
        ...fn.encodeExtra.linear.map((x: number, i: number) => [
          t.encode(x),
          fn.encodeExtra.code[i],
        ]),
        ...fn.decode.code.map((v: number, i: number) => [
          t.decode(v),
          fn.decode.linear[i],
        ]),
      ];
      expect(worst(pairs, 1e-12)).toEqual([]);
    });
    if (fn.anchors.length)
      it(`${fn.id}: published anchors within their stated precision`, () => {
        const t = transferFunction(fn.id);
        for (const anchor of fn.anchors)
          expect(
            Math.abs(t.encode(anchor.linear) - anchor.code),
          ).toBeLessThanOrEqual(anchor.tolerance);
      });
  }
  it("rejects unknown transfer ids", () => {
    expect(() => transferFunction("log25")).toThrow(/unknown transfer/i);
  });
});

describe("primaries and conversions (CG0 primaries.json)", () => {
  const file = read("primaries.json");
  it("covers the 19 vector color spaces", () => {
    expect([...COLOR_SPACE_IDS].sort()).toEqual(
      file.spaces.map((s: { id: string }) => s.id).sort(),
    );
  });
  for (const space of file.spaces)
    it(`${space.id}: RGB→XYZ and inverse within 1e-12`, () => {
      const m = rgbToXyzMatrix(space.id);
      const inv = rgbToXyzMatrix(space.id, "inverse");
      expect(
        worst(
          m.map((v, i) => [v, space.rgbToXyz.flat()[i]]),
          1e-12,
        ),
      ).toEqual([]);
      expect(
        worst(
          inv.map((v, i) => [v, space.xyzToRgb.flat()[i]]),
          1e-12,
        ),
      ).toEqual([]);
      expect(colorSpace(space.id).white).toEqual(space.whitepoint.xy);
      if (space.published)
        expect(
          worst(
            m.map((v, i) => [v, space.published.rgbToXyz.flat()[i]]),
            space.published.tolerance,
            0,
          ),
        ).toEqual([]);
    });
  it("luma coefficients", () => {
    for (const luma of file.luma) {
      const got = lumaCoefficients(luma.id);
      expect(got).toEqual(luma.coefficients);
    }
  });
  it("conversions, including Bradford adaptation", () => {
    const byId = Object.fromEntries(
      file.conversions.map((c: { id: string }) => [c.id, c]),
    );
    const cases: [string, number[]][] = [
      ["bt709-to-bt2020", rgbConversionMatrix("bt709", "bt2020")],
      ["aces-ap0-to-ap1", rgbConversionMatrix("aces-ap0", "aces-ap1")],
      [
        "aces-ap1-to-bt709-bradford",
        rgbConversionMatrix("aces-ap1", "bt709", "bradford"),
      ],
    ];
    for (const [id, m] of cases)
      expect(
        worst(
          m.map((v, i) => [v, byId[id].matrix.flat()[i]]),
          1e-12,
        ),
        id,
      ).toEqual([]);
  });
  it("refuses a white-point change without a stated adaptation", () => {
    expect(() => rgbConversionMatrix("aces-ap1", "bt709")).toThrow(
      /adaptation/i,
    );
  });
});

describe("camera input transforms (CG0 input-transforms.json)", () => {
  const file = read("input-transforms.json");
  for (const item of file.transforms)
    it(`${item.id}: within 2e-5 of OpenColorIO`, () => {
      const t = inputTransform(item.id);
      expect(t.status).toBe("validated");
      const pairs: [number, number][] = [];
      item.input.forEach((rgb: Rgb, i: number) => {
        const got = t.toAces2065(rgb);
        got.forEach((v, c) => pairs.push([v, item.aces2065[i][c]]));
      });
      // Relative to max(|v|, 1), as the vector file states.
      expect(
        pairs.filter(
          ([g, w]) => Math.abs(g - w) / Math.max(1, Math.abs(w)) > 2e-5,
        ),
      ).toEqual([]);
    });
  it("lists unavailable transforms and refuses to run them", () => {
    const unavailable = INPUT_TRANSFORMS.filter(
      (t) => t.status === "unavailable",
    );
    expect(unavailable.length).toBeGreaterThan(0);
    for (const t of unavailable) {
      expect(t.reason).toMatch(/\S/);
      expect(() => inputTransform(t.id).toAces2065([0.5, 0.5, 0.5])).toThrow(
        /unavailable/i,
      );
    }
    expect(() => inputTransform("log25")).toThrow(/unknown input transform/i);
  });
});

describe("ASC CDL (CG0 cdl.json)", () => {
  const file = read("cdl.json");
  for (const item of file.cases)
    it(`${item.id}: ASC v1.2 within 1e-12, no-clamp within 2e-6 of OpenColorIO`, () => {
      const cdl = {
        slope: item.slope,
        offset: item.offset,
        power: item.power,
        saturation: item.saturation,
      };
      const asc: [number, number][] = [];
      const free: [number, number][] = [];
      file.inputs.forEach((rgb: Rgb, i: number) => {
        applyCdl(rgb, cdl, "asc").forEach((v, c) =>
          asc.push([v, item.asc[i][c]]),
        );
        applyCdl(rgb, cdl, "no-clamp").forEach((v, c) =>
          free.push([v, item.noClamp[i][c]]),
        );
      });
      expect(worst(asc, 1e-12)).toEqual([]);
      expect(worst(free, 2e-6, 0)).toEqual([]);
    });
});

describe("LUTs (CG0 lut-interpolation.json and luts/*.cube)", () => {
  const file = read("lut-interpolation.json");
  for (const item of file.luts)
    it(`${item.id}: parses and interpolates within 2e-6 of OpenColorIO`, () => {
      const lut = parseCubeLut(readFileSync(join(vectors, item.file), "utf8"));
      expect(lut.size).toBe(item.size);
      expect([lut.domainMin[0], lut.domainMax[0]]).toEqual(item.domain);
      for (const method of lut.kind === "3d"
        ? (["tetrahedral", "trilinear"] as const)
        : (["linear"] as const)) {
        const pairs: [number, number][] = [];
        item.samples.forEach((rgb: Rgb, i: number) =>
          sampleLut(
            lut,
            rgb,
            method === "linear" ? "trilinear" : method,
          ).forEach((v, c) => pairs.push([v, item[method][i][c]])),
        );
        expect(worst(pairs, 2e-6, 0), method).toEqual([]);
      }
    });
  it("keeps table values outside 0-1 (no clamping on parse)", () => {
    const lut = parseCubeLut(
      "LUT_3D_SIZE 2\n" +
        Array.from({ length: 8 }, (_, i) => `${-0.5 + i} 0 2`).join("\n"),
    );
    expect(lut.data[0]).toBe(-0.5);
    expect(lut.data[lut.data.length - 1]).toBe(2);
  });
  it("rejects malformed and oversized files with the line", () => {
    expect(() => parseCubeLut("LUT_3D_SIZE 2\n0 0 0\n")).toThrow(
      /expected 8 entries, found 1/,
    );
    expect(() => parseCubeLut("LUT_3D_SIZE 129\n")).toThrow(/size 129/);
    expect(() => parseCubeLut("LUT_3D_SIZE 2\n0 0 x\n")).toThrow(/line 2/);
    expect(() => parseCubeLut('TITLE "t"\n')).toThrow(
      /LUT_3D_SIZE or LUT_1D_SIZE/,
    );
    expect(() =>
      parseCubeLut(
        "LUT_3D_SIZE 2\nDOMAIN_MIN 1 1 1\nDOMAIN_MAX 0 0 0\n" +
          "0 0 0\n".repeat(8),
      ),
    ).toThrow(/domain/i);
  });
  it("identity LUTs of several sizes are identities within 1e-12", () => {
    for (const size of [2, 17, 33]) {
      const rows: string[] = [];
      for (let b = 0; b < size; b++)
        for (let g = 0; g < size; g++)
          for (let r = 0; r < size; r++)
            rows.push(`${r / (size - 1)} ${g / (size - 1)} ${b / (size - 1)}`);
      const lut = parseCubeLut(`LUT_3D_SIZE ${size}\n${rows.join("\n")}\n`);
      for (const rgb of [
        [0.1, 0.5, 0.9],
        [0, 1, 0.333],
        [0.71, 0.29, 0.5],
      ] as Rgb[])
        for (const method of ["tetrahedral", "trilinear"] as const)
          sampleLut(lut, rgb, method).forEach((v, c) =>
            expect(Math.abs(v - rgb[c]!)).toBeLessThan(1e-12),
          );
    }
  });
});

describe("primary correction float64 reference (ported, unclamped)", () => {
  it("neutral parameters are an exact identity, including out-of-range values", () => {
    for (const rgb of [
      [0, 0.5, 1],
      [-0.2, 1.7, 0.18],
      [12, -3, 0.001],
    ] as Rgb[])
      expect(applyPrimaryCorrection(rgb, NEUTRAL_PRIMARY)).toEqual(rgb);
  });
  it("a value pushed above 1 by one correction is recovered by the next", () => {
    const up = applyPrimaryCorrection([0.6, 0.7, 0.9], {
      ...NEUTRAL_PRIMARY,
      gain: [2, 2, 2],
    });
    expect(Math.max(...up)).toBeGreaterThan(1);
    const back = applyPrimaryCorrection(up, {
      ...NEUTRAL_PRIMARY,
      gain: [0.5, 0.5, 0.5],
    });
    expect(
      worst(
        back.map((v, i) => [v, [0.6, 0.7, 0.9][i]!]),
        1e-15,
      ),
    ).toEqual([]);
  });
  it("matches its published form: lift, gamma, gain, offset, contrast at pivot, Rec.709 saturation", () => {
    const c = {
      ...NEUTRAL_PRIMARY,
      lift: [0.02, 0, -0.01],
      gamma: [1.1, 1, 0.9],
      gain: [1.2, 1, 0.95],
      offset: [0.01, 0, 0],
      contrast: 1.3,
      pivot: 0.435,
      saturation: 0.8,
    } as const;
    const rgb: Rgb = [0.3, 0.5, 0.7];
    const step = rgb
      .map(
        (v, i) =>
          Math.pow(v + c.lift[i]!, 1 / c.gamma[i]!) * c.gain[i]! + c.offset[i]!,
      )
      .map((v) => v * c.contrast + c.pivot * (1 - c.contrast));
    const y = 0.2126 * step[0]! + 0.7152 * step[1]! + 0.0722 * step[2]!;
    const want = step.map((v) => y * (1 - c.saturation) + v * c.saturation);
    expect(
      worst(
        applyPrimaryCorrection(rgb, c).map((v, i) => [v, want[i]!]),
        1e-15,
      ),
    ).toEqual([]);
  });
});
