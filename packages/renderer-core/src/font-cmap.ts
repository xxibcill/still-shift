import {
  FONT_IDENTITY_LIMITS,
  requireSfntTable,
  type SfntTables,
} from "./font-sfnt.ts";
import { passageError } from "./passage-diagnostics.ts";

type Cmap = {
  format: 4 | 12;
  priority: number;
  glyph(codePoint: number): number;
};
function fail(message: string): never {
  return passageError("font-cmap", `font-cmap: ${message}`);
}

export function readFontCmap(tables: SfntTables) {
  const table = requireSfntTable(tables, "cmap", 4);
  const count = table.getUint16(2);
  if (
    table.getUint16(0) !== 0 ||
    count > FONT_IDENTITY_LIMITS.cmapRecords ||
    4 + count * 8 > table.byteLength
  )
    fail("invalid encoding directory");
  const glyphCount = requireSfntTable(tables, "maxp", 6).getUint16(4);
  if (!glyphCount) fail("font has no glyphs");
  const maps: Cmap[] = [];
  for (let i = 0; i < count; i++) {
    const at = 4 + i * 8,
      platform = table.getUint16(at),
      encoding = table.getUint16(at + 2),
      offset = table.getUint32(at + 4);
    if (
      !(
        platform === 0 ||
        (platform === 3 && (encoding === 1 || encoding === 10))
      )
    )
      continue;
    if (offset < 4 + count * 8 || offset + 2 > table.byteLength)
      fail("invalid subtable offset");
    const format = table.getUint16(offset);
    if (format !== 4 && format !== 12) continue;
    const glyph =
      format === 4
        ? readFormat4(table, offset, glyphCount)
        : readFormat12(table, offset, glyphCount);
    maps.push({
      format,
      glyph,
      priority: (format === 12 ? 100 : 0) + (platform === 3 ? 10 : encoding),
    });
  }
  if (!maps.length)
    passageError(
      "font-cmap-unsupported",
      "font-cmap-unsupported: a Unicode format 4 or 12 cmap is required",
    );
  maps.sort((a, b) => b.priority - a.priority);
  const selected = maps[0]!;
  return {
    supportedCmapFormats: [
      ...new Set(maps.map((map) => map.format)),
    ].sort() as (4 | 12)[],
    hasGlyph(codePoint: number) {
      if (
        !Number.isInteger(codePoint) ||
        codePoint < 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      )
        return false;
      return selected.glyph(codePoint) > 0;
    },
  };
}
function boundedSubtable(
  table: DataView,
  offset: number,
  length: number,
  minimum: number,
) {
  if (length < minimum || offset + length > table.byteLength)
    fail("invalid subtable extent");
  return new DataView(table.buffer, table.byteOffset + offset, length);
}
function readFormat12(table: DataView, offset: number, glyphCount: number) {
  if (offset + 16 > table.byteLength) fail("truncated format12 header");
  const data = boundedSubtable(table, offset, table.getUint32(offset + 4), 16);
  const count = data.getUint32(12);
  if (
    data.getUint16(2) !== 0 ||
    count > FONT_IDENTITY_LIMITS.cmapGroups ||
    16 + count * 12 > data.byteLength
  )
    fail("invalid or over-budget format12 groups");
  let previousEnd = -1;
  for (let i = 0; i < count; i++) {
    const at = 16 + i * 12,
      start = data.getUint32(at),
      end = data.getUint32(at + 4),
      glyph = data.getUint32(at + 8);
    if (
      start > end ||
      start <= previousEnd ||
      end > 0x10ffff ||
      glyph + end - start >= glyphCount
    )
      fail("invalid format12 group range or glyph ID");
    previousEnd = end;
  }
  return (codePoint: number) => {
    let lower = 0,
      upper = count - 1;
    while (lower <= upper) {
      const middle = (lower + upper) >>> 1,
        at = 16 + middle * 12;
      const start = data.getUint32(at),
        end = data.getUint32(at + 4);
      if (codePoint < start) upper = middle - 1;
      else if (codePoint > end) lower = middle + 1;
      else return data.getUint32(at + 8) + codePoint - start;
    }
    return 0;
  };
}
function readFormat4(table: DataView, offset: number, glyphCount: number) {
  if (offset + 14 > table.byteLength) fail("truncated format4 header");
  const data = boundedSubtable(table, offset, table.getUint16(offset + 2), 16);
  const doubledCount = data.getUint16(6),
    count = doubledCount / 2;
  if (
    !count ||
    doubledCount % 2 ||
    count > FONT_IDENTITY_LIMITS.cmapSegments ||
    16 + count * 8 > data.byteLength
  )
    fail("invalid or over-budget format4 segments");
  const endAt = 14,
    startAt = 16 + count * 2,
    deltaAt = 16 + count * 4,
    rangeAt = 16 + count * 6;
  let previousEnd = -1;
  for (let i = 0; i < count; i++) {
    const start = data.getUint16(startAt + i * 2),
      end = data.getUint16(endAt + i * 2),
      range = data.getUint16(rangeAt + i * 2);
    if (
      start > end ||
      start <= previousEnd ||
      (range &&
        (range % 2 ||
          rangeAt + i * 2 + range < rangeAt + count * 2 ||
          rangeAt + i * 2 + range + (end - start + 1) * 2 > data.byteLength))
    )
      fail("invalid format4 segment or glyph-array extent");
    for (let codePoint = start; codePoint <= end; codePoint++) {
      const raw = range
        ? data.getUint16(rangeAt + i * 2 + range + (codePoint - start) * 2)
        : codePoint;
      const delta = data.getInt16(deltaAt + i * 2);
      const glyph = range && !raw ? 0 : (raw + delta) & 0xffff;
      if (glyph >= glyphCount) fail("invalid format4 glyph ID");
    }
    previousEnd = end;
  }
  if (previousEnd !== 0xffff) fail("missing format4 terminal segment");
  return (codePoint: number) => {
    if (codePoint > 0xffff) return 0;
    let lower = 0,
      upper = count - 1;
    while (lower <= upper) {
      const middle = (lower + upper) >>> 1;
      const start = data.getUint16(startAt + middle * 2),
        end = data.getUint16(endAt + middle * 2);
      if (codePoint < start) upper = middle - 1;
      else if (codePoint > end) lower = middle + 1;
      else {
        const range = data.getUint16(rangeAt + middle * 2),
          delta = data.getInt16(deltaAt + middle * 2);
        const raw = range
          ? data.getUint16(
              rangeAt + middle * 2 + range + (codePoint - start) * 2,
            )
          : codePoint;
        const glyph = range && !raw ? 0 : (raw + delta) & 0xffff;
        return glyph < glyphCount ? glyph : 0;
      }
    }
    return 0;
  };
}
