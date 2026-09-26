import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createServer } from "vite";
import { commerceApi } from "../../apps/lab/commerce-api.ts";
import { CommerceSceneSchema } from "../../packages/scene-contract/src/commerce.ts";

describe("commerce export upload", () => {
  it("accepts two permitted product images beyond the old aggregate limit", async () => {
    const scene = CommerceSceneSchema.parse(
      JSON.parse(
        await readFile(
          "benchmarks/fixtures/ecommerce-motion/a01-beauty-feed.json",
          "utf8",
        ),
      ),
    );
    const image = Buffer.alloc(13_000_000).toString("base64");
    const font = await readFile(
      "assets/ecommerce-motion/fonts/noto-sans-thai.ttf",
    );
    const body = JSON.stringify({
      scene,
      files: [
        ...scene.assets.map((asset) => ({ id: asset.id, base64: image })),
        { id: scene.fonts[0]!.id, base64: font.toString("base64") },
      ],
    });
    expect(Buffer.byteLength(body)).toBeGreaterThan(32_000_000);
    const cacheDir = await mkdtemp(join(tmpdir(), "commerce-api-vite-"));
    let server: Awaited<ReturnType<typeof createServer>> | undefined;
    try {
      server = await createServer({
        configFile: false,
        cacheDir,
        plugins: [commerceApi()],
        server: { port: 0, strictPort: false },
      });
      await server.listen();
      const response = await fetch(
        server.resolvedUrls!.local[0]! + "commerce/export",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-still-shift": "commerce",
          },
          body,
        },
      );
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        error: "Asset checksum differs: product-image",
      });
    } finally {
      await server?.close();
      await rm(cacheDir, { recursive: true, force: true });
    }
  }, 30_000);
});
