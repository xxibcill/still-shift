import { copyFile, mkdir, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { join, relative, resolve, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import { isCompositionNodeCapacityError } from "@still-shift/execution-runtime/export";
import { acquireArtifactLock } from "@still-shift/execution-runtime/locks";
import { MechanismProductionOwnedFileSchema } from "./production-queue-contract.ts";
import {
  BlenderCaptureJobSchema,
  BlenderProjectedAnchorSchema,
} from "./blender-capture-contract.ts";
import { captureBlenderAsset } from "./blender-capture.ts";
import {
  readProductionJSON,
  writeProductionJSON,
  productionFile,
  productionOwnedPath,
} from "./production-queue-files.ts";
import { cuePlateFile } from "./cue-plate-files.ts";
import { mechanismPackHash } from "./pack-support.ts";
import type { compileBlenderEpisode } from "./blender-episode-compile.ts";
import type { BlenderProductionIdentity } from "./blender-production-identity.ts";

type Compiled = ReturnType<typeof compileBlenderEpisode>;
type Pin = z.infer<typeof MechanismProductionOwnedFileSchema>;
const pointer = z
  .object({
    key: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    capture: MechanismProductionOwnedFileSchema,
    producer: MechanismProductionOwnedFileSchema,
    captureFrame: z.number().int().min(0).max(1999),
  })
  .strict();
const producer = z
  .object({
    schemaVersion: z.literal("blender-native-producer-seal-1"),
    profile: z.unknown(),
    capture: MechanismProductionOwnedFileSchema,
  })
  .strict();
const capture = z
  .object({
    summary: z
      .object({
        sourceAssetSha256: z.string(),
        frameCount: z.number().int().positive(),
        blenderRenders: z.number().int().positive(),
      })
      .passthrough(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().int().positive(),
    assetBytesUnchanged: z.literal(true),
    frozenJob: MechanismProductionOwnedFileSchema,
    frozenWorker: MechanismProductionOwnedFileSchema,
    backend: z
      .object({
        version: z.string().min(1).max(128),
        buildHash: z.string().regex(/^[a-f0-9]{5,64}$/),
      })
      .passthrough(),
    frames: z
      .array(
        z
          .object({
            frame: z.number().int().nonnegative(),
            sourceFrame: z.number().finite(),
            image: MechanismProductionOwnedFileSchema,
            observation: MechanismProductionOwnedFileSchema,
          })
          .strict(),
      )
      .min(1)
      .max(2000),
  })
  .passthrough();
const observation = z
  .object({
    schemaVersion: z.literal("blender-native-observed-frame-1"),
    outputFrame: z.number().int().nonnegative(),
    sourceFrame: z.number().finite(),
    sourceAssetSha256: z.string(),
    camera: z
      .object({
        name: z.string(),
        type: z.string().optional(),
        orthoScale: z.number().finite().optional(),
        lensMillimeters: z.number().finite().optional(),
        shiftX: z.number().finite().optional(),
        shiftY: z.number().finite().optional(),
      })
      .passthrough(),
    requestedControls: z.record(z.string(), z.number().finite()),
    actualControls: z.record(z.string(), z.number().finite()),
    highlights: z.record(z.string(), z.string()).default({}),
    anchors: z.record(z.string(), BlenderProjectedAnchorSchema).default({}),
    parts: z.array(z.unknown()).max(2048),
  })
  .passthrough();
export const BlenderEpisodePlatesSchema = z
  .object({
    schemaVersion: z.literal("blender-episode-plates-1"),
    producerProfileSha256: z.string(),
    frameCount: z.number().int().positive().max(2000),
    sequence: MechanismProductionOwnedFileSchema,
    frames: z
      .array(
        pointer.extend({
          frame: z.number().int().nonnegative(),
          image: MechanismProductionOwnedFileSchema,
          observation: MechanismProductionOwnedFileSchema,
        }),
      )
      .min(1)
      .max(2000),
    freshNativeRenders: z.number().int().nonnegative(),
    reusedOutputFrames: z.number().int().nonnegative(),
    freshCaptures: z.array(MechanismProductionOwnedFileSchema).max(1),
    cacheRejections: z
      .array(
        z
          .object({ key: z.string(), diagnostic: z.string().max(1024) })
          .strict(),
      )
      .max(2000),
  })
  .strict();
export type BlenderEpisodePlates = z.infer<typeof BlenderEpisodePlatesSchema>;
export function blenderEpisodePlateKey(
  job: Compiled["job"],
  frame: Compiled["job"]["frames"][number],
  profileSha256: string,
): string {
  return mechanismPackHash({
    schemaVersion: "blender-episode-plate-key-1",
    producerProfileSha256: profileSha256,
    sourceAssetSha256: job.assetSha256,
    collection: job.collection,
    controller: job.controller ?? null,
    requireEmbeddedResources: job.requireEmbeddedResources,
    width: job.width,
    height: job.height,
    fps: job.fps,
    samples: job.samples,
    frame: {
      ...frame,
      camera: frame.camera ?? job.camera,
      hiddenParts: [...frame.hiddenParts].sort(),
      shownParts: [...frame.shownParts].sort(),
      anchors: [...frame.anchors].sort(),
    },
  });
}
async function pinned(
  root: string,
  pin: Pin,
  owner: CompositionNodeMemory,
  signal?: AbortSignal,
) {
  const actual = await productionFile(root, pin.path, owner);
  signal?.throwIfAborted();
  if (actual.sha256 !== pin.sha256 || actual.bytes !== pin.bytes)
    throw Error(
      "Native cached file differs from its retained pin: " + pin.path,
    );
  return productionOwnedPath(root, pin.path);
}
function reader(
  root: string,
  compiled: Compiled,
  identity: BlenderProductionIdentity,
  owner: CompositionNodeMemory,
  signal?: AbortSignal,
) {
  const loaded: { release(): void }[] = [];
  const producers = new Map<string, string>();
  const verifiedFrames = new Map<string, { image: Pin; observation: Pin }>();
  const receipts = new Map<
    string,
    {
      receipt: z.infer<typeof capture>;
      job: z.infer<typeof BlenderCaptureJobSchema>;
      root: string;
    }
  >();
  return {
    release: () => {
      for (const file of loaded.reverse()) file.release();
    },
    read: async (index: z.infer<typeof pointer>) => {
      signal?.throwIfAborted();
      const producerKey = mechanismPackHash(index.producer);
      if (!producers.has(producerKey)) {
        const seal = await readProductionJSON(
          await pinned(root, index.producer, owner, signal),
          producer,
          owner,
          65536,
          signal,
        );
        try {
          if (
            mechanismPackHash(seal.value.profile) !== identity.profileSha256 ||
            mechanismPackHash(seal.value.capture) !==
              mechanismPackHash(index.capture)
          )
            throw Error(
              "Native producer seal differs from its current profile/capture",
            );
          producers.set(producerKey, mechanismPackHash(seal.value.capture));
        } finally {
          seal.release();
        }
      }
      if (producers.get(producerKey) !== mechanismPackHash(index.capture))
        throw Error("Native pointer changed its producer capture");
      const framePointer = mechanismPackHash({
        key: index.key,
        capture: index.capture,
        producer: index.producer,
        captureFrame: index.captureFrame,
      });
      const previouslyVerified = verifiedFrames.get(framePointer);
      if (previouslyVerified) return previouslyVerified;
      let body = receipts.get(mechanismPackHash(index.capture));
      if (!body) {
        const path = await pinned(root, index.capture, owner, signal);
        const receipt = await readProductionJSON(
          path,
          capture,
          owner,
          8 * 1024 * 1024,
          signal,
        );
        loaded.push(receipt);
        if (
          "Blender " + receipt.value.backend.version !==
            identity.profile.blenderVersion.split("\n")[0] ||
          !identity.profile.blenderVersion.includes(
            receipt.value.backend.buildHash,
          )
        )
          throw Error(
            "Actual native renderer version/build differs from its producer profile",
          );
        const base = relative(root, join(path, "..")).split("\\").join("/");
        const local = (pin: Pin) => ({
          ...pin,
          path: join(base, pin.path).split("\\").join("/"),
        });
        await pinned(root, local(receipt.value.frozenWorker), owner, signal);
        if (receipt.value.frozenWorker.sha256 !== identity.profile.workerSha256)
          throw Error("Native capture used a different worker");
        const frozen = await readProductionJSON(
          await pinned(root, local(receipt.value.frozenJob), owner, signal),
          BlenderCaptureJobSchema,
          owner,
          1024 * 1024,
          signal,
        );
        loaded.push(frozen);
        if (
          receipt.value.summary.frameCount !== frozen.value.frames.length ||
          receipt.value.summary.blenderRenders !== frozen.value.frames.length ||
          receipt.value.frames.length !== frozen.value.frames.length ||
          receipt.value.summary.sourceAssetSha256 !==
            frozen.value.assetSha256 ||
          receipt.value.width !== frozen.value.width ||
          receipt.value.height !== frozen.value.height ||
          receipt.value.fps !== frozen.value.fps
        )
          throw Error(
            "Native capture clock/source receipt differs from its frozen job",
          );
        body = { receipt: receipt.value, job: frozen.value, root: base };
        receipts.set(mechanismPackHash(index.capture), body);
      }
      const frame = body.job.frames[index.captureFrame],
        record = body.receipt.frames[index.captureFrame];
      if (
        !frame ||
        !record ||
        record.frame !== index.captureFrame ||
        record.sourceFrame !== frame.sourceFrame ||
        blenderEpisodePlateKey(body.job, frame, identity.profileSha256) !==
          index.key
      )
        throw Error(
          "Native cached frame differs from its requested dependency key",
        );
      if (body.job.assetSha256 !== compiled.job.assetSha256)
        throw Error(
          "Native frame source differs from the current episode asset",
        );
      const local = (pin: Pin) => ({
        ...pin,
        path: join(body.root, pin.path).split("\\").join("/"),
      });
      const image = local(record.image),
        observed = local(record.observation);
      await pinned(root, image, owner, signal);
      const facts = await readProductionJSON(
        await pinned(root, observed, owner, signal),
        observation,
        owner,
        8 * 1024 * 1024,
        signal,
      );
      try {
        if (
          facts.value.outputFrame !== index.captureFrame ||
          facts.value.sourceFrame !== frame.sourceFrame ||
          facts.value.sourceAssetSha256 !== body.job.assetSha256 ||
          facts.value.camera.name !== (frame.camera ?? body.job.camera) ||
          mechanismPackHash(facts.value.requestedControls) !==
            mechanismPackHash(frame.controls) ||
          mechanismPackHash(facts.value.actualControls) !==
            mechanismPackHash(frame.controls)
        )
          throw Error(
            "Actual native controls/camera differ from the frozen frame request",
          );
        for (const [field, expected] of Object.entries(frame.framing ?? {})) {
          if (expected === undefined) continue;
          const actual =
            facts.value.camera[field as keyof typeof facts.value.camera];
          if (
            typeof actual !== "number" ||
            Math.abs(actual - expected) >
              Math.max(1e-6, Math.abs(expected) * 1e-6) ||
            (field === "orthoScale" && facts.value.camera.type !== "ORTHO") ||
            (field === "lensMillimeters" && facts.value.camera.type !== "PERSP")
          )
            throw Error(
              "Actual native camera framing differs from the frozen request",
            );
        }
        if (
          mechanismPackHash(facts.value.highlights) !==
            mechanismPackHash(frame.highlights) ||
          JSON.stringify(Object.keys(facts.value.anchors).sort()) !==
            JSON.stringify([...frame.anchors].sort())
        )
          throw Error(
            "Actual native highlights/anchors differ from the frozen request",
          );
        if (frame.hiddenParts.length || frame.shownParts.length) {
          const part = z
            .object({ name: z.string(), visible: z.boolean() })
            .passthrough();
          const observedParts = new Map<string, boolean>();
          for (const value of facts.value.parts) {
            const parsed = part.safeParse(value);
            if (parsed.success)
              observedParts.set(parsed.data.name, parsed.data.visible);
          }
          for (const [names, visible] of [
            [frame.hiddenParts, false],
            [frame.shownParts, true],
          ] as const)
            for (const name of names)
              if (observedParts.get(name) !== visible)
                throw Error(
                  "Actual native visibility differs from the frozen request: " +
                    name,
                );
        }
      } finally {
        facts.release();
      }
      const result = { image, observation: observed };
      verifiedFrames.set(framePointer, result);
      return result;
    },
  };
}
/** Per-state native keys retain unaffected plates across text and scoped shot changes. */
export async function prepareBlenderEpisodePlates(
  compiled: Compiled,
  identity: BlenderProductionIdentity,
  root: string,
  directory: string,
  blenderExecutable: string,
  owner: CompositionNodeMemory,
  signal?: AbortSignal,
): Promise<BlenderEpisodePlates> {
  owner.reserve(64 * 1024 * 1024);
  const requestedRoot = resolve(root),
    localDirectory = relative(requestedRoot, resolve(directory));
  if (
    isAbsolute(localDirectory) ||
    localDirectory === ".." ||
    localDirectory.startsWith("../")
  )
    throw Error("Native plate directory must belong to its output root");
  root = await realpath(requestedRoot);
  directory = join(root, localDirectory);
  await mkdir(join(root, "blender-cache", "index"), { recursive: true });
  const unlock = await acquireArtifactLock(
    join(root, "blender-cache", ".native.lock"),
    root,
  );
  const verified = reader(root, compiled, identity, owner, signal);
  const keys = compiled.job.frames.map((frame) =>
    blenderEpisodePlateKey(compiled.job, frame, identity.profileSha256),
  );
  const entries = new Map<string, z.infer<typeof pointer>>();
  const rejected: BlenderEpisodePlates["cacheRejections"] = [];
  const freshCaptures: Pin[] = [];
  try {
    signal?.throwIfAborted();
    for (const key of new Set(keys)) {
      const path = join(root, "blender-cache", "index", key.slice(7) + ".json");
      let value:
        | Awaited<
            ReturnType<typeof readProductionJSON<z.infer<typeof pointer>>>
          >
        | undefined;
      try {
        value = await readProductionJSON(path, pointer, owner, 65536, signal);
        if (value.value.key !== key)
          throw Error("Native cache index has the wrong frame key");
        await verified.read(value.value);
        entries.set(key, value.value);
      } catch (error) {
        if (signal?.aborted || isCompositionNodeCapacityError(error))
          throw error;
        if ((error as NodeJS.ErrnoException).code !== "ENOENT")
          rejected.push({ key, diagnostic: String(error).slice(0, 1024) });
      } finally {
        value?.release();
      }
    }
    const missing = [...new Set(keys)].filter((key) => !entries.has(key));
    if (missing.length) {
      const destination = join(root, "blender-cache", "captures", randomUUID());
      await mkdir(join(destination, ".."), { recursive: true });
      const job = {
        ...compiled.job,
        id: "capture-" + randomUUID(),
        outputDirectory: destination,
        frames: missing.map((key) => compiled.job.frames[keys.indexOf(key)]!),
      };
      const result = await captureBlenderAsset(job, {
        blenderExecutable,
        nodeMemory: owner,
        signal,
      });
      const receipt = {
        ...result.receipt,
        path: relative(root, result.receipt.path).split("\\").join("/"),
      };
      await cuePlateFile(blenderExecutable, owner, {
        sha256: identity.profile.blenderExecutableSha256,
        signal,
      });
      const producerPath = join(destination, "producer.json");
      await writeProductionJSON(
        producerPath,
        {
          schemaVersion: "blender-native-producer-seal-1",
          profile: identity.profile,
          capture: receipt,
        },
        owner,
        65536,
        true,
      );
      const producerPin = await productionFile(
        root,
        relative(root, producerPath),
        owner,
      );
      freshCaptures.push(receipt);
      for (const [captureFrame, key] of missing.entries()) {
        const entry = {
          key,
          capture: receipt,
          producer: producerPin,
          captureFrame,
        };
        await verified.read(entry);
        await writeProductionJSON(
          join(root, "blender-cache", "index", key.slice(7) + ".json"),
          entry,
          owner,
          65536,
        );
        entries.set(key, entry);
      }
    }
    await mkdir(join(directory, "frames"), { recursive: true });
    const frames: BlenderEpisodePlates["frames"] = [];
    for (const [frame, key] of keys.entries()) {
      const entry = entries.get(key)!;
      const source = await verified.read(entry);
      const path = join(
        directory,
        "frames",
        "frame-" + String(frame).padStart(6, "0") + ".png",
      );
      await copyFile(
        await productionOwnedPath(root, source.image.path),
        path,
        constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE,
      );
      const copied = await productionFile(root, relative(root, path), owner);
      if (
        copied.sha256 !== source.image.sha256 ||
        copied.bytes !== source.image.bytes
      )
        throw Error(
          "Native plate changed while creating its independent output copy",
        );
      frames.push({
        ...entry,
        frame,
        image: copied,
        observation: source.observation,
      });
    }
    const sequencePath = join(directory, "sequence.json");
    await writeProductionJSON(
      sequencePath,
      {
        schemaVersion: "composition-sequence-1",
        frames: frames.map((f) => f.image.sha256),
      },
      owner,
      1024 * 1024,
      true,
    );
    return BlenderEpisodePlatesSchema.parse({
      schemaVersion: "blender-episode-plates-1",
      producerProfileSha256: identity.profileSha256,
      frameCount: keys.length,
      sequence: await productionFile(root, relative(root, sequencePath), owner),
      frames,
      freshNativeRenders: missing.length,
      reusedOutputFrames: keys.length - missing.length,
      freshCaptures,
      cacheRejections: rejected,
    });
  } finally {
    verified.release();
    await unlock();
  }
}
export async function checkBlenderEpisodePlates(
  input: unknown,
  compiled: Compiled,
  identity: BlenderProductionIdentity,
  root: string,
  owner: CompositionNodeMemory,
  signal?: AbortSignal,
) {
  owner.reserve(64 * 1024 * 1024);
  root = await realpath(root);
  const map = BlenderEpisodePlatesSchema.parse(input);
  if (
    map.producerProfileSha256 !== identity.profileSha256 ||
    map.frameCount !== compiled.frameCount ||
    map.frames.length !== compiled.frameCount
  )
    throw Error("Native episode map differs from its current producer/clock");
  const verified = reader(root, compiled, identity, owner, signal);
  try {
    let submitted = 0;
    for (const pin of map.freshCaptures) {
      const result = await readProductionJSON(
        await pinned(root, pin, owner, signal),
        capture,
        owner,
        8 * 1024 * 1024,
        signal,
      );
      try {
        submitted += result.value.summary.blenderRenders;
      } finally {
        result.release();
      }
      if (
        !map.frames.some(
          (f) => mechanismPackHash(f.capture) === mechanismPackHash(pin),
        )
      )
        throw Error("Fresh native submission is not used by this episode");
    }
    if (
      submitted !== map.freshNativeRenders ||
      map.reusedOutputFrames !== map.frameCount - submitted
    )
      throw Error(
        "Native submission counters differ from actual capture receipts",
      );
    for (const [frame, pin] of map.frames.entries()) {
      if (
        pin.frame !== frame ||
        pin.key !==
          blenderEpisodePlateKey(
            compiled.job,
            compiled.job.frames[frame]!,
            identity.profileSha256,
          )
      )
        throw Error(
          "Native output mapping differs from its current episode plan",
        );
      const original = await verified.read(pin);
      if (
        mechanismPackHash(pin.observation) !==
          mechanismPackHash(original.observation) ||
        pin.image.sha256 !== original.image.sha256 ||
        pin.image.bytes !== original.image.bytes
      )
        throw Error(
          "Native output mapping differs from the original captured frame",
        );
      await pinned(root, pin.image, owner, signal);
    }
    const sequence = await readProductionJSON(
      await pinned(root, map.sequence, owner, signal),
      z
        .object({
          schemaVersion: z.literal("composition-sequence-1"),
          frames: z.array(z.string()).max(2000),
        })
        .strict(),
      owner,
      1024 * 1024,
      signal,
    );
    try {
      if (
        mechanismPackHash(sequence.value.frames) !==
        mechanismPackHash(map.frames.map((f) => f.image.sha256))
      )
        throw Error(
          "Native sequence hash order differs from the episode mapping",
        );
    } finally {
      sequence.release();
    }
    return map;
  } finally {
    verified.release();
  }
}
