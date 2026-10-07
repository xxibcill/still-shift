export { compositionAudioWavHeader as compositionPcmWavHeader } from "@still-shift/scene-contract";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";

const STREAM_BYTES = 64 * 1024;
export const PCM_WORKING_RESERVATION = STREAM_BYTES * 4 + 4;

/** Incremental validation also handles a float split across arbitrary pipe chunks. */
export class PcmInspection {
  readonly digest = createHash("sha256");
  readonly scratch = Buffer.alloc(4);
  bytes = 0;
  remainder = 0;
  peakBytes = 4;
  readonly expectedBytes: number;
  readonly path: string;
  constructor(expectedBytes: number, path: string) {
    this.expectedBytes = expectedBytes;
    this.path = path;
  }
  accept(chunk: Buffer, queuedBytes = 0) {
    this.peakBytes = Math.max(this.peakBytes, chunk.length + queuedBytes + 4);
    if (
      this.peakBytes > PCM_WORKING_RESERVATION ||
      this.bytes + chunk.length > this.expectedBytes
    )
      passageError(
        "comp-media-limit",
        "Decoded audio exceeds its sample-count or PCM buffer reservation",
        { path: this.path },
      );
    this.digest.update(chunk);
    this.bytes += chunk.length;
    let offset = 0;
    if (this.remainder) {
      const copied = Math.min(4 - this.remainder, chunk.length);
      chunk.copy(this.scratch, this.remainder, 0, copied);
      this.remainder += copied;
      offset = copied;
      if (this.remainder === 4) {
        this.finite(this.scratch.readFloatLE(0));
        this.remainder = 0;
      }
    }
    for (; offset + 4 <= chunk.length; offset += 4)
      this.finite(chunk.readFloatLE(offset));
    if (offset < chunk.length) {
      this.remainder = chunk.copy(this.scratch, 0, offset);
    }
  }
  private finite(value: number) {
    if (!Number.isFinite(value))
      passageError(
        "comp-media-format",
        "Decoded PCM contains a nonfinite sample",
        { path: this.path },
      );
  }
  finish() {
    if (this.bytes !== this.expectedBytes || this.remainder)
      passageError(
        "comp-media-provenance",
        "Actual decoded 48 kHz sample count differs from descriptor",
        { path: this.path },
      );
    return {
      sha256: "sha256:" + this.digest.digest("hex"),
      byteLength: this.bytes,
      peakPcmWorkingBytes: this.peakBytes,
    };
  }
}

/** Verify the immutable cache without allocating the complete source PCM. */
export async function verifyCompositionAudioPcm(
  path: string,
  expected: { byteLength: number; sha256: string; header?: Uint8Array },
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const stat = await lstat(path).catch(() =>
    passageError("comp-media-format", "Prepared PCM is unavailable", { path }),
  );
  if (!stat.isFile() || stat.size !== expected.byteLength)
    passageError("comp-media-provenance", "Prepared PCM byte count differs", {
      path,
    });
  const header = expected.header;
  let prefix = 0;
  const digest = createHash("sha256");
  const inspection = new PcmInspection(
    expected.byteLength - (header?.length ?? 0),
    path,
  );
  for await (const chunk of createReadStream(path, {
    highWaterMark: STREAM_BYTES,
    signal,
  })) {
    const bytes = chunk as Buffer;
    digest.update(bytes);
    const count = header ? Math.min(header.length - prefix, bytes.length) : 0;
    for (let at = 0; at < count; at++)
      if (bytes[at] !== header![prefix + at])
        passageError(
          "comp-media-provenance",
          "Prepared PCM WAV header differs",
          { path },
        );
    prefix += count;
    inspection.accept(bytes.subarray(count));
  }
  const actual = inspection.finish();
  if ("sha256:" + digest.digest("hex") !== expected.sha256)
    passageError("comp-media-checksum", "Prepared audio PCM was modified", {
      path,
    });
  signal?.throwIfAborted();
  return actual.peakPcmWorkingBytes;
}
