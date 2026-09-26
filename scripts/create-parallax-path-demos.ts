import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { imageSize } from "image-size";
import { CinematicSceneSchema } from "../packages/scene-contract/src/cinematic.ts";
import { publishCinematicScenes } from "./publish-cinematic-scenes.ts";

export async function createParallaxPathScenes(directory: string) {
  const assets = await Promise.all(
    [
      ["far", "../../../assets/history-offstage-v2/landscape.png"],
      [
        "terrain",
        "../../../assets/cinematic-illustrated/kit-c-vista/vista-terrain.png",
      ],
      [
        "ridge",
        "../../../assets/cinematic-illustrated/kit-c-vista/vista-ridge.png",
      ],
    ].map(async ([id, path]) => {
      const bytes = await readFile(resolve(directory, path!));
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
  const image = (id: string, x: number, y: number, height: number) => {
    const asset = assets.find((asset) => asset.id === id)!;
    return {
      id,
      type: "image",
      x,
      y,
      width: (height * asset.width) / asset.height,
      height,
      fit: "stretch",
      states: [{ asset: id }],
    };
  };
  const scale = 2230 / 1672;
  const rise = CinematicSceneSchema.parse({
    schemaVersion: "illustrated-scene-2",
    title: "Rising Vista · Across the fields",
    durationMs: 4000,
    fps: 24,
    background: "#E8DFC9",
    assets,
    nodes: [
      image("far", -155, -100, 941 * scale),
      image("terrain", -155, -100, 941 * scale),
      image("ridge", -285, -250, 1400),
    ],
    layers: [
      { node: "far", depth: 12, paintedBounds: [0, 0, 2230, 941 * scale] },
      {
        node: "terrain",
        depth: 4,
        protectedRegion: [
          [900, 420],
          [1300, 420],
          [1300, 630],
          [900, 630],
        ].map(([x, y]) => [x! * scale, y! * scale]),
        edgeAttachments: ["left", "right", "bottom"],
      },
      { node: "ridge", depth: 1, edgeAttachments: ["left", "right", "bottom"] },
    ],
    camera: { travel: [0, -40] },
    recipe: {
      preset: "rising_vista",
      foreground: "ridge",
      subject: "terrain",
      background: "far",
      intensity: "dramatic",
    },
    provenance:
      "../../../assets/cinematic-illustrated/kit-c-vista/provenance.json",
  });
  const threshold = CinematicSceneSchema.parse(
    JSON.parse(
      await readFile(resolve(directory, "ci-01-threshold-push.json"), "utf8"),
    ),
  );
  const curve = CinematicSceneSchema.parse({
    ...threshold,
    title: "Curved Approach · Around the doorway",
    durationMs: 4000,
    nodes: threshold.nodes.map((node) => {
      const height =
        node.id === "left" || node.id === "right"
          ? 1400
          : node.id === "far"
            ? (941 * 2230) / 1672
            : (941 * 2080) / 1672;
      return {
        ...node,
        height,
        width: (node.width * height) / node.height,
        x:
          node.id === "left"
            ? -150
            : node.id === "right"
              ? 1370
              : node.id === "far"
                ? -155
                : -100,
        y:
          node.id === "left" || node.id === "right"
            ? -160
            : node.id === "far"
              ? -90
              : -45,
      };
    }),
    layers: threshold.layers.map((layer) => ({
      ...layer,
      ...(layer.paintedBounds
        ? { paintedBounds: [0, 0, 2230, (941 * 2230) / 1672] }
        : {}),
      ...(layer.protectedRegion
        ? {
            protectedRegion: layer.protectedRegion.map(([x, y]) => [
              (x * 2080) / 1984,
              (y * 2080) / 1984,
            ]),
          }
        : {}),
    })),
    camera: {
      travel: [30, 0],
      push: 0.18,
      curve: [100, -40, 0.08],
      anchor: threshold.camera.anchor,
    },
    recipe: {
      preset: "curved_approach",
      foreground: "left",
      subject: "room",
      background: "far",
      intensity: "dramatic",
    },
  });
  const entries = [
    {
      id: "ci-04-rising-vista",
      scene: rise,
      description:
        "Rise above a near grassy bank. The foreground drops quickly while the fields and distant horizon move more slowly.",
    },
    {
      id: "ci-07-curved-approach",
      scene: curve,
      description:
        "Follow a bowed camera path into the doorway while keeping the vessel anchored. Near stone edges shift and grow around it.",
    },
  ];
  return publishCinematicScenes(directory, entries);
}
