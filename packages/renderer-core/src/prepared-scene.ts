import type {
  PreparedScene,
  PreparedNode,
  PreparedPath,
} from "../../scene-contract/src/prepared.ts";
import type { CinematicScene } from "../../scene-contract/src/cinematic.ts";
import type { StoryScene } from "../../scene-contract/src/story.ts";
import { compileStoryScene, type StoryRenderScene } from "./story-scene.ts";
import {
  compileCinematicScene,
  projectCinematicNode,
  type CinematicRenderScene,
} from "./cinematic-scene.ts";

export const ILLUSTRATED_RENDERER_VERSION = "illustrated-canvas-0.12.0";
export type Key = { time: number; value: number; step?: boolean };
export type Property =
  | "x"
  | "y"
  | "scaleX"
  | "scaleY"
  | "rotation"
  | "opacity"
  | "reveal"
  | "gap"
  | "state"
  | "pulse";
export type Tracks = Partial<Record<Property, Key[]>>;
export type LegacyIllustratedScene = PreparedScene & {
  rendererVersion: typeof ILLUSTRATED_RENDERER_VERSION;
  canvas: { width: number; height: number };
  timeline: { fps: number; durationMs: number; frameCount: number };
  tracks: Record<string, Tracks>;
  followers: Record<string, { path: string; keys: Key[] }>;
};
export type IllustratedScene =
  | LegacyIllustratedScene
  | CinematicRenderScene
  | StoryRenderScene;
export const sampleTrack = (keys: Key[], time: number): number => {
  if (time <= keys[0]!.time) return keys[0]!.value;
  for (let i = 1; i < keys.length; i++) {
    const end = keys[i]!;
    const start = keys[i - 1]!;
    if (time < end.time) {
      if (end.step) return start.value;
      const p = (time - start.time) / (end.time - start.time);
      return start.value + (end.value - start.value) * p * p * (3 - 2 * p);
    }
  }
  return keys.at(-1)!.value;
};
export const pathLength = (points: number[][]): number =>
  points
    .slice(1)
    .reduce(
      (sum, p, i) =>
        sum + Math.hypot(p[0]! - points[i]![0]!, p[1]! - points[i]![1]!),
      0,
    );
export const pointOnPath = (
  path: PreparedPath,
  progress: number,
): [number, number] => {
  let distance = pathLength(path.points) * Math.max(0, Math.min(1, progress));
  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1]!;
    const b = path.points[i]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (distance <= length && length > 0)
      return [
        a[0] + ((b[0] - a[0]) * distance) / length,
        a[1] + ((b[1] - a[1]) * distance) / length,
      ];
    distance -= length;
  }
  return path.points.at(-1)!;
};

export function compilePreparedScene(
  input: PreparedScene,
): LegacyIllustratedScene;
export function compilePreparedScene(
  input: CinematicScene,
): CinematicRenderScene;
export function compilePreparedScene(input: StoryScene): StoryRenderScene;
export function compilePreparedScene(
  input: PreparedScene | CinematicScene | StoryScene,
): IllustratedScene;
export function compilePreparedScene(
  input: PreparedScene | CinematicScene | StoryScene,
): IllustratedScene {
  if (input.schemaVersion === "story-scene-1") return compileStoryScene(input);
  if (input.schemaVersion === "illustrated-scene-2")
    return compileCinematicScene(input);
  const scene: LegacyIllustratedScene = {
    ...input,
    rendererVersion: ILLUSTRATED_RENDERER_VERSION,
    canvas: { width: input.width, height: input.height },
    timeline: {
      fps: input.fps,
      durationMs: input.durationMs,
      frameCount: (input.fps * input.durationMs) / 1000,
    },
    tracks: {},
    followers: {},
  };
  const node = (id: string) => input.nodes.find((n) => n.id === id)!;
  const track = (
    id: string,
    property: Property,
    keys: [number, number, boolean?][],
  ) => {
    if (!Object.hasOwn(scene.tracks, id)) scene.tracks[id] = {};
    scene.tracks[id]![property] = keys.map(([time, value, step]) => ({
      time: (time * input.durationMs) / 7000,
      value,
      ...(step ? { step } : {}),
    }));
  };
  const enter = (id: string, at: number, duration = 500) =>
    track(id, "opacity", [
      [0, 0],
      [at, 0],
      [at + duration, 1],
    ]);
  const follow = (id: string, path: string, keys: [number, number][]) => {
    scene.followers[id] = {
      path,
      keys: keys.map(([time, value]) => ({
        time: (time * input.durationMs) / 7000,
        value,
      })),
    };
  };
  const recipe = input.recipe;
  switch (recipe.preset) {
    case "chronicle_reveal":
      track(recipe.foreground, "x", [
        [0, node(recipe.foreground).x],
        [1200, node(recipe.foreground).x],
        [2100, node(recipe.foreground).x + recipe.travel],
      ]);
      track(recipe.middle, "x", [
        [0, node(recipe.middle).x],
        [1200, node(recipe.middle).x],
        [2100, node(recipe.middle).x - recipe.travel / 4],
      ]);
      enter(recipe.reveal, 3800, 600);
      break;
    case "resource_flow":
      recipe.branches.forEach((branch, i) => {
        const start =
          1000 + i * (2700 / Math.max(1, recipe.branches.length - 1));
        track(branch.path, "reveal", [
          [0, 0],
          [start, 0],
          [start + 600, 1],
        ]);
        enter(branch.destination, start + 200, 400);
        enter(branch.token, start + 600, 80);
        follow(branch.token, branch.path, [
          [0, 0],
          [start + 600, 0],
          [start + 1300, 1],
        ]);
      });
      break;
    case "access_pressure":
      track(recipe.route, "reveal", [
        [0, 0],
        [1000, 0],
        [1700, 1],
      ]);
      track(recipe.route, "gap", [
        [0, 0],
        [3000, 0],
        [3500, 1],
      ]);
      enter(recipe.barrier, 3000);
      enter(recipe.token, 1100, 200);
      follow(recipe.token, recipe.route, [
        [0, 0],
        [3500, 0],
        [4300, recipe.stopAt],
      ]);
      break;
    case "comparison_build":
      recipe.panels.forEach((id, i) => {
        track(id, "x", [
          [0, (input.width - node(id).width) / 2],
          [1200, (input.width - node(id).width) / 2],
          [2000, node(id).x],
        ]);
        if (i === 1) enter(id, 1200, 800);
      });
      recipe.variables.forEach((id, i) =>
        track(id, "scaleX", [
          [0, 1],
          [3300, 1],
          [4200, recipe.remaining[i]!],
        ]),
      );
      break;
    case "pose_prop_change": {
      const actor = node(recipe.actor);
      const count = actor.type === "image" ? actor.states.length : 2;
      track(
        recipe.actor,
        "state",
        count > 2
          ? [
              [0, 0],
              [1500, 1, true],
              [3700, count - 1, true],
            ]
          : [
              [0, 0],
              [3700, 1, true],
            ],
      );
      track(recipe.prop, "x", [
        [0, node(recipe.prop).x],
        [1500, node(recipe.prop).x],
        [2100, (node(recipe.prop).x + recipe.target[0]) / 2],
        [3150, (node(recipe.prop).x + recipe.target[0]) / 2],
        [3700, recipe.target[0]],
      ]);
      track(recipe.prop, "y", [
        [0, node(recipe.prop).y],
        [1500, node(recipe.prop).y],
        [2100, node(recipe.prop).y - 70],
        [3150, node(recipe.prop).y - 70],
        [3700, recipe.target[1]],
      ]);
      track(recipe.prop, "rotation", [
        [0, 0],
        [1500, 0],
        [2100, -18],
        [3150, -18],
        [3700, 0],
      ]);
      track(recipe.prop, "opacity", [
        [0, 1],
        [3700, 0, true],
      ]);
      break;
    }
    case "crisis_fracture":
      recipe.paths.forEach((id, i) => {
        const start = 1500 + (i * 1700) / (recipe.paths.length - 1);
        track(id, "gap", [
          [0, 0],
          [start, 0],
          [start + 600, 1],
        ]);
        track(id, "pulse", [
          [0, 0],
          [start, 0],
          [start + 100, 1],
          [start + 400, 0],
        ]);
      });
      recipe.panels.forEach((id, i) => {
        const direction = i % 2 === 0 ? -1 : 1;
        track(id, "x", [
          [0, node(id).x],
          [3200, node(id).x],
          [3900, node(id).x + direction * 28],
        ]);
        track(id, "rotation", [
          [0, node(id).rotation],
          [3200, node(id).rotation],
          [3900, node(id).rotation + direction * 1.2],
        ]);
      });
      break;
  }
  return scene;
}

export function evaluatePreparedNode(
  scene: IllustratedScene,
  node: PreparedNode,
  frame: number,
) {
  if (
    !Number.isInteger(frame) ||
    frame < 0 ||
    frame >= scene.timeline.frameCount
  )
    throw new Error("Frame index outside illustrated timeline");
  const time =
    scene.schemaVersion === "story-scene-1"
      ? frame
      : (frame * 1000) / scene.fps;
  const state = {
    x: node.x,
    y: node.y,
    rotation: node.rotation,
    scaleX: 1,
    scaleY: 1,
    opacity: node.opacity,
    reveal: 1,
    gap: 0,
    state: 0,
    pulse: 0,
  };
  if (scene.schemaVersion === "illustrated-scene-2") {
    if (node.type !== "image")
      throw new Error("Cinematic plane must be an image");
    const projected = projectCinematicNode(scene, node, frame);
    return {
      ...state,
      x: projected.left + (projected.scale - 1) * node.width * node.origin[0],
      y: projected.top + (projected.scale - 1) * node.height * node.origin[1],
      scaleX: projected.scale,
      scaleY: projected.scale,
    };
  }
  const tracks = Object.hasOwn(scene.tracks, node.id)
    ? scene.tracks[node.id]!
    : {};
  for (const [property, keys] of Object.entries(tracks))
    state[property as Property] = sampleTrack(keys, time);
  const follower = Object.hasOwn(scene.followers, node.id)
    ? scene.followers[node.id]
    : undefined;
  if (follower) {
    const path = scene.nodes.find(
      (item) => item.id === follower.path,
    ) as PreparedPath;
    const [x, y] = pointOnPath(path, sampleTrack(follower.keys, time));
    state.x = x + path.x - node.width / 2;
    state.y = y + path.y - node.height / 2;
  }
  return state;
}
