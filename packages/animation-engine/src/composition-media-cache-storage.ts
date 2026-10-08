import { lstat, readdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  AnimationEngineError,
  compositionMediaMappingDocument,
  type Composition,
} from "@still-shift/scene-contract";
import { acquireArtifactLock } from "@still-shift/execution-runtime/locks";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";

const checksum = (value: string) =>
  "sha256:" + createHash("sha256").update(value).digest("hex");
export function compositionMediaCacheDirectory(directory?: string) {
  return (
    directory ??
    process.env.STILL_SHIFT_COMPOSITION_MEDIA_CACHE ??
    join(
      tmpdir(),
      "still-shift-composition-media",
      checksum(resolve(process.cwd())).slice(7),
    )
  );
}
/** Relocated physical source files do not change the authored clock/mix identity. */
export function compositionMediaMappingIdentity(composition: Composition) {
  return checksum(compositionMediaMappingDocument(composition));
}

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
/** Cache ownership ends even when removal of a failed staging directory rejects. */
export async function finishCompositionMediaCacheTransaction(
  release: () => Promise<void>,
  stage?: string,
): Promise<void> {
  try {
    if (stage) await rm(stage, { recursive: true, force: true });
  } finally {
    await release();
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
