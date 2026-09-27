import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CinematicSceneSchema } from "../packages/scene-contract/src/cinematic.ts";
import {
  formatSize,
  OutputFormatSchema,
} from "../packages/scene-contract/src/output-format.ts";
import { PreparedAnimationEngine } from "../packages/animation-engine/src/prepared-animation-engine.ts";
import {
  resolveCatalogFormatVariant,
  writeResolvedInput,
} from "../tools/still-shift-cli/src/format-variant.ts";
import { resolveCinematicFormat } from "../packages/renderer-core/src/cinematic-scene.ts";
import { passageDiagnostics } from "../packages/renderer-core/src/passage-diagnostics.ts";

const { values } = parseArgs({
  options: {
    scene: { type: "string" },
    output: { type: "string" },
    duration: { type: "string", default: "4" },
    strength: { type: "string", default: "dramatic" },
    format: { type: "string" },
  },
  strict: true,
});
try {
  if (!values.scene || !values.output)
    throw new Error(
      "Pass --scene <prepared.json> --output <new.mp4> [--duration 3..8] [--strength dramatic|standard|restrained] [--format landscape|vertical]",
    );
  const format = values.format
    ? OutputFormatSchema.parse(values.format)
    : undefined;
  const source = format
      ? await resolveCatalogFormatVariant(values.scene, format)
      : resolve(values.scene),
    output = resolve(values.output);
  const original = JSON.parse(await readFile(source, "utf8"));
  let input = CinematicSceneSchema.parse({
    ...original,
    durationMs: Number(values.duration) * 1000,
    recipe: { ...original.recipe, intensity: values.strength },
  });
  if (values.format) {
    const size = formatSize(format!);
    if (
      format === "vertical" &&
      source === resolve(values.scene) &&
      (input.width !== size.width || input.height !== size.height)
    )
      input = resolveCinematicFormat(input, format);
    if (input.width !== size.width || input.height !== size.height)
      throw new Error(
        `Prepared scene is ${input.width} × ${input.height}; select a resolved ${values.format} variant before rendering`,
      );
  }
  for (const asset of input.assets)
    asset.path = resolve(dirname(source), asset.path);
  if (input.provenance)
    input.provenance = resolve(dirname(source), input.provenance);
  const scenePath = await writeResolvedInput(output, input);
  const result = await new PreparedAnimationEngine().animate({
    scenePath,
    outputPath: output,
  });
  const label = input.recipe.preset.replaceAll("_", " ");
  const video = encodeURIComponent(basename(output));
  await writeFile(
    `${output}.html`,
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cinematic Parallax · Quick preview</title><style>body{margin:0;background:#171913;color:#e8dfc9;font:17px system-ui}main{max-width:1200px;margin:auto;padding:32px 20px}h1{font:42px Georgia}p{color:#bdc3b0;line-height:1.6}video{display:block;width:100%;max-width:${input.height > input.width ? "420px" : "1200px"};aspect-ratio:${input.width}/${input.height};background:#111}</style><main><p>Still Shift / Cinematic Parallax</p><h1>One move. A different pace.</h1><p>${label} · ${input.recipe.intensity} · ${input.durationMs / 1000} seconds</p><video src="${video}" controls muted playsinline preload="auto"></video><p>Same layered camera technique, adjusted through variation, scene, strength and duration.</p></main></html>`,
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
} catch (error) {
  const report =
    error && typeof error === "object" && "report" in error
      ? error.report
      : undefined;
  console.error(
    JSON.stringify({
      status: "failed",
      diagnostics: passageDiagnostics(error),
      ...(report ? { report } : {}),
    }),
  );
  process.exitCode = 1;
}
