import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  CinematicSceneSchema,
  type CinematicScene,
} from "../packages/scene-contract/src/cinematic.ts";
import { publishCinematicScenes } from "./publish-cinematic-scenes.ts";

export async function createLateralScenes(directory: string) {
  const threshold = CinematicSceneSchema.parse(
    JSON.parse(
      await readFile(resolve(directory, "ci-01-threshold-push.json"), "utf8"),
    ),
  );
  const compose = (alternate: boolean): CinematicScene => {
    const roomWidth = alternate ? 2352 : 2230;
    const scale = roomWidth / 1672;
    const height = 941 * scale;
    const roomX = alternate ? -370 : -60;
    const roomY = alternate ? -150 : -85;
    const nodes = threshold.nodes.map((node) => {
      if (node.id === "room" || node.id === "far")
        return {
          ...node,
          width: roomWidth,
          height,
          x: node.id === "room" ? roomX : (1920 - roomWidth) / 2,
          y: roomY,
        };
      return {
        ...node,
        x:
          node.id === "left"
            ? alternate
              ? -500
              : -40
            : alternate
              ? 1420
              : 1650,
      };
    });
    const layers = threshold.layers.map((layer) => {
      if (layer.node === "far")
        return {
          node: "far",
          depth: alternate ? 12 : 10,
          paintedBounds: [0, 0, roomWidth, height],
        };
      if (layer.node === "room")
        return {
          node: "room",
          depth: alternate ? 3 : 3.5,
          protectedRegion: [
            [805, 320],
            [1220, 320],
            [1220, 780],
            [805, 780],
          ].map(([x, y]) => [x! * scale, y! * scale]),
          edgeAttachments: ["left", "right", "top", "bottom"],
        };
      return {
        ...layer,
        depth:
          layer.node === "left"
            ? alternate
              ? 1.6
              : 1.3
            : alternate
              ? 1.1
              : 1.6,
      };
    });
    return CinematicSceneSchema.parse({
      ...threshold,
      title: alternate
        ? "Lateral Track · Across the narrower chamber"
        : "Lateral Track · Passing the storage chamber",
      nodes,
      layers,
      camera: {
        travel: [alternate ? -100 : 128, 0],
        anchor: threshold.camera.anchor,
      },
      recipe: {
        preset: "lateral_track",
        foreground: alternate ? "right" : "left",
        subject: "room",
        background: "far",
        intensity: "dramatic",
      },
    });
  };
  const entries = [
    {
      id: "ci-02-lateral-track",
      scene: compose(false),
      description:
        "Travel sideways past the near stonework. The vessel and its floor drift together while the distant opening moves more slowly.",
    },
    {
      id: "ci-02-lateral-track-alternate",
      scene: compose(true),
      description:
        "A tighter room, reversed travel and unequal foreground depths create a second sustained traverse.",
    },
  ];
  return publishCinematicScenes(directory, entries);
}
