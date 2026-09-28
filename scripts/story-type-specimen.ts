import { readStoryPassage } from "../packages/animation-engine/src/story-passage-io.ts";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, basename, dirname, extname } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import {
  loadPreparedScene,
  validatePreparedAssets,
} from "../packages/animation-engine/src/prepared-animation-engine.ts";
import {
  compileStoryScene,
  type StoryRenderScene,
} from "../packages/renderer-core/src/story-scene.ts";
import { resolveStoryFormat } from "../packages/renderer-core/src/story-template.ts";
import { StorySceneSchema } from "../packages/scene-contract/src/story.ts";
import type { TypeQualityCode } from "../packages/renderer-core/src/typography-quality.ts";

const args = process.argv.slice(2),
  root = resolve(".");
const argument = (name: string) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const output = resolve(argument("--output-dir") ?? "artifacts/type-specimens");
const inputs = args.flatMap((arg, i) =>
  arg === "--scene" || arg === "--directory" || arg === "--passage"
    ? [{ kind: arg, path: resolve(args[i + 1]!) }]
    : [],
);
if (!inputs.length)
  throw new Error(
    "Pass --scene <scene.json> or --directory <scene-folder>, and optionally --output-dir <folder> and --strict <comma-separated-codes>.",
  );
const paths: string[] = [];
for (const input of inputs) {
  if (input.kind === "--scene" || input.kind === "--passage")
    paths.push(input.path);
  else
    for (const entry of (await readdir(input.path)).sort())
      if (entry.endsWith(".json")) {
        const path = resolve(input.path, entry),
          raw = JSON.parse(await readFile(path, "utf8"));
        if (
          [
            "story-scene-1",
            "commerce-scene-1",
            "story-render-1",
            "story-template-1",
          ].includes(raw.schemaVersion)
        )
          paths.push(path);
      }
}
await mkdir(output, { recursive: true });
const server = await createServer({
  root,
  configFile: false,
  logLevel: "silent",
  server: {
    host: "127.0.0.1",
    port: 0,
    fs: { allow: [root, ...paths.map(dirname)] },
  },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
const manifest: {
  scene: string;
  format: string;
  specimens: string[];
  quality: string;
}[] = [];
try {
  const page = await browser.newPage();
  await page.addInitScript("window.__name = (fn) => fn;");
  await page.goto(server.resolvedUrls!.local[0]!);
  for (const path of paths) {
    const raw = JSON.parse(await readFile(path, "utf8"));
    let loaded;
    let sourceForFormats;
    const passage =
      raw.schemaVersion === "story-passage-1" ||
      raw.schemaVersion === "story-passage-2"
        ? await readStoryPassage(path)
        : undefined;
    if (passage)
      loaded = {
        scene: compileStoryScene(passage.beats[0]!.scene),
        assetPaths: await validatePreparedAssets(
          passage.beats[0]!.scene,
          dirname(path),
        ),
      };
    else if (
      raw.schemaVersion === "story-render-1" ||
      raw.schemaVersion === "story-template-1"
    ) {
      const source = Object.fromEntries(
        Object.entries(raw.scene).filter(([key]) =>
          Object.hasOwn(StorySceneSchema.shape, key),
        ),
      );
      const parsed = StorySceneSchema.parse(source);
      sourceForFormats = parsed;
      if (raw.schemaVersion === "story-template-1" && raw.formats)
        sourceForFormats.formats = raw.formats;
      if (raw.assetPaths)
        for (const asset of [...parsed.assets, ...(parsed.fonts ?? [])])
          asset.path = raw.assetPaths[asset.id];
      loaded = {
        scene:
          raw.schemaVersion === "story-render-1" &&
          raw.scene.tracks &&
          raw.scene.rendererVersion
            ? ({ ...raw.scene, ...parsed } as StoryRenderScene)
            : compileStoryScene(parsed),
        assetPaths: await validatePreparedAssets(parsed, dirname(path)),
      };
    } else {
      loaded = await loadPreparedScene(path);
      if (raw.schemaVersion === "story-scene-1")
        sourceForFormats = StorySceneSchema.parse(raw);
    }
    if (
      loaded.scene.schemaVersion !== "story-scene-1" &&
      loaded.scene.schemaVersion !== "commerce-scene-1"
    )
      throw new Error("Type specimen requires a story or commerce scene");
    const scenes = passage
      ? passage.beats.map((beat) => compileStoryScene(beat.scene))
      : [loaded.scene];
    if (
      passage &&
      [...passage.templates.values()].every(
        (template) =>
          (template.schemaVersion === "story-template-1"
            ? (template.formats ?? template.scene.formats)
            : template.formats
          )?.vertical,
      )
    ) {
      const vertical = await readStoryPassage(path, { format: "vertical" });
      scenes.push(
        ...vertical.beats.map((beat) => compileStoryScene(beat.scene)),
      );
    } else if (sourceForFormats?.formats?.vertical) {
      scenes.push(
        compileStoryScene(resolveStoryFormat(sourceForFormats, "vertical")),
      );
    }
    for (const scene of scenes) {
      const assetPaths = passage
        ? await validatePreparedAssets(scene, dirname(path))
        : loaded.assetPaths;
      const name =
        basename(dirname(path)) +
        "-" +
        basename(path, extname(path)) +
        (passage ? `-${scenes.indexOf(scene) + 1}` : "") +
        "-" +
        (("format" in scene ? scene.format : undefined) ??
          `${scene.width}x${scene.height}`);
      const result = await page.evaluate(
        async ({ root, scene, paths, strict }) => {
          const { loadIllustratedImages, createIllustratedPreview } =
            await import(
              `/@fs/${root}/packages/renderer-core/src/illustrated-renderer.ts`
            );
          const { renderTypeSpecimen } = await import(
            `/@fs/${root}/packages/renderer-core/src/typography-specimen.ts`
          );
          const { prepareTypeReview } = await import(
            `/@fs/${root}/packages/renderer-core/src/typography-review.ts`
          );
          const { analyzeStoryQuality } = await import(
            `/@fs/${root}/packages/renderer-core/src/story-quality.ts`
          );
          const { analyzeTypography } = await import(
            `/@fs/${root}/packages/renderer-core/src/typography-quality.ts`
          );
          const { measureTypographyPixels } = await import(
            `/@fs/${root}/packages/renderer-core/src/typography-pixels.ts`
          );
          const images = await loadIllustratedImages(
            scene,
            (id: string) => `/@fs/${paths[id]}`,
          );
          const preview = createIllustratedPreview(
            document.createElement("canvas"),
            scene,
            images,
          );
          const specimens = renderTypeSpecimen(scene, images.fonts).map(
            (canvas: HTMLCanvasElement) => canvas.toDataURL().split(",")[1],
          );
          const typography = {
            prepared:
              preview.typography ?? prepareTypeReview(scene, images.fonts),
            pixels: measureTypographyPixels(scene, images),
            ...(strict
              ? { failOn: strict.split(",") as TypeQualityCode[] }
              : {}),
          };
          const quality =
            scene.schemaVersion === "story-scene-1"
              ? analyzeStoryQuality(scene, { typography })
              : {
                  version: "commerce-type-quality-1",
                  typography: analyzeTypography(scene, typography),
                };
          preview.dispose();
          return { specimens, quality };
        },
        { root, scene, paths: assetPaths, strict: argument("--strict") },
      );
      const specimens: string[] = [];
      for (const [i, png] of result.specimens.entries()) {
        const file = `${name}-${i + 1}.png`;
        await writeFile(resolve(output, file), Buffer.from(png!, "base64"));
        specimens.push(file);
      }
      const quality = `${name}.quality.json`;
      await writeFile(
        resolve(output, quality),
        JSON.stringify(result.quality, null, 2),
      );
      manifest.push({
        scene: path,
        format:
          ("format" in scene ? scene.format : undefined) ??
          `${scene.width}x${scene.height}`,
        specimens,
        quality,
      });
      console.log(
        `${name}: ${specimens.length} specimen sheets and quality report`,
      );
    }
  }
  await writeFile(
    resolve(output, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
} finally {
  await browser.close();
  await server.close();
}
