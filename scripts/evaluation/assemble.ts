import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

import {
  AnimationResultSchema,
  CorpusManifestSchema,
} from "@still-shift/scene-contract";
import { verifyAssemblyClip } from "./evidence.ts";
import { EVALUATION_PRESETS, evaluationClipId } from "./presets.ts";

const execFileAsync = promisify(execFile);
const option = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const required = (name: string): string => {
  const value = option(name);
  if (!value || value.startsWith("--")) throw new Error(`Missing ${name}`);
  return resolve(value);
};
const quoteConcatPath = (path: string): string =>
  `'${path.replaceAll("'", "'\\''")}'`;

const timelinePath = required("--timeline");
const corpusPath = required("--corpus");
const resultsPath = required("--results");
const narrationPath = required("--narration");
const outputPath = required("--output");
const limitStates = option("--limit-states")
  ? Number(option("--limit-states"))
  : null;
if (limitStates !== null && (!Number.isInteger(limitStates) || limitStates < 1))
  throw new Error("--limit-states must be a positive integer");
const timeline = JSON.parse(await readFile(timelinePath, "utf8")) as {
  width: number;
  height: number;
  fps: number;
  total_frames: number;
  states: Array<{
    state_id: string;
    source_sha256: string;
    frame_count: number;
    start_frame: number;
    end_frame: number;
  }>;
};
if (timeline.fps !== 24 || timeline.width !== 1280 || timeline.height !== 720)
  throw new Error("Expected a 1280×720, 24 FPS proof timeline");
const states = limitStates
  ? timeline.states.slice(0, limitStates)
  : timeline.states;
if (states.length === 0) throw new Error("Timeline has no states");
let expectedFrame = 0;
for (const state of states) {
  if (
    state.start_frame !== expectedFrame ||
    state.end_frame - state.start_frame !== state.frame_count
  )
    throw new Error(`Timeline frame gap or invalid state: ${state.state_id}`);
  expectedFrame = state.end_frame;
}
if (!limitStates && expectedFrame !== timeline.total_frames)
  throw new Error("Timeline total_frames does not match its states");
const corpus = CorpusManifestSchema.parse(
  JSON.parse(await readFile(corpusPath, "utf8")),
);
const entryByHash = new Map(
  corpus.entries.map((entry) => [entry.source.sha256, entry]),
);
const records = (await readFile(resultsPath, "utf8"))
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line) as { id: string; result?: unknown });
const clipById = new Map(
  records
    .filter((record) => record.result)
    .map((record) => [record.id, AnimationResultSchema.parse(record.result)]),
);
if (clipById.size !== records.filter((record) => record.result).length)
  throw new Error("Duplicate result IDs in assembly input");
const segmentsDir = `${outputPath}.segments`;
await mkdir(segmentsDir, { recursive: true });
const segmentPaths: string[] = [];
const clipSelections: Array<{ stateId: string; clipIds: string[] }> = [];
for (const [index, state] of states.entries()) {
  const entry = entryByHash.get(state.source_sha256);
  if (!entry)
    throw new Error(`Timeline source not present in corpus: ${state.state_id}`);
  const clipIds = EVALUATION_PRESETS.map((preset) =>
    evaluationClipId(entry.id, preset),
  );
  const clips = await Promise.all(
    clipIds.map((id, presetIndex) => {
      const result = clipById.get(id);
      if (!result) throw new Error(`Missing rendered preset: ${id}`);
      return verifyAssemblyClip(
        result,
        state.source_sha256,
        EVALUATION_PRESETS[presetIndex]!,
      );
    }),
  );
  const segmentPath = join(
    segmentsDir,
    `${String(index + 1).padStart(3, "0")}-${state.state_id}.mp4`,
  );
  const playlistPath = `${segmentPath}.ffconcat`;
  await writeFile(
    playlistPath,
    `ffconcat version 1.0\n${clips.map((clip) => `file ${quoteConcatPath(clip)}`).join("\n")}\n`,
  );
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-stream_loop",
    "-1",
    "-safe",
    "0",
    "-f",
    "concat",
    "-i",
    playlistPath,
    "-vf",
    "fps=24,scale=1280:720:flags=lanczos,format=yuv420p",
    "-frames:v",
    String(state.frame_count),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-r",
    "24",
    "-movflags",
    "+faststart",
    "-y",
    segmentPath,
  ]);
  segmentPaths.push(segmentPath);
  clipSelections.push({ stateId: state.state_id, clipIds });
}
const concatPath = join(segmentsDir, "assembly.ffconcat");
await writeFile(
  concatPath,
  `ffconcat version 1.0\n${segmentPaths.map((path) => `file ${quoteConcatPath(path)}`).join("\n")}\n`,
);
const videoOnlyPath = join(segmentsDir, "video-only.mp4");
await execFileAsync("ffmpeg", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-safe",
  "0",
  "-f",
  "concat",
  "-i",
  concatPath,
  "-c",
  "copy",
  "-y",
  videoOnlyPath,
]);
const temporaryOutput = join(
  dirname(outputPath),
  `.${randomUUID()}-${outputPath.split("/").at(-1)}`,
);
try {
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    videoOnlyPath,
    "-i",
    narrationPath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-t",
    String(expectedFrame / 24),
    "-movflags",
    "+faststart",
    "-y",
    temporaryOutput,
  ]);
  const probe = JSON.parse(
    (
      await execFileAsync("ffprobe", [
        "-v",
        "error",
        "-count_frames",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=nb_read_frames,width,height,r_frame_rate",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        temporaryOutput,
      ])
    ).stdout,
  ) as {
    streams: Array<{
      nb_read_frames: string;
      width: number;
      height: number;
      r_frame_rate: string;
    }>;
    format: { duration: string };
  };
  const videoFrameCount = Number(probe.streams[0]?.nb_read_frames);
  if (
    videoFrameCount !== expectedFrame ||
    probe.streams[0]?.width !== 1280 ||
    probe.streams[0]?.height !== 720 ||
    probe.streams[0]?.r_frame_rate !== "24/1"
  )
    throw new Error(
      `Assembled video failed frame validation: ${videoFrameCount}/${expectedFrame}`,
    );
  await rename(temporaryOutput, outputPath);
  const metadata = {
    outputPath,
    timelinePath,
    narrationPath,
    corpusId: corpus.corpusId,
    corpusStatus: corpus.status,
    sourceStateCount: states.length,
    videoFrameCount,
    durationSeconds: Number(probe.format.duration),
    clipSelections,
  };
  await writeFile(
    `${outputPath}.assembly.json`,
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(metadata)}\n`);
} finally {
  await rm(temporaryOutput, { force: true });
}
