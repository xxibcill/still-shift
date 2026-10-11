import { gltfFail } from "./gltf-document.ts";
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++)
    crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  return crc >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255]!;
  return (crc ^ 0xffffffff) >>> 0;
}
/** Keep only static pixel chunks; glTF ignores image color profiles, aspect and animation metadata. */
export function staticGltfPng(bytes: Uint8Array, path: (string | number)[]) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value))
    gltfFail("image", "Invalid PNG signature", path);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    chunks: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8,
    header = false,
    palette = false,
    paletteEntries = 0,
    colorType = -1,
    transparency = false,
    data = false,
    dataEnded = false,
    end = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length)
      gltfFail("image", "Truncated PNG chunk", path);
    const length = view.getUint32(offset),
      stop = offset + length + 12;
    if (stop > bytes.length)
      gltfFail("image", "PNG chunk escapes encoded bounds", path);
    const type = new TextDecoder().decode(
      bytes.subarray(offset + 4, offset + 8),
    );
    if (
      !/^[A-Za-z]{4}$/.test(type) ||
      type[2] !== type[2]!.toUpperCase() ||
      crc32(bytes.subarray(offset + 4, stop - 4)) !== view.getUint32(stop - 4)
    )
      gltfFail("image", "Invalid PNG chunk type or CRC", path);
    if (!header && type !== "IHDR")
      gltfFail("image", "PNG header must be first", path);
    if (type === "IHDR") {
      if (
        header ||
        length !== 13 ||
        bytes[offset + 16] !== 8 ||
        ![0, 2, 3, 4, 6].includes(bytes[offset + 17]!) ||
        bytes[offset + 18] !== 0 ||
        bytes[offset + 19] !== 0 ||
        ![0, 1].includes(bytes[offset + 20]!)
      )
        gltfFail("image", "Unsupported PNG header", path);
      colorType = bytes[offset + 17]!;
      header = true;
    } else if (type === "PLTE") {
      if (
        palette ||
        data ||
        transparency ||
        colorType === 0 ||
        colorType === 4 ||
        !length ||
        length % 3 ||
        length > 768
      )
        gltfFail("image", "Invalid PNG palette", path);
      palette = true;
      paletteEntries = length / 3;
    } else if (type === "IDAT") {
      if (colorType === 3 && !palette)
        gltfFail(
          "image",
          "Indexed PNG requires its palette before pixels",
          path,
        );
      if (dataEnded)
        gltfFail("image", "PNG IDAT chunks must be consecutive", path);
      data = true;
    } else {
      if (data) dataEnded = true;
      if (type === "IEND") {
        if (!data || length || stop !== bytes.length)
          gltfFail("image", "Invalid PNG end or trailing bytes", path);
        end = true;
      } else if (type[0] === type[0]!.toUpperCase())
        gltfFail("unsupported", "Unsupported critical PNG chunk", [
          ...path,
          type,
        ]);
      else if (type === "tRNS") {
        const valid =
          colorType === 0
            ? length === 2 && view.getUint16(offset + 8) <= 255
            : colorType === 2
              ? length === 6 &&
                [0, 2, 4].every(
                  (channel) => view.getUint16(offset + 8 + channel) <= 255,
                )
              : colorType === 3 && palette && length <= paletteEntries;
        if (data || transparency || !valid)
          gltfFail(
            "image",
            "Invalid PNG transparency type, length or ordering",
            path,
          );
        transparency = true;
      }
    }
    if (["IHDR", "PLTE", "IDAT", "IEND", "tRNS"].includes(type))
      chunks.push(bytes.subarray(offset, stop));
    offset = stop;
  }
  if (!end) gltfFail("image", "PNG is incomplete", path);
  return Buffer.concat(chunks);
}
