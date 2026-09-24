import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

import { CorpusManifestSchema } from "@still-shift/scene-contract";

const execFileAsync = promisify(execFile);
const option = (name: string): string => {
  const index = process.argv.indexOf(name);
  const value = process.argv[index + 1];
  if (index < 0 || !value || value.startsWith("--"))
    throw new Error(`Missing ${name}`);
  return resolve(value);
};
const corpusPath = option("--corpus");
const outputDir = option("--output-dir");
const limitIndex = process.argv.indexOf("--limit");
const limit = limitIndex < 0 ? null : Number(process.argv[limitIndex + 1]);
if (limit !== null && (!Number.isInteger(limit) || limit < 1))
  throw new Error("--limit must be a positive integer");
const corpus = CorpusManifestSchema.parse(
  JSON.parse(await readFile(corpusPath, "utf8")),
);
await mkdir(outputDir, { recursive: true });

const entries =
  limit === null ? corpus.entries : corpus.entries.slice(0, limit);
for (const entry of entries) {
  const source = resolve(dirname(corpusPath), entry.source.path);
  const frameCount = (entry.expectedShotDurationMs * 30) / 1000;
  for (const [mode, filter] of [
    [
      "static",
      "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,format=yuv420p",
    ],
    [
      "ken-burns",
      "scale=1920:1080:force_original_aspect_ratio=increase,zoompan=z='min(zoom+0.00035,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=30,format=yuv420p",
    ],
  ] as const) {
    const output = join(outputDir, `${entry.id}-${mode}.mp4`);
    await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-loop",
      "1",
      "-framerate",
      "30",
      "-i",
      source,
      "-vf",
      filter,
      "-frames:v",
      String(frameCount),
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-y",
      output,
    ]);
  }
}
process.stdout.write(
  `${JSON.stringify({ corpusId: corpus.corpusId, entryCount: entries.length, clipCount: entries.length * 2, outputDir })}\n`,
);
