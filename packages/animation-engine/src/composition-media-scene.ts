import { deflateSync, inflateSync } from "node:zlib";
import {
  COMPOSITION_SCENE_SAMPLE_RANGE,
  type CompositionMediaColor,
} from "@still-shift/scene-contract";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";

/**
 * CG7 scene frames (docs/color-grading-cg7-decisions.md): FFmpeg only lays a
 * source out as 4:4:4 planes at its own bit depth (chroma upsampled, luma
 * untouched); the Y′CbCr → RGB matrix and range run here in float64 from the
 * published equations, and the result is a canonical 16-bit RGBA PNG over
 * COMPOSITION_SCENE_SAMPLE_RANGE. FFmpeg's own RGB64 output widens 10-bit
 * codes by a shift (1023 → 65472), which is not lossless (CG7 results).
 */

/** The planar layout FFmpeg writes for a source pixel format. */
export function sceneRawFormat(
  pixelFormat: string,
  color: CompositionMediaColor,
): { format: string; depth: number } {
  const depth = Number(/(\d+)(?:le|be)$/.exec(pixelFormat)?.[1] ?? 8);
  if (![8, 9, 10, 12, 14, 16].includes(depth))
    passageError(
      "comp-media-format",
      `Unsupported source pixel format ${pixelFormat} for the color-managed source stage`,
      { path: "media" },
    );
  const planes = color.matrix === "gbr" ? "gbrp" : "yuv444p";
  return { format: depth > 8 ? `${planes}${depth}le` : planes, depth };
}

/** Bytes of one raw frame in the layout above. */
export const sceneRawFrameBytes = (
  width: number,
  height: number,
  depth: number,
) => width * height * 3 * (depth > 8 ? 2 : 1);

const KR_KB: Record<string, readonly [number, number]> = {
  bt709: [0.2126, 0.0722],
  smpte170m: [0.299, 0.114],
  bt2020nc: [0.2627, 0.0593],
};

/**
 * One raw planar frame → a reader of its encoded RGB (float64, unclamped).
 * Limited range: Y′ = (D − 16·2^(n−8)) / (219·2^(n−8)),
 * C = (D − 2^(n−1)) / (224·2^(n−8)); full range: Y′ = D / (2^n − 1),
 * C = (D − 2^(n−1)) / (2^n − 1) (ITU-R BT.709-6, BT.2020-2, BT.2100-2
 * Table 9). A camera encoding uses full range.
 */
function scenePixels(
  raw: Uint8Array,
  width: number,
  height: number,
  depth: number,
  color: CompositionMediaColor,
): (i: number, out: [number, number, number]) => void {
  const count = width * height;
  const wide = depth > 8;
  if (raw.length !== sceneRawFrameBytes(width, height, depth))
    passageError("comp-media-format", "Decoded frame size differs", {
      path: "media",
    });
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const sample = (plane: number, i: number) =>
    wide
      ? view.getUint16((plane * count + i) * 2, true)
      : raw[plane * count + i]!;
  const max = 2 ** depth - 1;
  if (color.matrix === "gbr")
    // gbrp planes: G, B, R.
    return (i, out) => {
      out[0] = sample(2, i) / max;
      out[1] = sample(0, i) / max;
      out[2] = sample(1, i) / max;
    };
  const [kr, kb] = KR_KB[color.matrix]!;
  const kg = 1 - kr - kb;
  const full = color.encoding !== undefined || color.range === "pc";
  const unit = 2 ** (depth - 8);
  const yOffset = full ? 0 : 16 * unit,
    yScale = full ? max : 219 * unit,
    cOffset = 2 ** (depth - 1),
    cScale = full ? max : 224 * unit;
  return (i, out) => {
    const y = (sample(0, i) - yOffset) / yScale;
    const cb = (sample(1, i) - cOffset) / cScale;
    const cr = (sample(2, i) - cOffset) / cScale;
    const r = y + 2 * (1 - kr) * cr;
    const b = y + 2 * (1 - kb) * cb;
    out[0] = r;
    out[1] = (y - kr * r - kb * b) / kg;
    out[2] = b;
  };
}

/** One raw planar frame → encoded RGB (float64, unclamped); see scenePixels. */
export function sceneFrameRgb(
  raw: Uint8Array,
  width: number,
  height: number,
  depth: number,
  color: CompositionMediaColor,
): Float64Array {
  const pixel = scenePixels(raw, width, height, depth, color);
  const count = width * height;
  const rgb = new Float64Array(count * 3);
  const v: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    pixel(i, v);
    rgb[i * 3] = v[0];
    rgb[i * 3 + 1] = v[1];
    rgb[i * 3 + 2] = v[2];
  }
  return rgb;
}

const [LOW, HIGH] = COMPOSITION_SCENE_SAMPLE_RANGE;
/** Encoded value → stored 16-bit sample (clamped to the stored range). */
export const sceneSampleWord = (v: number) =>
  Math.max(0, Math.min(65535, Math.round(((v - LOW) / (HIGH - LOW)) * 65535)));

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++)
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function chunk(type: string, data: Buffer) {
  const bytes = Buffer.alloc(data.length + 12);
  bytes.writeUInt32BE(data.length);
  bytes.write(type, 4, "ascii");
  data.copy(bytes, 8);
  let crc = 0xffffffff;
  for (const value of bytes.subarray(4, bytes.length - 4))
    crc = crcTable[(crc ^ value) & 255]! ^ (crc >>> 8);
  bytes.writeUInt32BE((crc ^ 0xffffffff) >>> 0, bytes.length - 4);
  return bytes;
}

/** Pixels in row order → canonical scene PNG: RGBA16, opaque, row filter 0. */
function scenePng(
  width: number,
  height: number,
  pixel: (i: number, out: [number, number, number]) => void,
): Buffer {
  const stride = width * 8 + 1;
  const rows = Buffer.alloc(stride * height);
  const v: [number, number, number] = [0, 0, 0];
  for (let y = 0; y < height; y++) {
    let at = y * stride + 1;
    for (let x = 0; x < width; x++) {
      pixel(y * width + x, v);
      rows.writeUInt16BE(sceneSampleWord(v[0]), at);
      rows.writeUInt16BE(sceneSampleWord(v[1]), at + 2);
      rows.writeUInt16BE(sceneSampleWord(v[2]), at + 4);
      rows.writeUInt16BE(65535, at + 6);
      at += 8;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 16;
  header[9] = 6;
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 3 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Encoded RGB → canonical scene PNG: RGBA16, opaque, row filter 0. */
export function encodeScenePng(
  rgb: Float64Array,
  width: number,
  height: number,
): Buffer {
  return scenePng(width, height, (i, out) => {
    out[0] = rgb[i * 3]!;
    out[1] = rgb[i * 3 + 1]!;
    out[2] = rgb[i * 3 + 2]!;
  });
}

/**
 * One raw planar frame → its canonical scene PNG, without a whole-frame
 * float buffer: the same bytes as `encodeScenePng(sceneFrameRgb(...))`, with
 * a working set of the raw frame and the PNG rows (CG7 preparation).
 */
export function sceneFramePng(
  raw: Uint8Array,
  width: number,
  height: number,
  depth: number,
  color: CompositionMediaColor,
): Buffer {
  return scenePng(width, height, scenePixels(raw, width, height, depth, color));
}

/** A canonical scene PNG → its 16-bit RGBA samples (Node; tests and tools). */
export function decodeScenePng(bytes: Buffer): {
  width: number;
  height: number;
  samples: Uint16Array;
} {
  const fail = () =>
    passageError("comp-media-format", "Not a canonical scene frame", {
      path: "PNG",
    });
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) fail();
  let position = 8,
    width = 0,
    height = 0;
  const data: Buffer[] = [];
  while (position < bytes.length) {
    const length = bytes.readUInt32BE(position);
    const type = bytes.toString("ascii", position + 4, position + 8);
    const body = bytes.subarray(position + 8, position + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 16 || body[9] !== 6 || body[12] !== 0) fail();
    } else if (type === "IDAT") data.push(body);
    position += length + 12;
  }
  const rows = inflateSync(Buffer.concat(data));
  const stride = width * 8 + 1;
  if (!width || rows.length !== stride * height) fail();
  const samples = new Uint16Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    if (rows[y * stride] !== 0) fail();
    for (let i = 0; i < width * 4; i++)
      samples[y * width * 4 + i] = rows.readUInt16BE(y * stride + 1 + i * 2);
  }
  return { width, height, samples };
}
