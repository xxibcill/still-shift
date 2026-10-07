import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import type { ViteDevServer } from "vite";
import type * as FileSystem from "node:fs/promises";
import { beforeEach, afterEach, expect, it, vi } from "vitest";

const render = vi.hoisted(() => ({
  calls: 0,
  overlapping: false,
  published: 0,
  listings: 0,
  fail: false,
  gate: Promise.resolve(),
  release: () => {},
  publications: Promise.resolve(),
  releasePublications: () => {},
  reads: Promise.resolve(),
  releaseReads: () => {},
}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof FileSystem>();
  return {
    ...fs,
    readdir: async (...args: Parameters<typeof fs.readdir>) => {
      const names = await fs.readdir(...args);
      if (render.overlapping && String(args[0]).includes("/soundtrack-api/")) {
        if (++render.listings === 2) render.releaseReads();
        await render.reads;
      }
      return names;
    },
  };
});
vi.mock("../../packages/animation-engine/src/soundtrack-render.ts", () => ({
  renderSoundtrackProject: async (_path: string, output: string) => {
    render.calls++;
    await render.gate;
    if (render.fail) {
      render.fail = false;
      throw new Error("Test worker failed");
    }
    await mkdir(output, { recursive: true });
    // Force the valid schedule where both published outputs precede pruning.
    if (render.overlapping) {
      if (++render.published === 2) render.releasePublications();
      await render.publications;
    }
    return { revision: 0 };
  },
  readSoundtrackRender: vi.fn(),
}));
import { soundtrackApi } from "../../apps/lab/soundtrack-api.ts";

let workspace: string;
type Handler = (
  request: Readable,
  response: EventEmitter,
  next: () => void,
) => Promise<void>;
let middleware: Handler;
beforeEach(async () => {
  Object.assign(render, {
    calls: 0,
    overlapping: false,
    published: 0,
    listings: 0,
    fail: false,
  });
  render.gate = new Promise<void>((resolve) => {
    render.release = resolve;
  });
  render.publications = new Promise<void>((resolve) => {
    render.releasePublications = resolve;
  });
  render.reads = new Promise<void>((resolve) => {
    render.releaseReads = resolve;
  });
  workspace = await mkdtemp(join(tmpdir(), "soundtrack-preview-concurrency-"));
  await writeFile(
    join(workspace, "project.json"),
    JSON.stringify({
      schemaVersion: "soundtrack-project-1",
      revision: 0,
      history: { undo: [], redo: [] },
      sampleRate: 48000,
      channels: 2,
      durationSamples: 48000,
      channelConversion: "mono-duplicate-stereo-preserve",
      normalization: "none",
      tailPolicy: "retain-to-project-end",
      assets: [],
      tracks: [],
      clips: [],
      buses: [],
      master: { id: "master", gainDb: 0 },
    }),
  );
  middleware = createMiddleware();
});
afterEach(async () => {
  render.release();
  render.releasePublications();
  render.releaseReads();
  await rm(workspace, { recursive: true, force: true });
});
function createMiddleware() {
  const configure = soundtrackApi(workspace).configureServer;
  if (typeof configure !== "function")
    throw new Error("Missing middleware hook");
  let handler!: Handler;
  configure.call(
    {} as never,
    {
      middlewares: {
        use(value: Handler) {
          handler = value;
        },
      },
    } as unknown as ViteDevServer,
  );
  return handler;
}
async function request(endpoint = "render", handler = middleware) {
  const stream = Object.assign(
    Readable.from([
      Buffer.from(
        JSON.stringify({
          project: "project.json",
          revision: 0,
          ...(endpoint === "edit"
            ? {
                operations: [
                  {
                    type: "gain",
                    kind: "master",
                    target: "master",
                    gainDb: -6,
                  },
                ],
              }
            : {}),
        }),
      ),
    ]),
    {
      url: "/soundtrack-api/" + endpoint,
      method: "POST",
      headers: {
        host: "localhost:5173",
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
    },
  );
  let body = "";
  const response = Object.assign(new EventEmitter(), {
    statusCode: 200,
    writableFinished: false,
    setHeader() {},
    end(value: string) {
      body = value;
      this.writableFinished = true;
    },
  });
  await handler(stream, response, () => {
    throw new Error("Unexpected middleware fallthrough");
  });
  return { status: response.statusCode, body: JSON.parse(body) };
}

it("overlapping successful renders retain one usable published preview", async () => {
  const first = request();
  await vi.waitFor(() => expect(render.calls).toBe(1));
  const second = request();
  render.overlapping = await vi
    .waitFor(() => expect(render.calls).toBe(2), { timeout: 200 })
    .then(
      () => true,
      () => false,
    );
  render.release();
  const results = await Promise.all([first, second]);
  expect(results.map((result) => result.status)).toEqual([200, 200]);
  const directory = join(workspace, dirname(results[0]!.body.output));
  const retained = await readdir(directory);
  expect(retained).toHaveLength(1);
  expect(retained[0]).toBe(results[1]!.body.output.split("/").at(-1));
});

it("an edit during an active render invalidates that preview after publication", async () => {
  const preview = request();
  await vi.waitFor(() => expect(render.calls).toBe(1));
  const edit = request("edit");
  await vi
    .waitFor(
      async () => {
        const saved = JSON.parse(
          await readFile(join(workspace, "project.json"), "utf8"),
        );
        expect(saved.revision).toBe(1);
      },
      { timeout: 200 },
    )
    .catch(() => {});
  render.release();
  const [rendered, edited] = await Promise.all([preview, edit]);
  expect([rendered.status, edited.status]).toEqual([200, 200]);
  expect(edited.body.project.revision).toBe(1);
  expect(await readdir(join(workspace, dirname(rendered.body.output)))).toEqual(
    [],
  );
});

it("a failed render releases the project so the next request can publish", async () => {
  render.fail = true;
  render.release();
  expect((await request()).status).toBe(400);
  const retry = await request();
  expect(retry.status).toBe(200);
  expect(await readdir(join(workspace, dirname(retry.body.output)))).toEqual([
    retry.body.output.split("/").at(-1),
  ]);
});

it("independent Lab servers cannot prune a render owned by another server", async () => {
  const first = request();
  await vi.waitFor(() => expect(render.calls).toBe(1));
  const competing = await request("render", createMiddleware());
  expect(competing.status).toBe(400);
  expect(render.calls).toBe(1);
  render.release();
  const published = await first;
  expect(published.status).toBe(200);
  const directory = join(workspace, dirname(published.body.output));
  expect(await readdir(directory)).toEqual([
    published.body.output.split("/").at(-1),
  ]);
  expect(await readdir(dirname(directory))).not.toContain(
    basename(directory) + ".lock",
  );
});
