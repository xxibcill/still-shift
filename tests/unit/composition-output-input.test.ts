import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { describe, expect, it } from "vitest";
import { CompositionOutputInput } from "../../packages/execution-runtime/src/composition-output-input.ts";
import { compositionOutputProfile } from "../../packages/execution-runtime/src/composition-output.ts";

async function convert(
  format: "png8" | "png16",
  bytes: Buffer,
  expectedBytes: number,
  sizes: number[],
) {
  const chunks: Buffer[] = [];
  for (let offset = 0, index = 0; offset < bytes.length; index++) {
    const end = Math.min(bytes.length, offset + sizes[index % sizes.length]!);
    chunks.push(bytes.subarray(offset, end));
    offset = end;
  }
  const output: Buffer[] = [];
  await pipeline(
    Readable.from(chunks),
    new CompositionOutputInput(compositionOutputProfile(format), expectedBytes),
    new Writable({
      write(bytes: Buffer, _encoding, callback) {
        output.push(bytes);
        callback();
      },
    }),
  );
  return Buffer.concat(output);
}

describe("canonical composition encoder input", () => {
  it.each(["png8", "png16"] as const)(
    "preserves every alpha value and known BT.709 samples for %s across split pixels",
    async (format) => {
      const input = Buffer.alloc(256 * 4);
      for (let alpha = 0; alpha < 256; alpha++)
        input.set([0, 64, 128, alpha], alpha * 4);
      const actual = await convert(
        format,
        input,
        input.length,
        [1, 2, 3, 5, 7, 61, 127],
      );
      const high = format === "png16";
      expect(actual.length).toBe(input.length * (high ? 2 : 1));
      for (let alpha = 0; alpha < 256; alpha++) {
        const offset = alpha * (high ? 8 : 4);
        // RGB values independently calculated from the standard curve at 60 decimal digits.
        expect(
          high
            ? [0, 1, 2, 3].map((channel) =>
                actual.readUInt16LE(offset + channel * 2),
              )
            : [...actual.subarray(offset, offset + 4)],
        ).toEqual(high ? [0, 12431, 29640, alpha * 257] : [0, 48, 115, alpha]);
      }
    },
  );
  it.each(["png8", "png16"] as const)(
    "rejects an incomplete final frame for %s",
    async (format) => {
      await expect(convert(format, Buffer.alloc(7), 8, [1, 2])).rejects.toThrow(
        "complete frame count",
      );
    },
  );
  it("rejects an input chunk beyond its allocation bound", async () => {
    await expect(
      convert("png16", Buffer.alloc(65537), 65540, [65537]),
    ).rejects.toThrow("chunk exceeds its byte bound");
  });
});
