import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { PreparedAnimationEngine } from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import {
  passageChecksum,
  writePassageJson,
  type PreparedPassage,
} from "./passage-files.ts";

const run = promisify(execFile);
type Stream = {
  codec_type: string;
  nb_read_frames?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  duration?: string;
};
const probe = async (path: string): Promise<{ streams: Stream[] }> => {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-count_frames",
    "-show_streams",
    "-of",
    "json",
    path,
  ]);
  return JSON.parse(stdout);
};

export async function verifyPassageNarration(
  passage: PreparedPassage,
  narration: string,
) {
  const checksum = passageChecksum(await readFile(narration));
  assert.equal(
    checksum,
    passage.plan.narration.sha256,
    "Narration bytes must match the beat plan authority",
  );
  const { streams } = await probe(narration);
  const audio = streams.find((stream) => stream.codec_type === "audio");
  assert.ok(audio, "Narration must contain audio");
  assert.ok(
    Number(audio.duration) >= passage.endFrameExclusive / passage.plan.fps,
    "Narration must cover the entire source interval",
  );
}

async function verifyVideo(
  path: string,
  frameCount: number,
  fps: number,
  audio: boolean,
) {
  const { streams } = await probe(path);
  const video = streams.find((stream) => stream.codec_type === "video");
  assert.equal(
    Number(video?.nb_read_frames),
    frameCount,
    "Decoded frame count must match the passage",
  );
  assert.equal(video?.r_frame_rate, fps + "/1");
  assert.equal(video.width, 1920);
  assert.equal(video.height, 1080);
  assert.equal(
    streams.some((stream) => stream.codec_type === "audio"),
    audio,
  );
  await run("ffmpeg", ["-v", "error", "-i", path, "-f", "null", "-"]);
  return { path, sha256: passageChecksum(await readFile(path)), streams };
}

export async function renderStoryPassage(
  output: string,
  passage: PreparedPassage,
  narration?: string,
) {
  const started = performance.now();
  const { plan, frameCount, endFrameExclusive } = passage;
  const clips = [];
  for (const beat of passage.beats) {
    clips.push(
      await new PreparedAnimationEngine().animate({
        scenePath: join(output, "scenes", beat.id + ".json"),
        outputPath: join(output, "scenes", beat.id + ".mp4"),
      }),
    );
  }
  const video = join(output, "passage.mp4");
  const concat =
    clips.map((_, index) => "[" + index + ":v]").join("") +
    "concat=n=" +
    clips.length +
    ":v=1:a=0[v]";
  const audio = narration
    ? ";[" +
      clips.length +
      ":a:0]atrim=start=" +
      plan.sourceStartFrame / plan.fps +
      ":end=" +
      endFrameExclusive / plan.fps +
      ",asetpts=PTS-STARTPTS[a]"
    : "";
  await run("ffmpeg", [
    "-v",
    "error",
    "-n",
    ...clips.flatMap((clip) => ["-i", clip.outputPath]),
    ...(narration ? ["-i", narration] : []),
    "-filter_complex",
    concat + audio,
    "-map",
    "[v]",
    ...(narration ? ["-map", "[a]", "-c:a", "aac", "-b:a", "192k"] : []),
    "-frames:v",
    String(frameCount),
    "-t",
    String(frameCount / plan.fps),
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    video,
  ]);
  const verified = await verifyVideo(
    video,
    frameCount,
    plan.fps,
    Boolean(narration),
  );
  const slices = [];
  for (const shot of plan.delivery) {
    const path = join(output, "delivery", shot.id + ".mp4");
    const filter =
      "[0:v]trim=start_frame=" +
      shot.start +
      ":end_frame=" +
      shot.end +
      ",setpts=PTS-STARTPTS[v]";
    const trimAudio = narration
      ? ";[0:a]atrim=start=" +
        shot.start / plan.fps +
        ":end=" +
        shot.end / plan.fps +
        ",asetpts=PTS-STARTPTS[a]"
      : "";
    await run("ffmpeg", [
      "-v",
      "error",
      "-n",
      "-i",
      video,
      "-filter_complex",
      filter + trimAudio,
      "-map",
      "[v]",
      ...(narration ? ["-map", "[a]", "-c:a", "aac"] : []),
      "-frames:v",
      String(shot.end - shot.start),
      "-t",
      String((shot.end - shot.start) / plan.fps),
      "-c:v",
      "libx264",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      path,
    ]);
    slices.push({
      ...shot,
      ...(await verifyVideo(
        path,
        shot.end - shot.start,
        plan.fps,
        Boolean(narration),
      )),
    });
  }
  const frames = passage.beats.flatMap((beat) => [
    beat.start,
    Math.floor((beat.start + beat.end) / 2),
    beat.end - 1,
  ]);
  await run("ffmpeg", [
    "-v",
    "error",
    "-n",
    "-i",
    video,
    "-vf",
    "select='" +
      frames.map((frame) => "eq(n," + frame + ")").join("+") +
      "',scale=480:270,tile=3x" +
      passage.beats.length,
    "-frames:v",
    "1",
    join(output, "passage-motion.jpg"),
  ]);
  await run("ffmpeg", [
    "-v",
    "error",
    "-n",
    "-i",
    video,
    "-vf",
    "select='eq(n," + frames[1] + ")'",
    "-frames:v",
    "1",
    join(output, "passage.png"),
  ]);
  const report = {
    status: "local passage candidate",
    planSha256: passage.inputs.plan.sha256,
    fps: plan.fps,
    frameCount,
    sourceStartFrame: plan.sourceStartFrame,
    endFrameExclusive,
    narration: narration
      ? { sha256: plan.narration.sha256, reference: plan.narration.reference }
      : null,
    video: verified,
    slices,
    metrics: {
      preparationMs: passage.preparationMs,
      renderingMs: performance.now() - started,
      humanPreparationMinutes: null,
      manualRepairs: null,
    },
    review:
      "Frame counts, dimensions, media decoding and narration identity verified. Comprehension, pacing and cost savings require separate review.",
  };
  await writePassageJson(join(output, "render-report.json"), report);
  return report;
}
