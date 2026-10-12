import {
  MechanismProductionHandoffSchema,
  MECHANISM_PRODUCTION_HANDOFF_LIMITS,
} from "./production-handoff.ts";
import { mkdir, open } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { z } from "zod";
import { MechanismNarratedCycleSchema } from "@still-shift/scene-contract";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import { MechanismCueCompilationSchema } from "./cue-lifecycle.ts";
import { checkMechanismCueNativePlates } from "./cue-native-plates.ts";
import { mechanismPackHash } from "./pack-support.ts";
import {
  readProductionJSON,
  writeProductionJSON,
  productionFile,
  productionOwnedPath,
  productionFailure,
} from "./production-queue-files.ts";
import { cuePlateFile } from "./cue-plate-files.ts";
import {
  MechanismProductionEvidenceSchema,
  planMechanismProductionEvidence,
  MECHANISM_PRODUCTION_EVIDENCE_LIMITS as LIMIT,
  type MechanismProductionEvidence,
} from "./production-evidence-contract.ts";
import {
  evidenceProcess,
  evidenceFrameHashes,
  evidenceSelect,
} from "./production-evidence-process.ts";
import type { MechanismProductionBinding } from "./production-report.ts";
import type { MechanismProductionDecodedOutput } from "./production-output-check.ts";

type Projection =
  MechanismProductionEvidence["images"][number]["projections"][number];
const prefix = (name: string) => name + "-%06d.png";
const pngArgs = (
  source: string,
  filter: string,
  frames: number,
  destination: string,
  sequence = false,
) => [
  "-v",
  "error",
  "-nostdin",
  "-threads",
  "1",
  ...(sequence ? ["-start_number", "0"] : []),
  "-i",
  source,
  "-map",
  "0:v:0",
  "-an",
  "-vf",
  filter + ",format=rgba",
  "-fps_mode",
  "passthrough",
  "-frames:v",
  String(frames),
  "-threads",
  "1",
  "-start_number",
  "0",
  destination,
];
export function productionAnchorCrop(
  projections: readonly Projection[],
  width: number,
  height: number,
) {
  const points = projections.flatMap((p) =>
    p.pixel &&
    p.pixel[0] >= 0 &&
    p.pixel[0] < width &&
    p.pixel[1] >= 0 &&
    p.pixel[1] < height
      ? [p.pixel]
      : [],
  );
  if (!points.length) return null;
  const margin = Math.max(16, Math.ceil(Math.min(width, height) * 0.08));
  const x = Math.max(
      0,
      Math.min(
        width - 16,
        Math.floor(Math.min(...points.map((p) => p[0])) - margin),
      ),
    ),
    y = Math.max(
      0,
      Math.min(
        height - 16,
        Math.floor(Math.min(...points.map((p) => p[1])) - margin),
      ),
    );
  return {
    x,
    y,
    width: Math.max(
      16,
      Math.min(
        width - x,
        Math.ceil(Math.max(...points.map((p) => p[0])) + margin) - x,
      ),
    ),
    height: Math.max(
      16,
      Math.min(
        height - y,
        Math.ceil(Math.max(...points.map((p) => p[1])) + margin) - y,
      ),
    ),
  };
}
async function pngShape(path: string) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const bytes = Buffer.alloc(33);
    const read = await file.read(bytes, 0, 33, 0);
    if (
      read.bytesRead !== 33 ||
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      bytes.toString("ascii", 12, 16) !== "IHDR" ||
      bytes[24] !== 8 ||
      bytes[25] !== 6
    )
      productionFailure(
        "production-evidence-png",
        "Expected a complete RGBA8 PNG header",
        path,
      );
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  } finally {
    await file.close();
  }
}
async function audioHash(
  path: string,
  owner: CompositionNodeMemory,
  signal?: AbortSignal,
) {
  const result = await evidenceProcess(
    "ffmpeg",
    [
      "-v",
      "error",
      "-nostdin",
      "-threads",
      "1",
      "-i",
      path,
      "-map",
      "0:a:0",
      "-vn",
      "-c:a",
      "pcm_f32le",
      "-f",
      "hash",
      "-hash",
      "sha256",
      "pipe:1",
    ],
    owner,
    signal,
  );
  const match = /^SHA256=([a-f0-9]{64})\s*$/.exec(result.stdout);
  if (!match)
    productionFailure(
      "production-evidence-audio-hash",
      "Invalid actual PCM hash",
      path,
    );
  return "sha256:" + match[1];
}
async function audioFacts(
  path: string,
  owner: CompositionNodeMemory,
  signal?: AbortSignal,
) {
  const result = await evidenceProcess(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,sample_rate,channels,duration_ts,time_base",
      "-of",
      "json",
      path,
    ],
    owner,
    signal,
  );
  const data = z
    .object({
      streams: z
        .array(
          z
            .object({
              codec_type: z.literal("audio"),
              codec_name: z.literal("pcm_f32le"),
              sample_rate: z.literal("48000"),
              channels: z.number().int().min(1).max(2),
              duration_ts: z.number().int().positive(),
              time_base: z.literal("1/48000"),
            })
            .passthrough(),
        )
        .length(1),
    })
    .parse(JSON.parse(result.stdout));
  return data.streams[0]!;
}
async function captureEvidenceProjections(
  plan: MechanismProductionEvidence["plan"],
  familyPath: string,
  cuePath: string,
  preparedDirectory: string,
  platesDirectory: string,
  owner: CompositionNodeMemory,
  signal?: AbortSignal,
) {
  const selected = new Set(plan.shots.map((s) => s.midFrame)),
    projections = new Map<number, Projection[]>();
  const native = await checkMechanismCueNativePlates(
    familyPath,
    cuePath,
    preparedDirectory,
    platesDirectory,
    {
      nodeMemory: owner,
      signal: signal,
      onFrame: (packet) => {
        if (!selected.has(packet.outputFrame)) return;
        if (
          packet.version !== "native3d-observed-output-frame-2" ||
          packet.passes.length !== 1
        )
          productionFailure(
            "production-evidence-native-profile",
            "Crop projections require the declared single native2 pass",
            String(packet.outputFrame),
          );
        const shot = plan.shots.find((s) => s.midFrame === packet.outputFrame)!,
          observed = packet.passes[0]!.observed;
        projections.set(
          packet.outputFrame,
          shot.anchors.map((anchor) => {
            const actual = observed.anchors[anchor];
            if (!actual) return { anchor, pixel: null, visibility: "missing" };
            if ("status" in actual && actual.status === "not-drawn")
              return { anchor, pixel: null, visibility: actual.reason };
            return {
              anchor,
              pixel: actual.pixel
                ? ([...actual.pixel] as [number, number])
                : null,
              visibility: actual.visibility,
            };
          }),
        );
      },
    },
  );
  if (projections.size !== selected.size)
    productionFailure(
      "production-evidence-projections",
      "Original capture lacks selected output projections",
      platesDirectory,
    );

  return { native, projections };
}
/** The native executor supplies its newly checked full decode. Every review image is a lossless copy or an explicitly recorded crop/phone transformation. */
export async function buildMechanismProductionEvidence(input: {
  familyPath: string;
  cuePath: string;
  manifestPath?: string;
  episode: {
    id: string;
    question: string;
    family: "tape-hook" | "cable-tie" | "clothespeg";
    designVariant: string;
  };
  compilation: MechanismProductionEvidence["compilation"];
  platesDirectory: string;
  outputPath: string;
  decodedPath: string;
  outputRoot: string;
  directory: string;
  binding: MechanismProductionBinding;
  decoded: MechanismProductionDecodedOutput;
  nodeMemory: CompositionNodeMemory;
  signal?: AbortSignal | undefined;
}) {
  const owner = new CompositionNodeMemory(input.nodeMemory),
    storage = owner.reserve(LIMIT.retainedCapacityBytes);
  let cue:
    | Awaited<
        ReturnType<
          typeof readProductionJSON<
            z.infer<typeof MechanismNarratedCycleSchema>
          >
        >
      >
    | undefined;
  try {
    input.signal?.throwIfAborted();
    const output = await productionFile(
      input.outputRoot,
      relative(input.outputRoot, input.outputPath),
      owner,
    );
    if (output.sha256 !== input.binding.outputSha256)
      productionFailure(
        "production-evidence-output",
        "Evidence output differs from its current binding",
        input.outputPath,
      );
    cue = await readProductionJSON(
      input.cuePath,
      MechanismNarratedCycleSchema,
      owner,
      32 * 1024 * 1024,
      input.signal,
    );
    const plan = planMechanismProductionEvidence(cue.value);
    if (
      plan.cueProjectHash !== input.compilation.cue.projectHash ||
      plan.frameCount !== input.compilation.frameCount ||
      plan.fps !== input.compilation.fps ||
      plan.width !== input.compilation.width ||
      plan.height !== input.compilation.height ||
      input.decoded.frames !== plan.frameCount ||
      input.decoded.outputPath !== input.outputPath
    )
      productionFailure(
        "production-evidence-clock",
        "Evidence cue/compilation/output clocks differ",
        input.cuePath,
      );
    if (input.decoded.audio.bytes + 4096 > LIMIT.audioBytes)
      productionFailure(
        "production-evidence-audio-budget",
        "Review PCM exceeds prospective512MiB file admission",
        input.outputPath,
      );
    const { native, projections } = await captureEvidenceProjections(
      plan,
      input.familyPath,
      input.cuePath,
      dirname(input.compilation.composition.path),
      input.platesDirectory,
      owner,
      input.signal,
    );
    await mkdir(input.directory);
    const fullPattern = join(input.directory, prefix("frame")),
      frames = plan.samples.map((s) => s.frame),
      select = evidenceSelect(frames);
    const sourceHashes = await evidenceFrameHashes(
      input.outputPath,
      owner,
      input.signal,
      select,
    );
    if (sourceHashes.length !== frames.length)
      productionFailure(
        "production-evidence-source-frames",
        "Source sampler decoded an incomplete frame set",
        input.outputPath,
      );
    await evidenceProcess(
      "ffmpeg",
      pngArgs(input.outputPath, select, frames.length, fullPattern),
      owner,
      input.signal,
    );
    const decodedFrames = await evidenceFrameHashes(
      fullPattern,
      owner,
      input.signal,
      undefined,
      true,
    );
    if (mechanismPackHash(decodedFrames) !== mechanismPackHash(sourceHashes))
      productionFailure(
        "production-evidence-frame-pixels",
        "Review PNG sequence differs from actual final decoded frames",
        fullPattern,
      );
    const images: MechanismProductionEvidence["images"] = [],
      exceptions: MechanismProductionEvidence["exceptions"] = [];
    const image = async (
      path: string,
      kind: MechanismProductionEvidence["images"][number]["kind"],
      sourceFrame: number,
      pixelsSha256: string,
      width: number,
      height: number,
      cue: string | null,
      crop: MechanismProductionEvidence["images"][number]["crop"],
      points: Projection[],
    ) => {
      const actual = await pngShape(path);
      if (actual.width !== width || actual.height !== height)
        productionFailure(
          "production-evidence-shape",
          "Review PNG shape differs from its recorded transformation",
          path,
        );
      images.push({
        file: await productionFile(
          input.outputRoot,
          relative(input.outputRoot, path),
          owner,
        ),
        kind,
        outputFrame: sourceFrame,
        cue,
        width,
        height,
        pixelsSha256,
        sourceFramePixelsSha256: sourceHashes[frames.indexOf(sourceFrame)]!,
        crop,
        projections: points,
      });
    };
    for (const [index, sourceFrame] of frames.entries())
      await image(
        fullPattern.replace("%06d", String(index).padStart(6, "0")),
        "frame",
        sourceFrame,
        decodedFrames[index]!,
        plan.width,
        plan.height,
        null,
        null,
        [],
      );
    const midIndices = plan.shots.map((s) => frames.indexOf(s.midFrame)),
      midSelect = evidenceSelect(midIndices);
    const phoneFilter =
      midSelect +
      `,scale=${LIMIT.phoneWidth}:${LIMIT.phoneHeight}:force_original_aspect_ratio=decrease:flags=area,pad=${LIMIT.phoneWidth}:${LIMIT.phoneHeight}:(ow-iw)/2:(oh-ih)/2:black`;
    const phonePattern = join(input.directory, prefix("phone"));
    await evidenceProcess(
      "ffmpeg",
      pngArgs(fullPattern, phoneFilter, plan.shots.length, phonePattern, true),
      owner,
      input.signal,
    );
    const phoneHashes = await evidenceFrameHashes(
      phonePattern,
      owner,
      input.signal,
      undefined,
      true,
    );
    const captionRect = plan.shots[0]!.captionCrop;
    const captionPattern = join(input.directory, prefix("caption"));
    await evidenceProcess(
      "ffmpeg",
      pngArgs(
        fullPattern,
        midSelect +
          `,crop=${captionRect.width}:${captionRect.height}:${captionRect.x}:${captionRect.y}`,
        plan.shots.length,
        captionPattern,
        true,
      ),
      owner,
      input.signal,
    );
    const captionHashes = await evidenceFrameHashes(
      captionPattern,
      owner,
      input.signal,
      undefined,
      true,
    );
    if (
      phoneHashes.length !== plan.shots.length ||
      captionHashes.length !== plan.shots.length
    )
      productionFailure(
        "production-evidence-derived-frames",
        "Derived image sequences are incomplete",
        input.directory,
      );
    for (const [index, shot] of plan.shots.entries()) {
      const points = projections.get(shot.midFrame)!;
      await image(
        phonePattern.replace("%06d", String(index).padStart(6, "0")),
        "phone",
        shot.midFrame,
        phoneHashes[index]!,
        LIMIT.phoneWidth,
        LIMIT.phoneHeight,
        shot.cue,
        null,
        points,
      );
      await image(
        captionPattern.replace("%06d", String(index).padStart(6, "0")),
        "caption-crop",
        shot.midFrame,
        captionHashes[index]!,
        captionRect.width,
        captionRect.height,
        shot.cue,
        captionRect,
        [],
      );
      const crop = productionAnchorCrop(points, plan.width, plan.height);
      if (!crop) {
        exceptions.push({
          cue: shot.cue,
          outputFrame: shot.midFrame,
          reason:
            "No declared anchor has an actual in-frame pixel; contact/anchor detail remains unavailable.",
          projections: points,
        });
        continue;
      }
      const source = fullPattern.replace(
          "%06d",
          String(frames.indexOf(shot.midFrame)).padStart(6, "0"),
        ),
        destination = join(
          input.directory,
          `anchor-${String(index).padStart(6, "0")}.png`,
        );
      await evidenceProcess(
        "ffmpeg",
        pngArgs(
          source,
          `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`,
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
        productionFailure(
          "production-evidence-crop",
          "Crop decode is incomplete",
          destination,
        );
      await image(
        destination,
        "anchor-crop",
        shot.midFrame,
        hashes[0]!,
        crop.width,
        crop.height,
        shot.cue,
        crop,
        points,
      );
    }
    if (images.length > LIMIT.images)
      productionFailure(
        "production-evidence-image-budget",
        "Evidence image count exceeds its bound",
        input.directory,
      );
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
        input.outputPath,
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
    const facts = await audioFacts(audioPath, owner, input.signal),
      pcmSha256 = await audioHash(audioPath, owner, input.signal);
    if (
      pcmSha256 !== input.decoded.audio.sha256 ||
      facts.duration_ts * facts.channels * 4 !== input.decoded.audio.bytes ||
      facts.channels !== input.decoded.audio.channels
    )
      productionFailure(
        "production-evidence-audio",
        "Review audio differs from complete final decoded PCM",
        audioPath,
      );
    const audioFile = await productionFile(
      input.outputRoot,
      relative(input.outputRoot, audioPath),
      owner,
    );
    const evidence = MechanismProductionEvidenceSchema.parse({
      schemaVersion: "mechanism-production-evidence-1",
      binding: input.binding,
      output,
      decodedReport: await productionFile(
        input.outputRoot,
        relative(input.outputRoot, input.decodedPath),
        owner,
      ),
      compilation: input.compilation,
      plan,
      nativeCapture: {
        nativePictureSha256: native.nativePictureSha256,
        sequenceSha256: native.sequenceSha256,
        originalNativeFrames: native.originalNativeFrames,
        method: "verified-original-native-projections-no-fresh-draws",
      },
      images,
      audio: {
        file: audioFile,
        decodedSha256: pcmSha256,
        decodedBytes: input.decoded.audio.bytes,
        samples: facts.duration_ts,
        channels: facts.channels,
        sampleRate: 48000,
        method: "unmodified-float32-PCM-from-final-output",
      },
      exceptions,
      qualification:
        "Actual final-file samples, explicit phone/crop transforms and unmodified final decoded PCM. Native crop projections retain visibility/occlusion. No full glyph, mechanical, continuous-motion, listening, factual or human acceptance is inferred.",
    });
    const path = join(input.directory, "evidence.json");
    await writeProductionJSON(path, evidence, owner, LIMIT.manifestBytes, true);
    await cuePlateFile(input.outputPath, owner, {
      sha256: output.sha256,
      signal: input.signal,
    });
    await cuePlateFile(input.cuePath, owner, {
      sha256: cue.sha256,
      signal: input.signal,
    });
    const manifest = await productionFile(
      input.outputRoot,
      relative(input.outputRoot, path),
      owner,
    );
    const handoff = MechanismProductionHandoffSchema.parse({
      schemaVersion: "mechanism-production-handoff-1",
      ...input.episode,
      binding: input.binding,
      sourceStatus: "generation-snapshot",
      compilation: input.compilation,
      resume: {
        manifestPath: input.manifestPath ?? null,
        outputDirectory: input.outputRoot,
        familyPath: input.familyPath,
        cuePath: input.cuePath,
      },
      assets: {
        video: output,
        audio: audioFile,
        evidence: manifest,
        decodedReport: evidence.decodedReport,
      },
      summary: {
        shots: plan.shots.length,
        sampledFrames: plan.samples.length,
        images: images.length,
        cropExceptions: exceptions.length,
      },
      qa: {
        technical: "passed",
        mechanical: "unreviewed",
        "sampled-visual": "unreviewed",
        "continuous-motion": "unreviewed",
        listening: "unreviewed",
        factual: "unreviewed",
      },
      reviewedReady: false,
      nextAction:
        "Run production handoff against the current manifest/output for fresh-session validation. Inspect the evidence images and final audio; keep unfinished reviews visible. Use the recorded cue/family revision and project hash for a scoped patch.",
      qualification:
        "Artifact-bound generation snapshot with exact source CAS and complete evidence access; human, factual, whole-mechanical, continuous-motion and listening acceptance remain unreviewed.",
    });
    const handoffPath = join(input.directory, "handoff.json");
    await writeProductionJSON(
      handoffPath,
      handoff,
      owner,
      MECHANISM_PRODUCTION_HANDOFF_LIMITS.bytes,
      true,
    );
    return {
      path,
      manifest,
      audio: audioFile,
      handoff: await productionFile(
        input.outputRoot,
        relative(input.outputRoot, handoffPath),
        owner,
      ),
    };
  } finally {
    cue?.release();
    storage.release();
    owner.dispose();
  }
}
/** Called after the native verifier's current complete decode; nested files remain owned and every decoded review image/audio identity is rechecked. */
export async function checkMechanismProductionEvidence(
  path: string,
  root: string,
  binding: MechanismProductionBinding,
  decoded: MechanismProductionDecodedOutput,
  owner: CompositionNodeMemory,
  signal?: AbortSignal,
  source?: {
    familyPath: string;
    cuePath: string;
    preparedDirectory: string;
    platesDirectory: string;
  },
) {
  const loaded = await readProductionJSON(
    path,
    MechanismProductionEvidenceSchema,
    owner,
    LIMIT.manifestBytes,
    signal,
  );
  try {
    const evidence = loaded.value;
    if (!source)
      productionFailure(
        "production-evidence-source",
        "Current source locators are required to verify review transforms",
        path,
      );
    const compiled = await readProductionJSON(
      join(source.preparedDirectory, "cue-compilation.json"),
      MechanismCueCompilationSchema,
      owner,
      65536,
      signal,
    );
    try {
      if (
        mechanismPackHash(compiled.value) !==
        mechanismPackHash(evidence.compilation)
      )
        productionFailure(
          "production-evidence-compilation",
          "Review evidence differs from the current verified compilation receipt",
          path,
        );
    } finally {
      compiled.release();
    }
    const cue = await readProductionJSON(
      source.cuePath,
      MechanismNarratedCycleSchema,
      owner,
      32 * 1024 * 1024,
      signal,
    );
    let expectedPlan: MechanismProductionEvidence["plan"];
    try {
      expectedPlan = planMechanismProductionEvidence(cue.value);
    } finally {
      cue.release();
    }
    if (mechanismPackHash(expectedPlan) !== mechanismPackHash(evidence.plan))
      productionFailure(
        "production-evidence-plan",
        "Review plan differs from the current cue revision and output clock",
        source.cuePath,
      );
    const { native, projections } = await captureEvidenceProjections(
      expectedPlan,
      source.familyPath,
      source.cuePath,
      source.preparedDirectory,
      source.platesDirectory,
      owner,
      signal,
    );
    if (
      native.nativePictureSha256 !==
        evidence.nativeCapture.nativePictureSha256 ||
      native.sequenceSha256 !== evidence.nativeCapture.sequenceSha256 ||
      native.originalNativeFrames !==
        evidence.nativeCapture.originalNativeFrames
    )
      productionFailure(
        "production-evidence-native-binding",
        "Review projections differ from the current verified original capture",
        path,
      );

    if (
      mechanismPackHash(evidence.binding) !== mechanismPackHash(binding) ||
      evidence.output.sha256 !== binding.outputSha256 ||
      evidence.plan.frameCount !== decoded.frames ||
      evidence.plan.width !== decoded.width ||
      evidence.plan.height !== decoded.height ||
      evidence.plan.fps !== decoded.fps ||
      evidence.audio.decodedSha256 !== decoded.audio.sha256 ||
      evidence.audio.decodedBytes !== decoded.audio.bytes
    )
      productionFailure(
        "production-evidence-binding",
        "Review evidence differs from its current output/code/profile/clock",
        path,
      );
    const paths = new Set<string>();
    for (const file of [
      evidence.output,
      evidence.decodedReport,
      evidence.audio.file,
      ...evidence.images.map((image) => image.file),
    ]) {
      if (paths.has(file.path))
        productionFailure(
          "production-evidence-duplicate",
          "Review evidence contains duplicate owned file locators",
          file.path,
        );
      paths.add(file.path);
      const actual = await productionFile(root, file.path, owner);
      if (actual.sha256 !== file.sha256 || actual.bytes !== file.bytes)
        productionFailure(
          "production-evidence-file",
          "Review artifact bytes changed",
          file.path,
        );
    }
    const images = evidence.images.filter((image) => image.kind === "frame");
    if (
      images.length !== evidence.plan.samples.length ||
      images.some(
        (image, i) =>
          image.outputFrame !== evidence.plan.samples[i]!.frame ||
          image.width !== decoded.width ||
          image.height !== decoded.height ||
          image.pixelsSha256 !== image.sourceFramePixelsSha256,
      )
    )
      productionFailure(
        "production-evidence-coverage",
        "Review source-frame mapping is incomplete or inconsistent",
        path,
      );
    const sourceHashes = await evidenceFrameHashes(
      await productionOwnedPath(root, evidence.output.path),
      owner,
      signal,
      evidenceSelect(images.map((image) => image.outputFrame)),
    );
    if (
      mechanismPackHash(sourceHashes) !==
      mechanismPackHash(images.map((image) => image.pixelsSha256))
    )
      productionFailure(
        "production-evidence-current-pixels",
        "Review samples differ from actual current decoded video",
        path,
      );
    for (const kind of ["frame", "phone", "caption-crop"] as const) {
      const group = evidence.images.filter((image) => image.kind === kind);
      if (!group.length)
        productionFailure(
          "production-evidence-sequence",
          "Required review sequence is absent",
          kind,
        );
      const pattern = resolve(root, group[0]!.file.path).replace(
        /-\d{6}\.png$/,
        "-%06d.png",
      );
      const hashes = await evidenceFrameHashes(
        pattern,
        owner,
        signal,
        undefined,
        true,
      );
      if (
        mechanismPackHash(hashes) !==
        mechanismPackHash(group.map((image) => image.pixelsSha256))
      )
        productionFailure(
          "production-evidence-decoded-pixels",
          "Review PNG pixels differ from recorded values",
          pattern,
        );
    }

    const fullPattern = resolve(root, images[0]!.file.path).replace(
      /-\d{6}\.png$/,
      "-%06d.png",
    );
    const midIndices = expectedPlan.shots.map((shot) =>
      images.findIndex((image) => image.outputFrame === shot.midFrame),
    );
    if (midIndices.some((i) => i < 0))
      productionFailure(
        "production-evidence-mid-coverage",
        "Review evidence lacks shot-mid sources",
        path,
      );
    const select = evidenceSelect(midIndices),
      phone = evidence.images.filter((image) => image.kind === "phone"),
      captions = evidence.images.filter(
        (image) => image.kind === "caption-crop",
      );
    const captionRect = expectedPlan.shots[0]!.captionCrop;
    const expectedPhones = await evidenceFrameHashes(
      fullPattern,
      owner,
      signal,
      select +
        `,scale=${LIMIT.phoneWidth}:${LIMIT.phoneHeight}:force_original_aspect_ratio=decrease:flags=area,pad=${LIMIT.phoneWidth}:${LIMIT.phoneHeight}:(ow-iw)/2:(oh-ih)/2:black`,
      true,
    );
    const expectedCaptions = await evidenceFrameHashes(
      fullPattern,
      owner,
      signal,
      select +
        `,crop=${captionRect.width}:${captionRect.height}:${captionRect.x}:${captionRect.y}`,
      true,
    );
    if (
      mechanismPackHash(expectedPhones) !==
        mechanismPackHash(phone.map((image) => image.pixelsSha256)) ||
      mechanismPackHash(expectedCaptions) !==
        mechanismPackHash(captions.map((image) => image.pixelsSha256))
    )
      productionFailure(
        "production-evidence-transform",
        "Phone/caption pixels do not match the declared transformation of actual source frames",
        path,
      );
    const expectedExceptions: MechanismProductionEvidence["exceptions"] = [];
    for (const [index, shot] of expectedPlan.shots.entries()) {
      const points = projections.get(shot.midFrame)!;
      for (const image of [phone[index], captions[index]])
        if (
          !image ||
          image.outputFrame !== shot.midFrame ||
          image.cue !== shot.cue
        )
          productionFailure(
            "production-evidence-shot",
            "Derived image is bound to the wrong shot/output frame",
            path,
          );
      if (
        mechanismPackHash(phone[index]!.projections) !==
          mechanismPackHash(points) ||
        captions[index]!.width !== captionRect.width ||
        captions[index]!.height !== captionRect.height ||
        mechanismPackHash(captions[index]!.crop) !==
          mechanismPackHash(captionRect)
      )
        productionFailure(
          "production-evidence-shot-metadata",
          "Derived review metadata differs from actual projections/caption geometry",
          path,
        );
      const originalPixelHash = images[midIndices[index]!]!.pixelsSha256;
      if (
        phone[index]!.sourceFramePixelsSha256 !== originalPixelHash ||
        captions[index]!.sourceFramePixelsSha256 !== originalPixelHash ||
        phone[index]!.width !== LIMIT.phoneWidth ||
        phone[index]!.height !== LIMIT.phoneHeight ||
        phone[index]!.crop !== null ||
        captions[index]!.projections.length !== 0
      )
        productionFailure(
          "production-evidence-transform-metadata",
          "Derived image metadata differs from its actual source frame and transformation",
          path,
        );
      const crop = productionAnchorCrop(points, decoded.width, decoded.height),
        matches = evidence.images.filter(
          (image) => image.kind === "anchor-crop" && image.cue === shot.cue,
        );
      if (!crop) {
        if (matches.length)
          productionFailure(
            "production-evidence-unavailable-crop",
            "Unavailable contact projection cannot have a claimed crop",
            path,
          );
        expectedExceptions.push({
          cue: shot.cue,
          outputFrame: shot.midFrame,
          reason:
            "No declared anchor has an actual in-frame pixel; contact/anchor detail remains unavailable.",
          projections: points,
        });
        continue;
      }
      const image = matches[0];
      if (
        matches.length !== 1 ||
        !image ||
        image.outputFrame !== shot.midFrame ||
        mechanismPackHash(image.crop) !== mechanismPackHash(crop) ||
        mechanismPackHash(image.projections) !== mechanismPackHash(points)
      )
        productionFailure(
          "production-evidence-anchor-metadata",
          "Anchor crop is not bound to its actual original native projection",
          path,
        );
      if (
        image.width !== crop.width ||
        image.height !== crop.height ||
        image.sourceFramePixelsSha256 !== originalPixelHash
      )
        productionFailure(
          "production-evidence-anchor-shape",
          "Anchor crop dimensions/source identity differ from its actual projection",
          path,
        );
      const original = await productionOwnedPath(
        root,
        images[midIndices[index]!]!.file.path,
      );
      const expected = await evidenceFrameHashes(
        original,
        owner,
        signal,
        `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`,
      );
      if (expected.length !== 1 || expected[0] !== image.pixelsSha256)
        productionFailure(
          "production-evidence-anchor-transform",
          "Anchor crop pixels differ from actual projected source region",
          path,
        );
    }
    if (
      evidence.images.filter((image) => image.kind === "anchor-crop").length !==
        expectedPlan.shots.length - expectedExceptions.length ||
      mechanismPackHash(expectedExceptions) !==
        mechanismPackHash(evidence.exceptions)
    )
      productionFailure(
        "production-evidence-crop-coverage",
        "Crop coverage/exception list differs from the current native source",
        path,
      );
    for (const image of evidence.images) {
      const file = await productionOwnedPath(root, image.file.path),
        shape = await pngShape(file);
      if (shape.width !== image.width || shape.height !== image.height)
        productionFailure(
          "production-evidence-shape",
          "Review PNG dimensions changed",
          file,
        );
      if (image.kind === "anchor-crop") {
        const hashes = await evidenceFrameHashes(file, owner, signal);
        if (hashes.length !== 1 || hashes[0] !== image.pixelsSha256)
          productionFailure(
            "production-evidence-crop-pixels",
            "Anchor crop pixels changed",
            file,
          );
      }
    }
    const sound = await audioFacts(
      await productionOwnedPath(root, evidence.audio.file.path),
      owner,
      signal,
    );
    if (
      sound.channels !== decoded.audio.channels ||
      sound.channels !== evidence.audio.channels ||
      sound.duration_ts !== evidence.audio.samples ||
      sound.duration_ts * sound.channels * 4 !== decoded.audio.bytes
    )
      productionFailure(
        "production-evidence-audio-clock",
        "Review PCM channel/sample clock differs from the actual final decode",
        path,
      );
    const pcm = await audioHash(
      await productionOwnedPath(root, evidence.audio.file.path),
      owner,
      signal,
    );
    if (pcm !== decoded.audio.sha256)
      productionFailure(
        "production-evidence-current-audio",
        "Review audio differs from current full PCM decode",
        path,
      );
    return {
      images: evidence.images.length,
      samples: evidence.plan.samples.length,
      exceptions: evidence.exceptions.length,
      compilation: evidence.compilation,
      assets: {
        video: evidence.output,
        audio: evidence.audio.file,
        decodedReport: evidence.decodedReport,
      },
      summary: {
        shots: evidence.plan.shots.length,
        sampledFrames: evidence.plan.samples.length,
        images: evidence.images.length,
        cropExceptions: evidence.exceptions.length,
      },
    };
  } finally {
    loaded.release();
  }
}
