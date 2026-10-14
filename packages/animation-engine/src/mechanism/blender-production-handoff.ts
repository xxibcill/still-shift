import { mkdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { z } from "zod";
import type { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import {
  BlenderProductionHandoffSchema,
  MECHANISM_PRODUCTION_HANDOFF_LIMITS,
} from "./production-handoff.ts";
import type { compileBlenderEpisode } from "./blender-episode-compile.ts";
import type {
  MechanismProductionBinding,
  MechanismProductionQA,
} from "./production-report.ts";
import type { MechanismProductionDecodedOutput } from "./production-output-check.ts";
import type { MechanismProductionOwnedFileSchema } from "./production-queue-contract.ts";
import { evidenceProcess } from "./production-evidence-process.ts";
import {
  productionReviewAudioHash,
  productionReviewAudioFacts,
} from "./production-review-audio.ts";
import {
  readProductionJSON,
  writeProductionJSON,
  productionFile,
  productionOwnedPath,
} from "./production-queue-files.ts";
import { mechanismPackHash } from "./pack-support.ts";
type Pin = z.infer<typeof MechanismProductionOwnedFileSchema>;
type Compiled = ReturnType<typeof compileBlenderEpisode>;
interface HandoffSource {
  compiled: Compiled;
  episode: {
    id: string;
    question: string;
    family: string;
    designVariant: string;
  };
  binding: MechanismProductionBinding;
  qa: readonly MechanismProductionQA[];
  assets: {
    video: Pin;
    evidence: Pin;
    decodedReport: Pin;
    composition: Pin;
    nativePlates: Pin;
    qualityReport?: Pin;
  };
  images: readonly { frame: number }[];
}
function snapshotMetadata(input: HandoffSource) {
  return {
    ...input.episode,
    binding: input.binding,
    compilation: {
      frameCount: input.compiled.frameCount,
      width: input.compiled.plan.width,
      height: input.compiled.plan.height,
      fps: input.compiled.plan.fps,
      sourceSamples: input.compiled.plan.narration.sampleCount,
      sourceAssetSha256: input.compiled.source.asset.sha256,
    },
    summary: {
      shots: input.compiled.plan.shots.length,
      sampledFrames: new Set(input.images.map((image) => image.frame)).size,
      images: input.images.length,
      cropExceptions: 0,
    },
    qa: Object.fromEntries(
      input.qa.map((review) => [review.dimension, review.status]),
    ),
  };
}
async function checkReviewAudio(
  path: string,
  decoded: MechanismProductionDecodedOutput,
  owner: CompositionNodeMemory,
  signal?: AbortSignal,
) {
  const facts = await productionReviewAudioFacts(path, owner, signal);
  const hash = await productionReviewAudioHash(path, owner, signal);
  if (
    hash !== decoded.audio.sha256 ||
    facts.duration_ts * facts.channels * 4 !== decoded.audio.bytes ||
    facts.channels !== decoded.audio.channels
  )
    throw Error("Native handoff audio differs from complete final decoded PCM");
}
/** Retain a compact source-bound resume packet and unmodified final decoded audio. */
export async function buildBlenderProductionHandoff(
  input: HandoffSource & {
    outputRoot: string;
    directory: string;
    decoded: MechanismProductionDecodedOutput;
    resume: {
      manifestPath: string | null;
      outputDirectory: string;
      familyPath: string;
      cuePath: string;
      qaPath?: string;
    };
    owner: CompositionNodeMemory;
    signal?: AbortSignal | undefined;
  },
) {
  await mkdir(input.directory, { recursive: false });
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
      await productionOwnedPath(input.outputRoot, input.assets.video.path),
      "-map",
      "0:a:0",
      "-vn",
      "-c:a",
      "pcm_f32le",
      audioPath,
    ],
    input.owner,
    input.signal,
  );
  await checkReviewAudio(audioPath, input.decoded, input.owner, input.signal);
  const audio = await productionFile(
    input.outputRoot,
    relative(input.outputRoot, audioPath),
    input.owner,
  );
  const snapshot = BlenderProductionHandoffSchema.parse({
    schemaVersion: "mechanism-production-handoff-2",
    backend: "blender-native",
    ...snapshotMetadata(input),
    sourceStatus: "generation-snapshot",
    resume: input.resume,
    assets: { ...input.assets, audio },
    reviewedReady: false,
    nextAction:
      "Run production handoff with the current manifest, output and Blender executable. Inspect final encoded evidence and decoded audio; keep unfinished whole reviews visible. Resume the same pinned queue for current verification before a scoped input revision.",
    qualification:
      "Native generation snapshot with source, composition, original capture, encoded evidence and unmodified final PCM pointers. Whole mechanics, factual, continuous-motion, listening and human acceptance remain separate. No new native render is required to read the packet.",
  });
  const path = join(input.directory, "handoff.json");
  await writeProductionJSON(
    path,
    snapshot,
    input.owner,
    MECHANISM_PRODUCTION_HANDOFF_LIMITS.bytes,
    true,
  );
  return [
    audio,
    await productionFile(
      input.outputRoot,
      relative(input.outputRoot, path),
      input.owner,
    ),
  ];
}
/** Replay metadata and final-PCM invariants; historical absolute resume locations are refreshed by the receiving CLI. */
export async function checkBlenderProductionHandoff(
  input: HandoffSource & {
    outputRoot: string;
    handoff: Pin;
    artifacts: readonly Pin[];
    decoded: MechanismProductionDecodedOutput;
    owner: CompositionNodeMemory;
    signal?: AbortSignal | undefined;
  },
) {
  const loaded = await readProductionJSON(
    await productionOwnedPath(input.outputRoot, input.handoff.path),
    BlenderProductionHandoffSchema,
    input.owner,
    MECHANISM_PRODUCTION_HANDOFF_LIMITS.bytes,
    input.signal,
  );
  try {
    if (loaded.sha256 !== input.handoff.sha256)
      throw Error("Native handoff snapshot hash changed");
    const value = loaded.value;
    const actual = {
      id: value.id,
      question: value.question,
      family: value.family,
      designVariant: value.designVariant,
      binding: value.binding,
      compilation: value.compilation,
      summary: value.summary,
      qa: value.qa,
    };
    if (
      value.sourceStatus !== "generation-snapshot" ||
      value.reviewedReady ||
      mechanismPackHash(actual) !== mechanismPackHash(snapshotMetadata(input))
    )
      throw Error(
        "Native handoff metadata differs from its current product/source",
      );
    const { audio, ...sourceAssets } = value.assets;
    if (mechanismPackHash(sourceAssets) !== mechanismPackHash(input.assets))
      throw Error("Native handoff source artifacts differ from the product");
    for (const file of Object.values(value.assets))
      if (
        !input.artifacts.some(
          (pin) => mechanismPackHash(pin) === mechanismPackHash(file),
        )
      )
        throw Error("Native handoff asset is absent from the product closure");
    await checkReviewAudio(
      await productionOwnedPath(input.outputRoot, audio.path),
      input.decoded,
      input.owner,
      input.signal,
    );
  } finally {
    loaded.release();
  }
}
