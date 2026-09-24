import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

import type { Plugin } from "vite";

import { CorpusManifestSchema } from "../../packages/scene-contract/src/corpus.ts";
import {
  CorpusResponseSchema,
  PreparedEntrySchema,
  WorkerResultSchema,
  type PreparedWorkerResult,
} from "./lab-contract.ts";

const run = promisify(execFile);
const root = resolve(import.meta.dirname, "../..");
const corpusPath = process.env.STILL_SHIFT_LAB_CORPUS
  ? resolve(process.env.STILL_SHIFT_LAB_CORPUS)
  : resolve(root, "benchmarks/corpus-manifest.json");
const depthAdapter =
  process.env.STILL_SHIFT_LAB_ADAPTER === "fake"
    ? "fake"
    : "depth-anything-v2-small";

const prepareDepth = async (sourcePath: string) => {
  let stdout: string;
  try {
    ({ stdout } = await run(
      "uv",
      [
        "run",
        "still-shift-depth",
        "prepare",
        "--input",
        sourcePath,
        "--adapter",
        depthAdapter,
      ],
      { cwd: root, maxBuffer: 1024 * 1024 * 8 },
    ));
  } catch (error) {
    const output = (error as { stdout?: unknown }).stdout;
    if (typeof output !== "string") throw error;
    try {
      const result = WorkerResultSchema.parse(JSON.parse(output));
      if (result.status === "failed") return result;
    } catch {
      // Keep the subprocess failure when stdout is not a valid worker result.
    }
    throw error;
  }
  return WorkerResultSchema.parse(JSON.parse(stdout));
};

const sendJson = (
  response: ServerResponse,
  status: number,
  value: unknown,
): void => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
};

const readCorpus = async () =>
  CorpusManifestSchema.parse(JSON.parse(await readFile(corpusPath, "utf8")));

export const labApi = (): Plugin => {
  const prepared = new Map<string, PreparedWorkerResult>();
  return {
    name: "still-shift-lab-api",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith("/api/")) return next();
        try {
          const corpus = await readCorpus();
          if (url.pathname === "/api/corpus") {
            sendJson(
              response,
              200,
              CorpusResponseSchema.parse({
                status: corpus.status,
                entries: corpus.entries.map(
                  ({ id, categories, expectedShotDurationMs }) => ({
                    id,
                    categories,
                    expectedShotDurationMs,
                  }),
                ),
              }),
            );
            return;
          }
          const id = url.searchParams.get("id");
          const entry = corpus.entries.find((candidate) => candidate.id === id);
          if (!entry)
            return sendJson(response, 404, { error: "Corpus entry not found" });
          if (url.pathname === "/api/prepare") {
            if (request.method !== "POST")
              return sendJson(response, 405, { error: "POST required" });
            const sourcePath = resolve(dirname(corpusPath), entry.source.path);
            const source = await readFile(sourcePath);
            const checksum = `sha256:${createHash("sha256").update(source).digest("hex")}`;
            if (checksum !== entry.source.sha256)
              return sendJson(response, 409, {
                error: "Source checksum differs from the corpus manifest",
              });
            const result = await prepareDepth(sourcePath);
            if (result.status !== "prepared")
              return sendJson(response, 422, {
                error: result.error.message,
                code: result.error.code,
              });
            prepared.set(entry.id, result);
            sendJson(
              response,
              200,
              PreparedEntrySchema.parse({
                id: entry.id,
                sourceUrl: `/api/asset?id=${encodeURIComponent(entry.id)}&role=source`,
                depthUrl: `/api/asset?id=${encodeURIComponent(entry.id)}&role=depth`,
                dimensions: result.dimensions.normalized,
                model: result.model,
                cacheStatus: result.cacheStatus,
                durationMs: entry.expectedShotDurationMs,
              }),
            );
            return;
          }
          if (url.pathname === "/api/asset") {
            const result = prepared.get(entry.id);
            if (!result)
              return sendJson(response, 404, {
                error: "Prepare this entry first",
              });
            const path =
              url.searchParams.get("role") === "source"
                ? result.assets.normalizedSource
                : url.searchParams.get("role") === "depth"
                  ? result.assets.previewDepth
                  : null;
            if (!path)
              return sendJson(response, 400, { error: "Unknown asset role" });
            response.setHeader("Content-Type", "image/png");
            response.setHeader("Cache-Control", "no-store");
            response.end(await readFile(path));
            return;
          }
          sendJson(response, 404, { error: "Unknown API route" });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          sendJson(response, 500, { error: message });
        }
      });
    },
  };
};
