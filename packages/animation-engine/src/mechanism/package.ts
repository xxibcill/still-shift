import { constants } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
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
import {
  AnimationEngineError,
  sanitizeDiagnosticText,
  CompositionSchema,
  CompositionSequenceManifestSchema,
  MechanismSidecarSchema,
  MECHANISM_LIMITS,
} from "@still-shift/scene-contract";
import type {
  Composition,
  MechanismRoute,
  MechanismRouteSelection,
} from "@still-shift/scene-contract";
import { followPreparedMechanismRoute, selectMechanismRoute } from "./route.ts";
import {
  evaluateMechanismFrame,
  prepareMechanismScene,
  canonicalMechanismJson,
} from "@still-shift/renderer-core";
import { acquireArtifactLock } from "@still-shift/execution-runtime/locks";
import {
  mechanismContentHash,
  mechanismHash,
  readMechanismEpisode,
  readMechanismJson,
  writeMechanismJson,
} from "./io.ts";
import type { LoadedMechanismEpisode } from "./io.ts";
import type { PreparedMechanismEpisode } from "./lifecycle.ts";

interface PackageFile {
  path: string;
  sha256: string;
  role: string;
}
interface PackageManifest {
  schemaVersion: "mechanism-project-package-1";
  episode: string;
  projectHash: string;
  geometrySha256: string;
  files: PackageFile[];
  prepared?: string;
  runtime: Record<string, string>;
  nextAction: string;
}
function fail(code: string, message: string, path: string): never {
  throw new AnimationEngineError("SCENE_INVALID", message, {
    stage: "mechanism-package",
    diagnosticCode: code,
    path,
    nextAction:
      "Inspect the retained package attempt and choose a fresh output directory",
  });
}
function inside(root: string, path: string): string {
  const absolute = resolve(root, path),
    rel = relative(root, absolute);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    fail(
      "mechanism-package-path",
      "Declared artifact escapes its project directory",
      path,
    );
  return absolute;
}
async function containedSource(root: string, path: string): Promise<string> {
  const actual = await realpath(resolve(root, path));
  inside(await realpath(root), actual);
  return actual;
}
async function absent(path: string) {
  try {
    await lstat(path);
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return;
    throw error;
  }
  fail("mechanism-output-exists", "Package destination already exists", path);
}
async function bytesHash(path: string) {
  return mechanismHash(await readFile(path));
}

/** Verify copied bytes and relative references without launching a renderer. */
export async function verifyMechanismPackageArtifacts(
  directory: string,
  options: { signal?: AbortSignal; route?: MechanismRoute } = {},
) {
  const { signal } = options;
  signal?.throwIfAborted();
  const root = resolve(directory),
    manifestValue = await readMechanismJson(
      join(root, "package.manifest.json"),
    );
  if (
    manifestValue &&
    typeof manifestValue === "object" &&
    "schemaVersion" in manifestValue &&
    manifestValue.schemaVersion === "mechanism-native-project-package-1"
  ) {
    const { verifyNativeMechanismPackageArtifacts } = await import(
      "./native-package.ts"
    );
    return verifyNativeMechanismPackageArtifacts(root, options);
  }
  const manifest = manifestValue as PackageManifest;
  if (
    manifest.schemaVersion !== "mechanism-project-package-1" ||
    !Array.isArray(manifest.files) ||
    manifest.files.length >
      MECHANISM_LIMITS.frames +
        MECHANISM_LIMITS.dependencies +
        MECHANISM_LIMITS.shots * 4 +
        16
  )
    fail("mechanism-package-schema", "Unsupported package manifest", root);
  const seen = new Set<string>();
  for (const file of manifest.files) {
    signal?.throwIfAborted();
    if (seen.has(file.path))
      fail("mechanism-package-schema", "Duplicate package file", file.path);
    seen.add(file.path);
    const path = await containedSource(root, file.path);
    if ((await bytesHash(path)) !== file.sha256)
      fail(
        "mechanism-package-hash",
        "Copied file differs from its manifest",
        file.path,
      );
  }
  const loaded = await readMechanismEpisode(inside(root, manifest.episode));
  signal?.throwIfAborted();
  if (
    loaded.projectHash !== manifest.projectHash ||
    loaded.scene.geometrySha256 !== manifest.geometrySha256
  )
    fail(
      "mechanism-relocation-identity",
      "Copied project changed semantic identity",
      root,
    );
  if (manifest.prepared !== undefined)
    await verifyPrepared(root, inside(root, manifest.prepared), loaded, signal);
  if (seen.has("episode.mp4")) {
    if (manifest.prepared === undefined)
      fail(
        "mechanism-package-final-receipt",
        "Final output requires its prepared source",
        root,
      );
    await verifyFinalEvidence(
      join(root, "episode.mp4"),
      inside(root, manifest.prepared),
      loaded,
      signal,
    );
    await verifyReportReferences(root, manifest.files, signal);
  }
  signal?.throwIfAborted();
  return {
    schemaVersion: "mechanism-package-check-1" as const,
    valid: true,
    projectHash: loaded.projectHash,
    files: manifest.files.length,
    preparedChecked: manifest.prepared !== undefined,
  };
}

async function verifyPrepared(
  root: string,
  directory: string,
  loaded: LoadedMechanismEpisode,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const receipt = (await readMechanismJson(
    join(directory, "prepared.receipt.json"),
  )) as PreparedMechanismEpisode;
  if (
    receipt.schemaVersion !== "mechanism-prepared-episode-1" ||
    receipt.projectHash !== loaded.projectHash ||
    receipt.captures.length !== loaded.episode.shots.length
  )
    fail(
      "mechanism-stale-preparation",
      "Prepared artifacts do not match the copied episode",
      directory,
    );
  const prepared = prepareMechanismScene(loaded.scene);
  for (const capture of receipt.captures) {
    signal?.throwIfAborted();
    const shot = loaded.episode.shots.find(
      (item) => item.id === capture.shotId,
    );
    if (
      !shot ||
      capture.frames.length !== shot.endFrameExclusive - shot.startFrame
    )
      fail(
        "mechanism-package-clock",
        "Capture does not cover its authored shot",
        capture.shotId,
      );
    const sidecarPath = await containedSource(directory, capture.sidecarPath),
      manifestPath = await containedSource(
        directory,
        capture.sequenceManifestPath,
      );
    if (
      (await bytesHash(sidecarPath)) !== capture.sidecarSha256 ||
      (await bytesHash(manifestPath)) !== capture.sequenceManifestSha256
    )
      fail(
        "mechanism-stale-sidecar",
        "Copied metadata differs from its capture receipt",
        capture.shotId,
      );
    const sidecar = MechanismSidecarSchema.parse(
      await readMechanismJson(sidecarPath),
    );
    const sequence = CompositionSequenceManifestSchema.parse(
      await readMechanismJson(manifestPath),
    );
    if (
      sidecar.sceneSha256 !== mechanismContentHash(loaded.scene) ||
      sidecar.geometrySha256 !== loaded.scene.geometrySha256 ||
      sidecar.frameCount !== capture.frames.length ||
      sequence.frames.length !== capture.frames.length
    )
      fail(
        "mechanism-package-clock",
        "Copied sidecar does not match scene or frame clock",
        capture.shotId,
      );
    for (const [ordinal, plate] of capture.frames.entries()) {
      signal?.throwIfAborted();
      const frame = sidecar.frames[ordinal]!;
      if (
        plate.frame !== ordinal ||
        plate.sourceFrame !== shot.startFrame + ordinal ||
        frame.sourceFrame !== plate.sourceFrame ||
        plate.sha256 !== frame.plateSha256 ||
        plate.sha256 !== sequence.frames[ordinal]
      )
        fail(
          "mechanism-package-clock",
          "Copied frame ordinals or hashes disagree",
          capture.shotId,
        );
      const path = await containedSource(
        directory,
        join(capture.outputDirectory, plate.path),
      );
      if ((await bytesHash(path)) !== plate.sha256)
        fail(
          "mechanism-package-hash",
          "Copied clean plate changed bytes",
          path,
        );
      const expected = evaluateMechanismFrame(prepared, {
        frame: plate.sourceFrame,
        width: loaded.episode.output.width,
        height: loaded.episode.output.height,
        ...(shot.camera ? { camera: shot.camera } : {}),
        ...(shot.cameraKeys ? { cameraKeys: shot.cameraKeys } : {}),
        controls: shot.controls,
        hiddenParts: shot.hiddenParts,
      });
      const actualAnchors = Object.fromEntries(
        frame.anchors.map(
          ({
            visibility: _visibility,
            visibilityMethod: _method,
            projectionErrorPixels: _error,
            ...anchor
          }) => [anchor.anchor, anchor],
        ),
      );
      const actual = {
        version: "mechanism-evaluator-1",
        frame: frame.sourceFrame,
        seed: frame.seed,
        camera: frame.camera,
        parts: frame.parts,
        rigs: frame.rigs,
        anchors: actualAnchors,
        assertions: frame.assertions,
      };
      if (canonicalMechanismJson(actual) !== canonicalMechanismJson(expected))
        fail(
          "mechanism-package-state",
          "Copied sidecar disagrees with independently reevaluated authored state",
          `${capture.shotId}/${ordinal}`,
        );
    }
  }
  const compositionPath = await containedSource(
      directory,
      receipt.compositionPath,
    ),
    composition = CompositionSchema.parse(
      await readMechanismJson(compositionPath),
    );
  for (const asset of composition.assets) {
    signal?.throwIfAborted();
    if (asset.type === "font" || asset.type === "audio") {
      const path = await containedSource(
        root,
        resolve(dirname(compositionPath), asset.path),
      );
      if ((await bytesHash(path)) !== asset.sha256)
        fail(
          "mechanism-package-asset",
          "Copied native asset reference or hash is invalid",
          asset.path,
        );
    }
    if (asset.type === "sequence") {
      await containedSource(
        root,
        resolve(dirname(compositionPath), asset.manifestPath),
      );
      inside(
        await realpath(root),
        resolve(dirname(compositionPath), asset.path),
      );
    }
  }
}

/** Atomic publication of a fresh portable directory; failed staging remains reviewable. */
export async function packageMechanismEpisode(
  path: string,
  options: {
    outputDirectory: string;
    preparedDirectory?: string;
    finalOutput?: string;
    signal?: AbortSignal;
    route?: MechanismRoute;
  },
) {
  options.signal?.throwIfAborted();
  const loaded = await readMechanismEpisode(path);
  let selection = selectMechanismRoute(loaded.episode, options.route);
  if (options.preparedDirectory) {
    const receipt = (await readMechanismJson(
      join(resolve(options.preparedDirectory), "prepared.receipt.json"),
    )) as { schemaVersion?: string; routeSelection?: MechanismRouteSelection };
    if (
      receipt.schemaVersion === "mechanism-prepared-native-episode-1" &&
      !receipt.routeSelection
    )
      fail(
        "mechanism-stale-preparation",
        "Native preparation omits its selected route",
        options.preparedDirectory,
      );
    selection = followPreparedMechanismRoute(
      loaded.episode,
      receipt.routeSelection,
      options.route,
    );
  }
  if (selection.effectiveRoute === "native3d") {
    const { packageNativeMechanismEpisode } = await import(
      "./native-package.ts"
    );
    return packageNativeMechanismEpisode(loaded, selection, options);
  }
  const destination = resolve(options.outputDirectory),
    parent = dirname(destination);
  let release: (() => Promise<void>) | undefined;
  let attemptDirectory: string | undefined;
  const files = new Map<string, PackageFile>();
  try {
    options.signal?.throwIfAborted();
    await mkdir(parent, { recursive: true });
    options.signal?.throwIfAborted();
    release = await acquireArtifactLock(`${destination}.package.lock`, parent);
    options.signal?.throwIfAborted();
    const stage = await mkdtemp(
      join(parent, `.${basename(destination).slice(0, 80)}.package-attempt-`),
    );
    attemptDirectory = stage;
    await absent(destination);
    async function register(relativePath: string, role: string) {
      options.signal?.throwIfAborted();
      const target = inside(stage, relativePath);
      const hash = await bytesHash(target);
      options.signal?.throwIfAborted();
      files.set(relativePath, {
        path: relativePath,
        sha256: hash,
        role,
      });
    }
    async function copy(
      source: string,
      target: string,
      role: string,
      expected?: string,
    ) {
      options.signal?.throwIfAborted();
      const actual = await bytesHash(source);
      options.signal?.throwIfAborted();
      if (expected !== undefined && actual !== expected)
        fail("mechanism-package-hash", "Source changed before copying", source);
      const destinationPath = inside(stage, target),
        previous = files.get(target);
      if (previous) {
        if (previous.sha256 !== actual)
          fail(
            "mechanism-package-path",
            "Declared files collide with different bytes",
            target,
          );
        return;
      }
      await mkdir(dirname(destinationPath), { recursive: true });
      options.signal?.throwIfAborted();
      await copyFile(source, destinationPath, constants.COPYFILE_EXCL);
      await register(target, role);
      if (files.get(target)!.sha256 !== actual)
        fail(
          "mechanism-package-hash",
          "Copy did not preserve source bytes",
          target,
        );
    }
    await copy(loaded.sourcePath, "episode.json", "authored-episode");
    for (const dependency of loaded.episode.dependencies) {
      options.signal?.throwIfAborted();
      if (
        ["package.manifest.json", "package.verification.json"].includes(
          dependency.path,
        ) ||
        dependency.path.startsWith("prepared/")
      )
        fail(
          "mechanism-package-path",
          "Dependency uses a package metadata path",
          dependency.path,
        );
      await copy(
        loaded.dependencyPaths[dependency.id]!,
        dependency.path,
        dependency.type,
        dependency.sha256,
      );
    }
    if (options.preparedDirectory)
      await copyPrepared(
        stage,
        resolve(options.preparedDirectory),
        loaded,
        copy,
        register,
        options.signal,
      );
    if (options.finalOutput) {
      if (!options.preparedDirectory)
        fail(
          "mechanism-package-final-receipt",
          "Final output requires its prepared source",
          options.finalOutput,
        );
      await copy(resolve(options.finalOutput), "episode.mp4", "final-output");
      await copyOutputReports(
        stage,
        resolve(options.finalOutput),
        loaded,
        options.preparedDirectory,
        register,
        options.signal,
      );
    }
    const relocated = await readMechanismEpisode(join(stage, "episode.json"));
    options.signal?.throwIfAborted();
    if (relocated.projectHash !== loaded.projectHash)
      fail(
        "mechanism-relocation-identity",
        "Copied project changed semantic identity",
        destination,
      );
    if (options.preparedDirectory)
      await verifyPrepared(
        stage,
        join(stage, "prepared"),
        relocated,
        options.signal,
      );
    options.signal?.throwIfAborted();
    await writeMechanismJson(join(stage, "package.verification.json"), {
      schemaVersion: "mechanism-package-check-1",
      valid: true,
      projectHash: loaded.projectHash,
      geometrySha256: loaded.scene.geometrySha256,
      preparedChecked: options.preparedDirectory !== undefined,
      filesBeforeVerificationReport: files.size,
    });
    await register("package.verification.json", "package-check-report");
    const manifest: PackageManifest = {
      schemaVersion: "mechanism-project-package-1",
      episode: "episode.json",
      projectHash: loaded.projectHash,
      geometrySha256: loaded.scene.geometrySha256,
      files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
      ...(options.preparedDirectory ? { prepared: "prepared" } : {}),
      runtime: {
        node: "22.23.1",
        pnpm: "10.29.3",
        python: "3.12.11",
        uv: "0.7.12",
        playwright: "1.62.1",
        chromium: "151.0.7922.34",
        chromiumRevision: "1234",
        ffmpeg: "8.0.1",
        renderProfile: "chromium-software-2",
        three: "0.186.0",
      },
      nextAction:
        "still-shift episode deps --input episode.json; still-shift episode check --input episode.json",
    };
    await writeMechanismJson(join(stage, "package.manifest.json"), manifest);
    options.signal?.throwIfAborted();
    await verifyMechanismPackageArtifacts(
      stage,
      options.signal ? { signal: options.signal } : {},
    );
    await absent(destination);
    options.signal?.throwIfAborted();
    await rename(stage, destination);
    attemptDirectory = destination;
    options.signal?.throwIfAborted();
    const verification = await verifyMechanismPackageArtifacts(
      destination,
      options.signal ? { signal: options.signal } : {},
    );
    options.signal?.throwIfAborted();
    return {
      schemaVersion: "mechanism-package-result-1" as const,
      outputDirectory: destination,
      manifestPath: join(destination, "package.manifest.json"),
      projectHash: verification.projectHash,
      files: files.size,
      preparedChecked: verification.preparedChecked,
    };
  } catch (cause) {
    try {
      if (attemptDirectory)
        await writeMechanismJson(join(attemptDirectory, "failure.json"), {
          schemaVersion: "mechanism-package-failure-1",
          status: options.signal?.aborted ? "cancelled" : "failed",
          destination: sanitizeDiagnosticText(destination),
          error: {
            name: sanitizeDiagnosticText(
              cause instanceof Error ? cause.name : "Error",
            ),
            message: sanitizeDiagnosticText(
              cause instanceof Error ? cause.message : String(cause),
            ),
          },
          ...(cause instanceof AnimationEngineError
            ? { failure: cause.toFailure() }
            : {}),
        });
    } catch {
      /* A completed directory may already have been published; preserve it as-is. */
    }
    throw new AnimationEngineError(
      "RENDER_FAILED",
      options.signal?.aborted
        ? "Mechanism package was cancelled; completed work is retained"
        : "Mechanism package failed; retained attempt contains the original cause",
      {
        stage: "mechanism-package",
        diagnosticCode: options.signal?.aborted
          ? "mechanism-package-cancelled"
          : "mechanism-package-failed",
        path: destination,
        ...(attemptDirectory === undefined ? {} : { attemptDirectory }),
        nextAction:
          "Inspect failure.json in the retained attempt and retry into a fresh output directory",
      },
      {
        cause: options.signal?.aborted
          ? Object.assign(new Error("Package cancelled", { cause }), {
              code: "ABORT_ERR",
            })
          : cause,
      },
    );
  } finally {
    await release?.();
  }
}

type CopyFile = (
  source: string,
  target: string,
  role: string,
  expected?: string,
) => Promise<void>;
type RegisterFile = (path: string, role: string) => Promise<void>;
async function copyPrepared(
  stage: string,
  source: string,
  loaded: LoadedMechanismEpisode,
  copy: CopyFile,
  register: RegisterFile,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const declaredDirectory = resolve(source);
  source = await realpath(source);
  const receipt = (await readMechanismJson(
    join(source, "prepared.receipt.json"),
  )) as PreparedMechanismEpisode;
  if (
    receipt.schemaVersion !== "mechanism-prepared-episode-1" ||
    receipt.projectHash !== loaded.projectHash ||
    receipt.captures.length !== loaded.episode.shots.length
  )
    fail(
      "mechanism-stale-preparation",
      "Prepared receipt does not match the selected episode",
      source,
    );
  const mappings = new Map<string, string>();
  const captures: PreparedMechanismEpisode["captures"] = [];
  for (const capture of receipt.captures) {
    signal?.throwIfAborted();
    const directory = await containedSource(source, capture.outputDirectory),
      target = relative(source, directory),
      prefix = join("prepared", target);
    for (const plate of capture.frames) {
      signal?.throwIfAborted();
      if (!/^\d{6}\.png$/.test(plate.path))
        fail(
          "mechanism-package-path",
          "Plate filename must be an indexed PNG",
          plate.path,
        );
      await copy(
        await containedSource(directory, plate.path),
        join(prefix, plate.path),
        "clean-plate",
        plate.sha256,
      );
    }
    const metadata = [
      {
        source: capture.sidecarPath,
        target: "anchors.sidecar.json",
        role: "anchor-sidecar",
        hash: capture.sidecarSha256,
      },
      {
        source: capture.sequenceManifestPath,
        target: "sequence.manifest.json",
        role: "sequence-manifest",
        hash: capture.sequenceManifestSha256,
      },
      {
        source: capture.receiptPath,
        target: "capture.receipt.json",
        role: "capture-receipt",
      },
    ];
    for (const file of metadata) {
      signal?.throwIfAborted();
      const actual = await containedSource(source, file.source);
      await copy(actual, join(prefix, file.target), file.role, file.hash);
      mappings.set(actual, join(target, file.target));
      mappings.set(resolve(source, file.source), join(target, file.target));
    }
    mappings.set(resolve(directory, "%06d.png"), join(target, "%06d.png"));
    mappings.set(
      resolve(source, capture.patternPath),
      join(target, "%06d.png"),
    );
    const portable = { ...capture };
    delete portable.cacheEntryDirectory;
    captures.push({
      ...portable,
      outputDirectory: target,
      patternPath: join(target, "%06d.png"),
      sidecarPath: join(target, "anchors.sidecar.json"),
      sequenceManifestPath: join(target, "sequence.manifest.json"),
      receiptPath: join(target, "capture.receipt.json"),
      attemptDirectory: "not-packaged",
    });
  }
  const declaredCompositionPath = resolve(
      declaredDirectory,
      receipt.compositionPath,
    ),
    originalComposition = await containedSource(
      source,
      declaredCompositionPath,
    ),
    composition = CompositionSchema.parse(
      await readMechanismJson(originalComposition),
    );
  for (const asset of composition.assets) {
    signal?.throwIfAborted();
    if (asset.type === "font" || asset.type === "audio") {
      // Relative assets belong to the declared path; directory aliases can change its parent depth.
      const actual = await realpath(
          resolve(dirname(declaredCompositionPath), asset.path),
        ),
        dependency = loaded.episode.dependencies.find(
          (item) =>
            item.type === asset.type &&
            loaded.dependencyPaths[item.id] === actual &&
            item.sha256 === asset.sha256,
        );
      if (!dependency)
        fail(
          "mechanism-package-asset",
          "Native asset must match a declared dependency path and hash",
          asset.path,
        );
      asset.path = relative(
        join(stage, "prepared"),
        join(stage, dependency.path),
      );
    }
    if (asset.type === "sequence") {
      const pattern = mappings.get(
          resolve(dirname(declaredCompositionPath), asset.path),
        ),
        manifest = mappings.get(
          resolve(dirname(declaredCompositionPath), asset.manifestPath),
        );
      if (!pattern || !manifest)
        fail(
          "mechanism-package-asset",
          "Native sequence must match a declared captured bundle",
          asset.path,
        );
      asset.path = pattern;
      asset.manifestPath = manifest;
    }
  }
  rewriteLayerSidecarPaths(composition, mappings);
  const compositionName = basename(originalComposition);
  signal?.throwIfAborted();
  await writeMechanismJson(
    join(stage, "prepared", compositionName),
    composition,
  );
  await register(join("prepared", compositionName), "native-composition");
  const portable = {
    ...receipt,
    sourcePath: "../episode.json",
    outputDirectory: ".",
    compositionPath: compositionName,
    receiptPath: "prepared.receipt.json",
    captures,
  };
  signal?.throwIfAborted();
  await writeMechanismJson(
    join(stage, "prepared", "prepared.receipt.json"),
    portable,
  );
  await register("prepared/prepared.receipt.json", "prepared-receipt");
}
function rewriteLayerSidecarPaths(
  composition: Composition,
  mappings: Map<string, string>,
) {
  function visit(value: unknown) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value === null || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (
      typeof record.sidecarPath === "string" &&
      mappings.has(record.sidecarPath)
    )
      record.sidecarPath = mappings.get(record.sidecarPath)!;
    Object.values(record).forEach(visit);
  }
  visit(composition.layers);
}
type ReportObject = Record<string, unknown>;
type PackageReportPlan = {
  target: string;
  value: ReportObject;
  originalHash: string;
  writtenHash?: string;
  writing?: boolean;
};
const reportSchemas = new Set([
  "mechanism-render-result-1",
  "mechanism-check-result-1",
  "mechanism-command-result-1",
  "composition-result-1",
  "composition-render-1",
]);
function object(value: unknown, path: string): ReportObject {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    fail(
      "mechanism-package-final-receipt",
      "Expected a structured render report",
      path,
    );
  return value as ReportObject;
}
async function reportSnapshot(path: string) {
  const info = await lstat(path);
  if (!info.isFile() || info.size > 32 * 1024 * 1024)
    fail(
      "mechanism-package-report",
      "Reports must be bounded regular files, without symlinks",
      path,
    );
  for (
    let parent = dirname(resolve(path));
    parent !== dirname(parent);
    parent = dirname(parent)
  ) {
    if (!(await lstat(parent)).isSymbolicLink()) continue;
    // macOS exposes these system-owned aliases even for paths returned by tmpdir().
    if (
      process.platform === "darwin" &&
      ["/tmp", "/var"].includes(parent) &&
      (await realpath(parent)) === `/private${parent}`
    )
      continue;
    fail(
      "mechanism-package-report",
      "Report directories must not contain symlinks",
      path,
    );
  }
  const bytes = await readFile(path);
  if (bytes.length > 32 * 1024 * 1024)
    fail(
      "mechanism-package-report",
      "Report grew beyond its byte budget",
      path,
    );
  return {
    value: object(JSON.parse(bytes.toString("utf8")) as unknown, path),
    sha256: mechanismHash(bytes),
  };
}
async function regularReport(path: string) {
  return (await reportSnapshot(path)).value;
}
async function optionalReport(path: string) {
  try {
    return await regularReport(path);
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return undefined;
    throw error;
  }
}
/** The selected movie must be the output of the current, declared native source. */
async function verifyFinalEvidence(
  finalOutput: string,
  preparedDirectory: string,
  loaded: LoadedMechanismEpisode,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const source = dirname(finalOutput),
    receiptPath = `${finalOutput}.result.json`,
    scenePath = `${finalOutput}.scene.json`,
    render = await regularReport(receiptPath),
    scene = await regularReport(scenePath),
    prepared = object(
      await readMechanismJson(join(preparedDirectory, "prepared.receipt.json")),
      preparedDirectory,
    );
  if (
    typeof prepared.compositionPath !== "string" ||
    prepared.projectHash !== loaded.projectHash
  )
    fail(
      "mechanism-stale-preparation",
      "Final source belongs to another episode revision",
      preparedDirectory,
    );
  const compositionPath = await containedSource(
      preparedDirectory,
      prepared.compositionPath,
    ),
    sourceHash = await bytesHash(compositionPath),
    checksums = object(render.checksums, receiptPath),
    outputInfo = await lstat(finalOutput);
  if (
    !outputInfo.isFile() ||
    render.schemaVersion !== "composition-result-1" ||
    render.status !== "rendered" ||
    scene.schemaVersion !== "composition-render-1" ||
    typeof render.outputPath !== "string" ||
    typeof render.sceneManifestPath !== "string" ||
    typeof scene.sourcePath !== "string" ||
    (await containedSource(source, render.outputPath)) !==
      (await realpath(finalOutput)) ||
    (await containedSource(source, render.sceneManifestPath)) !==
      (await realpath(scenePath)) ||
    (await realpath(resolve(source, scene.sourcePath))) !== compositionPath ||
    checksums.output !== (await bytesHash(finalOutput)) ||
    checksums.scene !== (await bytesHash(scenePath)) ||
    checksums.source !== sourceHash ||
    scene.sourceChecksum !== sourceHash
  )
    fail(
      "mechanism-package-final-receipt",
      "Final output, scene and source hashes do not match their render receipt",
      receiptPath,
    );
  const resultPath = join(source, "episode.result.json"),
    episodeResult = await optionalReport(resultPath);
  signal?.throwIfAborted();
  if (
    episodeResult !== undefined &&
    (episodeResult.schemaVersion !== "mechanism-render-result-1" ||
      episodeResult.projectHash !== loaded.projectHash ||
      canonicalMechanismJson(episodeResult.render) !==
        canonicalMechanismJson(render))
  )
    fail(
      "mechanism-package-final-receipt",
      "Final episode result belongs to another project or render",
      resultPath,
    );
  return { render, scene, compositionPath, episodeResult };
}
function reportArtifacts(value: ReportObject, path: string): ReportObject[] {
  if (value.schemaVersion !== "mechanism-command-result-1") return [];
  if (!Array.isArray(value.artifacts) || value.artifacts.length > 100)
    fail(
      "mechanism-package-report",
      "Invalid report artifact declarations",
      path,
    );
  return value.artifacts.map((entry: unknown) => {
    const artifact = object(entry, path);
    if (
      !["complete-result", "full-report"].includes(String(artifact.kind)) ||
      typeof artifact.path !== "string" ||
      artifact.path.length > 2048 ||
      artifact.path.split(/[\\/]/).includes("..") ||
      (artifact.sha256 !== undefined &&
        !/^sha256:[a-f0-9]{64}$/.test(String(artifact.sha256)))
    )
      fail(
        "mechanism-package-report",
        "Only declared complete-result/full-report artifacts can enter the package",
        path,
      );
    return artifact;
  });
}
async function visitReportObjects(
  value: unknown,
  visit: (value: ReportObject) => Promise<void>,
  signal?: AbortSignal,
  depth = 0,
): Promise<void> {
  signal?.throwIfAborted();
  if (depth > 64)
    fail(
      "mechanism-package-report",
      "Report nesting exceeds its budget",
      "report",
    );
  if (Array.isArray(value)) {
    for (const entry of value)
      await visitReportObjects(entry, visit, signal, depth + 1);
  } else if (value !== null && typeof value === "object") {
    const record = value as ReportObject;
    await visit(record);
    for (const entry of Object.values(record))
      await visitReportObjects(entry, visit, signal, depth + 1);
  }
}
/** Resolve only explicitly declared report artifacts; arbitrary JSON paths never grant copy access. */
async function copyOutputReports(
  stage: string,
  finalOutput: string,
  loaded: LoadedMechanismEpisode,
  preparedDirectory: string,
  register: RegisterFile,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const source = dirname(finalOutput),
    evidence = await verifyFinalEvidence(
      finalOutput,
      preparedDirectory,
      loaded,
      signal,
    ),
    plans = new Map<string, PackageReportPlan>(),
    plansByHash = new Map<string, PackageReportPlan>(),
    aliases = new Map<string, string>(),
    roots: [string, string][] = [];
  for (const [path, target] of [
    [dirname(loaded.sourcePath), "."],
    [preparedDirectory, "prepared"],
    [source, "."],
  ] as [string, string][])
    for (const root of [resolve(path), await realpath(path)])
      roots.push([root, target]);
  roots.sort((a, b) => b[0].length - a[0].length);
  for (const [path, target] of [
    [loaded.sourcePath, "episode.json"],
    [finalOutput, "episode.mp4"],
    [
      evidence.compositionPath,
      join("prepared", basename(evidence.compositionPath)),
    ],
  ] as [string, string][])
    for (const alias of [resolve(path), await realpath(path)])
      aliases.set(alias, target);
  for (const dependency of loaded.episode.dependencies)
    aliases.set(loaded.dependencyPaths[dependency.id]!, dependency.path);
  async function add(path: string, target: string, expected?: unknown) {
    signal?.throwIfAborted();
    const snapshot = await reportSnapshot(path),
      value = snapshot.value,
      actual = await realpath(path),
      originalHash = snapshot.sha256;
    if (expected !== undefined && originalHash !== expected)
      fail(
        "mechanism-package-hash",
        "Declared report changed from its receipt hash",
        path,
      );
    if (!reportSchemas.has(String(value.schemaVersion)))
      fail(
        "mechanism-package-report",
        "Unsupported declared report schema",
        path,
      );
    if (
      typeof value.projectHash === "string" &&
      value.projectHash !== loaded.projectHash
    )
      fail(
        "mechanism-package-final-receipt",
        "Declared report belongs to another project revision",
        path,
      );
    if (!plans.has(actual)) {
      if (plans.size >= 32)
        fail(
          "mechanism-package-report",
          "Report closure exceeds 32 files",
          path,
        );
      const plan = plansByHash.get(originalHash) ?? {
        target,
        value,
        originalHash,
      };
      plans.set(actual, plan);
      plansByHash.set(originalHash, plan);
    }
    const plan = plans.get(actual)!;
    if (plan.originalHash !== originalHash)
      fail(
        "mechanism-package-hash",
        "Report changed while resolving its declared artifacts",
        path,
      );
    aliases.set(resolve(path), plan.target);
    aliases.set(actual, plan.target);
    return actual;
  }
  await add(`${finalOutput}.scene.json`, "episode.mp4.scene.json");
  await add(`${finalOutput}.result.json`, "episode.mp4.result.json");
  if (evidence.episodeResult)
    await add(join(source, "episode.result.json"), "episode.result.json");
  if (await optionalReport(join(source, "project.summary.json")))
    await add(join(source, "project.summary.json"), "project.summary.json");
  for (const plan of plans.values())
    await visitReportObjects(
      plan.value,
      async (record) => {
        for (const artifact of reportArtifacts(record, plan.target)) {
          const path = String(artifact.path),
            absolute = resolve(source, path),
            internal =
              !isAbsolute(path) ||
              relative(await realpath(source), await realpath(absolute)).split(
                sep,
              )[0] !== "..";
          if (!internal && artifact.sha256 === undefined)
            fail(
              "mechanism-package-report",
              "External reports require their declared content hash",
              path,
            );
          const actual = internal
              ? await containedSource(source, path)
              : absolute,
            hash = await bytesHash(actual);
          await add(
            absolute,
            plans.get(await realpath(actual))?.target ??
              join("reports", `${hash.slice(7)}.json`),
            artifact.sha256,
          );
        }
      },
      signal,
    );
  function relocate(value: unknown): unknown {
    if (typeof value === "string") {
      const exact = aliases.get(value);
      if (exact) return exact;
      for (const [old, target] of roots)
        if (value === old || value.startsWith(`${old}${sep}`))
          return join(target, relative(old, value));
      return value;
    }
    if (Array.isArray(value)) return value.map(relocate);
    if (value !== null && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .filter(
            ([key]) =>
              !["cacheEntryDirectory", "attemptDirectory"].includes(key),
          )
          .map(([key, entry]) => [key, relocate(entry)]),
      );
    return value;
  }
  const portableSourceHash = await bytesHash(
    join(stage, aliases.get(evidence.compositionPath)!),
  );
  async function write(actual: string): Promise<string> {
    signal?.throwIfAborted();
    const plan = plans.get(actual)!;
    if (plan.writtenHash) return plan.writtenHash;
    if (plan.writing)
      fail(
        "mechanism-package-report",
        "Report artifact references form a cycle",
        plan.target,
      );
    plan.writing = true;
    if ((await bytesHash(actual)) !== plan.originalHash)
      fail(
        "mechanism-package-hash",
        "Report changed before package publication",
        plan.target,
      );
    await visitReportObjects(
      plan.value,
      async (record) => {
        for (const artifact of reportArtifacts(record, plan.target)) {
          const referred = await realpath(
            resolve(source, String(artifact.path)),
          );
          artifact.sha256 = await write(referred);
        }
        if (record.schemaVersion === "composition-render-1") {
          record.packageRelocation = {
            originalSourceSha256: record.sourceChecksum,
            cachePaths:
              "omitted; regenerate from the portable native composition",
          };
          record.sourceChecksum = portableSourceHash;
          // Cached decoder resources remain provenance, without pretending their paths are delivered dependencies.
          if (record.assetPaths !== undefined) {
            const paths = object(record.assetPaths, plan.target);
            const delivered: [string, unknown][] = [];
            for (const [id, path] of Object.entries(paths)) {
              signal?.throwIfAborted();
              if (typeof path !== "string") continue;
              const portable = relocate(path);
              if (typeof portable !== "string" || isAbsolute(portable))
                continue;
              try {
                if ((await lstat(inside(stage, portable))).isFile())
                  delivered.push([id, portable]);
              } catch (error) {
                if (
                  !(
                    error !== null &&
                    typeof error === "object" &&
                    "code" in error &&
                    error.code === "ENOENT"
                  )
                )
                  throw error;
              }
            }
            record.assetPaths = Object.fromEntries(delivered);
          }
        }
        if (record.schemaVersion === "composition-result-1") {
          const checksums = object(record.checksums, plan.target);
          record.packageRelocation = {
            originalSourceSha256: checksums.source,
            originalSceneSha256: checksums.scene,
          };
          checksums.source = portableSourceHash;
          checksums.scene = await write(
            await realpath(`${finalOutput}.scene.json`),
          );
        }
      },
      signal,
    );
    signal?.throwIfAborted();
    await writeMechanismJson(join(stage, plan.target), relocate(plan.value));
    await register(plan.target, "final-report");
    plan.writtenHash = await bytesHash(join(stage, plan.target));
    plan.writing = false;
    return plan.writtenHash;
  }
  for (const actual of plans.keys()) await write(actual);
}
async function verifyReportReferences(
  root: string,
  files: PackageFile[],
  signal?: AbortSignal,
) {
  const listed = new Map(files.map((file) => [file.path, file.sha256]));
  for (const file of files.filter((entry) => entry.role === "final-report")) {
    signal?.throwIfAborted();
    const value = await regularReport(await containedSource(root, file.path));
    await visitReportObjects(
      value,
      async (record) => {
        for (const artifact of reportArtifacts(record, file.path)) {
          const path = String(artifact.path);
          if (isAbsolute(path) || listed.get(path) !== artifact.sha256)
            fail(
              "mechanism-package-report",
              "Report artifact is missing from the package or has a stale hash",
              path,
            );
          await containedSource(root, path);
        }
      },
      signal,
    );
  }
}
