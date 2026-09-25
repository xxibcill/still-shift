import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ViteDevServer } from "vite";
import { expect, it, vi } from "vitest";

import { DepthPreparationFailureSchema } from "../../apps/lab/lab-contract.ts";
import type { CorpusManifest } from "../../packages/scene-contract/src/corpus.ts";

it("serves a verified source for a failed depth preparation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "still-shift-lab-fallback-"));
  const previousCorpus = process.env.STILL_SHIFT_LAB_CORPUS;
  const previousAdapter = process.env.STILL_SHIFT_LAB_ADAPTER;
  const previousPath = process.env.PATH;
  try {
    const source = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==",
      "base64",
    );
    const sourcePath = join(directory, "source.png");
    const corpusPath = join(directory, "corpus.json");
    await writeFile(sourcePath, source);
    const corpus = JSON.parse(
      await readFile("benchmarks/corpus-manifest.json", "utf8"),
    ) as CorpusManifest;
    corpus.entries = [
      {
        id: "valid-source",
        source: {
          path: "source.png",
          tracked: true,
          sha256: `sha256:${createHash("sha256").update(source).digest("hex")}`,
          provenance: {
            kind: "real_explainer_project",
            projectRef: "integration fixture",
            evidenceRef: "integration fixture",
          },
        },
        categories: ["portrait_person"],
        dimensions: { width: 1, height: 1 },
        rights: {
          status: "owned",
          usageNotes: "Integration fixture",
          attribution: null,
        },
        expectedShotDurationMs: 5000,
        notes: "",
      },
    ];
    await writeFile(corpusPath, JSON.stringify(corpus));
    process.env.STILL_SHIFT_LAB_CORPUS = corpusPath;
    process.env.STILL_SHIFT_LAB_ADAPTER = "fake";
    vi.resetModules();
    const { labApi } = await import("../../apps/lab/lab-api.ts");
    let middleware!: (
      request: IncomingMessage,
      response: ServerResponse,
      next: () => void,
    ) => void;
    const server = {
      middlewares: {
        use: (handler: typeof middleware) => (middleware = handler),
      },
    } as unknown as ViteDevServer;
    const configureServer = labApi().configureServer;
    if (typeof configureServer !== "function")
      throw new Error("Lab API server hook is missing");
    (configureServer as (server: ViteDevServer) => void)(server);

    const request = async (url: string, method: string) => {
      let body: Buffer | string = "";
      const headers = new Map<string, string>();
      const response = {
        statusCode: 200,
        setHeader(name: string, value: string) {
          headers.set(name.toLowerCase(), value);
          return this;
        },
        end(value: Buffer | string) {
          body = value;
        },
      } as unknown as ServerResponse;
      await middleware({ url, method } as IncomingMessage, response, () => {
        throw new Error("Lab API did not handle the request");
      });
      return { status: response.statusCode, body, headers };
    };

    process.env.PATH = directory;
    const prepared = await request("/api/prepare?id=valid-source", "POST");
    process.env.PATH = previousPath;
    expect(prepared.status).toBe(422);
    const fallback = DepthPreparationFailureSchema.parse(
      JSON.parse(String(prepared.body)),
    );
    expect(fallback.code).toBe("DEPTH_PREPARATION_FAILED");

    const image = await request(fallback.sourceUrl, "GET");
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect(image.body).toEqual(source);

    const invalidSource = Buffer.from("not a PNG");
    await writeFile(sourcePath, invalidSource);
    expect((await request(fallback.sourceUrl, "GET")).status).toBe(409);
    corpus.entries[0]!.source.sha256 = `sha256:${createHash("sha256").update(invalidSource).digest("hex")}`;
    await writeFile(corpusPath, JSON.stringify(corpus));
    const invalidInput = await request("/api/prepare?id=valid-source", "POST");
    expect(invalidInput.status).toBe(422);
    expect(JSON.parse(String(invalidInput.body))).toMatchObject({
      code: "INPUT_DECODE_FAILED",
    });
  } finally {
    process.env.PATH = previousPath;
    if (previousCorpus === undefined) delete process.env.STILL_SHIFT_LAB_CORPUS;
    else process.env.STILL_SHIFT_LAB_CORPUS = previousCorpus;
    if (previousAdapter === undefined)
      delete process.env.STILL_SHIFT_LAB_ADAPTER;
    else process.env.STILL_SHIFT_LAB_ADAPTER = previousAdapter;
    vi.resetModules();
    await rm(directory, { recursive: true });
  }
});
