import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CompositionAssetSchema,
  type CompositionAsset,
} from "@still-shift/scene-contract";
import {
  BuilderError,
  sourceLocation,
  recordSource,
  type SourceLocation,
} from "./source.ts";
export type ImageAsset = Extract<CompositionAsset, { type: "image" }>;
const dimensions = (width: number, height: number): [number, number] => [
  Math.round(width),
  Math.round(height),
];
function imageDimensions(bytes: Buffer): [number, number] {
  if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return dimensions(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
  if (bytes.length >= 10 && /^GIF8[79]a$/.test(bytes.toString("ascii", 0, 6)))
    return dimensions(bytes.readUInt16LE(6), bytes.readUInt16LE(8));
  if (bytes.length >= 26 && bytes.toString("ascii", 0, 2) === "BM")
    return dimensions(
      Math.abs(bytes.readInt32LE(18)),
      Math.abs(bytes.readInt32LE(22)),
    );
  if (
    bytes.length >= 30 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    const format = bytes.toString("ascii", 12, 16);
    if (format === "VP8X")
      return dimensions(
        1 + bytes.readUIntLE(24, 3),
        1 + bytes.readUIntLE(27, 3),
      );
    if (format === "VP8L")
      return dimensions(
        1 + (bytes[21]! | ((bytes[22]! & 63) << 8)),
        1 + ((bytes[22]! >> 6) | (bytes[23]! << 2) | ((bytes[24]! & 15) << 10)),
      );
    if (
      format === "VP8 " &&
      bytes[23] === 157 &&
      bytes[24] === 1 &&
      bytes[25] === 42
    )
      return dimensions(
        bytes.readUInt16LE(26) & 16383,
        bytes.readUInt16LE(28) & 16383,
      );
  }
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++]!;
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length) break;
      const size = bytes.readUInt16BE(offset);
      if (size < 2 || offset + size > bytes.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        size >= 7
      )
        return dimensions(
          bytes.readUInt16BE(offset + 5),
          bytes.readUInt16BE(offset + 3),
        );
      offset += size;
    }
  }
  const svg = /<svg\b([^>]*)>/i.exec(bytes.toString("utf8"));
  if (svg) {
    const attribute = (name: string) =>
      new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(
        svg[1]!,
      )?.[1];
    const length = (value: string | undefined) => {
      const match =
        value && /^\s*([\d.]+)\s*(px|in|cm|mm|pt|pc)?\s*$/.exec(value);
      const units: Record<string, number> = {
        px: 1,
        in: 96,
        cm: 96 / 2.54,
        mm: 96 / 25.4,
        pt: 96 / 72,
        pc: 16,
      };
      return match ? Number(match[1]) * units[match[2] ?? "px"]! : undefined;
    };
    const view = attribute("viewBox")
      ?.trim()
      .split(/[\s,]+/)
      .map(Number);
    const width = length(attribute("width"));
    const height = length(attribute("height"));
    if (width !== undefined && height !== undefined)
      return dimensions(width, height);
    if (view?.length === 4 && view[2]! > 0 && view[3]! > 0) {
      const viewWidth = Math.round(view[2]!),
        viewHeight = Math.round(view[3]!);
      const ratio = viewWidth / viewHeight;
      if (width !== undefined)
        return dimensions(
          Math.round(width),
          Math.floor(Math.round(width) / ratio),
        );
      if (height !== undefined)
        return dimensions(
          Math.floor(Math.round(height) * ratio),
          Math.round(height),
        );
      return dimensions(viewWidth, viewHeight);
    }
  }
  throw new BuilderError(
    "comp-builder-image",
    "Cannot read image dimensions; use SVG, PNG, JPEG, GIF, BMP or WebP, or register a precomputed asset",
  );
}
function assetPath(path: string, relativeTo?: string | URL): string {
  if (relativeTo === undefined) return resolve(path);
  const base =
    relativeTo instanceof URL || relativeTo.startsWith("file:")
      ? dirname(fileURLToPath(relativeTo))
      : relativeTo;
  return resolve(base, path);
}
async function readAsset(path: string, site: SourceLocation) {
  try {
    return await readFile(path);
  } catch (error) {
    throw new BuilderError(
      "comp-builder-asset-file",
      `${path}: ${error instanceof Error ? error.message : String(error)}`,
      site,
    );
  }
}
function parseAsset<T extends CompositionAsset>(
  value: T,
  site: SourceLocation,
): T {
  const result = CompositionAssetSchema.safeParse(value);
  if (!result.success)
    throw new BuilderError(
      "comp-builder-asset",
      result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
      site,
    );
  return recordSource(result.data as T, site);
}
export async function imageAsset(
  id: string,
  path: string,
  options: { relativeTo?: string | URL } = {},
): Promise<ImageAsset> {
  const site = sourceLocation();
  const resolved = assetPath(path, options.relativeTo);
  const bytes = await readAsset(resolved, site);
  let size: [number, number];
  try {
    size = imageDimensions(bytes);
  } catch (error) {
    throw new BuilderError(
      "comp-builder-image",
      `${resolved}: ${error instanceof Error ? error.message : String(error)}`,
      site,
    );
  }
  return parseAsset(
    {
      id,
      type: "image",
      path: resolved,
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      width: size[0],
      height: size[1],
    },
    site,
  );
}
export type FontAsset = Extract<CompositionAsset, { type: "font" }>;
export async function fontAsset(
  id: string,
  path: string,
  options: {
    relativeTo?: string | URL;
    weight?: string;
    style?: "normal" | "italic";
    variable?: FontAsset["variable"];
  } = {},
): Promise<FontAsset> {
  const site = sourceLocation();
  const resolved = assetPath(path, options.relativeTo);
  const bytes = await readAsset(resolved, site);
  return parseAsset(
    {
      id,
      type: "font",
      path: resolved,
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      weight: options.weight ?? "400",
      ...(options.style === undefined ? {} : { style: options.style }),
      ...(options.variable === undefined ? {} : { variable: options.variable }),
    },
    site,
  );
}
