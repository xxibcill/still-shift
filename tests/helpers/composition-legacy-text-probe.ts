import {
  PreparedNodeSchema,
  PreparedSceneSchema,
  type PreparedScene,
} from "@still-shift/scene-contract";
import { legacyTextVariants } from "./composition-legacy-text.ts";

/** Compare renamed text against the identical short-ID authoring scene. */
export function legacyTextProbeVariants(id: string, source: PreparedScene) {
  if (id !== "legacy/chronicle-reveal") return [];
  const caption = legacyTextVariants(id, source).find((item) =>
    item.id.endsWith("/caption"),
  )!.scene;
  return [false, true].map((nested) => {
    const reference = structuredClone(caption);
    const titleIndex = reference.nodes.findIndex((node) => node.id === "title");
    const title = reference.nodes[titleIndex]!;
    reference.nodes.push(
      PreparedNodeSchema.parse({
        ...title,
        id: `legacy-node-${titleIndex}`,
        x: 200,
        y: 500,
        text: "Independent collision text",
        states: ["Independent collision text"],
      }),
    );
    if (nested) {
      for (let index = 0; index < 33; index++)
        reference.nodes.push(
          PreparedNodeSchema.parse({
            id: `probe-group-${index}`,
            ...(index ? { parent: `probe-group-${index - 1}` } : {}),
            type: "group",
            x: 0,
            y: 0,
            width: reference.width,
            height: reference.height,
            origin: [0, 0],
            clip: true,
          }),
        );
      reference.nodes.find((node) => node.id === "legacy-text-parent")!.parent =
        "probe-group-32";
      reference.nodes.find((node) => node.id === "kicker")!.parent =
        "probe-group-32";
    }
    const scene = structuredClone(reference);
    const probes = ["title", "kicker"].map((original, index) => {
      const node = scene.nodes.find((candidate) => candidate.id === original)!;
      const renamed = `probe-${index}-${"t".repeat(100_000)}`;
      node.id = renamed;
      for (const child of scene.nodes)
        if (child.parent === original) child.parent = renamed;
      if (
        scene.recipe.preset === "chronicle_reveal" &&
        scene.recipe.reveal === original
      )
        scene.recipe.reveal = renamed;
      return { original, renamed };
    });
    return {
      id: `${id}/text-probes-${nested ? "nested" : "root"}`,
      reference: PreparedSceneSchema.parse(reference),
      scene: PreparedSceneSchema.parse(scene),
      probes,
    };
  });
}
