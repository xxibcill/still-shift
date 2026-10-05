import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { createServer, type Plugin, type ViteDevServer } from "vite";
import { readCompositionSource } from "@still-shift/animation-engine";
import type {
  Composition,
  CompositionDiagnostic,
} from "@still-shift/scene-contract";
import { CompositionProgramError, programError } from "./errors.ts";
import { loadProgram } from "./program.ts";
import { exportCompositionDraft } from "./draft-export.ts";
import { withProgramFile } from "./files.ts";
import {
  CompositionSaveError,
  readEditRequest,
  saveCompositionDocument,
  sourceHash,
} from "./save.ts";
export type ProgramSnapshot = {
  revision: number;
  composition: Composition;
  document?: Composition;
  sourceSha256?: string;
  source: "json" | "builder";
  input: string;
  assets: Record<string, string>;
  diagnostics: CompositionDiagnostic[];
};
type SnapshotBytes = {
  snapshot: ProgramSnapshot;
  bytes: Map<string, { bytes: Buffer; type: string }>;
};
const types: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};
export async function createProgramPreview(
  inputPath: string,
  options: { watch?: boolean; port?: number } = {},
) {
  const sourceInput = resolve(inputPath),
    input = await realpath(sourceInput).catch(() => sourceInput);
  const root = resolve(import.meta.dirname, "../../../../");
  const watched = new Set<string>([input]),
    snapshots = new Map<number, SnapshotBytes>();
  let current: SnapshotBytes | undefined,
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
      ]);
      const source = await withProgramFile(
        program,
        sourceInput,
        readCompositionSource,
      );
      const bytes = new Map<string, { bytes: Buffer; type: string }>();
      for (const asset of program.composition.assets) {
        const data = await readFile(source.assetPaths[asset.id]!);
        if (
          `sha256:${createHash("sha256").update(data).digest("hex")}` !==
          asset.sha256
        )
          programError(
            "comp-program-asset-race",
            `Asset ${asset.id} changed during rebuild`,
            asset.path,
          );
        bytes.set(asset.id, {
          bytes: data,
          type:
            types[extname(asset.path).toLowerCase()] ??
            "application/octet-stream",
        });
      }
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
        assets: Object.fromEntries(
          [...bytes.keys()].map((id) => [
            id,
            `/composition/program-asset?revision=${revision}&id=${encodeURIComponent(id)}`,
          ]),
        ),
      };
      current = { snapshot, bytes };
      snapshots.set(revision, current);
      while (snapshots.size > 2)
        snapshots.delete(snapshots.keys().next().value!);
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
      !watched.has(resolve(path))
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
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (
          ![
            "/composition/program",
            "/composition/program-asset",
            "/composition/program-save",
            "/composition/program-export",
          ].includes(url.pathname)
        )
          return next();
        response.setHeader("Cache-Control", "no-store");
        if (url.pathname === "/composition/program-export") {
          void (async () => {
            try {
              const body = (await readEditRequest(request)) as {
                revision?: number;
                document?: unknown;
                backend?: unknown;
              };
              if (
                !body ||
                Object.keys(body).some(
                  (key) => !["revision", "document", "backend"].includes(key),
                )
              )
                throw new CompositionSaveError(
                  400,
                  "comp-edit-request",
                  "Use revision, document and backend",
                );
              const captured = snapshots.get(body.revision ?? -1);
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
              if (response.headersSent || response.destroyed) return;
              response.statusCode =
                error instanceof CompositionSaveError ? error.status : 500;
              response.end(
                error instanceof Error ? error.message : String(error),
              );
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
              response.statusCode =
                error instanceof CompositionSaveError ? error.status : 500;
              response.setHeader("Content-Type", "application/json");
              response.end(
                JSON.stringify({
                  diagnostics: [
                    {
                      code:
                        error instanceof CompositionSaveError
                          ? error.code
                          : "comp-edit-save",
                      path: input,
                      message:
                        error instanceof Error ? error.message : String(error),
                    },
                  ],
                }),
              );
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
        const asset = snapshots
          .get(Number(url.searchParams.get("revision")))
          ?.bytes.get(url.searchParams.get("id") ?? "");
        if (!asset) {
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
    plugins: [plugin],
    server: {
      host: "127.0.0.1",
      port: options.port ?? 0,
      strictPort: true,
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
      server.watcher.off("all", changed);
      await active;
      await saving;
      await server.close();
      snapshots.clear();
      current = undefined;
    },
  };
}
