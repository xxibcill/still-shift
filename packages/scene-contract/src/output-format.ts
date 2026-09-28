import { z } from "zod";

export const OUTPUT_FORMATS = {
  landscape: { width: 1920, height: 1080 },
  vertical: { width: 1080, height: 1920 },
} as const;

export const OutputFormatSchema = z.enum(["landscape", "vertical"]);
export type OutputFormat = z.infer<typeof OutputFormatSchema>;

export const formatSize = (format: OutputFormat) => OUTPUT_FORMATS[format];

export const isOutputSize = (size: { width: number; height: number }) =>
  Object.values(OUTPUT_FORMATS).some(
    (format) => size.width === format.width && size.height === format.height,
  );

export const COMMERCE_PROFILES = {
  landscape: OUTPUT_FORMATS.landscape,
  portrait: OUTPUT_FORMATS.vertical,
  square: { width: 1080, height: 1080 },
  feed: { width: 1080, height: 1350 },
} as const;
