import { acquireBatchLock } from "../../../tools/still-shift-cli/src/batch-recovery.ts";
import { readFile, writeFile, rename } from "node:fs/promises";
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
  const release = await acquireBatchLock(lock, output);
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
    await writeFile(temporary, JSON.stringify(state, null, 2) + "\n", {
      flag: "wx",
    });
    await rename(temporary, path);
  };
  try {
    await save();
  } catch (error) {
    await release();
    throw error;
  }
  return {
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
