import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { PreparedAnimationEngine } from "../../packages/animation-engine/src/prepared-animation-engine.ts";

const { values } = parseArgs({
  options: {
    baseline: {
      type: "string",
      default: "benchmarks/results/story-motion-v012",
    },
    "output-dir": { type: "string" },
  },
});
if (!values["output-dir"]) throw new Error("Pass a new --output-dir");
const output = resolve(values["output-dir"]);
await mkdir(output);
const entries = JSON.parse(
  await readFile("benchmarks/fixtures/story-motion/catalog.json", "utf8"),
) as { id: string }[];
const run = promisify(execFile);
const decodedHashes = async (file: string) => {
  const { stdout } = await run("ffmpeg", [
    "-v",
    "error",
    "-i",
    file,
    "-map",
    "0:v:0",
    "-f",
    "framemd5",
    "-",
  ]);
  return stdout.split("\n").filter((line) => line && !line.startsWith("#"));
};
const reports = [];
for (const { id } of entries) {
  const before = join(values.baseline!, `${id}.mp4`);
  const manifest = JSON.parse(await readFile(`${before}.scene.json`, "utf8"));
  const input = Object.fromEntries(
    Object.entries(manifest.scene).filter(([key]) =>
      Object.hasOwn(StorySceneSchema.shape, key),
    ),
  );
  const scene = StorySceneSchema.parse(input);
  for (const asset of [...scene.assets, ...(scene.fonts ?? [])])
    asset.path = manifest.assetPaths[asset.id];
  const scenePath = join(output, `${id}.json`),
    after = join(output, `${id}.mp4`);
  await writeFile(scenePath, JSON.stringify(scene, null, 2) + "\n", {
    flag: "wx",
  });
  await new PreparedAnimationEngine().animate({ scenePath, outputPath: after });
  const [a, b] = await Promise.all([
    decodedHashes(before),
    decodedHashes(after),
  ]);
  assert.deepEqual(b, a, `${id}: decoded frames changed`);
  reports.push({ id, frames: a.length, pixelIdentical: true });
  console.log(`${id}: ${a.length} decoded frames identical`);
}
await writeFile(
  join(output, "legacy-pixels.json"),
  JSON.stringify(reports, null, 2) + "\n",
  { flag: "wx" },
);
