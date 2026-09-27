import { acquireArtifactLock } from "@still-shift/execution-runtime/locks";
import { readFile, writeFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { passageHash, stableJson } from "./passage-cache.ts";

type JobState = {
  version: "passage-job-1";
  identity: string;
  status: "running" | "complete" | "failed" | "cancelled";
  updatedAt: string;
  completedBeats: string[];
  error?: string;
};
export async function acquirePassageJob(
  output: string,
  input: unknown,
  resume: boolean,
) {
  const identity = passageHash(stableJson(input));
  const path = join(output, "render-job.json"),
    lock = join(output, ".render-job.lock");
  const releaseLock = await acquireArtifactLock(lock, output);
  let released: Promise<void> | undefined;
  const release = () => (released ??= releaseLock());
  let state: JobState;
  try {
    let previous: JobState | undefined;
    try {
      previous = JSON.parse(await readFile(path, "utf8")) as JobState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (
      previous &&
      (!resume ||
        previous.identity !== identity ||
        previous.version !== "passage-job-1")
    )
      throw new Error(
        "Output belongs to a different job or requires --resume; use a fresh output directory for changed inputs",
      );
    if (resume && !previous)
      throw new Error("Cannot resume an output without a render job");
    state = {
      version: "passage-job-1",
      identity,
      status: "running",
      updatedAt: new Date().toISOString(),
      completedBeats: previous?.completedBeats ?? [],
    };
  } catch (error) {
    await release();
    throw error;
  }
  const save = async () => {
    state.updatedAt = new Date().toISOString();
    const temporary = path + "." + randomUUID();
    try {
      await writeFile(temporary, JSON.stringify(state, null, 2) + "\n", {
        flag: "wx",
      });
      await rename(temporary, path);
    } finally {
      await rm(temporary, { force: true }).catch((error: unknown) => {
        process.stderr.write(
          `Passage checkpoint cleanup failed: ${String(error)}\n`,
        );
      });
    }
  };
  try {
    await save();
  } catch (error) {
    await release();
    throw error;
  }
  return {
    release,
    async stageCompletion(staged: string) {
      await writeFile(
        staged,
        JSON.stringify(
          { ...state, status: "complete", updatedAt: new Date().toISOString() },
          null,
          2,
        ) + "\n",
        { flag: "wx" },
      );
      return { staged, destination: path, replaceExisting: true };
    },
    async beat(id: string) {
      if (!state.completedBeats.includes(id)) state.completedBeats.push(id);
      await save();
    },
    async finish(status: JobState["status"], error?: unknown) {
      state.status = status;
      if (error !== undefined)
        state.error = error instanceof Error ? error.message : String(error);
      try {
        await save();
      } finally {
        await release();
      }
    },
  };
}
