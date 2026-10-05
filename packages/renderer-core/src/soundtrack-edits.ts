import { z } from "zod";
import {
  SoundtrackAutomationSchema,
  SoundtrackBusSchema,
  SoundtrackClipSchema,
  SoundtrackDuckingSchema,
  SoundtrackProcessorsSchema,
  SoundtrackTrackSchema,
  SoundtrackFadeCurveSchema,
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
  z
    .object({ type: z.literal("pan"), clip: identifier, pan: z.number() })
    .strict(),
  z
    .object({
      type: z.literal("fade"),
      clip: identifier,
      fadeInSamples: z.number().int().optional(),
      fadeOutSamples: z.number().int().optional(),
      fadeInCurve: SoundtrackFadeCurveSchema.optional(),
      fadeOutCurve: SoundtrackFadeCurveSchema.optional(),
    })
    .strict(),
  // A complete clip, appended so earlier clips keep their summation order.
  SoundtrackClipSchema.extend({ type: z.literal("add-clip") }),
  z.object({ type: z.literal("remove-clip"), clip: identifier }).strict(),
  z
    .object({
      type: z.literal("add-asset"),
      id: identifier,
      path: z.string(),
      // File-based saves hash the source; the pure edit requires the identity.
      sha256: z.string().optional(),
    })
    .strict(),
  z.object({ type: z.literal("remove-asset"), asset: identifier }).strict(),
  // A complete track or bus, appended so existing graph order is unchanged.
  SoundtrackTrackSchema.extend({ type: z.literal("add-track") }),
  z.object({ type: z.literal("remove-track"), track: identifier }).strict(),
  SoundtrackBusSchema.extend({ type: z.literal("add-bus") }),
  z.object({ type: z.literal("remove-bus"), bus: identifier }).strict(),
  z
    .object({ type: z.literal("route"), node: identifier, output: identifier })
    .strict(),
  z
    .object({
      type: z.literal("processors"),
      track: identifier,
      processors: SoundtrackProcessorsSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("ducking"),
      ducking: SoundtrackDuckingSchema.nullable(),
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
      case "pan":
        // Centre is the absent field, so recentring restores the unpanned clip.
        if (operation.pan === 0) delete clip!.pan;
        else clip!.pan = operation.pan;
        break;
      case "fade":
        if (
          operation.fadeInSamples === undefined &&
          operation.fadeOutSamples === undefined &&
          operation.fadeInCurve === undefined &&
          operation.fadeOutCurve === undefined
        )
          soundtrackFail("edit-schema", "fade needs a fade length or curve", {
            clip: clip!.id,
          });
        if (operation.fadeInSamples !== undefined)
          clip!.fadeInSamples = operation.fadeInSamples;
        if (operation.fadeOutSamples !== undefined)
          clip!.fadeOutSamples = operation.fadeOutSamples;
        // Linear is the absent field, so choosing it restores the default clip.
        for (const key of ["fadeInCurve", "fadeOutCurve"] as const) {
          const curve = operation[key];
          if (curve === "linear") delete clip![key];
          else if (curve) clip![key] = curve;
        }
        break;
      case "add-clip": {
        const added = SoundtrackClipSchema.parse(
          Object.fromEntries(
            Object.entries(operation).filter(([key]) => key !== "type"),
          ),
        );
        if (project.clips.some((c) => c.id === added.id))
          soundtrackFail("duplicate-id", "A clip with this ID already exists", {
            clip: added.id,
          });
        project.clips.push(added);
        break;
      }
      case "remove-clip":
        project.clips = project.clips.filter((c) => c !== clip);
        break;
      case "add-asset": {
        if (project.assets.some((a) => a.id === operation.id))
          soundtrackFail(
            "duplicate-id",
            "An asset with this ID already exists",
            { asset: operation.id },
          );
        if (operation.sha256 === undefined)
          soundtrackFail(
            "asset-identity",
            "add-asset needs sha256; file-based saves compute it from the source",
            { asset: operation.id },
          );
        project.assets.push({
          id: operation.id,
          path: operation.path,
          sha256: operation.sha256,
        });
        break;
      }
      case "add-track":
      case "add-bus": {
        const added = (
          operation.type === "add-track"
            ? SoundtrackTrackSchema
            : SoundtrackBusSchema
        ).parse(
          Object.fromEntries(
            Object.entries(operation).filter(([key]) => key !== "type"),
          ),
        );
        if (
          [...project.tracks, ...project.buses, project.master].some(
            (node) => node.id === added.id,
          )
        )
          soundtrackFail(
            "duplicate-id",
            "A track or bus with this ID already exists",
            { node: added.id },
          );
        if (operation.type === "add-track")
          project.tracks.push(added as SoundtrackState["tracks"][number]);
        else project.buses.push(added as SoundtrackState["buses"][number]);
        break;
      }
      case "remove-track": {
        const users = project.clips.filter((c) => c.track === operation.track);
        const ducked =
          project.ducking?.sourceTrack === operation.track ||
          project.ducking?.targetTracks.includes(operation.track);
        if (users.length || ducked)
          soundtrackFail(
            "track-in-use",
            "Remove its clips and ducking references first",
            { track: operation.track, clips: users.map((c) => c.id) },
          );
        project.tracks = project.tracks.filter((t) => t !== track);
        break;
      }
      case "remove-bus": {
        if (!project.buses.some((b) => b.id === operation.bus))
          soundtrackFail("edit-reference", "Unknown edit target", {
            operation,
          });
        const inputs = [...project.tracks, ...project.buses].filter(
          (node) => node.output === operation.bus,
        );
        if (inputs.length)
          soundtrackFail("bus-in-use", "Route the bus inputs elsewhere first", {
            bus: operation.bus,
            inputs: inputs.map((node) => node.id),
          });
        project.buses = project.buses.filter((b) => b.id !== operation.bus);
        break;
      }
      case "route": {
        const node = [...project.tracks, ...project.buses].find(
          (n) => n.id === operation.node,
        );
        if (!node)
          soundtrackFail("edit-reference", "Unknown edit target", {
            operation,
          });
        // Validation rejects unknown outputs, track outputs and cycles.
        node.output = operation.output;
        break;
      }
      case "processors":
        track!.processors = operation.processors;
        break;
      case "ducking":
        if (operation.ducking) project.ducking = operation.ducking;
        else delete project.ducking;
        break;
      case "remove-asset": {
        const users = project.clips.filter((c) => c.asset === operation.asset);
        if (!project.assets.some((a) => a.id === operation.asset))
          soundtrackFail("edit-reference", "Unknown edit target", {
            operation,
          });
        if (users.length)
          soundtrackFail(
            "asset-in-use",
            "Remove or reassign the clips that use this asset first",
            { asset: operation.asset, clips: users.map((c) => c.id) },
          );
        project.assets = project.assets.filter((a) => a.id !== operation.asset);
        break;
      }
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
