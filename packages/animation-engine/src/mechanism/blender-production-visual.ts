import { z } from "zod";
import { mkdir, open } from "node:fs/promises";
import { constants } from "node:fs";
import { join, relative } from "node:path";
import {
  CompositionSchema,
  type Composition,
  MechanismHashSchema,
} from "@still-shift/scene-contract";
import {
  CompositionQualityPolicySchema,
  type CompositionQualityPolicy,
} from "@still-shift/renderer-core";
import {
  CompositionNodeMemory,
  compositionNodeJsonSize,
} from "@still-shift/execution-runtime/export";
import { lintCompositionFile } from "../composition-lint.ts";
import { blenderEpisodeFrameCount } from "./blender-episode-contract.ts";
import type { compileBlenderEpisode } from "./blender-episode-compile.ts";
import {
  checkBlenderEpisodePlates,
  BlenderEpisodePlatesSchema,
  type BlenderEpisodePlates,
} from "./blender-episode-plates.ts";
import type { BlenderProductionIdentity } from "./blender-production-identity.ts";
import {
  MechanismProductionBindingSchema,
  type MechanismProductionBinding,
} from "./production-report.ts";
import { MechanismProductionOwnedFileSchema } from "./production-queue-contract.ts";
import {
  productionFile,
  productionOwnedPath,
  readProductionJSON,
  writeProductionJSON,
} from "./production-queue-files.ts";
import {
  evidenceProcess,
  evidenceSelect,
  evidenceFrameHashes,
} from "./production-evidence-process.ts";
import { groupMechanismProductionWarnings } from "./production-warnings.ts";
import { mechanismPackHash } from "./pack-support.ts";
type Compiled = ReturnType<typeof compileBlenderEpisode>;
const speechCaptionSchema =
  CompositionQualityPolicySchema.shape.speechCaptions.unwrap().element;
type Pin = z.infer<typeof MechanismProductionOwnedFileSchema>;
export const BLENDER_PRODUCTION_VISUAL_LIMITS = {
  layerFrames: 100000,
  capacityBytes: 256 * 1024 * 1024,
  retainedCapacityBytes: 32 * 1024 * 1024,
  reportBytes: 8 * 1024 * 1024,
  warningRows: 2048,
  badFrames: 512,
} as const;
export function admitBlenderProductionVisualWork(
  frameCount: number,
  layers: number,
) {
  if (
    !Number.isSafeInteger(frameCount) ||
    frameCount < 1 ||
    frameCount > 2000 ||
    !Number.isSafeInteger(layers) ||
    layers < 1 ||
    layers > 514
  )
    throw Error("Native visual QA requires bounded episode frame/layer counts");
  const layerFrames = frameCount * layers,
    capacity = 2 * 1024 * 1024 + layerFrames * 4096;
  if (
    layerFrames > BLENDER_PRODUCTION_VISUAL_LIMITS.layerFrames ||
    capacity > BLENDER_PRODUCTION_VISUAL_LIMITS.capacityBytes
  )
    throw Error(
      "Native visual QA layer-frame/capacity budget exceeded before analysis",
    );
  return capacity;
}
/** The policy comes from the pinned original episode plan, independently of the saved text being checked. */
export function blenderProductionVisualPolicy(
  compiled: Compiled,
): CompositionQualityPolicy {
  return {
    speechCaptions: compiled.plan.speech.map((c) => ({
      id: "caption-" + c.id,
      cueId: c.id,
      purpose: "Display authored speech",
      layer: "speech-" + c.id,
      text: c.text,
      start: blenderEpisodeFrameCount(c.startSample, compiled.plan.fps),
      end: blenderEpisodeFrameCount(c.endSampleExclusive, compiled.plan.fps),
      sourceSha256: compiled.speechSourceSha256,
      audioLayer: "narration",
      audioSha256: compiled.plan.narration.sha256,
      locale: compiled.plan.locale,
    })),
    intentionalCuts: compiled.plan.shots.slice(1).map((s) => s.start),
    shots: compiled.plan.shots.map((s) => ({
      id: s.id,
      start: s.start,
      end: s.endExclusive,
    })),
  };
}
/** Diagnose source mismatches before strict caption-policy validation, preserving source locations for frame evidence. */
export function blenderProductionSpeechFindings(
  compiled: Compiled,
  composition: Composition,
) {
  const expected = blenderProductionVisualPolicy(compiled),
    valid: NonNullable<CompositionQualityPolicy["speechCaptions"]> = [];
  const findings: {
    code: string;
    severity: "error";
    frames: [number, number];
    nodes: string[];
    measured: number;
    message: string;
    path: string;
    cueId: string;
  }[] = [];
  for (const cue of expected.speechCaptions!) {
    const text = composition.layers.find((l) => l.id === cue.layer),
      audio = composition.layers.find((l) => l.id === cue.audioLayer),
      asset =
        audio?.type === "audio"
          ? composition.assets.find((a) => a.id === audio.asset)
          : undefined;
    const declared = speechCaptionSchema.safeParse(text?.metadata?.speechCue);
    const copied =
      text?.type === "text" &&
      text.textRole === "body" &&
      text.text === cue.text &&
      text.inPoint === cue.start &&
      text.outPoint === cue.end &&
      declared.success &&
      mechanismPackHash(declared.data) === mechanismPackHash(cue);
    const sourceCue = compiled.plan.speech.find((c) => c.id === cue.cueId)!;
    const audible =
      audio?.type === "audio" &&
      audio.role === "narration" &&
      asset?.type === "audio" &&
      asset.sha256 === cue.audioSha256 &&
      asset.sampleRate === compiled.plan.narration.sampleRate &&
      asset.sampleCount === compiled.plan.narration.sampleCount &&
      (audio.inPoint ?? 0) === 0 &&
      (audio.sourceStartSample ?? 0) === 0 &&
      (audio.outPoint ?? composition.frameCount) >= cue.end &&
      (audio.sourceEndSample ?? asset.sampleCount) >=
        sourceCue.endSampleExclusive;
    if (!copied)
      findings.push({
        code: "native-speech-source-mismatch",
        severity: "error",
        frames: [cue.start, cue.end - 1],
        nodes: [cue.layer],
        measured: 1,
        message:
          "Caption copy, body role, source metadata or display boundaries differ from the pinned original cue.",
        path: "layers." + cue.layer,
        cueId: cue.cueId,
      });
    if (!audible)
      findings.push({
        code: "native-speech-audio-missing",
        severity: "error",
        frames: [cue.start, cue.end - 1],
        nodes: [cue.layer, cue.audioLayer],
        measured: 1,
        message:
          "Pinned original narration does not cover the complete displayed source cue.",
        path: "layers." + cue.audioLayer,
        cueId: cue.cueId,
      });
    if (copied && audible) valid.push(cue);
  }
  return {
    expectedPolicy: expected,
    evaluatedPolicy: { ...expected, speechCaptions: valid },
    findings,
  };
}
export const BlenderProductionRenderedVisualSchema = z
  .object({
    schemaVersion: z.literal("blender-production-rendered-visual-1"),
    binding: MechanismProductionBindingSchema,
    source: z
      .object({
        composition: MechanismProductionOwnedFileSchema,
        plates: MechanismProductionOwnedFileSchema,
        video: MechanismProductionOwnedFileSchema,
      })
      .strict(),
    method: z.literal(
      "all-output-frame-cached-native-sequence-preview-pixels-and-measured-glyphs",
    ),
    frameCount: z.number().int().positive().max(2000),
    nativeSubmissionCalls: z.literal(0),
    speechSourceSha256: MechanismHashSchema,
    policy: CompositionQualityPolicySchema,
    evaluatedPolicy: CompositionQualityPolicySchema,
    quality: z
      .object({
        status: z.enum(["passed", "failed"]),
        diagnostics: z
          .array(
            z
              .object({
                code: z.string(),
                severity: z.enum(["error", "warning"]),
                frames: z.tuple([
                  z.number().int().nonnegative(),
                  z.number().int().nonnegative(),
                ]),
                nodes: z.array(z.string()),
                measured: z.number().finite(),
                message: z.string(),
              })
              .passthrough(),
          )
          .max(2048),
      })
      .passthrough(),
    textBounds: z.record(z.string(), z.array(z.unknown())),
    images: z
      .array(
        z
          .object({
            frame: z.number().int().nonnegative().max(1999),
            file: MechanismProductionOwnedFileSchema,
            pixelsSha256: MechanismHashSchema,
          })
          .strict(),
      )
      .max(512),
    qualification: z.string().max(2048),
  })
  .strict()
  .superRefine((report, ctx) => {
    const reject = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (report.source.video.sha256 !== report.binding.outputSha256)
      reject("Native rendered QA must bind the actual encoded video artifact");
    const frames = new Set(report.images.map((i) => i.frame));
    if (
      frames.size !== report.images.length ||
      report.images.some(
        (i, index) =>
          i.frame >= report.frameCount ||
          (index > 0 && i.frame <= report.images[index - 1]!.frame),
      )
    )
      reject(
        "Native failure images must be unique, ordered and inside the output clock",
      );
    for (const d of report.quality.diagnostics)
      if (
        d.frames[0] > d.frames[1] ||
        d.frames[1] >= report.frameCount ||
        !frames.has(d.frames[0]) ||
        !frames.has(d.frames[1])
      )
        reject(
          "Every visual warning endpoint needs its bound encoded failure image",
        );
    if (
      report.quality.status !==
      (report.quality.diagnostics.some((d) => d.severity === "error")
        ? "failed"
        : "passed")
    )
      reject("Native visual status must agree with its original findings");
  });

const units: Record<string, string> = {
  "opacity-pop": "opacity-alpha",
  "scale-pop": "scale-ratio",
  "velocity-discontinuity": "velocity-jump-ratio",
  "frozen-run": "output-frames",
  "frozen-pixels": "output-frames",
  "easing-monotony": "fraction",
  "co-start": "layer-count",
  "off-canvas": "indicator",
  "outside-safe-area": "indicator",
  coverage: "indicator",
  "reading-time": "output-frames",
  "native-speech-source-mismatch": "indicator",
  "native-speech-audio-missing": "indicator",
};
async function pngSize(path: string) {
  const f = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const b = Buffer.alloc(33),
      read = await f.read(b, 0, 33, 0);
    if (
      read.bytesRead !== 33 ||
      !b
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      b.toString("ascii", 12, 16) !== "IHDR" ||
      b[24] !== 8 ||
      b[25] !== 6
    )
      throw Error("Native QA image must be an RGBA8 PNG");
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  } finally {
    await f.close();
  }
}
export async function evaluateBlenderProductionVisualQA(input: {
  compiled: Compiled;
  map: BlenderEpisodePlates;
  identity: BlenderProductionIdentity;
  binding: MechanismProductionBinding;
  outputRoot: string;
  directory: string;
  composition: Pin;
  plates: Pin;
  video: Pin;
  owner: CompositionNodeMemory;
  signal?: AbortSignal | undefined;
  verify?: boolean;
}) {
  const owner = new CompositionNodeMemory(input.owner);
  owner.reserve(BLENDER_PRODUCTION_VISUAL_LIMITS.retainedCapacityBytes);
  let source:
    | Awaited<
        ReturnType<typeof readProductionJSON<typeof CompositionSchema._output>>
      >
    | undefined;
  try {
    input.signal?.throwIfAborted();
    if (
      input.binding.outputSha256 !== input.video.sha256 ||
      input.binding.codeSha256 !== input.identity.codeSha256 ||
      input.binding.profileSha256 !== input.identity.profileSha256
    )
      throw Error(
        "Native visual QA requires the current producer and actual export binding",
      );
    const artifactDirectory = await productionOwnedPath(
      input.outputRoot,
      relative(input.outputRoot, input.directory),
    );
    const authenticate = async () => {
      const auth = new CompositionNodeMemory(owner);
      try {
        const map = await readProductionJSON(
          await productionOwnedPath(input.outputRoot, input.plates.path),
          BlenderEpisodePlatesSchema,
          auth,
          4 * 1024 * 1024,
          input.signal,
        );
        try {
          if (
            map.sha256 !== input.plates.sha256 ||
            mechanismPackHash(map.value) !== mechanismPackHash(input.map)
          )
            throw Error("Native visual QA map differs from its bound artifact");
        } finally {
          map.release();
        }
        await checkBlenderEpisodePlates(
          input.map,
          input.compiled,
          input.identity,
          input.outputRoot,
          auth,
          input.signal,
        );
      } finally {
        auth.dispose();
      }
      for (const expected of [input.video, input.composition, input.plates]) {
        const actual = await productionFile(
          input.outputRoot,
          expected.path,
          owner,
        );
        if (mechanismPackHash(actual) !== mechanismPackHash(expected))
          throw Error("Native visual QA source artifact changed");
      }
    };
    await authenticate();
    const sourcePath = await productionOwnedPath(
      input.outputRoot,
      input.composition.path,
    );
    source = await readProductionJSON(
      sourcePath,
      CompositionSchema,
      owner,
      1024 * 1024,
      input.signal,
    );
    if (source.sha256 !== input.composition.sha256)
      throw Error("Native visual QA source hash changed during admission");
    const c = source.value;
    if (
      c.frameCount !== input.compiled.frameCount ||
      c.width !== input.compiled.plan.width ||
      c.height !== input.compiled.plan.height ||
      c.fps !== input.compiled.plan.fps ||
      c.precomps?.length ||
      c.assets.some((a) => a.type === "native3d") ||
      c.layers.some((l) => l.type === "native3d" || l.native3D !== undefined) ||
      !c.assets.some(
        (a) => a.type === "sequence" && a.sha256 === input.map.sequence.sha256,
      )
    )
      throw Error(
        "Native visual QA requires the matching flat authenticated sequence and episode clock",
      );
    const speech = blenderProductionSpeechFindings(input.compiled, c);
    const policy = speech.expectedPolicy,
      capacity = admitBlenderProductionVisualWork(
        c.frameCount,
        c.layers.length,
      ),
      lease = owner.reserve(capacity);
    let quality;
    try {
      quality = await lintCompositionFile(sourcePath, speech.evaluatedPolicy, {
        backend: "webgl2",
        pixels: true,
        collectTextBounds: true,
        collectStatistics: true,
        nodeMemory: owner,
        signal: input.signal,
      });
    } finally {
      lease.release();
    }
    if (
      !quality.measured.pixels ||
      !quality.measured.textBounds ||
      !quality.textBounds ||
      !quality.renderStatistics
    )
      throw Error(
        "Native visual QA requires actual all-frame pixels, glyph bounds and submission counters",
      );
    if (
      quality.renderStatistics.byLayerType.some(
        (r) => r.type.startsWith("native3d") && r.calls !== 0,
      )
    )
      throw Error("Native visual QA unexpectedly submitted fresh geometry");
    if (
      quality.diagnostics.length > BLENDER_PRODUCTION_VISUAL_LIMITS.warningRows
    )
      throw Error("Native visual warning budget exceeded");
    const { renderStatistics: discarded, ...renderedQuality } = quality;
    const diagnostics = [...speech.findings, ...quality.diagnostics];
    const stableQuality = {
      ...renderedQuality,
      diagnostics,
      status: diagnostics.some((d) => d.severity === "error")
        ? ("failed" as const)
        : ("passed" as const),
    };
    void discarded;
    compositionNodeJsonSize(
      stableQuality,
      0,
      "",
      BLENDER_PRODUCTION_VISUAL_LIMITS.reportBytes,
    );
    const frames = [...new Set(diagnostics.flatMap((d) => d.frames))].sort(
      (a, b) => a - b,
    );
    if (
      frames.length > BLENDER_PRODUCTION_VISUAL_LIMITS.badFrames ||
      frames.some((f) => f < 0 || f >= c.frameCount)
    )
      throw Error("Native visual bad-frame evidence budget or clock exceeded");
    const images: { frame: number; file: Pin; pixelsSha256: string }[] = [];
    if (frames.length) {
      const directory = join(artifactDirectory, "qa-bad-frames"),
        pattern = join(directory, "frame-%06d.png"),
        video = await productionOwnedPath(input.outputRoot, input.video.path);
      if (!input.verify) {
        await mkdir(directory, { recursive: false });
        await evidenceProcess(
          "ffmpeg",
          [
            "-v",
            "error",
            "-nostdin",
            "-threads",
            "1",
            "-i",
            video,
            "-map",
            "0:v:0",
            "-an",
            "-vf",
            evidenceSelect(frames) + ",format=rgba",
            "-fps_mode",
            "passthrough",
            "-frames:v",
            String(frames.length),
            "-threads",
            "1",
            "-start_number",
            "0",
            pattern,
          ],
          owner,
          input.signal,
        );
      }
      const sourceHashes = await evidenceFrameHashes(
          video,
          owner,
          input.signal,
          evidenceSelect(frames),
        ),
        imageHashes = await evidenceFrameHashes(
          pattern,
          owner,
          input.signal,
          undefined,
          true,
        );
      if (
        sourceHashes.length !== frames.length ||
        mechanismPackHash(sourceHashes) !== mechanismPackHash(imageHashes)
      )
        throw Error(
          "Native QA bad-frame PNGs differ from the actual encoded video",
        );
      for (const [index, frame] of frames.entries()) {
        const path = join(
          directory,
          "frame-" + String(index).padStart(6, "0") + ".png",
        );
        if (
          mechanismPackHash(await pngSize(path)) !==
          mechanismPackHash([c.width, c.height])
        )
          throw Error("Native QA image dimensions differ from final output");
        images.push({
          frame,
          file: await productionFile(
            input.outputRoot,
            relative(input.outputRoot, path),
            owner,
          ),
          pixelsSha256: sourceHashes[index]!,
        });
      }
    }
    const report = BlenderProductionRenderedVisualSchema.parse({
      schemaVersion: "blender-production-rendered-visual-1",
      binding: input.binding,
      source: {
        composition: input.composition,
        plates: input.plates,
        video: input.video,
      },
      method:
        "all-output-frame-cached-native-sequence-preview-pixels-and-measured-glyphs",
      frameCount: c.frameCount,
      nativeSubmissionCalls: 0,
      speechSourceSha256: input.compiled.speechSourceSha256,
      policy,
      evaluatedPolicy: speech.evaluatedPolicy,
      quality: stableQuality,
      textBounds: quality.textBounds,
      images,
      qualification:
        "Every output frame is evaluated using actual cached-sequence preview pixels and measured glyph bounds. Bad-frame PNGs are exact RGBA decodes of the bound encoded output. This does not approve every encoded glyph, physical contact, factual correctness, continuous playback or listening.",
    });
    const persist = async (name: string, value: unknown) => {
      const path = join(artifactDirectory, name);
      if (input.verify) {
        const loaded = await readProductionJSON(
          path,
          z.unknown(),
          owner,
          BLENDER_PRODUCTION_VISUAL_LIMITS.reportBytes,
          input.signal,
        );
        try {
          if (mechanismPackHash(loaded.value) !== mechanismPackHash(value))
            throw Error(
              "Native visual QA artifact differs from current rendered replay: " +
                name,
            );
        } finally {
          loaded.release();
        }
      } else
        await writeProductionJSON(
          path,
          value,
          owner,
          BLENDER_PRODUCTION_VISUAL_LIMITS.reportBytes,
          true,
        );
      return productionFile(
        input.outputRoot,
        relative(input.outputRoot, path),
        owner,
      );
    };
    const artifact = await persist("qa-rendered-visual.json", report);
    const warnings = diagnostics.map((d, index) => {
      const event = input.compiled.plan.shots.find(
        (s) => d.frames[0] >= s.start && d.frames[1] < s.endExclusive,
      );
      return {
        diagnostic: {
          ...d,
          originalDiagnosticIndex: index,
          controllerMethod: "composition-layer",
        },
        controllingRig:
          "composition." + mechanismPackHash(d.nodes[0] ?? "picture").slice(7),
        event: event?.id ?? "cross-event",
        eventInterval: event
          ? { start: event.start, endExclusive: event.endExclusive }
          : { start: 0, endExclusive: c.frameCount },
        unit: units[d.code] ?? "unspecified-diagnostic-unit",
        parts: [],
        badFrames: [...new Set(d.frames)].map((f) => {
          const image = images.find((i) => i.frame === f)!.file;
          return { path: image.path, sha256: image.sha256 };
        }),
      };
    });
    const groups = groupMechanismProductionWarnings({
      binding: input.binding,
      rawEvidence: { path: artifact.path, sha256: artifact.sha256 },
      warnings,
    });
    const grouped = await persist("qa-visual-warning-groups.json", groups);
    await authenticate();
    return {
      report,
      artifact,
      grouped,
      errors: diagnostics.filter((d) => d.severity === "error").length,
      artifacts: [artifact, grouped],
    };
  } finally {
    source?.release();
    owner.dispose();
  }
}
