/** Canonical 48 kHz stereo Float32 RIFF, shared by capture, export and preview. */
export function compositionAudioWavHeader(sampleCount: number) {
  if (
    !Number.isSafeInteger(sampleCount) ||
    sampleCount < 1 ||
    sampleCount > 172_800_000
  )
    throw new Error("Audio PCM sample count is outside the supported bound");
  const header = new Uint8Array(58),
    view = new DataView(header.buffer);
  const text = (at: number, value: string) => {
    for (let index = 0; index < value.length; index++)
      header[at + index] = value.charCodeAt(index);
  };
  text(0, "RIFF");
  view.setUint32(4, sampleCount * 8 + 50, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 18, true);
  view.setUint16(20, 3, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, 48000, true);
  view.setUint32(28, 48000 * 8, true);
  view.setUint16(32, 8, true);
  view.setUint16(34, 32, true);
  text(38, "fact");
  view.setUint32(42, 4, true);
  view.setUint32(46, sampleCount, true);
  text(50, "data");
  view.setUint32(54, sampleCount * 8, true);
  return header;
}
