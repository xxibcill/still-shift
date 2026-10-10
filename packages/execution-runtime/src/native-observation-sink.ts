import { createHash, type Hash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, rm, writeFile, type FileHandle } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { setImmediate as yieldEventLoop } from "node:timers/promises";
import { z } from "zod";
import type { IncomingHttpHeaders } from "node:http";
import {
  NATIVE3D_OBSERVATION_LIMITS,
  NativeObservedOutputFrameSchema,
  type NativeObservedOutputFrame,
  type NativeObservedFrame,
  type NativeAppearanceCodeIdentity,
} from "@still-shift/scene-contract";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import type { FrameTransport } from "./transport.ts";
import { ManagedMemory } from "../../renderer-core/src/managed-memory.ts";
import { canonicalMechanismJson } from "../../renderer-core/src/mechanism/canonical.ts";

export type NativeObservationExpectedPass = Pick<
  NativeObservedFrame,
  | "frameKey"
  | "controller"
  | "scope"
  | "scopeFrame"
  | "sourceFrame"
  | "sourceSha256"
  | "effectiveSceneSha256"
  | "geometrySha256"
  | "appearanceCodeSha256"
  | "viewport"
> & {
  sampleFrame: number;
  parts: Readonly<Record<string, { parent?: string }>>;
  anchors: Readonly<Record<string, { part: string }>>;
};
export type NativeObservationExecutionBinding = {
  version: "native-observation-execution-1";
  compositionSourceSha256: string;
  compositionSha256: string;
  preparedNativeSha256: string;
  appearanceCodeSha256: string;
  appearanceCodeIdentity: NativeAppearanceCodeIdentity;
  backend: "webgl2";
  profile: string;
  sources: readonly {
    asset: string;
    sourceKey: string;
    sourceSha256: string;
    originalGeometrySha256: string;
    effectiveSceneSha256: string;
    geometrySha256: string;
    meshDataSha256: string;
  }[];
  mechanism?: {
    episodeSha256: string;
    geometrySha256: string;
    rigSha256: string;
    routeSelection: {
      sourceRoute: "bridge" | "native3d" | null;
      effectiveRoute: "bridge" | "native3d";
      selectionOrigin: "source" | "cli-override" | "default";
    };
  };
};
export type NativeObservationArtifact = {
  path: string;
  sha256: string;
  byteLength: number;
  firstOutputFrame: number;
  lastOutputFrame: number;
  frames: number;
};
export type NativeObservationClosure = {
  version: "native-observation-closure-1";
  manifestPath: string;
  manifestSha256: string;
  executionSha256: string;
  outputFrames: number;
  passCount: number;
  outputSha256: string;
};
export type NativeObservationPixel = {
  transport: FrameTransport;
  byteLength: number;
  transportBytesSha256: string;
};
const limits = NATIVE3D_OBSERVATION_LIMITS;
const sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const pixelSchema = z
  .object({
    transport: z.enum(["raw_rgba", "png_pipe", "jpeg_pipe"]),
    byteLength: z.number().int().min(1).max(50_000_000),
    transportBytesSha256: sha256Schema,
  })
  .strict();
const artifactSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .max(1024)
      .refine(
        (path) => basename(path) === path && path !== "." && path !== "..",
      ),
    sha256: sha256Schema,
    byteLength: z.number().int().min(1).max(limits.shardBytes),
    firstOutputFrame: z.number().int().min(0).max(107999),
    lastOutputFrame: z.number().int().min(0).max(107999),
    frames: z.number().int().min(1).max(108000),
  })
  .strict();
const manifestSchema = z
  .object({
    version: z.literal("native-observation-manifest-1"),
    executionSha256: sha256Schema,
    execution: z.unknown(),
    coverage: z
      .object({
        firstOutputFrame: z.literal(0),
        lastOutputFrame: z.number().int().min(0).max(107999),
        frames: z.number().int().min(1).max(108000),
      })
      .strict(),
    passCount: z
      .number()
      .int()
      .min(0)
      .max(108000 * limits.passes),
    byteLength: z.number().int().min(1).max(limits.totalBytes),
    artifacts: z.array(artifactSchema).min(1).max(limits.shards),
    output: z
      .object({
        sha256: sha256Schema,
        frameCount: z.number().int().min(1).max(108000),
        width: z.number().int().min(16).max(8192),
        height: z.number().int().min(16).max(8192),
        transport: z.enum(["raw_rgba", "png_pipe", "jpeg_pipe"]),
      })
      .strict(),
  })
  .strict();
const rowSchema = z
  .object({
    version: z.literal("native3d-observation-row-1"),
    packet: NativeObservedOutputFrameSchema,
    pixel: pixelSchema,
  })
  .strict();
const hash = (bytes: string | Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const ownKeys = (value: object) => Object.keys(value).sort().join("\0");
function protocol(message: string, frame?: number): never {
  passageError("comp-native3d-protocol", message, {
    path:
      frame === undefined
        ? "nativeObservations"
        : `nativeObservations.frames[${frame}]`,
    ...(frame === undefined ? {} : { frame }),
  });
}
export function nativeObservationOwner(
  headers: IncomingHttpHeaders,
  exportId: string,
  credential: string,
): boolean {
  return (
    headers["x-export-id"] === exportId &&
    headers["x-export-worker"] === "0" &&
    headers["x-export-credential"] === credential
  );
}

export function validateNativeObservationPacket(
  packet: NativeObservedOutputFrame,
  executionSha256: string,
  expected: readonly NativeObservationExpectedPass[],
) {
  if (
    packet.executionSha256 !== executionSha256 ||
    packet.passes.length !== expected.length
  )
    protocol(
      "Observation execution or contributing-pass coverage differs",
      packet.outputFrame,
    );
  for (const [index, sample] of packet.passes.entries()) {
    const reference = expected[index]!,
      actual = sample.observed;
    if (sample.sampleFrame !== reference.sampleFrame)
      protocol(
        "Observation contributing sample clock differs",
        packet.outputFrame,
      );
    for (const field of [
      "frameKey",
      "controller",
      "scope",
      "scopeFrame",
      "sourceFrame",
      "sourceSha256",
      "effectiveSceneSha256",
      "geometrySha256",
      "appearanceCodeSha256",
    ] as const)
      if (actual[field] !== reference[field])
        protocol(
          `Observation ${field} differs from the trusted execution`,
          packet.outputFrame,
        );
    if (
      JSON.stringify(actual.viewport) !== JSON.stringify(reference.viewport) ||
      ownKeys(actual.parts) !== ownKeys(reference.parts) ||
      ownKeys(actual.anchors) !== ownKeys(reference.anchors)
    )
      protocol(
        "Observation viewport or physical key inventory differs",
        packet.outputFrame,
      );
    for (const [id, part] of Object.entries(actual.parts))
      if (part.parent !== reference.parts[id]!.parent)
        protocol("Observed physical parent differs", packet.outputFrame);
    for (const [id, anchor] of Object.entries(actual.anchors))
      if (anchor.part !== reference.anchors[id]!.part)
        protocol("Observed anchor part differs", packet.outputFrame);
  }
}

export function admitNativeObservationCapacity(
  frameCount: number,
  maximumPacketBytes: number,
) {
  if (
    !Number.isSafeInteger(frameCount) ||
    frameCount < 1 ||
    frameCount > 108000 ||
    !Number.isSafeInteger(maximumPacketBytes) ||
    maximumPacketBytes < 1 ||
    maximumPacketBytes > limits.packetBytes
  )
    protocol("Native observation packet capacity exceeds admission");
  const rowBound = maximumPacketBytes + 1024;
  if (
    rowBound * frameCount > limits.totalBytes ||
    Math.ceil((rowBound * frameCount) / (limits.shardBytes - rowBound)) >
      limits.shards
  )
    protocol("Native observation artifact capacity exceeds admission");
}
export function admitNativeObservationManifest(
  execution: NativeObservationExecutionBinding,
  outputPath: string,
) {
  const bound = JSON.stringify(
    {
      version: "native-observation-manifest-1",
      executionSha256: `sha256:${"f".repeat(64)}`,
      execution,
      coverage: {
        firstOutputFrame: 0,
        lastOutputFrame: 107999,
        frames: 108000,
      },
      passCount: 108000 * limits.passes,
      byteLength: limits.totalBytes,
      artifacts: Array.from({ length: limits.shards }, (_, index) => ({
        path: basename(
          `${outputPath}.native-observations.${String(index).padStart(3, "0")}.ndjson`,
        ),
        sha256: `sha256:${"f".repeat(64)}`,
        byteLength: limits.shardBytes,
        firstOutputFrame: 107999,
        lastOutputFrame: 107999,
        frames: 108000,
      })),
      output: {
        sha256: `sha256:${"f".repeat(64)}`,
        frameCount: 108000,
        width: 8192,
        height: 8192,
        transport: "raw_rgba",
      },
    },
    null,
    2,
  );
  if (Buffer.byteLength(bound) + 1 > limits.packetBytes)
    protocol("Native observation manifest exceeds its byte admission");
}

type Pending = {
  packet: NativeObservedOutputFrame;
  lease: { release(): void };
};
type Shard = {
  handle: FileHandle;
  staged: string;
  destination: string;
  hash: Hash;
  bytes: number;
  first: number;
  last: number;
  frames: number;
};

/** One export-owned pending packet; only accepted pixel bodies make durable rows. */
export class NativeObservationSink {
  private pending: Pending | undefined;
  private shard: Shard | undefined;
  private readonly artifacts: NativeObservationArtifact[] = [];
  private readonly ownedPaths = new Set<string>();
  private readonly publicationEntries: {
    staged: string;
    destination: string;
  }[] = [];
  private nextFrame = 0;
  private passCount = 0;
  private byteLength = 0;
  private state: "open" | "complete" | "failed" = "open";
  private failure: unknown;
  private writing = false;
  private activeWrite: Promise<void> | undefined;
  readonly manifestPath: string;
  readonly executionSha256: string;
  constructor(
    private readonly options: {
      outputPath: string;
      exportId: string;
      frameCount: number;
      maximumPacketBytes: number;
      execution: NativeObservationExecutionBinding;
      expectedPasses(frame: number): readonly NativeObservationExpectedPass[];
      reserve(bytes: number): { release(): void };
    },
  ) {
    admitNativeObservationCapacity(
      options.frameCount,
      options.maximumPacketBytes,
    );
    admitNativeObservationManifest(options.execution, options.outputPath);
    this.manifestPath = `${options.outputPath}.native-observations.json`;
    this.executionSha256 = hash(canonicalMechanismJson(options.execution));
  }
  static destinationPaths(outputPath: string) {
    return [
      `${outputPath}.native-observations.json`,
      ...Array.from(
        { length: limits.shards },
        (_, index) =>
          `${outputPath}.native-observations.${String(index).padStart(3, "0")}.ndjson`,
      ),
    ];
  }
  private assertOpen() {
    if (this.state !== "open")
      throw this.failure ?? Error("Native observation sink is closed");
  }
  acceptPacket(worker: number, bytes: Uint8Array) {
    this.assertOpen();
    let lease: { release(): void } | undefined;
    try {
      if (
        worker !== 0 ||
        this.pending ||
        this.writing ||
        bytes.length > this.options.maximumPacketBytes ||
        bytes.length > limits.packetBytes
      )
        protocol(
          "Duplicate, unassigned or oversized observation packet",
          this.nextFrame,
        );
      lease = this.options.reserve(bytes.length * 6 + 262144);
      let value: unknown;
      try {
        value = JSON.parse(Buffer.from(bytes).toString("utf8"));
      } catch {
        protocol("Observation body is not valid JSON", this.nextFrame);
      }
      const parsed = NativeObservedOutputFrameSchema.safeParse(value);
      if (!parsed.success)
        protocol("Invalid native observation packet", this.nextFrame);
      const packet = parsed.data;
      if (
        packet.outputFrame !== this.nextFrame ||
        packet.outputFrame >= this.options.frameCount
      )
        protocol("Observation output-frame order differs", packet.outputFrame);
      validateNativeObservationPacket(
        packet,
        this.executionSha256,
        this.options.expectedPasses(packet.outputFrame),
      );
      this.pending = { packet, lease };
    } catch (error) {
      lease?.release();
      this.fail(error);
      throw error;
    }
  }
  requirePacket(worker: number, frame: number) {
    this.assertOpen();
    if (worker !== 0 || this.pending?.packet.outputFrame !== frame)
      protocol("Pixel body has no matching assigned observation packet", frame);
  }
  commitPixel(
    worker: number,
    frame: number,
    pixel: NativeObservationPixel,
  ): Promise<void> {
    if (this.writing) {
      const error = Error("Concurrent observation pixel commit");
      this.fail(error);
      return Promise.reject(error);
    }
    this.writing = true;
    this.activeWrite = this.writePixel(worker, frame, pixel).finally(() => {
      this.writing = false;
      this.activeWrite = undefined;
    });
    return this.activeWrite;
  }
  private async writePixel(
    worker: number,
    frame: number,
    pixel: NativeObservationPixel,
  ) {
    const pending = this.pending;
    try {
      this.requirePacket(worker, frame);
      if (
        !pending ||
        !Number.isSafeInteger(pixel.byteLength) ||
        pixel.byteLength < 1 ||
        !/^sha256:[a-f0-9]{64}$/.test(pixel.transportBytesSha256)
      )
        protocol("Accepted pixel body identity is invalid", frame);
      const bytes = Buffer.from(
        `${JSON.stringify({ version: "native3d-observation-row-1", packet: pending.packet, pixel })}\n`,
      );
      if (bytes.length > this.options.maximumPacketBytes + 1024)
        protocol("Observation row exceeds admitted capacity", frame);
      if (!this.shard || this.shard.bytes + bytes.length > limits.shardBytes) {
        await this.closeShard();
        await this.openShard(frame);
      }
      if (this.byteLength + bytes.length > limits.totalBytes)
        protocol("Observation artifact bytes exceed admission", frame);
      this.assertOpen();
      await this.shard!.handle.writeFile(bytes);
      this.assertOpen();
      this.shard!.hash.update(bytes);
      this.shard!.bytes += bytes.length;
      this.shard!.last = frame;
      this.shard!.frames++;
      this.byteLength += bytes.length;
      this.passCount += pending.packet.passes.length;
      this.nextFrame++;
    } catch (error) {
      this.fail(error);
      throw error;
    } finally {
      this.pending = undefined;
      pending?.lease.release();
    }
  }
  private async openShard(frame: number) {
    const index = this.artifacts.length;
    if (index >= limits.shards)
      protocol("Observation shard count exceeds admission", frame);
    const destination = NativeObservationSink.destinationPaths(
      this.options.outputPath,
    )[index + 1]!;
    const staged = join(
      dirname(destination),
      `.${basename(destination)}.${this.options.exportId}.tmp`,
    );
    const handle = await open(staged, "wx");
    this.ownedPaths.add(staged);
    this.shard = {
      handle,
      staged,
      destination,
      hash: createHash("sha256"),
      bytes: 0,
      first: frame,
      last: frame,
      frames: 0,
    };
  }
  private async closeShard() {
    if (!this.shard) return;
    const shard = this.shard;
    this.shard = undefined;
    await shard.handle.close();
    this.artifacts.push({
      path: basename(shard.destination),
      sha256: `sha256:${shard.hash.digest("hex")}`,
      byteLength: shard.bytes,
      firstOutputFrame: shard.first,
      lastOutputFrame: shard.last,
      frames: shard.frames,
    });
    this.publicationEntries.push({
      staged: shard.staged,
      destination: shard.destination,
    });
  }
  async finalize(
    sender: { outputFrames: number; passCount: number },
    output: {
      sha256: string;
      frameCount: number;
      width: number;
      height: number;
      transport: FrameTransport;
    },
  ): Promise<NativeObservationClosure> {
    this.assertOpen();
    try {
      if (
        this.writing ||
        this.pending ||
        this.nextFrame !== this.options.frameCount ||
        output.frameCount !== this.nextFrame ||
        !/^sha256:[a-f0-9]{64}$/.test(output.sha256) ||
        sender.outputFrames !== this.nextFrame ||
        sender.passCount !== this.passCount
      )
        protocol("Native observation closure lacks exact paired coverage");
      await this.closeShard();
      const manifest = {
        version: "native-observation-manifest-1",
        executionSha256: this.executionSha256,
        execution: this.options.execution,
        coverage: {
          firstOutputFrame: 0,
          lastOutputFrame: this.nextFrame - 1,
          frames: this.nextFrame,
        },
        passCount: this.passCount,
        byteLength: this.byteLength,
        artifacts: this.artifacts,
        output,
      };
      const contents = `${JSON.stringify(manifest, null, 2)}\n`;
      const staged = join(
        dirname(this.manifestPath),
        `.${basename(this.manifestPath)}.${this.options.exportId}.tmp`,
      );
      await writeFile(staged, contents, { flag: "wx" });
      this.ownedPaths.add(staged);
      this.publicationEntries.push({ staged, destination: this.manifestPath });
      this.assertOpen();
      this.state = "complete";
      return {
        version: "native-observation-closure-1",
        manifestPath: this.manifestPath,
        manifestSha256: hash(contents),
        executionSha256: this.executionSha256,
        outputFrames: this.nextFrame,
        passCount: this.passCount,
        outputSha256: output.sha256,
      };
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }
  get publications() {
    if (this.state !== "complete")
      protocol("Observation artifacts are not complete");
    return this.publicationEntries;
  }
  fail(reason: unknown) {
    this.failure ??= reason;
    this.state = "failed";
    if (!this.writing) {
      this.pending?.lease.release();
      this.pending = undefined;
    }
  }
  async dispose() {
    if (this.state === "open")
      this.fail(Error("Native observation export disposed"));
    await this.activeWrite?.catch(() => undefined);
    await this.shard?.handle.close();
    this.shard = undefined;
    await Promise.all(
      [...this.ownedPaths].map((path) => rm(path, { force: true })),
    );
    this.ownedPaths.clear();
  }
}

/** Rechecks actual retained rows without retaining a movie's observations in memory. */
export async function verifyNativeObservationClosure(options: {
  closure: NativeObservationClosure;
  execution: NativeObservationExecutionBinding;
  expectedPasses(frame: number): readonly NativeObservationExpectedPass[];
  output: {
    sha256: string;
    frameCount: number;
    width: number;
    height: number;
    transport: FrameTransport;
  };
  signal?: AbortSignal | undefined;
  resolveArtifactPath?: (relativePath: string) => string;
  reserve?: (bytes: number) => { release(): void };
  onFrame?: (
    packet: NativeObservedOutputFrame,
    pixel: NativeObservationPixel,
  ) => void | Promise<void>;
}): Promise<{
  outputFrames: number;
  passCount: number;
  byteLength: number;
  artifacts: readonly NativeObservationArtifact[];
}> {
  options.signal?.throwIfAborted();
  const memory = options.reserve
    ? undefined
    : new ManagedMemory({ pixels: 1, metadata: 16 * 1024 ** 2 });
  const reserve =
    options.reserve ?? ((bytes: number) => memory!.reserve("metadata", bytes));
  const capacity = reserve(limits.packetBytes * 8 + 524288);
  try {
    const manifestBuffer = Buffer.alloc(limits.packetBytes);
    let manifestBytes = 0;
    for await (const value of createReadStream(options.closure.manifestPath, {
      highWaterMark: 65536,
      signal: options.signal,
    })) {
      const bytes = value as Buffer;
      if (manifestBytes + bytes.length > manifestBuffer.length)
        protocol("Observation manifest exceeds its byte admission");
      manifestBuffer.set(bytes, manifestBytes);
      manifestBytes += bytes.length;
    }
    const manifestRaw = manifestBuffer.subarray(0, manifestBytes);
    if (hash(manifestRaw) !== options.closure.manifestSha256)
      protocol("Observation manifest hash differs");
    let value: unknown;
    try {
      value = JSON.parse(manifestRaw.toString("utf8"));
    } catch {
      protocol("Observation manifest is not JSON");
    }
    const parsed = manifestSchema.safeParse(value);
    if (!parsed.success)
      protocol("Observation manifest violates the bounded closure schema");
    const manifest = parsed.data;
    const executionSha256 = hash(canonicalMechanismJson(options.execution));
    if (
      options.closure.version !== "native-observation-closure-1" ||
      manifest.executionSha256 !== executionSha256 ||
      options.closure.executionSha256 !== executionSha256 ||
      canonicalMechanismJson(manifest.execution) !==
        canonicalMechanismJson(options.execution) ||
      canonicalMechanismJson(manifest.output) !==
        canonicalMechanismJson(options.output) ||
      options.closure.outputSha256 !== options.output.sha256 ||
      options.closure.outputFrames !== options.output.frameCount ||
      manifest.coverage.frames !== options.output.frameCount ||
      manifest.coverage.lastOutputFrame !== options.output.frameCount - 1
    )
      protocol(
        "Observation closure differs from the current execution or final output",
      );
    let outputFrames = 0,
      passCount = 0,
      byteLength = 0;
    const paths = new Set<string>();
    const line = Buffer.alloc(limits.packetBytes + 1024);
    for (const artifact of manifest.artifacts) {
      if (
        paths.has(artifact.path) ||
        artifact.firstOutputFrame !== outputFrames
      )
        protocol(
          "Observation shards duplicate paths or omit assigned coverage",
          outputFrames,
        );
      paths.add(artifact.path);
      const path =
        options.resolveArtifactPath?.(artifact.path) ??
        resolve(dirname(options.closure.manifestPath), artifact.path);
      const identity = createHash("sha256");
      let shardBytes = 0,
        shardFrames = 0,
        lineBytes = 0;
      for await (const value of createReadStream(path, {
        highWaterMark: 65536,
        signal: options.signal,
      })) {
        const bytes = value as Buffer;
        shardBytes += bytes.length;
        if (
          shardBytes > artifact.byteLength ||
          byteLength + shardBytes > limits.totalBytes
        )
          protocol(
            "Observation shard bytes exceed their bounded identity",
            outputFrames,
          );
        identity.update(bytes);
        let start = 0;
        while (start < bytes.length) {
          options.signal?.throwIfAborted();
          const newline = bytes.indexOf(10, start);
          const end = newline < 0 ? bytes.length : newline;
          if (lineBytes + end - start > line.length)
            protocol("Observation row exceeds packet admission", outputFrames);
          line.set(bytes.subarray(start, end), lineBytes);
          lineBytes += end - start;
          start = end + (newline < 0 ? 0 : 1);
          if (newline < 0) break;
          let value: unknown;
          try {
            value = JSON.parse(line.subarray(0, lineBytes).toString("utf8"));
          } catch {
            protocol("Observation row is not JSON", outputFrames);
          }
          const row = rowSchema.safeParse(value);
          if (!row.success)
            protocol("Observation row violates its schema", outputFrames);
          if (
            row.data.packet.outputFrame !== outputFrames ||
            outputFrames >= options.output.frameCount
          )
            protocol(
              "Observation row duplicates or omits assigned frames",
              outputFrames,
            );
          validateNativeObservationPacket(
            row.data.packet,
            executionSha256,
            options.expectedPasses(outputFrames),
          );
          if (
            row.data.pixel.transport !== options.output.transport ||
            (row.data.pixel.transport === "raw_rgba" &&
              row.data.pixel.byteLength !==
                options.output.width * options.output.height * 4)
          )
            protocol(
              "Observation pixel body differs from the output transport",
              outputFrames,
            );
          options.signal?.throwIfAborted();
          await options.onFrame?.(row.data.packet, row.data.pixel);
          options.signal?.throwIfAborted();
          outputFrames++;
          shardFrames++;
          passCount += row.data.packet.passes.length;
          lineBytes = 0;
          // A buffered shard may hold many complete rows. Awaiting a synchronous
          // onFrame only yields microtasks; release timers/abort between rows.
          await yieldEventLoop();
          options.signal?.throwIfAborted();
        }
      }
      if (
        lineBytes ||
        shardBytes !== artifact.byteLength ||
        `sha256:${identity.digest("hex")}` !== artifact.sha256 ||
        shardFrames !== artifact.frames ||
        artifact.lastOutputFrame !== outputFrames - 1
      )
        protocol(
          "Observation shard hash, terminator or coverage differs",
          outputFrames,
        );
      byteLength += shardBytes;
    }
    if (
      outputFrames !== options.output.frameCount ||
      passCount !== manifest.passCount ||
      passCount !== options.closure.passCount ||
      byteLength !== manifest.byteLength
    )
      protocol("Observation artifacts lack exact final coverage");
    options.signal?.throwIfAborted();
    return {
      outputFrames,
      passCount,
      byteLength,
      artifacts: manifest.artifacts,
    };
  } catch (error) {
    // Node streams wrap cancellation; preserve the caller's original reason.
    options.signal?.throwIfAborted();
    throw error;
  } finally {
    capacity.release();
    memory?.dispose();
  }
}
