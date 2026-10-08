import { readdir, readFile, realpath } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import type { ServerResponse } from "node:http";
import { exportCompositionDraft } from "../../tools/still-shift-cli/src/composition/draft-export.ts";
import {
  CompositionSaveError,
  readEditRequest,
  editableDocument,
  sendCompositionEditError,
} from "../../tools/still-shift-cli/src/composition/save.ts";
import { validateComposition } from "../../packages/scene-contract/src/index.ts";
import { readCompositionSource } from "../../packages/animation-engine/src/composition-source.ts";
import { prepareCompositionMedia } from "../../packages/animation-engine/src/composition-media.ts";
import { prepareCompositionAudio } from "../../packages/animation-engine/src/composition-audio-mix.ts";
import {
  captureCompositionAssets,
  capturedMediaComposition,
} from "../../tools/still-shift-cli/src/composition/captured-assets.ts";
import type { Plugin } from "vite";

const root = resolve(import.meta.dirname, "../..");
const fixtures = resolve(root, "benchmarks/fixtures/composition");
const types: Record<string, string> = {
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".otf": "font/otf",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

const inside = (parent: string, path: string) =>
  path === parent || path.startsWith(parent + sep);

/** A composition fixture path relative to the fixture directory, or undefined. */
function fixturePath(value: string | null) {
  if (!value || !value.endsWith(".json")) return undefined;
  const path = resolve(fixtures, value);
  return inside(fixtures, path) &&
    !relative(fixtures, path)
      .split(sep)
      .some((part) => part.startsWith("."))
    ? path
    : undefined;
}

async function list(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith("."))
      .map((entry) =>
        entry.isDirectory()
          ? list(join(directory, entry.name))
          : entry.name.endsWith(".json")
            ? [join(directory, entry.name)]
            : [],
      ),
  );
  return nested.flat().sort();
}

const send = (
  response: ServerResponse,
  status: number,
  body: string | Buffer,
  type = "text/plain",
) => {
  response.statusCode = status;
  response.setHeader("Content-Type", type);
  response.setHeader("Cache-Control", "no-store");
  response.end(body);
};

/**
 * Serves composition fixtures and the assets they reference to the Lab's
 * composition page. Nothing outside `benchmarks/fixtures/composition/` is listed,
 * and assets resolve only through a fixture's own asset list, inside the repository.
 */
export const compositionApi = (): Plugin => {
  let exporting = false;
  const captures = new Map<
    string,
    { scene: string; paths: Record<string, string> }
  >();
  const preparing = new Set<AbortController>();
  async function source(scene: string, signal?: AbortSignal) {
    const validation = validateComposition(
      JSON.parse(await readFile(scene, "utf8")),
    );
    if (!validation.ok)
      throw new CompositionSaveError(
        422,
        "comp-edit-validation",
        "Invalid registered fixture",
      );
    const check = async (path: string) => {
      signal?.throwIfAborted();
      if (!inside(root, await realpath(path)))
        throw new CompositionSaveError(
          422,
          "comp-edit-asset",
          "Registered fixture assets must stay inside the repository",
        );
    };
    for (const asset of validation.composition.assets) {
      if (asset.type === "sequence") {
        await check(resolve(dirname(scene), asset.manifestPath));
        const pattern = resolve(dirname(scene), asset.path);
        const format = /%0([1-9])d/.exec(pattern)!;
        for (let ordinal = 0; ordinal < asset.frameCount; ordinal++)
          await check(
            pattern.replace(
              format[0],
              String(asset.firstFrame + ordinal).padStart(
                Number(format[1]),
                "0",
              ),
            ),
          );
      } else await check(resolve(dirname(scene), asset.path));
    }
    return readCompositionSource(scene, { signal });
  }
  return {
    name: "still-shift-composition-fixtures",
    configureServer(server) {
      server.httpServer?.once("close", () => {
        for (const controller of preparing) controller.abort();
        captures.clear();
      });
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith("/composition/")) return next();
        void (async () => {
          if (url.pathname === "/composition/fixtures") {
            const files = await list(fixtures);
            const entries = await Promise.all(
              files.map(async (file) => {
                const doc = JSON.parse(await readFile(file, "utf8")) as {
                  schemaVersion?: string;
                  id?: string;
                  name?: string;
                };
                return doc.schemaVersion === "composition-1"
                  ? [
                      {
                        path: relative(fixtures, file).split(sep).join("/"),
                        id: doc.id,
                        name: doc.name ?? doc.id,
                      },
                    ]
                  : [];
              }),
            );
            return send(
              response,
              200,
              JSON.stringify(entries.flat()),
              types[".json"],
            );
          }
          const scene = fixturePath(url.searchParams.get("scene"));
          if (!scene) return send(response, 404, "Unknown composition");
          if (url.pathname === "/composition/native-asset") {
            const capture = captures.get(url.searchParams.get("capture") ?? "");
            const id = url.searchParams.get("id") ?? "";
            const path =
              capture?.scene === scene &&
              (id.startsWith("__media:") || id === "__audio:mix")
                ? capture.paths[id]
                : undefined;
            if (!path)
              return send(response, 404, "Unknown captured native resource");
            response.setHeader(
              "Content-Type",
              id === "__audio:mix" ? "audio/wav" : "image/png",
            );
            response.setHeader("Cache-Control", "no-store");
            await pipeline(createReadStream(path), response);
            return;
          }
          const text = await readFile(scene, "utf8");
          if (url.pathname === "/composition/scene")
            return send(response, 200, text, types[".json"]);
          if (url.pathname === "/composition/prepare") {
            const controller = new AbortController();
            const abort = () => {
              if (!response.writableEnded) controller.abort();
            };
            preparing.add(controller);
            response.on("close", abort);
            try {
              const body = (await readEditRequest(request)) as {
                document?: unknown;
              };
              if (!body || Object.keys(body).some((key) => key !== "document"))
                throw new CompositionSaveError(
                  400,
                  "comp-edit-request",
                  "Use document",
                );
              const loaded = await source(scene, controller.signal);
              const document = editableDocument(
                body.document,
                JSON.parse(text),
              );
              const assets = await captureCompositionAssets(loaded);
              const nativeDocument = capturedMediaComposition(document, assets);
              const prepared = await prepareCompositionMedia(
                nativeDocument,
                dirname(scene),
                { signal: controller.signal },
              );
              const audio = await prepareCompositionAudio(
                nativeDocument,
                dirname(scene),
                { signal: controller.signal },
              );
              const paths = { ...prepared?.assetPaths, ...audio?.assetPaths };
              controller.signal.throwIfAborted();
              const capture = randomUUID();
              captures.set(capture, {
                scene,
                paths,
              });
              while (captures.size > 4)
                captures.delete(captures.keys().next().value!);
              send(
                response,
                200,
                JSON.stringify({
                  preparedMedia: prepared?.preparedMedia,
                  preparedAudio: audio?.preparedAudio,
                  assets: Object.fromEntries(
                    Object.keys(paths).map((id) => [
                      id,
                      `/composition/native-asset?scene=${encodeURIComponent(url.searchParams.get("scene")!)}&capture=${capture}&id=${encodeURIComponent(id)}`,
                    ]),
                  ),
                }),
                types[".json"],
              );
            } finally {
              response.off("close", abort);
              preparing.delete(controller);
            }
            return;
          }
          if (url.pathname === "/composition/export") {
            const body = (await readEditRequest(request)) as {
              document?: unknown;
              backend?: unknown;
            };
            if (
              !body ||
              Object.keys(body).some(
                (key) => !["document", "backend"].includes(key),
              )
            )
              throw new CompositionSaveError(
                400,
                "comp-edit-request",
                "Use document and backend",
              );
            if (exporting)
              throw new CompositionSaveError(
                409,
                "comp-edit-busy",
                "A composition export is already running",
              );
            exporting = true;
            try {
              const base = JSON.parse(text),
                assets = await captureCompositionAssets(await source(scene));
              await exportCompositionDraft(
                body.document,
                base,
                assets,
                body.backend,
                response,
              );
            } finally {
              exporting = false;
            }
            return;
          }
          if (url.pathname !== "/composition/asset")
            return send(response, 404, "Unknown composition route");
          const id = url.searchParams.get("id");
          const asset = (
            JSON.parse(text) as { assets?: { id: string; path: string }[] }
          ).assets?.find((a) => a.id === id);
          const path = asset ? resolve(dirname(scene), asset.path) : undefined;
          if (!path || !inside(root, path) || !types[extname(path)])
            return send(response, 404, "Unknown composition asset");
          send(response, 200, await readFile(path), types[extname(path)]);
        })().catch((error: unknown) => {
          if (url.pathname === "/composition/export") {
            sendCompositionEditError(response, error);
            return;
          }
          if (!response.headersSent && !response.destroyed)
            send(
              response,
              error instanceof CompositionSaveError ? error.status : 500,
              String(error),
            );
        });
      });
    },
  };
};
