import { z } from "zod";

/**
 * CG7: per-composition color management. Absent, a composition works in
 * `legacy-srgb` (today's display-referred encoded sRGB) and renders exactly as
 * before. Present, `grade.*` runs work in `workingSpace` (ACEScct by default,
 * the owner's choice of 2026-11-23), video and sequence layers take the source
 * stage, and every layer leaves the working space through the CG7 display
 * transform at its boundary (docs/color-grading-cg7-decisions.md).
 */
export const COMPOSITION_MANAGED_WORKING_SPACES = [
  "acescct",
  "acescg",
  "linear-bt709",
] as const;
export type CompositionWorkingSpace =
  | "legacy-srgb"
  | (typeof COMPOSITION_MANAGED_WORKING_SPACES)[number];

export const CompositionColorManagementSchema = z
  .object({
    workingSpace: z.enum(COMPOSITION_MANAGED_WORKING_SPACES).optional(),
  })
  .strict();
export type CompositionColorManagement = z.infer<
  typeof CompositionColorManagementSchema
>;

/** A composition's working space; `legacy-srgb` without color management. */
export const compositionWorkingSpace = (comp: {
  colorManagement?: CompositionColorManagement | undefined;
}): CompositionWorkingSpace =>
  comp.colorManagement
    ? (comp.colorManagement.workingSpace ?? "acescct")
    : "legacy-srgb";

/**
 * Spaces `grade.color-space-transform` converts between and LUT assets
 * declare, as `@still-shift/color-science` conversion spaces. The index is
 * the effect's integer code: append only.
 */
export const COMPOSITION_CONVERSION_SPACES = [
  "acescct",
  "acescg",
  "aces2065-1",
  "linear-bt709",
  "srgb",
  "linear-bt2020",
  "linear-p3-d65",
] as const;
export type CompositionConversionSpace =
  (typeof COMPOSITION_CONVERSION_SPACES)[number];
