import {
  PreparedNodeSchema,
  PreparedSceneSchema,
  type PreparedScene,
} from "@still-shift/scene-contract";

/** Exercise supported legacy text layouts without changing the frozen fixtures. */
export function legacyTextVariants(id: string, source: PreparedScene) {
  if (id !== "legacy/chronicle-reveal") return [];
  return ["text-box", "caption", "speech", "thought"].map((kind, index) => {
    const scene = structuredClone(source);
    scene.durationMs = 3000;
    scene.fonts = [
      {
        id: "legacy-text-font",
        path: "../../../assets/ecommerce-motion/fonts/noto-sans-thai.ttf",
        sha256:
          "sha256:5a1c559bb539583c8a1fd99d1c5b9491e5e14478c9cd2bd0970d5c3096cc9ef8",
        weight: "400",
      },
    ];
    const node = scene.nodes.find((node) => node.id === "title")!;
    if (node.type !== "text") throw new Error("Expected legacy title");
    node.text = "Measured legacy text\nSecond line";
    node.states = [node.text, "Another prepared text state"];
    node.fontAsset = scene.fonts[0]!.id;
    node.fontSize = 40;
    node.width = 520;
    node.height = 130;
    node.x = 800;
    node.y = 180;
    node.align = index === 0 ? "left" : index === 1 ? "right" : "center";
    node.parent = "legacy-text-parent";
    node.rotation = 4;
    node.opacity = 0.8;
    if (kind === "text-box" || kind === "caption")
      node.textBox = { locale: "en", maxLines: 2, lineHeight: 1.2 };
    else {
      node.textLayout = {
        width: 520,
        height: 130,
        lineHeight: 1.2,
        overflow: "clip",
      };
      node.revealMode = kind === "speech" ? "words" : "wipe";
    }
    if (kind !== "text-box")
      node.container = {
        kind: kind as "caption" | "speech" | "thought",
        fill: "#FFF8E7",
        stroke: "#514638",
        strokeWidth: 2,
        padding: 20,
        radius: 18,
        ...(kind === "caption"
          ? {}
          : {
              tail: { side: "bottom", position: 0.6, length: 32 },
            }),
      };
    scene.nodes.push(
      PreparedNodeSchema.parse({
        id: node.parent,
        type: "group",
        x: 9,
        y: -7,
        width: scene.width,
        height: scene.height,
        rotation: -2,
        opacity: 0.85,
        clip: true,
      }),
    );
    if (scene.recipe.preset !== "chronicle_reveal")
      throw new Error("Expected legacy reveal recipe");
    scene.recipe.reveal = node.id;
    return { id: `${id}/${kind}`, scene: PreparedSceneSchema.parse(scene) };
  });
}
