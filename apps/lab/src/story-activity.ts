import { sampleCurve } from "../../../packages/renderer-core/src/curve.ts";
import { evaluatePreparedNode } from "../../../packages/renderer-core/src/prepared-scene.ts";
import {
  isLayerActive,
  sampleDriver,
  sampleLayer,
} from "../../../packages/renderer-core/src/motion-craft.ts";
import { sampleStoryCamera } from "../../../packages/renderer-core/src/story-camera.ts";
import { sampleStoryFlow } from "../../../packages/renderer-core/src/story-flows.ts";
import type { StoryRenderScene } from "../../../packages/renderer-core/src/story-scene.ts";
import type { StoryRole } from "../../../packages/scene-contract/src/story-motion.ts";
import "./story-activity.css";

const roles: StoryRole[] = ["carrier", "action", "response", "current"];
const epsilon = 1e-6;
type Span = { start: number; end: number };
type MotionEvent = StoryRenderScene["motionEvents"][number];
type NodeState = ReturnType<typeof evaluatePreparedNode>;
type StateAt = (id: string, frame: number) => NodeState | undefined;

function differs(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number")
    return Math.abs(a - b) > epsilon;
  return a !== b;
}

function createStateSampler(scene: StoryRenderScene): StateAt {
  const nodes = new Map(scene.nodes.map((node) => [node.id, node]));
  const cache = new Map<string, Map<number, NodeState>>();
  return (id, frame) => {
    const node = nodes.get(id);
    if (!node) return undefined;
    let frames = cache.get(id);
    if (!frames) {
      frames = new Map();
      cache.set(id, frames);
    }
    let state = frames.get(frame);
    if (!state) {
      state = evaluatePreparedNode(scene, node, frame);
      frames.set(frame, state);
    }
    return state;
  };
}

function nodeChanged(
  stateAt: StateAt,
  id: string,
  frame: number,
  properties?: string[],
): boolean {
  const current = stateAt(id, frame);
  const previous = stateAt(id, frame - 1);
  if (!current || !previous) return false;
  const keys = properties?.length
    ? properties
    : [...new Set([...Object.keys(current), ...Object.keys(previous)])];
  return keys.some((key) =>
    differs(
      (current as Record<string, unknown>)[key],
      (previous as Record<string, unknown>)[key],
    ),
  );
}

function cameraChanged(scene: StoryRenderScene, frame: number): boolean {
  const current = sampleStoryCamera(scene, frame);
  const previous = sampleStoryCamera(scene, frame - 1);
  return (Object.keys(current) as (keyof typeof current)[]).some((key) =>
    differs(current[key], previous[key]),
  );
}

function flowChanged(
  scene: StoryRenderScene,
  event: MotionEvent,
  frame: number,
  stateAt: StateAt,
): boolean {
  const path = scene.nodes.find((node) => node.id === event.node);
  if (path?.type !== "path") return false;
  return scene.compiledFlows
    .filter(
      (flow) =>
        flow.path === event.node &&
        flow.window.start === event.window.start &&
        flow.window.end === event.window.end,
    )
    .some((flow) => {
      const tokens = (at: number) => {
        const state = stateAt(path.id, at)!;
        return sampleStoryFlow(
          flow,
          path,
          { reveal: state.reveal, gap: state.gap },
          at,
          scene.frameCount,
        );
      };
      return (
        JSON.stringify(tokens(frame)) !== JSON.stringify(tokens(frame - 1))
      );
    });
}

function flowSpeedChanged(
  scene: StoryRenderScene,
  event: MotionEvent,
  frame: number,
): boolean {
  return scene.compiledFlows
    .filter((flow) => flow.path === event.node)
    .some((flow) => {
      const current = flow.offsets[frame]! - flow.offsets[frame - 1]!;
      const previous =
        frame > 1
          ? flow.offsets[frame - 1]! - flow.offsets[frame - 2]!
          : current;
      return differs(current, previous);
    });
}

function eventChanged(
  scene: StoryRenderScene,
  event: MotionEvent,
  frame: number,
  stateAt: StateAt,
): boolean {
  if (frame < event.window.start || frame > event.window.end) return false;
  if (event.kind === "camera") return cameraChanged(scene, frame);
  if (event.kind === "flow") return flowChanged(scene, event, frame, stateAt);
  if (event.kind === "flow-speed") return flowSpeedChanged(scene, event, frame);
  if (scene.motionModel && (event.kind === "move" || event.kind === "emphasis"))
    return false;
  return nodeChanged(stateAt, event.node, frame, event.properties);
}

function layerChanged(
  scene: StoryRenderScene,
  layer: NonNullable<StoryRenderScene["compiledMotion"]>["layers"][number],
  frame: number,
  stateAt: StateAt,
): boolean {
  if (!nodeChanged(stateAt, layer.node, frame, [layer.property])) return false;
  const activeNow = isLayerActive(layer, frame);
  const activeBefore = isLayerActive(layer, frame - 1);
  if (activeNow !== activeBefore) return true;
  if (!activeNow) return false;
  if (
    differs(
      sampleLayer(layer, frame, scene.fps),
      sampleLayer(layer, frame - 1, scene.fps),
    )
  )
    return true;
  return Boolean(
    layer.weight &&
      differs(
        sampleCurve(layer.weight, frame, scene.fps),
        sampleCurve(layer.weight, frame - 1, scene.fps),
      ),
  );
}

function constraintChanged(
  stateAt: StateAt,
  withoutConstraintAt: StateAt,
  nodeId: string,
  frame: number,
): boolean {
  if (!nodeChanged(stateAt, nodeId, frame)) return false;
  const current = stateAt(nodeId, frame)!;
  const previous = stateAt(nodeId, frame - 1)!;
  const withoutCurrent = withoutConstraintAt(nodeId, frame)!;
  const withoutPrevious = withoutConstraintAt(nodeId, frame - 1)!;
  return Object.keys(current).some((property) => {
    const values = [current, previous, withoutCurrent, withoutPrevious].map(
      (state) => (state as Record<string, unknown>)[property],
    );
    return (
      values.every((value) => typeof value === "number") &&
      differs(values[0]! - values[2]!, values[1]! - values[3]!)
    );
  });
}

function activeFrames(scene: StoryRenderScene): Record<StoryRole, boolean[]> {
  const stateAt = createStateSampler(scene);
  const active = Object.fromEntries(
    roles.map((role) => [role, Array<boolean>(scene.frameCount).fill(false)]),
  ) as Record<StoryRole, boolean[]>;
  const drivers = scene.drivers ?? [];
  const previousDriverValues = drivers.map((driver) =>
    sampleDriver(scene, driver, 0),
  );
  const constraints = scene.constraints ?? [];
  const withoutConstraint = constraints.map((_, index) =>
    createStateSampler({
      ...scene,
      constraints: constraints.filter((_, candidate) => candidate !== index),
    }),
  );
  for (let frame = 1; frame < scene.frameCount; frame++) {
    for (const event of scene.motionEvents)
      if (eventChanged(scene, event, frame, stateAt))
        active[event.role][frame] = true;
    for (const layer of scene.compiledMotion?.layers ?? [])
      if (layerChanged(scene, layer, frame, stateAt))
        active[layer.layer][frame] = true;
    for (const [index, driver] of drivers.entries()) {
      const [node, property] = driver.target.split(".");
      const currentValue = sampleDriver(scene, driver, frame);
      if (
        nodeChanged(stateAt, node!, frame, [property!]) &&
        differs(currentValue, previousDriverValues[index])
      )
        active[driver.layer ?? "action"][frame] = true;
      previousDriverValues[index] = currentValue;
    }
    for (const [index, constraint] of constraints.entries())
      if (
        constraintChanged(
          stateAt,
          withoutConstraint[index]!,
          constraint.target,
          frame,
        )
      )
        active[constraint.layer ?? "response"][frame] = true;
  }
  return active;
}

function spansForFrames(frames: boolean[]): Span[] {
  const spans: Span[] = [];
  for (let frame = 1; frame < frames.length; frame++) {
    if (!frames[frame]) continue;
    const last = spans.at(-1);
    if (last?.end === frame) last.end++;
    else spans.push({ start: frame, end: frame + 1 });
  }
  return spans;
}

export function showStoryActivity(scene: StoryRenderScene) {
  const host = document.getElementById("story-activity")!;
  host.replaceChildren();
  host.hidden = false;
  const heading = document.createElement("h2");
  heading.textContent = "Layer activity";
  const note = document.createElement("p");
  note.textContent =
    "Colour marks a change from the previous frame in each compiled motion layer. The line follows the preview frame.";
  host.append(heading, note);
  const activity = activeFrames(scene);
  for (const role of roles) {
    const row = document.createElement("div");
    row.className = "story-activity-row";
    const label = document.createElement("span");
    label.textContent = role;
    const track = document.createElement("div");
    track.className = `story-activity-track story-activity-${role}`;
    track.dataset.role = role;
    track.setAttribute("role", "img");
    const spans = spansForFrames(activity[role]);
    track.setAttribute(
      "aria-label",
      spans.length
        ? `${role} activity: ${spans.map(({ start, end }) => `frames ${start}–${end - 1}`).join(", ")}`
        : `${role}: no compiled activity`,
    );
    for (const { start, end } of spans) {
      const segment = document.createElement("span");
      segment.className = "story-activity-segment";
      segment.dataset.start = String(start);
      segment.dataset.end = String(end);
      segment.style.left = `${(start / scene.frameCount) * 100}%`;
      segment.style.width = `${((end - start) / scene.frameCount) * 100}%`;
      track.append(segment);
    }
    row.append(label, track);
    host.append(row);
  }
}

export function setStoryActivityFrame(frame: number, frameCount: number) {
  const host = document.getElementById("story-activity")!;
  host.style.setProperty(
    "--activity-position",
    `${((frame + 0.5) / frameCount) * 100}%`,
  );
}
