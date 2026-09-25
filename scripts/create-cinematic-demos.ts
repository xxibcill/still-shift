import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { imageSize } from "image-size";
import { format } from "prettier";
import { CinematicSceneSchema } from "../packages/scene-contract/src/cinematic.ts";
import { compileCinematicScene } from "../packages/renderer-core/src/cinematic-scene.ts";

const directory = resolve("benchmarks/fixtures/cinematic-illustrated");
await mkdir(directory, { recursive: true });
const assets = await Promise.all(
  ["background", "subject", "foreground"].map(async (id) => {
    const path = `../../../assets/cinematic-illustrated/kit-b-courtyard/${id}.png`;
    const bytes = await readFile(resolve(directory, path));
    const { width, height } = imageSize(bytes);
    return {
      id,
      path,
      width,
      height,
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    };
  }),
);
const scale = 2080 / 1672;
const fullHeight = 941 * scale;
const image = (id: string, crop: [number, number, number, number]) => ({
  id,
  type: "image",
  x: -80 + crop[0] * scale,
  y: -45 + crop[1] * scale,
  width: crop[2] * scale,
  height: crop[3] * scale,
  fit: "stretch",
  states: [{ asset: id, crop }],
});
const base = CinematicSceneSchema.parse({
  schemaVersion: "illustrated-scene-2",
  title: "Layered Parallax · The courtyard",
  durationMs: 7000,
  fps: 24,
  assets,
  background: "#E8DFC9",
  nodes: [
    image("background", [0, 0, 1672, 941]),
    image("subject", [1045, 265, 320, 550]),
    image("foreground", [0, 0, 725, 941]),
  ],
  layers: [
    { node: "background", depth: 8, paintedBounds: [0, 0, 2080, fullHeight] },
    {
      node: "subject",
      depth: 4,
      protectedRegion: [
        [26, 24],
        [171, 24],
        [171, 530],
        [26, 530],
      ].map(([x, y]) => [x! * scale, y! * scale]),
    },
    {
      node: "foreground",
      depth: 1,
      edgeAttachments: ["left", "top", "bottom"],
    },
  ],
  camera: { travel: [80, 8], anchor: [0.3, 0.5] },
  recipe: {
    preset: "layered_parallax",
    foreground: "foreground",
    subject: "subject",
    background: "background",
    intensity: "dramatic",
  },
  provenance:
    "../../../assets/cinematic-illustrated/kit-b-courtyard/provenance.json",
});
const alternate = CinematicSceneSchema.parse({
  ...base,
  title: "Layered Parallax · Across the courtyard",
  nodes: base.nodes.map((node) => ({
    ...node,
    x:
      node.x -
      (node.id === "subject" ? 220 : node.id === "foreground" ? 260 : 0),
  })),
  layers: base.layers.map((layer) => ({
    ...layer,
    depth:
      layer.node === "foreground" ? 0.85 : layer.node === "subject" ? 3 : 10,
  })),
  camera: { ...base.camera, travel: [-60, 6] },
});
const scenes = [
  {
    id: "ci-09-layered-parallax",
    scene: base,
    description:
      "A broad, weighted camera sweep clears the near doorway while the figure stays anchored in the courtyard.",
  },
  {
    id: "ci-09-layered-parallax-alternate",
    scene: alternate,
    description:
      "A second composition changes the subject position, plane spacing and camera direction.",
  },
];
for (const { id, scene } of scenes) {
  const compiled = compileCinematicScene(scene);
  await writeFile(
    resolve(directory, `${id}.json`),
    await format(JSON.stringify(scene), { parser: "json" }),
  );
  console.log(`${id}: ${JSON.stringify(compiled.cameraValidation)}`);
}
await writeFile(
  resolve(directory, "catalog.json"),
  await format(
    JSON.stringify(
      scenes.map(({ id, scene, description }) => ({
        id,
        title: scene.title,
        description,
      })),
    ),
    { parser: "json" },
  ),
);
