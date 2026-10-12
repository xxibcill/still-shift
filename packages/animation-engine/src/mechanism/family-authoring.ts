import { mkdir } from "node:fs/promises";
import { MechanismPackInvariantError } from "./pack-invariant.ts";
import { z } from "zod";
import { dirname, resolve } from "node:path";
import { acquireArtifactLock } from "@still-shift/execution-runtime/locks";
import {
  AnimationEngineError,
  MechanismIdSchema,
  MechanismHashSchema,
  MechanismPackReferenceSchema,
  MechanismTransformSchema,
} from "@still-shift/scene-contract";
import {
  TapeHookPackInputSchema,
  createTapeHookPack,
} from "./tape-hook-pack.ts";
import {
  CableTiePackInputSchema,
  createCableTiePack,
} from "./cable-tie-pack.ts";
import {
  ClothespegPackInputSchema,
  createClothespegPack,
} from "./clothespeg-pack.ts";
import { freezeMechanismPack, mechanismPackHash } from "./pack-support.ts";
import { readMechanismJson, writeMechanismJson } from "./io.ts";
import { MECHANISM_RESPONSE_LIMITS } from "./protocol.ts";
const revision = z.number().int().min(0).max(2_147_483_647);
const header = {
  schemaVersion: z.literal("mechanism-family-authoring-1"),
  id: MechanismIdSchema,
  revision,
  pack: MechanismPackReferenceSchema,
};
export const MechanismFamilyAuthoringSchema = z.discriminatedUnion("family", [
  z
    .object({
      ...header,
      family: z.literal("tape-hook"),
      input: TapeHookPackInputSchema,
    })
    .strict(),
  z
    .object({
      ...header,
      family: z.literal("cable-tie"),
      input: CableTiePackInputSchema,
    })
    .strict(),
  z
    .object({
      ...header,
      family: z.literal("clothespeg"),
      input: ClothespegPackInputSchema,
    })
    .strict(),
]);
export type MechanismFamilyAuthoring = z.infer<
  typeof MechanismFamilyAuthoringSchema
>;
export const MechanismFamilyPatchSchema = z
  .object({
    schemaVersion: z.literal("mechanism-family-patch-1"),
    baseRevision: revision,
    baseHash: MechanismHashSchema,
    operations: z
      .array(
        z.discriminatedUnion("property", [
          z
            .object({
              property: z.literal("parameter"),
              id: MechanismIdSchema,
              value: z.number().finite(),
            })
            .strict(),
          z
            .object({
              property: z.literal("mount"),
              value: MechanismTransformSchema,
            })
            .strict(),
          z
            .object({
              property: z.literal("style"),
              value: z
                .record(
                  z.string().min(1).max(128),
                  z.union([z.string().max(64), z.number().finite()]),
                )
                .refine((value) => Object.keys(value).length <= 5),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(MECHANISM_RESPONSE_LIMITS.patchOperations),
  })
  .strict()
  .refine(
    (patch) =>
      Buffer.byteLength(JSON.stringify(patch)) <=
      MECHANISM_RESPONSE_LIMITS.patchBytes,
    { message: "Patch exceeds 16 KiB" },
  );
function failure(code: string, message: string, path: string): never {
  throw new AnimationEngineError("SCENE_INVALID", message, {
    stage: "mechanism-family-authoring",
    diagnosticCode: code,
    path,
    nextAction:
      "Inspect the current family document revision/hash and pack reference, then submit a fresh scoped patch.",
  });
}
function version(input: unknown, expected: string) {
  if (
    input &&
    typeof input === "object" &&
    "schemaVersion" in input &&
    input.schemaVersion !== expected
  )
    failure(
      "mechanism-version",
      `Unsupported family authoring version ${String(input.schemaVersion).slice(0, 128)}; expected ${expected}`,
      "schemaVersion",
    );
}
/** Validation regenerates the actual family; pack pinning is not a metadata-only check. */
export function inspectMechanismFamilyAuthoring(input: unknown) {
  version(input, "mechanism-family-authoring-1");
  const document = MechanismFamilyAuthoringSchema.parse(input);
  if (
    document.input.expectedPack &&
    mechanismPackHash(document.input.expectedPack) !==
      mechanismPackHash(document.pack)
  )
    failure(
      "mechanism-pack-revision",
      "Input and document pack references disagree",
      "input/expectedPack",
    );
  let instance;
  try {
    instance =
      document.family === "tape-hook"
        ? createTapeHookPack({ ...document.input, expectedPack: document.pack })
        : document.family === "cable-tie"
          ? createCableTiePack({
              ...document.input,
              expectedPack: document.pack,
            })
          : createClothespegPack({
              ...document.input,
              expectedPack: document.pack,
            });
  } catch (error) {
    if (error instanceof MechanismPackInvariantError)
      failure(
        error.location.code,
        error.message,
        error.location.path.join("/"),
      );
    throw error;
  }
  return freezeMechanismPack({
    document,
    projectHash: mechanismPackHash(document),
    instance,
  });
}
export function createMechanismFamilyAuthoring(
  family: MechanismFamilyAuthoring["family"],
  id: string,
  input: unknown = {},
) {
  family = z.enum(["tape-hook", "cable-tie", "clothespeg"]).parse(family);
  const options =
    family === "tape-hook"
      ? TapeHookPackInputSchema.parse(input)
      : family === "cable-tie"
        ? CableTiePackInputSchema.parse(input)
        : ClothespegPackInputSchema.parse(input);
  const instance =
    family === "tape-hook"
      ? createTapeHookPack(TapeHookPackInputSchema.parse(options))
      : family === "cable-tie"
        ? createCableTiePack(CableTiePackInputSchema.parse(options))
        : createClothespegPack(ClothespegPackInputSchema.parse(options));
  return inspectMechanismFamilyAuthoring({
    schemaVersion: "mechanism-family-authoring-1",
    id,
    revision: 0,
    family,
    input: options,
    pack: instance.pack,
  });
}
export function applyMechanismFamilyPatch(input: unknown, request: unknown) {
  const current = inspectMechanismFamilyAuthoring(input);
  version(request, "mechanism-family-patch-1");
  const patch = MechanismFamilyPatchSchema.parse(request);
  if (
    current.document.revision !== patch.baseRevision ||
    current.projectHash !== patch.baseHash
  )
    failure(
      "mechanism-stale-revision",
      "Family changed since the supplied revision/hash",
      "baseRevision/baseHash",
    );
  const next = structuredClone(current.document),
    changedPaths: string[] = [],
    writers = new Set<string>();
  for (const operation of patch.operations) {
    const path =
      operation.property === "parameter"
        ? `input.parameters.${operation.id}`
        : `input.${operation.property}`;
    if (writers.has(path))
      failure("mechanism-patch-conflict", "Duplicate property writer", path);
    writers.add(path);
    if (operation.property === "parameter") {
      if (!Object.hasOwn(next.input.parameters, operation.id))
        failure("mechanism-patch-target", "Unknown family parameter", path);
      Object.assign(next.input.parameters, { [operation.id]: operation.value });
    } else Object.assign(next.input, { [operation.property]: operation.value });
    changedPaths.push(path);
  }
  next.revision++;
  const validated = inspectMechanismFamilyAuthoring(next);
  return freezeMechanismPack({
    schemaVersion: "mechanism-family-patch-result-1" as const,
    document: validated.document,
    projectHash: validated.projectHash,
    changedPaths,
    affectedComponents: [validated.document.id],
    sourceSha256: validated.instance.sourceSha256,
    previousSourceSha256: current.instance.sourceSha256,
    cacheEffects: {
      geometry: patch.operations.some((op) => op.property === "parameter")
        ? "regenerate"
        : "reuse-local-buffers",
      sourceScene: "regenerate",
      nativePlates: "invalidate-dependent-clips",
      overlayLayout: "recheck-dependent-clips",
      narration: "reuse-unchanged-source",
    },
    nextAction:
      "Regenerate the pinned scene asset and recompile/recheck dependent cue documents before rendering.",
  });
}
export async function readMechanismFamilyAuthoring(path: string) {
  return inspectMechanismFamilyAuthoring(
    await readMechanismJson(resolve(path)),
  );
}
/** Existing artifact lock and same-filesystem atomic publication protect CAS and fresh saves. */
export async function saveMechanismFamilyAuthoring(
  input: unknown,
  path: string,
  base?: { revision: number; hash: string },
) {
  const destination = resolve(path),
    next = inspectMechanismFamilyAuthoring(input);
  await mkdir(dirname(destination), { recursive: true });
  const unlock = await acquireArtifactLock(
    `${destination}.lock`,
    dirname(destination),
  );
  try {
    if (base) {
      const current = await readMechanismFamilyAuthoring(destination);
      if (
        current.document.revision !== base.revision ||
        current.projectHash !== base.hash
      )
        failure(
          "mechanism-stale-revision",
          "Saved family changed since the supplied base",
          destination,
        );
      if (
        next.document.id !== current.document.id ||
        next.document.family !== current.document.family ||
        mechanismPackHash(next.document.pack) !==
          mechanismPackHash(current.document.pack)
      )
        failure(
          "mechanism-patch-target",
          "A saved edit must preserve project and immutable pack identity",
          destination,
        );
      if (next.document.revision !== base.revision + 1)
        failure(
          "mechanism-revision",
          "Saved edit must advance exactly one revision",
          "revision",
        );
    }
    await writeMechanismJson(destination, next.document, { replace: !!base });
    return {
      schemaVersion: "mechanism-family-save-result-1" as const,
      path: destination,
      revision: next.document.revision,
      projectHash: next.projectHash,
      sourceSha256: next.instance.sourceSha256,
    };
  } finally {
    await unlock();
  }
}
export async function patchMechanismFamilyAuthoring(
  path: string,
  request: unknown,
) {
  const current = await readMechanismFamilyAuthoring(path);
  const result = applyMechanismFamilyPatch(current.document, request);
  const saved = await saveMechanismFamilyAuthoring(result.document, path, {
    revision: current.document.revision,
    hash: current.projectHash,
  });
  return {
    ...result,
    ...saved,
    schemaVersion: "mechanism-family-patch-result-1" as const,
  };
}
