import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type * as FileSystem from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { createServer } from "vite";
import { expect, it, vi } from "vitest";
import { compositionApi } from "../../apps/lab/composition-api.ts";
import type { Composition } from "../../packages/scene-contract/src/index.ts";

const assetRead = vi.hoisted(() => ({
  path: "",
  pause: undefined as Promise<void> | undefined,
  observed: undefined as ((count: number) => void) | undefined,
  count: 0,
}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof FileSystem>();
  return {
    ...fs,
    async readFile(...args: Parameters<typeof fs.readFile>) {
      if (args[0] === assetRead.path) {
        assetRead.observed?.(++assetRead.count);
        await assetRead.pause;
      }
      return fs.readFile(...args);
    },
  };
});

async function fixturePreview() {
  const fixtures = resolve("benchmarks/fixtures/composition"),
    directory = await mkdtemp(join(fixtures, "export-owner-")),
    input = join(directory, "source.json"),
    asset = join(directory, "art.svg"),
    bytes = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="red"/></svg>',
    );
  const document: Composition = {
    schemaVersion: "composition-1",
    id: "export-owner",
    width: 64,
    height: 64,
    fps: 24,
    frameCount: 2,
    assets: [
      {
        id: "art",
        type: "image",
        path: "art.svg",
        width: 4,
        height: 4,
        sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      },
    ],
    layers: [
      {
        id: "picture",
        type: "image",
        size: [4, 4],
        sources: [{ asset: "art" }],
      },
    ],
  };
  await writeFile(asset, bytes);
  await writeFile(input, JSON.stringify(document));
  const server = await createServer({
    configFile: false,
    logLevel: "silent",
    plugins: [compositionApi()],
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const endpoint = new URL(
    `/composition/export?scene=${encodeURIComponent(relative(fixtures, input))}`,
    server.resolvedUrls!.local[0]!,
  );
  return {
    asset,
    bytes,
    request: () =>
      fetch(endpoint, {
        method: "POST",
        headers: { "x-still-shift-composition": "1" },
        body: JSON.stringify({ document, backend: "canvas2d" }),
      }),
    async close() {
      await server.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

it("rejects a second fixture export while the first is still reading its assets", async () => {
  const preview = await fixturePreview();
  let release!: () => void, firstRead!: () => void, secondRead!: () => void;
  const firstStarted = new Promise<void>((resolve) => (firstRead = resolve)),
    duplicatedRead = new Promise<string>(
      (resolve) => (secondRead = () => resolve("second asset read")),
    );
  assetRead.path = preview.asset;
  assetRead.pause = new Promise<void>((resolve) => (release = resolve));
  assetRead.count = 0;
  assetRead.observed = (count) => (count === 1 ? firstRead() : secondRead());
  try {
    const first = preview.request();
    await firstStarted;
    const second = preview.request();
    // Observe either a busy response or the forbidden second read before releasing I/O.
    const observed = await Promise.race([
      second.then((response) => response.status),
      duplicatedRead,
    ]);
    release();
    const replies = await Promise.all([first, second]);
    const bodies = await Promise.all(
      replies.map((response) => response.arrayBuffer()),
    );
    expect(observed).toBe(409);
    expect(replies.map((response) => response.status)).toEqual([200, 409]);
    expect(replies[0]!.headers.get("content-type")).toBe("video/mp4");
    expect(bodies[0]!.byteLength).toBeGreaterThan(0);
    expect(
      JSON.parse(Buffer.from(bodies[1]!).toString()).diagnostics,
    ).toMatchObject([{ code: "comp-edit-busy", severity: "error" }]);
    expect(assetRead.count).toBe(1);
  } finally {
    release();
    assetRead.path = "";
    assetRead.pause = undefined;
    assetRead.observed = undefined;
    await preview.close();
  }
}, 60_000);

it("releases fixture-export ownership when reading a registered asset fails", async () => {
  const preview = await fixturePreview();
  try {
    await rm(preview.asset);
    const failed = await preview.request();
    expect(failed.status).toBe(500);
    await failed.arrayBuffer();
    await writeFile(preview.asset, preview.bytes);
    const recovered = await preview.request();
    expect(recovered.status).toBe(200);
    expect(recovered.headers.get("content-type")).toBe("video/mp4");
    expect((await recovered.arrayBuffer()).byteLength).toBeGreaterThan(0);
  } finally {
    await preview.close();
  }
}, 60_000);
