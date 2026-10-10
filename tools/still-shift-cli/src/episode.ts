import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import {
  AnimationEngineError,
  failureDiagnostic,
  sanitizeDiagnosticText,
  sanitizeDiagnosticContext,
  MechanismGeometrySchema,
  MechanismEpisodeSchema,
  MechanismSceneSchema,
  MechanismSidecarSchema,
  MechanismFrameResultSchema,
  MechanismRouteSchema,
  MechanismRouteSelectionSchema,
  Native3DSourceSchema,
  SolidSceneSchema,
  SolidGeometrySchema,
  Native3DBindingSchema,
  NativeObservedFrameSchema,
  NativeObservedOutputFrameSchema,
  NativeAppearanceCodeIdentitySchema,
  CompositionPreparedNative3DSchema,
  NATIVE3D_VARIANT_LIMIT,
  NATIVE3D_OBSERVATION_LIMITS,
} from "@still-shift/scene-contract";
import {
  NativePreparedMechanismEpisodeSchema,
  NATIVE_MECHANISM_PROFILE,
} from "../../../packages/animation-engine/src/mechanism/native-lifecycle.ts";
import { selectMechanismRoute } from "../../../packages/animation-engine/src/mechanism/route.ts";
import {
  mechanismDependencyReport,
  patchMechanismEpisode,
  readMechanismEpisode,
  saveMechanismEpisode,
  writeMechanismJson,
} from "../../../packages/animation-engine/src/mechanism/io.ts";
import type { LoadedMechanismEpisode } from "../../../packages/animation-engine/src/mechanism/io.ts";
import { createTapeHookProject } from "../../../packages/animation-engine/src/mechanism/tape-hook.ts";
import {
  checkMechanismEpisode,
  compileMechanismEpisode,
  packageMechanismEpisode,
  prepareMechanismEpisode,
  previewMechanismEpisode,
  renderMechanismEpisode,
} from "../../../packages/animation-engine/src/mechanism/lifecycle.ts";
import {
  createMechanismCommandReceipt,
  MECHANISM_COMMANDS,
  MECHANISM_RESPONSE_LIMITS,
  MechanismCommandReceiptSchema,
  MechanismCommandSchema,
  MechanismPatchRequestSchema,
} from "../../../packages/animation-engine/src/mechanism/protocol.ts";
import type {
  MechanismCommand,
  MechanismReceiptArtifact,
  MechanismReceiptInput,
  MechanismReceiptOptions,
  MechanismReceiptRow,
} from "../../../packages/animation-engine/src/mechanism/protocol.ts";

import {
  EPISODE_NATIVE_INSPECTION_VERSION,
  EPISODE_NATIVE_INSPECTION_SELECTORS,
  EpisodeNativeInspectionSelectionSchema,
  inspectEpisodeNativeMetadata,
  parseEpisodeNativeInspectionSelection,
} from "./episode-native-inspection.ts";

export interface EpisodeCliIo {
  stdout: (value: string) => void;
  stderr: (value: string) => void;
  stdin?: () => Promise<string>;
}
const commonFlags = ["json", "report", "offset", "limit"];
const commandFlags: Record<MechanismCommand, readonly string[]> = {
  discover: [],
  schema: ["kind", "output"],
  inspect: ["input", "shot", "native", "part", "anchor", "material", "rig"],
  validate: ["input"],
  deps: ["input"],
  save: ["input", "output", "base-revision", "base-hash"],
  patch: ["input", "request"],
  prepare: ["input", "output-dir", "cache-dir", "route"],
  compile: ["input", "output-dir", "cache-dir", "route"],
  preview: ["input", "output-dir", "cache-dir", "frame", "route"],
  render: ["input", "output-dir", "cache-dir", "backend", "route"],
  check: ["input", "prepared-dir", "final-output", "route"],
  package: ["input", "output-dir", "prepared-dir", "final-output", "route"],
  "init-tape-hook": ["output-dir", "font", "font-license", "audio", "captions"],
  summary: ["input"],
};
const episodeSchemas = {
  geometry: MechanismGeometrySchema,
  episode: MechanismEpisodeSchema,
  scene: MechanismSceneSchema,
  sidecar: MechanismSidecarSchema,
  frame: MechanismFrameResultSchema,
  patch: MechanismPatchRequestSchema,
  receipt: MechanismCommandReceiptSchema,
  "native-source": Native3DSourceSchema,
  "solid-scene": SolidSceneSchema,
  "solid-geometry": SolidGeometrySchema,
  "native-binding": Native3DBindingSchema,
  "native-observed-frame": NativeObservedFrameSchema,
  "native-observed-output-frame": NativeObservedOutputFrameSchema,
  "native-prepared-receipt": NativePreparedMechanismEpisodeSchema,
  "native-prepared-transport": CompositionPreparedNative3DSchema,
  "native-appearance-identity": NativeAppearanceCodeIdentitySchema,
  "route-selection": MechanismRouteSelectionSchema,
  "native-inspection-selection": EpisodeNativeInspectionSelectionSchema,
};
function parseFlags(
  command: MechanismCommand,
  args: string[],
): Map<string, string> {
  const allowed = new Set([...commonFlags, ...commandFlags[command]]),
    flags = new Map<string, string>();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]!;
    if (
      !flag.startsWith("--") ||
      !allowed.has(flag.slice(2)) ||
      flags.has(flag.slice(2))
    )
      throw cliError(`Unknown or duplicate episode option ${flag}`);
    const name = flag.slice(2);
    if (name === "json") {
      flags.set(name, "true");
      continue;
    }
    const value = args[++index];
    if (value === undefined || value.startsWith("--"))
      throw cliError(`Missing value for ${flag}`);
    flags.set(name, value);
  }
  return flags;
}
function required(flags: Map<string, string>, name: string): string {
  const value = flags.get(name);
  if (!value) throw cliError(`Missing required episode option --${name}`);
  return value;
}
function integer(value: string, name: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0)
    throw cliError(`--${name} requires a nonnegative integer`);
  return number;
}
function cliError(
  message: string,
  code = "mechanism-command",
  path?: string,
): AnimationEngineError {
  return new AnimationEngineError("SCENE_INVALID", message, {
    stage: "episode-command",
    diagnosticCode: code,
    ...(path === undefined ? {} : { path }),
    nextAction: "episode discover; use the listed command and options",
  });
}
function receiptOptions(flags: Map<string, string>): MechanismReceiptOptions {
  const limit = flags.has("limit")
    ? integer(required(flags, "limit"), "limit")
    : undefined;
  if (limit !== undefined && (limit < 1 || limit > 100))
    throw cliError("--limit requires 1..100");
  const reportPath = flags.get("report");
  if (reportPath !== undefined && reportPath.length > 2048)
    throw cliError("--report path exceeds 2048 characters");
  return {
    ...(reportPath === undefined ? {} : { reportPath }),
    ...(flags.has("offset")
      ? { offset: integer(required(flags, "offset"), "offset") }
      : {}),
    ...(limit === undefined ? {} : { limit }),
  };
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
function row(value: unknown): MechanismReceiptRow {
  if (!isRecord(value))
    return {
      value:
        typeof value === "string" ? value : (JSON.stringify(value) ?? "null"),
    };
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      item === null ||
      typeof item === "string" ||
      typeof item === "boolean" ||
      typeof item === "number"
        ? item
        : (JSON.stringify(item) ?? "null"),
    ]),
  );
}
function summarizeLoaded(loaded: LoadedMechanismEpisode): MechanismReceiptRow {
  const { episode, scene } = loaded;
  const route = selectMechanismRoute(episode);
  return {
    episode: episode.id,
    revision: episode.revision,
    projectHash: loaded.projectHash,
    sourcePath: loaded.sourcePath,
    scene: scene.id,
    geometrySha256: scene.geometrySha256,
    width: episode.output.width,
    height: episode.output.height,
    fps: episode.output.fps,
    frameCount: episode.output.frameCount,
    shots: episode.shots.length,
    labels: episode.shots.reduce(
      (count, shot) => count + shot.labels.length,
      0,
    ),
    dependencies: episode.dependencies.length,
    fontDiagnostics: loaded.fontDiagnostics.length,
    "route.sourceRoute": route.sourceRoute,
    "route.effectiveRoute": route.effectiveRoute,
    "route.selectionOrigin": route.selectionOrigin,
  };
}
function inspectItems(
  loaded: LoadedMechanismEpisode,
  shotId?: string,
): MechanismReceiptRow[] {
  const shots =
    shotId === undefined
      ? loaded.episode.shots
      : loaded.episode.shots.filter((shot) => shot.id === shotId);
  if (shotId !== undefined && shots.length === 0)
    throw cliError(`Unknown shot ${shotId}`, "mechanism-shot-reference");
  return [
    ...loaded.episode.dependencies.map((dependency) => ({
      ...row(dependency),
      kind: "dependency",
    })),
    ...shots.flatMap((shot) => [
      {
        kind: "shot",
        id: shot.id,
        purpose: shot.purpose,
        startFrame: shot.startFrame,
        endFrameExclusive: shot.endFrameExclusive,
        rigControls: Object.keys(shot.controls).join(","),
        hiddenParts: shot.hiddenParts.join(","),
      },
      ...shot.labels.map((label) => ({
        ...row(label),
        kind: "label",
        shot: shot.id,
      })),
    ]),
    ...loaded.fontDiagnostics.map((diagnostic) => ({
      ...row(diagnostic),
      kind: "font-diagnostic",
    })),
  ];
}
function resultView(
  command: MechanismCommand,
  result: unknown,
): MechanismReceiptInput {
  const record = isRecord(result) ? result : {};
  const summary: MechanismReceiptRow = {};
  const items: MechanismReceiptRow[] = [],
    artifacts: MechanismReceiptArtifact[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      summary[key] = value;
      if (
        typeof value === "string" &&
        (/Path$|Directory$/.test(key) ||
          ["composition", "manifest", "output"].includes(key)) &&
        value.length > 0
      )
        artifacts.push({ kind: key, path: value });
    } else if (Array.isArray(value)) {
      summary[`${key}Count`] = value.length;
      if (
        [
          "findings",
          "diagnostics",
          "dependencies",
          "fontDiagnostics",
          "changedPaths",
          "affectedShots",
        ].includes(key)
      )
        items.push(...value.map((item) => ({ ...row(item), kind: key })));
    } else if (
      isRecord(value) &&
      (key === "overlayReport" || key === "qualityReport")
    ) {
      const findings = Array.isArray(value.findings)
        ? value.findings
        : Array.isArray(value.diagnostics)
          ? value.diagnostics
          : [];
      summary[`${key}.findings`] = findings.length;
      if (typeof value.layoutAccepted === "boolean")
        summary[`${key}.layoutAccepted`] = value.layoutAccepted;
      if (typeof value.measurement === "string")
        summary[`${key}.measurement`] = value.measurement;
      items.push(...findings.map((item) => ({ ...row(item), kind: key })));
    } else if (isRecord(value) && key === "cacheEffects") {
      for (const [effect, disposition] of Object.entries(value))
        if (typeof disposition === "string")
          summary[`cache.${effect}`] = disposition;
    }
  }
  const checked =
    command === "render" && isRecord(record.check)
      ? resultView("check", record.check)
      : undefined;
  if (checked) {
    for (const [key, value] of Object.entries(checked.summary))
      summary[`check.${key}`] = value;
    items.push(...(checked.items ?? []));
    artifacts.push(...(checked.artifacts ?? []));
  }
  if (isRecord(record.routeSelection))
    for (const key of [
      "sourceRoute",
      "effectiveRoute",
      "selectionOrigin",
    ] as const) {
      const value = record.routeSelection[key];
      if (value === null || typeof value === "string")
        summary[`route.${key}`] = value;
    }
  const renderRecord = isRecord(record.render) ? record.render : record;
  const metrics = isRecord(renderRecord.metrics)
    ? renderRecord.metrics
    : undefined;
  const observed =
    metrics && isRecord(metrics.nativeObservations)
      ? metrics.nativeObservations
      : undefined;
  if (observed) {
    for (const key of [
      "outputFrames",
      "passCount",
      "executionSha256",
      "manifestSha256",
    ] as const)
      if (
        typeof observed[key] === "number" ||
        typeof observed[key] === "string"
      )
        summary[`nativeObservations.${key}`] = observed[key];
    if (
      typeof observed.manifestPath === "string" &&
      typeof observed.manifestSha256 === "string"
    )
      artifacts.push({
        kind: "native-observation-manifest",
        path: observed.manifestPath,
        sha256: observed.manifestSha256,
      });
  }
  const status =
    record.status === "cancelled"
      ? "cancelled"
      : record.status === "failed" ||
          record.valid === false ||
          record.passed === false ||
          record.mechanicalValid === false ||
          checked?.status === "failed" ||
          (isRecord(record.qualityReport) &&
            record.qualityReport.status === "failed") ||
          (isRecord(record.overlayReport) &&
            Array.isArray(record.overlayReport.findings) &&
            record.overlayReport.findings.length > 0)
        ? "failed"
        : "passed";
  return {
    command,
    status,
    summary,
    items,
    artifacts,
    fullResult: result,
    ...(command === "render" && status === "failed"
      ? {
          nextAction:
            "Inspect located findings, apply a patch with the current revision and hash, then render to a fresh output directory.",
        }
      : {}),
  };
}
async function readPatchRequest(path: string, io: EpisodeCliIo) {
  let bytes: string;
  if (path === "-") {
    if (io.stdin) bytes = await io.stdin();
    else {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of process.stdin) {
        const buffer = Buffer.from(chunk as Uint8Array);
        size += buffer.length;
        if (size > MECHANISM_RESPONSE_LIMITS.patchBytes)
          throw cliError("Patch exceeds 16 KiB", "mechanism-patch-budget");
        chunks.push(buffer);
      }
      bytes = Buffer.concat(chunks).toString("utf8");
    }
  } else {
    if ((await stat(path)).size > MECHANISM_RESPONSE_LIMITS.patchBytes)
      throw cliError("Patch exceeds 16 KiB", "mechanism-patch-budget");
    bytes = await readFile(path, "utf8");
  }
  if (Buffer.byteLength(bytes) > MECHANISM_RESPONSE_LIMITS.patchBytes)
    throw cliError("Patch exceeds 16 KiB", "mechanism-patch-budget");
  let value: unknown;
  try {
    value = JSON.parse(bytes) as unknown;
  } catch {
    throw cliError(
      "Patch must contain valid JSON",
      "mechanism-patch-json",
      path,
    );
  }
  if (isRecord(value) && value.schemaVersion !== "mechanism-patch-1")
    throw cliError(
      `Unsupported patch version ${String(value.schemaVersion).slice(0, 128)}; expected mechanism-patch-1`,
      "mechanism-version",
      "schemaVersion",
    );
  return MechanismPatchRequestSchema.parse(value);
}
async function discover(): Promise<MechanismReceiptInput> {
  return {
    command: "discover",
    summary: {
      protocol: "mechanism-command-result-1",
      episodeVersion: "mechanism-episode-1",
      sceneVersion: "mechanism-scene-1",
      geometryVersion: "mechanism-geometry-1",
      evaluatorVersion: "mechanism-evaluator-1",
      preparedVersion: "prepared-mechanism-scene-1",
      sidecarVersion: "mechanism-sidecar-1",
      receiptBytes: 32768,
      receiptItems: 100,
      patchVersion: "mechanism-patch-1",
      routes: "bridge native3d",
      defaultRoute: "bridge",
      routePrecedence:
        "CLI override, authored episode route, bridge default; prepared commands assert the recorded selection",
      nativePreparedVersion: "mechanism-prepared-native-episode-1",
      nativeRenderVersion: "mechanism-native-render-result-1",
      nativeCheckVersion: "mechanism-native-check-result-1",
      nativePackageVersion: "mechanism-native-project-package-1",
      nativeSourceVersions: "mechanism-scene-1 solid-scene-1",
      nativeGeometryVersion: "solid-geometry-1",
      nativeObservationVersion: "native3d-observed-output-frame-1",
      nativeInspectionVersion: EPISODE_NATIVE_INSPECTION_VERSION,
      schemaKinds: Object.keys(episodeSchemas).join(" "),
    },
    items: [
      ...MECHANISM_COMMANDS.map((command) => ({
        command,
        options: commandFlags[command].map((flag) => `--${flag}`).join(" "),
      })),
      {
        kind: "native-route",
        route: "native3d",
        backend: "webgl2",
        profile: NATIVE_MECHANISM_PROFILE,
        workers: 1,
        canvasAllowed: false,
        support:
          "Generic native compositions and E01 tape-hook mechanics; source-only packages have scoped validation and no actual execution acceptance",
      },
      {
        kind: "native-inspection",
        version: EPISODE_NATIVE_INSPECTION_VERSION,
        selectors: EPISODE_NATIVE_INSPECTION_SELECTORS.join(" "),
        filters:
          "--part (parts), --anchor (anchors), --material (materials), --rig (controls); all accepts every ID filter; --shot selects cameras/controls/all",
        scope:
          "Original scene catalogues plus episode-shot camera/control settings with source defaults; saved composition recipes and actual execution are unassessed",
        schema: "native-inspection-selection",
        keyRows:
          "One authored camera/control key per bounded pageable row; frames are absolute source frames",
      },
      {
        kind: "native-observation-limits",
        packetBytes: NATIVE3D_OBSERVATION_LIMITS.packetBytes,
        passes: NATIVE3D_OBSERVATION_LIMITS.passes,
        parts: NATIVE3D_OBSERVATION_LIMITS.parts,
        anchors: NATIVE3D_OBSERVATION_LIMITS.anchors,
        shardBytes: NATIVE3D_OBSERVATION_LIMITS.shardBytes,
        shards: NATIVE3D_OBSERVATION_LIMITS.shards,
        totalBytes: NATIVE3D_OBSERVATION_LIMITS.totalBytes,
        distinctPreparedVariants: NATIVE3D_VARIANT_LIMIT,
      },
    ],
    nextAction:
      "episode init-tape-hook --output-dir <fresh-directory> --font <font.ttf>; episode inspect --input <episode.json>",
  };
}
async function schema(
  flags: Map<string, string>,
): Promise<MechanismReceiptInput> {
  const kind = flags.get("kind") ?? "episode";
  if (!Object.hasOwn(episodeSchemas, kind))
    throw cliError(`Unknown schema kind ${kind}`);
  const document = z.toJSONSchema(
    episodeSchemas[kind as keyof typeof episodeSchemas],
    {
      unrepresentable: "any",
    },
  );
  const output = flags.get("output");
  if (output) await writeMechanismJson(resolve(output), document);
  return {
    command: "schema",
    summary: {
      kind,
      validation:
        "Zod runtime validation additionally enforces cross-references and resource budgets",
    },
    fullResult: document,
    ...(output
      ? { artifacts: [{ kind: "json-schema", path: resolve(output) }] }
      : {}),
  };
}

async function execute(
  command: MechanismCommand,
  flags: Map<string, string>,
  io: EpisodeCliIo,
  signal: AbortSignal,
): Promise<MechanismReceiptInput> {
  if (command === "discover") return discover();
  if (command === "schema") return schema(flags);
  if (command === "init-tape-hook")
    return resultView(
      command,
      await createTapeHookProject({
        outputDirectory: required(flags, "output-dir"),
        fontPath: required(flags, "font"),
        ...(flags.has("font-license")
          ? { fontLicensePath: required(flags, "font-license") }
          : {}),
        ...(flags.has("audio") ? { audioPath: required(flags, "audio") } : {}),
        ...(flags.has("captions")
          ? { captionsPath: required(flags, "captions") }
          : {}),
      }),
    );
  const input = required(flags, "input");
  if (command === "deps")
    return resultView(command, await mechanismDependencyReport(input));
  if (
    command === "inspect" ||
    command === "summary" ||
    command === "validate"
  ) {
    const selection =
      command === "inspect"
        ? parseEpisodeNativeInspectionSelection(flags)
        : undefined;
    const loaded = await readMechanismEpisode(input),
      summary = summarizeLoaded(loaded);
    const native =
      selection === undefined
        ? undefined
        : inspectEpisodeNativeMetadata(loaded, selection);
    if (native) Object.assign(summary, native.summary);
    const items =
      native?.items ??
      (command !== "validate"
        ? inspectItems(loaded, flags.get("shot"))
        : loaded.fontDiagnostics.map(row));
    return {
      command,
      summary,
      items,
      fullResult: { summary, items },
      nextAction:
        "episode prepare --input <episode.json> --output-dir <fresh-directory>",
    };
  }
  if (command === "save") {
    const output = required(flags, "output");
    if (dirname(resolve(input)) !== dirname(resolve(output)))
      throw cliError(
        "Save requires the source directory; use episode package to relocate dependencies",
        "mechanism-save-relocation",
      );
    const episode = (await readMechanismEpisode(input)).episode;
    if (flags.has("base-revision") !== flags.has("base-hash"))
      throw cliError("Save requires both --base-revision and --base-hash");
    const base = flags.has("base-revision")
      ? {
          revision: integer(required(flags, "base-revision"), "base-revision"),
          hash: required(flags, "base-hash"),
        }
      : undefined;
    return resultView(
      command,
      await saveMechanismEpisode(episode, output, base),
    );
  }
  if (command === "patch") {
    const request = await readPatchRequest(required(flags, "request"), io);
    return resultView(
      command,
      await patchMechanismEpisode(input, {
        baseRevision: request.baseRevision,
        baseHash: request.baseHash,
        operations: request.operations,
      }),
    );
  }
  const cache = flags.has("cache-dir")
    ? { cacheDirectory: required(flags, "cache-dir") }
    : {};
  const selectedRoute = flags.has("route")
    ? MechanismRouteSchema.safeParse(flags.get("route"))
    : undefined;
  if (selectedRoute && !selectedRoute.success)
    throw cliError(
      "--route requires bridge or native3d",
      "mechanism-route",
      "--route",
    );
  const route = selectedRoute?.success ? { route: selectedRoute.data } : {};
  const prepared = flags.has("prepared-dir")
    ? { preparedDirectory: required(flags, "prepared-dir") }
    : {};
  const final = flags.has("final-output")
    ? { finalOutput: required(flags, "final-output") }
    : {};
  if (command === "check")
    return resultView(
      command,
      await checkMechanismEpisode(input, {
        ...prepared,
        ...final,
        ...route,
        signal,
      }),
    );
  if (command === "package")
    return resultView(
      command,
      await packageMechanismEpisode(input, {
        outputDirectory: required(flags, "output-dir"),
        ...prepared,
        ...final,
        ...route,
        signal,
      }),
    );
  const options = {
    outputDirectory: required(flags, "output-dir"),
    signal,
    ...cache,
    ...route,
  };
  if (command === "prepare")
    return resultView(command, await prepareMechanismEpisode(input, options));
  if (command === "compile")
    return resultView(command, await compileMechanismEpisode(input, options));
  if (command === "preview")
    return resultView(
      command,
      await previewMechanismEpisode(input, {
        ...options,
        frame: integer(required(flags, "frame"), "frame"),
      }),
    );
  const backend = flags.get("backend");
  if (backend !== undefined && backend !== "canvas2d" && backend !== "webgl2")
    throw cliError(
      "--backend requires canvas2d or webgl2",
      "mechanism-backend",
      "--backend",
    );
  return resultView(
    command,
    await renderMechanismEpisode(input, {
      ...options,
      ...(backend ? { backend } : {}),
    }),
  );
}

export async function runEpisodeCli(
  args: string[],
  io: EpisodeCliIo,
): Promise<number> {
  const controller = new AbortController(),
    abort = () => controller.abort(new Error("Episode command cancelled"));
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  let command: MechanismCommand = "discover",
    flags = new Map<string, string>();
  try {
    const requested =
      args.length === 0 || args.includes("--help") ? "discover" : args[0];
    const parsed = MechanismCommandSchema.safeParse(requested);
    if (!parsed.success)
      throw cliError(
        `Unknown episode command ${String(requested).slice(0, 128)}`,
      );
    command = parsed.data;
    flags = parseFlags(command, args.includes("--help") ? [] : args.slice(1));
    const options = receiptOptions(flags);
    if (options.reportPath !== undefined) {
      try {
        await stat(options.reportPath);
        throw cliError(
          "Report destination already exists; choose a fresh --report path",
          "mechanism-report-exists",
          options.reportPath,
        );
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
    const result = await execute(command, flags, io, controller.signal);
    controller.signal.throwIfAborted();
    const receipt = await createMechanismCommandReceipt(result, {
      ...options,
      ...([
        "schema",
        "prepare",
        "compile",
        "preview",
        "render",
        "check",
        "package",
      ].includes(command)
        ? { retainFullResult: true }
        : {}),
    });
    controller.signal.throwIfAborted();
    io.stdout(`${JSON.stringify(receipt)}\n`);
    return receipt.status === "passed"
      ? 0
      : receipt.status === "failed"
        ? 2
        : 1;
  } catch (error) {
    const diagnostic = failureDiagnostic(error),
      context = error instanceof AnimationEngineError ? error.context : {};
    const issue = error instanceof z.ZodError ? error.issues[0] : undefined;
    const message =
      issue?.message ??
      (error instanceof Error ? error.message : "Episode command failed");
    const summary: MechanismReceiptRow = {
      code: String(
        context?.diagnosticCode ??
          (issue ? "mechanism-schema" : "mechanism-command-failed"),
      ),
      message: sanitizeDiagnosticText(message),
      stage: diagnostic.stage,
      path:
        diagnostic.path ?? sanitizeDiagnosticText(issue?.path.join("/") ?? ""),
    };
    let completeDiagnostics: unknown[] =
      error instanceof z.ZodError ? error.issues : [];
    if (typeof context?.diagnosticsJson === "string")
      try {
        const parsed = JSON.parse(context.diagnosticsJson) as unknown;
        if (Array.isArray(parsed)) completeDiagnostics = parsed;
      } catch {
        /* The bounded cause report remains available for non-JSON contexts. */
      }
    completeDiagnostics = JSON.parse(
      sanitizeDiagnosticContext({
        diagnosticsJson: JSON.stringify(completeDiagnostics),
      })!.diagnosticsJson as string,
    ) as unknown[];
    const rows = [
      ...completeDiagnostics.map(row),
      ...(diagnostic.causes?.map((cause) => row(cause)) ?? []),
    ];
    const receipt = await createMechanismCommandReceipt(
      {
        command,
        status: controller.signal.aborted ? "cancelled" : "failed",
        summary,
        items: rows,
        fullResult: {
          summary,
          diagnostic,
          diagnostics: completeDiagnostics,
          ...(error instanceof AnimationEngineError
            ? { failure: error.toFailure() }
            : {}),
        },
        nextAction: diagnostic.nextAction,
      },
      { retainFullResult: true },
    );
    io.stdout(`${JSON.stringify(receipt)}\n`);
    return controller.signal.aborted
      ? 1
      : (error instanceof AnimationEngineError &&
            error.code === "SCENE_INVALID") ||
          issue
        ? 2
        : 1;
  } finally {
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
  }
}
