import { z } from "zod";
import { mkdir, mkdtemp, readFile, rm, open } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  AnimationEngineError,
  MechanismHashSchema,
  CompositionSchema,
} from "@still-shift/scene-contract";
import {
  CompositionNodeMemory,
  compositionWorkerMemoryLimits,
  verifyNativeObservationClosureVersions,
  isNativeObservationRequestV2,
} from "@still-shift/execution-runtime/export";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { readMechanismFamilyAuthoring } from "./family-authoring.ts";
import { readMechanismCueAuthoring } from "./cue-authoring.ts";
import { readMechanismJson, writeMechanismJson, mechanismHash } from "./io.ts";
import { mechanismPackHash } from "./pack-support.ts";
import { loadComposition, renderComposition } from "../composition-render.ts";
import { createNativeObservationRequestVersions } from "../native-observation.ts";
import { ManagedMemory } from "../../../renderer-core/src/managed-memory.ts";
const path = z.string().min(1).max(2048),
  revision = z.number().int().min(0).max(2147483647);
const author = z
  .object({ path, revision, projectHash: MechanismHashSchema })
  .strict();
export const MechanismCueCompilationSchema = z
  .object({
    schemaVersion: z.literal("mechanism-cue-compilation-1"),
    family: author,
    cue: author,
    composition: z.object({ path, sha256: MechanismHashSchema }).strict(),
    frameCount: z.number().int().min(1).max(108000),
    fps: z.number().int().min(1).max(60),
    width: z.number().int().min(16).max(8192),
    height: z.number().int().min(16).max(8192),
  })
  .strict();
function failure(code: string, message: string, location: string): never {
  throw new AnimationEngineError("SCENE_INVALID", message, {
    stage: "mechanism-cue-lifecycle",
    diagnosticCode: code,
    path: location,
    nextAction:
      "Compile the current family/cue revision into a fresh directory, then render/check that snapshot.",
  });
}
async function current(familyPath: string, cuePath: string) {
  const family = await readMechanismFamilyAuthoring(familyPath),
    cue = await readMechanismCueAuthoring(family.instance, cuePath);
  const composition = CompositionSchema.parse({
    ...cue.compiled.composition,
    assets: cue.compiled.composition.assets.map((asset) => ({
      ...asset,
      path: resolve(dirname(resolve(cuePath)), asset.path),
    })),
  });
  return { family, cue, composition };
}
function pins(
  value: Awaited<ReturnType<typeof current>>,
  familyPath: string,
  cuePath: string,
) {
  return {
    family: {
      path: resolve(familyPath),
      revision: value.family.document.revision,
      projectHash: value.family.projectHash,
    },
    cue: {
      path: resolve(cuePath),
      revision: value.cue.document.revision,
      projectHash: value.cue.projectHash,
    },
  };
}
function assertPins(
  receipt: z.infer<typeof MechanismCueCompilationSchema>,
  value: Awaited<ReturnType<typeof current>>,
  familyPath: string,
  cuePath: string,
) {
  if (
    mechanismPackHash({ family: receipt.family, cue: receipt.cue }) !==
    mechanismPackHash(pins(value, familyPath, cuePath))
  )
    failure(
      "mechanism-stale-compilation",
      "Compilation does not match the current family/cue revision",
      "family/cue",
    );
}
export async function compileMechanismCueProject(
  familyPath: string,
  cuePath: string,
  outputDirectory: string,
  options: {
    signal?: AbortSignal | undefined;
    nodeMemory?: CompositionNodeMemory;
  } = {},
) {
  options.signal?.throwIfAborted();
  const value = await current(familyPath, cuePath),
    scratch = await mkdtemp(join(tmpdir(), "still-shift-cue-compile-")),
    memory = new CompositionNodeMemory(options.nodeMemory);
  try {
    const temporary = join(scratch, "composition.json");
    await writeMechanismJson(temporary, value.composition);
    // Normal loading verifies actual native/font/audio media before publishing authoring artifacts.
    await loadComposition(temporary, "webgl2", {
      nodeMemory: memory,
      signal: options.signal,
    });
    const output = resolve(outputDirectory),
      compositionPath = join(output, "composition.json"),
      receiptPath = join(output, "cue-compilation.json");
    const receipt = MechanismCueCompilationSchema.parse({
      schemaVersion: "mechanism-cue-compilation-1",
      ...pins(value, familyPath, cuePath),
      composition: {
        path: compositionPath,
        sha256: mechanismHash(await readFile(temporary)),
      },
      frameCount: value.composition.frameCount,
      fps: value.composition.fps,
      width: value.composition.width,
      height: value.composition.height,
    });
    assertPins(
      receipt,
      await current(familyPath, cuePath),
      familyPath,
      cuePath,
    );
    options.signal?.throwIfAborted();
    await mkdir(dirname(output), { recursive: true });
    await mkdir(output); // Existing directories are never overwritten.
    await writeMechanismJson(compositionPath, value.composition);
    await writeMechanismJson(receiptPath, receipt);
    return {
      schemaVersion: "mechanism-cue-compile-result-1" as const,
      status: "passed" as const,
      compositionPath,
      receiptPath,
      receipt,
      scope: "current-revision-semantic-and-actual-media-compilation",
      nextAction:
        "Render this snapshot while the family/cue revision remains current.",
    };
  } finally {
    memory.dispose();
    await rm(scratch, { recursive: true, force: true });
  }
}
export async function readMechanismCueCompilation(
  familyPath: string,
  cuePath: string,
  preparedDirectory: string,
) {
  const receiptPath = join(resolve(preparedDirectory), "cue-compilation.json"),
    input = await readMechanismJson(receiptPath);
  if (
    input &&
    typeof input === "object" &&
    "schemaVersion" in input &&
    input.schemaVersion !== "mechanism-cue-compilation-1"
  )
    failure(
      "mechanism-version",
      `Unsupported cue compilation version ${String(input.schemaVersion).slice(0, 128)}; expected mechanism-cue-compilation-1`,
      "schemaVersion",
    );
  const receipt = MechanismCueCompilationSchema.parse(input),
    value = await current(familyPath, cuePath);
  assertPins(receipt, value, familyPath, cuePath);
  if (
    receipt.composition.path !==
    join(resolve(preparedDirectory), "composition.json")
  )
    failure(
      "mechanism-compilation-path",
      "Compilation must name its sibling composition",
      "composition/path",
    );
  const bytes = await readFile(receipt.composition.path);
  if (mechanismHash(bytes) !== receipt.composition.sha256)
    failure(
      "mechanism-compilation-hash",
      "Compiled composition bytes changed",
      "composition/sha256",
    );
  const document = CompositionSchema.parse(
    JSON.parse(bytes.toString("utf8")) as unknown,
  );
  if (mechanismPackHash(document) !== mechanismPackHash(value.composition))
    failure(
      "mechanism-compilation-content",
      "Compiled composition differs from the current cue semantics",
      "composition",
    );
  if (
    receipt.frameCount !== document.frameCount ||
    receipt.fps !== document.fps ||
    receipt.width !== document.width ||
    receipt.height !== document.height
  )
    failure(
      "mechanism-compilation-facts",
      "Compiled output facts changed",
      "frameCount/fps/width/height",
    );
  return { receipt, receiptPath };
}
export async function renderMechanismCueProject(
  familyPath: string,
  cuePath: string,
  preparedDirectory: string,
  outputDirectory: string,
  options: { signal?: AbortSignal | undefined } = {},
) {
  const prepared = await readMechanismCueCompilation(
      familyPath,
      cuePath,
      preparedDirectory,
    ),
    directory = resolve(outputDirectory);
  options.signal?.throwIfAborted();
  await mkdir(dirname(directory), { recursive: true });
  await mkdir(directory);
  const result = await renderComposition({
    compositionPath: prepared.receipt.composition.path,
    outputPath: join(directory, "output.mp4"),
    backend: "webgl2",
    transport: "raw_rgba",
    signal: options.signal,
    validateNativeSourceEdges: async () => {
      await readMechanismCueCompilation(familyPath, cuePath, preparedDirectory);
    },
  });
  return {
    ...result,
    schemaVersion: "mechanism-cue-render-result-1" as const,
    compilationReceiptPath: prepared.receiptPath,
    familyRevision: prepared.receipt.family.revision,
    cueRevision: prepared.receipt.cue.revision,
    rerenderScope: "whole-cycle",
    scope: "current-revision-native-composition-export",
  };
}
const closure = z
  .object({
    version: z.literal("native-observation-closure-2"),
    manifestPath: path,
    manifestSha256: MechanismHashSchema,
    executionSha256: MechanismHashSchema,
    outputFrames: z.number().int().positive(),
    passCount: z.number().int().positive(),
    outputSha256: MechanismHashSchema,
  })
  .strict();
const outputResult = z
  .object({
    schemaVersion: z.literal("composition-result-1"),
    status: z.literal("rendered"),
    fps: z.number().int().positive(),
    frameCount: z.number().int().positive(),
    outputPath: path,
    checksums: z
      .object({
        source: MechanismHashSchema,
        scene: MechanismHashSchema,
        output: MechanismHashSchema,
      })
      .strict(),
    metrics: z
      .object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        frameCount: z.number().int().positive(),
        outputChecksum: MechanismHashSchema,
        nativeObservations: closure,
      })
      .passthrough(),
  })
  .passthrough();
async function hashFile(path: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const initial = await file.stat();
    if (!initial.isFile())
      failure("mechanism-output-file", "Output must be a regular file", path);
    const hash = createHash("sha256"),
      scratch = Buffer.alloc(65536);
    let position = 0;
    while (position < initial.size) {
      signal?.throwIfAborted();
      const { bytesRead } = await file.read(
        scratch,
        0,
        Math.min(scratch.length, initial.size - position),
        position,
      );
      if (!bytesRead)
        failure("mechanism-output-file", "Output changed while reading", path);
      hash.update(scratch.subarray(0, bytesRead));
      position += bytesRead;
    }
    const final = await file.stat();
    if (
      initial.size !== final.size ||
      initial.mtimeMs !== final.mtimeMs ||
      initial.ctimeMs !== final.ctimeMs
    )
      failure("mechanism-output-file", "Output changed while reading", path);
    signal?.throwIfAborted();
    return `sha256:${hash.digest("hex")}`;
  } finally {
    await file.close();
  }
}
/** Software output/source proof. Label/layout/listening QA remains a separate gate. */
export async function checkMechanismCueOutput(
  familyPath: string,
  cuePath: string,
  preparedDirectory: string,
  outputPath: string,
  options: { signal?: AbortSignal | undefined } = {},
) {
  const prepared = await readMechanismCueCompilation(
      familyPath,
      cuePath,
      preparedDirectory,
    ),
    actualPath = resolve(outputPath),
    render = outputResult.parse(
      await readMechanismJson(`${actualPath}.result.json`),
    );
  if (
    render.outputPath !== actualPath ||
    render.checksums.source !== prepared.receipt.composition.sha256 ||
    render.frameCount !== prepared.receipt.frameCount ||
    render.fps !== prepared.receipt.fps ||
    render.metrics.width !== prepared.receipt.width ||
    render.metrics.height !== prepared.receipt.height ||
    render.metrics.frameCount !== prepared.receipt.frameCount ||
    render.metrics.outputChecksum !== render.checksums.output ||
    (await hashFile(actualPath, options.signal)) !== render.checksums.output
  )
    failure(
      "mechanism-output-identity",
      "Output/result do not match the current compilation",
      "output/checksums/facts",
    );
  const probe = await runProcess(
    "ffprobe",
    [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,nb_read_frames,avg_frame_rate",
      "-of",
      "json",
      actualPath,
    ],
    { signal: options.signal },
  );
  const facts = z
    .object({
      streams: z
        .array(
          z
            .object({
              width: z.number(),
              height: z.number(),
              nb_read_frames: z.string(),
              avg_frame_rate: z.string(),
            })
            .passthrough(),
        )
        .length(1),
    })
    .parse(JSON.parse(probe.stdout));
  const video = facts.streams[0]!,
    rate = video.avg_frame_rate.split("/").map(Number);
  if (
    video.width !== prepared.receipt.width ||
    video.height !== prepared.receipt.height ||
    Number(video.nb_read_frames) !== prepared.receipt.frameCount ||
    rate.length !== 2 ||
    !rate.every(Number.isFinite) ||
    rate[0]! <= 0 ||
    rate[1]! <= 0 ||
    rate[0] !== prepared.receipt.fps * rate[1]!
  )
    failure(
      "mechanism-output-video",
      "Actual encoded video facts differ from the compilation",
      "output/video",
    );
  const owner = new CompositionNodeMemory(),
    memory = new ManagedMemory({
      pixels: 1,
      metadata: compositionWorkerMemoryLimits(1).metadata,
    });
  try {
    const loaded = await loadComposition(
        prepared.receipt.composition.path,
        "webgl2",
        { nodeMemory: owner, signal: options.signal },
      ),
      binding = await createNativeObservationRequestVersions(
        loaded,
        undefined,
        { signal: options.signal },
      );
    if (!binding || !isNativeObservationRequestV2(binding))
      failure(
        "mechanism-output-native",
        "Expected family native2 output binding",
        "nativeObservations",
      );
    const verified = await verifyNativeObservationClosureVersions({
      closure: render.metrics.nativeObservations,
      binding,
      signal: options.signal,
      reserve: (bytes) => memory.reserve("metadata", bytes),
      output: {
        sha256: render.checksums.output,
        frameCount: prepared.receipt.frameCount,
        width: prepared.receipt.width,
        height: prepared.receipt.height,
        transport: "raw_rgba",
      },
    });
    await readMechanismCueCompilation(familyPath, cuePath, preparedDirectory);
    if (
      (await hashFile(actualPath, options.signal)) !== render.checksums.output
    )
      failure(
        "mechanism-output-identity",
        "Output changed during verification",
        "output/checksums",
      );
    return {
      schemaVersion: "mechanism-cue-check-result-1" as const,
      status: "passed" as const,
      scope:
        "current-revision-dependencies-encoded-video-facts-and-independent-native-observation-proof",
      outputPath: actualPath,
      outputSha256: render.checksums.output,
      familyRevision: prepared.receipt.family.revision,
      cueRevision: prepared.receipt.cue.revision,
      nativeFrames: verified.outputFrames,
      nativePasses: verified.passCount,
      video,
      remainingQa:
        "Rendered label/layout/typography, listening and pilot acceptance are separate gates.",
    };
  } finally {
    memory.dispose();
    owner.dispose();
  }
}
