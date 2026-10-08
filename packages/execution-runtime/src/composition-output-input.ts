import { spawn } from "node:child_process";
import { Transform, type Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { FrameTransport } from "./transport.ts";
import {
  createCompositionOutputConversion,
  type CompositionOutputProfile,
} from "./composition-output.ts";

/** Bounded byte conversion; split stream chunks never split a captured RGBA pixel. */
export class CompositionOutputInput extends Transform {
  private remainder = Buffer.alloc(0);
  private received = 0;
  private readonly conversion;

  private readonly expectedBytes: number;

  constructor(profile: CompositionOutputProfile, expectedBytes: number) {
    super({ readableHighWaterMark: 65536, writableHighWaterMark: 65536 });
    this.expectedBytes = expectedBytes;
    this.conversion = createCompositionOutputConversion(profile);
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ) {
    try {
      if (chunk.length > 65536)
        throw Error("Composition input chunk exceeds its byte bound");
      this.received += chunk.length;
      if (this.received > this.expectedBytes)
        throw Error("Composition input exceeds its complete frame count");
      const bytes = this.remainder.length
        ? Buffer.concat([this.remainder, chunk])
        : chunk;
      const complete = bytes.length - (bytes.length % 4);
      this.remainder = Buffer.from(bytes.subarray(complete));
      const converted = this.conversion.convert(bytes.subarray(0, complete));
      this.push(
        Buffer.from(
          converted.buffer,
          converted.byteOffset,
          converted.byteLength,
        ),
      );
      callback();
    } catch (error) {
      callback(error instanceof Error ? error : Error(String(error)));
    }
  }

  override _flush(callback: (error?: Error | null) => void) {
    callback(
      this.remainder.length || this.received !== this.expectedBytes
        ? Error("Composition input ended before its complete frame count")
        : null,
    );
  }
}

/** PNG is decoded once as a bounded stream; explicit profiles feed canonical RGBA. */
export function compositionOutputInput(
  profile: CompositionOutputProfile,
  transport: FrameTransport,
  frameBytes: number,
  frameCount: number,
  encoderInput: Writable,
  signal?: AbortSignal,
) {
  const converter = new CompositionOutputInput(
    profile,
    frameBytes * frameCount,
  );
  const decoder =
    transport === "png_pipe"
      ? spawn(
          "ffmpeg",
          [
            "-v",
            "error",
            "-threads",
            "1",
            "-f",
            "image2pipe",
            "-vcodec",
            "png",
            "-i",
            "pipe:0",
            "-threads",
            "1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgba",
            "pipe:1",
          ],
          { stdio: ["pipe", "pipe", "pipe"] },
        )
      : undefined;
  let stderr = "";
  decoder?.stderr.on("data", (bytes: Buffer) => {
    stderr = (stderr + bytes.toString()).slice(-65536);
  });
  decoder?.stdin.on("error", () => undefined);
  const decoderClosed = decoder
    ? new Promise<void>((resolve, reject) => {
        decoder.once("error", reject);
        decoder.once("close", (code) =>
          code === 0
            ? resolve()
            : reject(
                Error(`Composition PNG decoder failed (${code}): ${stderr}`),
              ),
        );
      })
    : Promise.resolve();
  const reaped = decoder
    ? new Promise<void>((resolve) => decoder.once("close", () => resolve()))
    : Promise.resolve();
  const input = decoder?.stdin ?? converter;
  const completed = decoder
    ? pipeline(decoder.stdout, converter, encoderInput, { signal })
    : pipeline(converter, encoderInput, { signal });
  completed.catch(() => undefined);
  decoderClosed.catch(() => undefined);
  return {
    input,
    async finish() {
      input.end();
      await Promise.all([completed, decoderClosed]);
    },
    async dispose() {
      decoder?.kill("SIGKILL");
      converter.destroy();
      await reaped;
    },
  };
}
