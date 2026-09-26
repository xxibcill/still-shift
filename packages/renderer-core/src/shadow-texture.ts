/** A canonical PNG encoder for the small prepared shadow. Stored DEFLATE blocks
 * keep bytes identical in Node and the browser without platform image encoders. */
export const SHADOW_GENERATOR_VERSION = "ellipse-shadow-1";
export type ShadowTextureSettings = {
  width: number;
  height: number;
  softness: number;
  color: string;
};
export const DEFAULT_SHADOW_TEXTURE: ShadowTextureSettings = {
  width: 256,
  height: 128,
  softness: 0.9,
  color: "#32271F",
};

export function createShadowTexture(
  settings: ShadowTextureSettings,
): Uint8Array {
  const { width, height, softness, color } = settings;
  if (
    ![width, height].every(
      (n) => Number.isInteger(n) && n >= 16 && n <= 1024,
    ) ||
    !Number.isFinite(softness) ||
    softness < 0.05 ||
    softness > 1 ||
    !/^#[\da-fA-F]{6}$/.test(color)
  )
    throw new Error(
      "Shadow needs 16–1024 pixel dimensions, softness 0.05–1 and a hex color",
    );
  const rgb = [1, 3, 5].map((index) =>
    parseInt(color.slice(index, index + 2), 16),
  );
  const stride = width * 4 + 1;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const radius = Math.hypot(
        (x + 0.5 - width / 2) / (width * 0.4),
        (y + 0.5 - height / 2) / (height * 0.4),
      );
      const t = Math.max(0, Math.min(1, (radius - (1 - softness)) / softness));
      const alpha = Math.round(255 * (1 - t * t * (3 - 2 * t)));
      const offset = y * stride + 1 + x * 4;
      pixels.set([rgb[0]!, rgb[1]!, rgb[2]!, alpha], offset);
    }
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  return concatenate([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateStored(pixels)),
    chunk("IEND", new Uint8Array()),
  ]);
}

function concatenate(parts: Uint8Array[]) {
  const bytes = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}
function chunk(type: string, data: Uint8Array) {
  const body = concatenate([new TextEncoder().encode(type), data]);
  const result = new Uint8Array(body.length + 8);
  const view = new DataView(result.buffer);
  view.setUint32(0, data.length);
  result.set(body, 4);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  view.setUint32(result.length - 4, (crc ^ 0xffffffff) >>> 0);
  return result;
}
function deflateStored(data: Uint8Array) {
  const parts: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  for (let offset = 0; offset < data.length; offset += 65535) {
    const block = data.subarray(offset, offset + 65535);
    const header = new Uint8Array(5),
      view = new DataView(header.buffer);
    header[0] = offset + block.length === data.length ? 1 : 0;
    view.setUint16(1, block.length, true);
    view.setUint16(3, ~block.length & 65535, true);
    parts.push(header, block);
  }
  let a = 1,
    b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  const checksum = new Uint8Array(4);
  new DataView(checksum.buffer).setUint32(0, ((b << 16) | a) >>> 0);
  return concatenate([...parts, checksum]);
}
