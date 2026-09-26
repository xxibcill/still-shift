import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { format } from "prettier";
import type { CinematicScene } from "../packages/scene-contract/src/cinematic.ts";
import { compileCinematicScene } from "../packages/renderer-core/src/cinematic-scene.ts";

type Entry = { id: string; scene: CinematicScene; description: string };

export async function publishCinematicScenes(
  directory: string,
  entries: Entry[],
) {
  for (const { id, scene } of entries) {
    const compiled = compileCinematicScene(scene);
    await writeFile(
      resolve(directory, `${id}.json`),
      await format(JSON.stringify(scene), { parser: "json" }),
    );
    console.log(`${id}: ${JSON.stringify(compiled.cameraValidation)}`);
  }
  return entries.map(({ id, scene, description }) => ({
    id,
    title: scene.title,
    description,
  }));
}
