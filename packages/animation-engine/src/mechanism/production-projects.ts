import { mkdir, realpath } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { z } from "zod";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import {
  MechanismProductionQueueVersionsSchema as MechanismProductionQueueSchema,
  MechanismProductionQueueItemSchema,
  MECHANISM_PRODUCTION_QUEUE_LIMITS as LIMIT,
  type MechanismProductionQueueAny as MechanismProductionQueue,
} from "./production-queue-contract.ts";
import {
  readProductionJSON,
  writeProductionJSON,
  productionFailure,
} from "./production-queue-files.ts";
import { cuePlateFile } from "./cue-plate-files.ts";
import type { MechanismProductionProjectInput } from "./production-native-inputs.ts";

export const MechanismProductionProjectsSchema = z
  .object({
    schemaVersion: z.literal("mechanism-production-projects-1"),
    id: MechanismProductionQueueItemSchema.shape.id,
    projects: z
      .array(
        z
          .object({
            id: MechanismProductionQueueItemSchema.shape.id,
            question: MechanismProductionQueueItemSchema.shape.question,
            familyPath: z.string().min(1).max(2048),
            cuePath: z.string().min(1).max(2048),
            qaPath: z.string().min(1).max(2048).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(LIMIT.items),
  })
  .strict()
  .superRefine((input, context) => {
    const ids = input.projects.map((p) => p.id);
    const questions = input.projects.map((p) =>
      p.question.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(),
    );
    if (
      new Set(ids).size !== ids.length ||
      questions.some((q) => !q) ||
      new Set(questions).size !== questions.length
    )
      context.addIssue({
        code: "custom",
        message: "Projects require distinct IDs and normalized questions",
      });
  });
const admittedProjectsSchema = z
  .unknown()
  .superRefine((value, context) => {
    if (
      value &&
      typeof value === "object" &&
      "projects" in value &&
      Array.isArray(value.projects) &&
      value.projects.length > LIMIT.items
    )
      context.addIssue({
        code: "custom",
        path: ["projects"],
        message: "Project count exceeds the production queue limit",
      });
  })
  .pipe(MechanismProductionProjectsSchema);

export interface MechanismProductionQueueFactory {
  createQueue(
    id: string,
    projects: MechanismProductionProjectInput[],
    directory: string,
  ): Promise<MechanismProductionQueue>;
}
/** Publish one immutable manifest; all source pins are inspected by the declared factory. */
export async function createMechanismProductionQueueFile(
  projectsPath: string,
  manifestPath: string,
  factory: MechanismProductionQueueFactory,
  options: { nodeMemory?: CompositionNodeMemory; signal?: AbortSignal } = {},
) {
  const owner = new CompositionNodeMemory(options.nodeMemory);
  const inputPath = resolve(projectsPath),
    destination = resolve(manifestPath);
  try {
    if (inputPath.length > 2048 || destination.length > 2048)
      productionFailure(
        "production-project-path",
        "Resolved project/manifest paths exceed2048 characters",
        projectsPath,
      );
    const input = await readProductionJSON(
      inputPath,
      admittedProjectsSchema,
      owner,
      LIMIT.manifestBytes,
      options.signal,
    );
    try {
      options.signal?.throwIfAborted();
      const sourceDirectory = dirname(await realpath(inputPath));
      const projects = input.value.projects.map((p) => ({
        id: p.id,
        question: p.question,
        familyPath: resolve(sourceDirectory, p.familyPath),
        cuePath: resolve(sourceDirectory, p.cuePath),
        ...(p.qaPath === undefined
          ? {}
          : { qaPath: resolve(sourceDirectory, p.qaPath) }),
      }));
      for (const project of projects) {
        project.familyPath = await realpath(project.familyPath);
        project.cuePath = await realpath(project.cuePath);
        if (project.qaPath !== undefined)
          project.qaPath = await realpath(project.qaPath);
      }
      await mkdir(dirname(destination), { recursive: true });
      const manifestDirectory = await realpath(dirname(destination));
      const manifest = MechanismProductionQueueSchema.parse(
        await factory.createQueue(input.value.id, projects, manifestDirectory),
      );
      if (
        manifest.id !== input.value.id ||
        manifest.items.length !== projects.length ||
        manifest.items.some((item, index) => {
          const project = projects[index]!;
          return (
            item.id !== project.id ||
            item.question !== project.question ||
            resolve(manifestDirectory, item.familyPath) !==
              project.familyPath ||
            resolve(manifestDirectory, item.cuePath) !== project.cuePath ||
            (item.qaPath === undefined
              ? undefined
              : resolve(manifestDirectory, item.qaPath)) !== project.qaPath
          );
        })
      )
        productionFailure(
          "production-project-binding",
          "Generated manifest differs from the declared projects",
          projectsPath,
        );
      options.signal?.throwIfAborted();
      await writeProductionJSON(
        resolve(manifestDirectory, basename(destination)),
        manifest,
        owner,
        LIMIT.manifestBytes,
        true,
      );
      const file = await cuePlateFile(destination, owner, {
        maximumBytes: LIMIT.manifestBytes,
      });
      return {
        schemaVersion: "mechanism-production-queue-creation-1" as const,
        queueId: manifest.id,
        selected: manifest.items.length,
        manifest: { ...file, path: destination },
        projectFile: { path: inputPath, sha256: input.sha256 },
        codeSha256: manifest.codeSha256,
        profileSha256: manifest.profileSha256,
        qualification:
          "Pinned queue inputs only; no execution, review or pilot admission.",
      };
    } finally {
      input.release();
    }
  } finally {
    owner.dispose();
  }
}
