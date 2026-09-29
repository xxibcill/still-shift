import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { format } from "prettier";
import { CinematicSceneSchema } from "../packages/scene-contract/src/cinematic.ts";
import { compileCinematicScene } from "../packages/renderer-core/src/cinematic-scene.ts";

export async function createDollyScene(directory: string) {
  const courtyard = CinematicSceneSchema.parse(
    JSON.parse(
      await readFile(resolve(directory, "ci-09-layered-parallax.json"), "utf8"),
    ),
  );
  const scene = CinematicSceneSchema.parse({
    ...courtyard,
    title: "Dolly-Zoom Tension · The courtyard",
    layers: courtyard.layers.map((layer) => ({
      ...layer,
      depth: layer.node === "foreground" ? 2.6 : layer.depth,
    })),
    camera: {
      travel: [0, 0],
      push: 0.28,
      anchor: courtyard.camera.anchor,
    },
    recipe: { ...courtyard.recipe, preset: "dolly_zoom_tension" },
  });
  const id = "ci-08-dolly-zoom-tension";
  const compiled = compileCinematicScene(scene);
  await writeFile(
    resolve(directory, `${id}.json`),
    await format(JSON.stringify(scene), { parser: "json" }),
  );
  console.log(`${id}: ${JSON.stringify(compiled.cameraValidation)}`);
  return {
    id,
    title: scene.title,
    description:
      "The courtyard contracts behind a stationary figure as the near masonry approaches, while the figure keeps its size and position.",
  };
}
