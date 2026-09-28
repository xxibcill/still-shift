import type { StoryScene } from "../../scene-contract/src/story.ts";
import type { PreparedImage } from "../../scene-contract/src/prepared.ts";
import type {
  PassagePlan,
  TimingBinding,
} from "../../scene-contract/src/story-authoring.ts";
import { ComponentDataV2Schema } from "../../scene-contract/src/component-data.ts";
import { indexStoryEvents } from "./story-event-index.ts";
import { passageError } from "./passage-diagnostics.ts";
import { expandCharacterActions } from "./character-actions.ts";

type Beat = Extract<
  PassagePlan,
  { schemaVersion: "story-passage-2" }
>["beats"][number];

/** Lower authored pose tracks into the existing shared state/timing compiler. */
export function applyStoryActing(
  scene: StoryScene,
  beat: Beat,
): Record<string, TimingBinding> {
  for (const [id, container] of Object.entries(beat.textContainers ?? {})) {
    const node = scene.nodes.find((n) => n.id === id);
    if (node?.type !== "text")
      passageError(
        "container-target",
        "Container must reference a text node: " + id,
        { node: id },
      );
    if (container) node.container = structuredClone(container);
    else delete node.container;
  }
  const expanded = expandCharacterActions(scene, beat);
  const bindings: Record<string, TimingBinding> = expanded.bindings;
  const events = new Set(indexStoryEvents(scene).map((event) => event.id));
  for (const [id, track] of Object.entries(expanded.tracks)) {
    const node = scene.nodes.find((n) => n.id === id);
    if (node?.type !== "image" || node.states.some((state) => !state.pose))
      passageError(
        "pose-target",
        "Character pose track requires named image poses: " + id,
        { node: id },
      );
    const stateIndex = (pose: string) => {
      const index = node.states.findIndex((state) => state.pose === pose);
      if (index < 0)
        passageError("missing-pose", `Unknown pose ${pose} on ${id}`, {
          node: id,
        });
      return index;
    };
    if (
      !scene.componentData ||
      scene.componentData.schemaVersion === "scene-components-1"
    )
      scene.componentData = structuredClone(
        ComponentDataV2Schema.parse({
          ...scene.componentData,
          schemaVersion: "scene-components-2",
        }),
      );
    if (scene.componentData.states.some((state) => state.target === id))
      passageError(
        "pose-ownership",
        "Conflicting pose/state ownership: " + id,
        { node: id },
      );
    const scheduleId = `${id}-pose-track`;
    if (scene.componentData.states.some((state) => state.id === scheduleId))
      passageError(
        "pose-ownership",
        "Conflicting pose schedule identity: " + scheduleId,
      );
    scene.componentData.states.push({
      id: scheduleId,
      target: id,
      initial: stateIndex(track.initial),
      cuts: track.changes.map((change, index) => {
        if (
          events.has(change.id) ||
          bindings[change.id] ||
          beat.bindings[change.id] ||
          beat.timing[change.id]
        )
          passageError(
            "pose-ownership",
            "Conflicting pose event/timing ownership: " + change.id,
            { event: change.id },
          );
        events.add(change.id);
        bindings[change.id] = {
          anchor: change.anchor,
          offset: change.offset,
          duration: 0,
        };
        return {
          id: change.id,
          frame: index,
          state: stateIndex(change.pose),
          ...(change.blendFrames ? { ramp: change.blendFrames } : {}),
        };
      }),
    });
  }
  return bindings;
}

export function sortCharacterPoseCuts(scene: StoryScene, beat: Beat) {
  if (
    !scene.componentData ||
    scene.componentData.schemaVersion === "scene-components-1"
  )
    return;
  for (const schedule of scene.componentData.states)
    if (
      beat.poseTracks?.[schedule.target] ||
      beat.actions?.some((a) => a.actor === schedule.target)
    )
      schedule.cuts.sort((a, b) => a.frame - b.frame);
}

export function characterPoseBrief(
  node: PreparedImage,
  assets: StoryScene["assets"],
) {
  const reference = assets.find((asset) => asset.id === node.states[0]!.asset);
  const poses = node.states.flatMap((state) =>
    state.pose ? [state.pose] : [],
  );
  return `# Character pose generation brief: ${node.id}\n\nIdentity reference: ${reference?.path ?? node.states[0]!.asset}\nReference canvas: ${reference?.width ?? "unknown"} × ${reference?.height ?? "unknown"}.\n\nGenerate one image per pose below using the same identity reference. Preserve face, costume, proportions, lighting, drawing style and full-body scale. Use a genuinely transparent background. Keep the entire head, hands and shoes visible with margin. Keep a consistent foot baseline and neutral camera; no baked-in captions, scenery or props that move separately. Do not rasterize vector placeholders.\n\n${(poses.length ? poses : ["rest", "inspect", "reach", "gesture", "step-a", "step-b"]).map((pose) => `- ${pose}: ${pose.replaceAll("-", " ")}.`).join("\n")}\n\nInspect identity and silhouette consistency before use. Register each saved asset as a named image state; set registration.anchor to its normalized foot midpoint/baseline if framing differs. Use cue-linked pose tracks for timing; short blends are optional. This brief does not call an image provider.\n`;
}
