import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { format } from "prettier";
import { CinematicSceneSchema } from "../packages/scene-contract/src/cinematic.ts";
import { compileCinematicScene } from "../packages/renderer-core/src/cinematic-scene.ts";

export async function createDetailScene(directory: string) {
  const room = CinematicSceneSchema.parse(
    JSON.parse(
      await readFile(resolve(directory, "ci-01-threshold-push.json"), "utf8"),
    ),
  );
  const scale = 1950 / 1672;
  const scene = CinematicSceneSchema.parse({
    ...room,
    title: "Detail to World · The vessel and its chamber",
    durationMs: 4000,
    nodes: room.nodes.map((node) => {
      const near = node.id === "left" || node.id === "right";
      const height = near
        ? 1140
        : node.id === "room"
          ? 941 * scale
          : (941 * 2080) / 1672;
      return {
        ...node,
        height,
        width: (node.width * height) / node.height,
        x:
          node.id === "left"
            ? -300
            : node.id === "right"
              ? 1600
              : node.id === "room"
                ? -15
                : -80,
        y: near ? -30 : (1080 - height) / 2,
      };
    }),
    layers: room.layers.map((layer) => ({
      ...layer,
      ...(layer.node === "far"
        ? { paintedBounds: [0, 0, 2080, (941 * 2080) / 1672] }
        : {}),
      ...(layer.node === "room"
        ? {
            depth: 3,
            edgeAttachments: ["left", "right", "top", "bottom"],
            protectedRegion: [
              [805, 325],
              [1210, 325],
              [1210, 770],
              [805, 770],
            ].map(([x, y]) => [x! * scale, y! * scale]),
          }
        : {}),
    })),
    camera: { travel: [0, 0], pullback: 0.65, anchor: room.camera.anchor },
    recipe: {
      preset: "detail_to_world",
      foreground: "left",
      subject: "room",
      background: "far",
      intensity: "dramatic",
    },
  });
  const compiled = compileCinematicScene(scene);
  const id = "ci-05-detail-to-world";
  await writeFile(
    resolve(directory, `${id}.json`),
    await format(JSON.stringify(scene), { parser: "json" }),
  );
  console.log(`${id}: ${JSON.stringify(compiled.cameraValidation)}`);
  return {
    id,
    title: scene.title,
    description:
      "Retreat from the vessel into the wider chamber. Near doorway posts enter the edges as the room and distant space recede at different rates.",
  };
}
