import { compileStoryFlows, type CompiledStoryFlow } from "./story-flows.ts";
import {
  compileEntrance,
  compileExit,
  compileMove,
  entrancePolicy,
} from "./story-choreography.ts";
import type { StoryRole } from "../../scene-contract/src/story-motion.ts";
import { validateStoryCameraCoverage } from "./story-camera.ts";
import type { PreparedNode } from "../../scene-contract/src/prepared.ts";
import type {
  StoryScene,
  StoryWindow,
} from "../../scene-contract/src/story.ts";
import type { Key, Property, Tracks } from "./prepared-scene.ts";

type StoryMotionEventKind =
  | "camera"
  | "emphasis"
  | "entrance"
  | "exit"
  | "flow"
  | "flow-speed"
  | "fracture"
  | "move"
  | "narrow"
  | "pinch"
  | "reset"
  | "reveal"
  | "strain"
  | "swap";

export type StoryRenderScene = StoryScene & {
  rendererVersion: "story-canvas-0.13.3" | "story-canvas-0.14.0";
  durationMs: number;
  canvas: { width: number; height: number };
  timeline: { fps: number; durationMs: number; frameCount: number };
  tracks: Record<string, Tracks>;
  followers: Record<string, never>;
  compiledFlows: CompiledStoryFlow[];
  motionEvents: {
    node: string;
    window: StoryWindow;
    role: StoryRole;
    kind: StoryMotionEventKind;
  }[];
};
type Event = {
  start: number;
  end: number;
  value: number;
  relative?: boolean;
  step?: boolean;
  easing?: StoryWindow["easing"];
};

const baseValue = (node: PreparedNode, property: Property) => {
  if (property === "scaleX" || property === "scaleY" || property === "reveal")
    return 1;
  if (
    property === "state" ||
    property === "gap" ||
    property === "pulse" ||
    property === "pinch"
  )
    return 0;
  return node[property];
};

function createTracks(nodes: PreparedNode[]) {
  const properties = new Map<
    string,
    Map<Property, { initial: number; events: Event[] }>
  >();
  const get = (id: string, property: Property) => {
    let tracks = properties.get(id);
    if (!tracks) {
      tracks = new Map();
      properties.set(id, tracks);
    }
    let track = tracks.get(property);
    if (!track) {
      const node = nodes.find((node) => node.id === id);
      if (!node) throw new Error(`Missing story role ${id}`);
      track = { initial: baseValue(node, property), events: [] };
      tracks.set(property, track);
    }
    return track;
  };
  return {
    initial(id: string, property: Property, value: number) {
      get(id, property).initial = value;
    },
    add(id: string, property: Property, window: StoryWindow, value: number) {
      get(id, property).events.push({
        start: window.start,
        end: window.end,
        value,
        ...(window.easing ? { easing: window.easing } : {}),
      });
    },
    addRelative(
      id: string,
      property: Property,
      window: StoryWindow,
      delta: number,
    ) {
      get(id, property).events.push({
        start: window.start,
        end: window.end,
        value: delta,
        relative: true,
        ...(window.easing ? { easing: window.easing } : {}),
      });
    },
    step(id: string, property: Property, at: number, value: number) {
      if (at === 0) get(id, property).initial = value;
      else
        get(id, property).events.push({
          start: at,
          end: at,
          value,
          step: true,
        });
    },
    finish(): Record<string, Tracks> {
      return Object.fromEntries(
        [...properties].map(([id, properties]) => [
          id,
          Object.fromEntries(
            [...properties].map(([property, track]) => {
              const keys: Key[] = [{ time: 0, value: track.initial }];
              let previousEnd = -1;
              for (const event of track.events.sort(
                (a, b) => a.start - b.start,
              )) {
                if (
                  event.start < previousEnd ||
                  (event.step && event.start === previousEnd)
                )
                  throw new Error(
                    `Conflicting story events on ${id}.${property}`,
                  );
                const last = keys.at(-1)!;
                if (!event.step && event.start > last.time)
                  keys.push({ time: event.start, value: last.value });
                keys.push({
                  time: event.end,
                  value: event.relative
                    ? last.value + event.value
                    : event.value,
                  ...(event.step ? { step: true } : {}),
                  ...(event.easing ? { easing: event.easing } : {}),
                });
                previousEnd = event.end;
              }
              return [property, keys];
            }),
          ),
        ]),
      );
    },
  };
}

export type StoryTracks = ReturnType<typeof createTracks>;

export function compileStoryScene(source: StoryScene): StoryRenderScene {
  const input = { ...source, nodes: source.nodes.map((n) => ({ ...n })) };
  const events: StoryRenderScene["motionEvents"] = [];
  const event = (
    node: string,
    window: StoryWindow,
    kind: StoryMotionEventKind,
    role: StoryRole = "action",
  ) => events.push({ node, window, kind, role: window.role ?? role });
  const tracks = createTracks(input.nodes);
  const node = (id: string) => input.nodes.find((node) => node.id === id)!;
  const enter = (id: string, window: StoryWindow) => {
    if (input.recipe.entrances?.some((e) => e.node === id)) return;
    const policy = entrancePolicy(
      input,
      node(id),
      input.motionGrammar === "v2" ? undefined : "fade",
    );
    compileEntrance(tracks, input.nodes, {
      node: id,
      window,
      verb: policy.verb,
    });
    event(id, window, "entrance", policy.role);
  };
  const reveal = (id: string, window: StoryWindow) => {
    if (
      input.recipe.entrances?.some(
        (entrance) =>
          entrance.node === id &&
          entrancePolicy(
            input,
            node(id),
            entrance.verb ??
              (input.motionGrammar === "v2" ? undefined : "fade"),
          ).verb === "draw",
      )
    )
      return;
    tracks.initial(id, "reveal", 0);
    tracks.add(id, "reveal", window, 1);
    event(id, window, "reveal");
  };
  const recipe = input.recipe;
  switch (recipe.preset) {
    case "unequal_margins":
      for (const pressure of recipe.pressures) {
        event(pressure.node, recipe.strain, "strain");
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
        enter(id, recipe.sidesEnter ?? recipe.reveal);
        event(id, recipe.narrow, "narrow");
      });
      for (const id of recipe.connections) reveal(id, recipe.reveal);
      if (recipe.pinch) {
        tracks.add(
          recipe.pinch.path,
          "pinch",
          recipe.pinch.window,
          recipe.pinch.amount,
        );
        event(recipe.pinch.path, recipe.pinch.window, "pinch");
      }
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
      for (const fracture of recipe.breaks) {
        tracks.add(fracture.path, "gap", fracture.window, 1);
        event(fracture.path, fracture.window, "fracture");
      }
      if (recipe.reset) {
        event(
          recipe.reset.group,
          { start: recipe.reset.atFrame, end: recipe.reset.atFrame },
          "reset",
        );
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
      event(
        recipe.subject,
        { start: recipe.swapFrame, end: recipe.swapFrame },
        "swap",
      );
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
  for (const entrance of [...(recipe.entrances ?? [])].sort(
    (a, b) => a.window.start - b.window.start,
  )) {
    const subsequent = events.some(
      (e) => e.node === entrance.node && e.kind === "entrance",
    );
    const policy = entrancePolicy(
      input,
      node(entrance.node),
      entrance.verb ?? (input.motionGrammar === "v2" ? undefined : "fade"),
    );
    compileEntrance(
      tracks,
      input.nodes,
      { ...entrance, verb: policy.verb },
      subsequent,
    );
    event(entrance.node, entrance.window, "entrance", policy.role);
  }
  for (const exit of recipe.exits ?? []) {
    compileExit(tracks, input.nodes, exit);
    event(exit.node, exit.window, "exit");
  }
  for (const move of recipe.moves) {
    compileMove(tracks, move);
    const window = move.window ?? {
      start: move.keys![0]!.frame,
      end: move.keys!.at(-1)!.frame,
    };
    event(
      move.node,
      window,
      "move",
      move.role ?? (window.easing === "out-back-soft" ? "response" : "action"),
    );
  }
  for (const emphasis of recipe.emphasis) {
    tracks.add(emphasis.node, "opacity", emphasis.window, emphasis.opacity);
    event(emphasis.node, emphasis.window, "emphasis", "response");
  }
  if (input.camera)
    event(
      "camera",
      { start: 0, end: input.frameCount - 1 },
      "camera",
      "carrier",
    );
  for (const flow of input.flows ?? []) {
    event(flow.path, flow.window, "flow", "current");
    for (let i = 1; i < flow.speed.length; i++) {
      const before = flow.speed[i - 1]!,
        after = flow.speed[i]!;
      const start = Math.max(before.frame, flow.window.start);
      const end = Math.min(after.frame, flow.window.end - 1);
      if (before.pxPerFrame !== after.pxPerFrame && end > start)
        event(
          flow.path,
          { start, end },
          "flow-speed",
          flow.window.role ?? "response",
        );
    }
  }
  const durationMs = (input.frameCount * 1000) / input.fps;
  const scene: StoryRenderScene = {
    ...input,
    rendererVersion:
      input.motionGrammar === "v2"
        ? "story-canvas-0.14.0"
        : "story-canvas-0.13.3",
    durationMs,
    canvas: { width: input.width, height: input.height },
    timeline: { fps: input.fps, frameCount: input.frameCount, durationMs },
    tracks: tracks.finish(),
    followers: {},
    motionEvents: events,
    compiledFlows: compileStoryFlows(input.flows ?? [], input.frameCount),
  };
  validateStoryCameraCoverage(scene);
  return scene;
}
