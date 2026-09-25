import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { format } from "prettier";
import { CinematicSceneSchema } from "../packages/scene-contract/src/cinematic.ts";
import { compileCinematicScene } from "../packages/renderer-core/src/cinematic-scene.ts";

export async function createFocusScene(directory: string) {
  const courtyard = CinematicSceneSchema.parse(
    JSON.parse(
      await readFile(resolve(directory, "ci-09-layered-parallax.json"), "utf8"),
    ),
  );
  const scene = CinematicSceneSchema.parse({
    ...courtyard,
    title: "Focus Handoff · From stone to figure",
    durationMs: 4000,
    camera: {
      travel: [4, 0],
      anchor: courtyard.camera.anchor,
      focus: { maxBlurPx: 4, transition: [0.25, 0.65] },
    },
    recipe: { ...courtyard.recipe, preset: "focus_handoff" },
  });
  const id = "ci-06-focus-handoff";
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
      "Focus leaves the near masonry and settles on the courtyard figure. A slight lateral drift supports the transfer.",
  };
}
