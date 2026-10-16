import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, rm } from "node:fs/promises";
import {
  AnimationEngineError,
  COMPOSITION_NODE_MEMORY_ALLOWANCE,
} from "@still-shift/scene-contract";
import type { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import type { MemoryLease } from "../../../renderer-core/src/managed-memory.ts";
import { readBoundedSourceBytes } from "../bounded-source-read.ts";
import { nativeJsonTreeCapacity } from "../native-source-admission.ts";
const chunkBytes = 65536;
function failure(path: string, message: string): never {
  throw new AnimationEngineError("INPUT_UNREADABLE", message, {
    stage: "mechanism-cue-native-plates",
    path,
    diagnosticCode: "mechanism-cue-plate-file",
    nextAction:
      "Capture fresh plates from the current verified cue compilation; preserve the failed receipt.",
  });
}
/** Retain parser/tree storage in the same owner used for native source and closure verification. */
export async function readCuePlateJson(
  path: string,
  owner: CompositionNodeMemory,
  signal?: AbortSignal,
  maximumBytes = 32 * 1024 * 1024,
  expectedSha256?: string,
) {
  const scanner = owner.reserve(chunkBytes);
  let body: MemoryLease | undefined, bytes: Buffer | undefined;
  try {
    bytes = await readBoundedSourceBytes(path, {
      signal,
      maximumBytes: Math.min(
        maximumBytes,
        Math.max(0, Math.floor((owner.availableBytes - 128) / 3) - 1),
      ),
      admit: (capacity) => {
        body = owner.reserve(capacity * 3 + 128);
      },
      reject: (reason) =>
        failure(
          path,
          "Plate JSON regular-file/size/stability admission failed: " + reason,
        ),
    });
    if (
      expectedSha256 &&
      "sha256:" + createHash("sha256").update(bytes).digest("hex") !==
        expectedSha256
    )
      failure(path, "Plate JSON hash changed during admitted read");
    const text = bytes.toString("utf8");
    owner.reserve(
      nativeJsonTreeCapacity(text, Math.floor(owner.availableBytes / 8), path) *
        8,
    );
    signal?.throwIfAborted();
    return JSON.parse(text) as unknown;
  } finally {
    if (bytes?.buffer.byteLength)
      (
        bytes.buffer as ArrayBuffer & { transfer(bytes: number): ArrayBuffer }
      ).transfer(0);
    body?.release();
    scanner.release();
  }
}
/** Fixed-size streaming body proof; copied dependencies use the existing 32MiB source admission. */
export async function cuePlateFile(
  path: string,
  owner: CompositionNodeMemory,
  options: {
    signal?: AbortSignal | undefined;
    destination?: string;
    sha256?: string;
    maximumBytes?: number;
  } = {},
) {
  options.signal?.throwIfAborted();
  const lease = owner.reserve(chunkBytes + 128);
  let scratch: Buffer | undefined;
  let input: Awaited<ReturnType<typeof open>> | undefined,
    output: Awaited<ReturnType<typeof open>> | undefined,
    created = false,
    complete = false;
  let result: { path: string; bytes: number; sha256: string } | undefined;
  let primary: { reason: unknown } | undefined;
  const cleanup: unknown[] = [];
  try {
    input = await open(
      path,
      constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0),
    );
    const before = await input.stat();
    if (!before.isFile())
      failure(path, "Plate dependency must be a regular file");
    if (
      before.size > (options.maximumBytes ?? COMPOSITION_NODE_MEMORY_ALLOWANCE)
    )
      failure(path, "Plate dependency exceeds its admitted file size");
    scratch = Buffer.alloc(chunkBytes);
    if (options.destination) {
      output = await open(options.destination, "wx");
      created = true;
    }
    const hash = createHash("sha256");
    let offset = 0;
    while (offset < before.size) {
      options.signal?.throwIfAborted();
      const { bytesRead } = await input.read(
        scratch,
        0,
        Math.min(chunkBytes, before.size - offset),
        offset,
      );
      if (!bytesRead)
        failure(path, "Plate dependency changed during streaming read");
      hash.update(scratch.subarray(0, bytesRead));
      if (output) {
        let written = 0;
        while (written < bytesRead) {
          options.signal?.throwIfAborted();
          const result = await output.write(
            scratch,
            written,
            bytesRead - written,
            offset + written,
          );
          if (!result.bytesWritten)
            failure(path, "Plate dependency copy made no progress");
          written += result.bytesWritten;
        }
      }
      offset += bytesRead;
    }
    const after = await input.stat();
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    )
      failure(path, "Plate dependency changed during streaming read");
    const sha256 = "sha256:" + hash.digest("hex");
    if (options.sha256 && sha256 !== options.sha256)
      failure(path, "Plate dependency hash changed");
    options.signal?.throwIfAborted();
    complete = true;
    result = { path: options.destination ?? path, bytes: before.size, sha256 };
  } catch (reason) {
    primary = { reason };
  } finally {
    for (const handle of [output, input]) {
      try {
        await handle?.close();
      } catch (reason) {
        cleanup.push(reason);
        complete = false;
      }
    }
    if (created && !complete) {
      try {
        await rm(options.destination!, { force: true });
      } catch (reason) {
        cleanup.push(reason);
      }
    }
    try {
      if (scratch?.buffer.byteLength)
        (
          scratch.buffer as ArrayBuffer & {
            transfer(bytes: number): ArrayBuffer;
          }
        ).transfer(0);
    } catch (reason) {
      cleanup.push(reason);
    }
    try {
      lease.release();
    } catch (reason) {
      cleanup.push(reason);
    }
  }
  if (cleanup.length)
    throw new AggregateError(
      [...(primary ? [primary.reason] : []), ...cleanup],
      "Plate file failure with cleanup evidence",
      primary ? { cause: primary.reason } : undefined,
    );
  if (primary) throw primary.reason;
  return result!;
}
