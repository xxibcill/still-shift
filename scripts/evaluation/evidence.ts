import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual, promisify } from "node:util";

import {
  SceneManifestSchema,
  type AnimationResult,
  type CorpusManifest,
} from "@still-shift/scene-contract";
import { compareFrameSamples } from "../../packages/renderer-core/src/parity.ts";

import { fileSha256 } from "./assembly-evidence.ts";
import { EVALUATION_PRESETS, evaluationClipId } from "./presets.ts";

const sampleWidth = 64;
const sampleHeight = 36;
const execFileAsync = promisify(execFile);

const probeVideo = async (path: string) => {
  const probe = JSON.parse(
    (
      await execFileAsync("ffprobe", [
        "-v",
        "error",
        "-count_frames",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=nb_read_frames,r_frame_rate",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        path,
      ])
    ).stdout,
  ) as {
    streams: Array<{ nb_read_frames?: string; r_frame_rate?: string }>;
    format: { duration?: string };
  };
  return {
    frameCount: Number(probe.streams[0]?.nb_read_frames),
    frameRate: probe.streams[0]?.r_frame_rate,
    durationMs: Number(probe.format.duration) * 1000,
  };
};

const frameSample = async (path: string, frameIndex: number) => {
  const process = spawn(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path,
      "-vf",
      `select=eq(n\\,${frameIndex}),scale=${sampleWidth}:${sampleHeight}:flags=bicubic`,
      "-fps_mode",
      "vfr",
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const output: Buffer[] = [];
  const errors: Buffer[] = [];
  process.stdout.on("data", (chunk: Buffer) => output.push(chunk));
  process.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
  await new Promise<void>((resolve, reject) => {
    process.on("error", reject);
    process.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(Buffer.concat(errors).toString())),
    );
  });
  const pixels = Buffer.concat(output);
  if (pixels.length !== sampleWidth * sampleHeight * 3)
    throw new Error(`Unable to decode frame ${frameIndex} from ${path}`);
  return pixels;
};

export type EvaluationRecord = {
  id: string;
  status: string;
  result?:
    | Pick<
        AnimationResult,
        "checksums" | "selectedPreset" | "durationMs" | "status"
      >
    | undefined;
};

export const validateEvaluationRecords = (
  corpus: CorpusManifest,
  records: EvaluationRecord[],
): void => {
  const expected = new Map(
    corpus.entries.flatMap((entry) =>
      EVALUATION_PRESETS.map(
        (preset) =>
          [
            evaluationClipId(entry.id, preset),
            {
              sourceHash: entry.source.sha256,
              preset,
              durationMs: entry.expectedShotDurationMs,
            },
          ] as const,
      ),
    ),
  );
  if (records.length !== expected.size)
    throw new Error("Result count does not match the evaluation corpus");

  const seen = new Set<string>();
  for (const record of records) {
    const item = expected.get(record.id);
    if (!item || seen.has(record.id))
      throw new Error(`Unexpected or duplicate evaluation ID: ${record.id}`);
    seen.add(record.id);
    if (!record.result) {
      if (record.status !== "failed")
        throw new Error(`Successful record has no result: ${record.id}`);
      continue;
    }
    if (
      record.status !== record.result.status ||
      record.result.checksums.source !== item.sourceHash ||
      record.result.selectedPreset !== item.preset ||
      record.result.durationMs !== item.durationMs
    )
      throw new Error(`Result does not match the corpus item: ${record.id}`);
  }
};

export const validateEvaluationScene = (
  scene: { sourceHash: string; motion: { preset: string; intensity: string } },
  sourceHash: string,
  preset: string,
): void => {
  if (
    scene.sourceHash !== sourceHash ||
    scene.motion.preset !== preset ||
    scene.motion.intensity !== "standard"
  )
    throw new Error(
      "Evaluation scene does not match the standard-intensity request",
    );
};

export const verifyAssemblyClip = async (
  result: Pick<AnimationResult, "checksums" | "outputPath" | "selectedPreset">,
  sourceHash: string,
  preset: AnimationResult["selectedPreset"],
): Promise<string> => {
  if (
    result.checksums.source !== sourceHash ||
    result.selectedPreset !== preset
  )
    throw new Error(
      `Assembly clip does not match its timeline source: ${preset}`,
    );

  const hash = createHash("sha256");
  for await (const chunk of createReadStream(result.outputPath))
    hash.update(chunk);
  if (`sha256:${hash.digest("hex")}` !== result.checksums.output)
    throw new Error(`Assembly clip checksum mismatch: ${result.outputPath}`);
  return result.outputPath;
};

type RenderComparisonRecord = {
  id: string;
  reused: boolean;
  result?:
    | Pick<
        AnimationResult,
        | "checksums"
        | "durationMs"
        | "frameCount"
        | "outputPath"
        | "sceneManifestPath"
        | "selectedPreset"
        | "status"
      >
    | undefined;
};

export const compareIndependentRenders = async (
  primary: RenderComparisonRecord[],
  repeat: RenderComparisonRecord[],
): Promise<boolean> => {
  if (primary.length !== repeat.length) return false;
  const repeatById = new Map(repeat.map((record) => [record.id, record]));
  if (repeatById.size !== repeat.length) return false;

  for (const record of primary) {
    const first = record.result;
    const other = repeatById.get(record.id);
    const second = other?.result;
    if (!first || !second || other?.reused) return false;
    if (
      first.outputPath === second.outputPath ||
      first.checksums.source !== second.checksums.source ||
      first.status !== second.status ||
      first.durationMs !== second.durationMs ||
      first.frameCount !== second.frameCount ||
      first.selectedPreset !== second.selectedPreset
    )
      return false;

    const firstScene = SceneManifestSchema.parse(
      JSON.parse(await readFile(first.sceneManifestPath, "utf8")),
    );
    const secondScene = SceneManifestSchema.parse(
      JSON.parse(await readFile(second.sceneManifestPath, "utf8")),
    );
    if (
      !firstScene.renderScene ||
      !secondScene.renderScene ||
      firstScene.sourceHash !== first.checksums.source ||
      secondScene.sourceHash !== second.checksums.source ||
      !isDeepStrictEqual(firstScene.renderScene, secondScene.renderScene) ||
      !isDeepStrictEqual(firstScene.timeline, secondScene.timeline) ||
      !isDeepStrictEqual(firstScene.motion, secondScene.motion) ||
      !isDeepStrictEqual(firstScene.quality, secondScene.quality)
    )
      return false;

    try {
      const [firstHash, secondHash] = await Promise.all([
        fileSha256(first.outputPath),
        fileSha256(second.outputPath),
      ]);
      if (
        firstHash !== first.checksums.output ||
        secondHash !== second.checksums.output
      )
        return false;
      const [firstVideo, secondVideo] = await Promise.all([
        probeVideo(first.outputPath),
        probeVideo(second.outputPath),
      ]);
      if (
        [firstVideo, secondVideo].some(
          (video) =>
            video.frameCount !== first.frameCount ||
            video.frameRate !== `${firstScene.timeline.fps}/1` ||
            Math.abs(video.durationMs - first.durationMs) >
              1000 / firstScene.timeline.fps,
        )
      )
        return false;
      if (firstHash === secondHash) continue;

      for (const frameIndex of [
        0,
        Math.floor(first.frameCount / 2),
        first.frameCount - 1,
      ]) {
        const [firstFrame, secondFrame] = await Promise.all([
          frameSample(first.outputPath, frameIndex),
          frameSample(second.outputPath, frameIndex),
        ]);
        if (
          compareFrameSamples(
            firstFrame,
            secondFrame,
            sampleWidth,
            sampleHeight,
          ).warning
        )
          return false;
      }
    } catch {
      return false;
    }
  }
  return true;
};
