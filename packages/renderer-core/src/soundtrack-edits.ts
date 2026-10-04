import { z } from "zod";
import {
  SoundtrackAutomationSchema,
  SoundtrackStateSchema,
  validateSoundtrackProject,
  soundtrackFail,
  type SoundtrackProject,
  type SoundtrackState,
} from "@still-shift/scene-contract";
const identifier = z.string();
export const SoundtrackEditSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("gain"),
      target: identifier,
      gainDb: z.number(),
      kind: z.enum(["clip", "track", "bus", "master"]).optional(),
    })
    .strict(),
  z
    .object({ type: z.literal("mute"), track: identifier, value: z.boolean() })
    .strict(),
  z
    .object({ type: z.literal("solo"), track: identifier, value: z.boolean() })
    .strict(),
  z
    .object({
      type: z.literal("move"),
      clip: identifier,
      startSample: z.number().int(),
      offsetSamples: z.number().int().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("trim"),
      clip: identifier,
      sourceStartSample: z.number().int(),
      sourceEndSample: z.number().int(),
    })
    .strict(),
  z
    .object({
      type: z.literal("automation"),
      clip: identifier,
      automation: SoundtrackAutomationSchema,
    })
    .strict(),
  z.object({ type: z.literal("undo") }).strict(),
  z.object({ type: z.literal("redo") }).strict(),
]);
export type SoundtrackEdit = z.infer<typeof SoundtrackEditSchema>;
export function soundtrackState(project: SoundtrackProject): SoundtrackState {
  return SoundtrackStateSchema.parse(
    Object.fromEntries(
      Object.entries(project).filter(
        ([key]) => key in SoundtrackStateSchema.shape,
      ),
    ),
  );
}
const sameState = (a: SoundtrackState, b: SoundtrackState) =>
  JSON.stringify(a) === JSON.stringify(b);
/**
 * One request is one undoable action: every operation between history commands
 * shares a single undo entry, and only the resulting state must be valid.
 */
export function editSoundtrackProject(
  input: SoundtrackProject,
  operations: unknown,
): SoundtrackProject {
  let project = validateSoundtrackProject(input);
  const parsed = z
    .array(SoundtrackEditSchema)
    .min(1)
    .max(100)
    .safeParse(operations);
  if (!parsed.success)
    soundtrackFail("edit-schema", "Invalid soundtrack operations", {
      issues: parsed.error.issues,
    });
  let before: SoundtrackState | undefined;
  const commit = () => {
    if (!before) return;
    project = validateSoundtrackProject(project);
    if (!sameState(before, soundtrackState(project)))
      project.history = {
        undo: [...project.history.undo, before].slice(-20),
        redo: [],
      };
    before = undefined;
  };
  for (const operation of parsed.data) {
    if (operation.type === "undo" || operation.type === "redo") {
      commit();
      const from = operation.type,
        to = from === "undo" ? "redo" : "undo";
      const state = project.history[from].pop();
      if (!state) soundtrackFail("history-empty", "No " + from + " available");
      project.history[to] = [
        ...project.history[to],
        soundtrackState(project),
      ].slice(-20);
      project = {
        ...state,
        schemaVersion: project.schemaVersion,
        revision: project.revision,
        history: project.history,
      };
      continue;
    }
    before ??= soundtrackState(project);
    const clip =
      "clip" in operation
        ? project.clips.find((c) => c.id === operation.clip)
        : undefined;
    const track =
      "track" in operation
        ? project.tracks.find((t) => t.id === operation.track)
        : undefined;
    if (("clip" in operation && !clip) || ("track" in operation && !track))
      soundtrackFail("edit-reference", "Unknown edit target", { operation });
    switch (operation.type) {
      case "gain": {
        const groups = {
          clip: project.clips,
          track: project.tracks,
          bus: project.buses,
          master: [project.master],
        };
        const target = (
          operation.kind ? groups[operation.kind] : Object.values(groups).flat()
        ).filter((t) => t.id === operation.target);
        if (target.length !== 1)
          soundtrackFail(
            "edit-reference",
            "Gain target must identify exactly one clip or routing node",
          );
        target[0]!.gainDb = operation.gainDb;
        break;
      }
      case "mute":
        track!.mute = operation.value;
        break;
      case "solo":
        track!.solo = operation.value;
        break;
      case "move": {
        // An anchored clip keeps its anchor point; the offset follows the move.
        const anchor = clip!.anchor;
        if (anchor) {
          const offset =
            operation.startSample - (clip!.startSample - anchor.offsetSamples);
          if (
            operation.offsetSamples !== undefined &&
            operation.offsetSamples !== offset
          )
            soundtrackFail(
              "anchor-conflict",
              "offsetSamples must keep the clip's anchor point; omit it to derive the offset, or retime the project",
              {
                clip: clip!.id,
                expected: offset,
                actual: operation.offsetSamples,
              },
            );
          anchor.offsetSamples = offset;
        } else if (operation.offsetSamples !== undefined)
          soundtrackFail(
            "anchor-conflict",
            "offsetSamples applies only to anchored clips",
            { clip: clip!.id },
          );
        clip!.startSample = operation.startSample;
        break;
      }
      case "trim":
        clip!.sourceStartSample = operation.sourceStartSample;
        clip!.sourceEndSample = operation.sourceEndSample;
        break;
      case "automation":
        clip!.automation = operation.automation;
        break;
    }
  }
  commit();
  return {
    ...validateSoundtrackProject(project),
    revision: input.revision + 1,
  };
}
export type SoundtrackTiming = {
  fps: number;
  frameCount: number;
  beats: readonly {
    id: string;
    start: number;
    cues: readonly { id: string; frame: number }[];
    events: readonly { id: string; start: number; end: number }[];
  }[];
};
export const frameToSoundtrackSample = (frame: number, fps: number) => {
  if (
    !Number.isSafeInteger(frame) ||
    !Number.isInteger(fps) ||
    fps < 1 ||
    fps > 120
  )
    soundtrackFail("timing", "Use integer frames and 1–120 fps");
  return Math.round((frame * 48000) / fps);
};
export function resolveSoundtrackAnchors(
  input: SoundtrackProject,
  timing: SoundtrackTiming,
  retime = false,
) {
  const project = validateSoundtrackProject(input);
  if (
    project.durationSamples !==
    frameToSoundtrackSample(timing.frameCount, timing.fps)
  )
    soundtrackFail(
      "passage-duration",
      "Soundtrack duration must match picture",
    );
  for (const clip of project.clips) {
    if (!clip.anchor) continue;
    const anchor = clip.anchor,
      matchingBeats = timing.beats.filter((b) => b.id === anchor.beat),
      beat = matchingBeats[0];
    const ref = anchor.reference;
    const matches =
      ref.type === "cue"
        ? beat?.cues.filter((c) => c.id === ref.id)
        : beat?.events.filter((e) => e.id === ref.id);
    if (!beat || matchingBeats.length !== 1 || matches?.length !== 1)
      soundtrackFail(
        "anchor-reference",
        "Missing or ambiguous beat/cue/event",
        { clip: clip.id, anchor },
      );
    const at =
      ref.type === "cue"
        ? (matches[0] as { frame: number }).frame
        : (matches[0] as { start: number; end: number })[ref.edge];
    const resolved =
      frameToSoundtrackSample(beat.start + at, timing.fps) +
      anchor.offsetSamples;
    if (!retime && resolved !== clip.startSample)
      soundtrackFail(
        "anchor-conflict",
        "Saved position disagrees with picture; explicitly retime and save",
        { clip: clip.id, expected: resolved, actual: clip.startSample },
      );
    clip.startSample = resolved;
  }
  return validateSoundtrackProject(project);
}

/**
 * Saves picture-driven anchor positions as one undoable action. Returns the
 * validated input unchanged (same revision) when every anchor already agrees.
 */
export function retimeSoundtrackAnchors(
  input: SoundtrackProject,
  timing: SoundtrackTiming,
) {
  const project = validateSoundtrackProject(input),
    resolved = resolveSoundtrackAnchors(project, timing, true),
    before = soundtrackState(project);
  if (sameState(before, soundtrackState(resolved))) return project;
  return validateSoundtrackProject({
    ...resolved,
    revision: project.revision + 1,
    history: {
      undo: [...project.history.undo, before].slice(-20),
      redo: [],
    },
  });
}

export function validateSoundtrackNarration(
  project: SoundtrackProject,
  timing: {
    fps: number;
    sourceStartFrame: number;
    endFrameExclusive: number;
    sha256?: string;
  },
) {
  const clips = project.clips.filter(
    (c) => project.tracks.find((t) => t.id === c.track)?.role === "narration",
  );
  if (!clips.length) return;
  if (clips.length !== 1)
    soundtrackFail(
      "narration-interval",
      "Passage soundtrack requires one unchanged narration interval",
    );
  const clip = clips[0]!,
    asset = project.assets.find((a) => a.id === clip.asset)!;
  if (
    !timing.sha256 ||
    asset.sha256 !== "sha256:" + timing.sha256 ||
    clip.sourceStartSample !==
      frameToSoundtrackSample(timing.sourceStartFrame, timing.fps) ||
    clip.sourceEndSample !==
      frameToSoundtrackSample(timing.endFrameExclusive, timing.fps) ||
    clip.startSample !== 0
  )
    soundtrackFail(
      "narration-interval",
      "Passage narration must preserve its authorized source interval and placement",
      { clip: clip.id },
    );
}
