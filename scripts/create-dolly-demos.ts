import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { format } from "prettier";
import { CinematicSceneSchema } from "../packages/scene-contract/src/cinematic.ts";
import { compileCinematicScene } from "../packages/renderer-core/src/cinematic-scene.ts";

export async function createDollyScenes(directory: string) {
  const variants = [
    {
      id: "ci-08-dolly-zoom-tension",
      source: "ci-09-layered-parallax",
      title: "Dolly-Zoom Tension · The courtyard",
      depth: { foreground: 2.6 },
      push: 0.28,
      description:
        "The courtyard contracts behind a stationary figure as the near masonry approaches, while the figure keeps its size and position.",
    },
    {
      id: "ci-08-dolly-zoom-tension-alternate",
      source: "ci-09-layered-parallax-alternate",
      title: "Dolly-Zoom Tension · Across the courtyard",
      depth: { foreground: 2, subject: 3, background: 10 },
      push: 0.2,
      description:
        "A shifted figure and masonry edge use wider depth spacing for a second distance-compression study.",
    },
  ];
  const entries = [];
  for (const variant of variants) {
    const source = CinematicSceneSchema.parse(
      JSON.parse(
        await readFile(resolve(directory, `${variant.source}.json`), "utf8"),
      ),
    );
    const depth = variant.depth as Record<string, number>;
    const scene = CinematicSceneSchema.parse({
      ...source,
      title: variant.title,
      layers: source.layers.map((layer) => ({
        ...layer,
        depth: depth[layer.node] ?? layer.depth,
      })),
      camera: {
        travel: [0, 0],
        push: variant.push,
        anchor: source.camera.anchor,
      },
      recipe: { ...source.recipe, preset: "dolly_zoom_tension" },
    });
    const compiled = compileCinematicScene(scene);
    await writeFile(
      resolve(directory, `${variant.id}.json`),
      await format(JSON.stringify(scene), { parser: "json" }),
    );
    console.log(`${variant.id}: ${JSON.stringify(compiled.cameraValidation)}`);
    entries.push({
      id: variant.id,
      title: scene.title,
      description: variant.description,
    });
  }
  return entries;
}
