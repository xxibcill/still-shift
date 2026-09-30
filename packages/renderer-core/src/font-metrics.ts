import type { FontAxes } from "../../scene-contract/src/typography.ts";

export type FontMetrics = {
  unitsPerEm: number;
  ascent: number;
  descent: number;
  capHeight: number;
  xHeight: number;
  underlinePosition: number;
  underlineThickness: number;
  axes: FontAxes;
  features: string[];
};
/** Read only bounded SFNT tables; the browser remains the font shaper. */
export function readFontMetrics(bytes: ArrayBuffer): FontMetrics {
  const data = new DataView(bytes);
  if (bytes.byteLength < 12) throw new Error("font-metadata: truncated font");
  const tag = (at: number) =>
    String.fromCharCode(...new Uint8Array(bytes, at, 4));
  const tables = new Map<string, { offset: number; length: number }>();
  const signature = data.getUint32(0);
  if (signature !== 0x00010000 && tag(0) !== "OTTO")
    throw new Error(
      "font-metadata: typography requires an SFNT TTF or OTF font",
    );
  const count = data.getUint16(4);
  if (12 + count * 16 > bytes.byteLength)
    throw new Error("font-metadata: invalid table directory");
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16,
      offset = data.getUint32(at + 8),
      length = data.getUint32(at + 12);
    if (offset + length > bytes.byteLength)
      throw new Error("font-metadata: invalid table extent");
    tables.set(tag(at), { offset, length });
  }
  const table = (name: string, minimum: number) => {
    const t = tables.get(name);
    if (!t || t.length < minimum)
      throw new Error(`font-metadata: missing ${name}`);
    return new DataView(bytes, t.offset, t.length);
  };
  const head = table("head", 20),
    hhea = table("hhea", 8),
    unitsPerEm = head.getUint16(18);
  if (!unitsPerEm) throw new Error("font-metadata: invalid units per em");
  const ascent = hhea.getInt16(4),
    descent = -hhea.getInt16(6);
  const os2 = tables.get("OS/2"),
    post = tables.get("post");
  const extended = os2 && os2.length >= 90 && data.getUint16(os2.offset) >= 2;
  const axes: FontAxes = {};
  if (tables.has("fvar")) {
    const fvar = table("fvar", 16),
      offset = fvar.getUint16(4),
      n = fvar.getUint16(8),
      size = fvar.getUint16(10);
    if (size < 20 || offset + n * size > fvar.byteLength)
      throw new Error("font-metadata: invalid fvar");
    for (let i = 0; i < n; i++) {
      const at = offset + i * size;
      const axis = String.fromCharCode(
        ...Array.from({ length: 4 }, (_, j) => fvar.getUint8(at + j)),
      );
      axes[axis] = {
        min: fvar.getInt32(at + 4) / 65536,
        default: fvar.getInt32(at + 8) / 65536,
        max: fvar.getInt32(at + 12) / 65536,
      };
    }
  }
  const features = new Set<string>(tables.has("kern") ? ["kern"] : []);
  for (const name of ["GSUB", "GPOS"]) {
    if (!tables.has(name)) continue;
    const layout = table(name, 10),
      at = layout.getUint16(6);
    if (at + 2 > layout.byteLength)
      throw new Error("font-metadata: invalid feature list");
    const n = layout.getUint16(at);
    if (at + 2 + n * 6 > layout.byteLength)
      throw new Error("font-metadata: invalid features");
    for (let i = 0; i < n; i++)
      features.add(
        String.fromCharCode(
          ...Array.from({ length: 4 }, (_, j) =>
            layout.getUint8(at + 2 + i * 6 + j),
          ),
        ),
      );
  }
  return {
    unitsPerEm,
    ascent,
    descent,
    capHeight: extended
      ? data.getInt16(os2.offset + 88) || ascent * 0.85
      : ascent * 0.85,
    xHeight: extended
      ? data.getInt16(os2.offset + 86) || ascent * 0.6
      : ascent * 0.6,
    underlinePosition:
      post && post.length >= 12
        ? -data.getInt16(post.offset + 8)
        : descent * 0.5,
    underlineThickness:
      post && post.length >= 12
        ? data.getInt16(post.offset + 10)
        : unitsPerEm / 20,
    axes,
    features: [...features].sort(),
  };
}
