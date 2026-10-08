import {
  PreparedNodeSchema,
  PreparedSceneSchema,
  type PreparedScene,
} from "@still-shift/scene-contract";
import { legacyTextVariants } from "./composition-legacy-text.ts";

/** Accepted legacy envelopes become bounded native data without altering CE0 fixtures. */
export function legacyEnvelopeVariants(id: string, source: PreparedScene) {
  if (id === "legacy/chronicle-reveal") {
    const scene = legacyTextVariants(id, source).find((item) =>
      item.id.endsWith("/caption"),
    )!.scene;
    const font = scene.fonts![0]!;
    const previous = font.id;
    font.id = `legacy-font-${"f".repeat(610)}`;
    for (const node of scene.nodes)
      if (node.type === "text" && node.fontAsset === previous)
        node.fontAsset = font.id;
    return [
      {
        id: `${id}/accepted-font-identifier`,
        scene: PreparedSceneSchema.parse(scene),
      },
    ];
  }
  if (id !== "legacy/pose-prop-change") return [];
  const scene = structuredClone(source);
  if (scene.recipe.preset !== "pose_prop_change")
    throw new Error("Expected legacy pose recipe");
  scene.durationMs = 8000;
  scene.fps = 30;
  const recipe = scene.recipe;
  const actor = scene.nodes.find((node) => node.id === recipe.actor)!;
  if (actor.type !== "image") throw new Error("Expected legacy image actor");
  const states = actor.states;
  actor.states = Array.from({ length: 33 }, (_, index) => ({
    ...states[index % states.length]!,
  }));
  const previousActor = actor.id;
  actor.id = `legacy-actor-${"a".repeat(610)}`;
  scene.recipe.actor = actor.id;
  for (const node of scene.nodes)
    if (node.parent === previousActor) node.parent = actor.id;
  scene.nodes.find((node) => node.id === "kicker")!.id =
    `legacy-text-${"t".repeat(610)}`;
  const asset = scene.assets.find((asset) => asset.id === "bowl-states")!;
  const previousAsset = asset.id;
  asset.id = `legacy-asset-${"b".repeat(610)}`;
  for (const node of scene.nodes)
    if (node.type === "image")
      for (const state of node.states)
        if (state.asset === previousAsset) state.asset = asset.id;
  while (scene.assets.length < 501)
    scene.assets.push({
      ...scene.assets[0]!,
      id: `unused-legacy-asset-${scene.assets.length}`,
    });
  for (let index = 0; index < 33; index++)
    scene.nodes.push(
      PreparedNodeSchema.parse({
        id: `deep-legacy-group-${index}`,
        ...(index ? { parent: `deep-legacy-group-${index - 1}` } : {}),
        type: "group",
        x: 0.25,
        y: 0.125,
        width: 1580 - index * 2,
        height: 790 - index,
        origin: [0, 0],
        rotation: index % 2 ? -0.08 : 0.1,
        opacity: 0.997,
        clip: true,
      }),
    );
  actor.parent = "deep-legacy-group-32";
  return [
    {
      id: `${id}/accepted-envelope`,
      scene: PreparedSceneSchema.parse(scene),
    },
  ];
}
