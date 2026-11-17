import { inflateSync } from "node:zlib";
import {
  COMPOSITION_MEDIA_DECODER_VERSION,
  type CompositionMediaColor,
} from "@still-shift/scene-contract";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";

export { COMPOSITION_MEDIA_DECODER_VERSION };
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const COLOR_CHUNKS = new Set([
  "cICP",
  "iCCP",
  "sRGB",
  "gAMA",
  "cHRM",
  "mDCV",
  "cLLI",
]);
type Chunk = { type: string; data: Buffer; bytes: Buffer };
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++)
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const value of bytes) crc = crcTable[(crc ^ value) & 255]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunks(bytes: Buffer): Chunk[] {
  const fail = () =>
    passageError("comp-media-format", "Invalid or unsupported source PNG", {
      path: "PNG",
    });
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) fail();
  const chunks: Chunk[] = [];
  let position = 8;
  let ended = false;
  while (position < bytes.length) {
    if (ended || position + 12 > bytes.length) fail();
    const length = bytes.readUInt32BE(position);
    const end = position + length + 12;
    if (end > bytes.length) fail();
    const type = bytes.toString("ascii", position + 4, position + 8);
    if (
      !/^[A-Za-z]{4}$/.test(type) ||
      crc32(bytes.subarray(position + 4, end - 4)) !==
        bytes.readUInt32BE(end - 4)
    )
      fail();
    if (type === "acTL" || type === "fcTL" || type === "fdAT") fail();
    if (
      type[0] === type[0]!.toUpperCase() &&
      !["IHDR", "PLTE", "IDAT", "IEND"].includes(type)
    )
      fail();
    if (
      (type === "IHDR" || COLOR_CHUNKS.has(type)) &&
      chunks.some((chunk) => chunk.type === type)
    )
      fail();
    if (COLOR_CHUNKS.has(type) && chunks.some((chunk) => chunk.type === "IDAT"))
      fail();
    chunks.push({
      type,
      data: bytes.subarray(position + 8, end - 4),
      bytes: bytes.subarray(position, end),
    });
    position = end;
    ended = type === "IEND";
  }
  if (
    !ended ||
    chunks[0]?.type !== "IHDR" ||
    chunks[0].data.length !== 13 ||
    !chunks.some((chunk) => chunk.type === "IDAT") ||
    chunks.at(-1)!.data.length !== 0
  )
    fail();
  return chunks;
}
function chunk(type: string, data: Buffer) {
  const bytes = Buffer.alloc(data.length + 12);
  bytes.writeUInt32BE(data.length);
  bytes.write(type, 4, "ascii");
  data.copy(bytes, 8);
  bytes.writeUInt32BE(
    crc32(bytes.subarray(4, bytes.length - 4)),
    bytes.length - 4,
  );
  return bytes;
}

export type CompositionPngInfo = {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  colorAuthority: "cICP" | "sRGB" | "authored-untagged-srgb";
};
/** PNG Third Edition priority: cICP, ICC, sRGB, then legacy gamma/chromaticities. */
export function inspectCompositionPng(
  bytes: Buffer,
  transfer: CompositionMediaColor["transfer"] = "iec61966-2-1",
): CompositionPngInfo {
  const chunks = pngChunks(bytes);
  const header = chunks[0]!.data;
  const width = header.readUInt32BE(0),
    height = header.readUInt32BE(4);
  const bitDepth = header[8]!,
    colorType = header[9]!;
  const validDepths: Record<number, number[]> = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  };
  if (
    !width ||
    !height ||
    !validDepths[colorType]?.includes(bitDepth) ||
    header[10] !== 0 ||
    header[11] !== 0 ||
    header[12]! > 1
  )
    passageError(
      "comp-media-format",
      "Unsupported PNG dimensions or sample layout",
      { path: "IHDR" },
    );
  const cicp = chunks.find((chunk) => chunk.type === "cICP");
  if (cicp) {
    if (
      !cicp.data.equals(Buffer.from([1, transfer === "bt709" ? 1 : 13, 0, 1]))
    )
      passageError(
        "comp-media-color",
        `Sequence PNG cICP must declare full-range ${transfer} RGB / BT.709 primaries`,
        { path: "cICP" },
      );
    return { width, height, bitDepth, colorType, colorAuthority: "cICP" };
  }
  if (transfer === "bt709")
    passageError(
      "comp-media-color",
      "BT.709 sequence PNG requires matching cICP transfer authority",
      { path: "cICP" },
    );
  if (chunks.some((chunk) => chunk.type === "iCCP"))
    passageError(
      "comp-media-color",
      "Normalize ICC-profile sequence PNGs into explicitly tagged sRGB",
      { path: "iCCP" },
    );
  const srgb = chunks.find((chunk) => chunk.type === "sRGB");
  if (srgb) {
    if (srgb.data.length !== 1 || srgb.data[0]! > 3)
      passageError("comp-media-color", "Invalid PNG sRGB rendering intent", {
        path: "sRGB",
      });
    return { width, height, bitDepth, colorType, colorAuthority: "sRGB" };
  }
  if (chunks.some((chunk) => chunk.type === "gAMA" || chunk.type === "cHRM"))
    passageError(
      "comp-media-color",
      "Legacy PNG gamma/chromaticities require normalization to explicitly tagged sRGB",
      { path: "gAMA/cHRM" },
    );
  return {
    width,
    height,
    bitDepth,
    colorType,
    colorAuthority: "authored-untagged-srgb",
  };
}

/** Samples must already be encoded sRGB. Replace conflicting decoder tags, never samples. */
export function tagCompositionSrgbPng(bytes: Buffer): Buffer {
  const chunks = pngChunks(bytes);
  const header = chunks[0]!.bytes;
  return Buffer.concat([
    SIGNATURE,
    header,
    chunk("sRGB", Buffer.from([0])),
    ...chunks
      .slice(1)
      .filter((chunk) => !COLOR_CHUNKS.has(chunk.type))
      .map((chunk) => chunk.bytes),
  ]);
}

/** Convert explicit source range/matrix and BT.709 transfer; alpha stays linear. */
export function compositionMediaColorFilter(
  color: CompositionMediaColor,
): string {
  const flags = "accurate_rnd+bitexact";
  const range = `in_range=${color.range}:out_range=pc`;
  const matrix =
    color.matrix === "bt709"
      ? ":in_color_matrix=bt709"
      : color.matrix === "smpte170m"
        ? ":in_color_matrix=bt601"
        : "";
  const filters = [`scale=${range}${matrix}:flags=${flags}`, "format=rgba64le"];
  if (color.transfer === "bt709") {
    const linear =
      "if(lt(val/maxval,0.081),val/maxval/4.5,pow((val/maxval+0.099)/1.099,1/0.45))";
    const encoded = `maxval*if(lte(${linear},0.0031308),12.92*(${linear}),1.055*pow(${linear},1/2.4)-0.055)`;
    filters.push(
      "lutrgb=" +
        ["r", "g", "b"].map((channel) => `${channel}='${encoded}'`).join(":"),
    );
  }
  filters.push(`scale=flags=${flags}:sws_dither=none`, "format=rgba");
  return filters.join(",");
}

/** BT.709 PNG alpha is copied from source samples before any RGB precision conversion. */
export function compositionSequenceColorFilter(
  color: CompositionMediaColor,
  bitDepth: number,
): string {
  const input = bitDepth === 16 ? "rgba64le" : "rgba";
  const rgb = compositionMediaColorFilter(color).replace(
    /format=rgba$/,
    "format=rgb24",
  );
  return `format=${input},split[color][alpha];[alpha]alphaextract,format=gray[mask];[color]${rgb}[rgb];[rgb][mask]alphamerge,format=rgba`;
}

/**
 * Decode a canonical prepared frame (RGBA8, non-interlaced) into straight
 * RGBA bytes. Prepared frames are verified on every cache hit, so this reader
 * only needs the sample layout the media path writes.
 */
export function decodeCompositionRgbaPng(bytes: Buffer): {
  width: number;
  height: number;
  rgba: Uint8Array;
} {
  const chunks = pngChunks(bytes);
  const header = chunks[0]!.data;
  const width = header.readUInt32BE(0),
    height = header.readUInt32BE(4);
  if (header[8] !== 8 || header[9] !== 6 || header[12] !== 0)
    passageError(
      "comp-media-format",
      "Prepared frame must be 8-bit RGBA without interlacing",
      { path: "IHDR" },
    );
  const rows = inflateSync(
    Buffer.concat(
      chunks.filter((chunk) => chunk.type === "IDAT").map((c) => c.data),
    ),
  );
  const stride = width * 4;
  if (rows.length !== height * (stride + 1))
    passageError("comp-media-format", "Prepared frame data length differs", {
      path: "IDAT",
    });
  const rgba = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = rows[y * (stride + 1)]!;
    const line = rows.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = y * stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? rgba[out + x - 4]! : 0,
        up = y ? rgba[out - stride + x]! : 0,
        corner = y && x >= 4 ? rgba[out - stride + x - 4]! : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner,
          pa = Math.abs(p - left),
          pb = Math.abs(p - up),
          pc = Math.abs(p - corner);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
      } else if (filter !== 0)
        passageError("comp-media-format", "Invalid PNG row filter", {
          path: "IDAT",
        });
      rgba[out + x] = (line[x]! + predictor) & 255;
    }
  }
  return { width, height, rgba };
}
