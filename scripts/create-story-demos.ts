import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { imageSize } from "image-size";
import { format } from "prettier";
import { StorySceneSchema } from "../packages/scene-contract/src/story.ts";
import { artwork, palette, writeArtwork } from "./story-motion/art.ts";
import { designs } from "./story-motion/scenes.ts";

const directory = resolve("benchmarks/fixtures/story-motion");
const checksum = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
await writeArtwork();
const assets = Object.entries(artwork)
  .map(([id, source]) => ({
    id,
    path: `../../../assets/story-motion/art/${id}.svg`,
    sha256: checksum(source),
    ...imageSize(Buffer.from(source)),
  }))
  .map(({ id, path, sha256, width, height }) => ({
    id,
    path,
    sha256,
    width,
    height,
  }));
const fontFiles = [
  { id: "display", file: "source-serif-4-semibold.otf", weight: "600" },
  { id: "label", file: "plex-sans-medium.ttf", weight: "500" },
  { id: "label-strong", file: "plex-sans-semibold.ttf", weight: "600" },
  { id: "source", file: "plex-mono-medium.ttf", weight: "500" },
];
const fonts = await Promise.all(
  fontFiles.map(async ({ id, file, weight }) => ({
    id,
    path: `../../../assets/story-motion/fonts/${file}`,
    weight,
    sha256: checksum(await readFile(`assets/story-motion/fonts/${file}`)),
  })),
);
await mkdir(directory, { recursive: true });
for (const design of designs) {
  const scene = StorySceneSchema.parse({
    schemaVersion: "story-scene-1",
    title: design.title,
    frameCount: 192,
    fps: 24,
    background: palette.bone,
    assets,
    fonts,
    nodes: design.nodes,
    recipe: design.recipe,
    connectors: design.connectors ?? [],
    provenance:
      "Original code-authored symbolic editorial illustrations for reusable motion studies. Layered Chronicle palette and typography. No selected S01E01 image is modified; these are explanatory fixtures, not authentic evidence or a finished episode.",
  });
  await writeFile(
    resolve(directory, `${design.id}.json`),
    await format(JSON.stringify(scene), { parser: "json" }),
  );
}
await writeFile(
  resolve(directory, "catalog.json"),
  await format(
    JSON.stringify(
      designs.map(({ id, title, description }) => ({ id, title, description })),
    ),
    { parser: "json" },
  ),
);
console.log(
  "Prepared seven editorial story motions with shared vector artwork and pinned fonts.",
);
