import { checkMechanismProductionDecodedOutput } from "./production-output-check.ts";
import { z } from "zod";
import { access, rename } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { CompositionSchema } from "@still-shift/scene-contract";
import { compileMechanismCueProject } from "./cue-lifecycle.ts";
import {
  checkMechanismCueNativePlates,
  prepareMechanismCueNativePlates,
} from "./cue-native-plates.ts";
import {
  renderMechanismCuePlateProject,
  checkMechanismCuePlateOutput,
  measureMechanismNativeSubmissionCalls,
} from "./cue-plate-lifecycle.ts";
import { partitionMechanismCueNativePicture } from "./cue-native-picture.ts";
import { mechanismPackHash } from "./pack-support.ts";
import { createUnreviewedMechanismQA } from "./production-report.ts";
import {
  productionFailure,
  productionFile,
  productionOwnedPath,
  readProductionJSON,
  writeProductionJSON,
} from "./production-queue-files.ts";
import {
  inspectMechanismProductionNativeItem,
  type MechanismProductionProjectInput,
} from "./production-native-inputs.ts";
import { loadMechanismProductionNativeIdentity } from "./production-native-identity.ts";
import {
  MechanismProductionQueueSchema,
  type MechanismProductionQueue,
  type MechanismProductionQueueItem,
  type MechanismProductionQueueProduct,
} from "./production-queue-contract.ts";
import type {
  MechanismProductionExecutor,
  MechanismProductionExecutionContext,
} from "./production-queue.ts";

export interface MechanismProductionNativeExecutor
  extends MechanismProductionExecutor {
  createQueue(
    id: string,
    projects: readonly MechanismProductionProjectInput[],
    manifestDirectory: string,
  ): Promise<MechanismProductionQueue>;
}
export async function createMechanismProductionNativeExecutor(): Promise<MechanismProductionNativeExecutor> {
  const identity = await loadMechanismProductionNativeIdentity();
  const assertCode = async () => {
    const current = await loadMechanismProductionNativeIdentity();
    if (
      current.codeSha256 !== identity.codeSha256 ||
      current.profileSha256 !== identity.profileSha256
    )
      productionFailure(
        "production-code-changed",
        "Runtime code/profile changed after executor creation",
        "code/profile",
      );
  };
  const paths = (
    item: MechanismProductionQueueItem,
    context: MechanismProductionExecutionContext,
  ) => ({
    family: resolve(context.manifestDirectory, item.familyPath),
    cue: resolve(context.manifestDirectory, item.cuePath),
    compiled: join(context.attemptDirectory, "compiled"),
    rendered: join(context.attemptDirectory, "rendered"),
  });
  return {
    codeSha256: identity.codeSha256,
    profileSha256: identity.profileSha256,
    createQueue: async (id, projects, directory) => {
      await assertCode();
      const items = [];
      for (const project of projects)
        items.push(
          await inspectMechanismProductionNativeItem(project, directory),
        );
      return MechanismProductionQueueSchema.parse({
        schemaVersion: "mechanism-production-queue-1",
        id,
        revision: 0,
        baseHash: null,
        codeSha256: identity.codeSha256,
        profileSha256: identity.profileSha256,
        maximumAttempts: 3,
        items,
      });
    },
    execute: async (item, context) => {
      await assertCode();
      const expected = await inspectMechanismProductionNativeItem(
        {
          id: item.id,
          question: item.question,
          familyPath: resolve(context.manifestDirectory, item.familyPath),
          cuePath: resolve(context.manifestDirectory, item.cuePath),
        },
        context.manifestDirectory,
      );
      if (mechanismPackHash(expected) !== mechanismPackHash(item))
        productionFailure(
          "production-input-set",
          "Queue does not contain the complete current source/media dependency set",
          item.id,
        );
      const path = paths(item, context),
        began = performance.now();
      await context.progress("compile");
      const compiled = await compileMechanismCueProject(
        path.family,
        path.cue,
        path.compiled,
        { signal: context.signal, nodeMemory: context.nodeMemory },
      );
      const data = await readProductionJSON(
        compiled.compositionPath,
        CompositionSchema,
        context.nodeMemory,
        32 * 1024 * 1024,
        context.signal,
      );
      let pictureHash: string;
      try {
        const picture = partitionMechanismCueNativePicture(data.value);
        pictureHash = mechanismPackHash({
          ...picture,
          assets: picture.assets.map((a) => ({ ...a, path: a.id })),
        });
      } finally {
        data.release();
      }
      const cacheKey = mechanismPackHash({
        pictureHash,
        code: identity.codeSha256,
        profile: identity.profileSha256,
      }).slice(7);
      const plates = join(context.outputRoot, "native-cache", cacheKey);
      let reused = false,
        captureFrames = 0;
      await context.progress("native-cache");
      let exists = true;
      try {
        await access(plates);
      } catch {
        exists = false;
      }
      if (exists) {
        try {
          await checkMechanismCueNativePlates(
            path.family,
            path.cue,
            path.compiled,
            plates,
            { signal: context.signal, nodeMemory: context.nodeMemory },
          );
          reused = true;
        } catch (error) {
          context.signal?.throwIfAborted();
          const rejected = plates + ".rejected-" + randomUUID();
          await rename(plates, rejected);
          await writeProductionJSON(
            join(context.attemptDirectory, "cache-rejection.json"),
            {
              schemaVersion: "mechanism-production-cache-rejection-1",
              path: relative(context.outputRoot, rejected),
              reason: String(error).slice(0, 2048),
              nativePictureSha256: pictureHash,
            },
            context.nodeMemory,
            65536,
          );
        }
      }
      if (!reused) {
        const capture = await prepareMechanismCueNativePlates(
          path.family,
          path.cue,
          path.compiled,
          plates,
          { signal: context.signal, nodeMemory: context.nodeMemory },
        );
        const result = await readProductionJSON(
          capture.receipt.renderResult.path,
          z.unknown(),
          context.nodeMemory,
          32 * 1024 * 1024,
          context.signal,
        );
        try {
          captureFrames = measureMechanismNativeSubmissionCalls(result.value);
        } finally {
          result.release();
        }
      }
      const setupSeconds = (performance.now() - began) / 1000,
        renderStart = performance.now();
      await context.progress("render-cached");
      const rendered = await renderMechanismCuePlateProject(
        path.family,
        path.cue,
        path.compiled,
        plates,
        path.rendered,
        { signal: context.signal, nodeMemory: context.nodeMemory },
      );
      await context.progress("check-output");
      const checked = await checkMechanismCuePlateOutput(
        path.family,
        path.cue,
        path.compiled,
        plates,
        rendered.outputPath,
        { signal: context.signal, nodeMemory: context.nodeMemory },
      );
      await context.progress("full-decode");
      const decoded = await checkMechanismProductionDecodedOutput(
        rendered.outputPath,
        {
          ...compiled.receipt,
          sourceSamples: item.clock.sourceSamples,
        },
        context.nodeMemory,
        context.signal,
      );
      const decodedPath = join(context.attemptDirectory, "decoded-output.json");
      await writeProductionJSON(
        decodedPath,
        decoded,
        context.nodeMemory,
        65536,
      );
      const renderSeconds = (performance.now() - renderStart) / 1000;
      const checkPath = join(context.attemptDirectory, "technical-check.json");
      await writeProductionJSON(
        checkPath,
        {
          ...checked,
          schemaVersion: "mechanism-production-native-technical-check-1",
          codeSha256: identity.codeSha256,
          profileSha256: identity.profileSha256,
          familyPath: path.family,
          cuePath: path.cue,
          compiled: path.compiled,
          plates,
          qualification:
            "Current source/native replay and complete RGBA/PCM byte clocks; visual/mechanical/factual/playback/listening remain separate.",
        },
        context.nodeMemory,
        65536,
      );
      const checkFile = await productionFile(
        context.outputRoot,
        relative(context.outputRoot, checkPath),
        context.nodeMemory,
      );
      const output = await productionFile(
        context.outputRoot,
        relative(context.outputRoot, rendered.outputPath),
        context.nodeMemory,
      );
      const binding = {
        inputSha256: context.requestHash,
        outputSha256: output.sha256,
        codeSha256: identity.codeSha256,
        profileSha256: identity.profileSha256,
      };
      const qa = createUnreviewedMechanismQA(binding);
      qa[0] = {
        ...qa[0]!,
        status: "passed",
        method: "current-native-replay-full-rgba-and-pcm-decode",
        evaluatedInterval: {
          unit: "output-frame",
          start: 0,
          endExclusive: item.clock.outputFrames,
        },
        evidence: [{ path: checkFile.path, sha256: checkFile.sha256 }],
        reviewer: {
          kind: "automated",
          id: "still-shift-native-production-adapter",
        },
        explanation:
          "Current source/overlay/clock/submission/original capture and full RGBA/PCM decode passed; nontechnical QA remains unreviewed.",
      };
      const artifacts = [
        output,
        checkFile,
        await productionFile(
          context.outputRoot,
          relative(context.outputRoot, decodedPath),
          context.nodeMemory,
        ),
      ];
      for (const p of [
        compiled.compositionPath,
        compiled.receiptPath,
        rendered.receiptPath,
        rendered.outputPath + ".result.json",
        rendered.sceneManifestPath,
      ])
        artifacts.push(
          await productionFile(
            context.outputRoot,
            relative(context.outputRoot, p),
            context.nodeMemory,
          ),
        );
      await assertCode();
      return {
        schemaVersion: "mechanism-production-queue-product-1",
        requestHash: context.requestHash,
        report: {
          schemaVersion: "mechanism-production-episode-report-1",
          id: item.id,
          question: item.question,
          family: item.family,
          designVariant: item.designVariant,
          binding,
          clock: item.clock,
          attempts: [],
          qa,
          unresolvedMechanicalFailures: 0,
          durations: {
            setupSeconds,
            routineSeconds: renderSeconds,
            renderSeconds,
          },
          authoring: {
            setupTokens: null,
            routineTokens: null,
            baselineRoutineTokens: null,
            comparable: false,
            measurementEvidence: null,
          },
        },
        artifacts,
        work: {
          freshNativeSubmissions: captureFrames,
          reusedNativePlates: reused,
        },
      } satisfies MechanismProductionQueueProduct;
    },
    verify: async (item, product, context) => {
      await assertCode();
      const outputFile = product.artifacts.find(
        (f) => f.sha256 === product.report.binding.outputSha256,
      );
      if (!outputFile)
        productionFailure(
          "production-output",
          "Native product lacks its encoded output",
          item.id,
        );
      const path = paths(item, context);
      // Compilations and receipts carry authenticated absolute locators; relocation
      // intentionally invalidates them until a supported native relocation path exists.
      const nativeKeyFile = product.artifacts.find((f) =>
        f.path.endsWith("/technical-check.json"),
      );
      if (!nativeKeyFile)
        productionFailure(
          "production-check",
          "Native product lacks its technical check",
          item.id,
        );
      const check = await readProductionJSON(
        await productionOwnedPath(context.outputRoot, nativeKeyFile.path),
        z.object({ plates: z.string(), compiled: z.string() }).passthrough(),
        context.nodeMemory,
        65536,
        context.signal,
      );
      try {
        if (check.value.compiled !== path.compiled)
          productionFailure(
            "production-relocation",
            "Native compilation relocated; retained receipts require fresh current validation",
            item.id,
          );
        await checkMechanismCuePlateOutput(
          path.family,
          path.cue,
          path.compiled,
          check.value.plates,
          await productionOwnedPath(context.outputRoot, outputFile.path),
          { signal: context.signal, nodeMemory: context.nodeMemory },
        );
        const expected = await inspectMechanismProductionNativeItem(
          {
            id: item.id,
            question: item.question,
            familyPath: path.family,
            cuePath: path.cue,
          },
          context.manifestDirectory,
        );
        if (mechanismPackHash(expected) !== mechanismPackHash(item))
          productionFailure(
            "production-input-set",
            "Complete dependency snapshot changed during reuse",
            item.id,
          );
        const decodedFile = product.artifacts.find((f) =>
          f.path.endsWith("/decoded-output.json"),
        );
        if (!decodedFile)
          productionFailure(
            "production-decode-proof",
            "Product lacks its full decoded output proof",
            item.id,
          );
        const original = await readProductionJSON(
          await productionOwnedPath(context.outputRoot, decodedFile.path),
          z
            .object({
              outputPath: z.string(),
              width: z.number().int().positive(),
              height: z.number().int().positive(),
              fps: z.number().int().positive(),
              video: z.object({ bytes: z.number(), sha256: z.string() }),
              audio: z
                .object({ bytes: z.number(), sha256: z.string() })
                .passthrough(),
            })
            .passthrough(),
          context.nodeMemory,
          65536,
          context.signal,
        );
        try {
          const decoded = await checkMechanismProductionDecodedOutput(
            await productionOwnedPath(context.outputRoot, outputFile.path),
            {
              frameCount: item.clock.outputFrames,
              sourceSamples: item.clock.sourceSamples,
              width: original.value.width,
              height: original.value.height,
              fps: original.value.fps,
            },
            context.nodeMemory,
            context.signal,
          );
          if (
            decoded.video.sha256 !== original.value.video.sha256 ||
            decoded.video.bytes !== original.value.video.bytes ||
            decoded.audio.sha256 !== original.value.audio.sha256 ||
            decoded.audio.bytes !== original.value.audio.bytes
          )
            productionFailure(
              "production-decode-identity",
              "Actual full decoded output differs from its retained proof",
              item.id,
            );
        } finally {
          original.release();
        }
      } finally {
        check.release();
      }
      await assertCode();
    },
  };
}
