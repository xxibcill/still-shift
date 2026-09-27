import {
  StorySceneSchema,
  type StoryScene,
} from "../../scene-contract/src/story.ts";
import { compileStoryScene } from "./story-scene.ts";
import { ComponentDataSchema } from "../../scene-contract/src/component-data.ts";
import type { StoryRenderScene } from "./story-scene.ts";
import { storyAnchorPosition } from "./story-geometry.ts";
import { motionError } from "./motion-craft.ts";

/** Expand a preset to portable primitive tracks without resampling its easing. */
export function expandStoryRecipe(source: StoryScene): StoryScene {
  if (source.motionModel) return structuredClone(source);
  const compiled = compileStoryScene(source);
  const moves: unknown[] = [],
    states: unknown[] = [];
  for (const [node, tracks] of Object.entries(compiled.tracks))
    for (const [property, original] of Object.entries(tracks)) {
      const keys = [
        ...new Map(original.map((key) => [key.time, key])).values(),
      ];
      if (property === "state") {
        states.push({
          id: `${node}-macro-state`,
          target: node,
          initial: keys[0]!.value,
          cuts: keys.slice(1).map((key, i) => ({
            id: `${node}-cut-${i}`,
            frame: key.time,
            state: key.value,
          })),
        });
        continue;
      }
      const numeric = keys.map((key) => ({
        frame: key.time,
        [property]: key.value,
        ...(key.step
          ? { interpolation: "hold" }
          : { easing: key.easing ?? "smoothstep" }),
      }));
      if (numeric.length === 1)
        numeric.push({ ...numeric[0]!, frame: source.frameCount - 1 });
      moves.push({ node, blend: "replace", layer: "action", keys: numeric });
    }
  const componentData = states.length
    ? ComponentDataSchema.parse({
        ...(source.componentData ?? {}),
        schemaVersion: "scene-components-3",
        states: [
          ...(source.componentData &&
          source.componentData.schemaVersion !== "scene-components-1"
            ? source.componentData.states
            : []),
          ...states,
        ],
      })
    : source.componentData;
  return StorySceneSchema.parse({
    ...source,
    motionModel: "curves-1",
    nodes: compiled.nodes,
    recipe: { preset: "generic", moves, emphasis: [] },
    ...(componentData ? { componentData } : {}),
    ...(source.recipe.preset === "category_swap"
      ? {
          checks: [
            { type: "stable-anchors", nodes: source.recipe.stableAnchors },
          ],
        }
      : {}),
  });
}
export function validateStorySemanticChecks(scene: StoryRenderScene) {
  for (const [index, check] of (scene.checks ?? []).entries()) {
    if (check.type === "stable-anchors")
      for (const id of check.nodes) {
        const node = scene.nodes.find((n) => n.id === id)!,
          initial = [
            [0, 0],
            [node.width, 0],
            [0, node.height],
          ].map((p) =>
            storyAnchorPosition(scene, id, p as [number, number], 0),
          );
        for (let frame = 1; frame < scene.frameCount; frame++) {
          const value = [
            [0, 0],
            [node.width, 0],
            [0, node.height],
          ].map((p) =>
            storyAnchorPosition(scene, id, p as [number, number], frame),
          );
          if (
            value.some((point, i) =>
              point.some((v, axis) => Math.abs(v - initial[i]![axis]!) > 1e-8),
            )
          )
            motionError(
              "motion-stable-anchor",
              `/checks/${index}`,
              `${id} moves at frame ${frame}`,
            );
        }
      }
    else {
      const path = scene.nodes.find((n) => n.id === check.path)!,
        a = scene.nodes.find((n) => n.id === check.sides[0])!,
        b = scene.nodes.find((n) => n.id === check.sides[1])!;
      if (path.type !== "path")
        motionError(
          "motion-clearance",
          `/checks/${index}`,
          "Clearance requires a path",
        );
      for (let frame = 0; frame < scene.frameCount; frame++) {
        const corners = (node: typeof a) =>
          [
            [0, 0],
            [node.width, 0],
            [node.width, node.height],
            [0, node.height],
          ].map((p) =>
            storyAnchorPosition(scene, node.id, p as [number, number], frame),
          );
        const first = corners(a),
          second = corners(b);
        const center = (points: [number, number][]) =>
          [
            points.reduce((sum, p) => sum + p[0], 0) / 4,
            points.reduce((sum, p) => sum + p[1], 0) / 4,
          ] as const;
        const ac = center(first),
          bc = center(second),
          dx = bc[0] - ac[0],
          dy = bc[1] - ac[1],
          length = Math.hypot(dx, dy);
        const project = (point: [number, number]) =>
          length ? (point[0] * dx + point[1] * dy) / length : 0;
        const gap =
          Math.min(...second.map(project)) - Math.max(...first.map(project));
        if (gap < check.minimum + path.lineWidth)
          motionError(
            "motion-clearance",
            `/checks/${index}`,
            `Clearance below minimum at frame ${frame}`,
          );
      }
    }
  }
}
