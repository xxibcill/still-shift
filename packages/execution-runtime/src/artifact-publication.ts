import { randomUUID } from "node:crypto";
import { link, lstat, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { Stats } from "node:fs";

export type StagedArtifact = {
  staged: string;
  destination: string;
  /** Used for an existing job checkpoint even on the first publication. */
  replaceExisting?: boolean;
};

type PublicationOptions = { replaceExisting?: boolean };
type Publication = StagedArtifact & {
  source: Stats;
  previous?: Stats;
  backup?: string;
  published: boolean;
};

async function inspect(path: string): Promise<Stats | undefined> {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

const sameFile = (left: Stats, right: Stats | undefined) =>
  right !== undefined && left.dev === right.dev && left.ino === right.ino;

function conflict(path: string): Error {
  return Object.assign(new Error(`Output already exists or changed: ${path}`), {
    code: "EEXIST",
  });
}

const backupPath = (destination: string) =>
  join(
    dirname(destination),
    `.${basename(destination)}.${randomUUID()}.backup`,
  );

async function restoreBackup(
  backup: string,
  destination: string,
): Promise<void> {
  const saved = await lstat(backup);
  try {
    // A concurrent replacement always wins over restoration; retain the backup.
    await link(backup, destination);
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code !== "EEXIST" ||
      !sameFile(saved, await inspect(destination))
    )
      throw new Error(
        `Could not restore ${destination}; previous output is retained at ${backup}`,
        { cause: error },
      );
  }
  await unlink(backup);
}

async function restore(publication: Publication): Promise<void> {
  const { destination, backup, source, published } = publication;
  if (published) {
    // Detach before inspecting; stat-then-unlink could delete a replacement
    // created by another process between the two operations.
    const detached = backupPath(destination);
    try {
      await rename(destination, detached);
      if (sameFile(source, await lstat(detached))) await unlink(detached);
      else await restoreBackup(detached, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (!backup) return;
  await restoreBackup(backup, destination);
}

/**
 * Publish completion artifacts last. Resumed outputs remain recoverable beside
 * their destinations until the entire bundle commits; this is not crash atomic.
 */
export async function publishArtifacts(
  artifacts: StagedArtifact[],
  signal?: AbortSignal,
  options: PublicationOptions = {},
): Promise<void> {
  const publications: Publication[] = [];
  try {
    for (const artifact of artifacts) {
      signal?.throwIfAborted();
      const source = await lstat(artifact.staged);
      const previous = await inspect(artifact.destination);
      if (
        previous &&
        (!(artifact.replaceExisting ?? options.replaceExisting) ||
          !previous.isFile())
      )
        throw conflict(artifact.destination);
      publications.push({
        ...artifact,
        source,
        ...(previous ? { previous } : {}),
        published: false,
      });
    }
    for (const publication of publications) {
      signal?.throwIfAborted();
      if (publication.previous) {
        const backup = backupPath(publication.destination);
        await rename(publication.destination, backup);
        publication.backup = backup;
        if (!sameFile(publication.previous, await lstat(backup)))
          throw conflict(publication.destination);
      }
      await link(publication.staged, publication.destination);
      publication.published = true;
    }
    signal?.throwIfAborted();
  } catch (cause) {
    const cleanup = await Promise.allSettled(
      publications.reverse().map(restore),
    );
    const failures = cleanup.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (signal?.aborted) {
      for (const failure of failures)
        process.stderr.write(`Artifact rollback failed: ${String(failure)}\n`);
      signal.throwIfAborted();
    }
    if (failures.length)
      throw new AggregateError(
        [cause, ...failures],
        "Artifact publication and rollback failed",
        { cause },
      );
    throw cause;
  }
  for (const { backup } of publications) {
    if (!backup) continue;
    try {
      await unlink(backup);
    } catch (error) {
      process.stderr.write(
        `Committed artifact backup cleanup failed: ${String(error)}\n`,
      );
    }
  }
}
