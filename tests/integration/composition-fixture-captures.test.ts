import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { createServer } from "vite";
import { expect, it, vi } from "vitest";
import { compositionApi } from "../../apps/lab/composition-api.ts";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import type { Composition } from "@still-shift/scene-contract";
import {
  mediaPngChunk,
  mediaRgbaPng,
} from "../helpers/composition-media-png.ts";

async function fixturePreview(padding = 1) {
  const fixtures = resolve("benchmarks/fixtures/composition");
  const directory = await mkdtemp(join(fixtures, "capture-lifetime-"));
  const cache = await mkdtemp(join(tmpdir(), "fixture-capture-cache-"));
  vi.stubEnv("STILL_SHIFT_COMPOSITION_MEDIA_CACHE", cache);
  const png = mediaRgbaPng(
    8,
    8,
    Buffer.from(Array.from({ length: 64 }, () => [24, 128, 64, 255]).flat()),
    [mediaPngChunk("sRGB", Buffer.from([0]))],
  );
  const hash = (bytes: Uint8Array) =>
    "sha256:" + createHash("sha256").update(bytes).digest("hex");
  const manifest = Buffer.from(
    JSON.stringify({
      schemaVersion: "composition-sequence-1",
      frames: [hash(png)],
    }),
  );
  await writeFile(
    join(directory, `frame-${String(0).padStart(padding, "0")}.png`),
    png,
  );
  await writeFile(join(directory, "manifest.json"), manifest);
  const document: Composition = {
    schemaVersion: "composition-1",
    id: "capture-lifetime",
    width: 64,
    height: 64,
    fps: 24,
    frameCount: 1,
    assets: [
      {
        id: "frames",
        type: "sequence",
        path: `frame-%0${padding}d.png`,
        manifestPath: "manifest.json",
        firstFrame: 0,
        sha256: hash(manifest),
        width: 8,
        height: 8,
        frameCount: 1,
        frameRate: { numerator: 24, denominator: 1 },
        color: {
          primaries: "bt709",
          transfer: "iec61966-2-1",
          matrix: "gbr",
          range: "pc",
        },
      },
    ],
    layers: [
      {
        id: "picture",
        type: "sequence",
        asset: "frames",
        size: [64, 64],
        fit: "stretch",
        transform: { position: [32, 32] },
      },
    ],
  };
  const input = join(directory, "source.json");
  await writeFile(input, JSON.stringify(document));
  const server = await createServer({
    configFile: false,
    cacheDir: join(cache, "vite"),
    logLevel: "silent",
    plugins: [compositionApi()],
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const base = server.resolvedUrls!.local[0]!;
  const query = "scene=" + encodeURIComponent(relative(fixtures, input));
  const post = (route: string, body: unknown) =>
    fetch(new URL(`/composition/${route}?${query}`, base), {
      method: "POST",
      headers: {
        "x-still-shift-composition": "1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  return {
    server,
    base,
    document,
    cache,
    exportDraft: () => post("export", { document, backend: "canvas2d" }),
    prepare: (extra = {}) => post("prepare", { document, ...extra }),
    release: (capture: string, owner?: string) =>
      post("capture-release", { capture, ...(owner ? { owner } : {}) }),
    asset: (path: string) => fetch(new URL(path, base)),
    async close() {
      await server.close();
      await rm(directory, { recursive: true, force: true });
      await rm(cache, { recursive: true, force: true });
      vi.unstubAllEnvs();
    },
  };
}

async function fixtureOwner(
  preview: Awaited<ReturnType<typeof fixturePreview>>,
) {
  const base = new URL(preview.base).origin;
  const socket = new WebSocket(
    `${base.replace("http:", "ws:")}/?token=${preview.server.config.webSocketToken}`,
    "vite-hmr",
  );
  try {
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("Fixture HMR failed")),
        { once: true },
      );
    });
    const request = randomUUID();
    const owner = await new Promise<string>((resolve, reject) => {
      const receive = (event: MessageEvent) => {
        const packet = JSON.parse(String(event.data));
        if (
          packet.event !== "composition-fixture:retained" ||
          packet.data.request !== request
        )
          return;
        socket.removeEventListener("message", receive);
        if (packet.data.owner) resolve(packet.data.owner);
        else reject(new Error(JSON.stringify(packet.data.diagnostics)));
      };
      socket.addEventListener("message", receive);
      socket.send(
        JSON.stringify({
          type: "custom",
          event: "composition-fixture:retain",
          data: { request },
        }),
      );
    });
    return { socket, owner };
  } catch (error) {
    socket.close();
    throw error;
  }
}

it("keeps registered native captures through additional prepares and releases only the disposed capture", async () => {
  const preview = await fixturePreview();
  try {
    const captures: { capture: string; assets: Record<string, string> }[] = [];
    for (let index = 0; index < 6; index++) {
      const response = await preview.prepare();
      expect(response.status).toBe(200);
      captures.push(await response.json());
    }
    for (const capture of captures) {
      expect(
        (await preview.asset(capture.assets["__media:frames:0"]!)).status,
      ).toBe(200);
      expect(typeof capture.capture).toBe("string");
    }
    expect((await preview.release(captures[0]!.capture)).status).toBe(204);
    expect((await preview.release(captures[0]!.capture)).status).toBe(204);
    expect(
      (await preview.asset(captures[0]!.assets["__media:frames:0"]!)).status,
    ).toBe(404);
    expect(
      (await preview.asset(captures[5]!.assets["__media:frames:0"]!)).status,
    ).toBe(200);
  } finally {
    await preview.close();
  }
}, 30_000);

it("bounds live and pending fixture captures without evicting an existing owner", async () => {
  const preview = await fixturePreview();
  try {
    const captures: { capture: string; assets: Record<string, string> }[] = [];
    for (let index = 0; index < 64; index++) {
      const response = await preview.prepare();
      expect(response.status).toBe(200);
      captures.push(await response.json());
    }
    expect((await preview.prepare()).status).toBe(409);
    expect(
      (await preview.asset(captures[0]!.assets["__media:frames:0"]!)).status,
    ).toBe(200);
    expect((await preview.release(captures[0]!.capture)).status).toBe(204);
    expect((await preview.prepare()).status).toBe(200);
  } finally {
    await preview.close();
  }
}, 60_000);

it("releases a disconnected fixture page's captures while keeping peer resources", async () => {
  const preview = await fixturePreview();
  const { socket, owner } = await fixtureOwner(preview);
  try {
    const owned = await (await preview.prepare({ owner })).json();
    const peer = await (await preview.prepare()).json();
    const closed = new Promise<void>((resolve) =>
      socket.addEventListener("close", () => resolve(), { once: true }),
    );
    socket.close();
    await closed;
    await expect
      .poll(
        async () =>
          (await preview.asset(owned.assets["__media:frames:0"])).status,
      )
      .toBe(404);
    expect((await preview.asset(peer.assets["__media:frames:0"])).status).toBe(
      200,
    );
  } finally {
    socket.close();
    await preview.close();
  }
}, 30_000);

it("rejects duplicate UUID reservations and late disposed requests without changing active URLs", async () => {
  const preview = await fixturePreview();
  try {
    const capture = randomUUID();
    const active = await (await preview.prepare({ capture })).json();
    expect((await preview.prepare({ capture })).status).toBe(409);
    expect(
      (await preview.asset(active.assets["__media:frames:0"])).status,
    ).toBe(200);
    const cancelled = randomUUID();
    expect((await preview.release(cancelled)).status).toBe(204);
    expect((await preview.prepare({ capture: cancelled })).status).toBe(409);
    expect((await preview.prepare()).status).toBe(200);
    expect(
      (await preview.asset(active.assets["__media:frames:0"])).status,
    ).toBe(200);
  } finally {
    await preview.close();
  }
}, 30_000);

it("keeps early cancellations bound to their owner and never evicts delayed cancellation records", async () => {
  const preview = await fixturePreview();
  const first = await fixtureOwner(preview);
  const peer = await fixtureOwner(preview);
  try {
    const cancelled = randomUUID();
    expect((await preview.release(cancelled, first.owner)).status).toBe(204);
    expect((await preview.release(cancelled, peer.owner)).status).toBe(409);
    expect(
      (await preview.prepare({ capture: cancelled, owner: peer.owner })).status,
    ).toBe(409);
    for (let index = 0; index < 128; index++)
      expect((await preview.release(randomUUID(), first.owner)).status).toBe(
        204,
      );
    expect(
      (await preview.prepare({ capture: cancelled, owner: first.owner }))
        .status,
    ).toBe(409);
    expect((await preview.prepare({ owner: first.owner })).status).toBe(409);
    expect((await preview.prepare({ owner: peer.owner })).status).toBe(200);
  } finally {
    first.socket.close();
    peer.socket.close();
    await preview.close();
  }
}, 30_000);

it.each([10, 99])(
  "prepares, serves and exports registered sequences with %i-digit padding",
  async (padding) => {
    const preview = await fixturePreview(padding);
    try {
      const response = await preview.prepare();
      expect(response.status).toBe(200);
      const capture = (await response.json()) as {
        capture: string;
        assets: Record<string, string>;
      };
      const frame = await preview.asset(capture.assets["__media:frames:0"]!);
      expect(frame.status).toBe(200);
      expect(frame.headers.get("content-type")).toBe("image/png");
      expect(Buffer.from(await frame.arrayBuffer()).subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      const exported = await preview.exportDraft();
      expect(exported.status).toBe(200);
      expect(exported.headers.get("content-type")).toBe("video/mp4");
      const output = join(preview.cache, "padded-sequence.mp4");
      await writeFile(output, Buffer.from(await exported.arrayBuffer()));
      const probe = await runProcess("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,nb_frames",
        "-of",
        "json",
        output,
      ]);
      expect(JSON.parse(probe.stdout).streams).toEqual([
        { width: 64, height: 64, nb_frames: "1" },
      ]);
      const decoded = join(preview.cache, "padded-sequence.rgb");
      await runProcess("ffmpeg", [
        "-v",
        "error",
        "-i",
        output,
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        decoded,
      ]);
      const pixels = await readFile(decoded);
      // Independent source-color oracle for the encoded frame's center pixel.
      const center = (32 * 64 + 32) * 3;
      for (const [channel, expected] of [24, 128, 64].entries())
        expect(
          Math.abs(pixels[center + channel]! - expected),
        ).toBeLessThanOrEqual(3);
      expect((await preview.release(capture.capture)).status).toBe(204);
    } finally {
      await preview.close();
    }
  },
  60_000,
);
