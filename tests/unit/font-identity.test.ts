import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  readFontIdentity,
  inspectFontText,
  type FontDeclaration,
} from "../../packages/renderer-core/src/font-identity.ts";
import { collectFontTextRuns } from "../../packages/renderer-core/src/font-copy.ts";
import { PassageError } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import type { TextNode } from "../../packages/renderer-core/src/typography-style.ts";

const plexPath = "assets/story-motion/fonts/plex-sans-semibold.ttf";
const notoPath = "assets/ecommerce-motion/fonts/noto-sans-thai.ttf";
const thai = "ทำให้การเปลี่ยนแปลง\nมองเห็นได้";
const bytes = (path: string) => {
  const buffer = readFileSync(path);
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
};
const declaration: FontDeclaration = {
  id: "plex",
  sha256:
    "sha256:a20caf8286023a6a7a85e40b1d2a4ae9fc3e3b1f9eda8f4c542dd4986af67bb1",
  weight: "600",
  path: "assets.plex",
};
function tableRecord(font: ArrayBuffer, name: string) {
  const view = new DataView(font);
  for (let i = 0; i < view.getUint16(4); i++) {
    const at = 12 + i * 16;
    if (String.fromCharCode(...new Uint8Array(font, at, 4)) === name) return at;
  }
  throw new Error("Missing fixture table " + name);
}
function withCmap(subtable: ArrayBuffer, encoding = 10) {
  const original = bytes(plexPath);
  const cmap = new ArrayBuffer(12 + subtable.byteLength);
  const view = new DataView(cmap);
  view.setUint16(2, 1);
  view.setUint16(4, 3);
  view.setUint16(6, encoding);
  view.setUint32(8, 12);
  new Uint8Array(cmap, 12).set(new Uint8Array(subtable));
  const font = new ArrayBuffer(original.byteLength + cmap.byteLength);
  new Uint8Array(font).set(new Uint8Array(original));
  new Uint8Array(font, original.byteLength).set(new Uint8Array(cmap));
  const record = tableRecord(original, "cmap");
  new DataView(font).setUint32(record + 8, original.byteLength);
  new DataView(font).setUint32(record + 12, cmap.byteLength);
  return font;
}
function cmap12(groups: [number, number, number][]) {
  const buffer = new ArrayBuffer(16 + groups.length * 12);
  const view = new DataView(buffer);
  view.setUint16(0, 12);
  view.setUint32(4, buffer.byteLength);
  view.setUint32(12, groups.length);
  groups.forEach((group, i) =>
    group.forEach((n, j) => view.setUint32(16 + i * 12 + j * 4, n)),
  );
  return buffer;
}
function cmap4() {
  const buffer = new ArrayBuffer(36);
  const view = new DataView(buffer);
  view.setUint16(0, 4);
  view.setUint16(2, 36);
  view.setUint16(6, 4);
  view.setUint16(14, 66);
  view.setUint16(16, 0xffff);
  view.setUint16(20, 65);
  view.setUint16(22, 0xffff);
  view.setInt16(24, 1);
  view.setInt16(26, 1);
  view.setUint16(28, 4);
  view.setUint16(32, 2);
  view.setUint16(34, 0);
  return buffer;
}

describe("bounded exact-font identity", () => {
  it("reads the actual Plex cut and covers all E01 label copy", () => {
    const identity = readFontIdentity(bytes(plexPath));
    expect(identity.family).toContain("Plex");
    expect(identity.weight).toBe(600);
    expect(identity.style).toBe("normal");
    expect(identity.axes).toEqual({});
    expect(
      inspectFontText(identity, declaration, [
        { text: "PULL PUSH THICKNESS TRAVEL INSIDE OUTSIDE SLIDES" },
      ]),
    ).toEqual([]);
  });
  it("retains the Plex-only Thai negative and names missing glyphs", () => {
    const diagnostics = inspectFontText(
      readFontIdentity(bytes(plexPath)),
      declaration,
      [{ text: thai, node: "phrase", path: "layers.phrase.text" }],
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: "font-coverage",
      fontId: "plex",
      fontSha256: declaration.sha256,
      node: "phrase",
      path: "layers.phrase.text",
      severity: "error",
    });
    expect(diagnostics[0]!.missingCodepoints).toHaveLength(22);
    expect(diagnostics[0]!.missingGlyphs?.every((g) => g.glyphId === 0)).toBe(
      true,
    );
  });
  it("covers the identical Noto phrase and accepts a real variable instance", () => {
    const identity = readFontIdentity(bytes(notoPath));
    expect(identity.axes.wght).toEqual({ min: 100, default: 400, max: 900 });
    expect(identity.axes.wdth).toEqual({ min: 62.5, default: 100, max: 100 });
    expect(
      inspectFontText(
        identity,
        {
          ...declaration,
          id: "noto",
          weight: "600",
          axes: { wght: 600, wdth: 85 },
        },
        [{ text: thai }],
      ),
    ).toEqual([]);
    expect(
      inspectFontText(
        identity,
        { ...declaration, id: "noto", weight: "600", axes: { wght: 901 } },
        [{ text: thai }],
      )[0]?.code,
    ).toBe("font-axis-range");
  });
  it("diagnoses false static cut identity without reinterpreting variable default weight", () => {
    const identity = readFontIdentity(bytes(plexPath));
    const diagnostics = inspectFontText(
      identity,
      { ...declaration, weight: "400", family: "Some Other Face" },
      [],
    );
    expect(diagnostics.map((d) => d.code)).toEqual([
      "font-cut-identity",
      "font-cut-identity",
    ]);
    expect(
      inspectFontText(identity, { ...declaration, style: "italic" }, [])[0]
        ?.code,
    ).toBe("font-cut-identity");
    expect(
      inspectFontText(identity, declaration, [
        { text: "ASCII", axes: { wght: 600 } },
      ])[0]?.code,
    ).toBe("font-axis-range");
  });
  it("reads an OTF face and rejects mismatched or malformed axis metadata", () => {
    const otf = readFontIdentity(
      bytes("assets/story-motion/fonts/source-serif-4-semibold.otf"),
    );
    expect(otf.weight).toBe(600);
    expect(
      inspectFontText(otf, { ...declaration, family: otf.family }, [
        { text: "Measured copy" },
      ]),
    ).toEqual([]);
    const noto = readFontIdentity(bytes(notoPath));
    expect(
      inspectFontText(
        noto,
        {
          ...declaration,
          weight: "600",
          variable: {
            wght: { default: 400, max: 900, min: 100 },
            wdth: { default: 100, max: 100, min: 62.5 },
          },
        },
        [{ text: thai }],
      ),
    ).toEqual([]);
    expect(
      inspectFontText(
        noto,
        { ...declaration, weight: "600", variable: {} },
        [],
      )[0]?.code,
    ).toBe("font-axis-metadata");
    const malformed = bytes(notoPath),
      data = new DataView(malformed);
    const fvar = data.getUint32(tableRecord(malformed, "fvar") + 8);
    const axesStart = fvar + data.getUint16(fvar + 4);
    data.setInt32(axesStart + 8, data.getInt32(axesStart + 12) + 65536);
    expect(() => readFontIdentity(malformed)).toThrow(PassageError);
  });
  it("preserves explicit legacy warnings while strict diagnostics are errors", () => {
    const identity = readFontIdentity(bytes(plexPath));
    expect(
      inspectFontText(identity, declaration, [{ text: thai }], {
        profile: "legacy",
      })[0]?.severity,
    ).toBe("warning");
    expect(
      inspectFontText(identity, declaration, [{ text: thai }], {
        profile: "strict",
      })[0]?.severity,
    ).toBe("error");
  });
  it("supports supplementary format12 groups without expanding Unicode ranges", () => {
    const identity = readFontIdentity(
      withCmap(cmap12([[0x1f600, 0x1f601, 2]])),
    );
    expect(identity.supportedCmapFormats).toEqual([12]);
    expect(identity.hasGlyph(0x1f600)).toBe(true);
    expect(identity.hasGlyph(0x1f601)).toBe(true);
    expect(identity.hasGlyph(0x1f602)).toBe(false);
  });
  it("treats a format4 zero glyph as missing before applying its delta", () => {
    const identity = readFontIdentity(withCmap(cmap4(), 1));
    expect(identity.hasGlyph(65)).toBe(true);
    expect(identity.hasGlyph(66)).toBe(false);
    expect(identity.hasGlyph(0xffff)).toBe(false);
  });
  it("bounds malformed SFNT directories and cmap extents with structured errors", () => {
    expect(() => readFontIdentity(new ArrayBuffer(3))).toThrow(PassageError);
    const invalidExtent = bytes(plexPath);
    const record = tableRecord(invalidExtent, "cmap");
    new DataView(invalidExtent).setUint32(
      record + 8,
      invalidExtent.byteLength - 1,
    );
    expect(() => readFontIdentity(invalidExtent)).toThrow(PassageError);
    expect(() =>
      readFontIdentity(
        withCmap(
          cmap12([
            [10, 20, 2],
            [20, 30, 3],
          ]),
        ),
      ),
    ).toThrow(/font-cmap/);
    const invalidRangeOffset = cmap4();
    new DataView(invalidRangeOffset).setUint16(28, 0xfffe);
    expect(() => readFontIdentity(withCmap(invalidRangeOffset, 1))).toThrow(
      /font-cmap/,
    );
  });
  it("rejects over-budget directories and malformed Unicode name strings", () => {
    const overBudget = bytes(plexPath);
    new DataView(overBudget).setUint16(4, 129);
    expect(() => readFontIdentity(overBudget)).toThrow(/font-metadata/);
    const names = bytes(plexPath),
      data = new DataView(names);
    const nameAt = data.getUint32(tableRecord(names, "name") + 8);
    const stringsAt = nameAt + data.getUint16(nameAt + 4);
    for (let i = 0; i < data.getUint16(nameAt + 2); i++) {
      const at = nameAt + 6 + i * 12;
      if (data.getUint16(at) === 3 && data.getUint16(at + 8) >= 2) {
        data.setUint16(stringsAt + data.getUint16(at + 10), 0xd800);
        break;
      }
    }
    expect(() => readFontIdentity(names)).toThrow(/font-metadata/);
    expect(() =>
      readFontIdentity(withCmap(cmap12([[0x1f600, 0x1f601, 0xffff]]))),
    ).toThrow(/font-cmap/);
  });
  it("checks combining marks while explicitly ignoring shaping controls", () => {
    const diagnostics = inspectFontText(
      readFontIdentity(bytes(plexPath)),
      declaration,
      [{ text: "\u200d\u200c\n\t\u0e49" }],
    );
    expect(diagnostics[0]!.missingCodepoints).toEqual([0x0e49]);
  });
});

describe("reachable font copy", () => {
  const node = {
    id: "counter",
    type: "text",
    text: "1",
    states: ["1", "2"],
    fontAsset: "plex",
    fontSize: 48,
    color: "#ffffff",
    locale: "en",
    transition: { kind: "count", decimals: 2, window: { start: 0, end: 3 } },
  } as TextNode;
  it("checks generated decimal states and case-transformed span runs", () => {
    const scene = {
      nodes: [node],
      typography: "type-1" as const,
      textStyles: {},
      textEvents: [],
    };
    const runs = collectFontTextRuns(scene);
    expect(runs.some((r) => r.text === "1.00")).toBe(true);
    expect(runs.some((r) => r.text === "2.00")).toBe(true);
    const phrase = {
      ...node,
      text: "aß",
      states: undefined,
      transition: undefined,
      style: "base",
      spans: [{ id: "upper", start: 1, end: 2, style: "upper" }],
    } as TextNode;
    const spanRuns = collectFontTextRuns({
      ...scene,
      nodes: [phrase],
      textStyles: {
        base: { fontAsset: "plex", size: 48 },
        upper: { fontAsset: "noto", case: "upper" as const },
      },
    });
    expect(spanRuns.map((r) => [r.fontAsset, r.text, r.span])).toEqual([
      ["plex", "a", undefined],
      ["noto", "SS", "upper"],
    ]);
  });
  it("includes correction replacements in their base resolved font", () => {
    const runs = collectFontTextRuns({
      nodes: [
        {
          ...node,
          text: "Old",
          states: undefined,
          transition: undefined,
        } as TextNode,
      ],
      textStyles: {},
      textEvents: [
        {
          node: "counter",
          verb: "correct" as const,
          at: 1,
          duration: 2,
          replacement: "ใหม่",
        },
      ],
    });
    expect(
      runs.some(
        (r) =>
          r.text === "ใหม่" &&
          r.fontAsset === "plex" &&
          r.path === "textEvents.0.replacement",
      ),
    ).toBe(true);
  });
});
