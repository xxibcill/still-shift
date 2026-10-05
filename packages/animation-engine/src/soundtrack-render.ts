import { soundtrackState } from "@still-shift/renderer-core/soundtrack";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { acquireArtifactLock } from "@still-shift/execution-runtime/locks";
import {
  soundtrackFail,
  SoundtrackError,
  validateSoundtrackProject,
} from "@still-shift/scene-contract";
import {
  readSoundtrackProject,
  serializeSoundtrackProject,
  verifySoundtrackSources,
  soundtrackChecksum,
} from "./soundtrack-project-io.ts";
const worker = fileURLToPath(
  new URL("./soundtrack-worker.py", import.meta.url),
);
const repository = fileURLToPath(new URL("../../../", import.meta.url));
export const soundtrackPython = () =>
  process.env.STILL_SHIFT_SOUNDTRACK_PYTHON ??
  join(repository, "benchmarks/results/composition-ce16/runtime/bin/python");
const manifestSchema = z
  .object({
    protocol: z.literal("soundtrack-worker-1"),
    ok: z.literal(true),
    revision: z.number().int(),
    sampleRate: z.literal(48000),
    channels: z.literal(2),
    range: z.object({ start: z.number().int(), end: z.number().int() }),
    files: z.record(
      z.string(),
      z.object({
        file: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*\.wav$/),
        sha256: z.string(),
        samplesPerChannel: z.number().int(),
        peaks: z.array(z.number()),
        peakDbfs: z.number().nullable(),
        samplesAboveFullScale: z.number().int().nonnegative(),
      }),
    ),
  })
  .passthrough();
export type SoundtrackRenderManifest = z.infer<typeof manifestSchema> & {
  identity: string;
  output: string;
};
export type SoundtrackRenderOptions = {
  stems?: boolean;
  range?: { start: number; end: number };
  signal?: AbortSignal | undefined;
  timeoutMs?: number;
  expectedRevision?: number;
};
async function invokeWorker(
  request: string,
  signal: AbortSignal | undefined,
  timeoutMs: number,
) {
  signal?.throwIfAborted();
  return new Promise<string>((accept, reject) => {
    const child = spawn(soundtrackPython(), [worker, request], {
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "",
      failure: unknown;
    const stop = (reason: unknown) => {
      if (failure) return;
      failure = reason;
      try {
        if (process.platform === "win32") child.kill("SIGKILL");
        else process.kill(-child.pid!, "SIGKILL");
      } catch {
        /* Already exited. */
      }
    };
    const abort = () => stop(signal!.reason ?? new Error("Render cancelled"));
    const timer = setTimeout(
      () =>
        stop(
          new SoundtrackError(
            "worker-timeout",
            "Worker exceeded its time budget; retry a shorter project",
          ),
        ),
      timeoutMs,
    );
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (stdout.length > 2_000_000)
        stop(
          new SoundtrackError(
            "worker-output",
            "Worker output exceeded its limit",
          ),
        );
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + String(chunk)).slice(-32000);
    });
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    };
    child.once("error", (error) => {
      cleanup();
      reject(
        new SoundtrackError(
          "runtime-missing",
          "Cannot start soundtrack Python; run pnpm soundtrack:setup or set STILL_SHIFT_SOUNDTRACK_PYTHON",
          { cause: error.message },
        ),
      );
    });
    child.once("close", (code) => {
      cleanup();
      if (failure) return reject(failure);
      if (code === 0) return accept(stdout);
      let diagnostic: {
        code?: string;
        message?: string;
        context?: Record<string, unknown>;
      } = {};
      try {
        diagnostic = JSON.parse(stdout).error ?? {};
      } catch {
        /* Preserve raw worker logs. */
      }
      reject(
        new SoundtrackError(
          diagnostic.code ?? "worker-failed",
          diagnostic.message ?? "Worker failed; inspect stderr and retry",
          { ...diagnostic.context, exitCode: code, stderr },
        ),
      );
    });
    if (signal?.aborted) abort();
  });
}
export async function renderSoundtrackProject(
  projectPath: string,
  output: string,
  options: SoundtrackRenderOptions = {},
): Promise<SoundtrackRenderManifest> {
  const saved = await readSoundtrackProject(projectPath);
  if (
    options.expectedRevision !== undefined &&
    options.expectedRevision !== saved.revision
  )
    soundtrackFail("revision-conflict", "Reload before rendering", {
      actual: saved.revision,
    });
  const project = validateSoundtrackProject(saved),
    sources = await verifySoundtrackSources(saved, projectPath);
  for (const state of [
    project,
    ...project.history.undo,
    ...project.history.redo,
  ])
    for (const asset of state.assets)
      asset.path = resolve(dirname(projectPath), asset.path);
  const range = options.range ?? { start: 0, end: project.durationSamples };
  if (
    !Number.isInteger(range.start) ||
    !Number.isInteger(range.end) ||
    range.start < 0 ||
    range.end > project.durationSamples ||
    range.start >= range.end
  )
    soundtrackFail(
      "render-range",
      "Use a nonempty end-exclusive sample range inside the project",
    );
  const timeoutMs = options.timeoutMs ?? 120000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000)
    soundtrackFail("worker-timeout", "Time budget must be 1–600000 ms");
  options.signal?.throwIfAborted();
  const target = resolve(output),
    stage = target + "." + randomUUID() + ".tmp";
  await mkdir(dirname(target), { recursive: true });
  const release = await acquireArtifactLock(target + ".lock", dirname(target));
  try {
    if (
      await lstat(target).then(
        () => true,
        () => false,
      )
    )
      soundtrackFail(
        "output-exists",
        "Use a fresh output directory; successful renders are never overwritten",
      );
    const abandonedPrefix = basename(target) + ".";
    for (const name of await readdir(dirname(target))) {
      const suffix = name.startsWith(abandonedPrefix)
        ? name.slice(abandonedPrefix.length)
        : "";
      if (/^[0-9a-f-]{36}\.tmp$/.test(suffix))
        await rm(join(dirname(target), name), { recursive: true, force: true });
    }
    await mkdir(stage);
    const request = {
      protocol: "soundtrack-worker-1",
      project,
      output: join(stage, "audio"),
      range,
      stems: options.stems ?? false,
    };
    await writeFile(join(stage, "request.json"), JSON.stringify(request));
    await writeFile(
      join(stage, "project.json"),
      serializeSoundtrackProject(saved),
    );
    const [ffmpeg, ffprobe] = await Promise.all([
      runProcess("ffmpeg", ["-version"], { signal: options.signal }),
      runProcess("ffprobe", ["-version"], { signal: options.signal }),
    ]);
    const result = manifestSchema.parse(
      JSON.parse(
        await invokeWorker(
          join(stage, "request.json"),
          options.signal,
          timeoutMs,
        ),
      ),
    );
    if (
      result.revision !== saved.revision ||
      result.range.start !== range.start ||
      result.range.end !== range.end ||
      !result.files.master
    )
      soundtrackFail(
        "worker-protocol",
        "Worker result does not match the requested snapshot",
      );
    for (const file of Object.values(result.files)) {
      if (
        file.samplesPerChannel !== range.end - range.start ||
        (await soundtrackChecksum(join(stage, "audio", file.file))) !==
          file.sha256
      )
        soundtrackFail(
          "worker-output",
          "Rendered output identity or length changed",
        );
    }
    await verifySoundtrackSources(saved, projectPath);
    const identityProject = {
      schemaVersion: project.schemaVersion,
      ...soundtrackState(project),
    };
    const identityInputs = {
      project: identityProject,
      sources: Object.fromEntries(
        [...sources.keys()].map((id) => [
          id,
          saved.assets.find((a) => a.id === id)!.sha256,
        ]),
      ),
      workerSha256: await soundtrackChecksum(worker),
      architecture: process.arch,
      platform: process.platform,
      backend: "dawdreamer-0.9.0",
      dsp: "soundtrack-dsp-3",
      runtime: result.runtime,
      ffmpeg: ffmpeg.stdout.split("\n")[0],
      ffprobe: ffprobe.stdout.split("\n")[0],
      range,
      stems: options.stems ?? false,
    };
    const identity = createHash("sha256")
      .update(JSON.stringify(identityInputs))
      .digest("hex");
    const manifest = { ...result, identity, identityInputs, output: target };
    await rm(join(stage, "request.json"));
    await writeFile(
      join(stage, "render.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
    options.signal?.throwIfAborted();
    await rename(stage, target);
    return manifest;
  } finally {
    await rm(stage, { recursive: true, force: true });
    await release();
  }
}
export async function readSoundtrackRender(path: string) {
  return manifestSchema.parse(
    JSON.parse(await readFile(join(path, "render.json"), "utf8")),
  );
}
