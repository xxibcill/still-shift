import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import { readBoundedSourceBytes } from "./bounded-source-read.ts";
export const NATIVE_SOURCE_FILE_BYTES = 32 * 1024 ** 2;
/** The native source ceiling remains fixed, independent of remaining Node capacity. */
export async function readNativeSourceBytes(
  path: string,
  location: string,
  signal?: AbortSignal,
  admit?: (bytes: number) => void,
) {
  return readBoundedSourceBytes(path, {
    maximumBytes: NATIVE_SOURCE_FILE_BYTES,
    signal,
    ...(admit ? { admit } : {}),
    reject: (reason) =>
      passageError(
        reason === "size" ? "comp-native3d-limit" : "comp-native3d-source",
        reason === "size"
          ? "Native source exceeds 32 MiB"
          : reason === "type"
            ? "Native source must be a regular file"
            : "Native source changed during bounded read",
        { path: location },
      ),
  });
}
