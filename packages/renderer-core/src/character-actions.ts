import type { StoryScene } from "../../scene-contract/src/story.ts";
import type {
  PassagePlan,
  TimingBinding,
} from "../../scene-contract/src/story-authoring.ts";
import type { CharacterAction } from "../../scene-contract/src/character-actions.ts";
import { indexStoryEvents } from "./story-event-index.ts";
import { passageError } from "./passage-diagnostics.ts";

type Beat = Extract<
  PassagePlan,
  { schemaVersion: "story-passage-2" }
>["beats"][number];
export function expandCharacterActions(scene: StoryScene, beat: Beat) {
  const tracks = structuredClone(beat.poseTracks ?? {});
  const bindings: Record<string, TimingBinding> = {};
  const used = new Set([
    ...indexStoryEvents(scene).map((e) => e.id),
    ...Object.values(tracks).flatMap((t) => t.changes.map((c) => c.id)),
  ]);
  const bind = (id: string, binding: TimingBinding) => {
    if (used.has(id) || beat.bindings[id] || beat.timing[id])
      passageError(
        "action-ownership",
        "Conflicting action/prop event ownership: " + id,
        { event: id },
      );
    used.add(id);
    bindings[id] = binding;
  };
  for (const action of beat.actions ?? []) {
    const actor = scene.nodes.find((n) => n.id === action.actor);
    if (actor?.type !== "image" || actor.states.some((s) => !s.pose))
      passageError(
        "action-target",
        "Action requires a named character: " + action.actor,
      );
    const track = (tracks[action.actor] ??= {
      initial: actor.states[0]!.pose!,
      changes: [],
    });
    bind(action.id, {
      anchor: action.anchor,
      offset: action.offset,
      duration: action.durationFrames,
    });
    (scene.characterActions ??= []).push({
      node: action.actor,
      kind: action.kind,
      window: { cue: action.id, start: 0, end: action.durationFrames },
    });
    const pose = (name: string, offset: number, suffix: string) => {
      const id = action.id + "-" + suffix;
      if (used.has(id) || beat.bindings[id] || beat.timing[id])
        passageError(
          "action-ownership",
          "Conflicting generated pose ID: " + id,
        );
      used.add(id);
      track.changes.push({
        id,
        pose: name,
        anchor: { type: "event", id: action.id, edge: "start" },
        offset,
        blendFrames: 0,
      });
    };
    if (action.kind === "walk") {
      const count = Math.ceil(action.durationFrames / action.stepFrames);
      if (count + (action.finishPose ? 1 : 0) > 40)
        passageError(
          "action-limit",
          "Walk exceeds 40 pose changes; increase step spacing or shorten the action",
        );
      for (let i = 0; i < count; i++)
        pose(action.poses[i % 2]!, i * action.stepFrames, "pose-" + (i + 1));
    } else pose(action.pose, 0, "pose-1");
    if (action.finishPose)
      pose(action.finishPose, action.durationFrames, "settle");
    if (action.to) {
      const id = action.id + "-move";
      bind(id, {
        anchor: { type: "event", id: action.id, edge: "start" },
        offset: 0,
        duration: action.durationFrames,
      });
      scene.recipe.moves.push({
        node: action.actor,
        window: {
          cue: id,
          start: 0,
          end: action.durationFrames,
          easing: action.kind === "walk" ? "linear" : "in-out-cubic",
        },
        to: { x: action.to[0], y: action.to[1] },
      });
    }
  }
  for (const [target, track] of Object.entries(beat.propTracks ?? {})) {
    if (scene.propAttachments?.some((p) => p.target === target))
      passageError(
        "prop-ownership",
        "Conflicting prop track ownership: " + target,
      );
    (scene.propAttachments ??= []).push({
      target,
      grip: track.grip,
      initial: track.initial,
      changes: track.changes.map((change, i) => {
        bind(change.id, {
          anchor: change.anchor,
          offset: change.offset,
          duration: 0,
        });
        return {
          id: change.id,
          hold: change.hold,
          transitionFrames: change.transitionFrames,
          frame: i,
        };
      }),
    });
  }
  return { tracks, bindings };
}

export function validateBeatActingWindows(scene: StoryScene, beat: Beat) {
  for (const track of scene.propAttachments ?? []) {
    track.changes.sort((a, b) => a.frame - b.frame);
    for (const cut of track.changes)
      if (cut.frame + cut.transitionFrames >= beat.frameCount)
        passageError("prop-range", "Prop transition outside beat: " + cut.id, {
          event: cut.id,
        });
  }
  const actions = [...(scene.characterActions ?? [])].sort(
    (a, b) => a.window.start - b.window.start,
  );
  for (const [i, action] of actions.entries()) {
    if (
      action.window.end <= action.window.start ||
      action.window.end >= beat.frameCount
    )
      passageError("action-range", "Action outside beat: " + action.window.cue);
    if (
      actions
        .slice(0, i)
        .some(
          (other) =>
            other.node === action.node &&
            other.window.end > action.window.start,
        )
    )
      passageError(
        "action-overlap",
        "Overlapping character actions on " + action.node,
      );
    const manual = beat.poseTracks?.[action.node]?.changes ?? [];
    const events = indexStoryEvents(scene);
    if (
      manual.some((c) => {
        const f = events.find((e) => e.id === c.id)!.start;
        return f >= action.window.start && f < action.window.end;
      })
    )
      passageError(
        "action-overlap",
        "Manual pose change overlaps an action on " + action.node,
      );
  }
}

export function characterActionEventIds(action: CharacterAction): string[] {
  const count =
    action.kind === "walk"
      ? Math.ceil(action.durationFrames / action.stepFrames)
      : 1;
  return [
    action.id,
    ...Array.from({ length: count }, (_, i) => `${action.id}-pose-${i + 1}`),
    ...(action.finishPose ? [action.id + "-settle"] : []),
    ...(action.to ? [action.id + "-move"] : []),
  ];
}
