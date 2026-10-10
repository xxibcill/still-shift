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
import { passageDiagnostics } from "../../../renderer-core/src/passage-diagnostics.ts";
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
type DependencyStatus = {
  id: string;
  path: string;
  sha256: string;
  hashValid: boolean;
  valid: boolean;
};
type SupportedInputs = {
  dependencies: DependencyStatus[];
  findings: MechanismFinding[];
  dependencyPaths: Record<string, string>;
  scene?: MechanismScene;
  fontDiagnostics: FontValidationDiagnostic[];
  fontAxes: NonNullable<LoadedMechanismEpisode["fontAxes"]>;
  audioMetadata?: NonNullable<LoadedMechanismEpisode["audioMetadata"]>;
};
function inputFindings(error: unknown, path: string): MechanismFinding[] {
  if (error instanceof AnimationEngineError)
    return [
      {
        code: String(
          error.context?.diagnosticCode ?? "mechanism-dependency-unreadable",
        ),
        path: String(error.context?.path ?? path),
        message: error.message,
      },
    ];
  if (!(error instanceof Error) || error.name !== "PassageError")
    return [
      {
        code: "mechanism-dependency-unreadable",
        path,
        message: "Cannot read dependency bytes",
      },
    ];
  return passageDiagnostics(error).map((diagnostic) => ({
    code: diagnostic.code,
    path: diagnostic.path ?? path,
    message: diagnostic.message,
    ...(diagnostic.frame === undefined ? {} : { frame: diagnostic.frame }),
  }));
}
function parseSceneBytes(bytes: Uint8Array, path: string) {
  if (bytes.byteLength > 32 * 1024 * 1024)
    failure("mechanism-source-budget", "Source exceeds 32 MiB", path);
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch (cause) {
    failure(
      "mechanism-source-unreadable",
      "Cannot read valid mechanism JSON",
      path,
      cause,
    );
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion !== "mechanism-scene-1"
  )
    return {
      findings: [
        {
          code: "mechanism-scene-version",
          path: `${path}#/schemaVersion`,
          message: `Unsupported scene version ${String(value.schemaVersion).slice(0, 128)}; expected mechanism-scene-1`,
        },
      ],
    };
  const parsed = MechanismSceneSchema.safeParse(value);
  if (!parsed.success)
    return {
      findings: parsed.error.issues.map((issue) => ({
        code:
          (issue as { params?: { diagnosticCode?: string } }).params
            ?.diagnosticCode ?? "mechanism-scene-schema",
        path: `${path}#/${issue.path.join("/")}`,
        message: issue.message,
      })),
    };
  const scene = parsed.data;
  return {
    scene,
    findings:
      mechanismContentHash(scene.geometry) === scene.geometrySha256
        ? []
        : [
            {
              code: "mechanism-geometry-hash",
              path: `${path}#/geometrySha256`,
              message: "Geometry hash does not match resolved mesh data",
            },
          ],
  };
}
function sceneReferenceFindings(
  episode: MechanismEpisode,
  scene: MechanismScene,
): MechanismFinding[] {
  const anchors = new Set(scene.anchors.map((anchor) => anchor.id));
  const findings: MechanismFinding[] = [];
  for (const shot of episode.shots)
    for (const label of shot.labels)
      for (const property of ["anchor", "proofTarget"] as const)
        if (label[property] && !anchors.has(label[property]!))
          findings.push({
            code: "mechanism-anchor-reference",
            path: `shots.${shot.id}.labels.${label.id}.${property}`,
            message: `Unknown anchor ${label[property]}`,
          });
  return findings;
}
function fontTextRuns(episode: MechanismEpisode, fontId: string) {
  const runs = episode.shots.flatMap((shot) =>
    shot.labels
      .filter((label) => (label.font ?? episode.font) === fontId)
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
  if (fontId === episode.font)
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
  return runs;
}
async function readAudioCapability(
  path: string,
): Promise<NonNullable<LoadedMechanismEpisode["audioMetadata"]>> {
  let value: {
    streams: {
      sample_rate?: string;
      channels?: number;
      duration_ts?: number;
      time_base?: string;
      codec_name?: string;
    }[];
  };
  try {
    const result = await runProcess(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "a",
        "-show_entries",
        "stream=sample_rate,channels,duration_ts,time_base,codec_name",
        "-of",
        "json",
        path,
      ],
      { signal: AbortSignal.timeout(15_000), maxBuffer: 256 * 1024 },
    );
    value = JSON.parse(result.stdout) as typeof value;
  } catch (cause) {
    failure(
      "mechanism-audio-unreadable",
      "Cannot inspect supplied audio capability",
      path,
      cause,
    );
  }
  const stream = value.streams?.[0];
  if (
    value.streams?.length !== 1 ||
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
      path,
    );
  return {
    sampleRate: 48000,
    sampleCount: stream.duration_ts!,
    channels: stream.channels as 1 | 2,
  };
}
async function inspectSupportedDependency(
  episode: MechanismEpisode,
  dependency: MechanismEpisode["dependencies"][number],
  path: string,
  bytes: Uint8Array,
  inputs: SupportedInputs,
) {
  if (dependency.type === "scene") {
    const result = parseSceneBytes(bytes, path);
    inputs.findings.push(...result.findings);
    if (dependency.id === episode.scene && result.scene)
      inputs.scene = result.scene;
  }
  if (dependency.type === "font") {
    const identity = readFontIdentity(Uint8Array.from(bytes).buffer);
    inputs.fontAxes[dependency.id] = identity.axes;
    const diagnostics = inspectFontText(
      identity,
      { ...dependency, weight: dependency.weight ?? "600" },
      fontTextRuns(episode, dependency.id),
      { profile: dependency.profile },
    );
    inputs.fontDiagnostics.push(...diagnostics);
    inputs.findings.push(
      ...diagnostics
        .filter((diagnostic) => diagnostic.severity === "error")
        .map((diagnostic) => ({
          ...diagnostic,
          path: diagnostic.path ?? dependency.path,
        })),
    );
  }
  if (dependency.type === "audio") {
    const metadata = await readAudioCapability(path);
    if (dependency.id === episode.audio) inputs.audioMetadata = metadata;
  }
}
/** Hash and supported-input checks share one read-only pass. Invalid identities are never parsed as trusted inputs. */
async function inspectSupportedMechanismInputs(
  sourcePath: string,
  episode: MechanismEpisode,
): Promise<SupportedInputs> {
  const inputs: SupportedInputs = {
    dependencies: [],
    findings: [],
    dependencyPaths: {},
    fontDiagnostics: [],
    fontAxes: {},
  };
  for (const dependency of episode.dependencies) {
    try {
      const path = await resolveMechanismDependency(sourcePath, dependency);
      const bytes = await readFile(path);
      const digest = mechanismHash(bytes);
      const hashValid = digest === dependency.sha256;
      const status: DependencyStatus = {
        id: dependency.id,
        path: dependency.path,
        sha256: digest,
        hashValid,
        valid: hashValid,
      };
      inputs.dependencies.push(status);
      if (!hashValid) {
        inputs.findings.push({
          code: "mechanism-dependency-hash",
          path: `dependencies.${dependency.id}.sha256`,
          message: `Expected ${dependency.sha256}, received ${digest}`,
        });
        continue;
      }
      inputs.dependencyPaths[dependency.id] = path;
      const before = inputs.findings.length;
      try {
        await inspectSupportedDependency(
          episode,
          dependency,
          path,
          bytes,
          inputs,
        );
      } catch (error) {
        inputs.findings.push(
          ...inputFindings(error, `dependencies.${dependency.id}.path`),
        );
      }
      status.valid = inputs.findings.length === before;
    } catch (error) {
      inputs.findings.push(...inputFindings(error, dependency.path));
    }
  }
  if (inputs.scene)
    inputs.findings.push(...sceneReferenceFindings(episode, inputs.scene));
  return inputs;
}
async function readSupportedMechanismInputs(path: string) {
  const sourcePath = resolve(path);
  const episode = parseMechanismEpisode(
    await readMechanismJson(sourcePath),
    sourcePath,
  );
  return {
    sourcePath,
    episode,
    inputs: await inspectSupportedMechanismInputs(sourcePath, episode),
  };
}
/** Read-only: no render/cache/source changes, and all independent findings remain available. */
export async function mechanismDependencyReport(path: string) {
  const { sourcePath, episode, inputs } =
    await readSupportedMechanismInputs(path);
  return {
    schemaVersion: "mechanism-dependency-report-1" as const,
    sourcePath,
    projectHash: mechanismContentHash(episode),
    valid: inputs.findings.length === 0,
    dependencies: inputs.dependencies,
    findings: inputs.findings,
    fontDiagnostics: inputs.fontDiagnostics,
  };
}
export async function readMechanismEpisode(
  path: string,
): Promise<LoadedMechanismEpisode> {
  const { sourcePath, episode, inputs } =
    await readSupportedMechanismInputs(path);
  const first = inputs.findings[0];
  if (first)
    failure(first.code, first.message, first.path, undefined, {
      diagnosticsJson: JSON.stringify(inputs.findings),
    });
  if (!inputs.scene)
    failure(
      "mechanism-scene-unavailable",
      "Supported scene input is unavailable",
      episode.scene,
    );
  return {
    episode,
    scene: inputs.scene,
    sourcePath,
    projectHash: mechanismContentHash(episode),
    dependencyPaths: inputs.dependencyPaths,
    fontDiagnostics: inputs.fontDiagnostics,
    fontAxes: inputs.fontAxes,
    ...(inputs.audioMetadata ? { audioMetadata: inputs.audioMetadata } : {}),
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
