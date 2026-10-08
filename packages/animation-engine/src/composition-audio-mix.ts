import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
  COMPOSITION_AUDIO_DECODER_VERSION,
  COMPOSITION_AUDIO_MIXER_VERSION,
  COMPOSITION_AUDIO_WAVEFORM_POINTS,
  CompositionPreparedAudioSchema,
  resolveCompositionMediaLimits,
  type Composition,
  type CompositionLayer,
  type CompositionPreparedAudio,
} from "@still-shift/scene-contract";
import {
  evaluateCompositionAudio,
  COMPOSITION_EVALUATOR_VERSION,
  type EvaluatedCompositionAudio,
} from "../../renderer-core/src/composition/evaluate/evaluate.ts";
import { compileComposition } from "../../renderer-core/src/composition/evaluate/compile.ts";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import {
  prepareCompositionAudioSource,
  verifyCompositionAudioPcm,
  type PreparedCompositionAudioSource,
} from "./composition-media-audio.ts";
import { compositionMediaChecksum } from "./composition-media-probe.ts";
import {
  compositionMediaCacheDirectory,
  compositionMediaCacheIdentity,
  compositionMediaCacheLock,
  finishCompositionMediaCacheTransaction,
  compositionMediaCacheSize,
  compositionMediaMappingIdentity,
} from "./composition-media-cache-storage.ts";
import type { CompositionMediaPreparationOptions } from "./composition-media.ts";
import {
  COMPOSITION_PCM_PAGE_BYTES,
  COMPOSITION_PCM_PAGE_SAMPLES,
  COMPOSITION_PCM_VERIFY_BYTES,
  CompositionPcmWaveform,
  CompositionSourcePcmPages,
  compositionPcmWavHeader,
  compositionSourceWaveform,
  writeCompositionPcmBytes,
} from "./composition-audio-pcm.ts";

type AudioLayer = Extract<CompositionLayer, { type: "audio" }>;
const hash = (value: string | Uint8Array) =>
  "sha256:" + createHash("sha256").update(value).digest("hex");
const MAX_MANIFEST_BYTES = 48 * 1024 * 1024;
const Manifest = z
  .object({
    schemaVersion: z.literal("composition-audio-mix-cache-1"),
    key: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    identity: z.string().max(16 * 1024 * 1024),
    audio: CompositionPreparedAudioSchema,
    working: z
      .object({
        reservedBytes: z.number().int().positive(),
        peakPcmBytes: z.number().int().positive(),
        sourcePageLoads: z.number().int().min(0),
        sourcePageEvictions: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();
export type CompositionAudioPreparation = {
  preparedAudio: CompositionPreparedAudio;
  assetPaths: Record<string, string>;
  sourceAssetPaths: Record<string, { path: string }>;
  cacheHit: boolean;
  key: string;
  cacheBytes: number;
  working: z.infer<typeof Manifest>["working"];
};

/** Enumerate authored audio routes once; sample evaluation still owns all clocks and visibility. */
function audioRoutes(composition: Composition) {
  const scopes = [composition, ...(composition.precomps ?? [])];
  const byId = new Map(
    (composition.precomps ?? []).map((scope) => [scope.id, scope]),
  );
  const audible = new Set(
    scopes.filter((scope) =>
      scope.layers.some((layer) => layer.type === "audio"),
    ),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const scope of scopes)
      if (
        !audible.has(scope) &&
        scope.layers.some(
          (layer) =>
            layer.type === "precomp" && audible.has(byId.get(layer.comp)!),
        )
      ) {
        audible.add(scope);
        changed = true;
      }
  }
  const routes: { key: string; asset: string }[] = [];
  let instances = 0;
  const visit = (
    scope: (typeof scopes)[number],
    prefix: string,
    depth: number,
  ) => {
    if (depth > 8)
      passageError("comp-media-limit", "Audio scopes exceed bounded nesting", {
        path: "audio",
      });
    if (!audible.has(scope)) return;
    for (const layer of scope.layers) {
      if (layer.type !== "audio" && layer.type !== "precomp") continue;
      if (++instances > 20000)
        passageError(
          "comp-media-limit",
          "Audio waveform routes exceed bounded instances",
          { path: "audio" },
        );
      const key = prefix + layer.id;
      if (layer.type === "audio") routes.push({ key, asset: layer.asset });
      else visit(byId.get(layer.comp)!, key + "/", depth + 1);
    }
  };
  visit(composition, "", 0);
  return routes;
}

function fade(ramp: number, curve: AudioLayer["fadeInCurve"]) {
  const value = Math.max(0, Math.min(1, ramp));
  return value === 1 || curve !== "equal-power"
    ? value
    : Math.sin((value * Math.PI) / 2);
}
function shapePcm(
  state: EvaluatedCompositionAudio,
  source: PreparedCompositionAudioSource,
  left: number,
  right: number,
): [number, number] {
  const layer = state.layer;
  const length =
    (layer.sourceEndSample ?? source.sampleCount) -
    (layer.sourceStartSample ?? 0);
  let envelope = 1;
  if (layer.fadeInSamples)
    envelope *= fade(state.clipSample / layer.fadeInSamples, layer.fadeInCurve);
  if (layer.fadeOutSamples)
    envelope *= fade(
      (length - state.clipSample) / layer.fadeOutSamples,
      layer.fadeOutCurve,
    );
  // CE16 rounds the combined fade/gain envelope once, then source and pan products.
  const gain = Math.fround(envelope * 10 ** (state.gainDb / 20));
  left = Math.fround(left * gain);
  right = Math.fround(right * gain);
  if (state.pan !== 0) {
    const angle = ((state.pan + 1) * Math.PI) / 4;
    const leftGain =
      state.pan === 1 ? 0 : Math.fround(Math.SQRT2 * Math.cos(angle));
    const rightGain =
      state.pan === -1 ? 0 : Math.fround(Math.SQRT2 * Math.sin(angle));
    left = Math.fround(left * leftGain);
    right = Math.fround(right * rightGain);
  }
  return [left, right];
}
function sourceSample(
  pages: CompositionSourcePcmPages,
  source: PreparedCompositionAudioSource,
  sample: number,
  signal?: AbortSignal,
) {
  const pair = pages.sample(source, sample);
  return (
    pair ??
    pages.load(source, sample, signal).then(() => pages.sample(source, sample)!)
  );
}
async function mixPcm(
  composition: Composition,
  sources: PreparedCompositionAudioSource[],
  target: string,
  sampleCount: number,
  points: number,
  routes: ReturnType<typeof audioRoutes>,
  workingBudget: number,
  signal?: AbortSignal,
) {
  const waveBytes = (sources.length + routes.length + 1) * points * 32;
  const fixedBytes =
    waveBytes + COMPOSITION_PCM_PAGE_BYTES + COMPOSITION_PCM_VERIFY_BYTES + 58;
  const pageCount = Math.floor(
    (workingBudget - fixedBytes) / COMPOSITION_PCM_PAGE_BYTES,
  );
  if (pageCount < 2)
    passageError(
      "comp-media-limit",
      "Audio mix working reservation cannot hold output, waveforms and source pages",
      { path: "audioWorkingBytes" },
    );
  const pages = new CompositionSourcePcmPages(pageCount);
  const mixWave = new CompositionPcmWaveform(sampleCount, points);
  const processed = new Map(
    routes.map((route) => [
      route.key,
      new CompositionPcmWaveform(sampleCount, points),
    ]),
  );
  const sourceWaves: CompositionPreparedAudio["waveforms"]["source"] = [];
  for (const source of sources)
    sourceWaves.push(await compositionSourceWaveform(source, points, signal));
  const sourceById = new Map(sources.map((source) => [source.asset, source]));
  const header = compositionPcmWavHeader(sampleCount),
    output = Buffer.allocUnsafe(COMPOSITION_PCM_PAGE_BYTES);
  const digest = createHash("sha256");
  const file = await open(target, "wx");
  try {
    await writeCompositionPcmBytes(file, header);
    digest.update(header);
    for (
      let first = 0;
      first < sampleCount;
      first += COMPOSITION_PCM_PAGE_SAMPLES
    ) {
      signal?.throwIfAborted();
      const frames = Math.min(
        COMPOSITION_PCM_PAGE_SAMPLES,
        sampleCount - first,
      );
      for (let offset = 0; offset < frames; offset++) {
        const sample = first + offset;
        let left = 0,
          right = 0;
        for (const state of evaluateCompositionAudio(composition, sample)) {
          const source = sourceById.get(state.layer.asset)!;
          const begin = state.layer.sourceStartSample ?? 0,
            end = state.layer.sourceEndSample ?? source.sampleCount;
          if (state.sourceSample < begin || state.sourceSample >= end) continue;
          const ordinal = Math.floor(state.sourceSample),
            fraction = state.sourceSample - ordinal;
          const current = sourceSample(pages, source, ordinal, signal);
          let [l, r] = Array.isArray(current) ? current : await current;
          if (fraction) {
            const next = sourceSample(
              pages,
              source,
              Math.min(end - 1, ordinal + 1),
              signal,
            );
            const [nextL, nextR] = Array.isArray(next) ? next : await next;
            l = Math.fround(l * (1 - fraction) + nextL * fraction);
            r = Math.fround(r * (1 - fraction) + nextR * fraction);
          }
          [l, r] = shapePcm(state, source, l, r);
          processed.get(state.key)!.add(sample, l, r);
          left = Math.fround(left + l);
          right = Math.fround(right + r);
        }
        mixWave.add(sample, left, right);
        output.writeFloatLE(left, offset * 8);
        output.writeFloatLE(right, offset * 8 + 4);
      }
      const bytes = output.subarray(0, frames * 8);
      await writeCompositionPcmBytes(file, bytes);
      digest.update(bytes);
    }
    signal?.throwIfAborted();
    return {
      sha256: "sha256:" + digest.digest("hex"),
      waveforms: {
        source: sourceWaves,
        processed: routes.map((route) => ({
          ...processed.get(route.key)!.result(),
          ...route,
        })),
        mix: mixWave.result(),
      },
      working: {
        reservedBytes: workingBudget,
        peakPcmBytes: fixedBytes + pages.allocatedBytes,
        sourcePageLoads: pages.loads,
        sourcePageEvictions: pages.evictions,
      },
    };
  } finally {
    try {
      await file.close();
    } finally {
      await pages.dispose();
    }
  }
}

/** Prepare the complete continuous native mix before any export-range selection. */
export async function prepareCompositionAudio(
  composition: Composition,
  sourceDirectory: string,
  options: CompositionMediaPreparationOptions = {},
): Promise<CompositionAudioPreparation | undefined> {
  const { signal } = options;
  signal?.throwIfAborted();
  const assets = composition.assets.filter((asset) => asset.type === "audio");
  if (!assets.length) return undefined;
  compileComposition(composition);
  const limits = resolveCompositionMediaLimits(composition.mediaLimits);
  const sampleCount = (composition.frameCount * 48000) / composition.fps;
  if (
    !Number.isSafeInteger(sampleCount) ||
    sampleCount > 172_800_000 ||
    sampleCount / 48000 > limits.maxDurationSeconds
  )
    passageError(
      "comp-media-limit",
      "Audio mix duration exceeds the exact configured PCM clock",
      { path: "frameCount" },
    );
  const routes = audioRoutes(composition);
  const points = Math.min(
    1024,
    Math.floor(
      COMPOSITION_AUDIO_WAVEFORM_POINTS / (assets.length + routes.length + 1),
    ),
  );
  const fixedBytes =
    (assets.length + routes.length + 1) * points * 32 +
    COMPOSITION_PCM_PAGE_BYTES +
    COMPOSITION_PCM_VERIFY_BYTES +
    58;
  if (fixedBytes + COMPOSITION_PCM_PAGE_BYTES * 2 > limits.audioWorkingBytes)
    passageError(
      "comp-media-limit",
      "Audio waveform/output/source-page reservation exceeds configured PCM bytes",
      { path: "audioWorkingBytes" },
    );
  const root = resolve(compositionMediaCacheDirectory(options.cacheDirectory));
  const sources: PreparedCompositionAudioSource[] = [];
  const sourceAssetPaths: CompositionAudioPreparation["sourceAssetPaths"] = {};
  for (const asset of assets) {
    sources.push(
      await prepareCompositionAudioSource({
        asset,
        sourceDirectory,
        cacheDirectory: root,
        ...(composition.mediaLimits ? { limits: composition.mediaLimits } : {}),
        signal,
      }),
    );
    sourceAssetPaths[asset.id] = { path: resolve(sourceDirectory, asset.path) };
  }
  const sourceProofs: CompositionPreparedAudio["sources"] = sources.map(
    (source) => ({
      asset: source.asset,
      sourceHash: source.sourceHash,
      pcmSha256: source.sha256,
      byteLength: source.byteLength,
      sampleCount: source.sampleCount,
      channels: source.channels,
      ffmpegIdentity: source.ffmpegIdentity,
    }),
  );
  const identity = compositionMediaCacheIdentity({
    evaluatorVersion: COMPOSITION_EVALUATOR_VERSION,
    mixerVersion: COMPOSITION_AUDIO_MIXER_VERSION,
    decoderVersion: COMPOSITION_AUDIO_DECODER_VERSION,
    mappingHash: compositionMediaMappingIdentity(composition),
    sourceProofs,
    points,
  });
  const key = hash(identity),
    directory = join(root, key.slice(7));
  const byteLength = sampleCount * 8 + 58;
  const manifestBudget =
    Buffer.byteLength(identity) +
    (assets.length + routes.length + 1) * points * 32 +
    routes.length * 4352 +
    assets.length * 1024 +
    4096;
  if (manifestBudget > MAX_MANIFEST_BYTES)
    passageError(
      "comp-media-limit",
      "Audio mix metadata exceeds bounded cache manifest",
      { path: "audio" },
    );
  const verifySources = async () => {
    for (const source of sources) {
      await verifyCompositionAudioPcm(source.path, source, signal);
      if (
        (await compositionMediaChecksum(
          sourceAssetPaths[source.asset]!.path,
          signal,
        )) !== source.sourceHash
      )
        passageError(
          "comp-media-checksum",
          "Original audio changed during mixing",
          { path: source.asset },
        );
    }
  };
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
    let manifest: z.infer<typeof Manifest>;
    let cacheHit = false;
    const existing = await lstat(directory).catch((error) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (existing) {
      if (!existing.isDirectory())
        passageError(
          "comp-media-format",
          "Audio mix cache is not a directory",
          { path: directory },
        );
      const path = join(directory, "manifest.json");
      const stat = await lstat(path).catch(() =>
        passageError("comp-media-provenance", "Audio mix manifest is missing", {
          path,
        }),
      );
      if (!stat.isFile() || stat.size > MAX_MANIFEST_BYTES)
        passageError(
          "comp-media-limit",
          "Audio mix manifest exceeds its metadata bound",
          { path },
        );
      try {
        manifest = Manifest.parse(JSON.parse(await readFile(path, "utf8")));
      } catch {
        passageError(
          "comp-media-provenance",
          "Invalid audio mix cache manifest",
          { path },
        );
      }
      if (
        manifest.key !== key ||
        manifest.identity !== identity ||
        manifest.audio.sampleCount !== sampleCount ||
        JSON.stringify(manifest.audio.sources) !== JSON.stringify(sourceProofs)
      )
        passageError(
          "comp-media-provenance",
          "Audio mix provenance differs from authored clocks/sources",
          { path },
        );
      if (manifest.working.peakPcmBytes > limits.audioWorkingBytes)
        passageError(
          "comp-media-limit",
          "Cached audio mix exceeds configured PCM working evidence",
          { path },
        );
      await verifyCompositionAudioPcm(
        join(directory, "mix.wav"),
        {
          ...manifest.audio.resource,
          header: compositionPcmWavHeader(sampleCount),
        },
        signal,
      );
      cacheHit = true;
    } else {
      if (priorBytes + byteLength + manifestBudget > limits.decodedCacheBytes)
        passageError(
          "comp-media-limit",
          "Cumulative native audio mix reservation exceeds configured bytes",
          { path: root },
        );
      stage = join(root, ".prepare-audio-mix-" + randomUUID());
      await mkdir(stage);
      const mixed = await mixPcm(
        composition,
        sources,
        join(stage, "mix.wav"),
        sampleCount,
        points,
        routes,
        limits.audioWorkingBytes,
        signal,
      );
      const audio = CompositionPreparedAudioSchema.parse({
        schemaVersion: "composition-prepared-audio-1",
        decoderVersion: COMPOSITION_AUDIO_DECODER_VERSION,
        mixerVersion: COMPOSITION_AUDIO_MIXER_VERSION,
        evaluatorVersion: COMPOSITION_EVALUATOR_VERSION,
        mappingHash: compositionMediaMappingIdentity(composition),
        sampleRate: 48000,
        channels: 2,
        sampleCount,
        sources: sourceProofs,
        resource: { id: "__audio:mix", sha256: mixed.sha256, byteLength },
        waveforms: mixed.waveforms,
      });
      manifest = {
        schemaVersion: "composition-audio-mix-cache-1",
        key,
        identity,
        audio,
        working: mixed.working,
      };
      await writeFile(
        join(stage, "manifest.json"),
        JSON.stringify(manifest) + "\n",
      );
      await verifyCompositionAudioPcm(
        join(stage, "mix.wav"),
        { ...audio.resource, header: compositionPcmWavHeader(sampleCount) },
        signal,
      );
      await verifySources();
      signal?.throwIfAborted();
      if (
        priorBytes + (await compositionMediaCacheSize(stage)) >
        limits.decodedCacheBytes
      )
        passageError(
          "comp-media-limit",
          "Actual audio mix exceeds cumulative cache bytes",
          { path: root },
        );
      await rename(stage, directory);
      stage = undefined;
      published = true;
    }
    await verifySources();
    const cacheBytes = await compositionMediaCacheSize(root);
    signal?.throwIfAborted();
    return {
      preparedAudio: manifest.audio,
      assetPaths: { [manifest.audio.resource.id]: join(directory, "mix.wav") },
      sourceAssetPaths,
      cacheHit,
      key,
      cacheBytes,
      working: manifest.working,
    };
  } catch (error) {
    if (published) await rm(directory, { recursive: true, force: true });
    throw error;
  } finally {
    await finishCompositionMediaCacheTransaction(release, stage);
  }
}
