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
  bakeCubeLut,
  parseCubeLut,
  sampleLut,
  writeCubeLut,
} from "./lut.ts";
export type { CubeLut, LutInterpolation } from "./lut.ts";
export { NEUTRAL_CDL, applyCdl } from "./cdl.ts";
export type { Cdl } from "./cdl.ts";
export { cdlFileKind, cdlNumber, parseCdlXml, writeCdlXml } from "./cdl-xml.ts";
export type { CdlCorrection, CdlDocument, CdlFileKind } from "./cdl-xml.ts";
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
  BT709_CB_SCALE,
  BT709_CR_SCALE,
  BT709_LUMA,
  luma709,
  smoothstep,
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
export {
  binOf,
  chroma709,
  chromaticity,
  cieHistogram,
  encodedLuma,
  exposureZone,
  FALSE_COLOR_RANGES,
  falseColorClass,
  forEachPixel,
  frameRegion,
  histograms,
  hsv,
  lumaWaveform,
  pixelCoordinates,
  rgbParade,
  SKIN_LINE_DEGREES,
  SRGB_LINEAR_TABLE,
  suggestQualifier,
  suggestSampledKey,
  vectorscope,
  vectorscopeAngle,
  ycbcrParade,
} from "./scopes.ts";
export type {
  Histogram2D,
  Histograms,
  PixelCoordinates,
  Region,
  RgbaFrame,
} from "./scopes.ts";
export {
  applyGradeCurves,
  applyGradeHueCurves,
  applyGradeTonal,
  bakeCurve,
  CURVE_TABLE_SIZE,
  gradeCurvesControls,
  gradeHueCurvesControls,
  HUE_CURVE_CHROMA_FADE,
  HUE_CURVE_KEYS,
  HUE_CURVE_LUMA_AMOUNT,
  HUE_CURVE_SATURATION_SCALE,
  NEUTRAL_GRADE_TONAL,
  pchip,
  sampleCurveTable,
} from "./curves.ts";
export type {
  CurvePoints,
  GradeCurves,
  GradeCurvesControls,
  GradeHueCurves,
  GradeHueCurvesControls,
  GradeTonal,
} from "./curves.ts";
export {
  clipMatte,
  combineKey,
  encodedToOklab,
  finesseIsSpatial,
  gradientWindow,
  hslQualifier,
  hueRange,
  hueSaturation,
  inOutBlend,
  KEY_QUALIFIERS,
  KEY_VIEW_GRAY,
  KEY_VIEWS,
  keyView,
  linearRange,
  linearToOklab,
  lumaQualifier,
  matteFlicker,
  matteRange,
  mixKeyed,
  NEUTRAL_KEY_QUALIFIER,
  NEUTRAL_MATTE_FINESSE,
  qualify,
  refineMatte,
  rgbQualifier,
  sampledQualifier,
} from "./keys.ts";
export type {
  HslRanges,
  KeyQualifier,
  MatteFinesse,
  MatteKernel,
  RgbRanges,
  SampledRange,
} from "./keys.ts";
