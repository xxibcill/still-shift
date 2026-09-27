import type { Handoff } from "../../scene-contract/src/story-authoring.ts";
import { sampleStoryTransition } from "../../renderer-core/src/story-transition.ts";
import { cachedPassageBeat, passageHash, stableJson } from "./passage-cache.ts";
import { runProcess } from "@still-shift/execution-runtime/subprocess";

export async function cachedStoryTransition(options: {
  outgoing: {
    outputPath: string;
    key: string;
    frameCount: number;
    joinStart?: number;
  };
  incoming: { outputPath: string; key: string };
  handoff: Handoff;
  fps: number;
  output: string;
  cacheDirectory: string;
  signal?: AbortSignal | undefined;
  verify: (path: string) => Promise<unknown>;
}) {
  const { handoff, fps, outgoing, incoming } = options,
    frames = handoff.frames!;
  const poses = Array.from({ length: frames }, (_, frame) =>
    sampleStoryTransition(handoff, frame, 1920, 1080, fps),
  );
  const expression = (values: number[], variable = "N") =>
    values
      .slice(0, -1)
      .reduceRight(
        (tail, value, i) => `if(eq(${variable},${i}),${value},${tail})`,
        String(values.at(-1)!),
      );
  const progress = expression(
    poses.map((p) => p.progress),
    "N-1",
  );
  const joinStart = outgoing.joinStart ?? outgoing.frameCount - frames;
  const source = `[0:v]trim=start_frame=${joinStart}:end_frame=${joinStart + frames},setpts=PTS-STARTPTS[a];[1:v]trim=end_frame=${frames},setpts=PTS-STARTPTS[b];`;
  const filter =
    handoff.mode === "push"
      ? source +
        `color=c=black:s=1920x1080:r=${fps}:d=${frames / fps}[base];[base][a]overlay=x='${expression(
          poses.map((p) => p.outgoingX),
          "n-1",
        )}':y='${expression(
          poses.map((p) => p.outgoingY),
          "n-1",
        )}':shortest=1[c];[c][b]overlay=x='${expression(
          poses.map((p) => p.incomingX),
          "n-1",
        )}':y='${expression(
          poses.map((p) => p.incomingY),
          "n-1",
        )}':shortest=1[v]`
      : source +
        `[a][b]blend=all_expr='A*(1-(${progress}))+B*(${progress})':shortest=1[v]`;
  return cachedPassageBeat({
    cacheDirectory: options.cacheDirectory,
    key: passageHash(
      stableJson({
        version: "story-join-1",
        outgoing: outgoing.key,
        joinStart,
        incoming: incoming.key,
        handoff,
        fps,
      }),
    ),
    output: options.output,
    signal: options.signal,
    verify: options.verify,
    render: (path) =>
      runProcess(
        "ffmpeg",
        [
          "-v",
          "error",
          "-n",
          "-i",
          outgoing.outputPath,
          "-i",
          incoming.outputPath,
          "-filter_complex",
          filter,
          "-map",
          "[v]",
          "-frames:v",
          String(frames),
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "18",
          "-pix_fmt",
          "yuv420p",
          path,
        ],
        { signal: options.signal },
      ),
  });
}
