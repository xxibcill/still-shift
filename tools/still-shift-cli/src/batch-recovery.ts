import { randomUUID } from "node:crypto";
import {
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
  type FileHandle,
} from "node:fs/promises";

import { AnimationEngineError } from "@still-shift/scene-contract";

type LockOwner = { pid: number; token: string };
type ProgressMarker = {
  requestHash: string;
  sourceHash: string;
  outputPath: string;
  sceneManifestPath: string;
};

const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

const processIsRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
};

const lockConflict = (outputDir: string) =>
  new AnimationEngineError(
    "RENDER_FAILED",
    "Batch output directory is already in use",
    { outputDir },
  );

const releaseOwnedLock = async (
  lockPath: string,
  lock: FileHandle,
  token: string,
): Promise<void> => {
  try {
    const current = JSON.parse(await readFile(lockPath, "utf8")) as LockOwner;
    if (current.token === token) await rm(lockPath, { force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  } finally {
    await lock.close();
  }
};

export const acquireBatchLock = async (
  lockPath: string,
  outputDir: string,
): Promise<() => Promise<void>> => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let lock: FileHandle;
    try {
      lock = await open(lockPath, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let previous: string;
      try {
        previous = await readFile(lockPath, "utf8");
      } catch (readError) {
        if ((readError as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw readError;
      }
      let owner: LockOwner | null = null;
      try {
        owner = JSON.parse(previous) as LockOwner;
      } catch {
        // A writer may still be creating the lock file.
      }
      const validOwner =
        owner &&
        Number.isInteger(owner.pid) &&
        owner.pid > 0 &&
        typeof owner.token === "string";
      if (owner && validOwner && processIsRunning(owner.pid))
        throw lockConflict(outputDir);
      if (!validOwner) {
        let modifiedAt: number;
        try {
          modifiedAt = (await stat(lockPath)).mtimeMs;
        } catch (statError) {
          if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
          throw statError;
        }
        const ageMs = Date.now() - modifiedAt;
        if (ageMs < 30_000) throw lockConflict(outputDir);
      }
      let current: string;
      try {
        current = await readFile(lockPath, "utf8");
      } catch (readError) {
        if ((readError as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw readError;
      }
      if (current !== previous) continue;
      await rm(lockPath, { force: true });
      continue;
    }

    const token = randomUUID();
    try {
      await lock.writeFile(
        `${JSON.stringify({ pid: process.pid, token } satisfies LockOwner)}\n`,
      );
    } catch (error) {
      await lock.close();
      await rm(lockPath, { force: true });
      throw error;
    }
    return () => releaseOwnedLock(lockPath, lock, token);
  }
  throw lockConflict(outputDir);
};

export const prepareBatchItem = async (
  markerPath: string,
  progress: ProgressMarker,
): Promise<void> => {
  let previous: ProgressMarker | null = null;
  try {
    previous = JSON.parse(await readFile(markerPath, "utf8")) as ProgressMarker;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new AnimationEngineError(
        "RENDER_FAILED",
        "Batch progress marker is unreadable",
        { markerPath },
      );
  }
  if (previous) {
    if (
      previous.requestHash !== progress.requestHash ||
      previous.sourceHash !== progress.sourceHash ||
      previous.outputPath !== progress.outputPath ||
      previous.sceneManifestPath !== progress.sceneManifestPath
    )
      throw new AnimationEngineError(
        "SCENE_INVALID",
        "Batch item changed after an interrupted render",
        { markerPath },
      );
    await rm(progress.outputPath, { force: true });
    await rm(progress.sceneManifestPath, { force: true });
    await rm(markerPath, { force: true });
  } else if (
    (await exists(progress.outputPath)) ||
    (await exists(progress.sceneManifestPath))
  ) {
    throw new AnimationEngineError(
      "OUTPUT_VALIDATION_FAILED",
      "Batch output exists without a checkpoint or progress marker",
      { outputPath: progress.outputPath },
    );
  }

  const temporary = `${markerPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(progress)}\n`, { flag: "wx" });
    await rename(temporary, markerPath);
  } finally {
    await rm(temporary, { force: true });
  }
};
