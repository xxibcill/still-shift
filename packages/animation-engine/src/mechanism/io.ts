import { canonicalMechanismJson } from "../../../renderer-core/src/mechanism/index.ts";
export { canonicalMechanismJson };
import { createHash, randomUUID } from "node:crypto";
import {
  readFile,
  realpath,
  stat,
  mkdir,
  writeFile,
  rename,
  rm,
  link,
} from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute, join } from "node:path";
import {
  AnimationEngineError,
  MechanismEpisodeSchema,
  MechanismSceneSchema,
  type MechanismEpisode,
  type MechanismScene,
} from "@still-shift/scene-contract";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { acquireArtifactLock } from "@still-shift/execution-runtime/locks";
import {
  inspectFontText,
  readFontIdentity,
  type FontValidationDiagnostic,
} from "../../../renderer-core/src/font-identity.ts";

export const mechanismHash = (bytes: string | Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
export const mechanismContentHash = (value: unknown) =>
  mechanismHash(canonicalMechanismJson(value));
export type LoadedMechanismEpisode = {
  episode: MechanismEpisode;
  scene: MechanismScene;
  projectHash: string;
  sourcePath: string;
  dependencyPaths: Record<string, string>;
  fontDiagnostics: FontValidationDiagnostic[];
  fontAxes?: Record<string, ReturnType<typeof readFontIdentity>["axes"]>;
  audioMetadata?: { sampleRate: 48000; sampleCount: number; channels: 1 | 2 };
};
export type MechanismFinding = {
  code: string;
  path: string;
  message: string;
  frame?: number;
  shot?: string;
  label?: string;
  property?: string;
};
function failure(
  code: string,
  message: string,
  path: string,
  cause?: unknown,
  details?: Record<string, string>,
): never {
  throw new AnimationEngineError(
    "SCENE_INVALID",
    message,
    {
      stage: "mechanism-load",
      diagnosticCode: code,
      path,
      ...details,
      nextAction:
        "episode deps --input <episode.json>; repair the located dependency or authored field",
    },
    cause === undefined ? undefined : { cause },
  );
}
export async function readMechanismJson(path: string): Promise<unknown> {
  try {
    const info = await stat(path);
    if (info.size > 32 * 1024 * 1024)
      failure("mechanism-source-budget", "Source exceeds 32 MiB", path);
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (cause) {
    if (cause instanceof AnimationEngineError) throw cause;
    failure(
      "mechanism-source-unreadable",
      "Cannot read valid mechanism JSON",
      path,
      cause,
    );
  }
}
export function parseMechanismEpisode(
  value: unknown,
  path = "episode.json",
): MechanismEpisode {
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion !== "mechanism-episode-1"
  )
    failure(
      "mechanism-version",
      `Unsupported episode version ${String(value.schemaVersion).slice(0, 128)}; expected mechanism-episode-1`,
      `${path}#/schemaVersion`,
    );
  const parsed = MechanismEpisodeSchema.safeParse(value);
  if (!parsed.success)
    failure(
      "mechanism-schema",
      parsed.error.issues[0]?.message ?? "Invalid episode",
      `${path}#/${parsed.error.issues[0]?.path.join("/") ?? ""}`,
      parsed.error,
      { diagnosticsJson: JSON.stringify(parsed.error.issues) },
    );
  return parsed.data;
}
/** A dependency can be relocated, but cannot escape the portable project root. */
export async function resolveMechanismDependency(
  sourcePath: string,
  dependency: MechanismEpisode["dependencies"][number],
): Promise<string> {
  const root = await realpath(dirname(sourcePath));
  if (isAbsolute(dependency.path))
    failure(
      "mechanism-dependency-path",
      "Use project-relative dependency paths",
      `${sourcePath}#/dependencies/${dependency.id}/path`,
    );
  let actual: string;
  try {
    actual = await realpath(resolve(root, dependency.path));
  } catch (cause) {
    failure(
      "mechanism-dependency-missing",
      `Missing dependency ${dependency.id}`,
      dependency.path,
      cause,
    );
  }
  const rel = relative(root, actual);
  if (
    rel === ".." ||
    rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(rel)
  )
    failure(
      "mechanism-dependency-path",
      "Dependency resolves outside the project",
      dependency.path,
    );
  return actual;
}
/** Read-only: no render/cache/source changes, and all findings remain available. */
export async function mechanismDependencyReport(path: string) {
  const sourcePath = resolve(path),
    episode = parseMechanismEpisode(
      await readMechanismJson(sourcePath),
      sourcePath,
    );
  const findings: MechanismFinding[] = [],
    dependencies: {
      id: string;
      path: string;
      sha256: string;
      valid: boolean;
    }[] = [];
  for (const dependency of episode.dependencies) {
    try {
      const actual = await resolveMechanismDependency(sourcePath, dependency);
      const digest = mechanismHash(await readFile(actual));
      const valid = digest === dependency.sha256;
      dependencies.push({
        id: dependency.id,
        path: dependency.path,
        sha256: digest,
        valid,
      });
      if (!valid)
        findings.push({
          code: "mechanism-dependency-hash",
          path: `dependencies.${dependency.id}.sha256`,
          message: `Expected ${dependency.sha256}, received ${digest}`,
        });
    } catch (error) {
      const context =
        error instanceof AnimationEngineError ? error.context : {};
      findings.push({
        code: String(context?.diagnosticCode ?? "mechanism-dependency-missing"),
        path: dependency.path,
        message:
          error instanceof Error ? error.message : "Dependency unavailable",
      });
    }
  }
  return {
    schemaVersion: "mechanism-dependency-report-1" as const,
    sourcePath,
    projectHash: mechanismContentHash(episode),
    valid: findings.length === 0,
    dependencies,
    findings,
  };
}
export async function readMechanismEpisode(
  path: string,
): Promise<LoadedMechanismEpisode> {
  const sourcePath = resolve(path),
    episode = parseMechanismEpisode(
      await readMechanismJson(sourcePath),
      sourcePath,
    );
  const report = await mechanismDependencyReport(sourcePath);
  if (!report.valid)
    failure(
      report.findings[0]!.code,
      report.findings[0]!.message,
      report.findings[0]!.path,
    );
  const dependencyPaths: Record<string, string> = {};
  for (const dependency of episode.dependencies)
    dependencyPaths[dependency.id] = await resolveMechanismDependency(
      sourcePath,
      dependency,
    );
  const scenePath = dependencyPaths[episode.scene]!;
  const parsed = MechanismSceneSchema.safeParse(
    await readMechanismJson(scenePath),
  );
  if (!parsed.success)
    failure(
      "mechanism-scene-schema",
      parsed.error.issues[0]?.message ?? "Invalid scene",
      `${scenePath}#/${parsed.error.issues[0]?.path.join("/")}`,
      parsed.error,
      { diagnosticsJson: JSON.stringify(parsed.error.issues) },
    );
  const scene = parsed.data;
  if (mechanismContentHash(scene.geometry) !== scene.geometrySha256)
    failure(
      "mechanism-geometry-hash",
      "Geometry hash does not match resolved mesh data",
      `${scenePath}#/geometrySha256`,
    );
  const anchors = new Set(scene.anchors.map((anchor) => anchor.id));
  for (const shot of episode.shots)
    for (const label of shot.labels)
      if (!anchors.has(label.anchor))
        failure(
          "mechanism-anchor-reference",
          `Unknown anchor ${label.anchor}`,
          `shots.${shot.id}.labels.${label.id}.anchor`,
        );
  const fontDiagnostics: FontValidationDiagnostic[] = [];
  const fontAxes: NonNullable<LoadedMechanismEpisode["fontAxes"]> = {};
  for (const dependency of episode.dependencies.filter(
    (item) => item.type === "font",
  )) {
    const bytes = await readFile(dependencyPaths[dependency.id]!);
    const identity = readFontIdentity(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    fontAxes[dependency.id] = identity.axes;
    const runs = episode.shots.flatMap((shot) =>
      shot.labels
        .filter((label) => (label.font ?? episode.font) === dependency.id)
        .flatMap((label) => [
          {
            text: label.text,
            node: label.id,
            path: `shots.${shot.id}.labels.${label.id}.text`,
            frame: label.readingInterval.startFrame,
          },
          ...(label.qualification
            ? [
                {
                  text: label.qualification,
                  node: label.id,
                  path: `shots.${shot.id}.labels.${label.id}.qualification`,
                  frame: label.readingInterval.startFrame,
                },
              ]
            : []),
        ]),
    );
    if (dependency.id === episode.font)
      runs.push(
        ...episode.captions.map((caption) => ({
          text: caption.text,
          node: caption.id,
          path: `captions.${caption.id}.text`,
          frame: caption.startFrame,
        })),
        {
          text: "0123456789",
          node: "tape-graduations",
          path: "scene.materials.tape-graduations",
          frame: 0,
        },
      );
    fontDiagnostics.push(
      ...inspectFontText(
        identity,
        { ...dependency, weight: dependency.weight ?? "600" },
        runs,
        { profile: dependency.profile ?? "strict" },
      ),
    );
  }
  const fontFailure = fontDiagnostics.find((item) => item.severity === "error");
  if (fontFailure)
    failure(
      fontFailure.code,
      fontFailure.message,
      fontFailure.path ?? "font",
      undefined,
      { diagnosticsJson: JSON.stringify(fontDiagnostics) },
    );
  let audioMetadata: LoadedMechanismEpisode["audioMetadata"];
  if (episode.audio) {
    const audioPath = dependencyPaths[episode.audio]!;
    const result = await runProcess("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a",
      "-show_entries",
      "stream=sample_rate,channels,duration_ts,time_base,codec_name",
      "-of",
      "json",
      audioPath,
    ]);
    const value = JSON.parse(result.stdout) as {
      streams: {
        sample_rate?: string;
        channels?: number;
        duration_ts?: number;
        time_base?: string;
        codec_name?: string;
      }[];
    };
    const stream = value.streams[0];
    if (
      value.streams.length !== 1 ||
      stream?.sample_rate !== "48000" ||
      ![1, 2].includes(stream.channels ?? 0) ||
      stream.time_base !== "1/48000" ||
      !Number.isSafeInteger(stream.duration_ts) ||
      stream.duration_ts! <= 0 ||
      !stream.codec_name?.startsWith("pcm_")
    )
      failure(
        "mechanism-audio-clock",
        "MS1 requires a single supplied 48 kHz PCM narration/master with an exact sample clock",
        audioPath,
      );
    audioMetadata = {
      sampleRate: 48000,
      sampleCount: stream.duration_ts!,
      channels: stream.channels as 1 | 2,
    };
  }
  return {
    episode,
    scene,
    projectHash: mechanismContentHash(episode),
    sourcePath,
    dependencyPaths,
    fontDiagnostics,
    fontAxes,
    ...(audioMetadata ? { audioMetadata } : {}),
  };
}
export async function writeMechanismJson(
  path: string,
  value: unknown,
  { replace = false }: { replace?: boolean } = {},
) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.pending-${randomUUID()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      flag: "wx",
    });
    if (replace) await rename(temporary, path);
    else {
      await link(temporary, path);
      await rm(temporary);
    }
  } catch (cause) {
    await rm(temporary, { force: true });
    throw cause;
  }
}
export async function saveMechanismEpisode(
  project: MechanismEpisode,
  path: string,
  base?: { revision: number; hash: string },
) {
  const destination = resolve(path),
    validated = parseMechanismEpisode(project, destination);
  const lock = await acquireArtifactLock(
    `${destination}.lock`,
    dirname(destination),
  );
  try {
    if (base) {
      const current = parseMechanismEpisode(
        await readMechanismJson(destination),
        destination,
      );
      if (
        current.revision !== base.revision ||
        mechanismContentHash(current) !== base.hash
      )
        failure(
          "mechanism-stale-revision",
          "Episode changed since the supplied base",
          destination,
        );
    }
    await writeMechanismJson(destination, validated, { replace: !!base });
    return {
      schemaVersion: "mechanism-save-result-1" as const,
      path: destination,
      revision: validated.revision,
      projectHash: mechanismContentHash(validated),
    };
  } finally {
    await lock();
  }
}
export type MechanismPatch = {
  baseRevision: number;
  baseHash: string;
  operations: {
    shot: string;
    label: string;
    property: "text" | "position" | "fontSize" | "qualification";
    value: unknown;
  }[];
};
export async function patchMechanismEpisode(
  path: string,
  patch: MechanismPatch,
) {
  if (
    patch.operations.length < 1 ||
    patch.operations.length > 32 ||
    Buffer.byteLength(JSON.stringify(patch)) > 16384
  )
    failure(
      "mechanism-patch-budget",
      "Patch supports 1..32 operations and 16 KiB",
      path,
    );
  const loaded = await readMechanismEpisode(path);
  if (
    loaded.episode.revision !== patch.baseRevision ||
    loaded.projectHash !== patch.baseHash
  )
    failure(
      "mechanism-stale-revision",
      "Stale patch: inspect current revision/hash",
      path,
    );
  const next = structuredClone(loaded.episode),
    changedPaths: string[] = [],
    affectedShots = new Set<string>();
  for (const operation of patch.operations) {
    if (
      !["text", "position", "fontSize", "qualification"].includes(
        operation.property,
      )
    )
      failure("mechanism-patch-property", "Unsupported scoped property", path);
    const shot = next.shots.find((item) => item.id === operation.shot),
      label = shot?.labels.find((item) => item.id === operation.label);
    if (!shot || !label)
      failure(
        "mechanism-patch-target",
        "Unknown stable shot/label target",
        `${operation.shot}/${operation.label}`,
      );
    Object.assign(label, { [operation.property]: operation.value });
    changedPaths.push(
      `shots.${shot.id}.labels.${label.id}.${operation.property}`,
    );
    affectedShots.add(shot.id);
  }
  next.revision++;
  parseMechanismEpisode(next, path);
  // Exact-copy validation happens before publication: unsupported glyph edits leave source untouched.
  const scratch = join(
    dirname(resolve(path)),
    `.episode-validation-${randomUUID()}.json`,
  );
  try {
    await writeMechanismJson(scratch, next);
    await readMechanismEpisode(scratch);
  } finally {
    await rm(scratch, { force: true });
  }
  const saved = await saveMechanismEpisode(next, path, {
    revision: patch.baseRevision,
    hash: patch.baseHash,
  });
  return {
    ...saved,
    schemaVersion: "mechanism-patch-result-1" as const,
    changedPaths,
    affectedShots: [...affectedShots],
    cacheEffects: {
      geometry: "reuse",
      cleanPlates: "reuse",
      sidecars: "reuse",
      overlays: "invalidate-affected-shots",
      audio: "reuse",
    },
  };
}
