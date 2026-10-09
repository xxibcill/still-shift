import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { createServer as createSocketServer } from "node:net";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import {
  createServer,
  type Plugin,
  type ViteDevServer,
  type WebSocketClient,
} from "vite";
import { ProgramSnapshots, type SnapshotBytes } from "./preview-snapshots.ts";
import { passageDiagnostics } from "../../../../packages/renderer-core/src/passage-diagnostics.ts";
import {
  readCompositionSource,
  prepareCompositionMedia,
  prepareCompositionAudio,
} from "@still-shift/animation-engine";
import type {
  Composition,
  CompositionDiagnostic,
  CompositionPreparedMedia,
  CompositionPreparedAudio,
} from "@still-shift/scene-contract";
import { CompositionProgramError, programError } from "./errors.ts";
import { loadProgram } from "./program.ts";
import { exportCompositionDraft } from "./draft-export.ts";
import {
  captureCompositionAssets,
  capturedMediaComposition,
  type DraftAsset,
} from "./captured-assets.ts";
import { withProgramFile } from "./files.ts";
import {
  CompositionSaveError,
  readEditRequest,
  saveCompositionDocument,
  sourceHash,
  editableDocument,
  sendCompositionEditError,
} from "./save.ts";
export type ProgramSnapshot = {
  revision: number;
  composition: Composition;
  document?: Composition;
  sourceSha256?: string;
  source: "json" | "builder";
  input: string;
  assets: Record<string, string>;
  preparedMedia?: CompositionPreparedMedia;
  preparedAudio?: CompositionPreparedAudio;
  diagnostics: CompositionDiagnostic[];
};
type NativeSnapshotBytes = SnapshotBytes<DraftAsset> & {
  sourcePaths: Record<string, string>;
};
type NativeOwner = { revision: number; lease?: string };
type NativeCapture = NativeOwner & {
  controller: AbortController;
  paths?: Record<string, string>;
};
const CAPTURE_LIMIT = 64;
const CANCELLATION_LIMIT = 128;
const ownerKey = (owner: NativeOwner) =>
  `${owner.revision}:${owner.lease ?? "recent"}`;
const sameOwner = (left: NativeOwner, right: NativeOwner) =>
  left.revision === right.revision && left.lease === right.lease;
const captureId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
async function availablePort() {
  const socket = createSocketServer();
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = socket.address();
    if (!address || typeof address === "string")
      throw new Error("Cannot allocate local preview port");
    return address.port;
  } finally {
    await new Promise<void>((resolve, reject) =>
      socket.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

export async function createProgramPreview(
  inputPath: string,
  options: { watch?: boolean; port?: number } = {},
) {
  const sourceInput = resolve(inputPath),
    input = await realpath(sourceInput).catch(() => sourceInput);
  const root = resolve(import.meta.dirname, "../../../../");
  const watched = new Set<string>([input]),
    snapshots = new ProgramSnapshots<NativeSnapshotBytes>();
  const sequencePatterns = new Map<string, RegExp>();
  const preparing = new Set<AbortController>();
  const captures = new Map<string, NativeCapture>();
  const leaseOwners = new Map<string, WebSocketClient>();
  const cancellations = new Map<string, NativeOwner>();
  const blockedOwners = new Map<string, NativeOwner>();
  const releaseCapture = (id: string) => {
    const capture = captures.get(id);
    if (!capture) return;
    captures.delete(id);
    capture.controller.abort();
  };
  const releaseLease = (lease: string, owner: WebSocketClient) => {
    if (leaseOwners.get(lease) !== owner) return;
    for (const [id, capture] of captures)
      if (capture.lease === lease) releaseCapture(id);
    for (const [id, cancelled] of cancellations)
      if (cancelled.lease === lease) cancellations.delete(id);
    for (const [key, blocked] of blockedOwners)
      if (blocked.lease === lease) blockedOwners.delete(key);
    snapshots.release(lease, owner);
    leaseOwners.delete(lease);
  };
  let current: NativeSnapshotBytes | undefined,
    revision = 0,
    pending = false,
    closed = false;
  let failure: CompositionDiagnostic[] = [],
    active: Promise<void> | undefined,
    abort: AbortController | undefined;
  let exporting = false;
  let saving: Promise<void> = Promise.resolve();
  let savingHash: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let server: ViteDevServer;
  const addDependencies = (paths: string[]) => {
    paths.forEach((path) => watched.add(resolve(path)));
    server.watcher.add(paths);
  };
  async function build() {
    const controller = new AbortController();
    abort = controller;
    try {
      const program = await loadProgram(sourceInput, {
        signal: controller.signal,
      });
      addDependencies([
        ...program.dependencies,
        ...program.composition.assets.map((asset) => asset.path),
        ...program.composition.assets.flatMap((asset) =>
          asset.type === "sequence" ? [asset.manifestPath] : [],
        ),
      ]);
      sequencePatterns.clear();
      for (const asset of program.composition.assets)
        if (asset.type === "sequence") {
          const pattern = asset.path
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            .replace(/%0[1-9]\d?d/, "[0-9]+");
          sequencePatterns.set(asset.id, new RegExp(`^${pattern}$`));
          server.watcher.add(dirname(asset.path));
        }
      const source = await withProgramFile(program, sourceInput, (path) =>
        readCompositionSource(path, { signal: controller.signal }),
      );
      const bytes = await captureCompositionAssets(source);
      if (
        program.sourceSha256 &&
        sourceHash(await readFile(input)) !== program.sourceSha256
      )
        programError(
          "comp-program-source-race",
          "Source changed during rebuild",
          input,
        );
      if (closed || controller.signal.aborted) return;
      revision++;
      const snapshot: ProgramSnapshot = {
        revision,
        composition: program.composition,
        ...(program.document
          ? { document: program.document, sourceSha256: program.sourceSha256! }
          : {}),
        source: program.source,
        input: sourceInput,
        diagnostics: source.warnings,
        ...(source.preparedAudio
          ? { preparedAudio: source.preparedAudio }
          : {}),
        ...(source.preparedMedia
          ? { preparedMedia: source.preparedMedia }
          : {}),
        assets: Object.fromEntries(
          Object.keys(source.assetPaths).map((id) => [
            id,
            `/composition/program-asset?revision=${revision}&capture=source&id=${encodeURIComponent(id)}`,
          ]),
        ),
      };
      current = {
        snapshot,
        bytes,
        sourcePaths: source.assetPaths,
      };
      snapshots.add(current);
      for (const [id, capture] of captures)
        if (!snapshots.get(capture.revision, capture.lease)) releaseCapture(id);
      for (const [id, cancelled] of cancellations)
        if (!snapshots.get(cancelled.revision, cancelled.lease))
          cancellations.delete(id);
      for (const [key, blocked] of blockedOwners)
        if (!snapshots.get(blocked.revision, blocked.lease))
          blockedOwners.delete(key);
      failure = [];
      server.ws.send({
        type: "custom",
        event: "composition-program:update",
        data: { revision },
      });
    } catch (error) {
      if (closed || controller.signal.aborted) return;
      if (error instanceof CompositionProgramError) {
        addDependencies(error.dependencies);
        failure = error.diagnostics;
      } else
        failure = [
          {
            code: "comp-program-preview",
            severity: "error",
            path: input,
            message: error instanceof Error ? error.message : String(error),
          },
        ];
      server.ws.send({
        type: "custom",
        event: "composition-program:error",
        data: { diagnostics: failure },
      });
    } finally {
      if (abort === controller) abort = undefined;
    }
  }
  async function rebuild(): Promise<void> {
    if (closed) return;
    pending = true;
    if (active) return active;
    active = (async () => {
      while (pending && !closed) {
        pending = false;
        await build();
      }
    })().finally(() => {
      active = undefined;
    });
    return active;
  }
  const changed = async (event: string, path: string) => {
    if (
      !options.watch ||
      !["add", "change", "unlink"].includes(event) ||
      !(
        watched.has(resolve(path)) ||
        [...sequencePatterns.values()].some((pattern) =>
          pattern.test(resolve(path)),
        )
      )
    )
      return;
    if (resolve(path) === input && event !== "unlink") {
      const bytes = await readFile(input).catch(() => undefined);
      if (
        bytes &&
        (sourceHash(bytes) === savingHash ||
          sourceHash(bytes) === current?.snapshot.sourceSha256)
      )
        return;
    }
    pending = true;
    abort?.abort();
    clearTimeout(timer);
    timer = setTimeout(() => {
      void rebuild();
    }, 75);
  };
  const plugin: Plugin = {
    name: "still-shift-composition-program",
    configureServer(value) {
      server = value;
      const owners = new WeakSet<WebSocketClient>();
      server.ws.on(
        "composition-program:retain",
        (data: { request?: unknown; revision?: unknown }, client) => {
          if (
            client.socket.readyState !== 1 ||
            !data ||
            typeof data.request !== "string" ||
            data.request.length > 64
          )
            return;
          try {
            if (
              !Number.isSafeInteger(data.revision) ||
              (data.revision as number) < 1
            )
              throw new CompositionSaveError(
                400,
                "comp-edit-revision",
                "Use a positive source revision",
              );
            const lease = snapshots.retain(data.revision as number, client);
            leaseOwners.set(lease, client);
            if (!owners.has(client)) {
              owners.add(client);
              client.socket.once("close", () => {
                for (const [lease, owner] of leaseOwners)
                  if (owner === client) releaseLease(lease, client);
              });
            }
            client.send("composition-program:retained", {
              request: data.request,
              lease,
              diagnostics: [],
            });
          } catch (error) {
            client.send("composition-program:retained", {
              request: data.request,
              diagnostics: passageDiagnostics(error),
            });
          }
        },
      );
      server.ws.on(
        "composition-program:release",
        (data: { lease?: unknown }, client) => {
          if (data && typeof data.lease === "string" && data.lease.length <= 64)
            releaseLease(data.lease, client);
        },
      );
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (
          ![
            "/composition/program",
            "/composition/program-asset",
            "/composition/program-save",
            "/composition/program-export",
            "/composition/program-prepare",
            "/composition/program-capture-release",
          ].includes(url.pathname)
        )
          return next();
        response.setHeader("Cache-Control", "no-store");
        if (url.pathname === "/composition/program-capture-release") {
          void (async () => {
            try {
              const body = (await readEditRequest(request)) as {
                revision?: number;
                lease?: string;
                capture?: unknown;
              };
              if (
                !body ||
                Object.keys(body).some(
                  (key) => !["revision", "lease", "capture"].includes(key),
                ) ||
                !Number.isSafeInteger(body.revision) ||
                body.revision! < 1 ||
                !captureId(body.capture) ||
                (body.lease !== undefined &&
                  (typeof body.lease !== "string" || body.lease.length > 64))
              )
                throw new CompositionSaveError(
                  400,
                  "comp-edit-request",
                  "Use revision, lease and capture",
                );
              const owner: NativeOwner = {
                revision: body.revision!,
                ...(body.lease !== undefined ? { lease: body.lease } : {}),
              };
              const capture = captures.get(body.capture);
              const cancelled = cancellations.get(body.capture);
              if (
                (capture && !sameOwner(capture, owner)) ||
                (cancelled && !sameOwner(cancelled, owner))
              )
                throw new CompositionSaveError(
                  403,
                  "comp-edit-capture",
                  "Native capture belongs to a different preview owner",
                );
              if (capture) releaseCapture(body.capture);
              else if (snapshots.get(owner.revision, owner.lease)) {
                // Release may arrive before the corresponding prepare body. Never
                // evict a cancellation while that request can still arrive.
                if (cancellations.size >= CANCELLATION_LIMIT && !cancelled)
                  blockedOwners.set(ownerKey(owner), owner);
                else if (!blockedOwners.has(ownerKey(owner)))
                  cancellations.set(body.capture, owner);
              }
              response.statusCode = 204;
              response.end();
            } catch (error) {
              sendCompositionEditError(response, error, input);
            }
          })();
          return;
        }
        if (url.pathname === "/composition/program-prepare") {
          void (async () => {
            const controller = new AbortController();
            const abort = () => {
              if (!response.writableEnded) controller.abort();
            };
            preparing.add(controller);
            response.on("close", abort);
            let capture: string | undefined;
            let reservation: NativeCapture | undefined;
            let published = false;
            try {
              const body = (await readEditRequest(request)) as {
                revision?: number;
                document?: unknown;
                lease?: string;
                capture?: unknown;
              };
              controller.signal.throwIfAborted();
              if (
                !body ||
                Object.keys(body).some(
                  (key) =>
                    !["revision", "document", "lease", "capture"].includes(key),
                ) ||
                (body.capture !== undefined && !captureId(body.capture))
              )
                throw new CompositionSaveError(
                  400,
                  "comp-edit-request",
                  "Use revision, document, lease and optional capture",
                );
              const captured = snapshots.get(body.revision ?? -1, body.lease);
              if (!captured)
                throw new CompositionSaveError(
                  409,
                  "comp-edit-revision",
                  "Source asset revision expired; reload before preparing",
                );
              const owner: NativeOwner = {
                revision: captured.snapshot.revision,
                ...(body.lease !== undefined ? { lease: body.lease } : {}),
              };
              const cancelled = body.capture
                ? cancellations.get(body.capture)
                : undefined;
              if (cancelled) {
                if (!sameOwner(cancelled, owner))
                  throw new CompositionSaveError(
                    403,
                    "comp-edit-capture",
                    "Native capture belongs to a different preview owner",
                  );
                cancellations.delete(body.capture!);
                throw new CompositionSaveError(
                  409,
                  "comp-edit-capture",
                  "This native capture was released before preparation",
                );
              }
              if (blockedOwners.has(ownerKey(owner)))
                throw new CompositionSaveError(
                  409,
                  "comp-edit-limit",
                  "This preview has too many pending cancellations; reload before preparing again",
                );
              const document = editableDocument(
                body.document,
                captured.snapshot.document ?? captured.snapshot.composition,
              );
              const nativeDocument = capturedMediaComposition(
                document,
                captured.bytes,
              );
              if (captures.size >= CAPTURE_LIMIT)
                throw new CompositionSaveError(
                  409,
                  "comp-edit-limit",
                  "The preview already has 64 native captures; close an unused preview before preparing another",
                );
              capture =
                typeof body.capture === "string" ? body.capture : randomUUID();
              if (captures.has(capture))
                throw new CompositionSaveError(
                  409,
                  "comp-edit-capture",
                  "This native capture is already owned by a preview",
                );
              reservation = {
                revision: captured.snapshot.revision,
                ...(body.lease !== undefined ? { lease: body.lease } : {}),
                controller,
              };
              captures.set(capture, reservation);
              const prepared = await prepareCompositionMedia(
                nativeDocument,
                dirname(sourceInput),
                { signal: controller.signal },
              );
              const audio = await prepareCompositionAudio(
                nativeDocument,
                dirname(sourceInput),
                { signal: controller.signal },
              );
              const paths = { ...prepared?.assetPaths, ...audio?.assetPaths };
              controller.signal.throwIfAborted();
              if (
                captures.get(capture) !== reservation ||
                snapshots.get(body.revision ?? -1, body.lease) !== captured
              )
                throw new CompositionSaveError(
                  409,
                  "comp-edit-revision",
                  "Preview owner was released during native preparation",
                );
              reservation.paths = paths;
              response.setHeader("Content-Type", "application/json");
              response.end(
                JSON.stringify({
                  capture,
                  preparedMedia: prepared?.preparedMedia,
                  preparedAudio: audio?.preparedAudio,
                  assets: {
                    ...Object.fromEntries(
                      Object.entries(captured.snapshot.assets).map(
                        ([id, path]) => [
                          id,
                          body.lease
                            ? `${path}&lease=${encodeURIComponent(body.lease)}`
                            : path,
                        ],
                      ),
                    ),
                    ...Object.fromEntries(
                      Object.keys(paths).map((id) => [
                        id,
                        `/composition/program-asset?revision=${captured.snapshot.revision}&capture=${capture}&id=${encodeURIComponent(id)}${body.lease ? `&lease=${encodeURIComponent(body.lease)}` : ""}`,
                      ]),
                    ),
                  },
                }),
              );
              published = true;
            } catch (error) {
              sendCompositionEditError(response, error, input);
            } finally {
              if (
                !published &&
                capture &&
                captures.get(capture) === reservation
              )
                releaseCapture(capture);
              response.off("close", abort);
              preparing.delete(controller);
            }
          })();
          return;
        }
        if (url.pathname === "/composition/program-export") {
          void (async () => {
            try {
              const body = (await readEditRequest(request)) as {
                revision?: number;
                document?: unknown;
                backend?: unknown;
                lease?: string;
              };
              if (
                !body ||
                Object.keys(body).some(
                  (key) =>
                    !["revision", "document", "backend", "lease"].includes(key),
                )
              )
                throw new CompositionSaveError(
                  400,
                  "comp-edit-request",
                  "Use revision, document and backend",
                );
              const captured = snapshots.get(body.revision ?? -1, body.lease);
              if (!captured)
                throw new CompositionSaveError(
                  409,
                  "comp-edit-revision",
                  "Source asset revision expired; reload before exporting",
                );
              if (exporting)
                throw new CompositionSaveError(
                  409,
                  "comp-edit-busy",
                  "A composition export is already running",
                );
              exporting = true;
              try {
                await exportCompositionDraft(
                  body.document,
                  captured.snapshot.document ?? captured.snapshot.composition,
                  captured.bytes,
                  body.backend,
                  response,
                );
              } finally {
                exporting = false;
              }
            } catch (error) {
              sendCompositionEditError(response, error, input);
            }
          })();
          return;
        }
        if (url.pathname === "/composition/program-save") {
          const task = saving.then(async () => {
            try {
              if (current?.snapshot.source !== "json")
                throw new CompositionSaveError(
                  403,
                  "comp-edit-readonly",
                  "Builder source is read-only; copy edited keys as code",
                );
              const body = (await readEditRequest(request)) as {
                revision?: number;
                sourceSha256?: string;
                document?: unknown;
              };
              if (
                !body ||
                Object.keys(body).some(
                  (key) =>
                    !["revision", "sourceSha256", "document"].includes(key),
                )
              )
                throw new CompositionSaveError(
                  400,
                  "comp-edit-request",
                  "Use revision, sourceSha256 and document",
                );
              const base = current.snapshot;
              if (
                body.revision !== base.revision ||
                body.sourceSha256 !== base.sourceSha256
              )
                throw new CompositionSaveError(
                  409,
                  "comp-edit-conflict",
                  "A newer source revision is available; reload before saving",
                );
              const result = await saveCompositionDocument(
                input,
                base.document!,
                base.sourceSha256!,
                body.document,
              );
              savingHash = result.sourceSha256;
              clearTimeout(timer);
              if (!result.unchanged) await rebuild();
              if (
                failure.length ||
                current?.snapshot.sourceSha256 !== result.sourceSha256
              )
                throw new CompositionSaveError(
                  422,
                  "comp-edit-rebuild",
                  "Source was saved but the preview rebuild failed; reload to inspect diagnostics",
                );
              response.setHeader("Content-Type", "application/json");
              response.end(
                JSON.stringify({
                  snapshot: current?.snapshot,
                  diagnostics: failure,
                  unchanged: result.unchanged,
                }),
              );
            } catch (error) {
              sendCompositionEditError(response, error, input);
            } finally {
              savingHash = undefined;
            }
          });
          saving = task.catch(() => {});
          return;
        }
        if (request.method !== "GET") {
          response.statusCode = 405;
          response.end();
          return;
        }
        if (url.pathname === "/composition/program") {
          response.setHeader("Content-Type", "application/json");
          response.statusCode = current ? 200 : 422;
          response.end(
            JSON.stringify({
              snapshot: current?.snapshot,
              diagnostics: failure,
            }),
          );
          return;
        }
        const captured = snapshots.get(
          Number(url.searchParams.get("revision")),
          url.searchParams.get("lease") ?? undefined,
        );
        const id = url.searchParams.get("id") ?? "";
        const asset = captured?.bytes.get(id);
        const capture = url.searchParams.get("capture") ?? "source";
        const prepared = captures.get(capture);
        const paths =
          capture === "source"
            ? captured?.sourcePaths
            : prepared?.revision === captured?.snapshot.revision &&
                prepared?.lease === (url.searchParams.get("lease") ?? undefined)
              ? prepared?.paths
              : undefined;
        const path = paths?.[id];
        if ((id.startsWith("__media:") || id === "__audio:mix") && path) {
          response.setHeader(
            "Content-Type",
            id === "__audio:mix" ? "audio/wav" : "image/png",
          );
          void pipeline(createReadStream(path), response).catch(() =>
            response.destroy(),
          );
          return;
        }
        if (!asset || !("bytes" in asset)) {
          response.statusCode = 404;
          response.end();
          return;
        }
        response.setHeader("Content-Type", asset.type);
        response.end(asset.bytes);
      });
      server.watcher.on("all", changed);
    },
    handleHotUpdate(context) {
      if (watched.has(resolve(context.file))) return [];
    },
  };
  server = await createServer({
    root: resolve(root, "apps/lab"),
    configFile: false,
    logLevel: "silent",
    define: {
      __STILL_SHIFT_COMMAND__: JSON.stringify(
        import.meta.url.endsWith(".js")
          ? "npx still-shift"
          : "pnpm --silent still-shift",
      ),
    },
    plugins: [plugin],
    server: {
      host: "127.0.0.1",
      port: options.port || (await availablePort()),
      strictPort: Boolean(options.port),
      fs: { allow: [root] },
    },
  });
  try {
    await server.listen();
    addDependencies([input]);
    await rebuild();
  } catch (error) {
    closed = true;
    abort?.abort();
    await server.close();
    throw error;
  }
  return {
    server,
    url: `${server.resolvedUrls!.local[0]}composition.html?program=1`,
    rebuild,
    snapshot: () => current?.snapshot,
    async close() {
      closed = true;
      clearTimeout(timer);
      abort?.abort();
      for (const controller of preparing) controller.abort();
      for (const id of captures.keys()) releaseCapture(id);
      leaseOwners.clear();
      cancellations.clear();
      blockedOwners.clear();
      server.watcher.off("all", changed);
      await active;
      await saving;
      await server.close();
      snapshots.clear();
      current = undefined;
    },
  };
}
