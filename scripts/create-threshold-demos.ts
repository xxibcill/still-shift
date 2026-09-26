import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { imageSize } from "image-size";
import { CinematicSceneSchema } from "../packages/scene-contract/src/cinematic.ts";
import { publishCinematicScenes } from "./publish-cinematic-scenes.ts";

export async function createThresholdScenes(directory: string) {
  const assets = await Promise.all(
    ["far", "room", "left", "right"].map(async (id) => {
      const path = `../../../assets/cinematic-illustrated/kit-a-threshold/threshold-${id}.png`;
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
  const image = (id: string, x: number, y: number, height: number) => {
    const asset = assets.find((asset) => asset.id === id)!;
    return {
      id,
      type: "image",
      x,
      y,
      width: Number(((height * asset.width) / asset.height).toFixed(8)),
      height,
      fit: "stretch",
      states: [{ asset: id }],
    };
  };
  const scale = 1984 / 1672;
  const roomHeight = 941 * scale;
  const base = CinematicSceneSchema.parse({
    schemaVersion: "illustrated-scene-2",
    title: "Threshold Push · The storage chamber",
    durationMs: 7000,
    fps: 24,
    background: "#D4BE91",
    assets,
    nodes: [
      image("far", -32, (1080 - roomHeight) / 2, roomHeight),
      image("room", -32, (1080 - roomHeight) / 2, roomHeight),
      image("left", -75, -60, 1200),
      image("right", 1310, -60, 1200),
    ],
    layers: [
      { node: "far", depth: 12, paintedBounds: [0, 0, 1984, roomHeight] },
      {
        node: "room",
        depth: 4,
        protectedRegion: [
          [805, 320],
          [1220, 320],
          [1220, 780],
          [805, 780],
        ].map(([x, y]) => [x! * scale, y! * scale]),
      },
      { node: "left", depth: 1.6, edgeAttachments: ["left", "top", "bottom"] },
      {
        node: "right",
        depth: 1.6,
        edgeAttachments: ["right", "top", "bottom"],
      },
    ],
    camera: { travel: [0, 0], push: 0.4, anchor: [1015 / 1672, 550 / 941] },
    recipe: {
      preset: "threshold_push",
      foreground: "left",
      foregroundRight: "right",
      subject: "room",
      background: "far",
      intensity: "dramatic",
    },
    provenance:
      "../../../assets/cinematic-illustrated/kit-a-threshold/provenance.json",
  });
  const alternate = CinematicSceneSchema.parse({
    ...base,
    title: "Threshold Push · A narrower entrance",
    nodes: base.nodes.map((node) =>
      node.id === "room"
        ? {
            ...node,
            width: node.width * 1.025,
            height: node.height * 1.025,
            x: 1190 - node.width * 1.025 * base.camera.anchor[0],
            y: 630 - node.height * 1.025 * base.camera.anchor[1],
          }
        : {
            ...node,
            x: node.id === "left" ? -35 : node.id === "right" ? 1270 : node.x,
          },
    ),
    layers: base.layers.map((layer) => ({
      ...layer,
      depth:
        layer.node === "far"
          ? 14
          : layer.node === "room"
            ? 4.2
            : layer.node === "left"
              ? 1.7
              : 1.5,
      ...(layer.protectedRegion
        ? {
            protectedRegion: layer.protectedRegion.map(([x, y]) => [
              x * 1.025,
              y * 1.025,
            ]),
          }
        : {}),
    })),
    camera: { ...base.camera, push: 0.42 },
  });
  const entries = [
    {
      id: "ci-01-threshold-push",
      scene: base,
      description:
        "Move through the near stone doorway toward the vessel. The room approaches as a grounded whole; the distant chamber grows more slowly.",
    },
    {
      id: "ci-01-threshold-push-alternate",
      scene: alternate,
      description:
        "A narrower opening, unequal near depths and a tighter room composition create a second approach.",
    },
  ];
  return publishCinematicScenes(directory, entries);
}
