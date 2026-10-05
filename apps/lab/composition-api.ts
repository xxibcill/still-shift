import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import type { ServerResponse } from "node:http";
import { exportCompositionDraft } from "../../tools/still-shift-cli/src/composition/draft-export.ts";
import {
  CompositionSaveError,
  readEditRequest,
} from "../../tools/still-shift-cli/src/composition/save.ts";
import type { Composition } from "../../packages/scene-contract/src/index.ts";
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
  return {
    name: "still-shift-composition-fixtures",
    configureServer(server) {
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
          const text = await readFile(scene, "utf8");
          if (url.pathname === "/composition/scene")
            return send(response, 200, text, types[".json"]);
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
            const base = JSON.parse(text) as Composition,
              assets = new Map<string, { bytes: Buffer; type: string }>();
            for (const asset of base.assets) {
              const path = resolve(dirname(scene), asset.path);
              if (!inside(root, path) || !types[extname(path)])
                throw new CompositionSaveError(
                  422,
                  "comp-edit-asset",
                  "Unknown registered fixture asset",
                );
              assets.set(asset.id, {
                bytes: await readFile(path),
                type: types[extname(path)]!,
              });
            }
            exporting = true;
            try {
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
