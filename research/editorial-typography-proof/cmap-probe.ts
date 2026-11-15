// Exact-copy glyph coverage probe for the editorial typography proof.
//
// Still Shift does not yet read a pinned font's `cmap` (see
// docs/typography-motion-engine-plan.md "Exact-copy font coverage"). This
// throwaway probe reads cmap formats 4 and 12 from SFNT TTF/OTF bytes and
// reports which code points of each proof string are missing per font. Unicode
// coverage is necessary, not sufficient: it does not prove shaping (GSUB/GPOS)
// or what the browser actually painted.
//
// Usage: pnpm exec tsx research/editorial-typography-proof/cmap-probe.ts
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

function cmapCodePoints(bytes: Buffer): Set<number> {
  const numTables = bytes.readUInt16BE(4);
  let cmapOffset = -1;
  for (let i = 0; i < numTables; i++) {
    const record = 12 + i * 16;
    if (bytes.toString("latin1", record, record + 4) === "cmap")
      cmapOffset = bytes.readUInt32BE(record + 8);
  }
  if (cmapOffset < 0) throw new Error("font has no cmap table");
  const subtables = bytes.readUInt16BE(cmapOffset + 2);
  const points = new Set<number>();
  for (let i = 0; i < subtables; i++) {
    const rec = cmapOffset + 4 + i * 8;
    const platform = bytes.readUInt16BE(rec);
    const encoding = bytes.readUInt16BE(rec + 2);
    const unicode =
      platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    const table = cmapOffset + bytes.readUInt32BE(rec + 4);
    const format = bytes.readUInt16BE(table);
    if (format === 4) {
      const segX2 = bytes.readUInt16BE(table + 6);
      const ends = table + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const rangeOffsets = deltas + segX2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = bytes.readUInt16BE(ends + s * 2);
        const start = bytes.readUInt16BE(starts + s * 2);
        const delta = bytes.readInt16BE(deltas + s * 2);
        const ro = bytes.readUInt16BE(rangeOffsets + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let glyph: number;
          if (ro === 0) glyph = (c + delta) & 0xffff;
          else {
            const at = rangeOffsets + s * 2 + ro + (c - start) * 2;
            glyph = bytes.readUInt16BE(at);
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph !== 0) points.add(c);
        }
      }
    } else if (format === 12) {
      const groups = bytes.readUInt32BE(table + 12);
      for (let g = 0; g < groups; g++) {
        const at = table + 16 + g * 12;
        const start = bytes.readUInt32BE(at);
        const end = bytes.readUInt32BE(at + 4);
        const first = bytes.readUInt32BE(at + 8);
        for (let c = start; c <= end; c++)
          if (first + (c - start) !== 0) points.add(c);
      }
    }
  }
  return points;
}

// Characters that never need a glyph of their own for this report.
const ignorable = (c: number) =>
  c === 0x20 || c === 0x0a || c === 0x200b || c === 0x200c || c === 0x200d;

export function missingCodePoints(fontPath: string, text: string): string[] {
  const covered = cmapCodePoints(readFileSync(fontPath));
  const missing = new Set<string>();
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (!ignorable(c) && !covered.has(c))
      missing.add(`U+${c.toString(16).toUpperCase().padStart(4, "0")} ${ch}`);
  }
  return [...missing];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = new URL("../../", import.meta.url);
  const fonts = {
    "source-serif-4-semibold":
      "assets/story-motion/fonts/source-serif-4-semibold.otf",
    "plex-sans-semibold": "assets/story-motion/fonts/plex-sans-semibold.ttf",
    "plex-mono-medium": "assets/story-motion/fonts/plex-mono-medium.ttf",
    "noto-sans-thai": "assets/ecommerce-motion/fonts/noto-sans-thai.ttf",
  };
  const { copy } = await import("./copy.ts");
  const report: Record<string, unknown> = {};
  for (const [id, rel] of Object.entries(fonts)) {
    const path = fileURLToPath(new URL(rel, root));
    const bytes = readFileSync(path);
    const covered = cmapCodePoints(bytes);
    report[id] = {
      path: rel,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      codePoints: covered.size,
      thaiBlock: [...covered].filter((c) => c >= 0x0e00 && c <= 0x0e7f).length,
      basicLatinLetters: [...covered].filter(
        (c) => (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a),
      ).length,
      missingByCopy: Object.fromEntries(
        Object.entries(copy).map(([key, text]) => [
          key,
          missingCodePoints(path, text),
        ]),
      ),
    };
  }
  console.log(JSON.stringify(report, null, 2));
}
