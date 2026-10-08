import { compositionSequenceFramePath } from "./composition-media-sequence.ts";
import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
  CompositionSequenceManifestSchema,
  compositionMediaFrameId,
  resolveCompositionMediaLimits,
  type CompositionMediaLimits,
  type CompositionVisualMediaAsset,
} from "@still-shift/scene-contract";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import {
  compositionMediaChecksum,
  probeCompositionVideo,
} from "./composition-media-probe.ts";
import {
  COMPOSITION_MEDIA_DECODER_VERSION,
  compositionMediaColorFilter,
  inspectCompositionPng,
  tagCompositionSrgbPng,
} from "./composition-media-color.ts";

import {
  compositionMediaCacheLock,
  finishCompositionMediaCacheTransaction,
  compositionMediaCacheSize,
} from "./composition-media-cache-storage.ts";

const hash = (value: string | Uint8Array) =>
  "sha256:" + createHash("sha256").update(value).digest("hex");
const Hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const Frame = z
  .object({
    ordinal: z.number().int().min(0).max(863999),
    sha256: Hash,
    byteLength: z
      .number()
      .int()
      .min(1)
      .max(2 ** 32),
  })
  .strict();
const Manifest = z
  .object({
    schemaVersion: z.literal("composition-media-cache-1"),
    key: Hash,
    identity: z.string().max(48 * 1024 * 1024),
    frames: z.array(Frame).max(262144),
  })
  .strict();
type CacheManifest = z.infer<typeof Manifest>;
export type PreparedCompositionMediaFrame = z.infer<typeof Frame> & {
  id: string;
  width: number;
  height: number;
};
export type PreparedCompositionVisualMedia = {
  asset: string;
  sourceHash: string;
  key: string;
  decoderVersion: typeof COMPOSITION_MEDIA_DECODER_VERSION;
  ffmpegIdentity: string;
  cacheHit: boolean;
  cacheBytes: number;
  sourceProvenance: Record<string, unknown>;
  frames: PreparedCompositionMediaFrame[];
  assetPaths: Record<string, string>;
};
type Options = {
  asset: CompositionVisualMediaAsset;
  sourceDirectory: string;
  cacheDirectory: string;
  /** Required original source ordinals, sorted/deduplicated by preparation. */
  ordinals: readonly number[];
  mappingHash?: string;
  limits?: CompositionMediaLimits;
  signal?: AbortSignal | undefined;
};
const canonicalColor = (asset: CompositionVisualMediaAsset) => ({
  primaries: asset.color.primaries,
  transfer: asset.color.transfer,
  matrix: asset.color.matrix,
  range: asset.color.range,
});
async function decodeFrames(args: string[], signal?: AbortSignal) {
  try {
    await runProcess("ffmpeg", args, { signal, maxBuffer: 1024 * 1024 });
  } catch {
    signal?.throwIfAborted();
    passageError(
      "comp-media-format",
      "Pinned decoder could not prepare the source frames",
      { path: "media" },
    );
  }
}
const frameName = (ordinal: number) =>
  `frame-${String(ordinal).padStart(6, "0")}.png`;

async function boundedFile(path: string, maxBytes: number): Promise<Buffer> {
  const file = await lstat(path).catch(() =>
    passageError("comp-media-format", "Media file is unavailable", { path }),
  );
  if (!file.isFile() || !file.size || file.size > maxBytes)
    passageError(
      "comp-media-limit",
      "Media file exceeds its allocation bound or is not regular",
      { path },
    );
  const bytes = await readFile(path);
  if (bytes.length !== file.size)
    passageError("comp-media-checksum", "Media changed during reading", {
      path,
    });
  return bytes;
}
async function sourceIdentity(options: Options) {
  const { asset, signal } = options;
  const limits = resolveCompositionMediaLimits(options.limits);
  if (
    asset.width > limits.maxWidth ||
    asset.height > limits.maxHeight ||
    (asset.frameCount * asset.frameRate.denominator) /
      asset.frameRate.numerator >
      limits.maxDurationSeconds
  )
    passageError("comp-media-limit", "Source exceeds configured media limits", {
      path: asset.id,
    });
  const source = resolve(options.sourceDirectory, asset.path);
  if (
    asset.type === "sequence" &&
    (asset.color.transfer !== "iec61966-2-1" ||
      asset.color.matrix !== "gbr" ||
      asset.color.range !== "pc")
  )
    passageError(
      "comp-media-color",
      "Sequence descriptors require full-range sRGB RGB",
      { path: asset.id },
    );
  if (asset.type === "video") {
    const probe = await probeCompositionVideo(source, {
      expected: asset,
      ...(options.limits ? { limits: options.limits } : {}),
      signal,
    });
    const { presentationPts, ...metadata } = probe;
    return {
      source,
      provenance: {
        ...metadata,
        ptsHash: hash(JSON.stringify(presentationPts)),
      },
      verify: async () => {
        if ((await compositionMediaChecksum(source, signal)) !== asset.sha256)
          passageError(
            "comp-media-checksum",
            "Video changed during frame preparation",
            { path: source },
          );
      },
      sequencePaths: undefined,
    };
  }
  const manifestPath = resolve(options.sourceDirectory, asset.manifestPath);
  const bytes = await boundedFile(manifestPath, 80 * asset.frameCount + 1024);
  if (hash(bytes) !== asset.sha256)
    passageError(
      "comp-media-checksum",
      "Sequence manifest bytes differ from authored identity",
      { path: manifestPath },
    );
  let manifest: z.infer<typeof CompositionSequenceManifestSchema>;
  try {
    manifest = CompositionSequenceManifestSchema.parse(
      JSON.parse(bytes.toString("utf8")),
    );
  } catch {
    passageError("comp-media-format", "Invalid pinned sequence manifest", {
      path: manifestPath,
    });
  }
  if (manifest.frames.length !== asset.frameCount)
    passageError(
      "comp-media-provenance",
      "Sequence manifest count differs from descriptor",
      { path: manifestPath },
    );
  const paths = Array.from({ length: asset.frameCount }, (_, ordinal) =>
    compositionSequenceFramePath(source, asset.firstFrame + ordinal),
  );
  const authorities = new Set<string>();
  const verify = async () => {
    signal?.throwIfAborted();
    if ((await compositionMediaChecksum(manifestPath, signal)) !== asset.sha256)
      passageError(
        "comp-media-checksum",
        "Sequence manifest changed during preparation",
        { path: manifestPath },
      );
    for (const [ordinal, path] of paths.entries()) {
      signal?.throwIfAborted();
      const png = await boundedFile(
        path,
        asset.width * asset.height * 8 + 1024 * 1024,
      );
      if (hash(png) !== manifest.frames[ordinal])
        passageError(
          "comp-media-checksum",
          "Original sequence frame differs from its manifest",
          { path },
        );
      const info = inspectCompositionPng(png);
      if (info.width !== asset.width || info.height !== asset.height)
        passageError(
          "comp-media-provenance",
          "Sequence PNG dimensions differ from descriptor",
          { path },
        );
      authorities.add(info.colorAuthority);
    }
  };
  await verify();
  return {
    source,
    provenance: {
      sourceHash: asset.sha256,
      width: asset.width,
      height: asset.height,
      frameRate: {
        numerator: asset.frameRate.numerator,
        denominator: asset.frameRate.denominator,
      },
      frameCount: asset.frameCount,
      color: canonicalColor(asset),
      colorAuthorities: [...authorities].sort(),
    },
    verify,
    sequencePaths: paths,
  };
}

async function readCachedFrames(
  directory: string,
  manifest: CacheManifest,
  ordinals: number[],
  asset: CompositionVisualMediaAsset,
) {
  if (
    manifest.frames.length !== ordinals.length ||
    manifest.frames.some((frame, index) => frame.ordinal !== ordinals[index])
  )
    passageError(
      "comp-media-provenance",
      "Cache original frame ordinals differ",
      { path: directory },
    );
  for (const frame of manifest.frames) {
    const path = join(directory, frameName(frame.ordinal));
    const png = await boundedFile(
      path,
      asset.width * asset.height * 4 + asset.height + 1024 * 1024,
    );
    if (png.length !== frame.byteLength || hash(png) !== frame.sha256)
      passageError("comp-media-checksum", "Prepared frame cache was modified", {
        path,
      });
    const info = inspectCompositionPng(png);
    if (
      info.width !== asset.width ||
      info.height !== asset.height ||
      info.bitDepth !== 8 ||
      info.colorType !== 6 ||
      info.colorAuthority !== "sRGB"
    )
      passageError(
        "comp-media-provenance",
        "Prepared cache must contain canonical sRGB RGBA8 frames",
        { path },
      );
  }
}

/** Prepare immutable original frames, under one bounded cache transaction; no seek-based decode. */
export async function prepareCompositionVisualMedia(
  options: Options,
): Promise<PreparedCompositionVisualMedia> {
  const { asset, signal } = options;
  signal?.throwIfAborted();
  const ordinals = [...new Set(options.ordinals)].sort((a, b) => a - b);
  if (ordinals.length > 262144)
    passageError(
      "comp-media-limit",
      "Prepared cache metadata exceeds bounded frame-entry count",
      { path: asset.id },
    );
  if (
    ordinals.some(
      (frame) =>
        !Number.isSafeInteger(frame) || frame < 0 || frame >= asset.frameCount,
    )
  )
    passageError(
      "comp-media-provenance",
      "Required source ordinals must fit the original source",
      { path: asset.id },
    );
  if (
    options.mappingHash !== undefined &&
    !Hash.safeParse(options.mappingHash).success
  )
    passageError(
      "comp-media-provenance",
      "Source mapping identity must be SHA-256",
      { path: asset.id },
    );
  const limits = resolveCompositionMediaLimits(options.limits);
  const rawBytes = asset.height * (asset.width * 4 + 1);
  const worstFrameBytes = rawBytes + Math.ceil(rawBytes / 65535) * 32 + 65536;
  if (
    (ordinals.length > 0 &&
      asset.width * asset.height * 4 > limits.decodedFrameBytes) ||
    ordinals.length * (asset.width * asset.height * 4 + asset.height + 1024) >
      limits.decodedCacheBytes
  )
    passageError(
      "comp-media-limit",
      "Required decoded source exceeds configured allocation limits",
      { path: asset.id },
    );
  const inspected = await sourceIdentity(options);
  const runtime = await runProcess("ffmpeg", ["-version"], {
    signal,
    maxBuffer: 128 * 1024,
  });
  const ffmpegIdentity = hash(runtime.stdout);
  const identity = JSON.stringify({
    decoderVersion: COMPOSITION_MEDIA_DECODER_VERSION,
    ffmpegIdentity,
    source: inspected.provenance,
    color: canonicalColor(asset),
    pixelFormat: "rgba8-srgb-straight",
    ordinals,
    mappingHash: options.mappingHash ?? null,
  });
  const key = hash(identity);
  const root = resolve(options.cacheDirectory),
    directory = join(root, key.slice(7));
  await mkdir(root, { recursive: true });
  const release = await compositionMediaCacheLock(root, signal);
  let stage: string | undefined;
  let published = false;
  try {
    signal?.throwIfAborted();
    const priorBytes = await compositionMediaCacheSize(root);
    if (priorBytes > limits.decodedCacheBytes)
      passageError(
        "comp-media-limit",
        "Existing cumulative media cache exceeds configured bytes",
        { path: root },
      );
    let manifest: CacheManifest;
    let cacheHit = false;
    const existing = await lstat(directory).catch((error) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (existing) {
      if (!existing.isDirectory())
        passageError(
          "comp-media-format",
          "Media cache entry is not a directory",
          { path: directory },
        );
      try {
        manifest = Manifest.parse(
          JSON.parse(
            (
              await boundedFile(
                join(directory, "manifest.json"),
                48 * 1024 * 1024,
              )
            ).toString("utf8"),
          ),
        );
      } catch (error) {
        if (error instanceof SyntaxError || error instanceof z.ZodError)
          passageError(
            "comp-media-provenance",
            "Invalid media cache manifest",
            { path: directory },
          );
        throw error;
      }
      if (manifest.key !== key || manifest.identity !== identity)
        passageError(
          "comp-media-provenance",
          "Media cache provenance differs from requested source mapping",
          { path: directory },
        );
      await readCachedFrames(directory, manifest, ordinals, asset);
      cacheHit = true;
    } else {
      // Reserve a conservative maximum before FFmpeg can write any decoded frames.
      const manifestBudget =
        Buffer.byteLength(identity) + ordinals.length * 256 + 1024;
      if (
        priorBytes +
          ordinals.length * worstFrameBytes +
          manifestBudget +
          (ordinals.length === 0
            ? 0
            : asset.type === "sequence"
              ? asset.width * asset.height * 8 + 1024 * 1024 + worstFrameBytes
              : worstFrameBytes) >
        limits.decodedCacheBytes
      )
        passageError(
          "comp-media-limit",
          "Cumulative media cache reservation exceeds configured bytes",
          { path: root },
        );
      stage = join(root, ".prepare-" + randomUUID());
      await mkdir(stage);
      const frames: CacheManifest["frames"] = [];
      // Bounded select expressions retain FFmpeg's original presentation ordinal n.
      if (asset.type === "video") {
        for (let start = 0; start < ordinals.length; start += 256) {
          const selected = ordinals.slice(start, start + 256);
          const filter = `select='${selected.map((frame) => `eq(n,${frame})`).join("+")}',${compositionMediaColorFilter(asset.color)}`;
          await decodeFrames(
            [
              "-v",
              "error",
              "-nostdin",
              "-noautorotate",
              "-threads",
              "1",
              "-i",
              inspected.source,
              "-map",
              "0:v:0",
              "-an",
              "-sn",
              "-dn",
              "-vf",
              filter,
              "-fps_mode",
              "passthrough",
              "-frames:v",
              String(selected.length),
              "-threads",
              "1",
              "-filter_threads",
              "1",
              "-start_number",
              "0",
              join(stage, "decoded-%06d.png"),
            ],
            signal,
          );
          for (const [index, ordinal] of selected.entries()) {
            const temporary = join(
              stage,
              `decoded-${String(index).padStart(6, "0")}.png`,
            );
            const png = tagCompositionSrgbPng(
              await boundedFile(temporary, worstFrameBytes),
            );
            const target = join(stage, frameName(ordinal));
            await writeFile(target, png);
            await rm(temporary);
            frames.push({ ordinal, sha256: hash(png), byteLength: png.length });
          }
        }
      } else {
        for (const ordinal of ordinals) {
          signal?.throwIfAborted();
          const input = join(stage, "source.png"),
            output = join(stage, frameName(ordinal));
          const original = await boundedFile(
            inspected.sequencePaths![ordinal]!,
            asset.width * asset.height * 8 + 1024 * 1024,
          );
          await writeFile(input, tagCompositionSrgbPng(original));
          await decodeFrames(
            [
              "-v",
              "error",
              "-nostdin",
              "-noautorotate",
              "-i",
              input,
              "-vf",
              "format=rgba",
              "-frames:v",
              "1",
              "-threads",
              "1",
              output,
            ],
            signal,
          );
          const png = tagCompositionSrgbPng(
            await boundedFile(output, worstFrameBytes),
          );
          await writeFile(output, png);
          await rm(input);
          frames.push({ ordinal, sha256: hash(png), byteLength: png.length });
        }
      }
      manifest = {
        schemaVersion: "composition-media-cache-1",
        key,
        identity,
        frames,
      };
      await writeFile(
        join(stage, "manifest.json"),
        JSON.stringify(manifest) + "\n",
      );
      await readCachedFrames(stage, manifest, ordinals, asset);
      await inspected.verify();
      signal?.throwIfAborted();
      if (
        priorBytes + (await compositionMediaCacheSize(stage)) >
        limits.decodedCacheBytes
      )
        passageError(
          "comp-media-limit",
          "Actual prepared bytes exceed cumulative media cache bound",
          { path: root },
        );
      await rename(stage, directory);
      stage = undefined;
      published = true;
    }
    await inspected.verify();
    signal?.throwIfAborted();
    const frames = manifest.frames.map((frame) => ({
      ...frame,
      id: compositionMediaFrameId(asset.id, frame.ordinal),
      width: asset.width,
      height: asset.height,
    }));
    return {
      asset: asset.id,
      sourceHash: asset.sha256,
      key,
      decoderVersion: COMPOSITION_MEDIA_DECODER_VERSION,
      ffmpegIdentity,
      sourceProvenance: inspected.provenance,
      cacheHit,
      cacheBytes: await compositionMediaCacheSize(root),
      frames,
      assetPaths: Object.fromEntries(
        frames.map((frame) => [
          frame.id,
          join(directory, frameName(frame.ordinal)),
        ]),
      ),
    };
  } catch (error) {
    if (published) await rm(directory, { recursive: true, force: true });
    throw error;
  } finally {
    await finishCompositionMediaCacheTransaction(release, stage);
  }
}
