import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CompositionSurfaceStore,
  type CompositionSurfaceIdentity,
} from "../../packages/execution-runtime/src/composition-surface-store.ts";

const hash = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const identity: CompositionSurfaceIdentity = {
  path: "root/static-precomp",
  key: hash("complete evaluated state"),
  width: 16,
  height: 16,
  encoding: "rgba8-straight",
};
const pixels = Buffer.from(
  Array.from({ length: 16 * 16 * 4 }, (_, byte) => byte % 256),
);
let directory: string;
let store: CompositionSurfaceStore;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "composition-surface-store-test-"));
  store = await CompositionSurfaceStore.create(directory, {
    workers: 4,
    byteLimit: 4096,
  });
});
afterEach(async () => {
  await store.dispose();
  await rm(directory, { recursive: true, force: true });
});

describe("export-owned canonical surface store", () => {
  it("preserves raw float32 premultiplied channel bits without byte quantization", async () => {
    const floats = new Float32Array(16 * 16 * 4);
    for (let pixel = 0; pixel < 256; pixel++)
      floats.set([0.25, 0.125, 0.0625, 0.5], pixel * 4);
    const bytes = Buffer.from(floats.buffer);
    const floating = {
      ...identity,
      encoding: "rgba32f-premultiplied" as const,
    };
    const producer = await store.claim(0, floating);
    if (producer.kind !== "lease") throw Error("Expected producer lease");
    expect(producer.byteLength).toBe(4096);
    await store.publish(0, producer.token, Readable.from([bytes]), hash(bytes));
    const consumer = await store.claim(1, floating);
    if (consumer.kind !== "hit") throw Error("Expected complete surface");
    expect(await readFile(consumer.file.path)).toEqual(bytes);
  });
  it("rejects an oversized individual chunk even when its frame fits the aggregate budget", async () => {
    await store.dispose();
    store = await CompositionSurfaceStore.create(directory, {
      workers: 4,
      byteLimit: 129 * 129 * 4,
    });
    const producer = await store.claim(0, {
      ...identity,
      width: 129,
      height: 129,
    });
    if (producer.kind !== "lease") throw Error("Expected producer lease");
    const bytes = Buffer.alloc(producer.byteLength);
    await expect(
      store.publish(0, producer.token, Readable.from([bytes]), hash(bytes)),
    ).rejects.toThrow("byte bound");
    expect(store.statistics.writtenDiskBytes).toBe(0);
  });
  it("gives one producer lease, waits for it, and preserves exact immutable bytes for four workers", async () => {
    const producer = await store.claim(0, identity);
    if (producer.kind !== "lease") throw Error("Expected producer lease");
    const consumers = [1, 2, 3].map((worker) => store.claim(worker, identity));
    expect(store.statistics).toMatchObject({
      leasesGranted: 1,
      waits: 3,
      publishedSurfaces: 0,
      reservedDiskBytes: 1024,
    });
    await store.publish(
      0,
      producer.token,
      Readable.from([pixels.subarray(0, 63), pixels.subarray(63)]),
      hash(pixels),
    );
    for (const result of await Promise.all(consumers)) {
      if (result.kind !== "hit") throw Error("Expected complete surface");
      expect(result.file.checksum).toBe(hash(pixels));
      expect(await readFile(result.file.path)).toEqual(pixels);
      expect(() => Object.assign(result.file, { path: "/outside" })).toThrow();
    }
    expect((await store.claim(0, identity)).kind).toBe("hit");
    expect(store.statistics).toMatchObject({
      leasesGranted: 1,
      hits: 4,
      waits: 3,
      publishedSurfaces: 1,
      writtenDiskBytes: 1024,
    });
  });
  it("reuses a static first state after local eviction and never confuses a changed state with it", async () => {
    const producer = await store.claim(0, identity);
    if (producer.kind !== "lease") throw Error("Expected producer lease");
    await store.publish(
      0,
      producer.token,
      Readable.from([pixels]),
      hash(pixels),
    );
    expect(
      await store.claim(1, {
        ...identity,
        key: hash("changed source ordinal"),
      }),
    ).toEqual({ kind: "uncached" });
    expect((await store.claim(3, identity)).kind).toBe("hit");
    expect(store.statistics).toMatchObject({
      dynamicPaths: 1,
      leasesGranted: 1,
      publishedSurfaces: 1,
    });
  });
  it("rejects recursive ownership, foreign publishers, duplicate uploads and changed storage", async () => {
    const producer = await store.claim(0, identity);
    if (producer.kind !== "lease") throw Error("Expected producer lease");
    await expect(store.claim(0, identity)).rejects.toThrow("own pending lease");
    await expect(
      store.publish(1, producer.token, Readable.from([pixels]), hash(pixels)),
    ).rejects.toThrow("own its lease");
    await expect(store.claim(1, { ...identity, width: 32 })).rejects.toThrow(
      "different storage",
    );
    await store.publish(
      0,
      producer.token,
      Readable.from([pixels]),
      hash(pixels),
    );
    await expect(
      store.publish(0, producer.token, Readable.from([pixels]), hash(pixels)),
    ).rejects.toThrow("own its lease");
  });
  it.each(["truncated", "checksum", "oversized"] as const)(
    "rejects %s bytes and sends the original upload failure to every waiting consumer",
    async (failure) => {
      const producer = await store.claim(0, identity);
      if (producer.kind !== "lease") throw Error("Expected producer lease");
      const consumer = store.claim(1, identity);
      consumer.catch(() => undefined);
      const bytes =
        failure === "truncated"
          ? pixels.subarray(0, -1)
          : failure === "oversized"
            ? Buffer.alloc(1025)
            : pixels;
      const checksum =
        failure === "checksum" ? hash("foreign bytes") : hash(bytes);
      let reason: unknown;
      await store
        .publish(0, producer.token, Readable.from([bytes]), checksum)
        .catch((error: unknown) => {
          reason = error;
        });
      expect(reason).toBeInstanceOf(Error);
      await expect(consumer).rejects.toBe(reason);
      expect(store.statistics.publishedSurfaces).toBe(0);
    },
  );
  it("reserves aggregate file and entry bounds before granting another draw lease", async () => {
    await store.dispose();
    store = await CompositionSurfaceStore.create(directory, {
      workers: 4,
      byteLimit: 2048,
      entryLimit: 2,
    });
    await store.claim(0, identity);
    await store.claim(1, { ...identity, path: "root/second" });
    await expect(
      store.claim(2, { ...identity, path: "root/third" }),
    ).rejects.toThrow("export budget");
    expect(store.statistics.reservedDiskBytes).toBe(2048);
    await expect(store.claim(4, identity)).rejects.toThrow("Unknown");
    await expect(
      store.claim(2, {
        ...identity,
        path: "../../outside",
        width: 32768,
        height: 32768,
      }),
    ).rejects.toThrow("contract");
    expect(store.statistics.leasesGranted).toBe(2);
  });
  it.each(["entries", "bytes"] as const)(
    "returns typed %s saturation only for an explicitly optional claim",
    async (limit) => {
      await store.dispose();
      store = await CompositionSurfaceStore.create(directory, {
        workers: 4,
        byteLimit: limit === "bytes" ? 1024 : 4096,
        entryLimit: limit === "entries" ? 1 : 4,
      });
      await store.claim(0, identity);
      const optional = {
        ...identity,
        path: "source:glyph-tint:second",
        fallback: "uncached" as const,
      };
      await expect(store.claim(1, optional)).resolves.toEqual({
        kind: "uncached",
        reason: "capacity",
      });
      await expect(
        store.claim(1, { ...identity, path: optional.path }),
      ).rejects.toThrow("export budget");
      await expect(store.claim(1, { ...optional, width: 0 })).rejects.toThrow(
        "contract",
      );
      await expect(store.claim(4, optional)).rejects.toThrow("Unknown");
      await expect(
        store.claim(1, {
          ...optional,
          fallback: "invalid",
        } as unknown as CompositionSurfaceIdentity),
      ).rejects.toThrow("contract");
      expect(store.statistics.leasesGranted).toBe(1);
      expect(store.statistics.reservedDiskBytes).toBe(1024);
      await expect(
        store.claim(1, {
          ...identity,
          key: hash("changed source"),
          fallback: "uncached",
        }),
      ).resolves.toEqual({ kind: "uncached" });
      const reason = Error("cancelled after saturation");
      await store.dispose(reason);
      await expect(store.claim(1, optional)).rejects.toBe(reason);
    },
  );
  it("cancels active publication and pending consumers with the original reason, then removes only owned files", async () => {
    await writeFile(join(directory, "foreign-output"), "another job");
    const producer = await store.claim(0, identity);
    if (producer.kind !== "lease") throw Error("Expected producer lease");
    const consumer = store.claim(1, identity);
    const input = new PassThrough();
    const publishing = store.publish(0, producer.token, input, hash(pixels));
    input.write(pixels.subarray(0, 32));
    const reason = Error("Owner cancelled during cache upload");
    const publishingResult = expect(publishing).rejects.toBe(reason);
    const consumerResult = expect(consumer).rejects.toBe(reason);
    await store.dispose(reason);
    await Promise.all([publishingResult, consumerResult]);
    expect(await readdir(directory)).toEqual(["foreign-output"]);
    expect(await readFile(join(directory, "foreign-output"), "utf8")).toBe(
      "another job",
    );
    await expect(store.claim(2, identity)).rejects.toBe(reason);
    expect(store.statistics.reservedDiskBytes).toBe(0);
  });
});
