import { z } from "zod";
import { PassageAnchorSchema } from "./passage-audio.ts";

const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
const sample = z.number().int().min(0).max(28_800_000);
const gain = z.number().min(-120).max(12);
export const SoundtrackAutomationSchema = z
  .object({
    interpolation: z.enum(["linear", "hold"]),
    points: z
      .array(z.object({ sample, gain: z.number().min(0).max(4) }).strict())
      .max(2048),
  })
  .strict();
export const SoundtrackClipSchema = z
  .object({
    id,
    asset: id,
    track: id,
    sourceStartSample: sample,
    sourceEndSample: sample,
    startSample: sample,
    gainDb: gain,
    fadeInSamples: sample,
    fadeOutSamples: sample,
    automation: SoundtrackAutomationSchema,
    anchor: z
      .object({
        beat: id,
        reference: PassageAnchorSchema,
        offsetSamples: z.number().int().min(-28_800_000).max(28_800_000),
      })
      .strict()
      .optional(),
  })
  .strict();
export const SoundtrackStateSchema = z
  .object({
    sampleRate: z.literal(48000),
    channels: z.literal(2),
    durationSamples: sample.positive(),
    channelConversion: z.literal("mono-duplicate-stereo-preserve"),
    normalization: z.literal("none"),
    tailPolicy: z.literal("retain-to-project-end"),
    assets: z
      .array(
        z
          .object({
            id,
            path: z.string().min(1).max(4096),
            sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .max(100),
    clips: z.array(SoundtrackClipSchema).max(128),
    tracks: z
      .array(
        z
          .object({
            id,
            role: z.enum(["narration", "bgm", "sfx", "ambience"]),
            output: id,
            gainDb: gain,
            mute: z.boolean(),
            solo: z.boolean(),
            processors: z
              .array(
                z
                  .object({
                    type: z.enum(["highpass", "lowpass"]),
                    frequencyHz: z.number().min(20).max(20000),
                    q: z.number().min(0.1).max(10),
                  })
                  .strict(),
              )
              .max(4),
          })
          .strict(),
      )
      .max(16),
    buses: z.array(z.object({ id, output: id, gainDb: gain }).strict()).max(8),
    master: z.object({ id: z.literal("master"), gainDb: gain }).strict(),
    ducking: z
      .object({
        method: z.literal("peak-window-attack-hold-release-1"),
        sourceTrack: id,
        targetTracks: z.array(id).min(1).max(16),
        thresholdDb: z.number().min(-90).max(0),
        attenuationDb: z.number().min(-60).max(0),
        windowSamples: sample.min(1).max(4800),
        attackSamples: sample.max(480000),
        releaseSamples: sample.max(480000),
        holdSamples: sample.max(480000),
        lookaheadSamples: sample.max(48000),
      })
      .strict()
      .optional(),
  })
  .strict();
export const SoundtrackProjectSchema = SoundtrackStateSchema.extend({
  schemaVersion: z.literal("soundtrack-project-1"),
  revision: z.number().int().nonnegative(),
  history: z
    .object({
      undo: z.array(SoundtrackStateSchema).max(20),
      redo: z.array(SoundtrackStateSchema).max(20),
    })
    .strict(),
}).strict();
export type SoundtrackState = z.infer<typeof SoundtrackStateSchema>;
export type SoundtrackProject = z.infer<typeof SoundtrackProjectSchema>;
export type SoundtrackClip = z.infer<typeof SoundtrackClipSchema>;

export class SoundtrackError extends Error {
  readonly code: string;
  readonly context: Record<string, unknown>;
  constructor(
    code: string,
    message: string,
    context: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "SoundtrackError";
    this.code = code;
    this.context = context;
  }
}
export function soundtrackFail(
  code: string,
  message: string,
  context: Record<string, unknown> = {},
): never {
  throw new SoundtrackError(code, message, context);
}

/** Structure and graph constraints apply equally to saved history and active edits. */
export function validateSoundtrackProject(input: unknown): SoundtrackProject {
  const parsed = SoundtrackProjectSchema.safeParse(input);
  if (!parsed.success)
    soundtrackFail("project-schema", "Invalid soundtrack project", {
      issues: parsed.error.issues,
    });
  const project = parsed.data;
  for (const state of [
    project,
    ...project.history.undo,
    ...project.history.redo,
  ])
    validateState(state);
  return project;
}
function validateState(state: SoundtrackState) {
  const check = (
    condition: boolean,
    code: string,
    message: string,
    context: Record<string, unknown> = {},
  ) => {
    if (!condition) soundtrackFail(code, message, context);
  };
  for (const items of [
    state.assets,
    state.clips,
    [...state.tracks, ...state.buses, state.master],
  ]) {
    check(
      new Set(items.map((i) => i.id)).size === items.length,
      "duplicate-id",
      "IDs must be unique within assets, clips and routing nodes",
    );
  }
  check(
    ![...state.tracks, ...state.buses].some((n) =>
      ["mix", "duck-envelope"].includes(n.id),
    ),
    "reserved-id",
    "mix and duck-envelope are reserved output names",
  );
  const nodes = new Map(
    [...state.tracks, ...state.buses].map((node) => [node.id, node]),
  );
  for (const node of nodes.values()) {
    let current: string = node.id;
    const visited = new Set<string>();
    while (current !== "master") {
      check(
        !visited.has(current),
        "routing-cycle",
        "Routing must end at master without cycles",
        { processor: node.id },
      );
      visited.add(current);
      const next = nodes.get(current);
      check(Boolean(next), "routing-reference", "Unknown routing output", {
        processor: node.id,
        output: current,
      });
      current = next!.output;
      check(
        !state.tracks.some((t) => t.id === current),
        "routing-track",
        "Outputs must reference buses or master",
        { processor: node.id },
      );
    }
  }
  for (const clip of state.clips) {
    const length = clip.sourceEndSample - clip.sourceStartSample;
    const context = { clip: clip.id, asset: clip.asset, track: clip.track };
    check(
      state.assets.some((a) => a.id === clip.asset) &&
        state.tracks.some((t) => t.id === clip.track),
      "clip-reference",
      "Clip asset or track is missing",
      context,
    );
    check(
      length > 0 && clip.startSample + length <= state.durationSamples,
      "clip-range",
      "End-exclusive source and placement intervals must fit",
      context,
    );
    check(
      clip.fadeInSamples + clip.fadeOutSamples <= length,
      "clip-fades",
      "Fades must fit the clip",
      context,
    );
    check(
      clip.automation.points.every(
        (p, i, points) =>
          p.sample <= length && (!i || p.sample > points[i - 1]!.sample),
      ),
      "automation-range",
      "Automation uses strictly increasing clip-relative sample positions",
      context,
    );
  }
  if (state.ducking) {
    check(
      state.tracks.find((t) => t.id === state.ducking!.sourceTrack)?.role ===
        "narration",
      "ducking-source",
      "Ducking detector must reference a narration track",
    );
    check(
      new Set(state.ducking.targetTracks).size ===
        state.ducking.targetTracks.length &&
        state.ducking.targetTracks.every(
          (id) => state.tracks.find((t) => t.id === id)?.role === "bgm",
        ),
      "ducking-target",
      "Only explicit BGM tracks can be ducked",
    );
  }
  // Four full-length stereo float buffers per processing node plus temporary decode.
  const nodesCount =
    state.tracks.length +
    state.buses.length +
    1 +
    state.tracks.reduce((sum, t) => sum + t.processors.length, 0);
  check(
    state.durationSamples * 8 * (nodesCount * 4 + 8) <= 1_500_000_000,
    "resource-budget",
    "Project exceeds the 1.5 GB working-buffer estimate; shorten or split it",
  );
}
