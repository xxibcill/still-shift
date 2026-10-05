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
import { withProgramFile } from "./files.ts";
export type ProgramSnapshot = {
  revision: number;
  composition: Composition;
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
  const input = await realpath(inputPath).catch(() => resolve(inputPath));
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
      const program = await loadProgram(input, { signal: controller.signal });
      addDependencies([
        ...program.dependencies,
        ...program.composition.assets.map((asset) => asset.path),
      ]);
      const source = await withProgramFile(
        program,
        input,
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
      if (closed || controller.signal.aborted) return;
      revision++;
      const snapshot: ProgramSnapshot = {
        revision,
        composition: program.composition,
        source: program.source,
        input,
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
  const changed = (event: string, path: string) => {
    if (
      !options.watch ||
      !["add", "change", "unlink"].includes(event) ||
      !watched.has(resolve(path))
    )
      return;
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
          !["/composition/program", "/composition/program-asset"].includes(
            url.pathname,
          )
        )
          return next();
        response.setHeader("Cache-Control", "no-store");
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
      await server.close();
      snapshots.clear();
      current = undefined;
    },
  };
}
