import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { AnimationEngineError } from "@still-shift/scene-contract";
import { acquireArtifactLock } from "@still-shift/execution-runtime/locks";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";

export async function compositionMediaCacheLock(
  root: string,
  signal?: AbortSignal,
) {
  const deadline = performance.now() + 180_000;
  for (;;) {
    signal?.throwIfAborted();
    try {
      return await acquireArtifactLock(join(root, ".media.lock"), root);
    } catch (error) {
      if (
        !(error instanceof AnimationEngineError) ||
        error.code !== "RENDER_FAILED" ||
        error.message !== "Batch output directory is already in use"
      )
        throw error;
      if (performance.now() >= deadline)
        passageError(
          "comp-media-limit",
          "Timed out waiting for media cache preparation",
          { path: root },
        );
      await delay(100, undefined, { signal });
    }
  }
}
export async function compositionMediaCacheSize(root: string): Promise<number> {
  let bytes = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === ".media.lock" || entry.name === ".media.lock.recovery")
      continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) bytes += await compositionMediaCacheSize(path);
    else if (entry.isFile()) bytes += (await lstat(path)).size;
    else
      passageError(
        "comp-media-format",
        "Cache may only contain regular entries",
        { path },
      );
  }
  return bytes;
}
