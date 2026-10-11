import { open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
export const NATIVE_SOURCE_FILE_BYTES = 32 * 1024 ** 2;
/** One verified descriptor, exact bounded backing store and growth sentinel. */
export async function readNativeSourceBytes(
  path: string,
  location: string,
  signal?: AbortSignal,
  admit?: (bytes: number) => void,
) {
  signal?.throwIfAborted();
  const canonical = await realpath(path);
  const handle = await open(
    canonical,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0),
  );
  try {
    signal?.throwIfAborted();
    const before = await handle.stat();
    if (!before.isFile())
      passageError(
        "comp-native3d-source",
        "Native source must be a regular file",
        { path: location },
      );
    if (before.size > NATIVE_SOURCE_FILE_BYTES)
      passageError("comp-native3d-limit", "Native source exceeds 32 MiB", {
        path: location,
      });
    admit?.(before.size + 1);
    signal?.throwIfAborted();
    const bytes = Buffer.alloc(before.size + 1);
    let count = 0;
    while (count < bytes.length) {
      signal?.throwIfAborted();
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
    signal?.throwIfAborted();
    if (
      count !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    )
      passageError(
        "comp-native3d-source",
        "Native source changed during bounded read",
        { path: location },
      );
    return bytes.subarray(0, count);
  } finally {
    await handle.close();
  }
}
