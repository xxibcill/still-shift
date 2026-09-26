import { acquireBatchLock } from "../../../tools/still-shift-cli/src/batch-recovery.ts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { createHash, randomUUID } from "node:crypto";
import {
  readFile,
  writeFile,
  mkdir,
  rename,
  rm,
  readdir,
  copyFile,
  link,
} from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve, dirname } from "node:path";
import type { StoryScene } from "../../scene-contract/src/story.ts";
import { compileStoryScene } from "../../renderer-core/src/story-scene.ts";

export const passageHash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + stableJson(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function passageBeatKey(scene: StoryScene, runtime: string) {
  const normalized = structuredClone(scene);
  delete normalized.episodeStartFrame;
  for (const asset of [...normalized.assets, ...(normalized.fonts ?? [])])
    asset.path = asset.sha256;
  return passageHash(
    stableJson({
      version: "passage-cache-1",
      scene: normalized,
      renderer: compileStoryScene(scene).rendererVersion,
      runtime,
      encoder: "libx264:veryfast:crf18:yuv420p:png_pipe",
    }),
  );
}
export async function passageRuntimeIdentity() {
  const root = resolve(import.meta.dirname, "../../..");
  const files: string[] = [];
  const visit = async (directory: string) => {
    for (const entry of await readdir(join(root, directory), {
      withFileTypes: true,
    })) {
      const name = join(directory, entry.name);
      if (entry.isDirectory()) await visit(name);
      else if (/\.(ts|json)$/.test(name)) files.push(name);
    }
  };
  for (const directory of [
    "packages/renderer-core/src",
    "packages/scene-contract/src",
    "tools/export-worker/src",
  ])
    await visit(directory);
  files.push("toolchain.json", "pnpm-lock.yaml");
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    hash.update(file);
    hash.update(await readFile(join(root, file)));
  }
  const command = promisify(execFile);
  hash.update((await command("ffmpeg", ["-version"])).stdout.split("\n")[0]!);
  hash.update(
    (await command(chromium.executablePath(), ["--version"])).stdout.trim(),
  );
  hash.update(process.version);
  hash.update(process.platform);
  hash.update(process.arch);
  return hash.digest("hex");
}
type CacheEntry = {
  version: "passage-cache-1";
  key: string;
  sha256: string;
  complete: true;
};
export async function cachedPassageBeat(options: {
  cacheDirectory: string;
  key: string;
  output: string;
  signal?: AbortSignal | undefined;
  render(path: string): Promise<unknown>;
  verify(path: string): Promise<unknown>;
}) {
  options.signal?.throwIfAborted();
  await mkdir(options.cacheDirectory, { recursive: true });
  const directory = join(options.cacheDirectory, options.key);
  let reused = false,
    entry: CacheEntry | undefined;
  try {
    const candidate = JSON.parse(
      await readFile(join(directory, "entry.json"), "utf8"),
    ) as CacheEntry;
    if (
      candidate.version !== "passage-cache-1" ||
      !candidate.complete ||
      candidate.key !== options.key ||
      candidate.sha256 !==
        passageHash(await readFile(join(directory, "beat.mp4")))
    )
      throw new Error("Cache identity mismatch");
    await options.verify(join(directory, "beat.mp4"));
    entry = candidate;
    reused = true;
  } catch (error) {
    options.signal?.throwIfAborted();
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["EACCES", "EPERM"].includes(String(error.code))
    )
      throw error;
  }
  if (!entry) {
    const lock = directory + ".lock";
    const release = await acquireBatchLock(lock, directory);
    const attempt = directory + ".attempt-" + randomUUID();
    try {
      await mkdir(attempt);
      await options.render(join(attempt, "beat.mp4"));
      options.signal?.throwIfAborted();
      await options.verify(join(attempt, "beat.mp4"));
      entry = {
        version: "passage-cache-1",
        key: options.key,
        sha256: passageHash(await readFile(join(attempt, "beat.mp4"))),
        complete: true,
      };
      await writeFile(join(attempt, "entry.json"), stableJson(entry) + "\n", {
        flag: "wx",
      });
      try {
        await rename(directory, directory + ".invalid-" + randomUUID());
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await rename(attempt, directory);
    } finally {
      await rm(attempt, { recursive: true, force: true });
      await release();
    }
  }
  options.signal?.throwIfAborted();
  await mkdir(dirname(options.output), { recursive: true });
  const temporary = options.output + ".copy-" + randomUUID();
  try {
    await copyFile(
      join(directory, "beat.mp4"),
      temporary,
      constants.COPYFILE_EXCL,
    );
    await link(temporary, options.output);
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code !== "EEXIST" ||
      passageHash(await readFile(options.output)) !== entry.sha256
    )
      throw error;
  } finally {
    await rm(temporary, { force: true });
  }
  return {
    outputPath: options.output,
    reused,
    key: options.key,
    sha256: entry.sha256,
  };
}
