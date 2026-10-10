import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rename,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { z } from "zod";
import {
  AnimationEngineError,
  MECHANISM_LIMITS,
  MechanismHashSchema,
  MechanismRouteSelectionSchema,
  type MechanismRoute,
  type MechanismRouteSelection,
} from "@still-shift/scene-contract";
import { acquireArtifactLock } from "@still-shift/execution-runtime/locks";
import type { NativeObservationClosure } from "@still-shift/execution-runtime/export";
import type { CompositionRenderResult } from "../composition-render.ts";
import { nativeCompositionSha256 } from "../native-observation.ts";
import {
  mechanismContentHash,
  readMechanismEpisode,
  readMechanismJson,
  writeMechanismJson,
  type LoadedMechanismEpisode,
} from "./io.ts";
import { followPreparedMechanismRoute } from "./route.ts";
import {
  checkNativeMechanismEpisode,
  verifyNativePreparedEpisode,
} from "./native-lifecycle.ts";

const portablePath = z
  .string()
  .min(1)
  .max(2048)
  .refine((path) => !isAbsolute(path) && !path.split(/[\\/]/).includes(".."));
const fileSchema = z
  .object({
    path: portablePath,
    sha256: MechanismHashSchema,
    role: z.string().min(1).max(128),
  })
  .strict();
const relocationSchema = z
  .object({
    originalCompositionSourceSha256: MechanismHashSchema,
    relocatedCompositionSourceSha256: MechanismHashSchema,
    compositionSha256: MechanismHashSchema,
    renderResultPath: portablePath,
    sceneManifestPath: portablePath,
    observationManifestPath: portablePath,
  })
  .strict();
const manifestSchema = z
  .object({
    schemaVersion: z.literal("mechanism-native-project-package-1"),
    episode: portablePath,
    projectHash: MechanismHashSchema,
    geometrySha256: MechanismHashSchema,
    rigSha256: MechanismHashSchema,
    routeSelection: MechanismRouteSelectionSchema,
    files: z
      .array(fileSchema)
      .min(1)
      .max(MECHANISM_LIMITS.dependencies + 48),
    prepared: portablePath.optional(),
    finalOutput: portablePath.optional(),
    relocation: relocationSchema.optional(),
    runtime: z.record(z.string(), z.string()),
    nextAction: z.string().min(1).max(2048),
  })
  .strict();
type NativePackageFile = z.infer<typeof fileSchema>;
type NativePackageManifest = z.infer<typeof manifestSchema>;
type NativePackageVerificationControls = {
  signal?: AbortSignal;
  route?: MechanismRoute;
};
export type NativeMechanismPackageOptions = {
  outputDirectory: string;
  preparedDirectory?: string;
  finalOutput?: string;
  signal?: AbortSignal;
  route?: MechanismRoute;
};
function fail(
  message: string,
  path: string,
  code = "mechanism-native-package",
): never {
  throw new AnimationEngineError("SCENE_INVALID", message, {
    stage: "mechanism-package",
    diagnosticCode: code,
    path,
  });
}
function inside(root: string, path: string) {
  const absolute = resolve(root, path),
    local = relative(root, absolute);
  if (local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local))
    fail(
      "Native package artifact escapes its owner",
      path,
      "mechanism-package-path",
    );
  return absolute;
}
async function regularContained(root: string, path: string) {
  const declared = inside(root, path);
  if (!(await lstat(declared)).isFile())
    fail(
      "Native package artifact must be a regular file",
      path,
      "mechanism-package-path",
    );
  const actual = await realpath(declared);
  const actualRoot = await realpath(root);
  inside(actualRoot, actual);
  if (actual !== resolve(actualRoot, relative(root, declared)))
    fail(
      "Native package artifact uses a symbolic directory alias",
      path,
      "mechanism-package-path",
    );
  return actual;
}
async function checksum(path: string, signal?: AbortSignal) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(path, {
    highWaterMark: 65536,
    signal,
  }))
    hash.update(bytes);
  return `sha256:${hash.digest("hex")}`;
}
async function absent(path: string) {
  try {
    await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  fail(
    "Native package destination already exists",
    path,
    "mechanism-output-exists",
  );
}
const lexical = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function packageVerificationControls(
  options: NativePackageVerificationControls,
): NativePackageVerificationControls {
  const { signal, route } = options;
  return {
    ...(signal !== undefined ? { signal } : {}),
    ...(route !== undefined ? { route } : {}),
  };
}

/** Confined retained-byte verification; actual observations are streamed by the shared checker. */
export async function verifyNativeMechanismPackageArtifacts(
  directory: string,
  options: NativePackageVerificationControls = {},
) {
  const controls = packageVerificationControls(options);
  controls.signal?.throwIfAborted();
  const root = await realpath(resolve(directory)),
    manifest = manifestSchema.parse(
      await readMechanismJson(join(root, "package.manifest.json")),
    );
  const files = new Map<string, NativePackageFile>();
  for (const file of manifest.files) {
    if (files.has(file.path)) fail("Duplicate native package file", file.path);
    const path = await regularContained(root, file.path);
    if ((await checksum(path, controls.signal)) !== file.sha256)
      fail(
        "Native package bytes differ from their manifest",
        file.path,
        "mechanism-package-hash",
      );
    files.set(file.path, file);
  }
  if (!files.has(manifest.episode))
    fail("Native package omits its authored episode", manifest.episode);
  const loaded = await readMechanismEpisode(
    await regularContained(root, manifest.episode),
  );
  const selection = followPreparedMechanismRoute(
    loaded.episode,
    manifest.routeSelection,
    controls.route,
  );
  if (
    selection.effectiveRoute !== "native3d" ||
    loaded.projectHash !== manifest.projectHash ||
    loaded.scene.geometrySha256 !== manifest.geometrySha256 ||
    mechanismContentHash(loaded.scene.rigs) !== manifest.rigSha256
  )
    fail(
      "Native package changed its authored scene, rig or selected route",
      root,
      "mechanism-relocation-identity",
    );
  for (const dependency of loaded.episode.dependencies)
    if (
      files.get(relative(root, loaded.dependencyPaths[dependency.id]!))
        ?.sha256 !== dependency.sha256
    )
      fail(
        "Native package omits a declared pinned dependency",
        dependency.path,
      );
  let actualExecutionVerified = false;
  if (manifest.prepared) {
    if (!files.has(join(manifest.prepared, "prepared.receipt.json")))
      fail("Native package omits preparation receipt", manifest.prepared);
    const verified = await verifyNativePreparedEpisode(
      loaded,
      inside(root, manifest.prepared),
      { ...controls, verifyCode: false },
    );
    const compositionPath = await regularContained(
      root,
      resolve(root, manifest.prepared, verified.receipt.compositionPath),
    );
    if (!files.has(relative(root, compositionPath)))
      fail("Native package omits the prepared composition", compositionPath);
    for (const asset of verified.loadedComposition.composition.assets) {
      const path = await regularContained(
        root,
        resolve(dirname(compositionPath), asset.path),
      );
      if (files.get(relative(root, path))?.sha256 !== asset.sha256)
        fail(
          "Native composition locator differs from its pinned package artifact",
          asset.path,
        );
    }
    if (manifest.finalOutput) {
      if (!manifest.relocation)
        fail(
          "Native final package needs its explicit composition relocation association",
          manifest.finalOutput,
        );
      for (const path of [
        manifest.finalOutput,
        manifest.relocation.renderResultPath,
        manifest.relocation.sceneManifestPath,
        manifest.relocation.observationManifestPath,
      ])
        if (!files.has(path))
          fail("Native package omits declared final evidence", path);
      const render = (await readMechanismJson(
        await regularContained(root, manifest.relocation.renderResultPath),
      )) as CompositionRenderResult;
      if (
        !render.metrics?.nativeObservations ||
        render.checksums.source !==
          manifest.relocation.originalCompositionSourceSha256 ||
        render.checksums.output !== files.get(manifest.finalOutput)!.sha256 ||
        render.checksums.scene !==
          files.get(manifest.relocation.sceneManifestPath)!.sha256 ||
        render.metrics.nativeObservations.manifestSha256 !==
          files.get(manifest.relocation.observationManifestPath)!.sha256
      )
        fail(
          "Native final receipts differ from their exact retained package bytes",
          manifest.finalOutput,
        );
      const observation = (await readMechanismJson(
        inside(root, manifest.relocation.observationManifestPath),
      )) as { artifacts?: { path: string; sha256: string }[] };
      if (
        !Array.isArray(observation.artifacts) ||
        observation.artifacts.length > 16
      )
        fail(
          "Invalid observation artifact inventory",
          manifest.relocation.observationManifestPath,
        );
      for (const artifact of observation.artifacts) {
        if (
          basename(artifact.path) !== artifact.path ||
          files.get(
            join(
              dirname(manifest.relocation.observationManifestPath),
              artifact.path,
            ),
          )?.sha256 !== artifact.sha256
        )
          fail(
            "Native package omits a pinned observation shard",
            artifact.path,
          );
      }
      const checked = await checkNativeMechanismEpisode(loaded, {
        preparedDirectory: inside(root, manifest.prepared),
        finalOutput: inside(root, manifest.finalOutput),
        ...controls,
        verifyCode: false,
        pixels: false,
        relocation: {
          ...manifest.relocation,
          renderResultPath: inside(root, manifest.relocation.renderResultPath),
          sceneManifestPath: inside(
            root,
            manifest.relocation.sceneManifestPath,
          ),
          observationManifestPath: inside(
            root,
            manifest.relocation.observationManifestPath,
          ),
        },
      });
      if (!checked.valid || !checked.actualExecutionVerified)
        fail(
          "Native package actual execution did not verify",
          manifest.finalOutput,
        );
      actualExecutionVerified = true;
    }
  } else if (manifest.finalOutput || manifest.relocation)
    fail("Native final evidence requires its current prepared recipe", root);
  controls.signal?.throwIfAborted();
  return {
    schemaVersion: "mechanism-native-package-check-1" as const,
    valid: true,
    projectHash: loaded.projectHash,
    routeSelection: selection,
    files: files.size,
    preparedChecked: !!manifest.prepared,
    actualExecutionVerified,
  };
}

/** Native source-only packages and prepared/final packages share one atomic directory publication. */
export async function packageNativeMechanismEpisode(
  loaded: LoadedMechanismEpisode,
  selection: MechanismRouteSelection,
  options: NativeMechanismPackageOptions,
) {
  const controls = packageVerificationControls(options);
  controls.signal?.throwIfAborted();
  if (selection.effectiveRoute !== "native3d")
    fail("Native package requires a native route selection", "route");
  if (options.finalOutput && !options.preparedDirectory)
    fail(
      "Native final output requires its current prepared recipe",
      "preparedDirectory",
    );
  const prepared = options.preparedDirectory
    ? await verifyNativePreparedEpisode(loaded, options.preparedDirectory, {
        ...controls,
        verifyCode: false,
      })
    : undefined;
  if (prepared)
    followPreparedMechanismRoute(
      loaded.episode,
      prepared.receipt.routeSelection,
      controls.route,
    );
  const finalCheck = options.finalOutput
    ? await checkNativeMechanismEpisode(loaded, {
        preparedDirectory: options.preparedDirectory!,
        finalOutput: options.finalOutput,
        ...controls,
        verifyCode: false,
        pixels: false,
      })
    : undefined;
  if (finalCheck && (!finalCheck.valid || !finalCheck.actualExecutionVerified))
    fail(
      "Original native execution did not verify before packaging",
      options.finalOutput!,
    );
  const destination = resolve(options.outputDirectory),
    parent = dirname(destination);
  let release: (() => Promise<void>) | undefined, stage: string | undefined;
  const files = new Map<string, NativePackageFile>();
  try {
    await absent(destination);
    await mkdir(parent, { recursive: true });
    release = await acquireArtifactLock(`${destination}.package.lock`, parent);
    controls.signal?.throwIfAborted();
    await absent(destination);
    stage = await realpath(
      await mkdtemp(
        join(
          parent,
          `.${basename(destination).slice(0, 80)}.native-package-attempt-`,
        ),
      ),
    );
    const attempt = stage;
    const register = async (path: string, role: string) => {
      const actual = await regularContained(attempt, path);
      files.set(path, {
        path,
        role,
        sha256: await checksum(actual, controls.signal),
      });
    };
    const copy = async (
      source: string,
      path: string,
      role: string,
      expected?: string,
    ) => {
      controls.signal?.throwIfAborted();
      if (!(await lstat(source)).isFile())
        fail("Native package source must be a regular file", source);
      const before = await checksum(source, controls.signal);
      if (expected && before !== expected)
        fail(
          "Native source changed before copying",
          source,
          "mechanism-package-hash",
        );
      const target = inside(attempt, path),
        normalized = relative(attempt, target),
        previous = files.get(normalized);
      if (previous) {
        if (previous.sha256 !== before)
          fail("Native package artifacts collide with different bytes", path);
        return;
      }
      await mkdir(dirname(target), { recursive: true });
      await copyFile(source, target, constants.COPYFILE_EXCL);
      await register(normalized, role);
      if (files.get(normalized)!.sha256 !== before)
        fail(
          "Native package copy changed bytes",
          path,
          "mechanism-package-hash",
        );
    };
    await copy(loaded.sourcePath, "episode.json", "authored-episode");
    for (const dependency of loaded.episode.dependencies) {
      const path = relative(attempt, inside(attempt, dependency.path));
      if (
        path === "episode.json" ||
        path.startsWith("prepared/") ||
        path.startsWith("evidence/") ||
        path.startsWith("package.")
      )
        fail(
          "Dependency collides with native package metadata",
          dependency.path,
          "mechanism-package-path",
        );
      await copy(
        loaded.dependencyPaths[dependency.id]!,
        path,
        dependency.type,
        dependency.sha256,
      );
    }
    let association: z.infer<typeof relocationSchema> | undefined;
    if (prepared) {
      const composition = structuredClone(
        prepared.loadedComposition.composition,
      );
      for (const asset of composition.assets) {
        const originalPath = await realpath(
          resolve(dirname(prepared.loadedComposition.sourcePath), asset.path),
        );
        const dependency = loaded.episode.dependencies.find(
          (item) =>
            loaded.dependencyPaths[item.id] === originalPath &&
            item.sha256 === asset.sha256 &&
            (asset.type === "native3d"
              ? item.type === "scene"
              : item.type === asset.type),
        );
        if (!dependency)
          fail(
            "Native composition source must match an authored dependency",
            asset.path,
          );
        asset.path = relative(
          join(attempt, "prepared"),
          inside(attempt, dependency.path),
        );
      }
      if (
        nativeCompositionSha256(composition) !==
        prepared.receipt.compositionSha256
      )
        fail("Native locator relocation changed recipe semantics", "prepared");
      const compositionName = basename(prepared.loadedComposition.sourcePath);
      if (compositionName === "prepared.receipt.json")
        fail("Composition collides with its receipt", compositionName);
      const compositionPath = join(attempt, "prepared", compositionName);
      await writeMechanismJson(compositionPath, composition);
      await register(join("prepared", compositionName), "native-composition");
      const relocatedChecksum = files.get(
        join("prepared", compositionName),
      )!.sha256;
      const portable = {
        ...prepared.receipt,
        sourcePath: "../episode.json",
        outputDirectory: ".",
        compositionPath: compositionName,
        compositionSourceSha256: relocatedChecksum,
        receiptPath: "prepared.receipt.json",
      };
      await writeMechanismJson(
        join(attempt, "prepared", "prepared.receipt.json"),
        portable,
      );
      await register(
        "prepared/prepared.receipt.json",
        "native-prepared-receipt",
      );
      if (options.finalOutput) {
        const originalFinal = resolve(options.finalOutput),
          renderPath = `${originalFinal}.result.json`,
          scenePath = `${originalFinal}.scene.json`;
        const render = (await readMechanismJson(
          renderPath,
        )) as CompositionRenderResult;
        const closure: NativeObservationClosure | undefined =
          render.metrics.nativeObservations;
        if (!closure || !finalCheck?.closureReport)
          fail(
            "Native final output omits actual retained observations",
            originalFinal,
          );
        await copy(
          originalFinal,
          "episode.mp4",
          "final-output",
          render.checksums.output,
        );
        await copy(
          renderPath,
          "evidence/render.result.json",
          "original-native-render-result",
        );
        await copy(
          scenePath,
          "evidence/render.scene.json",
          "original-native-scene",
          render.checksums.scene,
        );
        const manifestName = basename(closure.manifestPath),
          originalManifest = resolve(
            dirname(originalFinal),
            closure.manifestPath,
          );
        await copy(
          originalManifest,
          join("evidence", manifestName),
          "native-observation-manifest",
          closure.manifestSha256,
        );
        for (const artifact of finalCheck.closureReport.artifacts)
          await copy(
            resolve(dirname(originalManifest), artifact.path),
            join("evidence", artifact.path),
            "native-observation-shard",
            artifact.sha256,
          );
        for (const name of ["episode.result.json", "project.summary.json"]) {
          const path = join(dirname(originalFinal), name);
          try {
            await copy(path, join("evidence", name), "original-native-report");
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
        }
        association = {
          originalCompositionSourceSha256:
            prepared.receipt.compositionSourceSha256,
          relocatedCompositionSourceSha256: relocatedChecksum,
          compositionSha256: portable.compositionSha256,
          renderResultPath: "evidence/render.result.json",
          sceneManifestPath: "evidence/render.scene.json",
          observationManifestPath: join("evidence", manifestName),
        };
      }
    }
    const manifest: NativePackageManifest = {
      schemaVersion: "mechanism-native-project-package-1",
      episode: "episode.json",
      projectHash: loaded.projectHash,
      geometrySha256: loaded.scene.geometrySha256,
      rigSha256: mechanismContentHash(loaded.scene.rigs),
      routeSelection: selection,
      files: [...files.values()].sort((a, b) => lexical(a.path, b.path)),
      ...(prepared ? { prepared: "prepared" } : {}),
      ...(options.finalOutput
        ? { finalOutput: "episode.mp4", relocation: association! }
        : {}),
      runtime: {
        node: "22.23.1",
        pnpm: "10.29.3",
        playwright: "1.62.1",
        chromium: "151.0.7922.34",
        chromiumRevision: "1234",
        ffmpeg: "8.0.1",
        renderProfile: "chromium-software-2",
        three: "0.186.0",
        nativeProfile: "native-three-aces-hdr-msaa4-1",
      },
      nextAction:
        "still-shift episode deps --input episode.json; still-shift episode check --input episode.json --route native3d",
    };
    await writeMechanismJson(
      join(attempt, "package.manifest.json"),
      manifestSchema.parse(manifest),
    );
    const checked = await verifyNativeMechanismPackageArtifacts(
      attempt,
      controls,
    );
    await writeMechanismJson(
      join(attempt, "package.verification.json"),
      checked,
    );
    await register("package.verification.json", "native-package-check");
    manifest.files = [...files.values()].sort((a, b) =>
      lexical(a.path, b.path),
    );
    await writeMechanismJson(
      join(attempt, "package.manifest.json"),
      manifestSchema.parse(manifest),
      { replace: true },
    );
    await verifyNativeMechanismPackageArtifacts(attempt, controls);
    controls.signal?.throwIfAborted();
    await absent(destination);
    await rename(attempt, destination);
    stage = destination;
    const verification = await verifyNativeMechanismPackageArtifacts(
      destination,
      controls,
    );
    return {
      schemaVersion: "mechanism-native-package-result-1" as const,
      outputDirectory: destination,
      manifestPath: join(destination, "package.manifest.json"),
      projectHash: loaded.projectHash,
      routeSelection: selection,
      files: verification.files,
      preparedChecked: verification.preparedChecked,
      actualExecutionVerified: verification.actualExecutionVerified,
    };
  } catch (cause) {
    if (stage)
      await writeMechanismJson(join(stage, "failure.json"), {
        schemaVersion: "mechanism-native-package-failure-1",
        status: controls.signal?.aborted ? "cancelled" : "failed",
        message: cause instanceof Error ? cause.message : String(cause),
      }).catch(() => undefined);
    throw new AnimationEngineError(
      "RENDER_FAILED",
      "Native package failed; retained attempt contains the original cause",
      {
        stage: "mechanism-package",
        diagnosticCode: "mechanism-native-package-failed",
        path: destination,
        ...(stage ? { attemptDirectory: stage } : {}),
      },
      { cause },
    );
  } finally {
    await release?.();
  }
}
