import { dirname, join, relative } from "node:path";
import { z } from "zod";
import {
  CompositionNodeMemory,
  compositionNodeJsonSize,
} from "@still-shift/execution-runtime/export";
import { CompositionSchema } from "@still-shift/scene-contract";
import { MechanismProductionProjectsSchema } from "./production-projects.ts";
import { renderComposition } from "../composition-render.ts";
import {
  BlenderProductionQueueSchema,
  BlenderProductionQueueProductSchema,
} from "./production-queue-contract.ts";
import {
  readBlenderEpisode,
  type BlenderProductionProjectInput,
} from "./blender-episode-inputs.ts";
import { readBlenderEpisodeAnchorFrames } from "./blender-episode-annotations.ts";
import { readBlenderEpisodeProofHolds } from "./blender-episode-proof.ts";
import { composeBlenderEpisode } from "./blender-episode-compile.ts";
import {
  prepareBlenderEpisodePlates,
  checkBlenderEpisodePlates,
  BlenderEpisodePlatesSchema,
  type BlenderEpisodePlates,
} from "./blender-episode-plates.ts";
import { loadBlenderProductionIdentity } from "./blender-production-identity.ts";
import { checkMechanismProductionDecodedOutput } from "./production-output-check.ts";
import { createUnreviewedMechanismQA } from "./production-report.ts";
import {
  readProductionJSON,
  writeProductionJSON,
  productionFile,
  productionOwnedPath,
} from "./production-queue-files.ts";
import { evaluateBlenderProductionVisualQA } from "./blender-production-visual.ts";
import { evaluateBlenderProductionQA } from "./blender-production-qa.ts";
import { mechanismPackHash } from "./pack-support.ts";
import type { MechanismProductionExecutor } from "./production-queue.ts";

function sequence(
  root: string,
  map: BlenderEpisodePlates,
  compiled: Awaited<ReturnType<typeof readBlenderEpisode>>["compiled"],
) {
  return {
    id: "native-episode-plates",
    type: "sequence" as const,
    path: join(root, map.frames[0]!.image.path, "..", "frame-%06d.png"),
    manifestPath: join(root, map.sequence.path),
    sha256: map.sequence.sha256,
    firstFrame: 0,
    width: compiled.plan.width,
    height: compiled.plan.height,
    frameCount: compiled.frameCount,
    frameRate: { numerator: compiled.plan.fps, denominator: 1 },
    color: {
      primaries: "bt709" as const,
      transfer: "iec61966-2-1" as const,
      matrix: "gbr" as const,
      range: "pc" as const,
    },
  };
}
/** Optional native producer; command interfaces only, existing audio at its whole original pace. */
export async function createBlenderProductionExecutor(options: {
  blenderExecutable: string;
}) {
  const identity = await loadBlenderProductionIdentity(
    options.blenderExecutable,
  );
  const assertIdentity = async () => {
    const current = await loadBlenderProductionIdentity(
      options.blenderExecutable,
    );
    if (
      current.codeSha256 !== identity.codeSha256 ||
      current.profileSha256 !== identity.profileSha256
    )
      throw Error(
        "Native Blender producer/receiver changed after executor creation",
      );
  };
  const executor: MechanismProductionExecutor & {
    createQueue(
      id: string,
      projects: readonly BlenderProductionProjectInput[],
      manifestDirectory: string,
    ): Promise<z.infer<typeof BlenderProductionQueueSchema>>;
  } = {
    codeSha256: identity.codeSha256,
    profileSha256: identity.profileSha256,
    createQueue: async (id, projects, directory) => {
      compositionNodeJsonSize(
        { schemaVersion: "mechanism-production-projects-1", id, projects },
        0,
        "blender-projects",
        1024 * 1024,
      );
      const declaration = MechanismProductionProjectsSchema.parse({
        schemaVersion: "mechanism-production-projects-1",
        id,
        projects,
      });
      await assertIdentity();
      const items = [];
      for (const project of declaration.projects) {
        const owner = new CompositionNodeMemory();
        try {
          items.push(
            (await readBlenderEpisode(project, directory, owner)).item,
          );
        } finally {
          owner.dispose();
        }
      }
      return BlenderProductionQueueSchema.parse({
        schemaVersion: "mechanism-production-queue-2",
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
      if (!("backend" in item))
        throw Error(
          "Native Blender executor requires an explicit Blender queue item",
        );
      await assertIdentity();
      const {
        compiled,
        qa: nativeQA,
        item: expected,
      } = await readBlenderEpisode(
        item,
        context.manifestDirectory,
        context.nodeMemory,
        context.signal,
      );
      if (mechanismPackHash(expected) !== mechanismPackHash(item))
        throw Error("Native queue lacks the complete current input set");
      const began = performance.now();
      await context.progress("blender-native-plates");
      const map = await prepareBlenderEpisodePlates(
        compiled,
        identity,
        context.outputRoot,
        join(context.attemptDirectory, "plates"),
        options.blenderExecutable,
        context.nodeMemory,
        context.signal,
      );
      const mapPath = join(context.attemptDirectory, "native-plates.json"),
        compositionPath = join(context.attemptDirectory, "composition.json"),
        outputPath = join(context.attemptDirectory, "output.mp4"),
        decodedPath = join(context.attemptDirectory, "decoded-output.json");
      await writeProductionJSON(
        mapPath,
        map,
        context.nodeMemory,
        4 * 1024 * 1024,
        true,
      );
      const anchors = await readBlenderEpisodeAnchorFrames(
        compiled,
        map,
        identity,
        context.outputRoot,
        context.nodeMemory,
        context.signal,
      );
      let proofs:
        | Awaited<ReturnType<typeof readBlenderEpisodeProofHolds>>
        | undefined;
      try {
        proofs = await readBlenderEpisodeProofHolds(
          compiled,
          map,
          identity,
          context.outputRoot,
          context.nodeMemory,
          context.signal,
        );
        await writeProductionJSON(
          compositionPath,
          composeBlenderEpisode(
            compiled,
            sequence(context.outputRoot, map, compiled),
            anchors.frames,
            proofs.holds,
          ),
          context.nodeMemory,
          1024 * 1024,
          true,
        );
      } finally {
        proofs?.release();
        anchors.release();
      }
      await context.progress("native-blender-composition-export");
      await renderComposition({
        compositionPath,
        outputPath,
        cacheDirectory: join(context.attemptDirectory, "receiver-cache"),
        backend: "webgl2",
        transport: "raw_rgba",
        workers: 1,
        nodeMemory: context.nodeMemory,
        signal: context.signal,
      });
      await context.progress("native-blender-full-decode");
      const decoded = await checkMechanismProductionDecodedOutput(
        outputPath,
        {
          frameCount: compiled.frameCount,
          width: compiled.plan.width,
          height: compiled.plan.height,
          fps: compiled.plan.fps,
          sourceSamples: compiled.plan.narration.sampleCount,
        },
        context.nodeMemory,
        context.signal,
      );
      await writeProductionJSON(
        decodedPath,
        decoded,
        context.nodeMemory,
        1024 * 1024,
        true,
      );
      const artifacts: Awaited<ReturnType<typeof productionFile>>[] = [];
      for (const path of [mapPath, compositionPath, outputPath, decodedPath])
        artifacts.push(
          await productionFile(
            context.outputRoot,
            relative(context.outputRoot, path),
            context.nodeMemory,
          ),
        );
      const binding = {
        inputSha256: context.requestHash,
        outputSha256: artifacts[2]!.sha256,
        codeSha256: identity.codeSha256,
        profileSha256: identity.profileSha256,
      };
      await context.progress("native-blender-rendered-visual-qa");
      const visual = await evaluateBlenderProductionVisualQA({
        compiled,
        map,
        identity,
        binding,
        outputRoot: context.outputRoot,
        directory: context.attemptDirectory,
        composition: artifacts[1]!,
        plates: artifacts[0]!,
        video: artifacts[2]!,
        owner: context.nodeMemory,
        signal: context.signal,
      });
      artifacts.push(...visual.artifacts);
      const quality = nativeQA
        ? await evaluateBlenderProductionQA({
            plan: nativeQA.plan,
            planSha256: nativeQA.sha256,
            compiled,
            map,
            identity,
            binding,
            outputRoot: context.outputRoot,
            directory: context.attemptDirectory,
            plates: artifacts[0]!,
            owner: context.nodeMemory,
            signal: context.signal,
            rendered: visual.artifact,
          })
        : undefined;
      if (quality) artifacts.push(...quality.artifacts);
      const qa = createUnreviewedMechanismQA(binding);
      if (quality?.facts.failures.mechanical)
        qa[1] = {
          ...qa[1]!,
          status: "failed",
          method: "registered-retained-native-observation-ranges",
          evaluatedInterval: {
            unit: "output-frame",
            start: 0,
            endExclusive: compiled.frameCount,
          },
          evidence: [
            { path: quality.factsPin.path, sha256: quality.factsPin.sha256 },
          ],
          reviewer: { kind: "automated", id: "native-blender-observation-qa" },
          explanation:
            "Registered sampled rules failed at retained frame/part/relationship locations. Whole-mechanism acceptance remains separate.",
        };
      qa[2] = {
        ...qa[2]!,
        status: visual.errors ? "failed" : "passed",
        method: visual.report.method,
        evaluatedInterval: {
          unit: "output-frame",
          start: 0,
          endExclusive: compiled.frameCount,
        },
        evidence: [
          { path: visual.artifact.path, sha256: visual.artifact.sha256 },
          { path: visual.grouped.path, sha256: visual.grouped.sha256 },
        ],
        reviewer: {
          kind: "automated",
          id: "native-blender-rendered-visual-qa",
        },
        explanation:
          "All-frame cached-sequence preview pixels and glyph bounds evaluated; exact encoded bad-frame images retained. Whole encoded-text, continuous and listening reviews remain separate.",
      };
      qa[0] = {
        ...qa[0]!,
        status: "passed",
        method: "current-native-blender-capture-and-full-rgba-pcm-decode",
        evaluatedInterval: {
          unit: "output-frame",
          start: 0,
          endExclusive: compiled.frameCount,
        },
        evidence: artifacts
          .slice(0, 4)
          .filter((f) => f.path !== artifacts[2]!.path)
          .map((f) => ({ path: f.path, sha256: f.sha256 })),
        reviewer: { kind: "automated", id: "shared-native-blender-executor" },
        explanation:
          "Current input pins, native capture/control/camera mapping and whole decoded output clocks verified. Mechanics, sampled/encoded readability, factual, continuous motion and listening remain separate.",
      };
      return BlenderProductionQueueProductSchema.parse({
        schemaVersion: "mechanism-production-queue-product-2",
        requestHash: context.requestHash,
        report: {
          schemaVersion: "mechanism-production-episode-report-2",
          backend: "blender-native",
          id: item.id,
          question: item.question,
          family: item.family,
          designVariant: item.designVariant,
          binding,
          clock: item.clock,
          attempts: [],
          qa,
          unresolvedMechanicalFailures: quality?.facts.failures.mechanical ?? 0,
          durations: {
            setupSeconds: null,
            routineSeconds: null,
            renderSeconds: (performance.now() - began) / 1000,
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
          freshNativeSubmissions: map.freshNativeRenders,
          reusedNativePlates: map.reusedOutputFrames > 0,
        },
      });
    },
    verify: async (item, product, context) => {
      if (
        !("backend" in item) ||
        product.schemaVersion !== "mechanism-production-queue-product-2"
      )
        throw Error(
          "Native Blender verification requires its matching backend product",
        );
      if (
        product.artifacts.find((f) => f.path.endsWith("/output.mp4"))
          ?.sha256 !== product.report.binding.outputSha256
      )
        throw Error(
          "Native output binding does not name its actual video artifact",
        );
      await assertIdentity();
      const {
        compiled,
        qa: nativeQA,
        item: expected,
      } = await readBlenderEpisode(
        item,
        context.manifestDirectory,
        context.nodeMemory,
        context.signal,
      );
      if (mechanismPackHash(expected) !== mechanismPackHash(item))
        throw Error(
          "Native product inputs differ from the current selected episode",
        );
      const artifact = async (suffix: string) => {
        const file = product.artifacts.find((f) =>
          f.path.endsWith("/" + suffix),
        );
        if (!file) throw Error("Native Blender product lacks " + suffix);
        return productionOwnedPath(context.outputRoot, file.path);
      };
      const map = await readProductionJSON(
        await artifact("native-plates.json"),
        BlenderEpisodePlatesSchema,
        context.nodeMemory,
        4 * 1024 * 1024,
        context.signal,
      );
      const composition = await readProductionJSON(
        await artifact("composition.json"),
        CompositionSchema,
        context.nodeMemory,
        1024 * 1024,
        context.signal,
      );
      const proof = await readProductionJSON(
        await artifact("decoded-output.json"),
        z
          .object({
            video: z.object({ bytes: z.number(), sha256: z.string() }),
            audio: z
              .object({ bytes: z.number(), sha256: z.string() })
              .passthrough(),
          })
          .passthrough(),
        context.nodeMemory,
        1024 * 1024,
        context.signal,
      );
      try {
        await checkBlenderEpisodePlates(
          map.value,
          compiled,
          identity,
          context.outputRoot,
          context.nodeMemory,
          context.signal,
        );
        const anchors = await readBlenderEpisodeAnchorFrames(
          compiled,
          map.value,
          identity,
          context.outputRoot,
          context.nodeMemory,
          context.signal,
        );
        let proofs:
          | Awaited<ReturnType<typeof readBlenderEpisodeProofHolds>>
          | undefined;
        try {
          proofs = await readBlenderEpisodeProofHolds(
            compiled,
            map.value,
            identity,
            context.outputRoot,
            context.nodeMemory,
            context.signal,
          );
          if (
            mechanismPackHash(composition.value) !==
            mechanismPackHash(
              composeBlenderEpisode(
                compiled,
                sequence(context.outputRoot, map.value, compiled),
                anchors.frames,
                proofs.holds,
              ),
            )
          )
            throw Error(
              "Native saved composition differs from its current episode plan",
            );
        } finally {
          proofs?.release();
          anchors.release();
        }
        const visual = await evaluateBlenderProductionVisualQA({
          compiled,
          map: map.value,
          identity,
          binding: product.report.binding,
          outputRoot: context.outputRoot,
          directory: dirname(await artifact("qa-rendered-visual.json")),
          composition: product.artifacts.find((f) =>
            f.path.endsWith("/composition.json"),
          )!,
          plates: product.artifacts.find((f) =>
            f.path.endsWith("/native-plates.json"),
          )!,
          video: product.artifacts.find((f) => f.path.endsWith("/output.mp4"))!,
          owner: context.nodeMemory,
          signal: context.signal,
          verify: true,
        });
        for (const pin of visual.artifacts)
          if (
            !product.artifacts.some(
              (f) => mechanismPackHash(f) === mechanismPackHash(pin),
            )
          )
            throw Error(
              "Native visual QA artifact is absent from its product closure",
            );
        if (
          product.report.qa.find((q) => q.dimension === "sampled-visual")
            ?.status !== (visual.errors ? "failed" : "passed")
        )
          throw Error(
            "Native sampled-visual status differs from current rendered replay",
          );
        if (nativeQA) {
          const quality = await evaluateBlenderProductionQA({
            plan: nativeQA.plan,
            planSha256: nativeQA.sha256,
            compiled,
            map: map.value,
            identity,
            binding: product.report.binding,
            outputRoot: context.outputRoot,
            directory: dirname(await artifact("qa-facts.json")),
            plates: product.artifacts.find((f) =>
              f.path.endsWith("/native-plates.json"),
            )!,
            owner: context.nodeMemory,
            signal: context.signal,
            verify: true,
            rendered: visual.artifact,
          });
          for (const pin of quality.artifacts)
            if (
              !product.artifacts.some(
                (f) => mechanismPackHash(f) === mechanismPackHash(pin),
              )
            )
              throw Error(
                "Native QA artifact is absent from its product closure",
              );
          if (
            product.report.unresolvedMechanicalFailures !==
              quality.facts.failures.mechanical ||
            product.report.qa.find((q) => q.dimension === "mechanical")
              ?.status !==
              (quality.facts.failures.mechanical ? "failed" : "unreviewed")
          )
            throw Error(
              "Native QA report does not agree with its replayed sampled findings",
            );
        } else if (
          product.artifacts.some((f) => f.path.endsWith("/qa-facts.json"))
        )
          throw Error("Native QA facts require the current selected QA plan");
        const decoded = await checkMechanismProductionDecodedOutput(
          await artifact("output.mp4"),
          {
            frameCount: compiled.frameCount,
            width: compiled.plan.width,
            height: compiled.plan.height,
            fps: compiled.plan.fps,
            sourceSamples: compiled.plan.narration.sampleCount,
          },
          context.nodeMemory,
          context.signal,
        );
        if (
          mechanismPackHash(decoded.video) !==
            mechanismPackHash(proof.value.video) ||
          decoded.audio.bytes !== proof.value.audio.bytes ||
          decoded.audio.sha256 !== proof.value.audio.sha256
        )
          throw Error("Actual native decoded output changed after sealing");
      } finally {
        proof.release();
        composition.release();
        map.release();
      }
    },
  };
  return executor;
}
