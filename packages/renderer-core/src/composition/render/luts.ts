import { parseCubeLut, type CubeLut } from "@still-shift/color-science";
import type {
  CompositionAsset,
  CompositionLutAsset,
} from "@still-shift/scene-contract";

/**
 * CG5: a parsed `.cube` LUT asset as both backends read it. The Canvas
 * reference samples `lut` (float64); the GPU reads `floats` (the same table
 * as float32: the shaper's entries, then the main table's, three per entry)
 * bit-exactly from RGBA8 texels of a LUT_TEXTURE_WIDTH-wide texture.
 */
export type PreparedLut = {
  readonly sha256: string;
  readonly lut: CubeLut;
  readonly floats: Float32Array;
  /** Float offset of the main table in `floats` (the shaper comes first). */
  readonly base: number;
};

export const LUT_TEXTURE_WIDTH = 4096;

/**
 * Effect LUTs by asset slot, attached to a render effect under a symbol so
 * visual keys (JSON) never serialize the tables; `assetHashes` keys them.
 */
export const EFFECT_LUTS: unique symbol = Symbol("still-shift.effect-luts");

export function prepareLut(sha256: string, text: string): PreparedLut {
  return preparedLut(sha256, parseCubeLut(text));
}

/** The prepared form of an already parsed (or baked) table. */
export function preparedLut(sha256: string, lut: CubeLut): PreparedLut {
  const shaper = lut.shaper?.data ?? new Float64Array(0);
  const floats = new Float32Array(shaper.length + lut.data.length);
  floats.set(shaper);
  floats.set(lut.data, shaper.length);
  return Object.freeze({ sha256, lut, floats, base: shaper.length });
}

/**
 * An effect's asset slots bound to `lut` assets: each slot's pinned hash, and
 * its prepared LUT when `prepared` has one whose hash matches the pin.
 */
export function bindEffectLuts(
  assets: readonly CompositionAsset[],
  slots: Readonly<Record<string, string>>,
  prepared: (asset: CompositionLutAsset) => PreparedLut | undefined,
) {
  const hashes: Record<string, string> = {};
  const luts: Record<string, PreparedLut> = {};
  for (const [slot, id] of Object.entries(slots)) {
    const asset = assets.find((candidate) => candidate.id === id);
    if (asset?.type !== "lut") continue;
    hashes[slot] = asset.sha256;
    const lut = prepared(asset);
    if (lut?.sha256 === asset.sha256) luts[slot] = lut;
  }
  return { hashes, luts };
}

/** The run's LUT floats as RGBA8 texture bytes (each float32's bits, little-endian). */
export function lutTextureBytes(floats: readonly Float32Array[]) {
  const total = floats.reduce((sum, f) => sum + f.length, 0);
  const height = Math.max(1, Math.ceil(total / LUT_TEXTURE_WIDTH));
  const bytes = new Uint8Array(LUT_TEXTURE_WIDTH * height * 4);
  let offset = 0;
  for (const f of floats) {
    bytes.set(new Uint8Array(f.buffer, f.byteOffset, f.byteLength), offset);
    offset += f.byteLength;
  }
  return { bytes, width: LUT_TEXTURE_WIDTH, height };
}
