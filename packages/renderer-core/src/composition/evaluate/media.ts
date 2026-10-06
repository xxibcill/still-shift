import type {
  CompositionAsset,
  CompositionLayer,
} from "@still-shift/scene-contract";
import { passageError } from "../../passage-diagnostics.ts";
import { sourceFramePair, type SourceFramePair } from "./time-controls.ts";

export type SampledCompositionMedia = {
  asset: string;
  sourceHash: string;
  sourceSeconds: number;
  pair?: SourceFramePair;
  sourceSample?: number;
  clipSample?: number;
};

/** Media-only quantization: Q32 source frames / Q16 PCM samples, never CE0 clocks. */
export function mediaSamplePosition(
  value: number,
  fractionalBits: 16 | 32,
): number {
  const scale = 2 ** fractionalBits;
  if (
    !Number.isFinite(value) ||
    Math.abs(value) * scale > Number.MAX_SAFE_INTEGER
  )
    passageError(
      "comp-media-time",
      "Media sample time exceeds its exact quantization range",
      { path: "timeRemap" },
    );
  return Math.round(value * scale) / scale;
}

export function naturalMediaSeconds(
  layer: CompositionLayer,
  asset: CompositionAsset,
  localFrame: number,
  scopeFps: number,
): number {
  if (
    (layer.type === "video" || layer.type === "sequence") &&
    (asset.type === "video" || asset.type === "sequence")
  )
    return (
      localFrame / scopeFps +
      ((layer.sourceInFrame ?? 0) * asset.frameRate.denominator) /
        asset.frameRate.numerator
    );
  if (layer.type === "audio" && asset.type === "audio")
    return localFrame / scopeFps + (layer.sourceStartSample ?? 0) / 48000;
  passageError("comp-asset-type", "Media layer and source types differ", {
    node: layer.id,
    path: "asset",
  });
}

/** Derive source indices only after keys, drivers, expressions and normalization. */
export function sampledCompositionMedia(
  layer: CompositionLayer,
  asset: CompositionAsset,
  sourceSeconds: number,
  localFrame: number,
  scopeFps: number,
): SampledCompositionMedia {
  const sampled: SampledCompositionMedia = {
    asset: asset.id,
    sourceHash: asset.sha256,
    sourceSeconds,
  };
  if (!Number.isFinite(sourceSeconds))
    passageError("comp-media-time", "Media source time must be finite", {
      node: layer.id,
      path: "timeRemap",
    });
  if (
    (layer.type === "video" || layer.type === "sequence") &&
    (asset.type === "video" || asset.type === "sequence")
  ) {
    const begin = layer.sourceInFrame ?? 0;
    const end = layer.sourceOutFrame ?? asset.frameCount;
    const raw =
      (sourceSeconds * asset.frameRate.numerator) / asset.frameRate.denominator;
    const frame = mediaSamplePosition(
      Math.max(begin, Math.min(end - 1, raw)),
      32,
    );
    const pair = sourceFramePair(
      frame - begin,
      end - begin,
      layer.frameBlending,
    );
    sampled.pair = {
      first: pair.first + begin,
      second: pair.second + begin,
      mix: pair.mix,
    };
  } else if (layer.type === "audio" && asset.type === "audio") {
    sampled.sourceSample = mediaSamplePosition(sourceSeconds * 48000, 16);
    sampled.clipSample = mediaSamplePosition(
      (localFrame / scopeFps) * 48000,
      16,
    );
  } else
    passageError("comp-asset-type", "Media layer and source types differ", {
      node: layer.id,
      path: "asset",
    });
  return sampled;
}
