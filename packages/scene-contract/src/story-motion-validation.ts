import type { PreparedNode } from "./prepared.ts";
import type { StoryScene } from "./story.ts";

export function validateContinuousStory(
  scene: StoryScene,
  nodes: Map<string, PreparedNode>,
  fail: (message: string) => void,
) {
  const within = (frame: number) => {
    if (frame >= scene.frameCount)
      fail("Event frame must be inside the rendered timeline");
  };
  const increasing = (keys: { frame: number }[]) =>
    keys.forEach((key, i) => {
      within(key.frame);
      if (i && key.frame <= keys[i - 1]!.frame)
        fail("Key frames must be strictly increasing");
    });
  const camera = scene.camera;
  if (camera) {
    increasing(camera.keys);
    if (
      camera.keys[0]!.frame !== 0 ||
      camera.keys.at(-1)!.frame !== scene.frameCount - 1
    )
      fail("Camera keys must span frame 0 through frameCount-1");
    for (const id of [...Object.keys(camera.depth), ...(camera.cover ?? [])])
      if (!nodes.has(id) || nodes.get(id)!.parent)
        fail(`Camera depth/cover requires a root node: ${id}`);
    for (const jolt of camera.jolts ?? []) {
      within(jolt.frame);
      if (scene.recipe.preset !== "dated_system_break")
        fail("Camera jolt is reserved for dated_system_break");
    }
  }
  for (const event of [
    ...(scene.recipe.entrances ?? []),
    ...(scene.recipe.exits ?? []),
  ]) {
    const node = nodes.get(event.node);
    if (!node) fail(`Missing choreography node ${event.node}`);
    within(event.window.start);
    within(event.window.end);
    const verb = event.verb;
    if ((verb === "draw" || verb === "retract") && node?.type !== "path")
      fail(`${verb} requires a path`);
    if ((verb === "attach" || verb === "rise") && node?.type !== "text")
      fail(`${verb} requires text`);
    if (
      (verb === "wipe" || verb === "wipe-out") &&
      node?.type !== "text" &&
      node?.type !== "rect"
    )
      fail(`${verb} requires text or a rectangle`);
    if (verb === "set-down" && node?.type !== "image" && node?.type !== "group")
      fail("set-down requires an image or group");
    if (verb === "assemble" && "parts" in event) {
      if (node?.type !== "group") fail("assemble requires a group");
      for (const part of event.parts ?? []) {
        if (nodes.get(part.node)?.parent !== event.node)
          fail("Assembled parts must be direct children");
        if (part.offset >= event.window.end - event.window.start)
          fail("Part stagger exceeds assemble window");
      }
    }
  }
  const flows = new Set<string>();
  for (const flow of scene.flows ?? []) {
    if (flows.has(flow.id)) fail("Flow IDs must be unique");
    flows.add(flow.id);
    if (nodes.get(flow.path)?.type !== "path")
      fail(`Flow requires path ${flow.path}`);
    within(flow.window.start);
    if (flow.window.end > scene.frameCount)
      fail("Flow window exceeds timeline");
    increasing(flow.speed);
    increasing(flow.colorStates ?? []);
  }
  if (scene.recipe.preset === "access_constraint") {
    const { pinch, sidesEnter } = scene.recipe;
    if (pinch) {
      if (
        nodes.get(pinch.path)?.type !== "path" ||
        pinch.path !== scene.recipe.route
      )
        fail("Pinch must bind the restricted route");
      within(pinch.window.start);
      within(pinch.window.end);
    }
    if (sidesEnter) {
      within(sidesEnter.start);
      within(sidesEnter.end);
    }
  }
}
