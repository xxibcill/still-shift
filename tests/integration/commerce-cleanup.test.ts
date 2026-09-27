import { mkdtemp, readFile, rm } from "node:fs/promises";
import type * as FileSystem from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createLogger, createServer } from "vite";
import { commerceApi } from "../../apps/lab/commerce-api.ts";
import { CommerceSceneSchema } from "../../packages/scene-contract/src/commerce.ts";

const cleanup = vi.hoisted(() => ({
  fail: false,
  directories: [] as string[],
}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof FileSystem>();
  return {
    ...fs,
    rm: async (...args: Parameters<typeof fs.rm>) => {
      const path = String(args[0]);
      if (cleanup.fail && basename(path).startsWith("still-shift-commerce-")) {
        cleanup.fail = false;
        cleanup.directories.push(path);
        throw new Error("Injected temporary-directory removal failure");
      }
      return fs.rm(...args);
    },
  };
});

describe("Commerce export recovery", () => {
  it("releases the busy state and reports a cleanup failure", async () => {
    const scene = CommerceSceneSchema.parse(
      JSON.parse(
        await readFile(
          "benchmarks/fixtures/ecommerce-motion/a01-beauty-feed.json",
          "utf8",
        ),
      ),
    );
    const body = JSON.stringify({
      scene,
      files: [...scene.assets, ...scene.fonts].map(({ id }) => ({
        id,
        base64: "AQ==",
      })),
    });
    const cacheDir = await mkdtemp(join(tmpdir(), "commerce-cleanup-vite-"));
    const logger = createLogger("silent");
    const logged = vi.spyOn(logger, "error");
    const server = await createServer({
      configFile: false,
      cacheDir,
      customLogger: logger,
      plugins: [commerceApi()],
      optimizeDeps: { noDiscovery: true },
      server: { host: "127.0.0.1", port: 0, strictPort: false },
    });
    try {
      await server.listen();
      const request = () =>
        fetch(server.resolvedUrls!.local[0]! + "commerce/export", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-still-shift": "commerce",
          },
          body,
        });
      cleanup.fail = true;
      const first = await request();
      expect(first.status).toBe(422);
      expect(await first.text()).toContain("Asset checksum differs");
      await vi.waitFor(() =>
        expect(logged).toHaveBeenCalledWith(
          expect.stringContaining("Commerce export cleanup failed"),
        ),
      );
      const retry = await request();
      expect(retry.status).toBe(422);
      expect(await retry.text()).toContain("Asset checksum differs");
    } finally {
      cleanup.fail = false;
      await server.close();
      const fs = await vi.importActual<typeof FileSystem>("node:fs/promises");
      await Promise.all(
        cleanup.directories
          .splice(0)
          .map((path) => fs.rm(path, { recursive: true, force: true })),
      );
      await rm(cacheDir, { recursive: true, force: true });
      logged.mockRestore();
    }
  }, 30_000);
});
