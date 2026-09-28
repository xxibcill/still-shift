import { mkdtemp, readdir, rm, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer, type ViteDevServer } from "vite";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { passageSfxApi } from "../../apps/lab/passage-sfx-api.ts";

let root: string, base: string, server: ViteDevServer;
const fetcher = vi
  .fn()
  .mockImplementation(() =>
    Promise.resolve(new Response("private-message", { status: 429 })),
  );
const input = () => ({
  requestId: randomUUID(),
  provider: "elevenlabs",
  id: "tap",
  prompt: "Wooden tap",
  durationSeconds: 1,
});
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "sfx-api-"));
  server = await createServer({
    configFile: false,
    root,
    plugins: [
      passageSfxApi({
        root,
        provider: { apiKey: "test-secret", fetch: fetcher },
      }),
    ],
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  base = server.resolvedUrls!.local[0]!;
});
afterAll(async () => {
  await server?.close();
  await rm(root, { recursive: true, force: true });
});
const post = (
  body: unknown,
  origin = new URL(base).origin,
  contentType = "application/json",
) =>
  fetch(base + "passage-api/sfx", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": contentType },
    body: JSON.stringify(body),
  });

it("exposes capability but never credentials", async () => {
  const response = await fetch(base + "passage-api/sfx/config");
  const body = await response.text();
  expect(JSON.parse(body).configured).toBe(true);
  expect(body).not.toContain("test-secret");
});
it("blocks cross-origin, non-JSON and invalid requests before spending credits", async () => {
  expect((await post(input(), "https://another.example")).status).toBe(403);
  expect((await post(input(), new URL(base).origin, "text/plain")).status).toBe(
    415,
  );
  expect((await post({ ...input(), id: "../../escape" })).status).toBe(400);
  expect((await post({ ...input(), requestId: "../escape" })).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});
it("makes one request per take even if the client repeats after failure", async () => {
  const body = input();
  expect((await post(body)).status).toBe(429);
  expect((await post(body)).status).toBe(409);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(await readdir(join(root, "assets/generated-sfx"))).toEqual([
    `tap-${body.requestId}`,
  ]);
});
it("rejects a generated-assets directory symlink before spending credits", async () => {
  await rm(join(root, "assets/generated-sfx"), { recursive: true });
  await mkdir(join(root, "outside"));
  await symlink(join(root, "outside"), join(root, "assets/generated-sfx"));
  expect((await post(input())).status).toBe(400);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
