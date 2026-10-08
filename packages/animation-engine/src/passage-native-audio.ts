import { createHash } from "node:crypto";
import { open, rm, type FileHandle } from "node:fs/promises";
import { resolve } from "node:path";
import { compositionProtectedNarration } from "@still-shift/scene-contract";
import { frameToSoundtrackSample } from "@still-shift/renderer-core/soundtrack";
import { passageError } from "@still-shift/renderer-core/passage-compositions";
import { prepareCompositionAudio } from "./composition-audio-mix.ts";
import {
  compositionPcmWavHeader,
  COMPOSITION_PCM_PAGE_BYTES,
  COMPOSITION_PCM_PAGE_SAMPLES,
  writeCompositionPcmBytes,
} from "./composition-audio-pcm.ts";
import {
  prepareCompositionAudioSource,
  verifyCompositionAudioPcm,
} from "./composition-media-audio.ts";
import { compositionMediaChecksum } from "./composition-media-probe.ts";
import { prepareCompositionMedia } from "./composition-media.ts";
import { compositionMediaCacheDirectory } from "./composition-media-cache-storage.ts";
import type { CompositionMediaPreparationOptions } from "./composition-media.ts";
import type { PassageCompositions } from "./passage-compositions.ts";
import type { PreparedPassage } from "./story-passage-io.ts";

type Interval = { start: number; end: number };
type Master = {
  beat: string;
  startSample: number;
  audio: NonNullable<Awaited<ReturnType<typeof prepareCompositionAudio>>>;
  narration?: NonNullable<Awaited<ReturnType<typeof prepareCompositionAudio>>>;
  sounds?: NonNullable<Awaited<ReturnType<typeof prepareCompositionAudio>>>;
};
export type PassageNativeAudio = {
  masters: Master[];
  narrationExclusions: Interval[];
  verify(): Promise<void>;
};

/** Every original and protected interval is checked, including beats outside a crop. */
export async function preparePassageNativeAudio(
  passage: PreparedPassage,
  compositions: PassageCompositions,
  options: CompositionMediaPreparationOptions & {
    separateNarration?: boolean;
  } = {},
): Promise<PassageNativeAudio | undefined> {
  const masters: Master[] = [],
    exclusions: Interval[] = [];
  const sample = (frame: number) =>
    frameToSoundtrackSample(frame, passage.plan.fps);
  const rootSamples = sample(passage.frameCount);
  if (
    Object.values(compositions).some((comp) =>
      comp.assets.some((asset) => asset.type === "audio"),
    ) &&
    (!Number.isSafeInteger(rootSamples) ||
      rootSamples < 1 ||
      rootSamples > 172_800_000)
  )
    passageError(
      "comp-media-limit",
      "Complete native passage audio must fit the 3600-second PCM bound before source preparation",
      { path: "frameCount" },
    );
  for (const beat of passage.beats) {
    const composition = compositions[beat.id];
    if (!composition) continue;
    options.signal?.throwIfAborted();
    for (const voice of compositionProtectedNarration(composition)) {
      const start = sample(beat.start) + voice.startSample;
      const end = start + voice.sourceEndSample - voice.sourceStartSample;
      if (
        passage.plan.narration &&
        (voice.asset.sha256 !== "sha256:" + passage.plan.narration.sha256 ||
          voice.sourceStartSample !==
            sample(passage.plan.sourceStartFrame) + start)
      )
        passageError(
          "comp-passage-narration",
          "Native narration must match the passage source identity and exact sample placement",
          { beat: beat.id, path: voice.key },
        );
      if (start < 0 || end > sample(passage.frameCount))
        passageError(
          "comp-passage-narration",
          "Complete native narration must fit the passage before range selection",
          { beat: beat.id, path: voice.key },
        );
      exclusions.push({ start, end });
    }
    await prepareCompositionMedia(composition, resolve("."), options);
    const audio = await prepareCompositionAudio(
      composition,
      resolve("."),
      options,
    );
    if (audio) {
      const master: Master = {
        beat: beat.id,
        startSample: sample(beat.start),
        audio,
      };
      if (options.separateNarration) {
        for (const stem of ["narration", "sounds"] as const) {
          const document = structuredClone(composition);
          for (const scope of [document, ...(document.precomps ?? [])])
            for (const layer of scope.layers)
              if (
                layer.type === "audio" &&
                (layer.role === "narration") !== (stem === "narration")
              )
                layer.enabled = false;
          master[stem] = (await prepareCompositionAudio(
            document,
            resolve("."),
            options,
          ))!;
        }
      }
      masters.push(master);
    }
  }
  if (!masters.length) return undefined;
  exclusions.sort((a, b) => a.start - b.start || a.end - b.end);
  const narrationExclusions: Interval[] = [];
  for (const interval of exclusions) {
    const previous = narrationExclusions.at(-1);
    if (previous && interval.start <= previous.end)
      previous.end = Math.max(previous.end, interval.end);
    else narrationExclusions.push({ ...interval });
  }
  const verify = async () => {
    for (const composition of Object.values(compositions)) {
      await prepareCompositionMedia(composition, resolve("."), options);
      for (const asset of composition.assets)
        if (asset.type === "audio")
          await prepareCompositionAudioSource({
            asset,
            sourceDirectory: resolve("."),
            cacheDirectory: compositionMediaCacheDirectory(
              options.cacheDirectory,
            ),
            ...(composition.mediaLimits
              ? { limits: composition.mediaLimits }
              : {}),
            signal: options.signal,
          });
    }
    for (const master of masters)
      for (const preparation of [
        master.audio,
        master.narration,
        master.sounds,
      ]) {
        if (!preparation) continue;
        const audio = preparation.preparedAudio;
        await verifyCompositionAudioPcm(
          preparation.assetPaths[audio.resource.id]!,
          {
            ...audio.resource,
            header: compositionPcmWavHeader(audio.sampleCount),
          },
          options.signal,
        );
      }
  };
  return { masters, narrationExclusions, verify };
}

type PcmInput = {
  path: string;
  startSample: number;
  sampleCount: number;
  headerBytes: number;
  sha256: string;
  byteLength: number;
};

/** Disk-backed Float32 addition in authored beat order; the common gain follows the sum. */
export async function renderPassageNativeAudio(
  output: string,
  passage: PreparedPassage,
  native: PassageNativeAudio,
  legacy: string | undefined,
  options: CompositionMediaPreparationOptions & {
    range?: { start: number; end: number };
    masterGainDb?: number;
    stem?: "narration" | "sounds";
  } = {},
) {
  const { signal } = options;
  const sample = (frame: number) =>
    frameToSoundtrackSample(frame, passage.plan.fps);
  const sampleCount = sample(passage.frameCount);
  const range = options.range ?? { start: 0, end: passage.frameCount };
  const start = sample(range.start),
    end = sample(range.end);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end > sampleCount ||
    end <= start
  )
    throw new Error("Invalid native passage audio range");
  const gainDb = options.masterGainDb ?? passage.audio?.masterGainDb ?? 0;
  if (!Number.isFinite(gainDb) || gainDb < -96 || gainDb > 24)
    throw new Error("Invalid native passage master gain");
  const inputs: PcmInput[] = [];
  let legacySource:
    | Awaited<ReturnType<typeof prepareCompositionAudioSource>>
    | undefined;
  if (legacy) {
    legacySource = await prepareCompositionAudioSource({
      asset: {
        id: "passage-legacy",
        type: "audio",
        path: legacy,
        sha256: await compositionMediaChecksum(legacy, signal),
        sampleRate: 48000,
        sampleCount,
        channels: 2,
      },
      sourceDirectory: resolve("."),
      cacheDirectory: compositionMediaCacheDirectory(options.cacheDirectory),
      limits: { maxDurationSeconds: 3600 },
      signal,
    });
    inputs.push({ ...legacySource, startSample: 0, headerBytes: 0 });
  }
  for (const master of native.masters) {
    const prepared = options.stem ? master[options.stem] : master.audio;
    if (!prepared)
      throw new Error(
        "Separate native narration preparation is required for saved soundtrack routing",
      );
    const audio = prepared.preparedAudio;
    inputs.push({
      path: prepared.assetPaths[audio.resource.id]!,
      startSample: master.startSample,
      sampleCount: audio.sampleCount,
      headerBytes: 58,
      ...audio.resource,
    });
  }
  const verifyInputs = async () => {
    for (const input of inputs)
      await verifyCompositionAudioPcm(
        input.path,
        {
          byteLength: input.byteLength,
          sha256: input.sha256,
          ...(input.headerBytes
            ? { header: compositionPcmWavHeader(input.sampleCount) }
            : {}),
        },
        signal,
      );
    if (
      legacySource &&
      (await compositionMediaChecksum(legacy!, signal)) !==
        legacySource.sourceHash
    )
      passageError(
        "comp-media-checksum",
        "Legacy audio changed during passage mixing",
        { path: legacy! },
      );
    await native.verify();
  };
  await verifyInputs();
  const whole = output + ".whole.wav";
  const handles = new Map<string, FileHandle>();
  const inputBytes = Buffer.allocUnsafe(COMPOSITION_PCM_PAGE_BYTES);
  const outputBytes = Buffer.allocUnsafe(COMPOSITION_PCM_PAGE_BYTES);
  const digest = createHash("sha256");
  const header = compositionPcmWavHeader(sampleCount);
  const gain = Math.fround(10 ** (gainDb / 20));
  const file = await open(whole, "wx");
  let closed = false;
  let outputCreated = false;
  const read = async (input: PcmInput, at: number, bytes: number) => {
    let handle = handles.get(input.path);
    if (!handle) {
      if (handles.size === 32) {
        const [path, old] = handles.entries().next().value!;
        handles.delete(path);
        await old.close();
      }
      handle = await open(input.path, "r");
      handles.set(input.path, handle);
    } else {
      handles.delete(input.path);
      handles.set(input.path, handle);
    }
    let offset = 0;
    while (offset < bytes) {
      signal?.throwIfAborted();
      const result = await handle.read(
        inputBytes,
        offset,
        bytes - offset,
        input.headerBytes + at * 8 + offset,
      );
      if (!result.bytesRead)
        passageError(
          "comp-media-provenance",
          "Passage PCM changed during paging",
          { path: input.path },
        );
      offset += result.bytesRead;
    }
  };
  try {
    await writeCompositionPcmBytes(file, header);
    digest.update(header);
    for (
      let first = 0;
      first < sampleCount;
      first += COMPOSITION_PCM_PAGE_SAMPLES
    ) {
      signal?.throwIfAborted();
      const count = Math.min(COMPOSITION_PCM_PAGE_SAMPLES, sampleCount - first);
      outputBytes.fill(0, 0, count * 8);
      for (const input of inputs) {
        const begin = Math.max(first, input.startSample);
        const finish = Math.min(
          first + count,
          input.startSample + input.sampleCount,
        );
        if (begin >= finish) continue;
        await read(input, begin - input.startSample, (finish - begin) * 8);
        for (let at = 0; at < (finish - begin) * 8; at += 4) {
          const target = (begin - first) * 8 + at;
          outputBytes.writeFloatLE(
            Math.fround(
              outputBytes.readFloatLE(target) + inputBytes.readFloatLE(at),
            ),
            target,
          );
        }
      }
      for (let at = 0; at < count * 8; at += 4) {
        const value = Math.fround(outputBytes.readFloatLE(at) * gain);
        if (!Number.isFinite(value))
          passageError(
            "comp-media-format",
            "Passage mixing produced nonfinite PCM",
            { path: output },
          );
        outputBytes.writeFloatLE(value, at);
      }
      const bytes = outputBytes.subarray(0, count * 8);
      await writeCompositionPcmBytes(file, bytes);
      digest.update(bytes);
    }
    await file.close();
    closed = true;
    const wholeSha256 = "sha256:" + digest.digest("hex");
    await verifyCompositionAudioPcm(
      whole,
      { sha256: wholeSha256, byteLength: sampleCount * 8 + 58, header },
      signal,
    );
    const full = await open(whole, "r");
    let selected: FileHandle | undefined;
    const selectedHeader = compositionPcmWavHeader(end - start),
      selectedDigest = createHash("sha256");
    try {
      selected = await open(output, "wx");
      outputCreated = true;
      await writeCompositionPcmBytes(selected, selectedHeader);
      selectedDigest.update(selectedHeader);
      for (let at = start; at < end; ) {
        signal?.throwIfAborted();
        const bytes = Math.min(COMPOSITION_PCM_PAGE_SAMPLES, end - at) * 8;
        let offset = 0;
        while (offset < bytes) {
          const result = await full.read(
            inputBytes,
            offset,
            bytes - offset,
            58 + at * 8 + offset,
          );
          if (!result.bytesRead)
            throw new Error("Complete passage PCM was truncated");
          offset += result.bytesRead;
        }
        const chunk = inputBytes.subarray(0, bytes);
        await writeCompositionPcmBytes(selected, chunk);
        selectedDigest.update(chunk);
        at += bytes / 8;
      }
    } finally {
      await selected?.close();
      await full.close();
    }
    const sha256 = "sha256:" + selectedDigest.digest("hex");
    await verifyCompositionAudioPcm(
      output,
      { sha256, byteLength: (end - start) * 8 + 58, header: selectedHeader },
      signal,
    );
    await verifyInputs();
    signal?.throwIfAborted();
    return {
      path: output,
      sampleRate: 48000,
      channels: 2,
      frameRange: range,
      sampleCount: end - start,
      sha256,
      wholeSha256,
      wholeSampleCount: sampleCount,
      masterGainDb: gainDb,
      narrationExclusions: native.narrationExclusions,
      nativeBeats: native.masters.map((master) => ({
        beat: master.beat,
        startSample: master.startSample,
        ...(options.stem ? master[options.stem]! : master.audio).preparedAudio
          .resource,
      })),
      ...(options.stem ? { stem: options.stem } : {}),
      peakPcmWorkingBytes: COMPOSITION_PCM_PAGE_BYTES * 2 + 262148,
    };
  } catch (error) {
    if (outputCreated) await rm(output, { force: true });
    throw error;
  } finally {
    if (!closed) await file.close();
    await Promise.all([...handles.values()].map((handle) => handle.close()));
    await rm(whole, { force: true });
  }
}
