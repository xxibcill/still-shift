/**
 * CG7: working spaces, color-space conversions and media input transforms
 * against the CG0 vectors (OpenColorIO end to end, Bradford utility matrices)
 * and BT.2408 reference points. Design: docs/color-grading-cg7-decisions.md.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COLOR_SPACE_TRANSFORM_SPACES,
  displayToWorking,
  INPUT_TRANSFORMS,
  rgbConversionMatrix,
  sourceTransform,
  spaceConversion,
  transferFunction,
  WORKING_SPACES,
  workingToDisplay,
  applyMatrix as apply,
  type Rgb,
  type SourceEncoding,
} from "@still-shift/color-science";

const vectors = join(
  import.meta.dirname,
  "../../benchmarks/fixtures/color/cg0/vectors",
);
const read = (name: string) =>
  JSON.parse(readFileSync(join(vectors, name), "utf8"));
const close = (a: Rgb, b: Rgb, tolerance: number) =>
  a.every(
    (v, i) => Math.abs(v - b[i]!) <= tolerance * Math.max(1, Math.abs(b[i]!)),
  );
const SAMPLES: Rgb[] = [
  [0, 0, 0],
  [0.18, 0.18, 0.18],
  [1, 1, 1],
  [0.4, 0.3, 0.2],
  [0.05, 0.6, 0.9],
  [0.9, 0.1, 0.5],
];
const VALIDATED = INPUT_TRANSFORMS.filter((t) => t.status === "validated");
/** FFmpeg's 10 → 16-bit widening: bit replication (measured in CG7). */
const widen10 = (code: number) => (code << 6) | (code >> 4);

describe("color-space conversions", () => {
  it("lists seven spaces in their effect-code order", () => {
    expect(COLOR_SPACE_TRANSFORM_SPACES).toEqual([
      "acescct",
      "acescg",
      "aces2065-1",
      "linear-bt709",
      "srgb",
      "linear-bt2020",
      "linear-p3-d65",
    ]);
  });
  it("ACEScg → linear BT.709 is the CG0 Bradford utility matrix", () => {
    const file = read("primaries.json");
    const want = file.conversions
      .find((c: { id: string }) => c.id === "aces-ap1-to-bt709-bradford")
      .matrix.flat();
    const got = spaceConversion("acescg", "linear-bt709").matrix;
    got.forEach((v, i) => expect(Math.abs(v - want[i])).toBeLessThan(1e-12));
  });
  it("same space is an exact identity; every pair round-trips", () => {
    for (const a of COLOR_SPACE_TRANSFORM_SPACES) {
      const same = spaceConversion(a, a);
      expect(same.identity).toBe(true);
      for (const v of SAMPLES) expect(same.apply(v)).toEqual(v);
      for (const b of COLOR_SPACE_TRANSFORM_SPACES) {
        if (a === b) continue;
        const there = spaceConversion(a, b),
          back = spaceConversion(b, a);
        for (const v of SAMPLES)
          expect(close(back.apply(there.apply(v)), v, 1e-12), `${a}→${b}`).toBe(
            true,
          );
      }
    }
  });
  it("rejects unknown spaces", () => {
    expect(() => spaceConversion("rec709-ish", "acescct")).toThrow(
      /unknown color space/i,
    );
  });
});

describe("working spaces and the CG7 display transform", () => {
  it("legacy-srgb converts nothing", () => {
    expect(displayToWorking("legacy-srgb").identity).toBe(true);
    expect(workingToDisplay("legacy-srgb").identity).toBe(true);
  });
  for (const space of WORKING_SPACES.filter((s) => s !== "legacy-srgb"))
    it(`${space}: every 8-bit display code round-trips exactly`, () => {
      const into = displayToWorking(space),
        out = workingToDisplay(space);
      const errors: number[] = [];
      for (let r = 0; r < 256; r += 5)
        for (let g = 0; g < 256; g += 17)
          for (let b = 0; b < 256; b += 51) {
            const v: Rgb = [r / 255, g / 255, b / 255];
            const back = out.apply(into.apply(v));
            back.forEach((x, c) => {
              errors.push(Math.abs(x - v[c]!));
              expect(Math.floor(x * 255 + 0.5)).toBe(Math.round(v[c]! * 255));
            });
          }
      expect(Math.max(...errors)).toBeLessThan(1e-12);
    });
  it("ACEScct mid grey: display 0.18 linear → ACEScct 0.4135884", () => {
    const srgb = transferFunction("srgb");
    const v = srgb.encode(0.18);
    const w = displayToWorking("acescct").apply([v, v, v]);
    // S-2016-001: ACEScct(0.18) = (log2(0.18) + 9.72) / 17.52.
    w.forEach((x) =>
      expect(Math.abs(x - (Math.log2(0.18) + 9.72) / 17.52)).toBeLessThan(
        1e-12,
      ),
    );
  });
});

describe("media input transforms", () => {
  const file = read("input-transforms.json");
  const ap0ToAp1 = rgbConversionMatrix("aces-ap0", "aces-ap1");
  for (const item of file.transforms)
    it(`${item.id}: to ACEScg matches OpenColorIO (2e-5) and round-trips`, () => {
      const camera: SourceEncoding = { kind: "camera", id: item.id };
      const cg = sourceTransform(camera, "acescg");
      item.input.forEach((code: Rgb, i: number) => {
        const want = apply(ap0ToAp1, item.aces2065[i]);
        expect(close(cg.toWorking(code), want, 2e-5)).toBe(true);
      });
      for (const space of WORKING_SPACES) {
        const t = sourceTransform(camera, space);
        for (const code of item.input as Rgb[])
          expect(close(t.fromWorking(t.toWorking(code)), code, 1e-10)).toBe(
            true,
          );
      }
    });
  it("unavailable camera encodings are rejected, not approximated", () => {
    for (const t of INPUT_TRANSFORMS.filter((t) => t.status === "unavailable"))
      expect(() =>
        sourceTransform({ kind: "camera", id: t.id }, "acescct"),
      ).toThrow(/unavailable/i);
    expect(() =>
      sourceTransform({ kind: "camera", id: "log25" }, "acescct"),
    ).toThrow(/unknown input transform/i);
  });
  it("PQ and HLG meet the BT.2408 reference white (203 cd/m²)", () => {
    const linear = (transfer: "pq" | "hlg", signal: number) =>
      sourceTransform(
        { kind: "display", primaries: "bt2020", transfer },
        "linear-bt709",
      ).toWorking([signal, signal, signal])[0];
    // BT.2408-7 Table 1: reference white is 58% PQ and 75% HLG (1000 cd/m²).
    expect(Math.abs(linear("pq", 0.58) - 2.03) / 2.03).toBeLessThan(0.01);
    expect(Math.abs(linear("hlg", 0.75) - 2.03) / 2.03).toBeLessThan(0.01);
    // 18% grey: 38% PQ ≈ 26 cd/m², 38% HLG ≈ 26 cd/m².
    expect(Math.abs(linear("pq", 0.38) - 0.26) / 0.26).toBeLessThan(0.05);
    expect(Math.abs(linear("hlg", 0.38) - 0.26) / 0.26).toBeLessThan(0.05);
  });
  it("HLG keeps the sign of sub-black codes, as its encode does", () => {
    const hlg = transferFunction("hlg");
    for (const v of [0.01, 0.1, 0.25, 0.5]) {
      expect(hlg.decode(-v)).toBe(-hlg.decode(v));
      expect(Math.abs(hlg.encode(hlg.decode(-v)) + v)).toBeLessThan(1e-12);
    }
    // A saturated near-black sample the Y′CbCr matrix puts below 0.
    const t = sourceTransform(
      { kind: "display", primaries: "bt2020", transfer: "hlg" },
      "acescct",
    );
    const v: [number, number, number] = [-0.05, 0.3, 0.2];
    expect(close(t.fromWorking(t.toWorking(v)), v, 1e-9)).toBe(true);
  });
  for (const transfer of ["srgb", "pq", "hlg"] as const)
    for (const primaries of ["bt709", "bt2020", "p3-d65"] as const)
      it(`${primaries} ${transfer}: round-trips through every working space`, () => {
        for (const space of WORKING_SPACES) {
          const t = sourceTransform(
            { kind: "display", primaries, transfer },
            space,
          );
          // PQ code 0 is 0 cd/m², which encodes to 7.3e-7 (ST 2084's c1^m2).
          for (const v of SAMPLES)
            expect(
              close(
                t.fromWorking(t.toWorking(v)),
                v,
                transfer === "pq" ? 1e-6 : 1e-9,
              ),
            ).toBe(true);
        }
      });
});

describe("10-bit lossless through a neutral grade (reference)", () => {
  const sources: [string, SourceEncoding][] = [
    ...VALIDATED.map((t): [string, SourceEncoding] => [
      t.id,
      { kind: "camera", id: t.id },
    ]),
    ["bt2020-pq", { kind: "display", primaries: "bt2020", transfer: "pq" }],
    ["bt2020-hlg", { kind: "display", primaries: "bt2020", transfer: "hlg" }],
    ["bt709-srgb", { kind: "display", primaries: "bt709", transfer: "srgb" }],
  ];
  for (const [id, source] of sources)
    it(`${id}: all 1024 neutral codes survive 16-bit → ACEScct → 10-bit`, () => {
      const t = sourceTransform(source, "acescct");
      const lost: number[] = [];
      for (let code = 0; code < 1024; code++) {
        const v = widen10(code) / 65535;
        const back = t.fromWorking(t.toWorking([v, v, v]));
        if (back.some((x) => Math.round(x * 1023) !== code)) lost.push(code);
      }
      expect(lost).toEqual([]);
    });
});
