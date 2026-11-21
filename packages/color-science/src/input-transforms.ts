/**
 * Camera input transforms: camera log code values in the camera gamut →
 * ACES2065-1 linear. Only transforms validated against the CG0 vectors
 * (OpenColorIO built-ins, within 2e-5) are `validated`; everything else is
 * listed as `unavailable` with a reason and refuses to run. Nothing is
 * approximated.
 *
 * Provenance: replaces chroma-node's `CAMERA_LOG_PROFILES` (b804dc0), where
 * every profile except Apple Log mapped to one placeholder `log25` curve and
 * Apple Log itself failed the CG0 vectors. New code.
 */
import { ColorScienceError } from "./errors.ts";
import { apply, type Rgb } from "./matrix.ts";
import { rgbConversionMatrix, type ChromaticAdaptation } from "./primaries.ts";
import { transferFunction } from "./transfer.ts";

type Common = { id: string; name: string };
export type ValidatedInputTransform = Common & {
  status: "validated";
  curve: string;
  gamut: string;
  /** Adaptation from the camera white (D65) to the ACES white, as OpenColorIO's built-in uses. */
  adaptation: ChromaticAdaptation;
  vectors: string;
};
export type UnavailableInputTransform = Common & {
  status: "unavailable";
  reason: string;
};
export type InputTransformEntry =
  | ValidatedInputTransform
  | UnavailableInputTransform;

const validated = (
  id: string,
  name: string,
  curve: string,
  gamut: string,
  adaptation: ChromaticAdaptation,
): ValidatedInputTransform => ({
  id,
  name,
  status: "validated",
  curve,
  gamut,
  adaptation,
  vectors: `benchmarks/fixtures/color/cg0/vectors/input-transforms.json#${id}`,
});
const unavailable = (
  id: string,
  name: string,
  reason: string,
): UnavailableInputTransform => ({
  id,
  name,
  status: "unavailable",
  reason,
});

export const INPUT_TRANSFORMS: readonly InputTransformEntry[] = [
  validated(
    "arri-logc3-awg3",
    "ARRI LogC3 (EI 800) / ARRI Wide Gamut 3",
    "arri-logc3",
    "arri-awg3",
    "cat02",
  ),
  validated(
    "arri-logc4-awg4",
    "ARRI LogC4 / ARRI Wide Gamut 4",
    "arri-logc4",
    "arri-awg4",
    "cat02",
  ),
  validated(
    "sony-slog3-sgamut3",
    "Sony S-Log3 / S-Gamut3",
    "sony-slog3",
    "sony-sgamut3",
    "cat02",
  ),
  validated(
    "sony-slog3-sgamut3-cine",
    "Sony S-Log3 / S-Gamut3.Cine",
    "sony-slog3",
    "sony-sgamut3-cine",
    "cat02",
  ),
  validated(
    "panasonic-vlog-vgamut",
    "Panasonic V-Log / V-Gamut",
    "panasonic-vlog",
    "panasonic-vgamut",
    "bradford",
  ),
  validated(
    "red-log3g10-rwg",
    "RED Log3G10 / REDWideGamutRGB",
    "red-log3g10",
    "red-wide-gamut",
    "bradford",
  ),
  validated(
    "canon-log2-cinema-gamut",
    "Canon Log 2 / Cinema Gamut",
    "canon-log2",
    "canon-cinema-gamut",
    "cat02",
  ),
  validated(
    "canon-log3-cinema-gamut",
    "Canon Log 3 / Cinema Gamut",
    "canon-log3",
    "canon-cinema-gamut",
    "cat02",
  ),
  validated(
    "apple-log-bt2020",
    "Apple Log / BT.2020",
    "apple-log",
    "bt2020",
    "bradford",
  ),
  unavailable(
    "arri-logc3-other-ei",
    "ARRI LogC3 at exposure indices other than 800",
    "Only EI 800 has CG0 vectors; other EIs use different curve constants.",
  ),
  unavailable(
    "bmd-film-gen5-wide-gamut",
    "Blackmagic Film Gen 5 / Blackmagic Wide Gamut",
    "Curve and gamut have CG0 vectors, but no independent end-to-end reference (no OpenColorIO built-in) and the gamut's white is not D65; the adaptation to ACES is not yet established.",
  ),
  unavailable(
    "dji-dlog-dgamut",
    "DJI D-Log / D-Gamut",
    "Curve and gamut have CG0 vectors but no independent end-to-end reference; DJI D-Log M is a different, unpublished-here curve.",
  ),
  unavailable(
    "fujifilm-flog-fgamut",
    "FUJIFILM F-Log or F-Log2 / F-Gamut",
    "Curves have CG0 vectors but no independent end-to-end reference.",
  ),
  unavailable(
    "nikon-nlog-ngamut",
    "Nikon N-Log / N-Gamut",
    "Curve has CG0 vectors but no independent end-to-end reference.",
  ),
  unavailable(
    "sony-slog2",
    "Sony S-Log2 / S-Gamut",
    "No CG0 vectors; not in the plan's priority list.",
  ),
  unavailable(
    "canon-log",
    "Canon Log (original)",
    "No CG0 vectors; not in the plan's priority list.",
  ),
];

export function inputTransform(id: string): {
  entry: InputTransformEntry;
  status: InputTransformEntry["status"];
  toAces2065: (rgb: Rgb) => [number, number, number];
} {
  const entry = INPUT_TRANSFORMS.find((t) => t.id === id);
  if (!entry) throw new ColorScienceError(`Unknown input transform "${id}"`);
  if (entry.status === "unavailable")
    return {
      entry,
      status: entry.status,
      toAces2065: () => {
        throw new ColorScienceError(
          `Input transform "${id}" is unavailable: ${entry.reason}`,
        );
      },
    };
  const curve = transferFunction(entry.curve);
  const matrix = rgbConversionMatrix(entry.gamut, "aces-ap0", entry.adaptation);
  return {
    entry,
    status: entry.status,
    toAces2065: (rgb) =>
      apply(matrix, [
        curve.decode(rgb[0]),
        curve.decode(rgb[1]),
        curve.decode(rgb[2]),
      ]),
  };
}
