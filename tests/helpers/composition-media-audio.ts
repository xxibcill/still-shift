/** Independent IEEE-float WAV fixture; production masters use their separate fact-chunk layout. */
export function mediaFloat32Wave(
  sampleCount: number,
  channels: 1 | 2,
  sample: (ordinal: number, channel: number) => number,
  sampleRate = 48000,
) {
  const pcm = Buffer.alloc(sampleCount * channels * 4);
  for (let ordinal = 0; ordinal < sampleCount; ordinal++)
    for (let channel = 0; channel < channels; channel++)
      pcm.writeFloatLE(
        sample(ordinal, channel),
        (ordinal * channels + channel) * 4,
      );
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(pcm.length + 36, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 4, 28);
  header.writeUInt16LE(channels * 4, 32);
  header.writeUInt16LE(32, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return { wav: Buffer.concat([header, pcm]), pcm };
}
