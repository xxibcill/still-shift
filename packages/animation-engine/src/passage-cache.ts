import { acquireArtifactLock } from "@still-shift/execution-runtime/locks";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import {
  assertPinnedRenderEnvironment,
  launchRenderBrowser,
  probeRenderEnvironment,
  type RenderEnvironment,
} from "@still-shift/execution-runtime/render-browser";
import { setTimeout as delay } from "node:timers/promises";
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
import type { Composition } from "@still-shift/scene-contract";
import { validateComposition } from "@still-shift/scene-contract";
import type { StoryScene } from "../../scene-contract/src/story.ts";
import { AnimationEngineError } from "../../scene-contract/src/errors.ts";
import {
  STORY_ADAPTER_VERSION,
  COMPOSITION_EVALUATOR_VERSION,
  compositionRendererVersion,
  type CompositionBackend,
} from "@still-shift/renderer-core";
import { compileStoryScene } from "../../renderer-core/src/story-scene.ts";

const CACHE_LOCK_WAIT_MS = 30 * 60_000;
const CACHE_LOCK_RETRY_MS = 500;

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
export function passageBeatKey(
  scene: StoryScene,
  runtime: string,
  renderer: "legacy" | "composition" = "legacy",
  backend: CompositionBackend = "canvas2d",
) {
  const normalized = structuredClone(scene);
  delete normalized.episodeStartFrame;
  if (normalized.format === "landscape") delete normalized.format;
  for (const asset of [...normalized.assets, ...(normalized.fonts ?? [])])
    asset.path = asset.sha256;
  return passageHash(
    stableJson({
      version: "passage-cache-1",
      scene: normalized,
      renderer:
        renderer === "composition"
          ? {
              adapter: STORY_ADAPTER_VERSION,
              evaluator: COMPOSITION_EVALUATOR_VERSION,
              backend: compositionRendererVersion(backend),
            }
          : compileStoryScene(scene).rendererVersion,
      runtime,
      encoder: "libx264:veryfast:crf18:yuv420p:png_pipe",
    }),
  );
}

/** Native picture identity is portable across asset relocation and separate from family clips. */
export function passageCompositionKey(
  composition: Composition,
  runtime: string,
  backend: CompositionBackend = "canvas2d",
) {
  const result = validateComposition(composition);
  if (!result.ok) throw new Error("Invalid native passage composition");
  const normalized = structuredClone(result.composition);
  for (const asset of normalized.assets) asset.path = asset.sha256;
  return passageHash(
    stableJson({
      version: "composition-passage-cache-1",
      composition: normalized,
      renderer: compositionRendererVersion(backend),
      evaluator: COMPOSITION_EVALUATOR_VERSION,
      runtime,
      encoder: "libx264:veryfast:crf18:yuv420p:png_pipe",
    }),
  );
}

async function measurePassageRenderEnvironment(signal?: AbortSignal) {
  signal?.throwIfAborted();
  const browser = await launchRenderBrowser();
  const cancel = () => void browser.close().catch(() => undefined);
  try {
    signal?.throwIfAborted();
    signal?.addEventListener("abort", cancel, { once: true });
    const environment = await probeRenderEnvironment(await browser.newPage());
    signal?.throwIfAborted();
    assertPinnedRenderEnvironment(environment);
    return environment;
  } catch (error) {
    signal?.throwIfAborted();
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
    await browser.close();
  }
}

export type PassageRenderRuntime = {
  identity: string;
  renderEnvironment: RenderEnvironment;
};

export async function passageRenderRuntime(
  signal?: AbortSignal,
): Promise<PassageRenderRuntime> {
  signal?.throwIfAborted();
  const root = resolve(import.meta.dirname, "../../..");
  const files: string[] = [];
  const visit = async (directory: string) => {
    signal?.throwIfAborted();
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
    "packages/execution-runtime/src",
  ])
    await visit(directory);
  files.push(
    "packages/animation-engine/src/prepared-animation-engine.ts",
    "packages/animation-engine/src/composition-compile.ts",
    "packages/animation-engine/src/composition-render.ts",
    "packages/animation-engine/src/composition-source.ts",
    "toolchain.json",
    "pnpm-lock.yaml",
  );
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    signal?.throwIfAborted();
    hash.update(file);
    hash.update(await readFile(join(root, file)));
  }
  hash.update(
    (await runProcess("ffmpeg", ["-version"], { signal })).stdout.split(
      "\n",
    )[0]!,
  );
  const renderEnvironment = await measurePassageRenderEnvironment(signal);
  hash.update(stableJson({ renderEnvironment }));
  hash.update(process.version);
  hash.update(process.platform);
  hash.update(process.arch);
  return { identity: hash.digest("hex"), renderEnvironment };
}

export async function passageRuntimeIdentity(signal?: AbortSignal) {
  return (await passageRenderRuntime(signal)).identity;
}

/** Assembly changes invalidate a render job without discarding valid beat clips. */
export async function passageJobRuntimeIdentity(
  beatRuntime: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const sources = await Promise.all(
    ["story-passage-render.ts", "passage-audio.ts"].map((file) =>
      readFile(resolve(import.meta.dirname, file)),
    ),
  );
  signal?.throwIfAborted();
  return passageHash(beatRuntime + ":" + sources.map(passageHash).join(":"));
}
type CacheEntry = {
  version: "passage-cache-1";
  key: string;
  sha256: string;
  complete: true;
};

async function acquireCacheLock(directory: string, signal?: AbortSignal) {
  const deadline = performance.now() + CACHE_LOCK_WAIT_MS;
  for (;;) {
    signal?.throwIfAborted();
    try {
      return await acquireArtifactLock(directory + ".lock", directory);
    } catch (error) {
      if (
        !(error instanceof AnimationEngineError) ||
        error.code !== "RENDER_FAILED" ||
        error.message !== "Batch output directory is already in use"
      )
        throw error;
      const remaining = deadline - performance.now();
      if (remaining <= 0)
        throw new AnimationEngineError(
          "RENDER_FAILED",
          "Timed out waiting for passage cache entry",
          { cacheDirectory: directory },
          { cause: error },
        );
      await delay(
        Math.min(CACHE_LOCK_RETRY_MS, remaining),
        undefined,
        signal ? { signal } : undefined,
      );
    }
  }
}

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
  const loadVerifiedEntry = async (): Promise<CacheEntry | undefined> => {
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
      return candidate;
    } catch (error) {
      options.signal?.throwIfAborted();
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        ["EACCES", "EPERM"].includes(String(error.code))
      )
        throw error;
      return undefined;
    }
  };
  let entry = await loadVerifiedEntry();
  let reused = Boolean(entry);
  if (!entry) {
    const release = await acquireCacheLock(directory, options.signal);
    try {
      entry = await loadVerifiedEntry();
      if (entry) reused = true;
      else {
        const attempt = directory + ".attempt-" + randomUUID();
        try {
          await mkdir(attempt);
          await options.render(join(attempt, "beat.mp4"));
          options.signal?.throwIfAborted();
          await options.verify(join(attempt, "beat.mp4"));
          options.signal?.throwIfAborted();
          entry = {
            version: "passage-cache-1",
            key: options.key,
            sha256: passageHash(await readFile(join(attempt, "beat.mp4"))),
            complete: true,
          };
          await writeFile(
            join(attempt, "entry.json"),
            stableJson(entry) + "\n",
            {
              flag: "wx",
            },
          );
          options.signal?.throwIfAborted();
          try {
            await rename(directory, directory + ".invalid-" + randomUUID());
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
          await rename(attempt, directory);
        } finally {
          await rm(attempt, { recursive: true, force: true });
        }
      }
    } finally {
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
