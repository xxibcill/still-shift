import type { FontAxes } from "../../scene-contract/src/typography.ts";
import { passageError } from "./passage-diagnostics.ts";

export const FONT_IDENTITY_LIMITS = {
  fontBytes: 32 * 1024 * 1024,
  tables: 128,
  nameRecords: 4096,
  nameBytes: 2048,
  cmapRecords: 64,
  cmapSegments: 32768,
  cmapGroups: 65536,
  axes: 64,
  textRuns: 65536,
  textValueCodeUnits: 16384,
  textCodepoints: 1_000_000,
} as const;
export type SfntTables = Map<string, DataView>;
function fail(message: string): never {
  return passageError("font-metadata", `font-metadata: ${message}`);
}

export function readSfntTables(bytes: ArrayBuffer): SfntTables {
  if (
    bytes.byteLength < 12 ||
    bytes.byteLength > FONT_IDENTITY_LIMITS.fontBytes
  )
    fail("font byte length outside supported budget");
  const data = new DataView(bytes);
  const signature = data.getUint32(0);
  if (signature !== 0x00010000 && signature !== 0x4f54544f)
    fail("identity requires an SFNT TTF or OTF font");
  const count = data.getUint16(4);
  if (count > FONT_IDENTITY_LIMITS.tables || 12 + count * 16 > bytes.byteLength)
    fail("invalid or over-budget table directory");
  const tables: SfntTables = new Map();
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    const tag = readTag(data, at);
    const offset = data.getUint32(at + 8),
      length = data.getUint32(at + 12);
    if (
      offset + length > bytes.byteLength ||
      (length && offset < 12 + count * 16) ||
      tables.has(tag)
    )
      fail("invalid or duplicate table extent");
    tables.set(tag, new DataView(bytes, offset, length));
  }
  return tables;
}
export function requireSfntTable(
  tables: SfntTables,
  name: string,
  minimum: number,
): DataView {
  const table = tables.get(name);
  if (!table || table.byteLength < minimum)
    fail(`missing or truncated ${name}`);
  return table;
}
export function readTag(data: DataView, at: number) {
  return String.fromCharCode(
    ...Array.from({ length: 4 }, (_, i) => data.getUint8(at + i)),
  );
}

export function readFontNames(tables: SfntTables) {
  const table = requireSfntTable(tables, "name", 6);
  const format = table.getUint16(0),
    count = table.getUint16(2),
    strings = table.getUint16(4);
  if (
    format > 1 ||
    count > FONT_IDENTITY_LIMITS.nameRecords ||
    6 + count * 12 > table.byteLength ||
    strings < 6 + count * 12 ||
    strings > table.byteLength
  )
    fail("invalid name directory");
  const names = new Map<number, { value: string; priority: number }>();
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12;
    const platform = table.getUint16(at),
      encoding = table.getUint16(at + 2),
      language = table.getUint16(at + 4),
      id = table.getUint16(at + 6);
    const length = table.getUint16(at + 8),
      offset = strings + table.getUint16(at + 10);
    if (
      length > FONT_IDENTITY_LIMITS.nameBytes ||
      offset + length > table.byteLength
    )
      fail("invalid name string extent");
    const unicode =
      platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode && !(platform === 1 && encoding === 0)) continue;
    if (unicode && length % 2) fail("invalid UTF-16 name");
    const bytes = new Uint8Array(
      table.buffer,
      table.byteOffset + offset,
      length,
    );
    let value: string;
    try {
      value = new TextDecoder(unicode ? "utf-16be" : "macintosh", {
        fatal: true,
      })
        .decode(bytes)
        .replace(/\0/gu, "")
        .trim();
    } catch {
      fail("invalid encoded name string");
    }
    const priority =
      (unicode ? 2 : 0) + (language === 0x409 || language === 0 ? 4 : 0);
    if (value && priority > (names.get(id)?.priority ?? -1))
      names.set(id, { value, priority });
  }
  const name = (id: number, fallback?: number) =>
    names.get(id)?.value ??
    (fallback === undefined ? "" : (names.get(fallback)?.value ?? ""));
  const family = name(16, 1),
    subfamily = name(17, 2);
  if (!family || !subfamily) fail("missing family or subfamily identity");
  return { family, subfamily, fullName: name(4), postscriptName: name(6) };
}

export function readFontAxes(tables: SfntTables): FontAxes {
  if (!tables.has("fvar")) return {};
  const table = requireSfntTable(tables, "fvar", 16);
  const offset = table.getUint16(4),
    count = table.getUint16(8),
    size = table.getUint16(10);
  if (
    count > FONT_IDENTITY_LIMITS.axes ||
    size < 20 ||
    offset < 16 ||
    offset + count * size > table.byteLength
  )
    fail("invalid fvar axis directory");
  const axes: FontAxes = {};
  for (let i = 0; i < count; i++) {
    const at = offset + i * size,
      tag = readTag(table, at);
    const min = table.getInt32(at + 4) / 65536,
      initial = table.getInt32(at + 8) / 65536,
      max = table.getInt32(at + 12) / 65536;
    if (Object.hasOwn(axes, tag) || min > initial || initial > max)
      fail("invalid or duplicate fvar axis");
    axes[tag] = { min, default: initial, max };
  }
  return axes;
}
