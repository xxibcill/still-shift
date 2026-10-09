import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, open, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Readable } from "node:stream";

export type CompositionSurfaceIdentity = {
  path: string;
  key: string;
  width: number;
  height: number;
  encoding: "rgba8-straight" | "rgba8-premultiplied" | "rgba32f-premultiplied";
  fallback?: "uncached";
};

type SurfaceFile = Readonly<{
  path: string;
  byteLength: number;
  checksum: string;
}>;
type Lease = { kind: "lease"; token: string; byteLength: number };
type Entry = {
  identity: CompositionSurfaceIdentity;
  worker: number;
  token: string;
  filePath: string;
  byteLength: number;
  publishing: boolean;
  settled: boolean;
  dynamic: boolean;
  ready: Promise<SurfaceFile>;
  resolve: (file: SurfaceFile) => void;
  reject: (reason: unknown) => void;
};

const checksumPattern = /^sha256:[a-f0-9]{64}$/;

/** Export-owned immutable surface files; worker eviction never requires a static repaint. */
export class CompositionSurfaceStore {
  private readonly entries = new Map<string, Entry>();
  private readonly tokens = new Map<string, Entry>();
  private readonly writers = new Map<Readable, Promise<void>>();
  private closed: Error | undefined;
  private reservedBytes = 0;
  private writtenBytes = 0;
  private leasesGranted = 0;
  private hits = 0;
  private waits = 0;
  private publishedSurfaces = 0;
  private dynamicPaths = 0;

  private readonly directory: string;
  private readonly workers: number;
  private readonly byteLimit: number;
  private readonly entryLimit: number;

  private constructor(
    directory: string,
    workers: number,
    byteLimit: number,
    entryLimit: number,
  ) {
    this.directory = directory;
    this.workers = workers;
    this.byteLimit = byteLimit;
    this.entryLimit = entryLimit;
  }

  static async create(
    parent: string,
    options: { workers: number; byteLimit: number; entryLimit?: number },
  ) {
    const entryLimit = options.entryLimit ?? 4096;
    if (
      !Number.isInteger(options.workers) ||
      options.workers < 1 ||
      options.workers > 4 ||
      !Number.isSafeInteger(options.byteLimit) ||
      options.byteLimit < 1 ||
      options.byteLimit > 8 * 1024 ** 3 ||
      !Number.isInteger(entryLimit) ||
      entryLimit < 1 ||
      entryLimit > 4096
    )
      throw Error("Composition surface store limits are invalid");
    const directory = await mkdtemp(join(parent, "composition-surfaces-"));
    return new CompositionSurfaceStore(
      directory,
      options.workers,
      options.byteLimit,
      entryLimit,
    );
  }

  get statistics() {
    return {
      leasesGranted: this.leasesGranted,
      hits: this.hits,
      waits: this.waits,
      publishedSurfaces: this.publishedSurfaces,
      reservedDiskBytes: this.reservedBytes,
      writtenDiskBytes: this.writtenBytes,
      dynamicPaths: this.dynamicPaths,
    };
  }

  private assertOpen() {
    if (this.closed) throw this.closed;
  }
  private assertWorker(worker: number) {
    if (!Number.isInteger(worker) || worker < 0 || worker >= this.workers)
      throw Error("Unknown composition cache worker");
  }

  async claim(
    worker: number,
    identity: CompositionSurfaceIdentity,
  ): Promise<
    | Lease
    | { kind: "hit"; file: SurfaceFile }
    | { kind: "uncached"; reason?: "capacity" }
  > {
    this.assertOpen();
    this.assertWorker(worker);
    const channelBytes = identity.encoding === "rgba32f-premultiplied" ? 4 : 1;
    const byteLength = identity.width * identity.height * 4 * channelBytes;
    if (
      typeof identity.path !== "string" ||
      identity.path.length < 1 ||
      identity.path.length > 256 ||
      !checksumPattern.test(identity.key) ||
      (identity.fallback !== undefined && identity.fallback !== "uncached") ||
      ![
        "rgba8-straight",
        "rgba8-premultiplied",
        "rgba32f-premultiplied",
      ].includes(identity.encoding) ||
      !Number.isInteger(identity.width) ||
      !Number.isInteger(identity.height) ||
      identity.width < 1 ||
      identity.height < 1 ||
      identity.width > 32768 ||
      identity.height > 32768 ||
      !Number.isSafeInteger(byteLength) ||
      byteLength > this.byteLimit
    )
      throw Error("Composition surface identity exceeds its contract");
    const existing = this.entries.get(identity.path);
    if (existing) {
      if (existing.identity.key !== identity.key) {
        if (!existing.dynamic) {
          existing.dynamic = true;
          this.dynamicPaths++;
        }
        return { kind: "uncached" };
      }
      if (
        existing.identity.width !== identity.width ||
        existing.identity.height !== identity.height ||
        existing.identity.encoding !== identity.encoding
      )
        throw Error("Composition surface key reused with different storage");
      if (!existing.settled && existing.worker === worker)
        throw Error(
          "Composition cache dependency requests its own pending lease",
        );
      if (!existing.settled) this.waits++;
      const file = await existing.ready;
      this.assertOpen();
      this.hits++;
      return { kind: "hit", file };
    }
    if (
      this.entries.size >= this.entryLimit ||
      this.reservedBytes + byteLength > this.byteLimit
    ) {
      if (identity.fallback === "uncached")
        return { kind: "uncached", reason: "capacity" };
      throw Error("Composition static surface cache exceeds its export budget");
    }
    let resolve!: Entry["resolve"], reject!: Entry["reject"];
    const ready = new Promise<SurfaceFile>((accept, fail) => {
      resolve = accept;
      reject = fail;
    });
    ready.catch(() => undefined);
    const token = randomUUID();
    const entry: Entry = {
      identity: { ...identity },
      worker,
      token,
      filePath: join(this.directory, `${this.entries.size}.rgba`),
      byteLength,
      publishing: false,
      settled: false,
      dynamic: false,
      ready,
      resolve,
      reject,
    };
    this.entries.set(identity.path, entry);
    this.tokens.set(token, entry);
    this.reservedBytes += byteLength;
    this.leasesGranted++;
    return { kind: "lease", token, byteLength };
  }

  async publish(
    worker: number,
    token: string,
    input: Readable,
    expectedChecksum: string,
  ) {
    this.assertOpen();
    this.assertWorker(worker);
    const entry = this.tokens.get(token);
    if (
      !entry ||
      entry.worker !== worker ||
      entry.publishing ||
      !checksumPattern.test(expectedChecksum)
    )
      throw Error("Composition cache publication does not own its lease");
    entry.publishing = true;
    const consumeError = () => undefined;
    input.on("error", consumeError);
    const write = this.write(entry, input, expectedChecksum);
    this.writers.set(input, write);
    try {
      await write;
    } finally {
      this.writers.delete(input);
      input.off("error", consumeError);
    }
  }

  private async write(entry: Entry, input: Readable, expectedChecksum: string) {
    let file: Awaited<ReturnType<typeof open>> | undefined;
    try {
      file = await open(entry.filePath, "wx");
      const hash = createHash("sha256");
      let received = 0;
      for await (const part of input) {
        this.assertOpen();
        if (!(part instanceof Uint8Array) || part.byteLength > 65536)
          throw Error("Composition surface upload exceeds its byte bound");
        received += part.byteLength;
        if (received > entry.byteLength)
          throw Error("Composition surface upload exceeds its byte bound");
        const bytes = Buffer.from(part);
        hash.update(bytes);
        let offset = 0;
        while (offset < bytes.length) {
          const { bytesWritten } = await file.write(
            bytes,
            offset,
            bytes.length - offset,
          );
          if (!bytesWritten)
            throw Error("Composition surface writer made no progress");
          offset += bytesWritten;
        }
      }
      this.assertOpen();
      const checksum = `sha256:${hash.digest("hex")}`;
      if (received !== entry.byteLength || checksum !== expectedChecksum)
        throw Error(
          "Composition surface upload differs from its complete checksum",
        );
      await file.close();
      file = undefined;
      this.writtenBytes += received;
      this.publishedSurfaces++;
      this.tokens.delete(entry.token);
      entry.settled = true;
      entry.resolve(
        Object.freeze({
          path: entry.filePath,
          byteLength: entry.byteLength,
          checksum,
        }),
      );
    } catch (error) {
      const reason = this.closed ?? error;
      entry.settled = true;
      entry.reject(reason);
      throw reason;
    } finally {
      await file?.close().catch((error: unknown) => {
        process.stderr.write(
          `Composition cache file cleanup failed: ${String(error)}\n`,
        );
      });
    }
  }

  async dispose(reason = Error("Composition surface store disposed")) {
    this.closed ??= reason;
    for (const entry of this.entries.values()) entry.reject(this.closed);
    for (const input of this.writers.keys()) input.destroy(this.closed);
    await Promise.allSettled([...this.writers.values()]);
    await rm(this.directory, { recursive: true, force: true });
    this.entries.clear();
    this.tokens.clear();
    this.reservedBytes = this.writtenBytes = 0;
  }
}
