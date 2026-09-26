import {
  measureMotionEnergy,
  requireContinuousEnergy,
} from "./story-motion/motion-energy.ts";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs, promisify } from "node:util";
import {
  StorySceneSchema,
  type StoryScene,
} from "../packages/scene-contract/src/story.ts";
import { PreparedAnimationEngine } from "../packages/animation-engine/src/prepared-animation-engine.ts";
import { comparisonAccessProof } from "./story-motion/proof.ts";
import {
  resourcePassage,
  resourceShots,
} from "./story-motion/resource-passage.ts";
import { compileStoryScene } from "../packages/renderer-core/src/story-scene.ts";
import { analyzeStoryQuality } from "../packages/renderer-core/src/story-quality.ts";

const { values } = parseArgs({
  options: {
    "output-dir": { type: "string" },
    narration: { type: "string" },
    "narration-sha256": { type: "string" },
    passage: { type: "string", default: "comparison" },
    "require-continuous-motion": { type: "boolean", default: false },
  },
  strict: true,
});
if (!values["output-dir"] || !values.narration || !values["narration-sha256"])
  throw new Error(
    "Pass --output-dir <new directory> --narration <current episode WAV> --narration-sha256 <expected hash>",
  );
const output = resolve(values["output-dir"]);
const narration = resolve(values.narration);
assert.ok(["comparison", "resources"].includes(values.passage));
const resources = values.passage === "resources";
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
assert.equal(
  hash(await readFile(narration)),
  values["narration-sha256"],
  "Narration bytes must match the episode authority",
);
await mkdir(output);
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
const comparison = await load("unequal-margins");
const scenes: readonly StoryScene[] = resources
  ? resourcePassage(await load("relationship-build"), comparison)
  : comparisonAccessProof(comparison, await load("access-constraint"));
const startFrame = scenes[0]!.episodeStartFrame!;
const frameCount = scenes.reduce((total, scene) => total + scene.frameCount, 0);
const endFrameExclusive = startFrame + frameCount;
const title = resources
  ? "Grain, relationships and unequal buffers"
  : "Same season. Unequal access.";
const filename = resources
  ? "s01e01-resource-passage.mp4"
  : "s01e01-comparison-access.mp4";
let expectedStart = startFrame;
for (const scene of scenes) {
  assert.equal(
    scene.episodeStartFrame,
    expectedStart,
    "Passage beats must be contiguous",
  );
  expectedStart += scene.frameCount;
}
const clips = [];
for (const [index, scene] of scenes.entries()) {
  const id = resources ? `beat-${index + 1}` : index === 0 ? "st013" : "st014";
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
const video = join(output, filename);
await run("ffmpeg", [
  "-v",
  "error",
  "-n",
  ...clips.flatMap((clip) => ["-i", clip.outputPath]),
  "-i",
  narration,
  "-filter_complex",
  `${clips.map((_, i) => `[${i}:v]`).join("")}concat=n=${clips.length}:v=1:a=0[v];[${clips.length}:a]atrim=start=${startFrame / 24}:end=${endFrameExclusive / 24},asetpts=PTS-STARTPTS[a]`,
  "-map",
  "[v]",
  "-map",
  "[a]",
  "-frames:v",
  String(frameCount),
  "-t",
  String(frameCount / 24),
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
  String(frameCount),
);
assert.ok(streams.some((stream) => stream.codec_type === "audio"));
await run("ffmpeg", ["-v", "error", "-i", video, "-f", "null", "-"]);
await run("ffmpeg", [
  "-v",
  "error",
  "-i",
  video,
  "-vf",
  resources
    ? "select='eq(n,0)+eq(n,407)+eq(n,408)+eq(n,647)+eq(n,648)+eq(n,767)+eq(n,768)+eq(n,876)+eq(n,950)+eq(n,951)+eq(n,1069)+eq(n,1229)+eq(n,1230)+eq(n,1302)+eq(n,1334)+eq(n,1506)',scale=480:270,tile=4x4"
    : "select='eq(n,0)+eq(n,114)+eq(n,242)+eq(n,333)+eq(n,334)+eq(n,374)+eq(n,386)+eq(n,479)+eq(n,645)',scale=640:360,tile=3x3",
  "-frames:v",
  "1",
  join(output, "proof-motion.jpg"),
]);
const shotSlices = [];
if (resources) {
  for (const shot of resourceShots) {
    const path = join(output, `${shot.id}.mp4`);
    await run("ffmpeg", [
      "-v",
      "error",
      "-n",
      "-i",
      video,
      "-filter_complex",
      `[0:v]trim=start_frame=${shot.start - startFrame}:end_frame=${shot.end - startFrame},setpts=PTS-STARTPTS[v];[0:a]atrim=start=${(shot.start - startFrame) / 24}:end=${(shot.end - startFrame) / 24},asetpts=PTS-STARTPTS[a]`,
      "-map",
      "[v]",
      "-map",
      "[a]",
      "-frames:v",
      String(shot.end - shot.start),
      "-t",
      String((shot.end - shot.start) / 24),
      "-c:v",
      "libx264",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      path,
    ]);
    const { stdout: probe } = await run("ffprobe", [
      "-v",
      "error",
      "-count_frames",
      "-show_streams",
      "-of",
      "json",
      path,
    ]);
    const media = JSON.parse(probe).streams as typeof streams;
    assert.equal(
      Number(media.find((s) => s.codec_type === "video")?.nb_read_frames),
      shot.end - shot.start,
    );
    assert.ok(media.some((s) => s.codec_type === "audio"));
    shotSlices.push({
      ...shot,
      path,
      sha256: hash(await readFile(path)),
      streams: media,
    });
  }
}
await writeFile(
  join(output, "quality-report.json"),
  JSON.stringify(
    scenes.map((scene) => ({
      title: scene.title,
      episodeStartFrame: scene.episodeStartFrame,
      ...analyzeStoryQuality(compileStoryScene(scene)),
    })),
    null,
    2,
  ) + "\n",
);
await writeFile(
  join(output, "handoff.json"),
  JSON.stringify(
    {
      status:
        "local narrated graphic candidate; not installed into the protected episode timeline",
      episode: "S01E01",
      startFrame,
      endFrameExclusive,
      frameCount,
      fps: 24,
      narration: {
        path: narration,
        sha256: values["narration-sha256"],
        startSeconds: startFrame / 24,
        endSeconds: endFrameExclusive / 24,
      },
      boundary: resources
        ? undefined
        : {
            localFrame: 334,
            masterFrame: 5082,
            treatment:
              "cut with identical household scale, position and common ground",
          },
      shotSlices: resources ? shotSlices : undefined,
      events: scenes.map((scene) => ({
        title: scene.title,
        episodeStartFrame: scene.episodeStartFrame,
        frameCount: scene.frameCount,
        recipe: scene.recipe,
      })),
      video: { path: video, sha256: hash(await readFile(video)), streams },
      limitations:
        "Original symbolic kit candidate. Selected images and episode production records are unchanged. Internal cues follow the current corrected captions and word alignment; sampled-frame and technical checks do not establish continuous audiovisual acceptance or full-episode conformance.",
    },
    null,
    2,
  ) + "\n",
);
await writeFile(
  join(output, "index.html"),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>S01E01 · ${title}</title><style>body{margin:0;background:#e8dfc9;color:#211f1b;font:18px/1.6 Georgia,serif}main{max-width:1280px;margin:auto;padding:40px 20px}video{width:100%}a{color:#8b3f36}</style><main><h1>${title}</h1><p>S01E01 · ${resources ? "ST-006–008" : "ST-013–014"} · ${frameCount} frames · ${(frameCount / 24).toFixed(3)} seconds · existing narration</p><video controls playsinline preload="metadata" src="${filename}"></video><p>Local graphic candidate. The selected episode images and assembled timeline remain preserved.</p><p><a href="proof-motion.jpg">Motion and boundary frames</a> · <a href="handoff.json">Timing and source record</a> · <a href="quality-report.json">Motion quality measurements</a></p></main></html>`,
);
console.log(`Narrated ${frameCount}-frame proof: ${video}`);

const energyReports = [];
for (const clip of [...clips, { outputPath: video }]) {
  const energy = await measureMotionEnergy(clip.outputPath);
  await writeFile(
    `${clip.outputPath}.motion-energy.json`,
    JSON.stringify(energy, null, 2) + "\n",
    { flag: "wx" },
  );
  energyReports.push({ file: clip.outputPath, ...energy });
}
await writeFile(
  join(output, "motion-energy.json"),
  JSON.stringify(energyReports, null, 2) + "\n",
  { flag: "wx" },
);
if (values["require-continuous-motion"]) {
  for (const report of energyReports)
    requireContinuousEnergy(report, report.file);
  for (const scene of scenes) {
    const quality = analyzeStoryQuality(compileStoryScene(scene), {
      preset: "continuous",
    });
    if (
      quality.diagnostics.some((d) =>
        ["semantic-gap", "text-velocity"].includes(d.code),
      )
    )
      throw new Error(`${scene.title} fails compiled continuous gates`);
  }
}
