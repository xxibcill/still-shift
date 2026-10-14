import { admitBlenderProductionVisualWork } from "./blender-production-visual.ts";
import { realpath } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import type { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import {
  BlenderEpisodeSourceSchema,
  BlenderEpisodePlanSchema,
  BLENDER_EPISODE_LIMITS,
} from "./blender-episode-contract.ts";
import { compileBlenderEpisode } from "./blender-episode-compile.ts";
import { readProductionJSON } from "./production-queue-files.ts";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { z } from "zod";
import { cuePlateFile } from "./cue-plate-files.ts";
import { BlenderProductionQueueItemSchema } from "./production-queue-contract.ts";

import {
  BlenderProductionQAPlanSchema,
  admitBlenderProductionQAPlan,
  BLENDER_PRODUCTION_QA_LIMITS,
} from "./blender-production-qa-contract.ts";

export interface BlenderProductionProjectInput {
  id: string;
  question: string;
  familyPath: string;
  cuePath: string;
  qaPath?: string | undefined;
}
export async function readBlenderEpisode(
  project: BlenderProductionProjectInput,
  manifestDirectory: string,
  owner: CompositionNodeMemory,
  signal?: AbortSignal,
) {
  owner.reserve(64 * 1024 * 1024);
  manifestDirectory = await realpath(resolve(manifestDirectory));
  const familyPath = await realpath(
      resolve(manifestDirectory, project.familyPath),
    ),
    cuePath = await realpath(resolve(manifestDirectory, project.cuePath));
  const source = await readProductionJSON(
    familyPath,
    BlenderEpisodeSourceSchema,
    owner,
    BLENDER_EPISODE_LIMITS.documentBytes,
    signal,
  );
  const loaded: { release(): void }[] = [source];
  try {
    const plan = await readProductionJSON(
      cuePath,
      BlenderEpisodePlanSchema,
      owner,
      BLENDER_EPISODE_LIMITS.documentBytes,
      signal,
    );
    loaded.push(plan);
    const resolvedSource = {
      ...source.value,
      asset: {
        ...source.value.asset,
        path: resolve(dirname(familyPath), source.value.asset.path),
      },
    };
    const resolvedPlan = {
      ...plan.value,
      narration: {
        ...plan.value.narration,
        path: resolve(dirname(cuePath), plan.value.narration.path),
      },
      font: {
        ...plan.value.font,
        path: resolve(dirname(cuePath), plan.value.font.path),
      },
    };
    if (resolvedPlan.id !== project.id)
      throw Error(
        "Native episode plan ID differs from the selected queue question",
      );
    const compiled = compileBlenderEpisode(resolvedSource, resolvedPlan);
    admitBlenderProductionVisualWork(
      compiled.frameCount,
      2 * compiled.plan.speech.length +
        3 * compiled.plan.callouts.length +
        1 +
        (compiled.plan.shots.some((s) => s.proofPurpose !== undefined)
          ? compiled.plan.shots.length
          : 1),
    );
    const qaPath =
      project.qaPath === undefined
        ? undefined
        : await realpath(resolve(manifestDirectory, project.qaPath));
    const qa =
      qaPath === undefined
        ? undefined
        : await readProductionJSON(
            qaPath,
            BlenderProductionQAPlanSchema,
            owner,
            BLENDER_PRODUCTION_QA_LIMITS.planBytes,
            signal,
          );
    if (qa) {
      loaded.push(qa);
      admitBlenderProductionQAPlan(qa.value, compiled.frameCount);
    }
    const pins = new Map<string, { sha256?: string; bytes?: number }>([
      [familyPath, { sha256: source.sha256 }],
      [cuePath, { sha256: plan.sha256 }],
    ]);
    if (qaPath && qa) pins.set(qaPath, { sha256: qa.sha256 });
    for (const file of [
      resolvedSource.asset,
      ...source.value.evidenceFiles.map((f) => ({
        ...f,
        path: resolve(dirname(familyPath), f.path),
      })),
      resolvedPlan.narration,
      resolvedPlan.font,
    ]) {
      const old = pins.get(file.path);
      if (
        old &&
        (old.sha256 !== file.sha256 ||
          ("bytes" in file &&
            old.bytes !== undefined &&
            old.bytes !== file.bytes))
      )
        throw Error("Native input has conflicting dependency pins");
      pins.set(file.path, {
        sha256: file.sha256,
        ...("bytes" in file ? { bytes: file.bytes } : {}),
      });
    }
    const inputs = [];
    for (const [path, expected] of pins) {
      const file = await cuePlateFile(path, owner, {
        ...(expected.sha256 ? { sha256: expected.sha256 } : {}),
        signal,
      });
      if (expected.bytes !== undefined && expected.bytes !== file.bytes)
        throw Error("Native input byte count differs from its declared pin");
      inputs.push({
        ...file,
        path: relative(resolve(manifestDirectory), path).split("\\").join("/"),
      });
    }
    const deadline = AbortSignal.timeout(10000);
    const audioFacts = await runProcess(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "a",
        "-show_entries",
        "stream=sample_rate,channels,duration_ts,time_base",
        "-of",
        "json",
        resolvedPlan.narration.path,
      ],
      {
        maxBuffer: 16384,
        signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
      },
    );
    const audio = z
      .object({
        streams: z
          .array(
            z
              .object({
                sample_rate: z.string(),
                channels: z.number().int(),
                duration_ts: z.number().int().positive(),
                time_base: z.string().regex(/^[0-9]+\/[1-9][0-9]*$/),
              })
              .strict(),
          )
          .length(1),
      })
      .parse(JSON.parse(audioFacts.stdout)).streams[0]!;
    const [numerator, denominator] = audio.time_base.split("/").map(BigInt);
    if (
      Number(audio.sample_rate) !==
        resolvedPlan.originalNarrationClock.sampleRate ||
      audio.channels !== resolvedPlan.narration.channels ||
      BigInt(audio.duration_ts) *
        numerator! *
        BigInt(resolvedPlan.originalNarrationClock.sampleRate) !==
        BigInt(resolvedPlan.originalNarrationClock.samples) * denominator!
    )
      throw Error(
        "Original narration metadata differs from its source clock; no retiming is permitted",
      );
    inputs.sort((a, b) => a.path.localeCompare(b.path, "en"));
    return {
      compiled,
      qa: qa ? { plan: qa.value, sha256: qa.sha256 } : undefined,
      item: BlenderProductionQueueItemSchema.parse({
        id: project.id,
        question: project.question,
        family: source.value.family,
        designVariant: source.value.designVariant,
        backend: "blender-native",
        familyPath: relative(resolve(manifestDirectory), familyPath)
          .split("\\")
          .join("/"),
        cuePath: relative(resolve(manifestDirectory), cuePath)
          .split("\\")
          .join("/"),
        ...(qaPath
          ? {
              qaPath: relative(manifestDirectory, qaPath).split("\\").join("/"),
            }
          : {}),
        clock: {
          outputFrames: compiled.frameCount,
          sourceSamples: compiled.plan.narration.sampleCount,
        },
        inputs,
      }),
    };
  } finally {
    for (const file of loaded.reverse()) file.release();
  }
}
