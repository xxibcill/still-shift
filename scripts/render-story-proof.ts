import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs, promisify } from "node:util";
import { StorySceneSchema } from "../packages/scene-contract/src/story.ts";
import { PreparedAnimationEngine } from "../packages/animation-engine/src/prepared-animation-engine.ts";
import { comparisonAccessProof } from "./story-motion/proof.ts";

const { values } = parseArgs({
  options: {
    "output-dir": { type: "string" },
    narration: { type: "string" },
    "narration-sha256": { type: "string" },
  },
  strict: true,
});
if (!values["output-dir"] || !values.narration || !values["narration-sha256"])
  throw new Error(
    "Pass --output-dir <new directory> --narration <current episode WAV> --narration-sha256 <expected hash>",
  );
const output = resolve(values["output-dir"]);
const narration = resolve(values.narration);
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
assert.equal(
  hash(await readFile(narration)),
  values["narration-sha256"],
  "Narration bytes must match the episode authority",
);
await mkdir(output, { recursive: true });
const load = async (id: string) => {
  const scene = StorySceneSchema.parse(
    JSON.parse(
      await readFile(`benchmarks/fixtures/story-motion/${id}.json`, "utf8"),
    ),
  );
  for (const asset of [...scene.assets, ...(scene.fonts ?? [])])
    asset.path = resolve("benchmarks/fixtures/story-motion", asset.path);
  return scene;
};
const scenes = comparisonAccessProof(
  await load("unequal-margins"),
  await load("access-constraint"),
);
const clips = [];
for (const [index, scene] of scenes.entries()) {
  const id = index === 0 ? "st013" : "st014";
  const scenePath = join(output, `${id}.json`);
  await writeFile(scenePath, JSON.stringify(scene, null, 2) + "\n", {
    flag: "wx",
  });
  clips.push(
    await new PreparedAnimationEngine().animate({
      scenePath,
      outputPath: join(output, `${id}.mp4`),
    }),
  );
}
const run = promisify(execFile);
const video = join(output, "s01e01-comparison-access.mp4");
await run("ffmpeg", [
  "-v",
  "error",
  "-n",
  "-i",
  clips[0]!.outputPath,
  "-i",
  clips[1]!.outputPath,
  "-i",
  narration,
  "-filter_complex",
  `[0:v][1:v]concat=n=2:v=1:a=0[v];[2:a]atrim=start=${4748 / 24}:end=${5394 / 24},asetpts=PTS-STARTPTS[a]`,
  "-map",
  "[v]",
  "-map",
  "[a]",
  "-frames:v",
  "646",
  "-t",
  String(646 / 24),
  "-c:v",
  "libx264",
  "-preset",
  "fast",
  "-crf",
  "18",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-movflags",
  "+faststart",
  video,
]);
const { stdout } = await run("ffprobe", [
  "-v",
  "error",
  "-count_frames",
  "-show_streams",
  "-of",
  "json",
  video,
]);
const streams = JSON.parse(stdout).streams as {
  codec_type: string;
  nb_read_frames?: string;
  duration?: string;
}[];
assert.equal(
  streams.find((stream) => stream.codec_type === "video")?.nb_read_frames,
  "646",
);
assert.ok(streams.some((stream) => stream.codec_type === "audio"));
await run("ffmpeg", ["-v", "error", "-i", video, "-f", "null", "-"]);
await run("ffmpeg", [
  "-v",
  "error",
  "-i",
  video,
  "-vf",
  "select='eq(n,0)+eq(n,114)+eq(n,242)+eq(n,333)+eq(n,334)+eq(n,374)+eq(n,386)+eq(n,479)+eq(n,645)',scale=640:360,tile=3x3",
  "-frames:v",
  "1",
  join(output, "proof-motion.jpg"),
]);
await writeFile(
  join(output, "handoff.json"),
  JSON.stringify(
    {
      status:
        "local narrated graphic candidate; not installed into the protected episode timeline",
      episode: "S01E01",
      startFrame: 4748,
      endFrameExclusive: 5394,
      frameCount: 646,
      fps: 24,
      narration: {
        path: narration,
        sha256: values["narration-sha256"],
        startSeconds: 4748 / 24,
        endSeconds: 5394 / 24,
      },
      boundary: {
        localFrame: 334,
        masterFrame: 5082,
        treatment:
          "cut with identical household scale, position and common ground",
      },
      events: scenes.map((scene) => ({
        title: scene.title,
        episodeStartFrame: scene.episodeStartFrame,
        frameCount: scene.frameCount,
        recipe: scene.recipe,
      })),
      video: { path: video, sha256: hash(await readFile(video)), streams },
      limitations:
        "Original symbolic kit candidate. Selected images and episode production records are unchanged. Internal cues follow the existing corrected caption timings; this is not a full-episode conformance or factual review.",
    },
    null,
    2,
  ) + "\n",
);
await writeFile(
  join(output, "index.html"),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>S01E01 · Comparison and access</title><style>body{margin:0;background:#e8dfc9;color:#211f1b;font:18px/1.6 Georgia,serif}main{max-width:1280px;margin:auto;padding:40px 24px}video{width:100%}a{color:#8b3f36}</style><main><h1>Same season. Unequal access.</h1><p>S01E01 · ST-013–014 · 646 frames · 26.917 seconds · existing narration</p><video controls playsinline preload="metadata" src="s01e01-comparison-access.mp4"></video><p>Local graphic candidate. The selected episode images and assembled timeline remain preserved.</p><p><a href="proof-motion.jpg">Motion and boundary frames</a> · <a href="handoff.json">Timing and source record</a></p></main></html>`,
);
console.log(`Narrated 646-frame proof: ${video}`);
