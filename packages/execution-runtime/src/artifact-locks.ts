import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  open,
  readdir,
  readFile,
  rename,
  rm,
  lstat,
  writeFile,
  type FileHandle,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { AnimationEngineError } from "@still-shift/scene-contract";

type LockOwner = { pid: number; token: string; processStartedAt: string };
const execFileAsync = promisify(execFile);
const helper = fileURLToPath(
  new URL("./artifact-lock-helper.py", import.meta.url),
);
export type ArtifactLockOptions = {
  /** Standard-library Python executable; supplied by the embedding application. */
  pythonCommand?: string;
};
type ProgressMarker = {
  requestHash: string;
  sourceHash: string;
  outputPath: string;
  sceneManifestPath: string;
};

const exists = async (path: string): Promise<boolean> => {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

const exportTemporaryId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const removeInterruptedExportTemps = async (
  outputPath: string,
): Promise<void> => {
  const directory = dirname(outputPath);
  const prefix = `.${basename(outputPath)}.`;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.startsWith(prefix)) continue;
    const suffix = [".tmp.mp4", ".scene.tmp.json", ".result.tmp.json"].find(
      (candidate) => entry.name.endsWith(candidate),
    );
    if (!suffix) continue;
    const id = entry.name.slice(prefix.length, -suffix.length);
    if (exportTemporaryId.test(id))
      await rm(join(directory, entry.name), { force: true });
  }
};

const lockConflict = (outputDir: string) =>
  new AnimationEngineError(
    "RENDER_FAILED",
    "Batch output directory is already in use",
    { outputDir },
  );

const removeStaleLock = async (
  lockPath: string,
  outputDir: string,
  pythonCommand: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(pythonCommand, [helper, lockPath], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-2048);
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else if (code === 2) reject(lockConflict(outputDir));
      else
        reject(
          new AnimationEngineError(
            "RENDER_FAILED",
            "Batch lock recovery failed",
            {
              outputDir,
              code: code ?? "unknown",
              signal: signal ?? "none",
              stderr,
            },
          ),
        );
    });
  });

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

export const acquireArtifactLock = async (
  lockPath: string,
  outputDir: string,
  options: ArtifactLockOptions = {},
): Promise<() => Promise<void>> => {
  const pythonCommand =
    options.pythonCommand ?? process.env.STILL_SHIFT_PYTHON ?? "python3";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let lock: FileHandle;
    try {
      lock = await open(lockPath, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await removeStaleLock(lockPath, outputDir, pythonCommand);
      continue;
    }

    const token = randomUUID();
    try {
      const processStartedAt = (
        await execFileAsync(pythonCommand, [
          helper,
          "--identity",
          String(process.pid),
        ])
      ).stdout.trim();
      await lock.writeFile(
        `${JSON.stringify({ pid: process.pid, token, processStartedAt } satisfies LockOwner)}\n`,
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
  }
  // A progress marker identifies a request, not the owner of a final path.
  // A different writer may have created either file after the prior preflight.
  if (
    (await exists(progress.outputPath)) ||
    (await exists(progress.sceneManifestPath))
  ) {
    throw new AnimationEngineError(
      "OUTPUT_VALIDATION_FAILED",
      previous
        ? "Uncheckpointed batch output requires inspection before retry"
        : "Batch output exists without a checkpoint or progress marker",
      { outputPath: progress.outputPath },
    );
  }
  if (previous) {
    await removeInterruptedExportTemps(progress.outputPath);
    await rm(markerPath, { force: true });
  }

  const temporary = `${markerPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(progress)}\n`, { flag: "wx" });
    await rename(temporary, markerPath);
  } finally {
    await rm(temporary, { force: true });
  }
};
