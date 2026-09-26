import type {
  StoryScene,
  StoryWindow,
} from "../../scene-contract/src/story.ts";
import type { Tracks } from "./prepared-scene.ts";
import { createFrameTracks } from "./frame-tracks.ts";

export type StoryRenderScene = StoryScene & {
  rendererVersion: "story-canvas-0.13.3";
  durationMs: number;
  canvas: { width: number; height: number };
  timeline: { fps: number; durationMs: number; frameCount: number };
  tracks: Record<string, Tracks>;
  followers: Record<string, never>;
};
export function compileStoryScene(input: StoryScene): StoryRenderScene {
  const tracks = createFrameTracks(input.nodes);
  const node = (id: string) => input.nodes.find((node) => node.id === id)!;
  const enter = (id: string, window: StoryWindow) => {
    tracks.initial(id, "opacity", 0);
    tracks.add(id, "opacity", window, node(id).opacity);
  };
  const reveal = (id: string, window: StoryWindow) => {
    tracks.initial(id, "reveal", 0);
    tracks.add(id, "reveal", window, 1);
  };
  const recipe = input.recipe;
  switch (recipe.preset) {
    case "unequal_margins":
      for (const pressure of recipe.pressures) {
        tracks.add(pressure.node, "x", recipe.strain, pressure.to[0]);
        tracks.add(pressure.node, "y", recipe.strain, pressure.to[1]);
      }
      recipe.labels.forEach((label, i) =>
        enter(label, recipe.labelWindows?.[i] ?? recipe.strain),
      );
      break;
    case "access_constraint": {
      const route = node(recipe.route);
      if (route.type !== "path") throw new Error("Restriction requires a path");
      const [a, b] = route.points as [[number, number], [number, number]];
      const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const center = [
        route.x + a[0] + (b[0] - a[0]) * recipe.position,
        route.y + a[1] + (b[1] - a[1]) * recipe.position,
      ];
      recipe.sides.forEach((id, index) => {
        const side = node(id);
        const sign = index === 0 ? -1 : 1;
        const position = (aperture: number) => {
          const distance = (sign * (aperture + side.height)) / 2;
          return [
            center[0]! - Math.sin(angle) * distance - side.width / 2,
            center[1]! + Math.cos(angle) * distance - side.height / 2,
          ];
        };
        const start = position(recipe.openWidth),
          end = position(recipe.constrainedWidth);
        tracks.initial(id, "rotation", (angle * 180) / Math.PI);
        for (const [index, property] of ["x", "y"].entries()) {
          tracks.initial(id, property as "x" | "y", start[index]!);
          tracks.add(id, property as "x" | "y", recipe.narrow, end[index]!);
        }
        enter(id, recipe.reveal);
      });
      for (const id of recipe.connections) reveal(id, recipe.reveal);
      break;
    }
    case "relationship_build":
      for (const branch of recipe.branches) {
        reveal(branch.path, branch.window);
        enter(branch.destination, branch.arrival ?? branch.window);
      }
      break;
    case "evidence_boundary":
      for (const event of [
        ...recipe.supported,
        recipe.unknown,
        recipe.composite,
      ])
        enter(event.node, event.window);
      break;
    case "dated_system_break":
      for (const event of recipe.breaks)
        tracks.add(event.path, "gap", event.window, 1);
      if (recipe.reset) {
        tracks.initial(recipe.reset.group, "opacity", 0);
        tracks.step(recipe.system, "opacity", recipe.reset.atFrame, 0);
        tracks.step(
          recipe.reset.group,
          "opacity",
          recipe.reset.atFrame,
          node(recipe.reset.group).opacity,
        );
      }
      break;
    case "category_swap":
      tracks.initial(recipe.subject, "state", recipe.fromState);
      tracks.step(recipe.subject, "state", recipe.swapFrame, recipe.toState);
      for (const id of recipe.stateLabels ?? []) {
        tracks.initial(id, "state", recipe.fromState);
        tracks.step(id, "state", recipe.swapFrame, recipe.toState);
      }
      break;
    case "motif_resolve":
      reveal(recipe.outgoing, recipe.resolve);
      break;
  }
  if ("moves" in recipe) {
    for (const move of recipe.moves) {
      tracks.add(move.node, "x", move.window, move.to.x);
      tracks.add(move.node, "y", move.window, move.to.y);
      if (move.to.rotation !== undefined)
        tracks.add(move.node, "rotation", move.window, move.to.rotation);
      if (move.to.scale !== undefined) {
        tracks.add(move.node, "scaleX", move.window, move.to.scale);
        tracks.add(move.node, "scaleY", move.window, move.to.scale);
      }
    }
    for (const event of recipe.emphasis)
      tracks.add(event.node, "opacity", event.window, event.opacity);
  }
  const durationMs = (input.frameCount * 1000) / input.fps;
  return {
    ...input,
    rendererVersion: "story-canvas-0.13.3",
    durationMs,
    canvas: { width: input.width, height: input.height },
    timeline: { fps: input.fps, frameCount: input.frameCount, durationMs },
    tracks: tracks.finish(),
    followers: {},
  };
}
