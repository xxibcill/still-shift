import { readBoundedSourceBytes } from "../bounded-source-read.ts";
import { NativeSourceAdmission } from "../native-source-admission.ts";
import { z } from "zod";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { acquireArtifactLock } from "@still-shift/execution-runtime/locks";
import {
  AnimationEngineError,
  MechanismNarratedCycleSchema,
  MechanismHashSchema,
  MechanismSceneV2Schema,
  MechanismWorldTextAnnotationSchema,
  MechanismSurfaceMarkingSchema,
  type MechanismNarratedCycle,
} from "@still-shift/scene-contract";
import {
  compileMechanismNarratedCycle,
  type CompiledMechanismNarratedCycle,
} from "./narrated-cycle.ts";
import {
  freezeMechanismPack,
  mechanismPackHash,
  type MechanismPackInstanceSource,
} from "./pack-support.ts";
import { MechanismPackInvariantError } from "./pack-invariant.ts";
import { readMechanismJson, writeMechanismJson, mechanismHash } from "./io.ts";
import { MECHANISM_RESPONSE_LIMITS } from "./protocol.ts";
export interface MechanismCueAuthoringInspection {
  document: MechanismNarratedCycle;
  projectHash: string;
  compiled: CompiledMechanismNarratedCycle;
}
export interface MechanismCuePatchResult
  extends MechanismCueAuthoringInspection {
  schemaVersion: "mechanism-cue-patch-result-1";
  changedPaths: string[];
  affectedShots: string[];
  cacheEffects: {
    sourceScene: string;
    nativePlates: string;
    overlays: string;
    soundMix: string;
    narration: string;
  };
  nextAction: string;
}
export interface SavedMechanismCuePatchResult extends MechanismCuePatchResult {
  path: string;
  revision: number;
}
const cue = MechanismNarratedCycleSchema.shape.cues.element;
const cueTarget = { cue: cue.shape.id };
const annotationTarget = {
  ...cueTarget,
  annotation: cue.shape.annotations.unwrap().element.shape.id,
};
export const MechanismCuePatchSchema = z
  .object({
    schemaVersion: z.literal("mechanism-cue-patch-1"),
    baseRevision: MechanismNarratedCycleSchema.shape.revision,
    baseHash: MechanismHashSchema,
    operations: z
      .array(
        z.discriminatedUnion("property", [
          z
            .object({
              ...cueTarget,
              property: z.literal("caption"),
              value: cue.shape.text,
            })
            .strict(),
          z
            .object({
              ...cueTarget,
              property: z.literal("window"),
              value: cue.pick({ startSample: true, endSampleExclusive: true }),
            })
            .strict(),
          z
            .object({
              ...cueTarget,
              property: z.literal("semantic"),
              value: cue.pick({
                kind: true,
                state: true,
                minimumActionSamples: true,
              }),
            })
            .strict(),
          z
            .object({
              ...cueTarget,
              property: z.literal("camera"),
              value: cue.pick({ camera: true, editing: true }),
            })
            .strict(),
          z
            .object({
              ...annotationTarget,
              property: z.literal("annotation"),
              value: cue.shape.annotations.unwrap().element.omit({ id: true }),
            })
            .strict(),
          z
            .object({
              ...annotationTarget,
              property: z.literal("world-annotation"),
              value: z.discriminatedUnion("kind", [
                MechanismWorldTextAnnotationSchema.omit({ id: true }),
                MechanismSurfaceMarkingSchema.omit({ id: true }),
              ]),
            })
            .strict(),
          z
            .object({
              ...cueTarget,
              sound: cue.shape.sounds.unwrap().element.shape.id,
              property: z.literal("sound-gain"),
              value: cue.shape.sounds.unwrap().element.shape.gainDb,
            })
            .strict(),
          z
            .object({
              rig: MechanismNarratedCycleSchema.shape.controls.element.shape
                .rig,
              property: z.literal("rig-control"),
              value:
                MechanismNarratedCycleSchema.shape.controls.element.shape
                  .control,
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
    stage: "mechanism-cue-authoring",
    diagnosticCode: code,
    path,
    nextAction:
      "Inspect the current cue revision/hash and pinned family source, repair the located field, then recompile/render/check.",
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
      `Unsupported cue version ${String(input.schemaVersion).slice(0, 128)}; expected ${expected}`,
      "schemaVersion",
    );
}
/** Pure inspection checks timing/rig semantics; actual source-file pins are checked by saved I/O. */
export function inspectMechanismCueAuthoring(
  instance: MechanismPackInstanceSource,
  input: unknown,
): MechanismCueAuthoringInspection {
  version(input, "mechanism-narrated-cycle-1");
  const document = MechanismNarratedCycleSchema.parse(input);
  try {
    const compiled = compileMechanismNarratedCycle(instance, document);
    return freezeMechanismPack({
      document,
      projectHash: mechanismPackHash(document),
      compiled,
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
}
export function applyMechanismCuePatch(
  instance: MechanismPackInstanceSource,
  input: unknown,
  request: unknown,
): MechanismCuePatchResult {
  const current = inspectMechanismCueAuthoring(instance, input);
  version(request, "mechanism-cue-patch-1");
  const patch = MechanismCuePatchSchema.parse(request);
  if (
    current.document.revision !== patch.baseRevision ||
    current.projectHash !== patch.baseHash
  )
    failure(
      "mechanism-stale-revision",
      "Cue document changed since the supplied revision/hash",
      "baseRevision/baseHash",
    );
  const next = structuredClone(current.document),
    writers = new Set<string>(),
    changedPaths: string[] = [],
    affected = new Set<string>();
  let native = false,
    audio = false,
    all = false;
  for (const operation of patch.operations) {
    let path: string;
    if (operation.property === "rig-control") {
      path = `controls.${operation.rig}`;
      const target = next.controls.find(
        (control) => control.rig === operation.rig,
      );
      if (!target)
        failure(
          "mechanism-patch-target",
          "Unknown stable rig-control target",
          path,
        );
      target.control = operation.value;
      native = true;
      all = true;
    } else {
      const target = next.cues.find((cue) => cue.id === operation.cue);
      if (!target)
        failure(
          "mechanism-patch-target",
          "Unknown stable cue target",
          `cues.${operation.cue}`,
        );
      affected.add(target.id);
      path = `cues.${target.id}.${operation.property}`;
      if (operation.property === "caption") target.text = operation.value;
      else if (operation.property === "annotation") {
        path = `cues.${target.id}.annotations.${operation.annotation}`;
        const annotation = target.annotations.find(
          (annotation) => annotation.id === operation.annotation,
        );
        if (!annotation)
          failure(
            "mechanism-patch-target",
            "Unknown stable annotation target",
            path,
          );
        Object.assign(annotation, operation.value);
      } else if (operation.property === "world-annotation") {
        path = `cues.${target.id}.worldAnnotations.${operation.annotation}`;
        const annotation = target.worldAnnotations?.find(
          (annotation) => annotation.id === operation.annotation,
        );
        if (!annotation)
          failure(
            "mechanism-patch-target",
            "Unknown stable world annotation target",
            path,
          );
        const index = target.worldAnnotations!.indexOf(annotation);
        target.worldAnnotations![index] = {
          id: annotation.id,
          ...operation.value,
        };
        native = true;
      } else if (operation.property === "sound-gain") {
        path = `cues.${target.id}.sounds.${operation.sound}.gainDb`;
        const sound = target.sounds.find(
          (sound) => sound.id === operation.sound,
        );
        if (!sound)
          failure(
            "mechanism-patch-target",
            "Unknown stable sound target",
            path,
          );
        sound.gainDb = operation.value;
        audio = true;
      } else {
        if (operation.property === "camera") delete target.camera;
        Object.assign(target, operation.value);
        native = true;
        all = true;
        if (operation.property === "window") audio = true;
      }
    }
    if (writers.has(path))
      failure(
        "mechanism-patch-conflict",
        "Duplicate scoped property writer",
        path,
      );
    writers.add(path);
    changedPaths.push(path);
  }
  next.revision++;
  const validated = inspectMechanismCueAuthoring(instance, next);
  return freezeMechanismPack({
    schemaVersion: "mechanism-cue-patch-result-1" as const,
    document: validated.document,
    projectHash: validated.projectHash,
    changedPaths,
    affectedShots: all
      ? next.cues.map((cue) => cue.id)
      : next.cues.filter((cue) => affected.has(cue.id)).map((cue) => cue.id),
    compiled: validated.compiled,
    cacheEffects: {
      sourceScene: "reuse-pinned-asset",
      nativePlates: native
        ? "invalidate-whole-native-clip"
        : "reuse-picture-recheck-overlay-bindings",
      overlays: "invalidate-affected-cues",
      soundMix: audio ? "remix-supplied-effects" : "reuse",
      narration: "reuse-unchanged-source-clock",
    },
    nextAction:
      "Render the recompiled composition and check the final output; cache effects report required work, not a completed rerender.",
  });
}
/** Same regular descriptor supplies bounded bytes/hash/JSON; reject growth or in-place changes. */
async function verifySource(
  instance: MechanismPackInstanceSource,
  document: ReturnType<typeof inspectMechanismCueAuthoring>["document"],
  directory: string,
  signal?: AbortSignal,
) {
  const path = resolve(directory, document.source.path),
    admission = new NativeSourceAdmission(),
    stage = admission.begin("source/path");
  let bytes: Buffer | undefined;
  try {
    bytes = await readBoundedSourceBytes(path, {
      maximumBytes: 33554432,
      signal,
      admit: stage.admitBody,
      reject: (reason) =>
        failure(
          reason === "size"
            ? "mechanism-source-budget"
            : reason === "type"
              ? "mechanism-source-type"
              : "mechanism-source-changed",
          reason === "size"
            ? "Cue source exceeds 32 MiB"
            : reason === "type"
              ? "Cue source must be a regular file"
              : "Cue source changed during admission",
          "source/path",
        ),
    });
    if (mechanismHash(bytes) !== document.source.sha256)
      failure(
        "mechanism-cue-source-pin",
        "Cue source file hash differs from its pinned asset",
        "source/sha256",
      );
    const text = bytes.toString("utf8");
    stage.admitTree(text);
    const scene = MechanismSceneV2Schema.parse(JSON.parse(text) as unknown);
    if (
      mechanismPackHash(scene) !== instance.sourceSha256 ||
      mechanismPackHash(instance.scene) !== instance.sourceSha256
    )
      failure(
        "mechanism-cue-family-source",
        "Pinned source differs from the supplied family instance",
        "source/path",
      );
  } finally {
    try {
      if (bytes?.buffer.byteLength)
        (
          bytes.buffer as ArrayBuffer & { transfer(bytes: number): ArrayBuffer }
        ).transfer(0);
    } finally {
      stage.dispose();
      admission.dispose();
    }
  }
}

export async function readMechanismCueAuthoring(
  instance: MechanismPackInstanceSource,
  path: string,
  options: { signal?: AbortSignal | undefined } = {},
): Promise<MechanismCueAuthoringInspection> {
  const result = inspectMechanismCueAuthoring(
    instance,
    await readMechanismJson(resolve(path), options),
  );
  await verifySource(
    instance,
    result.document,
    dirname(resolve(path)),
    options.signal,
  );
  return result;
}
export async function saveMechanismCueAuthoring(
  instance: MechanismPackInstanceSource,
  input: unknown,
  path: string,
  base?: { revision: number; hash: string },
) {
  const destination = resolve(path),
    next = inspectMechanismCueAuthoring(instance, input);
  await mkdir(dirname(destination), { recursive: true });
  const unlock = await acquireArtifactLock(
    `${destination}.lock`,
    dirname(destination),
  );
  try {
    if (base) {
      const current = await readMechanismCueAuthoring(instance, destination);
      if (
        current.document.revision !== base.revision ||
        current.projectHash !== base.hash
      )
        failure(
          "mechanism-stale-revision",
          "Saved cues changed since the supplied base",
          destination,
        );
      if (next.document.revision !== base.revision + 1)
        failure(
          "mechanism-revision",
          "Saved edit must advance exactly one revision",
          "revision",
        );
      for (const field of [
        "id",
        "source",
        "font",
        "narration",
        "output",
      ] as const)
        if (
          mechanismPackHash(next.document[field]) !==
          mechanismPackHash(current.document[field])
        )
          failure(
            "mechanism-patch-target",
            "Saved cue edit must preserve identity, pinned media and recording clock",
            field,
          );
    }
    await verifySource(instance, next.document, dirname(destination));
    await writeMechanismJson(destination, next.document, { replace: !!base });
    return {
      schemaVersion: "mechanism-cue-save-result-1" as const,
      path: destination,
      revision: next.document.revision,
      projectHash: next.projectHash,
    };
  } finally {
    await unlock();
  }
}
export async function patchMechanismCueAuthoring(
  instance: MechanismPackInstanceSource,
  path: string,
  request: unknown,
): Promise<SavedMechanismCuePatchResult> {
  const current = await readMechanismCueAuthoring(instance, path),
    result = applyMechanismCuePatch(instance, current.document, request);
  const saved = await saveMechanismCueAuthoring(
    instance,
    result.document,
    path,
    { revision: current.document.revision, hash: current.projectHash },
  );
  return {
    ...result,
    ...saved,
    schemaVersion: "mechanism-cue-patch-result-1" as const,
  };
}
