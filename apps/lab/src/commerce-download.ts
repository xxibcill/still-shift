export type BundleFile = { name: string; bytes: Uint8Array };
const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
};

/** Store files without compression so the browser needs no archive dependency. */
export function createSourceZip(files: BundleFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const local: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0,
    centralSize = 0;
  for (const file of files) {
    const name = encoder.encode(file.name),
      checksum = crc32(file.bytes);
    const header = new Uint8Array(30 + name.length),
      h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x800, true);
    h.setUint16(12, 0x21, true);
    h.setUint32(14, checksum, true);
    h.setUint32(18, file.bytes.length, true);
    h.setUint32(22, file.bytes.length, true);
    h.setUint16(26, name.length, true);
    header.set(name, 30);
    local.push(header, file.bytes);
    const directory = new Uint8Array(46 + name.length),
      d = new DataView(directory.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, 0x800, true);
    d.setUint16(14, 0x21, true);
    d.setUint32(16, checksum, true);
    d.setUint32(20, file.bytes.length, true);
    d.setUint32(24, file.bytes.length, true);
    d.setUint16(28, name.length, true);
    d.setUint32(42, offset, true);
    directory.set(name, 46);
    central.push(directory);
    centralSize += directory.length;
    offset += header.length + file.bytes.length;
  }
  const footer = new Uint8Array(22),
    end = new DataView(footer.buffer);
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const bytes = new Uint8Array(offset + centralSize + footer.length);
  let cursor = 0;
  for (const part of [...local, ...central, footer]) {
    bytes.set(part, cursor);
    cursor += part.length;
  }
  return bytes;
}
