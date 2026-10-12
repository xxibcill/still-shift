import {
  MechanismProductionQAPlanSchema,
  MECHANISM_PRODUCTION_QA_LIMITS,
} from "./production-qa-contract.ts";
import { readProductionJSON } from "./production-queue-files.ts";
import { dirname, relative, resolve } from "node:path";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import { readMechanismFamilyAuthoring } from "./family-authoring.ts";
import { readMechanismCueAuthoring } from "./cue-authoring.ts";
import { cuePlateFile } from "./cue-plate-files.ts";
import {
  MechanismProductionQueueItemSchema,
  type MechanismProductionQueueItem,
} from "./production-queue-contract.ts";
import { productionFailure } from "./production-queue-files.ts";

export interface MechanismProductionProjectInput {
  id: string;
  question: string;
  familyPath: string;
  cuePath: string;
  qaPath?: string;
}
export async function inspectMechanismProductionNativeItem(
  project: MechanismProductionProjectInput,
  manifestDirectory: string,
): Promise<MechanismProductionQueueItem> {
  const familyPath = resolve(manifestDirectory, project.familyPath),
    cuePath = resolve(manifestDirectory, project.cuePath);
  const family = await readMechanismFamilyAuthoring(familyPath);
  const cue = await readMechanismCueAuthoring(family.instance, cuePath);
  const owner = new CompositionNodeMemory();
  try {
    const files = new Map<string, string | undefined>([
      [familyPath, undefined],
      [cuePath, undefined],
    ]);
    for (const asset of [
      cue.document.source,
      cue.document.font,
      cue.document.narration,
      ...cue.document.cues.flatMap((c) => c.sounds.map((s) => s.asset)),
    ]) {
      const path = resolve(dirname(cuePath), asset.path);
      const previous = files.get(path);
      if (previous && previous !== asset.sha256)
        productionFailure(
          "production-input-pin-conflict",
          "One dependency has conflicting hashes",
          path,
        );
      files.set(path, asset.sha256);
    }
    if (project.qaPath) {
      const qaPath = resolve(manifestDirectory, project.qaPath);
      const qa = await readProductionJSON(
        qaPath,
        MechanismProductionQAPlanSchema,
        owner,
        MECHANISM_PRODUCTION_QA_LIMITS.planBytes,
      );
      try {
        files.set(qaPath, qa.sha256);
      } finally {
        qa.release();
      }
    }
    const inputs = [];
    for (const [path, expected] of files) {
      const file = await cuePlateFile(
        path,
        owner,
        expected ? { sha256: expected } : {},
      );
      inputs.push({
        ...file,
        path: relative(resolve(manifestDirectory), path).split("\\").join("/"),
      });
    }
    inputs.sort((a, b) => a.path.localeCompare(b.path, "en"));
    return MechanismProductionQueueItemSchema.parse({
      id: project.id,
      question: project.question,
      family: family.document.family,
      designVariant: family.instance.pack.variant,
      familyPath: relative(resolve(manifestDirectory), familyPath)
        .split("\\")
        .join("/"),
      cuePath: relative(resolve(manifestDirectory), cuePath)
        .split("\\")
        .join("/"),
      ...(project.qaPath
        ? {
            qaPath: relative(
              resolve(manifestDirectory),
              resolve(manifestDirectory, project.qaPath),
            )
              .split("\\")
              .join("/"),
          }
        : {}),
      clock: {
        outputFrames: cue.compiled.composition.frameCount,
        sourceSamples: cue.document.narration.sampleCount,
      },
      inputs,
    });
  } finally {
    owner.dispose();
  }
}
