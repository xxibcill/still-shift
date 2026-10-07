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
/** `equal-power` is a quarter-sine gain: −3 dB at the fade midpoint instead of −6 dB. */
export const SoundtrackFadeCurveSchema = z.enum(["linear", "equal-power"]);
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
    /** Fade shape; absent means a linear amplitude ramp. */
    fadeInCurve: SoundtrackFadeCurveSchema.optional(),
    fadeOutCurve: SoundtrackFadeCurveSchema.optional(),
    automation: SoundtrackAutomationSchema,
    /** Constant-power stereo position; absent means centre (unity on both channels). */
    pan: z.number().min(-1).max(1).optional(),
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
export const SoundtrackProcessorsSchema = z
  .array(
    z
      .object({
        type: z.enum(["highpass", "lowpass"]),
        frequencyHz: z.number().min(20).max(20000),
        q: z.number().min(0.1).max(10),
      })
      .strict(),
  )
  .max(4);
export const SoundtrackTrackSchema = z
  .object({
    id,
    role: z.enum(["narration", "bgm", "sfx", "ambience"]),
    output: id,
    gainDb: gain,
    mute: z.boolean(),
    solo: z.boolean(),
    processors: SoundtrackProcessorsSchema,
  })
  .strict();
export const SoundtrackBusSchema = z
  .object({ id, output: id, gainDb: gain })
  .strict();
export const SoundtrackDuckingSchema = z
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
  .strict();
export const SoundtrackLimiterSchema = z
  .object({
    ceilingDb: z.number().min(-24).max(0),
    lookaheadSamples: sample.max(4800),
    releaseSamples: sample.max(480000),
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
    tracks: z.array(SoundtrackTrackSchema).max(16),
    buses: z.array(SoundtrackBusSchema).max(8),
    master: z
      .object({
        id: z.literal("master"),
        gainDb: gain,
        /** Optional lookahead peak limiter on the mix only; absent leaves it unlimited. */
        limiter: SoundtrackLimiterSchema.optional(),
      })
      .strict(),
    ducking: SoundtrackDuckingSchema.optional(),
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
  const stemNames = [...state.tracks, ...state.buses].map((node) =>
    node.id.toLowerCase(),
  );
  check(
    new Set(stemNames).size === stemNames.length,
    "output-collision",
    "Track and bus IDs must be unique ignoring case; rename the colliding stem",
  );
  check(
    !stemNames.some((name) => ["mix", "duck-envelope"].includes(name)),
    "reserved-id",
    "mix and duck-envelope are reserved output names ignoring case; rename the track or bus",
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
  check(
    soundtrackWorkingBytes(state) <= 1_500_000_000,
    "resource-budget",
    "Project exceeds the 1.5 GB working-buffer estimate; shorten it, split it or flatten nested buses",
  );
}

/**
 * Peak worker memory estimate, mirrored by soundtrack-worker.py. Units are
 * project-length stereo float32 buffers (8 bytes per sample frame), following
 * the render: the ducking detector (1); DawDreamer filtering one track before
 * any accumulator exists (3); then a depth-first walk where a routing node's
 * accumulator exists once its first input is summed, a mixed track holds 1
 * buffer, a spilled filtered track holds none (clean file pages) unless it seeds
 * an accumulator, and a finished bus is 1 buffer until summed. Ducking keeps 0.5
 * throughout. Fixed: 200 MB for the interpreter and chunk temporaries, and 128 MB
 * for decoded clips (a 64 MB decode budget plus the clip being mixed).
 * Requires a routing graph already checked to reach master without cycles.
 */
export function soundtrackWorkingBytes(state: SoundtrackState) {
  const tracks = new Map(state.tracks.map((track) => [track.id, track]));
  const nodes = [...state.tracks, ...state.buses];
  let peak = state.tracks.some((track) => track.processors.length > 0) ? 3 : 1;
  const visit = (node: string, alive: number) => {
    const sources = nodes.filter((n) => n.output === node);
    if (!sources.length) peak = Math.max(peak, alive + 1);
    sources.forEach((source, index) => {
      const own = index ? 1 : 0;
      const track = tracks.get(source.id);
      if (!track) {
        visit(source.id, alive + own);
        peak = Math.max(peak, alive + own + 1);
      } else if (track.processors.length) peak = Math.max(peak, alive + 1);
      else peak = Math.max(peak, alive + own + 1);
    });
  };
  visit("master", 0);
  // Half-buffer units keep the estimate in integers.
  const halves = 2 * peak + (state.ducking ? 1 : 0);
  return state.durationSamples * 4 * halves + 328_000_000;
}
