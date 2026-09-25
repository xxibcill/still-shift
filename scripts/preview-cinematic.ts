import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CinematicSceneSchema } from "../packages/scene-contract/src/cinematic.ts";
import { PreparedAnimationEngine } from "../packages/animation-engine/src/prepared-animation-engine.ts";

const { values } = parseArgs({
  options: {
    scene: { type: "string" },
    output: { type: "string" },
    duration: { type: "string", default: "4" },
    strength: { type: "string", default: "dramatic" },
  },
  strict: true,
});
if (!values.scene || !values.output)
  throw new Error(
    "Pass --scene <prepared.json> --output <new.mp4> [--duration 3..8] [--strength dramatic|standard|restrained]",
  );
const source = resolve(values.scene),
  output = resolve(values.output);
const original = JSON.parse(await readFile(source, "utf8"));
const input = CinematicSceneSchema.parse({
  ...original,
  durationMs: Number(values.duration) * 1000,
  recipe: { ...original.recipe, intensity: values.strength },
});
for (const asset of input.assets)
  asset.path = resolve(dirname(source), asset.path);
if (input.provenance)
  input.provenance = resolve(dirname(source), input.provenance);
await mkdir(dirname(output), { recursive: true });
const scenePath = `${output}.input.json`;
await writeFile(scenePath, JSON.stringify(input, null, 2) + "\n", {
  flag: "wx",
});
const result = await new PreparedAnimationEngine().animate({
  scenePath,
  outputPath: output,
});
const label = input.recipe.preset.replaceAll("_", " ");
const video = encodeURIComponent(basename(output));
await writeFile(
  `${output}.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cinematic Parallax · Quick preview</title><style>body{margin:0;background:#171913;color:#e8dfc9;font:17px system-ui}main{max-width:1200px;margin:auto;padding:32px 20px}h1{font:42px Georgia}p{color:#bdc3b0;line-height:1.6}video{display:block;width:100%;aspect-ratio:16/9;background:#111}</style><main><p>Still Shift / Cinematic Parallax</p><h1>One move. A different pace.</h1><p>${label} · ${input.recipe.intensity} · ${input.durationMs / 1000} seconds</p><video src="${video}" controls muted playsinline preload="auto"></video><p>Same layered camera technique, adjusted through variation, scene, strength and duration.</p></main></html>`,
  { flag: "wx" },
);
console.log(
  JSON.stringify(
    {
      preview: `${output}.html`,
      video: output,
      frames: result.frameCount,
      renderSeconds: result.metrics.totalWallMs / 1000,
    },
    null,
    2,
  ),
);
