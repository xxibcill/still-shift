import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "vite";
import { expect, it } from "vitest";
import { compositionApi } from "../../apps/lab/composition-api.ts";
import { binaryCompositionFixture } from "../helpers/native-pbr-binary-composition-fixture.ts";
it("serves only the prepared Lab capture's verified PBR binary route with exact Content-Length", async () => {
  const fixtures = resolve("benchmarks/fixtures/composition"),
    directory = await mkdtemp(join(fixtures, "pbr-binary-route-")),
    cache = await mkdtemp(join(tmpdir(), "pbr-route-vite-"));
  const fixture = binaryCompositionFixture(),
    scene = join(directory, "composition.json");
  let server: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    await writeFile(join(directory, "source3.json"), fixture.sourceBytes);
    await writeFile(join(directory, "surface.rgba"), fixture.pixels);
    await writeFile(scene, JSON.stringify(fixture.composition));
    server = await createServer({
      configFile: false,
      cacheDir: cache,
      logLevel: "silent",
      plugins: [compositionApi()],
      server: { host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    const base = server.resolvedUrls!.local[0]!,
      query = "scene=" + encodeURIComponent(relative(fixtures, scene));
    const prepared = await fetch(
      new URL(`/composition/prepare?${query}`, base),
      {
        method: "POST",
        headers: {
          "x-still-shift-composition": "1",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          document: fixture.composition,
        }),
      },
    );
    expect(prepared.status, await prepared.clone().text()).toBe(200);
    const capture = (await prepared.json()) as {
      capture: string;
      assets: Record<string, string>;
      preparedNative3D: {
        version: string;
        assets: { lever: { binaryResources: { asset: string }[] } };
      };
    };
    expect(capture.preparedNative3D.version).toBe(
      "composition-prepared-native3d-3",
    );
    const reference = capture.preparedNative3D.assets.lever.binaryResources[0]!,
      url = new URL(capture.assets[reference.asset]!, base);
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Length")).toBe("4");
    expect(response.headers.get("Content-Type")).toBe(
      "application/octet-stream",
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      fixture.pixels,
    );
    url.searchParams.set("id", "native-pbr/" + "0".repeat(64));
    expect((await fetch(url)).status).toBe(404);
  } finally {
    await server?.close();
    await rm(directory, { recursive: true, force: true });
    await rm(cache, { recursive: true, force: true });
  }
}, 15000);
