import { constants, type BigIntStats } from "node:fs";
import {
  lstat,
  mkdtemp,
  open,
  readFile,
  realpath,
  mkdir,
  stat,
  rm,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { PerspectiveCamera } from "three";
import {
  AnimationEngineError,
  MechanismHashSchema,
  MechanismRouteSelectionSchema,
  sanitizeDiagnosticText,
  NativeAppearanceCodeIdentitySchema,
  native3DEditDiagnostics,
  validateComposition,
  type MechanismRoute,
  type MechanismRouteSelection,
  type Composition,
  type MechanismEpisode,
} from "@still-shift/scene-contract";
import {
  compositionNativePasses,
  resolveNative3DVariant,
  type MechanismFrameRequest,
} from "@still-shift/renderer-core";
import { verifyNativeObservationClosure } from "@still-shift/execution-runtime/export";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { acquireArtifactLock } from "@still-shift/execution-runtime/locks";
import { publishArtifacts } from "@still-shift/execution-runtime/publication";
import {
  loadComposition,
  renderComposition,
  type CompositionRenderResult,
} from "../composition-render.ts";
import { lintCompositionFile } from "../composition-lint.ts";
import {
  nativeCompositionSha256,
  nativePreparedSha256,
  createNativeObservationRequest,
} from "../native-observation.ts";
import { assertNativeAppearanceCodeIdentity } from "../native3d-appearance-identity.ts";
import {
  compileNativeMechanismComposition,
  mechanismOverlayLayerId,
  mechanismOverlayQualityPolicy,
} from "./overlays.ts";
import {
  checkNativeMechanismFrames,
  type MechanismMechanicalFinding,
} from "./assertions.ts";
import {
  followPreparedMechanismRoute,
  mechanismRouteBackend,
} from "./route.ts";
import {
  mechanismContentHash,
  mechanismHash,
  parseMechanismEpisode,
  readMechanismJson,
  resolveMechanismDependency,
  writeMechanismJson,
  type LoadedMechanismEpisode,
  type MechanismFinding,
} from "./io.ts";
import { verifyMechanismFinalAudio } from "./audio-verification.ts";
import {
  createNativeMechanismOverlayChecker,
  type NativeMechanismOverlayReport,
} from "./native-overlays.ts";
import { createMechanismCommandReceipt } from "./protocol.ts";

export const NATIVE_MECHANISM_PROFILE =
  "native-three-aces-hdr-msaa4-1" as const;
export const NativePreparedMechanismEpisodeSchema = z
  .object({
    schemaVersion: z.literal("mechanism-prepared-native-episode-1"),
    projectHash: MechanismHashSchema,
    sourcePath: z.string().min(1).max(2048),
    outputDirectory: z.string().min(1).max(2048),
    compositionPath: z.string().min(1).max(2048),
    compositionSourceSha256: MechanismHashSchema,
    compositionSha256: MechanismHashSchema,
    preparedNativeSha256: MechanismHashSchema,
    appearanceCodeSha256: MechanismHashSchema,
    appearanceCodeIdentity: NativeAppearanceCodeIdentitySchema,
    episodeSha256: MechanismHashSchema,
    geometrySha256: MechanismHashSchema,
    rigSha256: MechanismHashSchema,
    routeSelection: MechanismRouteSelectionSchema,
    backend: z.literal("webgl2"),
    profile: z.literal(NATIVE_MECHANISM_PROFILE),
    wallSeconds: z.number().finite().nonnegative(),
    receiptPath: z.string().min(1).max(2048),
  })
  .strict();
export type NativePreparedMechanismEpisode = z.infer<
  typeof NativePreparedMechanismEpisodeSchema
>;
/** Explicit locator relocation; neither original render bytes nor execution rows are rewritten. */
export type NativeMechanismRelocationAssociation = {
  originalCompositionSourceSha256: string;
  relocatedCompositionSourceSha256: string;
  compositionSha256: string;
  renderResultPath?: string;
  sceneManifestPath?: string;
  observationManifestPath?: string;
};
export type NativeMechanismCheckOptions = {
  preparedDirectory?: string;
  finalOutput?: string;
  signal?: AbortSignal;
  route?: MechanismRoute;
  relocation?: NativeMechanismRelocationAssociation;
  verifyCode?: boolean;
  pixels?: boolean;
};
function fail(
  message: string,
  path: string,
  code = "comp-native3d-checksum",
): never {
  throw new AnimationEngineError("SCENE_INVALID", message, {
    diagnosticCode: code,
    stage: "mechanism-native-lifecycle",
    path,
  });
}
export function nativeMechanismExecution(
  loaded: LoadedMechanismEpisode,
  routeSelection: MechanismRouteSelection,
) {
  return {
    episodeSha256: mechanismContentHash(loaded.episode),
    geometrySha256: loaded.scene.geometrySha256,
    rigSha256: mechanismContentHash(loaded.scene.rigs),
    routeSelection,
  };
}

const ARTIFACT_HASH_CHUNK_BYTES = 256 * 1024;
function sameNativeArtifact(left: BigIntStats, right: BigIntStats): boolean {
  return (
    left.isFile() &&
    right.isFile() &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}
/** Bounded, descriptor-owned byte hashing. A replacement or in-place write is never accepted. */
export async function hashNativeMechanismArtifact(
  path: string,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  const beforePath = await lstat(path, { bigint: true });
  if (!beforePath.isFile())
    fail(
      "Native artifact must be a regular file without a final symlink",
      path,
    );
  const file = await open(
    path,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0),
  );
  try {
    const before = await file.stat({ bigint: true });
    if (!sameNativeArtifact(beforePath, before))
      fail("Native artifact changed before byte verification", path);
    const hash = createHash("sha256"),
      buffer = Buffer.allocUnsafe(ARTIFACT_HASH_CHUNK_BYTES);
    let readBytes = 0n;
    for (;;) {
      signal?.throwIfAborted();
      const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      readBytes += BigInt(bytesRead);
      hash.update(buffer.subarray(0, bytesRead));
    }
    const after = await file.stat({ bigint: true }),
      afterPath = await lstat(path, { bigint: true });
    signal?.throwIfAborted();
    if (
      readBytes !== before.size ||
      !sameNativeArtifact(before, after) ||
      !sameNativeArtifact(after, afterPath)
    )
      fail("Native artifact changed during byte verification", path);
    return `sha256:${hash.digest("hex")}`;
  } finally {
    await file.close();
  }
}

/** Revalidate the current saved episode and every declared raw input, without media probes or browser work. */
export async function assertNativeMechanismSourceEdges(
  loaded: LoadedMechanismEpisode,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  const sourceSha256 = await hashNativeMechanismArtifact(
    loaded.sourcePath,
    signal,
  );
  const current = parseMechanismEpisode(
    await readMechanismJson(loaded.sourcePath),
    loaded.sourcePath,
  );
  if (
    mechanismContentHash(current) !== loaded.projectHash ||
    mechanismContentHash(loaded.episode) !== loaded.projectHash
  )
    fail(
      "Saved episode changed after loading; load the current revision before native execution",
      loaded.sourcePath,
    );
  for (const dependency of current.dependencies) {
    signal?.throwIfAborted();
    const path = await resolveMechanismDependency(
      loaded.sourcePath,
      dependency,
    );
    if (path !== loaded.dependencyPaths[dependency.id])
      fail(
        "Declared native source locator changed after loading",
        `${loaded.sourcePath}#/dependencies/${dependency.id}/path`,
      );
    if ((await hashNativeMechanismArtifact(path, signal)) !== dependency.sha256)
      fail(
        "Declared native source bytes changed after loading",
        `${loaded.sourcePath}#/dependencies/${dependency.id}/sha256`,
      );
  }
  if (
    (await hashNativeMechanismArtifact(loaded.sourcePath, signal)) !==
    sourceSha256
  )
    fail(
      "Saved episode changed during source-edge verification",
      loaded.sourcePath,
    );
  signal?.throwIfAborted();
}

async function stageNativePreparedCandidate(
  source: string,
  destination: string,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  const beforePath = await lstat(source, { bigint: true });
  if (!beforePath.isFile())
    fail(
      "Native candidate must be a regular file without a final symlink",
      source,
    );
  const input = await open(
    source,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0),
  );
  try {
    const before = await input.stat({ bigint: true });
    if (!sameNativeArtifact(beforePath, before))
      fail("Native candidate changed before staging", source);
    const output = await open(destination, "wx", 0o600);
    try {
      const hash = createHash("sha256"),
        buffer = Buffer.allocUnsafe(ARTIFACT_HASH_CHUNK_BYTES);
      let copiedBytes = 0n;
      for (;;) {
        signal?.throwIfAborted();
        const { bytesRead } = await input.read(buffer, 0, buffer.length, null);
        if (!bytesRead) break;
        hash.update(buffer.subarray(0, bytesRead));
        copiedBytes += BigInt(bytesRead);
        for (let written = 0; written < bytesRead; ) {
          signal?.throwIfAborted();
          const result = await output.write(
            buffer,
            written,
            bytesRead - written,
            null,
          );
          if (!result.bytesWritten)
            fail(
              "Native candidate staging stopped before completion",
              destination,
            );
          written += result.bytesWritten;
        }
      }
      const after = await input.stat({ bigint: true }),
        afterPath = await lstat(source, { bigint: true });
      signal?.throwIfAborted();
      if (
        copiedBytes !== before.size ||
        !sameNativeArtifact(before, after) ||
        !sameNativeArtifact(after, afterPath)
      )
        fail("Native candidate changed during staging", source);
      return `sha256:${hash.digest("hex")}`;
    } finally {
      await output.close();
    }
  } finally {
    await input.close();
  }
}

/** Publish the recipe and receipt as one rollback-capable bundle. Failed staged bytes remain inspectable.
 * The shared publication primitive preserves prior files on handled failures; it is not crash atomic. */
export async function publishNativePreparedEpisode(
  candidateCompositionPath: string,
  receiptValue: NativePreparedMechanismEpisode,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  const receipt = NativePreparedMechanismEpisodeSchema.parse(receiptValue);
  const root = await realpath(resolve(receipt.outputDirectory));
  const destination = async (path: string) => {
    const absolute = resolve(path),
      parent = await realpath(dirname(absolute));
    if (parent !== root)
      fail("Native preparation artifact escapes its output directory", path);
    return join(parent, basename(absolute));
  };
  const compositionPath = await destination(receipt.compositionPath),
    receiptPath = await destination(receipt.receiptPath);
  if (compositionPath === receiptPath)
    fail(
      "Native recipe and receipt require distinct destinations",
      compositionPath,
    );
  const candidate = await destination(candidateCompositionPath);
  const attempt = await mkdtemp(join(root, ".native-prepare-attempt-"));
  const stagedComposition = join(attempt, "composition.json"),
    stagedReceipt = join(attempt, "prepared.receipt.json");
  try {
    signal?.throwIfAborted();
    if (
      (await stageNativePreparedCandidate(
        candidate,
        stagedComposition,
        signal,
      )) !== receipt.compositionSourceSha256
    )
      fail(
        "Prepared candidate bytes differ from the loaded native recipe",
        candidate,
      );
    if (
      (await hashNativeMechanismArtifact(stagedComposition, signal)) !==
      receipt.compositionSourceSha256
    )
      fail("Prepared recipe bytes changed during staging", stagedComposition);
    signal?.throwIfAborted();
    await writeMechanismJson(stagedReceipt, receipt);
    signal?.throwIfAborted();
    await publishArtifacts(
      [
        {
          staged: stagedComposition,
          destination: compositionPath,
          replaceExisting: true,
        },
        {
          staged: stagedReceipt,
          destination: receiptPath,
          replaceExisting: true,
        },
      ],
      signal,
    );
  } catch (cause) {
    try {
      await writeMechanismJson(join(attempt, "failure.json"), {
        schemaVersion: "mechanism-native-prepare-failure-1",
        status: "failed",
        aborted: signal?.aborted ?? false,
        compositionPath,
        receiptPath,
        message: sanitizeDiagnosticText(
          cause instanceof Error ? cause.message : String(cause),
        ),
      });
    } catch {
      /* Preserve the original publication error and staged bytes. */
    }
    throw cause;
  }
  await rm(attempt, { recursive: true, force: true });
}

/** Current saved label copy is the reading requirement; authored shot/caption clocks remain pinned. */
export function nativeMechanismReadingPolicy(
  episode: MechanismEpisode,
  composition: Composition,
) {
  const policy = mechanismOverlayQualityPolicy(episode);
  delete policy.physicalProofHolds;
  return {
    ...policy,
    readingDeclarations: policy.readingDeclarations?.map((declaration) => ({
      ...declaration,
      members: declaration.members.map((member) => {
        const layer = composition.layers.find(
          (layer) => layer.id === member.layer,
        );
        return layer?.type === "text"
          ? { ...member, text: layer.text }
          : member;
      }),
    })),
  };
}

function validateNativeEpisodeTimeline(
  loaded: LoadedMechanismEpisode,
  composition: Composition,
) {
  if (
    composition.width !== loaded.episode.output.width ||
    composition.height !== loaded.episode.output.height ||
    composition.fps !== loaded.episode.output.fps ||
    composition.frameCount !== loaded.episode.output.frameCount
  )
    fail(
      "Native composition changed the supplied episode output clock",
      "composition.output",
      "comp-native3d-clock",
    );
  const native = composition.layers.filter(
    (layer) => layer.type === "native3d",
  );
  if (native.length !== loaded.episode.shots.length)
    fail(
      "Native episode requires its exact authored controller inventory",
      "composition.layers",
      "comp-native3d-scope",
    );
  for (const shot of loaded.episode.shots) {
    const controller = native.find(
      (layer) => layer.id === mechanismOverlayLayerId("plate", shot.id),
    );
    if (
      !controller ||
      controller.inPoint !== shot.startFrame ||
      controller.outPoint !== shot.endFrameExclusive
    )
      fail(
        "Native episode controllers must preserve authored half-open cuts",
        `shots.${shot.id}`,
        "comp-native3d-clock",
      );
  }
}
async function assertNativePreparedRecipeAbsent(path: string): Promise<void> {
  try {
    await stat(path);
    fail(
      "An unassociated native recipe already exists at the preparation destination",
      path,
    );
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      error.code !== "ENOENT"
    )
      throw error;
  }
}

/** Refresh after supported saved edits; the immutable source edges remain pinned. */
export async function prepareNativeMechanismEpisode(
  loaded: LoadedMechanismEpisode,
  options: {
    outputDirectory: string;
    signal?: AbortSignal;
    cacheDirectory?: string;
  },
  routeSelection: MechanismRouteSelection,
): Promise<NativePreparedMechanismEpisode> {
  mechanismRouteBackend(routeSelection);
  await assertNativeMechanismSourceEdges(loaded, options.signal);
  const started = performance.now(),
    outputDirectory = resolve(options.outputDirectory);
  const compositionPath = join(
    outputDirectory,
    `composition-r${loaded.episode.revision}-${loaded.projectHash.slice(7, 19)}.json`,
  );
  const authored = compileNativeMechanismComposition(loaded);
  for (const asset of authored.assets)
    asset.path = relative(outputDirectory, asset.path);
  let composition = authored;
  let savedCompositionPath: string | undefined,
    savedCompositionSha256: string | undefined;
  // An existing same-project saved recipe is refreshed rather than silently discarded.
  let existingReceipt = false;
  try {
    await stat(join(outputDirectory, "prepared.receipt.json"));
    existingReceipt = true;
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      error.code !== "ENOENT"
    )
      throw error;
  }
  if (existingReceipt) {
    const old = NativePreparedMechanismEpisodeSchema.parse(
      await readMechanismJson(join(outputDirectory, "prepared.receipt.json")),
    );
    if (old.projectHash !== loaded.projectHash)
      fail(
        "Preparation directory belongs to another episode revision; choose a fresh directory",
        outputDirectory,
      );
    followPreparedMechanismRoute(
      loaded.episode,
      old.routeSelection,
      "native3d",
    );
    savedCompositionPath = resolve(outputDirectory, old.compositionPath);
    if ((await stat(savedCompositionPath)).size > 32 * 1024 * 1024)
      fail(
        "Saved native recipe exceeds its source byte admission",
        savedCompositionPath,
        "comp-native3d-limit",
      );
    const savedBytes = await readFile(savedCompositionPath);
    if (savedBytes.length > 32 * 1024 * 1024)
      fail(
        "Saved native recipe exceeds its source byte admission",
        savedCompositionPath,
        "comp-native3d-limit",
      );
    savedCompositionSha256 = mechanismHash(savedBytes);
    const parsed = validateComposition(JSON.parse(savedBytes.toString("utf8")));
    if (!parsed.ok)
      throw new AnimationEngineError(
        "SCENE_INVALID",
        parsed.diagnostics.map(
          (diagnostic) =>
            `${diagnostic.code} ${diagnostic.path}: ${diagnostic.message}`,
        )[0] ?? "Invalid saved native composition",
        {
          stage: "mechanism-native-lifecycle",
          diagnosticsJson: JSON.stringify(parsed.diagnostics),
          sourcePath: savedCompositionPath,
        },
      );
    const forbidden = native3DEditDiagnostics(authored, parsed.composition);
    if (forbidden.length)
      fail(forbidden[0]!.message, forbidden[0]!.path, forbidden[0]!.code);
    composition = parsed.composition;
  }
  if (!existingReceipt) await assertNativePreparedRecipeAbsent(compositionPath);
  validateNativeEpisodeTimeline(loaded, composition);
  options.signal?.throwIfAborted();
  await mkdir(outputDirectory, { recursive: true });
  const release = await acquireArtifactLock(
    join(outputDirectory, ".prepare.lock"),
    outputDirectory,
  );
  const candidatePath = join(
    outputDirectory,
    `.native-prepare-${randomUUID()}.json`,
  );
  try {
    options.signal?.throwIfAborted();
    await writeMechanismJson(candidatePath, composition);
    const prepared = await loadComposition(candidatePath, "webgl2", options);
    const observation = await createNativeObservationRequest(
      prepared,
      nativeMechanismExecution(loaded, routeSelection),
      { signal: options.signal },
    );
    if (
      !observation ||
      !prepared.nativeAppearanceCodeIdentity ||
      !prepared.preparedNative3D
    )
      fail(
        "Native sources did not prepare",
        compositionPath,
        "comp-native3d-not-ready",
      );
    const result: NativePreparedMechanismEpisode = {
      schemaVersion: "mechanism-prepared-native-episode-1",
      projectHash: loaded.projectHash,
      sourcePath: loaded.sourcePath,
      outputDirectory,
      compositionPath,
      compositionSourceSha256: prepared.sourceChecksum,
      compositionSha256: nativeCompositionSha256(composition),
      preparedNativeSha256: nativePreparedSha256(prepared.preparedNative3D),
      appearanceCodeSha256: prepared.nativeAppearanceCodeSha256!,
      appearanceCodeIdentity: prepared.nativeAppearanceCodeIdentity,
      ...nativeMechanismExecution(loaded, routeSelection),
      backend: "webgl2",
      profile: NATIVE_MECHANISM_PROFILE,
      wallSeconds: (performance.now() - started) / 1000,
      receiptPath: join(outputDirectory, "prepared.receipt.json"),
    };
    await assertNativeAppearanceCodeIdentity(result.appearanceCodeIdentity);
    options.signal?.throwIfAborted();
    await assertNativeMechanismSourceEdges(loaded, options.signal);
    if (
      savedCompositionPath &&
      (await hashNativeMechanismArtifact(
        savedCompositionPath,
        options.signal,
      )) !== savedCompositionSha256
    )
      fail(
        "Saved native recipe changed while its revision was preparing",
        savedCompositionPath,
      );
    if (!savedCompositionPath)
      await assertNativePreparedRecipeAbsent(compositionPath);
    await publishNativePreparedEpisode(
      candidatePath,
      NativePreparedMechanismEpisodeSchema.parse(result),
      options.signal,
    );
    return result;
  } finally {
    await rm(candidatePath, { force: true });
    await release();
  }
}
export async function verifyNativePreparedEpisode(
  loaded: LoadedMechanismEpisode,
  directory: string,
  options: {
    signal?: AbortSignal;
    verifyCode?: boolean;
    route?: MechanismRoute;
  } = {},
) {
  await assertNativeMechanismSourceEdges(loaded, options.signal);
  const root = resolve(directory);
  const receipt = NativePreparedMechanismEpisodeSchema.parse(
    await readMechanismJson(join(root, "prepared.receipt.json")),
  );
  const selection = followPreparedMechanismRoute(
    loaded.episode,
    receipt.routeSelection,
    options.route,
  );
  if (
    selection.effectiveRoute !== "native3d" ||
    receipt.projectHash !== loaded.projectHash ||
    mechanismContentHash(nativeMechanismExecution(loaded, selection)) !==
      mechanismContentHash({
        episodeSha256: receipt.episodeSha256,
        geometrySha256: receipt.geometrySha256,
        rigSha256: receipt.rigSha256,
        routeSelection: receipt.routeSelection,
      })
  )
    fail(
      "Native preparation belongs to a different episode, rig or selected route",
      root,
    );
  const loadedComposition = await loadComposition(
    resolve(root, receipt.compositionPath),
    "webgl2",
    options,
  );
  validateNativeEpisodeTimeline(loaded, loadedComposition.composition);
  if (
    loadedComposition.sourceChecksum !== receipt.compositionSourceSha256 ||
    nativeCompositionSha256(loadedComposition.composition) !==
      receipt.compositionSha256 ||
    !loadedComposition.preparedNative3D ||
    nativePreparedSha256(loadedComposition.preparedNative3D) !==
      receipt.preparedNativeSha256
  )
    fail(
      "Saved native composition or effective source changed after preparation; prepare the current saved edit",
      receipt.compositionPath,
    );
  if (options.verifyCode !== false) {
    await assertNativeAppearanceCodeIdentity(receipt.appearanceCodeIdentity);
    if (
      loadedComposition.nativeAppearanceCodeSha256 !==
      receipt.appearanceCodeSha256
    )
      fail(
        "Native preparation was produced by another appearance-code closure",
        root,
      );
  }
  return { receipt, loadedComposition };
}

export async function checkNativeMechanismEpisode(
  loaded: LoadedMechanismEpisode,
  options: NativeMechanismCheckOptions = {},
) {
  options.signal?.throwIfAborted();
  const started = performance.now(),
    findings: MechanismFinding[] = [];
  let checkedFrames = 0;
  const mechanicalRows = new Map<string, MechanismMechanicalFinding>();
  const projectionRows = new Map<string, MechanismFinding>();
  let findingBytes = 0;
  const retainFinding = <T>(rows: Map<string, T>, key: string, value: T) => {
    if (rows.has(key)) return false;
    findingBytes +=
      Buffer.byteLength(JSON.stringify(value)) * 2 + key.length * 2;
    if (findingBytes > 8 * 1024 * 1024)
      fail(
        "Native finding metadata exceeds bounded retained report capacity",
        "findings",
        "comp-native3d-limit",
      );
    rows.set(key, value);
    return true;
  };
  if (!options.preparedDirectory) {
    if (options.finalOutput)
      fail(
        "Final native checking requires its current preparation",
        "preparedDirectory",
        "comp-native3d-protocol",
      );
    return {
      schemaVersion: "mechanism-native-check-result-1" as const,
      projectHash: loaded.projectHash,
      valid: true,
      scope: "authored-source-only" as const,
      actualExecutionVerified: false,
      checkedFrames,
      findings,
      wallSeconds: (performance.now() - started) / 1000,
      review: {
        continuousMotion: "pending-human-review",
        listening: "pending-human-review",
      },
    };
  }
  const { receipt, loadedComposition } = await verifyNativePreparedEpisode(
    loaded,
    options.preparedDirectory,
    options,
  );
  const readingPolicy = nativeMechanismReadingPolicy(
    loaded.episode,
    loadedComposition.composition,
  );
  const qualityReport =
    options.pixels === false
      ? undefined
      : await lintCompositionFile(loadedComposition.sourcePath, readingPolicy, {
          pixels: true,
          backend: "webgl2",
          collectTextBounds: true,
          ...(options.signal ? { signal: options.signal } : {}),
        });
  let finalProbe: unknown,
    audioReport:
      | Awaited<ReturnType<typeof verifyMechanismFinalAudio>>
      | undefined;
  let closureReport:
    | Awaited<ReturnType<typeof verifyNativeObservationClosure>>
    | undefined;
  let overlayReport: NativeMechanismOverlayReport | undefined;
  if (options.finalOutput) {
    const finalPath = resolve(options.finalOutput),
      render = (await readMechanismJson(
        options.relocation?.renderResultPath ?? `${finalPath}.result.json`,
      )) as CompositionRenderResult;
    const actualOutput = await hashNativeMechanismArtifact(
        finalPath,
        options.signal,
      ),
      actualScene = await hashNativeMechanismArtifact(
        options.relocation?.sceneManifestPath ?? `${finalPath}.scene.json`,
        options.signal,
      );
    let capturedSource = receipt.compositionSourceSha256;
    if (options.relocation) {
      const association = options.relocation;
      if (
        association.relocatedCompositionSourceSha256 !==
          receipt.compositionSourceSha256 ||
        association.compositionSha256 !== receipt.compositionSha256
      )
        fail(
          "Relocation association does not bind the current saved recipe",
          finalPath,
        );
      capturedSource = MechanismHashSchema.parse(
        association.originalCompositionSourceSha256,
      );
    }
    if (
      render.schemaVersion !== "composition-result-1" ||
      render.status !== "rendered" ||
      render.checksums.source !== capturedSource ||
      render.checksums.output !== actualOutput ||
      render.checksums.scene !== actualScene ||
      !render.metrics.nativeObservations
    )
      fail(
        "Final native movie/render evidence is not associated with the current prepared recipe",
        finalPath,
        "comp-native3d-observation",
      );
    const observationLoaded = {
      ...loadedComposition,
      sourceChecksum: capturedSource,
      nativeAppearanceCodeSha256: receipt.appearanceCodeSha256,
      nativeAppearanceCodeIdentity: receipt.appearanceCodeIdentity,
    };
    const request = (await createNativeObservationRequest(
      observationLoaded,
      nativeMechanismExecution(loaded, receipt.routeSelection),
      { signal: options.signal },
    ))!;
    const overlayChecker = createNativeMechanismOverlayChecker(
      loaded.episode,
      loadedComposition.composition,
      loadedComposition.native3D!,
      qualityReport && "textBounds" in qualityReport && qualityReport.textBounds
        ? { textBounds: qualityReport.textBounds }
        : {},
    );
    closureReport = await verifyNativeObservationClosure({
      closure: {
        ...render.metrics.nativeObservations,
        manifestPath:
          options.relocation?.observationManifestPath ??
          resolve(
            dirname(finalPath),
            render.metrics.nativeObservations.manifestPath,
          ),
      },
      execution: request.execution,
      expectedPasses: request.expectedPasses,
      output: {
        sha256: actualOutput,
        frameCount: loadedComposition.composition.frameCount,
        width: loadedComposition.composition.width,
        height: loadedComposition.composition.height,
        transport: render.metrics.frameTransport,
      },
      ...(options.signal ? { signal: options.signal } : {}),
      onFrame: (packet) => {
        overlayChecker.onFrame(packet);
        const passes = [
          ...compositionNativePasses(
            loadedComposition.composition,
            packet.outputFrame,
            {
              preparedNative3D: loadedComposition.native3D!,
              nativeObservationRequired: true,
            },
          ),
        ];
        if (!passes.length)
          fail(
            "Native episode has a physical coverage gap",
            `frames.${packet.outputFrame}`,
            "comp-native3d-observation",
          );
        for (const [index, pass] of passes.entries()) {
          const shot = loaded.episode.shots.find(
            (shot) =>
              pass.sampleFrame >= shot.startFrame &&
              pass.sampleFrame < shot.endFrameExclusive,
          );
          const controller = loadedComposition.composition.layers.find(
            (layer) =>
              layer.type === "native3d" && layer.id === pass.frame.controller,
          );
          if (
            !shot ||
            controller?.type !== "native3d" ||
            controller.id !== mechanismOverlayLayerId("plate", shot.id)
          )
            fail(
              "Actual native episode controller differs from its authored half-open shot",
              `frames.${packet.outputFrame}`,
              "comp-native3d-observation",
            );
          const source = resolveNative3DVariant(
            loadedComposition.native3D,
            pass.frame,
          ).source;
          if (source.schemaVersion !== "mechanism-scene-1")
            fail(
              "Mechanism execution lost its authored rigs",
              controller.id,
              "comp-native3d-source",
            );
          const actual = packet.passes[index]!.observed;
          const request: MechanismFrameRequest = {
            frame: pass.frame.sourceFrame,
            width: pass.width,
            height: pass.height,
            camera: pass.frame.frame.camera,
            ...(controller.controls ? { controls: controller.controls } : {}),
            ...(controller.hiddenParts
              ? { hiddenParts: controller.hiddenParts }
              : {}),
          };
          const mechanical = checkNativeMechanismFrames(source, [
            { shotId: shot.id, observed: actual, request },
          ]);
          for (const finding of mechanical.findings) {
            const key = mechanismContentHash({
              ...finding,
              frames: undefined,
              measured: undefined,
            });
            const old = mechanicalRows.get(key);
            if (old) {
              old.frames[0] = Math.min(old.frames[0], finding.frames[0]);
              old.frames[1] = Math.max(old.frames[1], finding.frames[1]);
              old.measured = Math.max(old.measured, finding.measured);
            } else retainFinding(mechanicalRows, key, finding);
          }
          checkedFrames++;
          const camera = new PerspectiveCamera(
            request.camera!.fovDegrees,
            pass.width / pass.height,
            request.camera!.near,
            request.camera!.far,
          );
          camera.position.fromArray(request.camera!.position);
          camera.up.fromArray(pass.frame.frame.camera.up);
          camera.lookAt(...request.camera!.target);
          camera.updateProjectionMatrix();
          camera.updateMatrixWorld(true);
          for (const [field, expected] of [
            ["worldMatrix", camera.matrixWorld.elements],
            ["viewMatrix", camera.matrixWorldInverse.elements],
            ["projectionMatrix", camera.projectionMatrix.elements],
          ] as const)
            if (
              expected.some(
                (value, i) => Math.abs(value - actual.camera[field][i]!) > 1e-8,
              )
            )
              retainFinding(projectionRows, `${shot.id}.camera.${field}`, {
                code: "mechanism-native-camera",
                path: `controllers.${controller.id}.camera.${field}`,
                message:
                  "Actual draw camera differs from the current authored camera",
                frame: packet.outputFrame,
                shot: shot.id,
              });
          for (const [id, expected] of Object.entries(pass.frame.anchors)) {
            const anchor = actual.anchors[id]!;
            const pixelError =
              anchor.pixel === null || expected.pixel === null
                ? anchor.pixel === expected.pixel
                  ? 0
                  : Infinity
                : Math.hypot(
                    anchor.pixel[0] - expected.pixel[0],
                    anchor.pixel[1] - expected.pixel[1],
                  );
            if (
              pixelError > 0.5 ||
              anchor.visibility !== expected.visibility ||
              Math.abs(anchor.depth - expected.depth) > 1e-8
            )
              retainFinding(projectionRows, `${shot.id}.anchors.${id}`, {
                code: "mechanism-native-anchor",
                path: `controllers.${controller.id}.anchors.${id}`,
                message:
                  "Actual physical projection/visibility differs from independent native expectation",
                frame: packet.outputFrame,
                shot: shot.id,
              });
          }
        }
      },
    });
    overlayReport = overlayChecker.finish();
    findings.push(
      ...overlayReport.findings.map((finding) => ({
        ...finding,
        frame: finding.frames[0],
      })),
    );
    const probe = await runProcess(
      "ffprobe",
      [
        "-v",
        "error",
        "-count_frames",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        finalPath,
      ],
      { signal: options.signal },
    );
    finalProbe = JSON.parse(probe.stdout);
    const video = (
      finalProbe as {
        streams: {
          codec_type: string;
          nb_read_frames?: string;
          width?: number;
          height?: number;
          r_frame_rate?: string;
        }[];
      }
    ).streams.find((stream) => stream.codec_type === "video");
    if (
      !video ||
      Number(video.nb_read_frames) !== loaded.episode.output.frameCount ||
      video.width !== loaded.episode.output.width ||
      video.height !== loaded.episode.output.height ||
      video.r_frame_rate !== `${loaded.episode.output.fps}/1`
    )
      findings.push({
        code: "mechanism-final-video",
        path: finalPath,
        message: "Decoded native video differs from authored output clock",
      });
    if (loaded.episode.audio && loaded.audioMetadata) {
      audioReport = await verifyMechanismFinalAudio({
        sourcePath: loaded.dependencyPaths[loaded.episode.audio]!,
        finalPath,
        sourceSampleCount: loaded.audioMetadata.sampleCount,
        sourceChannels: loaded.audioMetadata.channels,
        frameCount: loaded.episode.output.frameCount,
        fps: loaded.episode.output.fps,
        ...(options.signal ? { signal: options.signal } : {}),
      });
      findings.push(...audioReport.findings);
    }
  }
  const mechanicalFindings = [...mechanicalRows.values()];
  findings.push(...projectionRows.values());
  findings.push(
    ...mechanicalFindings.map((finding) => ({
      ...finding,
      frame: finding.frames[0],
      shot: finding.shotId,
      message:
        "Actual native mechanism differs from independently reconstructed authored motion",
    })),
  );
  await verifyNativePreparedEpisode(loaded, options.preparedDirectory, options);
  options.signal?.throwIfAborted();
  return {
    schemaVersion: "mechanism-native-check-result-1" as const,
    projectHash: loaded.projectHash,
    routeSelection: receipt.routeSelection,
    scope: options.finalOutput
      ? ("actual-final-execution" as const)
      : ("prepared-recipe-only" as const),
    actualExecutionVerified: !!closureReport,
    checkedFrames,
    findings,
    qualityReport,
    overlayReport,
    closureReport,
    finalProbe,
    audioReport,
    mechanicalValid: mechanicalFindings.length === 0,
    mechanicalReport: {
      valid: mechanicalFindings.length === 0,
      checkedFrames,
      findings: mechanicalFindings,
    },
    valid:
      findings.length === 0 &&
      (!overlayReport ||
        (overlayReport.physicalHoldsValid &&
          overlayReport.layoutAccepted !== false)) &&
      (!qualityReport ||
        qualityReport.diagnostics.every(
          (diagnostic) => diagnostic.severity !== "error",
        )),
    wallSeconds: (performance.now() - started) / 1000,
    review: {
      continuousMotion: "pending-human-review",
      listening: "pending-human-review",
    },
  };
}
export async function renderNativeMechanismEpisode(
  loaded: LoadedMechanismEpisode,
  options: {
    outputDirectory: string;
    signal?: AbortSignal;
    cacheDirectory?: string;
    backend?: "canvas2d" | "webgl2";
  },
  selection: MechanismRouteSelection,
) {
  mechanismRouteBackend(selection, options.backend);
  const started = performance.now(),
    outputDirectory = resolve(options.outputDirectory);
  await mkdir(outputDirectory, { recursive: false });
  const prepared = await prepareNativeMechanismEpisode(
    loaded,
    { ...options, outputDirectory: join(outputDirectory, "prepared") },
    selection,
  );
  const preparedAt = performance.now();
  const render = await renderComposition({
    compositionPath: prepared.compositionPath,
    outputPath: join(outputDirectory, "episode.mp4"),
    backend: "webgl2",
    nativeMechanism: nativeMechanismExecution(loaded, selection),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.cacheDirectory
      ? { cacheDirectory: options.cacheDirectory }
      : {}),
  });
  const renderedAt = performance.now();
  const check = await checkNativeMechanismEpisode(loaded, {
    preparedDirectory: prepared.outputDirectory,
    finalOutput: render.outputPath,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const result = {
    schemaVersion: "mechanism-native-render-result-1" as const,
    status: "rendered" as const,
    valid: check.valid,
    projectHash: loaded.projectHash,
    routeSelection: selection,
    outputPath: render.outputPath,
    timings: {
      scope: "monotonic-wall-clock-through-final-check",
      prepareWallSeconds: (preparedAt - started) / 1000,
      exportWallSeconds: (renderedAt - preparedAt) / 1000,
      checkWallSeconds: check.wallSeconds,
      throughCheckWallSeconds: (performance.now() - started) / 1000,
    },
    prepared,
    render,
    check,
  };
  options.signal?.throwIfAborted();
  const resultPath = join(outputDirectory, "episode.result.json");
  await writeMechanismJson(resultPath, result);
  const openFindings = [
    ...check.findings,
    ...(check.qualityReport?.diagnostics ?? []),
  ];
  const summary = await createMechanismCommandReceipt({
    command: "summary",
    status: check.valid ? "passed" : "failed",
    summary: {
      episode: loaded.episode.id,
      revision: loaded.episode.revision,
      projectHash: prepared.projectHash,
      sourcePath: loaded.sourcePath,
      preparedReceipt: prepared.receiptPath,
      outputPath: render.outputPath,
      resultPath,
      route: selection.effectiveRoute,
      routeOrigin: selection.selectionOrigin,
      backend: prepared.backend,
      profile: prepared.profile,
      actualExecutionVerified: check.actualExecutionVerified,
      observedOutputFrames: check.closureReport?.outputFrames ?? 0,
      observedPasses: check.closureReport?.passCount ?? 0,
      openFindings: openFindings.length,
      layoutMeasurement: check.overlayReport?.layoutMeasurement ?? "unassessed",
      continuousMotion: "pending-human-review",
      listening: "pending-human-review",
    },
    items: openFindings.map((finding) => ({
      code: finding.code,
      path: JSON.stringify(finding),
      kind: "finding",
    })),
    artifacts: [{ kind: "complete-result", path: resultPath }],
    fullResult: result,
    nextAction:
      "episode inspect --input <episode.json>; episode preview --input <episode.json> --route native3d --frame <frame>; episode render --input <episode.json> --route native3d --output-dir <fresh-directory>",
  });
  options.signal?.throwIfAborted();
  await writeMechanismJson(
    join(outputDirectory, "project.summary.json"),
    summary,
  );
  return result;
}
