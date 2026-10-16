import { mkdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "zod";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import { BlenderProjectedAnchorSchema } from "./blender-capture-contract.ts";
import { BlenderEpisodePlatesSchema } from "./blender-episode-plates.ts";
import {
  BlenderProductionEvidenceSchema,
  planBlenderProductionReview,
  type BlenderProductionEvidence,
} from "./blender-production-review-contract.ts";
import { MECHANISM_PRODUCTION_EVIDENCE_LIMITS as LIMIT } from "./production-evidence-contract.ts";
import {
  evidenceProcess,
  evidenceFrameHashes,
  evidenceSelect,
} from "./production-evidence-process.ts";
import {
  productionReviewPngArgs,
  productionReviewPngShape,
  productionAnchorCrop,
  type ProductionReviewProjection,
} from "./production-review-images.ts";
import {
  productionReviewAudioHash,
  productionReviewAudioFacts,
} from "./production-review-audio.ts";
import {
  productionOwnedPath,
  productionFile,
  readProductionJSON,
  writeProductionJSON,
} from "./production-queue-files.ts";
import { mechanismPackHash } from "./pack-support.ts";
import type { compileBlenderEpisode } from "./blender-episode-compile.ts";
import type { MechanismProductionBinding } from "./production-report.ts";
import type { MechanismProductionDecodedOutput } from "./production-output-check.ts";
import type { MechanismProductionOwnedFileSchema } from "./production-queue-contract.ts";

type Pin = z.infer<typeof MechanismProductionOwnedFileSchema>;
type Review = BlenderProductionEvidence;
type Input = {
  compiled: ReturnType<typeof compileBlenderEpisode>;
  binding: MechanismProductionBinding;
  decoded: MechanismProductionDecodedOutput;
  outputRoot: string;
  video: Pin;
  decodedReport: Pin;
  nativePlates: Pin;
  owner: CompositionNodeMemory;
  signal?: AbortSignal | undefined;
};
const observed = z
  .object({
    sourceAssetSha256: z.string(),
    anchors: z.record(z.string(), BlenderProjectedAnchorSchema),
  })
  .passthrough();
const same = (a: unknown, b: unknown) =>
  mechanismPackHash(a) === mechanismPackHash(b);
const pattern = (directory: string) => join(directory, "frame-%06d.png");
const framePath = (directory: string, index: number) =>
  pattern(directory).replace("%06d", String(index).padStart(6, "0"));
function summary(value: Review, artifact: Pin) {
  return {
    artifact,
    audio: value.audio.file,
    images: value.images.map((image) => ({ frame: image.outputFrame })),
    cropExceptions: value.exceptions.length,
  };
}
async function projections(
  input: Input,
  plan: Review["plan"],
  owner: CompositionNodeMemory,
) {
  const map = await readProductionJSON(
    await productionOwnedPath(input.outputRoot, input.nativePlates.path),
    BlenderEpisodePlatesSchema,
    owner,
    4 * 1024 * 1024,
    input.signal,
  );
  try {
    if (
      map.sha256 !== input.nativePlates.sha256 ||
      map.value.frameCount !== plan.frameCount
    )
      throw Error(
        "Native review capture map differs from its bound clock or pin",
      );
    const result = new Map<string, ProductionReviewProjection[]>();
    for (const shot of plan.shots) {
      if (!shot.anchors.length) {
        result.set(shot.cue, []);
        continue;
      }
      const pin = map.value.frames[shot.detailFrame]!.observation;
      const frame = await readProductionJSON(
        await productionOwnedPath(input.outputRoot, pin.path),
        observed,
        owner,
        2 * 1024 * 1024,
        input.signal,
      );
      try {
        if (
          frame.sha256 !== pin.sha256 ||
          frame.value.sourceAssetSha256 !== input.compiled.source.asset.sha256
        )
          throw Error(
            "Native crop observation differs from its capture pin or source asset",
          );
        result.set(
          shot.cue,
          shot.anchors.map((anchor) => {
            const actual = frame.value.anchors[anchor];
            return {
              anchor,
              pixel: actual?.inFrame ? actual.pixel : null,
              visibility: actual
                ? actual.inFrame
                  ? "in-frame-projection-occlusion-unassessed"
                  : "outside-frame"
                : "missing",
            };
          }),
        );
      } finally {
        frame.release();
      }
    }
    return result;
  } finally {
    map.release();
  }
}
async function assertAudio(
  path: string,
  decoded: MechanismProductionDecodedOutput,
  owner: CompositionNodeMemory,
  signal?: AbortSignal,
) {
  const facts = await productionReviewAudioFacts(path, owner, signal);
  if (
    facts.duration_ts * facts.channels * 4 !== decoded.audio.bytes ||
    facts.channels !== decoded.audio.channels ||
    (await productionReviewAudioHash(path, owner, signal)) !==
      decoded.audio.sha256
  )
    throw Error(
      "Native review PCM differs from the complete final decoded output",
    );
  return facts;
}
async function assertInputPins(input: Input, owner: CompositionNodeMemory) {
  for (const pin of [input.video, input.decodedReport, input.nativePlates]) {
    const actual = await productionFile(input.outputRoot, pin.path, owner);
    if (!same(actual, pin))
      throw Error("Native review source artifact bytes differ from their pins");
  }
}
function assertClock(input: Input, plan: Review["plan"]) {
  if (
    input.video.sha256 !== input.binding.outputSha256 ||
    input.decoded.frames !== plan.frameCount ||
    input.decoded.width !== plan.width ||
    input.decoded.height !== plan.height ||
    input.decoded.fps !== plan.fps
  )
    throw Error("Native review source, output and decoded clock differ");
}
/** Extract encoded review evidence after the caller's complete native capture verification. */
export async function buildBlenderProductionReview(
  input: Input & { directory: string },
) {
  const owner = new CompositionNodeMemory(input.owner),
    lease = owner.reserve(LIMIT.retainedCapacityBytes);
  try {
    const plan = planBlenderProductionReview(input.compiled);
    assertClock(input, plan);
    await assertInputPins(input, owner);
    if (input.decoded.audio.bytes + 4096 > LIMIT.audioBytes)
      throw Error(
        "Native review audio exceeds the produced-file budget before extraction",
      );
    const points = await projections(input, plan, owner);
    await mkdir(input.directory, { recursive: false });
    const frames = plan.samples.map((s) => s.frame),
      source = await productionOwnedPath(input.outputRoot, input.video.path);
    const sourceHashes = await evidenceFrameHashes(
      source,
      owner,
      input.signal,
      evidenceSelect(frames),
    );
    if (sourceHashes.length !== frames.length)
      throw Error("Native review source sample decode is incomplete");
    await evidenceProcess(
      "ffmpeg",
      productionReviewPngArgs(
        source,
        evidenceSelect(frames),
        frames.length,
        pattern(input.directory),
      ),
      owner,
      input.signal,
    );
    const pngHashes = await evidenceFrameHashes(
      pattern(input.directory),
      owner,
      input.signal,
      undefined,
      true,
    );
    if (!same(sourceHashes, pngHashes))
      throw Error("Native review PNG frames differ from the final video");
    const images: Review["images"] = [],
      exceptions: Review["exceptions"] = [];
    const image = async (
      path: string,
      kind: Review["images"][number]["kind"],
      outputFrame: number,
      cue: string | null,
      crop: Review["images"][number]["crop"],
      projected: ProductionReviewProjection[],
      width: number,
      height: number,
      hash: string,
    ) => {
      const shape = await productionReviewPngShape(path);
      if (shape.width !== width || shape.height !== height)
        throw Error(
          "Native review PNG dimensions differ from their transformation",
        );
      images.push({
        file: await productionFile(
          input.outputRoot,
          relative(input.outputRoot, path),
          owner,
        ),
        kind,
        outputFrame,
        cue,
        width,
        height,
        pixelsSha256: hash,
        sourceFramePixelsSha256: sourceHashes[frames.indexOf(outputFrame)]!,
        crop,
        projections: projected,
      });
    };
    for (const [index, frame] of frames.entries())
      await image(
        framePath(input.directory, index),
        "frame",
        frame,
        null,
        null,
        [],
        plan.width,
        plan.height,
        pngHashes[index]!,
      );
    const transform = async (
      shot: Review["plan"]["shots"][number],
      index: number,
      kind: "phone" | "caption-crop" | "anchor-crop",
      outputFrame: number,
      crop: Review["images"][number]["crop"],
      projected: ProductionReviewProjection[],
    ) => {
      const filter =
        kind === "phone"
          ? `scale=${LIMIT.phoneWidth}:${LIMIT.phoneHeight}:force_original_aspect_ratio=decrease:flags=area,pad=${LIMIT.phoneWidth}:${LIMIT.phoneHeight}:(ow-iw)/2:(oh-ih)/2:black`
          : `crop=${crop!.width}:${crop!.height}:${crop!.x}:${crop!.y}`;
      const destination = join(
        input.directory,
        `${kind}-${String(index).padStart(6, "0")}.png`,
      );
      await evidenceProcess(
        "ffmpeg",
        productionReviewPngArgs(
          framePath(input.directory, frames.indexOf(outputFrame)),
          filter,
          1,
          destination,
        ),
        owner,
        input.signal,
      );
      const hashes = await evidenceFrameHashes(
        destination,
        owner,
        input.signal,
      );
      if (hashes.length !== 1)
        throw Error("Native derived review image decode is incomplete");
      await image(
        destination,
        kind,
        outputFrame,
        shot.cue,
        crop,
        projected,
        kind === "phone" ? LIMIT.phoneWidth : crop!.width,
        kind === "phone" ? LIMIT.phoneHeight : crop!.height,
        hashes[0]!,
      );
    };
    for (const [index, shot] of plan.shots.entries()) {
      await transform(shot, index, "phone", shot.midFrame, null, []);
      await transform(
        shot,
        index,
        "caption-crop",
        shot.midFrame,
        shot.captionCrop,
        [],
      );
      const projected = points.get(shot.cue)!,
        crop = productionAnchorCrop(projected, plan.width, plan.height);
      if (crop)
        await transform(
          shot,
          index,
          "anchor-crop",
          shot.detailFrame,
          crop,
          projected,
        );
      else
        exceptions.push({
          cue: shot.cue,
          outputFrame: shot.detailFrame,
          reason:
            "No declared active anchor has an actual in-frame projection; contact detail remains unavailable.",
          projections: projected,
        });
    }
    const audioPath = join(input.directory, "review-audio.wav");
    await evidenceProcess(
      "ffmpeg",
      [
        "-v",
        "error",
        "-nostdin",
        "-threads",
        "1",
        "-i",
        source,
        "-map",
        "0:a:0",
        "-vn",
        "-c:a",
        "pcm_f32le",
        audioPath,
      ],
      owner,
      input.signal,
    );
    const facts = await assertAudio(
      audioPath,
      input.decoded,
      owner,
      input.signal,
    );
    const audio = await productionFile(
      input.outputRoot,
      relative(input.outputRoot, audioPath),
      owner,
    );
    const value = BlenderProductionEvidenceSchema.parse({
      schemaVersion: "mechanism-production-evidence-2",
      backend: "blender-native",
      binding: input.binding,
      output: input.video,
      decodedReport: input.decodedReport,
      nativePlates: input.nativePlates,
      plan,
      images,
      audio: {
        file: audio,
        decodedSha256: input.decoded.audio.sha256,
        decodedBytes: input.decoded.audio.bytes,
        samples: facts.duration_ts,
        channels: facts.channels,
        sampleRate: 48000,
        method: "unmodified-float32-PCM-from-final-output",
      },
      exceptions,
      qualification:
        "Exact encoded shot/control/callout/speech/cut samples, phone/caption transforms, actual retained native projections and unmodified final PCM. Caller verifies complete native capture first. Projections do not establish visible surface contact or occlusion. No whole glyph, mechanical, factual, motion, listening or human acceptance.",
    });
    const path = join(input.directory, "evidence.json");
    await writeProductionJSON(path, value, owner, LIMIT.manifestBytes, true);
    return summary(
      value,
      await productionFile(
        input.outputRoot,
        relative(input.outputRoot, path),
        owner,
      ),
    );
  } finally {
    lease.release();
    owner.dispose();
  }
}
/** Reconstruct every image's clock, shape and pixel transformation from current source and encoded video. */
export async function checkBlenderProductionReview(
  input: Input & { evidence: Pin },
) {
  const owner = new CompositionNodeMemory(input.owner),
    lease = owner.reserve(LIMIT.retainedCapacityBytes);
  let loaded:
    | Awaited<ReturnType<typeof readProductionJSON<Review>>>
    | undefined;
  try {
    loaded = await readProductionJSON(
      await productionOwnedPath(input.outputRoot, input.evidence.path),
      BlenderProductionEvidenceSchema,
      owner,
      LIMIT.manifestBytes,
      input.signal,
    );

    const value = loaded.value,
      plan = planBlenderProductionReview(input.compiled);
    assertClock(input, plan);
    await assertInputPins(input, owner);
    if (
      loaded.sha256 !== input.evidence.sha256 ||
      !same(value.plan, plan) ||
      !same(value.binding, input.binding) ||
      !same(value.output, input.video) ||
      !same(value.decodedReport, input.decodedReport) ||
      !same(value.nativePlates, input.nativePlates)
    )
      throw Error(
        "Native review metadata differs from its current bound source and output",
      );
    const points = await projections(input, plan, owner),
      frames = plan.samples.map((s) => s.frame);
    const full = value.images.filter((image) => image.kind === "frame");
    if (full.length !== frames.length)
      throw Error("Native review full-frame sample coverage differs");
    const sourceHashes = await evidenceFrameHashes(
      await productionOwnedPath(input.outputRoot, input.video.path),
      owner,
      input.signal,
      evidenceSelect(frames),
    );
    if (sourceHashes.length !== frames.length)
      throw Error("Native review final sample decode is incomplete");
    for (const [index, image] of full.entries())
      if (
        image.outputFrame !== frames[index] ||
        image.cue !== null ||
        image.crop !== null ||
        image.projections.length ||
        image.width !== plan.width ||
        image.height !== plan.height ||
        image.pixelsSha256 !== sourceHashes[index] ||
        image.sourceFramePixelsSha256 !== sourceHashes[index]
      )
        throw Error(
          "Native review frame metadata differs from actual video samples",
        );
    const expectedExceptions: Review["exceptions"] = [],
      expected = [...full];
    for (const shot of plan.shots) {
      const projected = points.get(shot.cue)!,
        crop = productionAnchorCrop(projected, plan.width, plan.height);
      for (const kind of ["phone", "caption-crop", "anchor-crop"] as const) {
        if (kind === "anchor-crop" && !crop) continue;
        const matches = value.images.filter(
          (image) => image.kind === kind && image.cue === shot.cue,
        );
        if (matches.length !== 1)
          throw Error("Native derived review image coverage differs");
        const image = matches[0]!,
          frame = kind === "anchor-crop" ? shot.detailFrame : shot.midFrame;
        const rect =
          kind === "phone"
            ? null
            : kind === "caption-crop"
              ? shot.captionCrop
              : crop;
        if (
          image.outputFrame !== frame ||
          !same(image.crop, rect) ||
          !same(image.projections, kind === "anchor-crop" ? projected : []) ||
          image.sourceFramePixelsSha256 !==
            sourceHashes[frames.indexOf(frame)] ||
          image.width !== (kind === "phone" ? LIMIT.phoneWidth : rect!.width) ||
          image.height !== (kind === "phone" ? LIMIT.phoneHeight : rect!.height)
        )
          throw Error(
            "Native derived review metadata differs from its current plan or projection",
          );
        const sourceFrame = full[frames.indexOf(frame)]!;
        const filter =
          kind === "phone"
            ? `scale=${LIMIT.phoneWidth}:${LIMIT.phoneHeight}:force_original_aspect_ratio=decrease:flags=area,pad=${LIMIT.phoneWidth}:${LIMIT.phoneHeight}:(ow-iw)/2:(oh-ih)/2:black`
            : `crop=${rect!.width}:${rect!.height}:${rect!.x}:${rect!.y}`;
        const hashes = await evidenceFrameHashes(
          await productionOwnedPath(input.outputRoot, sourceFrame.file.path),
          owner,
          input.signal,
          filter,
        );
        if (hashes.length !== 1 || hashes[0] !== image.pixelsSha256)
          throw Error(
            "Native review image differs from its actual encoded source transformation",
          );
        expected.push(image);
      }
      if (!crop)
        expectedExceptions.push({
          cue: shot.cue,
          outputFrame: shot.detailFrame,
          reason:
            "No declared active anchor has an actual in-frame projection; contact detail remains unavailable.",
          projections: projected,
        });
    }
    if (
      expected.length !== value.images.length ||
      !same(expectedExceptions, value.exceptions)
    )
      throw Error("Native review image or crop-exception coverage differs");
    for (const image of value.images) {
      const pin = await productionFile(
        input.outputRoot,
        image.file.path,
        owner,
      );
      if (!same(pin, image.file))
        throw Error("Native review image bytes changed");
      const path = await productionOwnedPath(input.outputRoot, image.file.path),
        shape = await productionReviewPngShape(path);
      const hashes = await evidenceFrameHashes(path, owner, input.signal);
      if (
        shape.width !== image.width ||
        shape.height !== image.height ||
        hashes.length !== 1 ||
        hashes[0] !== image.pixelsSha256
      )
        throw Error("Native review PNG shape or pixels differ");
    }
    if (
      value.audio.decodedSha256 !== input.decoded.audio.sha256 ||
      value.audio.decodedBytes !== input.decoded.audio.bytes ||
      value.audio.channels !== input.decoded.audio.channels ||
      value.audio.samples !== input.decoded.audio.samples
    )
      throw Error(
        "Native review audio metadata differs from complete final PCM",
      );
    const audio = await productionFile(
      input.outputRoot,
      value.audio.file.path,
      owner,
    );
    if (!same(audio, value.audio.file))
      throw Error("Native review WAV bytes changed");
    await assertAudio(
      await productionOwnedPath(input.outputRoot, value.audio.file.path),
      input.decoded,
      owner,
      input.signal,
    );
    return summary(value, input.evidence);
  } finally {
    loaded?.release();
    lease.release();
    owner.dispose();
  }
}
