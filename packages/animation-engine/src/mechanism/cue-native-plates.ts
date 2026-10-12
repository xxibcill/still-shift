import { z } from "zod";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  AnimationEngineError,
  CompositionSchema,
  CompositionSequenceAssetSchema,
  CompositionSequenceManifestSchema,
  MechanismHashSchema,
  COMPOSITION_LIMITS,
  type Composition,
} from "@still-shift/scene-contract";
import {
  CompositionNodeMemory,
  verifyNativeObservationClosureVersions,
  isNativeObservationRequestV2,
} from "@still-shift/execution-runtime/export";
import { loadComposition, renderComposition } from "../composition-render.ts";
import { createNativeObservationRequestVersions } from "../native-observation.ts";
import {
  readMechanismCueCompilation,
  MechanismCueCompilationSchema,
} from "./cue-lifecycle.ts";
import { writeMechanismJson } from "./io.ts";
import { mechanismPackHash } from "./pack-support.ts";
import { partitionMechanismCueNativePicture } from "./cue-native-picture.ts";
import { cuePlateFile, readCuePlateJson } from "./cue-plate-files.ts";
const path = z.string().min(1).max(2048);
const file = z
  .object({
    path,
    bytes: z
      .number()
      .int()
      .nonnegative()
      .max(512 * 1024 * 1024),
    sha256: MechanismHashSchema,
  })
  .strict();
export const MechanismCueNativePlatesSchema = z
  .object({
    schemaVersion: z.literal("mechanism-cue-native-plates-1"),
    nativePictureSha256: MechanismHashSchema,
    originalCompilation: file,
    originalSource: file,
    nativeSource: file,
    sceneManifest: file,
    renderResult: file,
    sequence: CompositionSequenceAssetSchema,
  })
  .strict();
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
const renderResult = z
  .object({
    schemaVersion: z.literal("composition-result-1"),
    status: z.literal("rendered"),
    outputPath: path,
    sceneManifestPath: path,
    frameCount: z.number().int().positive(),
    fps: z.number().int().positive(),
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
        sourceChecksum: MechanismHashSchema,
        outputChecksum: MechanismHashSchema,
        frameTransport: z.literal("raw_rgba"),
        nativeObservations: closure,
        output: z
          .object({
            version: z.literal("composition-output-1"),
            format: z.literal("png16"),
            alpha: z.literal(true),
            renderSourceBitDepth: z.literal(8),
            encoderInputBitDepth: z.literal(16),
            encodedBitDepth: z.literal(16),
            color: z
              .object({
                primaries: z.literal("bt709"),
                transfer: z.literal("bt709"),
                matrix: z.literal("gbr"),
                range: z.literal("pc"),
              })
              .strict(),
            sequence: z
              .object({
                pattern: path,
                manifestPath: path,
                firstFrame: z.literal(0),
                frames: z
                  .array(MechanismHashSchema)
                  .min(1)
                  .max(COMPOSITION_LIMITS.maxKeys),
              })
              .strict(),
          })
          .strict(),
      })
      .passthrough(),
  })
  .passthrough();
function failure(location: string, message: string): never {
  throw new AnimationEngineError("SCENE_INVALID", message, {
    stage: "mechanism-cue-native-plates",
    diagnosticCode: "mechanism-cue-native-plate-identity",
    path: location,
    nextAction:
      "Capture fresh native plates when the verified native picture changes; retain the original capture receipt and source snapshot.",
  });
}
/** Paths are excluded only after actual asset loading verifies their declared byte hashes. */
function identity(picture: Composition) {
  return mechanismPackHash({
    ...picture,
    assets: picture.assets.map((asset) => ({ ...asset, path: asset.id })),
  });
}
async function currentPicture(
  familyPath: string,
  cuePath: string,
  preparedDirectory: string,
  owner: CompositionNodeMemory,
  signal?: AbortSignal,
) {
  const compilation = await readMechanismCueCompilation(
    familyPath,
    cuePath,
    preparedDirectory,
  );
  const body = await cuePlateFile(compilation.receipt.composition.path, owner, {
    signal,
    sha256: compilation.receipt.composition.sha256,
  });
  const full = CompositionSchema.parse(
    await readCuePlateJson(body.path, owner, signal, undefined, body.sha256),
  );
  const picture = partitionMechanismCueNativePicture(full);
  if (picture.frameCount > COMPOSITION_LIMITS.maxKeys)
    failure(
      "frameCount",
      "Native plates exceed the existing 2000-key overlay bound",
    );
  const scratch = await mkdtemp(
    join(tmpdir(), "still-shift-cue-plate-current-"),
  );
  try {
    const source = join(scratch, "picture.json");
    await writeMechanismJson(source, picture);
    await loadComposition(source, "webgl2", { nodeMemory: owner, signal });
    signal?.throwIfAborted();
    return { compilation, full, picture, sha256: identity(picture) };
  } finally {
    await rm(scratch, { force: true, recursive: true });
  }
}
function owned(
  receipt: z.infer<typeof MechanismCueNativePlatesSchema>,
  directory: string,
) {
  const pattern = join(directory, "native-%06d.png");
  const paths = {
    originalCompilation: "original-cue-compilation.json",
    originalSource: "original-composition.json",
    nativeSource: "native-composition.json",
    sceneManifest: "native-%06d.png.scene.json",
    renderResult: "native-%06d.png.result.json",
  } as const;
  for (const [key, name] of Object.entries(paths))
    if (receipt[key as keyof typeof paths].path !== join(directory, name))
      failure(key, "Plate receipt must name its owned sibling artifact");
  if (
    receipt.sequence.path !== pattern ||
    receipt.sequence.manifestPath !== pattern + ".sequence.json" ||
    receipt.sequence.id !== "mechanism-native-plates" ||
    receipt.sequence.firstFrame !== 0
  )
    failure(
      "sequence",
      "Plate sequence must name its owned numbered frames and manifest",
    );
}
async function verifyReceipt(
  receipt: z.infer<typeof MechanismCueNativePlatesSchema>,
  directory: string,
  owner: CompositionNodeMemory,
  signal?: AbortSignal,
) {
  owned(receipt, directory);
  for (const item of [
    receipt.originalCompilation,
    receipt.originalSource,
    receipt.nativeSource,
    receipt.sceneManifest,
    receipt.renderResult,
  ]) {
    const actual = await cuePlateFile(item.path, owner, {
      signal,
      sha256: item.sha256,
    });
    if (actual.bytes !== item.bytes)
      failure(item.path, "Retained plate artifact byte count changed");
  }
  const origin = MechanismCueCompilationSchema.parse(
    await readCuePlateJson(
      receipt.originalCompilation.path,
      owner,
      signal,
      undefined,
      receipt.originalCompilation.sha256,
    ),
  );
  if (origin.composition.sha256 !== receipt.originalSource.sha256)
    failure(
      "originalCompilation",
      "Original compiled source and receipt differ",
    );
  const original = CompositionSchema.parse(
    await readCuePlateJson(
      receipt.originalSource.path,
      owner,
      signal,
      undefined,
      receipt.originalSource.sha256,
    ),
  );
  const source = CompositionSchema.parse(
    await readCuePlateJson(
      receipt.nativeSource.path,
      owner,
      signal,
      undefined,
      receipt.nativeSource.sha256,
    ),
  );
  const expected = partitionMechanismCueNativePicture(original);
  // Original declared hashes are now backed by the owned copies referenced by source.
  if (
    identity(expected) !== receipt.nativePictureSha256 ||
    identity(source) !== receipt.nativePictureSha256
  )
    failure(
      "nativePictureSha256",
      "Retained native picture differs from its original compiled source",
    );
  for (const asset of source.assets) {
    const expectedPath = join(
      directory,
      "dependencies",
      asset.id + (asset.type === "native3d" ? ".json" : ".font"),
    );
    if (asset.path !== expectedPath)
      failure(
        "assets." + asset.id,
        "Retained native dependency must name its owned copy",
      );
  }
  const loaded = await loadComposition(receipt.nativeSource.path, "webgl2", {
    nodeMemory: owner,
    signal,
  });
  const binding = await createNativeObservationRequestVersions(
    loaded,
    undefined,
    { signal },
  );
  if (!binding || !isNativeObservationRequestV2(binding))
    failure("nativeObservations", "Expected original native2 capture binding");
  const result = renderResult.parse(
    await readCuePlateJson(
      receipt.renderResult.path,
      owner,
      signal,
      undefined,
      receipt.renderResult.sha256,
    ),
  );
  const sequence = receipt.sequence,
    reported = result.metrics.output.sequence;
  if (
    JSON.stringify(sequence.color) !==
    JSON.stringify(result.metrics.output.color)
  )
    failure(
      "sequence.color",
      "Retained native plate color interpretation changed",
    );
  for (const field of ["width", "height", "frameCount", "fps"] as const)
    if (origin[field] !== original[field])
      failure(
        "originalCompilation." + field,
        "Original capture compilation facts changed",
      );
  for (const field of ["width", "height", "frameCount"] as const)
    if (
      sequence[field] !== source[field] ||
      result.metrics[field] !== source[field]
    )
      failure(field, "Retained native plate output facts changed");
  if (
    sequence.frameRate.numerator !==
      source.fps * sequence.frameRate.denominator ||
    result.fps !== source.fps ||
    result.frameCount !== source.frameCount ||
    result.outputPath !== sequence.path ||
    result.sceneManifestPath !== receipt.sceneManifest.path ||
    result.checksums.source !== receipt.nativeSource.sha256 ||
    result.metrics.sourceChecksum !== receipt.nativeSource.sha256 ||
    result.checksums.scene !== receipt.sceneManifest.sha256 ||
    result.checksums.output !== sequence.sha256 ||
    result.metrics.outputChecksum !== sequence.sha256 ||
    reported.pattern !== sequence.path ||
    reported.manifestPath !== sequence.manifestPath ||
    result.metrics.nativeObservations.manifestPath !==
      sequence.path + ".native-observations.json"
  )
    failure(
      "renderResult",
      "Original capture source/scene/output/sequence identities changed",
    );
  await cuePlateFile(sequence.manifestPath, owner, {
    signal,
    sha256: sequence.sha256,
  });
  const manifest = CompositionSequenceManifestSchema.parse(
    await readCuePlateJson(
      sequence.manifestPath,
      owner,
      signal,
      256 * 1024,
      sequence.sha256,
    ),
  );
  if (
    manifest.frames.length !== source.frameCount ||
    JSON.stringify(manifest.frames) !== JSON.stringify(reported.frames)
  )
    failure("sequence.frames", "Original numbered plate hashes changed");
  const verifyFrames = async () => {
    for (const [frame, sha256] of manifest.frames.entries())
      await cuePlateFile(
        sequence.path.replace("%06d", String(frame).padStart(6, "0")),
        owner,
        { signal, sha256 },
      );
  };
  await verifyFrames();
  const verified = await verifyNativeObservationClosureVersions({
    closure: result.metrics.nativeObservations,
    binding,
    signal,
    reserve: (bytes) => owner.reserve(bytes),
    output: {
      sha256: sequence.sha256,
      frameCount: source.frameCount,
      width: source.width,
      height: source.height,
      transport: "raw_rgba",
    },
  });
  await verifyFrames();
  // Reopen source and metadata after full native replay, so an old initial hash cannot authorize a changed body.
  for (const item of [
    receipt.nativeSource,
    receipt.renderResult,
    receipt.sceneManifest,
    receipt.originalSource,
    receipt.originalCompilation,
  ])
    await cuePlateFile(item.path, owner, { signal, sha256: item.sha256 });
  await cuePlateFile(sequence.manifestPath, owner, {
    signal,
    sha256: sequence.sha256,
  });
  await loadComposition(receipt.nativeSource.path, "webgl2", {
    nodeMemory: owner,
    signal,
  });
  return verified;
}
/** Capture a native-only numbered PNG sequence with its original source and native observation closure. */
export async function prepareMechanismCueNativePlates(
  familyPath: string,
  cuePath: string,
  preparedDirectory: string,
  outputDirectory: string,
  options: { signal?: AbortSignal | undefined } = {},
) {
  options.signal?.throwIfAborted();
  const owner = new CompositionNodeMemory(),
    directory = resolve(outputDirectory);
  let created = false,
    published = false;
  try {
    const current = await currentPicture(
      familyPath,
      cuePath,
      preparedDirectory,
      owner,
      options.signal,
    );
    await mkdir(dirname(directory), { recursive: true });
    await mkdir(directory);
    created = true;
    await mkdir(join(directory, "dependencies"));
    const originalSource = await cuePlateFile(
      current.compilation.receipt.composition.path,
      owner,
      {
        signal: options.signal,
        destination: join(directory, "original-composition.json"),
        sha256: current.compilation.receipt.composition.sha256,
        maximumBytes: 32 * 1024 * 1024,
      },
    );
    const originalReceiptPath = join(
      directory,
      "original-cue-compilation.json",
    );
    await writeMechanismJson(originalReceiptPath, current.compilation.receipt);
    const originalCompilation = await cuePlateFile(originalReceiptPath, owner, {
      signal: options.signal,
    });
    const picture = structuredClone(current.picture);
    for (const asset of picture.assets) {
      const destination = join(
        directory,
        "dependencies",
        asset.id + (asset.type === "native3d" ? ".json" : ".font"),
      );
      await cuePlateFile(asset.path, owner, {
        signal: options.signal,
        destination,
        sha256: asset.sha256,
        maximumBytes: 32 * 1024 * 1024,
      });
      asset.path = destination;
    }
    const sourcePath = join(directory, "native-composition.json");
    await writeMechanismJson(sourcePath, picture);
    const source = await cuePlateFile(sourcePath, owner, {
      signal: options.signal,
    });
    const pattern = join(directory, "native-%06d.png");
    const assertCurrent = async () => {
      const value = await currentPicture(
        familyPath,
        cuePath,
        preparedDirectory,
        owner,
        options.signal,
      );
      if (value.sha256 !== current.sha256)
        failure(
          "nativePictureSha256",
          "Current native picture changed during capture",
        );
    };
    const rendered = await renderComposition({
      nodeMemory: owner,
      compositionPath: sourcePath,
      outputPath: pattern,
      backend: "webgl2",
      transport: "raw_rgba",
      format: "png16",
      signal: options.signal,
      validateNativeSourceEdges: assertCurrent,
    });
    const output = rendered.metrics.output?.sequence;
    if (!output)
      failure("sequence", "Native capture omitted numbered PNG sequence facts");
    const receipt = MechanismCueNativePlatesSchema.parse({
      schemaVersion: "mechanism-cue-native-plates-1",
      nativePictureSha256: current.sha256,
      originalCompilation,
      originalSource,
      nativeSource: source,
      sceneManifest: await cuePlateFile(rendered.sceneManifestPath, owner, {
        signal: options.signal,
      }),
      renderResult: await cuePlateFile(pattern + ".result.json", owner, {
        signal: options.signal,
      }),
      sequence: {
        id: "mechanism-native-plates",
        type: "sequence",
        path: pattern,
        manifestPath: output.manifestPath,
        sha256: rendered.checksums.output,
        firstFrame: 0,
        width: picture.width,
        height: picture.height,
        frameCount: picture.frameCount,
        frameRate: { numerator: picture.fps, denominator: 1 },
        color: rendered.metrics.output!.color,
      },
    });
    await verifyReceipt(receipt, directory, owner, options.signal);
    await assertCurrent();
    options.signal?.throwIfAborted();
    const receiptPath = join(directory, "native-plates.json");
    await writeMechanismJson(receiptPath, receipt);
    published = true;
    return {
      schemaVersion: "mechanism-cue-native-plate-capture-result-1" as const,
      status: "passed" as const,
      receiptPath,
      receipt,
      scope:
        "native-only-plates-original-source-and-original-native-observation-proof",
      remainingQa:
        "This captures plates; cached overlay export, zero fresh3D draws, visual/listening and pilot acceptance remain separate.",
    };
  } finally {
    owner.dispose();
    if (created && !published)
      await rm(directory, { force: true, recursive: true });
  }
}
/** Verify current native-picture compatibility and independently replay original capture evidence; no observations are relabelled as fresh. */
export async function checkMechanismCueNativePlates(
  familyPath: string,
  cuePath: string,
  preparedDirectory: string,
  platesDirectory: string,
  options: { signal?: AbortSignal | undefined } = {},
) {
  options.signal?.throwIfAborted();
  const directory = resolve(platesDirectory),
    owner = new CompositionNodeMemory();
  try {
    const receiptPath = join(directory, "native-plates.json"),
      receipt = MechanismCueNativePlatesSchema.parse(
        await readCuePlateJson(receiptPath, owner, options.signal, 65536),
      );
    const current = await currentPicture(
      familyPath,
      cuePath,
      preparedDirectory,
      owner,
      options.signal,
    );
    if (current.sha256 !== receipt.nativePictureSha256)
      failure(
        "nativePictureSha256",
        "Current native picture differs from the retained capture",
      );
    const verified = await verifyReceipt(
      receipt,
      directory,
      owner,
      options.signal,
    );
    const final = await currentPicture(
      familyPath,
      cuePath,
      preparedDirectory,
      owner,
      options.signal,
    );
    if (final.sha256 !== current.sha256)
      failure(
        "nativePictureSha256",
        "Current native picture changed during plate verification",
      );
    const finalReceipt = MechanismCueNativePlatesSchema.parse(
      await readCuePlateJson(receiptPath, owner, options.signal, 65536),
    );
    if (mechanismPackHash(finalReceipt) !== mechanismPackHash(receipt))
      failure("receipt", "Native plate receipt changed during verification");
    return {
      schemaVersion: "mechanism-cue-native-plate-check-result-1" as const,
      status: "passed" as const,
      receiptPath,
      nativePictureSha256: receipt.nativePictureSha256,
      sequenceSha256: receipt.sequence.sha256,
      originalNativeFrames: verified.outputFrames,
      originalNativePasses: verified.passCount,
      scope:
        "current-native-picture-and-original-capture-proof-no-new-native-observations",
    };
  } finally {
    owner.dispose();
  }
}
