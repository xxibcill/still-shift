/**
 * @still-shift/color-science — the color grading engine's pure math, float64.
 * No DOM, Node or renderer imports (checked by `pnpm check:boundaries`).
 * Provenance per file: see PROVENANCE.md beside this package.
 */
export { ColorScienceError } from "./errors.ts";
export {
  IDENTITY,
  apply as applyMatrix,
  invert as invertMatrix,
  multiply as multiplyMatrices,
  perChannel,
} from "./matrix.ts";
export type { Mat3, Rgb } from "./matrix.ts";
export {
  COLOR_SPACES,
  COLOR_SPACE_IDS,
  chromaticAdaptationMatrix,
  colorSpace,
  lumaCoefficients,
  normalizedPrimaryMatrix,
  rgbConversionMatrix,
  rgbToXyzMatrix,
} from "./primaries.ts";
export type { ChromaticAdaptation, ColorSpace } from "./primaries.ts";
export {
  TRANSFER_FUNCTIONS,
  TRANSFER_FUNCTION_IDS,
  transferFunction,
} from "./transfer.ts";
export type { TransferFunction, TransferKind } from "./transfer.ts";
export { INPUT_TRANSFORMS, inputTransform } from "./input-transforms.ts";
export type {
  InputTransformEntry,
  UnavailableInputTransform,
  ValidatedInputTransform,
} from "./input-transforms.ts";
export {
  MAX_LUT_1D_SIZE,
  MAX_LUT_3D_SIZE,
  parseCubeLut,
  sampleLut,
} from "./lut.ts";
export type { CubeLut, LutInterpolation } from "./lut.ts";
export { NEUTRAL_CDL, applyCdl } from "./cdl.ts";
export type { Cdl } from "./cdl.ts";
export {
  GRADE_LIMIT,
  HIGHLIGHT_RANGE,
  LOG2_GRADE_LIMIT,
  NEUTRAL_GRADE_PRIMARY,
  REFERENCE_CCT,
  SHADOW_RANGE,
  TINT_DUV_PER_UNIT,
  TINT_ZERO_OFFSET,
  WHITE_BALANCE_TARGET,
  TONAL_AMOUNT,
  applyGradePrimary,
  applyLinearMatrixEncoded,
  applyRgbMixer,
  gradePow,
  gradePrimaryControls,
  hueRotationMatrix,
  limitGrade,
  planckianXy,
  rgbMixer,
  srgbDecodeMirrored,
  srgbEncodeMirrored,
  temperatureTintWhite,
  whiteBalanceMatrix,
} from "./grade.ts";
export type { GradePrimary, GradePrimaryControls, RgbMixer } from "./grade.ts";
