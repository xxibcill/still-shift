import { deflateSync } from "node:zlib";

/**
 * Deterministic 8-bit RGBA PNG (filter 0, zlib level 9, an sRGB chunk) for
 * scope images, comparison stills and contact sheets. Bytes depend only on
 * the pixels and the pinned Node zlib.
 */
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const bytes = Buffer.alloc(data.length + 12);
  bytes.writeUInt32BE(data.length);
  bytes.write(type, 4, "latin1");
  bytes.set(data, 8);
  bytes.writeUInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4);
  return bytes;
}

export function encodeColorPng(
  width: number,
  height: number,
  rgba: Uint8Array | Uint8ClampedArray,
): Buffer {
  if (rgba.length !== width * height * 4)
    throw new Error("PNG pixels do not match their size");
  const stride = width * 4;
  const rows = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++)
    rows.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    // Rendering intent 0 (perceptual): the pixels are encoded sRGB.
    chunk("sRGB", new Uint8Array([0])),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", new Uint8Array()),
  ]);
}
