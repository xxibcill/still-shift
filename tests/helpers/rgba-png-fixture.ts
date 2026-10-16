import { deflateSync } from "node:zlib";
export function pngFixtureChunk(type: string, data: Uint8Array) {
  const bytes = Buffer.alloc(data.length + 12);
  bytes.writeUInt32BE(data.length);
  bytes.write(type, 4);
  bytes.set(data, 8);
  let crc = 0xffffffff;
  for (const value of bytes.subarray(4, -4)) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  bytes.writeUInt32BE((crc ^ 0xffffffff) >>> 0, bytes.length - 4);
  return bytes;
}
export function rgbaPngFixture(
  width: number,
  height: number,
  rgba: Uint8Array,
) {
  if (rgba.length !== width * height * 4)
    throw Error("Incomplete fixture pixels");
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let row = 0; row < height; row++)
    rows.set(
      rgba.subarray(row * width * 4, (row + 1) * width * 4),
      row * (width * 4 + 1) + 1,
    );
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngFixtureChunk("IHDR", header),
    pngFixtureChunk("IDAT", deflateSync(rows)),
    pngFixtureChunk("IEND", new Uint8Array()),
  ]);
}
