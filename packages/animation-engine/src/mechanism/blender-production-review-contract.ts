import { z } from "zod";
import { MechanismHashSchema } from "@still-shift/scene-contract";
import { MechanismProductionBindingSchema } from "./production-report.ts";
import { MechanismProductionOwnedFileSchema } from "./production-queue-contract.ts";
import {
  MechanismProductionEvidenceSchema,
  MECHANISM_PRODUCTION_EVIDENCE_LIMITS as LIMIT,
} from "./production-evidence-contract.ts";
import { BlenderEpisodePlanSchema } from "./blender-episode-contract.ts";
import { mechanismCueCaptionLayout } from "./cue-caption.ts";
import { mechanismPackHash } from "./pack-support.ts";
import type { compileBlenderEpisode } from "./blender-episode-compile.ts";

type Compiled = ReturnType<typeof compileBlenderEpisode>;
const legacyPlan = MechanismProductionEvidenceSchema.shape.plan;
const shot = legacyPlan.shape.shots.element;
const anchor =
  BlenderEpisodePlanSchema.shape.callouts.unwrap().element.shape.anchor;
const legacyImage = MechanismProductionEvidenceSchema.shape.images.element;
const projection = legacyImage.shape.projections.element.extend({ anchor });
const nativeProjections = z.array(projection).max(16);
const role = legacyPlan.shape.samples.element.shape.roles.element.extend({
  origin: z.enum(["shot", "control", "source-frame", "callout", "speech"]),
});
const sample = legacyPlan.shape.samples.element.extend({
  roles: z.array(role).min(1).max(512),
});
export const BlenderProductionReviewPlanSchema = z
  .object({
    frameCount: z.number().int().positive().max(2000),
    fps: z.number().int().positive().max(120),
    width: z.number().int().min(16).max(4096),
    height: z.number().int().min(16).max(4096),
    sourceSamples: z.number().int().positive().max(172800000),
    sourceFingerprint: MechanismHashSchema,
    samples: z.array(sample).max(512),
    shots: z
      .array(
        shot.omit({ kind: true, editing: true }).extend({
          detailFrame: shot.shape.midFrame,
          anchors: z.array(anchor).max(16),
        }),
      )
      .min(1)
      .max(128),
  })
  .strict();
export const BlenderProductionEvidenceSchema = z
  .object({
    schemaVersion: z.literal("mechanism-production-evidence-2"),
    backend: z.literal("blender-native"),
    binding: MechanismProductionBindingSchema,
    output: MechanismProductionOwnedFileSchema,
    decodedReport: MechanismProductionOwnedFileSchema,
    nativePlates: MechanismProductionOwnedFileSchema,
    plan: BlenderProductionReviewPlanSchema,
    images: z
      .array(legacyImage.extend({ projections: nativeProjections }))
      .max(1024),
    audio: MechanismProductionEvidenceSchema.shape.audio,
    exceptions: z
      .array(
        MechanismProductionEvidenceSchema.shape.exceptions.element.extend({
          projections: nativeProjections,
        }),
      )
      .max(128),
    qualification: z.string().max(2048),
  })
  .strict();
export type BlenderProductionEvidence = z.infer<
  typeof BlenderProductionEvidenceSchema
>;
export type BlenderProductionReviewPlan = z.infer<
  typeof BlenderProductionReviewPlanSchema
>;
/** Content identity excludes the receiving machine's asset locations. */
export function blenderProductionReviewFingerprint(compiled: Compiled) {
  const withoutPath = (file: { path: string }) =>
    Object.fromEntries(Object.entries(file).filter(([key]) => key !== "path"));
  return mechanismPackHash({
    source: {
      ...compiled.source,
      asset: withoutPath(compiled.source.asset),
      evidenceFiles: compiled.source.evidenceFiles.map(withoutPath),
    },
    plan: {
      ...compiled.plan,
      narration: withoutPath(compiled.plan.narration),
      font: withoutPath(compiled.plan.font),
    },
  });
}
/** Use the authored output clock and preserve all roles when sample frames coincide. */
export function planBlenderProductionReview(
  compiled: Compiled,
): BlenderProductionReviewPlan {
  const { plan, frameCount } = compiled;
  const samples = new Map<
    number,
    BlenderProductionReviewPlan["samples"][number]["roles"]
  >();
  const add = (
    frame: number,
    cue: string,
    kind: BlenderProductionReviewPlan["samples"][number]["roles"][number]["kind"],
    origin: BlenderProductionReviewPlan["samples"][number]["roles"][number]["origin"] = "shot",
  ) => {
    if (frame < 0 || frame >= frameCount) return;
    const roles = samples.get(frame) ?? [];
    if (
      !roles.some(
        (r) => r.cue === cue && r.kind === kind && r.origin === origin,
      )
    )
      roles.push({ cue, kind, origin });
    if (roles.length > 512)
      throw Error("Native review role budget exceeded before extraction");
    samples.set(frame, roles);
    if (samples.size > LIMIT.samples)
      throw Error("Native review sample budget exceeded before extraction");
  };
  const event = (
    frame: number,
    cue: string,
    origin: BlenderProductionReviewPlan["samples"][number]["roles"][number]["origin"],
  ) => {
    add(frame - 1, cue, "event-before", origin);
    add(frame, cue, "event-at", origin);
    add(frame + 1, cue, "event-after", origin);
  };
  for (const key of plan.sourceFrameTrack)
    event(key.frame, "source-frame", "source-frame");
  for (const [id, keys] of Object.entries(plan.controlTracks))
    for (const key of keys) event(key.frame, id, "control");
  for (const callout of plan.callouts) {
    event(callout.start, callout.id, "callout");
    event(callout.endExclusive - 1, callout.id, "callout");
  }
  for (const cue of plan.speech) {
    const at = (sample: number) =>
      Number((BigInt(sample) * BigInt(plan.fps) + 47999n) / 48000n);
    event(at(cue.startSample), cue.id, "speech");
    event(at(cue.endSampleExclusive) - 1, cue.id, "speech");
  }
  const exclusion = mechanismCueCaptionLayout(
    plan.width,
    plan.height,
  ).exclusion;
  const captionCrop = {
    x: Math.floor(exclusion.x),
    y: Math.floor(exclusion.y),
    width: Math.min(
      plan.width - Math.floor(exclusion.x),
      Math.ceil(exclusion.width),
    ),
    height: Math.min(
      plan.height - Math.floor(exclusion.y),
      Math.ceil(exclusion.height),
    ),
  };
  const shots = plan.shots.map((s, i) => {
    const midFrame = Math.floor((s.start + s.endExclusive - 1) / 2);
    add(s.start, s.id, "entry");
    add(midFrame, s.id, "mid");
    add(s.endExclusive - 1, s.id, "exit");
    if (i) {
      add(s.start - 1, s.id, "cut-before");
      add(s.start, s.id, "cut-after");
    }
    const active = plan.callouts.filter((c) => c.shot === s.id);
    const detailFrame = active.some(
      (c) => c.start <= midFrame && midFrame < c.endExclusive,
    )
      ? midFrame
      : (active[0]?.start ?? midFrame);
    const anchors = [
      ...new Set(
        active
          .filter((c) => c.start <= detailFrame && detailFrame < c.endExclusive)
          .map((c) => c.anchor),
      ),
    ].sort();
    return {
      cue: s.id,
      startFrame: s.start,
      endFrameExclusive: s.endExclusive,
      midFrame,
      detailFrame,
      captionCrop,
      anchors,
    };
  });
  if (samples.size + shots.length * 3 > LIMIT.images)
    throw Error("Native review image budget exceeded before extraction");
  return BlenderProductionReviewPlanSchema.parse({
    frameCount,
    fps: plan.fps,
    width: plan.width,
    height: plan.height,
    sourceSamples: plan.narration.sampleCount,
    sourceFingerprint: blenderProductionReviewFingerprint(compiled),
    samples: [...samples]
      .sort(([a], [b]) => a - b)
      .map(([frame, roles]) => ({ frame, roles })),
    shots,
  });
}
