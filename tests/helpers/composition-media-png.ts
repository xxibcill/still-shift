import { deflateSync, inflateSync } from "node:zlib";

export function mediaPngChunk(type: string, data: Buffer) {
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length);
  result.write(type, 4);
  data.copy(result, 8);
  let crc = 0xffffffff;
  for (const value of result.subarray(4, result.length - 4)) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}
export function mediaRgbaPng(
  width: number,
  height: number,
  rgba: Uint8Array,
  colorChunks: Buffer[] = [],
) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++)
    rows.set(
      rgba.subarray(y * width * 4, (y + 1) * width * 4),
      y * (width * 4 + 1) + 1,
    );
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    mediaPngChunk("IHDR", header),
    ...colorChunks,
    mediaPngChunk("IDAT", deflateSync(rows)),
    mediaPngChunk("IEND", Buffer.alloc(0)),
  ]);
}
/** Independent PNG scanline reconstruction, without asking FFmpeg to decode its own output. */
export function mediaPngPixels(bytes: Buffer) {
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  if (bytes[24] !== 8 || bytes[25] !== 6) throw new Error("RGBA8 required");
  const idat: Buffer[] = [];
  for (let position = 8; position < bytes.length; ) {
    const length = bytes.readUInt32BE(position);
    if (bytes.toString("ascii", position + 4, position + 8) === "IDAT")
      idat.push(bytes.subarray(position + 8, position + 8 + length));
    position += length + 12;
  }
  const rows = inflateSync(Buffer.concat(idat)),
    stride = width * 4,
    pixels = Buffer.alloc(stride * height);
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c,
      pa = Math.abs(p - a),
      pb = Math.abs(p - b),
      pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = rows[y * (stride + 1)]!;
    if (filter > 4) throw new Error("Invalid filter");
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[y * stride + x - 4]! : 0;
      const above = y ? pixels[(y - 1) * stride + x]! : 0;
      const corner = y && x >= 4 ? pixels[(y - 1) * stride + x - 4]! : 0;
      const delta = [
        0,
        left,
        above,
        Math.floor((left + above) / 2),
        paeth(left, above, corner),
      ][filter]!;
      pixels[y * stride + x] = (rows[y * (stride + 1) + x + 1]! + delta) & 255;
    }
  }
  return pixels;
}
