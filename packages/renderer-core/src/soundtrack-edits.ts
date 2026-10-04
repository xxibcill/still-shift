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
  for (const operation of parsed.data) {
    if (operation.type === "undo" || operation.type === "redo") {
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
    } else {
      const before = soundtrackState(project);
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
            operation.kind
              ? groups[operation.kind]
              : Object.values(groups).flat()
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
        case "move":
          if (clip!.anchor && operation.offsetSamples === undefined)
            soundtrackFail(
              "anchor-conflict",
              "Moving an anchored clip requires its new offsetSamples",
            );
          clip!.startSample = operation.startSample;
          if (clip!.anchor)
            clip!.anchor.offsetSamples = operation.offsetSamples!;
          break;
        case "trim":
          clip!.sourceStartSample = operation.sourceStartSample;
          clip!.sourceEndSample = operation.sourceEndSample;
          break;
        case "automation":
          clip!.automation = operation.automation;
          break;
      }
      project.history = {
        undo: [...project.history.undo, before].slice(-20),
        redo: [],
      };
    }
    project = validateSoundtrackProject(project);
  }
  return { ...project, revision: input.revision + 1 };
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
