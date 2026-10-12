import { open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
/** Descriptor admission precedes allocation; native and root policies stay separate. */
export async function readBoundedSourceBytes(
  path: string,
  options: {
    maximumBytes: number;
    signal?: AbortSignal | undefined;
    admit?: (bytes: number) => void;
    reject: (reason: "type" | "size" | "changed") => never;
  },
) {
  if (!Number.isSafeInteger(options.maximumBytes) || options.maximumBytes < 0)
    throw Error("Source capacity is invalid");
  options.signal?.throwIfAborted();
  const canonical = await realpath(path);
  const handle = await open(
    canonical,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0),
  );
  let bytes: Buffer | undefined,
    failure: { reason: unknown } | undefined,
    result: Buffer | undefined;
  const retire = () => {
    try {
      if (bytes?.buffer.byteLength)
        (
          bytes.buffer as ArrayBuffer & { transfer(bytes: number): ArrayBuffer }
        ).transfer(0);
    } catch {
      /* Preserve the descriptor failure. */
    }
  };
  try {
    options.signal?.throwIfAborted();
    const before = await handle.stat();
    if (!before.isFile()) options.reject("type");
    if (before.size > options.maximumBytes) options.reject("size");
    options.admit?.(before.size + 1);
    options.signal?.throwIfAborted();
    bytes = Buffer.alloc(before.size + 1);
    let count = 0;
    while (count < bytes.length) {
      options.signal?.throwIfAborted();
      const { bytesRead } = await handle.read(
        bytes,
        count,
        Math.min(65536, bytes.length - count),
        count,
      );
      if (!bytesRead) break;
      count += bytesRead;
    }
    const after = await handle.stat();
    options.signal?.throwIfAborted();
    if (
      count !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    )
      options.reject("changed");
    result = bytes.subarray(0, count);
  } catch (error) {
    failure = { reason: error };
    retire();
  } finally {
    try {
      await handle.close();
    } catch (error) {
      if (!failure) {
        retire();
        failure = { reason: error };
      }
    }
  }
  if (failure) throw failure.reason;
  return result!;
}
