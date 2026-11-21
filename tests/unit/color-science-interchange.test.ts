/**
 * CG5: LUT and CDL interchange in @still-shift/color-science — ASC CDL XML
 * (.cc, .ccc, .cdl) read and write, `.cube` writing and baking.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyCdl,
  bakeCubeLut,
  cdlFileKind,
  cdlNumber,
  parseCdlXml,
  parseCubeLut,
  sampleLut,
  writeCdlXml,
  writeCubeLut,
  type Rgb,
} from "@still-shift/color-science";

const vectors = join(
  import.meta.dirname,
  "../../benchmarks/fixtures/color/cg0/vectors/luts",
);
const CC = `<?xml version="1.0" encoding="UTF-8"?>
<ColorCorrection id="shot_010">
  <SOPNode>
    <Description>warm lift</Description>
    <Slope>1.0234 0.9876 0.95</Slope>
    <Offset>0.0123 -0.004 0.0</Offset>
    <Power>1.1 1.0 0.9</Power>
  </SOPNode>
  <SatNode>
    <Saturation>0.85</Saturation>
  </SatNode>
</ColorCorrection>
`;
const CCC = `<ColorCorrectionCollection xmlns="urn:ASC:CDL:v1.01">
  <ColorCorrection id="a"><SOPNode><Slope>1 1 1</Slope><Offset>0 0 0</Offset><Power>1 1 1</Power></SOPNode><SatNode><Saturation>1</Saturation></SatNode></ColorCorrection>
  <ColorCorrection id="b"><SOPNode><Slope>1.2 1.1 1</Slope><Offset>0.01 0.02 0.03</Offset><Power>0.9 1 1.1</Power></SOPNode><SatNode><Saturation>1.3</Saturation></SatNode></ColorCorrection>
</ColorCorrectionCollection>`;
const CDL = `<ColorDecisionList xmlns="urn:ASC:CDL:v1.01">
  <ColorDecision>
    <ColorCorrection id="c1"><SOPNode><Slope>0.9 0.9 0.9</Slope><Offset>0 0 0</Offset><Power>1 1 1</Power></SOPNode><SatNode><Saturation>1</Saturation></SatNode></ColorCorrection>
  </ColorDecision>
</ColorDecisionList>`;

describe("ASC CDL XML", () => {
  it("reads a .cc with its id, description and values", () => {
    const doc = parseCdlXml(CC);
    expect(doc.kind).toBe("cc");
    expect(doc.corrections).toEqual([
      {
        id: "shot_010",
        description: "warm lift",
        cdl: {
          slope: [1.0234, 0.9876, 0.95],
          offset: [0.0123, -0.004, 0],
          power: [1.1, 1, 0.9],
          saturation: 0.85,
        },
      },
    ]);
  });
  it("reads every correction of a .ccc and a .cdl", () => {
    expect(parseCdlXml(CCC).corrections.map((c) => c.id)).toEqual(["a", "b"]);
    expect(parseCdlXml(CCC).corrections[1]!.cdl.saturation).toBe(1.3);
    const cdl = parseCdlXml(CDL);
    expect(cdl.kind).toBe("cdl");
    expect(cdl.corrections[0]!.cdl.slope).toEqual([0.9, 0.9, 0.9]);
  });
  it("round-trips values exactly; re-export of an export is byte-identical", () => {
    for (const text of [CC, CCC, CDL]) {
      const doc = parseCdlXml(text);
      const written = writeCdlXml(doc);
      const again = parseCdlXml(written);
      expect(again).toEqual(doc);
      expect(writeCdlXml(again)).toBe(written);
    }
    // Awkward binary values survive unchanged.
    const doc = {
      kind: "cc" as const,
      corrections: [
        {
          id: "x",
          cdl: {
            slope: [0.1 + 0.2, 1 / 3, 2 ** -30] as Rgb,
            offset: [-1e-7, 0, 1] as Rgb,
            power: [1, 1, 1] as Rgb,
            saturation: 0.30000000000000004,
          },
        },
      ],
    };
    expect(parseCdlXml(writeCdlXml(doc))).toEqual(doc);
  });
  it("writes each value as its shortest exact decimal, never an exponent", () => {
    const written = writeCdlXml(parseCdlXml(CC));
    for (const text of [
      "1.0234 0.9876 0.95",
      "0.0123 -0.004 0",
      "1.1 1 0.9",
      "<Saturation>0.85<",
    ])
      expect(written).toContain(text);
    expect(cdlNumber(2 ** -30)).toBe("0.0000000009313225746154785");
    expect(Number(cdlNumber(2 ** -30))).toBe(2 ** -30);
    expect(cdlNumber(-0)).toBe("0");
    expect(cdlNumber(1e21)).toBe("1000000000000000000000");
  });
  it("reads SATNode, entities, a missing SatNode as neutral and namespaced tags", () => {
    const doc = parseCdlXml(
      `<?xml version="1.0"?><!-- c --><cdl:ColorCorrection xmlns:cdl="urn:ASC:CDL:v1.01" id="a&amp;b"><cdl:SOPNode><cdl:Slope>2 2 2</cdl:Slope><cdl:Offset>0 0 0</cdl:Offset><cdl:Power>1 1 1</cdl:Power></cdl:SOPNode></cdl:ColorCorrection>`,
    );
    expect(doc.corrections[0]).toEqual({
      id: "a&b",
      cdl: {
        slope: [2, 2, 2],
        offset: [0, 0, 0],
        power: [1, 1, 1],
        saturation: 1,
      },
    });
    expect(parseCdlXml(`\uFEFF${CC}`).corrections[0]!.id).toBe("shot_010");
    expect(
      parseCdlXml(CC.replace(/SatNode/g, "SATNode")).corrections[0]!.cdl
        .saturation,
    ).toBe(0.85);
    const quoted = writeCdlXml(doc);
    expect(quoted).toContain('id="a&amp;b"');
    expect(parseCdlXml(quoted)).toEqual(doc);
  });
  it("names the file kind from the extension", () => {
    expect([
      cdlFileKind("a.cc"),
      cdlFileKind("b.CCC"),
      cdlFileKind("c.cdl"),
      cdlFileKind("d.xml"),
    ]).toEqual(["cc", "ccc", "cdl", undefined]);
  });
  it("rejects malformed files with a reason", () => {
    expect(() =>
      parseCdlXml(
        "<ColorCorrection id='x'><SOPNode><Slope>1 1</Slope></SOPNode></ColorCorrection>",
      ),
    ).toThrow(/Slope/);
    expect(() => parseCdlXml("<Unknown/>")).toThrow(/ColorCorrection/);
    expect(() => parseCdlXml(CC.replace("0.85", "abc"))).toThrow(/Saturation/);
    expect(() =>
      parseCdlXml(CC.replace("<Power>1.1 1.0 0.9</Power>", "")),
    ).toThrow(/Power/);
    expect(() =>
      parseCdlXml(
        "<ColorDecisionList><ColorDecision><ColorCorrectionRef ref='x'/></ColorDecision></ColorDecisionList>",
      ),
    ).toThrow(/ColorCorrectionRef/);
    expect(() => parseCdlXml("<ColorCorrection><SOPNode>")).toThrow(
      /not closed/,
    );
    expect(() => parseCdlXml("<!DOCTYPE x><ColorCorrection/>")).toThrow(/DTD/);
    expect(() => writeCdlXml({ kind: "cc", corrections: [] })).toThrow(
      /no corrections/,
    );
  });
});

describe(".cube writing and baking", () => {
  const f = (rgb: Rgb): Rgb =>
    applyCdl(
      rgb,
      {
        slope: [1.1, 1, 0.9],
        offset: [0.02, 0, -0.01],
        power: [0.9, 1, 1.2],
        saturation: 1.2,
      },
      "no-clamp",
    );
  it("writes a .cube that parses back to the same table (10 decimals)", () => {
    const lut = bakeCubeLut(f, 5, { title: "test" });
    const back = parseCubeLut(writeCubeLut(lut));
    expect(back.size).toBe(5);
    expect(back.title).toBe("test");
    expect(
      Math.max(...back.data.map((v, i) => Math.abs(v - lut.data[i]!))),
    ).toBeLessThan(5e-11);
  });
  it("writes a title as one line that parses back", () => {
    const lut = bakeCubeLut((v) => v, 2, {
      title: 'warm "look"\nLUT_3D_SIZE 3',
    });
    const text = writeCubeLut(lut);
    expect(text.split("\n")[0]).toBe(`TITLE "warm 'look' LUT_3D_SIZE 3"`);
    const back = parseCubeLut(text);
    expect(back.size).toBe(2);
    expect(back.title).toBe("warm 'look' LUT_3D_SIZE 3");
  });
  it("reads decimal numbers only", () => {
    const rows = "0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n";
    expect(parseCubeLut(`LUT_3D_SIZE 2\n${rows}`).size).toBe(2);
    expect(
      parseCubeLut(`LUT_3D_SIZE 2\n${rows.replace("1 0 0", "1e0 +0.0 -.0")}`)
        .data[3],
    ).toBe(1);
    expect(() => parseCubeLut(`LUT_3D_SIZE 0x2\n${rows}`)).toThrow(
      /line 1: LUT_3D_SIZE size 0x2 must be an integer from 2 to 129/,
    );
    expect(() =>
      parseCubeLut(`LUT_3D_SIZE 2\n${rows.replace("1 0 0", "0x1 0 0")}`),
    ).toThrow(/line 3: table rows must be three finite numbers/);
    expect(() =>
      parseCubeLut(`LUT_3D_SIZE 2\n${rows.replace("1 0 0", "0b1 0 0")}`),
    ).toThrow(/line 3/);
    expect(() =>
      parseCubeLut(`LUT_3D_SIZE 2\nDOMAIN_MAX 0x2 2 2\n${rows}`),
    ).toThrow(/line 2: DOMAIN_MAX values must be finite numbers/);
  });
  it("rejects a range for a missing table, or two ranges for one table", () => {
    const rows = "0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n";
    // Resolve's range on a plain 3D or 1D table is read.
    expect(
      parseCubeLut(`LUT_3D_SIZE 2\nLUT_3D_INPUT_RANGE 0 4\n${rows}`).domainMax,
    ).toEqual([4, 4, 4]);
    expect(
      parseCubeLut("LUT_1D_SIZE 2\nLUT_1D_INPUT_RANGE 0 4\n0 0 0\n1 1 1\n")
        .domainMax,
    ).toEqual([4, 4, 4]);
    expect(() =>
      parseCubeLut(`LUT_3D_SIZE 2\nLUT_1D_INPUT_RANGE 0 4\n${rows}`),
    ).toThrow(/LUT_1D_INPUT_RANGE but no LUT_1D_SIZE/);
    expect(() =>
      parseCubeLut("LUT_1D_SIZE 2\nLUT_3D_INPUT_RANGE 0 4\n0 0 0\n1 1 1\n"),
    ).toThrow(/LUT_3D_INPUT_RANGE but no LUT_3D_SIZE/);
    expect(() =>
      parseCubeLut(
        `LUT_3D_SIZE 2\nDOMAIN_MIN -1 -1 -1\nLUT_3D_INPUT_RANGE 0 4\n${rows}`,
      ),
    ).toThrow(/both DOMAIN_MIN\/MAX and LUT_3D_INPUT_RANGE/);
  });
  it("writes and reads back a 65³ table and a shaper LUT", () => {
    const big = bakeCubeLut((v) => v, 65);
    expect(parseCubeLut(writeCubeLut(big)).data.length).toBe(65 ** 3 * 3);
    const shaped = parseCubeLut(
      readFileSync(join(vectors, "cube-9-shaper.cube"), "utf8"),
    );
    const back = parseCubeLut(writeCubeLut(shaped));
    expect(back.shaper?.size).toBe(32);
    expect(back.shaper?.domainMax).toEqual([4, 4, 4]);
    expect([...back.data]).toEqual([...shaped.data]);
  });
  it("bakes the identity exactly at the grid nodes", () => {
    const lut = bakeCubeLut((v) => v, 17);
    for (const rgb of [
      [0, 0, 0],
      [1, 1, 1],
      [0.25, 0.5, 0.75],
    ] as Rgb[])
      sampleLut(lut, rgb, "tetrahedral").forEach((v, c) =>
        expect(v).toBeCloseTo(rgb[c]!, 12),
      );
  });
  const q = (v: number) =>
    v >= 1 ? 255 : v > 0 ? Math.floor(v * 255 + 0.5) : 0;
  const bakeError = (g: (rgb: Rgb) => Rgb, size: number) => {
    const lut = bakeCubeLut(g, size);
    let float = 0,
      codes = 0;
    for (let i = 0; i < 2000; i++) {
      const rgb: Rgb = [
        (i * 0.6180339) % 1,
        (i * 0.4142135) % 1,
        (i * 0.7320508) % 1,
      ];
      const want = g(rgb);
      sampleLut(lut, rgb, "tetrahedral").forEach((v, c) => {
        float = Math.max(float, Math.abs(v - want[c]!));
        codes = Math.max(codes, Math.abs(q(v) - q(want[c]!)));
      });
    }
    return { float, codes };
  };
  it("a 33-point bake of a smooth grade reproduces it within 1e-3", () => {
    // Offsets >= 0: no channel crosses zero, so the stack is smooth on 0-1.
    const smooth = (rgb: Rgb): Rgb =>
      applyCdl(
        rgb,
        {
          slope: [1.1, 1, 0.9],
          offset: [0.02, 0, 0.01],
          power: [0.9, 1, 1.2],
          saturation: 1.2,
        },
        "no-clamp",
      );
    expect(bakeError(smooth, 33).float).toBeLessThan(1e-3);
  });
  it("a kink (a channel crossing zero into a power) stays within one 8-bit code", () => {
    // Blue crosses zero at 0.0111, where the no-clamp power starts: the one
    // grid cell holding the kink carries the error (4.2e-3 at 33, 2.3e-3 at 65).
    const at33 = bakeError(f, 33),
      at65 = bakeError(f, 65);
    expect(at33.float).toBeLessThan(5e-3);
    expect(at33.codes).toBeLessThanOrEqual(1);
    expect(at65.float).toBeLessThan(at33.float);
  });
});
