import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { format } from "prettier";
import { CinematicSceneSchema } from "../packages/scene-contract/src/cinematic.ts";
import { compileCinematicScene } from "../packages/renderer-core/src/cinematic-scene.ts";

export async function createRevealScenes(directory: string) {
  const threshold = CinematicSceneSchema.parse(
    JSON.parse(
      await readFile(resolve(directory, "ci-01-threshold-push.json"), "utf8"),
    ),
  );
  // Authored vessel outline, inside the protected framing rectangle, in source pixels.
  const outline = [
    [891, 350],
    [1000, 337],
    [1135, 348],
    [1128, 374],
    [1174, 416],
    [1200, 476],
    [1197, 571],
    [1165, 674],
    [1115, 748],
    [1040, 758],
    [936, 749],
    [898, 695],
    [859, 614],
    [832, 541],
    [824, 478],
    [841, 433],
    [883, 390],
    [896, 373],
  ];
  const compose = (alternate: boolean) => {
    const width = alternate ? 2080 : 1984,
      scale = width / 1672,
      height = 941 * scale;
    const farWidth = 2230,
      farHeight = (941 * farWidth) / 1672;
    const postHeight = alternate ? 2250 : 2100;
    return CinematicSceneSchema.parse({
      ...threshold,
      title: alternate
        ? "Foreground Reveal · The tighter opening"
        : "Foreground Reveal · Behind the stone wall",
      nodes: threshold.nodes
        .filter((node) => node.id !== "left")
        .map((node) => {
          if (node.id === "far")
            return {
              ...node,
              x: -70,
              y: -85,
              width: farWidth,
              height: farHeight,
            };
          if (node.id === "room")
            return {
              ...node,
              x: alternate ? -155 : -32,
              y: alternate ? -60 : (1080 - height) / 2,
              width,
              height,
            };
          return {
            ...node,
            x: alternate ? 680 : 780,
            y: alternate ? -650 : -480,
            width: (postHeight * 948) / 1660,
            height: postHeight,
          };
        }),
      layers: threshold.layers
        .filter((layer) => layer.node !== "left")
        .map((layer) => {
          if (layer.node === "far")
            return {
              node: "far",
              depth: alternate ? 14 : 12,
              paintedBounds: [0, 0, farWidth, farHeight],
            };
          if (layer.node === "room")
            return {
              node: "room",
              depth: alternate ? 4.5 : 4,
              protectedRegion: [
                [805, 320],
                [1220, 320],
                [1220, 780],
                [805, 780],
              ].map(([x, y]) => [x! * scale, y! * scale]),
              edgeAttachments: ["left", "right", "top", "bottom"],
            };
          return { ...layer, depth: alternate ? 1.25 : 1.1 };
        }),
      camera: {
        travel: [alternate ? -110 : -100, 0],
        anchor: threshold.camera.anchor,
      },
      recipe: {
        preset: "foreground_reveal",
        foreground: "right",
        subject: "room",
        background: "far",
        intensity: "dramatic",
        revealRegion: outline.map(([x, y]) => [x! * scale, y! * scale]),
      },
    });
  };
  const entries = [
    {
      id: "ci-03-foreground-reveal",
      scene: compose(false),
      description:
        "The near stone wall initially conceals part of the vessel, then clears it. The camera settles and holds the revealed room.",
    },
    {
      id: "ci-03-foreground-reveal-alternate",
      scene: compose(true),
      description:
        "A larger near wall, closer room framing and different depth spacing create a second reveal.",
    },
  ];
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
